import { LeveldbPersistence } from "y-leveldb";
import * as Y from "yjs";
import { WebSocket } from "ws";
import { decoding, encoding } from "lib0";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import { logger } from "../logger/logger";
import path from "path";

/// Constants
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_AUTH = 2;

const WS_READY_STATE_CONNECTING = 0;
const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;
const WS_READY_STATE_CLOSED = 3;

const DEFAULT_DOC_NAME = "default";

export class WsSharedDoc extends Y.Doc {
  private readonly location: string;
  private readonly conns: Map<WebSocket, Set<number>>;
  private readonly persistence: LeveldbPersistence;
  private readonly awareness: awarenessProtocol.Awareness;
  private readonly initPromise: Promise<void>;

  // 自上次整理来，文档是否发生变化
  private changedSinceLastCompact: boolean = false;

  constructor(location: string, options: { gc?: boolean, compactInterval?: number }) {
    super({ gc: options.gc ?? true });
    this.location = location;
    this.conns = new Map();

    // awareness 相关
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);
    this.awareness.on("update", ({ added, updated, removed }, conn) => {
      // 更新文档的 clientID 列表
      const changedClients = added.concat(updated, removed);
      if (conn !== null) {
        const connControlledIDs = this.conns.get(conn);
        if (connControlledIDs != undefined) {
          added.forEach((clientID) => {
            connControlledIDs.add(clientID);
          });
          removed.forEach((clientID) => {
            connControlledIDs.delete(clientID);
          });
        }
      }
      // 广播 awareness 更新
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients),
      );
      const buff = encoding.toUint8Array(encoder);
      this.conns.forEach((_, c) => {
        this.__sendOnConn(c, buff);
      });
    });

    // doc 更新时
    this.on("update", (update, origin) => {
      const numBlocks = this.getMap("blocks").size;
      logger.info(
        `doc ${location} updated, numBlocks=${numBlocks}, origin=${origin}`,
      );

      // 将更新广播到连接到此 doc 的其他连接
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      this.conns.forEach((_, conn: WebSocket) => {
        if (origin != conn) {
          logger.info(`send updates to conn ${conn.url}`);
          this.__sendOnConn(conn, message);
        }
      });

      // 持久化到数据库
      this.persistence.storeUpdate(DEFAULT_DOC_NAME, update);
      this.changedSinceLastCompact = true;
      logger.info(`persist updates to database, doc ${DEFAULT_DOC_NAME} in ${this.location}`);
    });

    setInterval(() => this.__compact, options.compactInterval ?? 5000);

    // 创建 WsSharedDoc 时，先异步从持久化存储中加载文档
    const levelDdbLocation = path.join(location, "leveldb");
    this.persistence = new LeveldbPersistence(levelDdbLocation);
    this.initPromise = (async () => {
      await this.__loadFromPersistence();
    })();
  }

  /**
   * 从持久化存储中加载当前文档
   */
  private async __loadFromPersistence() {
    const allDocs = await this.persistence.getAllDocNames();
    logger.info(`allDocs: ${allDocs} in ${this.location}`);
    if (!allDocs.includes(DEFAULT_DOC_NAME)) {
      // if (allDocs.length > 0) {  // TODO 仅作迁移用
      //  const fromDocName = allDocs[0];
      //  logger.info(`copy doc ${fromDocName} to ${DEFAULT_DOC_NAME}`);
      //  const doc = await this.persistence.getYDoc(fromDocName);
      //  await this.persistence.clearDocument(fromDocName);
      //  await this.persistence.storeUpdate(DEFAULT_DOC_NAME, Y.encodeStateAsUpdate(doc));
      //  await this.persistence.flushDocument(DEFAULT_DOC_NAME);
      // } else
      throw new Error(`doc ${this.location} not found in persistence`);
    }
    const localDoc = await this.persistence.getYDoc(DEFAULT_DOC_NAME);
    Y.applyUpdate(this, Y.encodeStateAsUpdate(localDoc), "local");
    logger.info(`load doc ${DEFAULT_DOC_NAME} from persistence ${this.location}`);
  }

  /**
   * 压缩整理，减小数据库大小（将 updates 转化为 state vector 存储）
   */
  private async __compact() {
    if (this.changedSinceLastCompact) {
      await this.persistence.flushDocument(DEFAULT_DOC_NAME);
      this.changedSinceLastCompact = false;
      logger.info(`compact doc ${DEFAULT_DOC_NAME} in ${this.location}`);
    }
  }

  public addConn(conn: WebSocket) {
    if (!this.conns.has(conn)) {
      this.conns.set(conn, new Set());
      conn.on("message", async (_msg: any) => {
        try {
          const msg = new Uint8Array(_msg);
          // 等待文档从持久化存储中加载完成
          await this.initPromise;
          const encoder = encoding.createEncoder();
          const decoder = decoding.createDecoder(msg);
          const messageType = decoding.readVarUint(decoder);
          switch (messageType) {
            case MESSAGE_SYNC:
              encoding.writeVarUint(encoder, MESSAGE_SYNC);
              syncProtocol.readSyncMessage(decoder, encoder, this, conn);
              if (encoding.length(encoder) > 1) {
                this.__sendOnConn(conn, encoding.toUint8Array(encoder));
              }
              break;
            case MESSAGE_AWARENESS: {
              awarenessProtocol.applyAwarenessUpdate(
                this.awareness,
                decoding.readVarUint8Array(decoder),
                conn,
              );
              break;
            }
          }
        } catch (err) {
          console.log(err);
          logger.error((err as Error).message);
          this.emit("error" as any, [err]); // TODO
        }
      });
    }
  }

  private __sendOnConn(conn: WebSocket, msg: Uint8Array) {
    if (
      conn.readyState != WS_READY_STATE_OPEN &&
      conn.readyState != WS_READY_STATE_CONNECTING
    ) {
      this.closeConn(conn);
    }
    try {
      conn.send(msg, {}, (err: any) => {
        err != null && this.closeConn(conn);
      });
    } catch (e) {
      console.log("failed to send on conn, close it.");
      this.closeConn(conn);
    }
  }

  public closeConn(conn: WebSocket) {
    if (this.conns.has(conn)) {
      this.conns.delete(conn);
    }
    conn.close();
  }

  public hasConn(conn: WebSocket) {
    return this.conns.has(conn);
  }

  public setupAliveChecker(conn: WebSocket, interval: number) {
    let pongReceived = true;
    const pingInterval = setInterval(() => {
      if (!pongReceived) {
        if (this.hasConn(conn)) {
          this.closeConn(conn);
        }
        clearInterval(pingInterval);
      }
    }, interval);
    conn.on("close", () => {
      this.closeConn(conn);
      clearInterval(pingInterval);
    });
    conn.on("pong", () => {
      pongReceived = true;
    });    
  }

  public sendSyncStep1(conn: WebSocket) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, this);
    this.__sendOnConn(conn, encoding.toUint8Array(encoder));
    const awarenessStates = this.awareness.getStates();
    if (awarenessStates.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(
          this.awareness,
          Array.from(awarenessStates.keys()),
        ),
      );
      this.__sendOnConn(conn, encoding.toUint8Array(encoder));
    }
  }
}
