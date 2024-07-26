import { LeveldbPersistence } from "y-leveldb";
import path from "node:path";
import { WebSocket } from "ws";
import { FastifyPluginCallback } from "fastify";
import { URL } from "url";
import { Logger } from "../utils/log";
const Y = require("yjs");
type Y = typeof Y;
const awarenessProtocol = require("y-protocols/awareness");
type AwarenessProtocol = typeof awarenessProtocol;
const encoding = require("lib0/encoding");
const decoding = require("lib0/decoding");
const syncProtocol = require("y-protocols/sync");

/// Types
export type WsSharedDoc = {
  id: string;
  name: string;
  addConn: (conn: WebSocket) => void;
  closeConn: (conn: WebSocket) => void;
  sendOnConn: (conn: WebSocket, msg: Uint8Array) => void;
  persistence: LeveldbPersistence;
  awareness: AwarenessProtocol["Awareness"];
} & Y["Doc"];

export type WsSharedDocId = WsSharedDoc["name"];

/// Constants
const PING_TIMEOUT = 30000;

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_AUTH = 2;

const WS_READY_STATE_CONNECTING = 0;
const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;
const WS_READY_STATE_CLOSED = 3;

const allDocs = new Map<WsSharedDocId, WsSharedDoc>();

const renameDoc = async (
  persistence: LeveldbPersistence,
  fromName: string,
  toName: string,
) => {
  const allDocs = await persistence.getAllDocNames();
  if (!allDocs.includes(fromName)) return; // doc fromName 不存在
  const doc = await persistence.getYDoc(fromName);
  await persistence.clearDocument(fromName);
  await persistence.storeUpdate(toName, Y.encodeStateAsUpdate(doc));
  await persistence.flushDocument(toName);
};

const mkWsSharedDoc = async (
  location: string,
  logger: Logger,
  options?: typeof Y.Doc.DocOpts,
): Promise<WsSharedDoc> => {
  const doc = new Y.Doc(options);

  // 所有连接到此 doc 的 ws 连接
  const conns = new Map<Object, Set<number>>();

  const ldbLocation = path.join(location, "leveldb");
  const persistence = new LeveldbPersistence(ldbLocation);
  // 是否已经将 persistence 中的数据 load 到了 doc 中
  let loaded = false;
  // 自上次整理以来是否有更新
  let updated = false;

  // 从 persistence 加载 doc
  const _loadDoc = async () => {
    await renameDoc(persistence, "test", location);
    const localDoc = await persistence.getYDoc(location);
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(localDoc), "local");
    loaded = true;
  };

  // 压缩整理，减小数据库大小（将 updates 转化为 state vector 存储）
  const _compact = async () => {
    if (updated) {
      await persistence.flushDocument(location);
      updated = false;
      logger.info(`compact finished`);
    }
  };

  const addConn = (conn: WebSocket) => {
    if (!conns.has(conn)) {
      conns.set(conn, new Set());
      conn.on("message", async (msg) => {
        await messageHandler(conn, new Uint8Array(msg));
      });
    }
  };

  const closeConn = (conn: WebSocket) => {
    if (conns.has(conn)) {
      const controlledIds = conns.get(conn);
      conns.delete(conn);
      awarenessProtocol.removeAwarenessStates(
        awareness,
        Array.from(controlledIds),
        null,
      );
    }
    conn.close();
  };

  const sendOnConn = (conn: WebSocket, msg: Uint8Array) => {
    if (
      conn.readyState != WS_READY_STATE_OPEN &&
      conn.readyState != WS_READY_STATE_CONNECTING
    ) {
      closeConn(conn);
    }
    try {
      conn.send(msg, {}, (err: any) => {
        err != null && closeConn(conn);
      });
    } catch (e) {
      console.log("failed to send on conn, close it.");
      closeConn(conn);
    }
  };

  const messageHandler = async (conn: WebSocket, msg: Uint8Array) => {
    try {
      const encoder = encoding.createEncoder();
      const decoder = decoding.createDecoder(msg);
      const messageType = decoding.readVarUint(decoder);
      switch (messageType) {
        case MESSAGE_SYNC:
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          const syncMessageType = syncProtocol.readSyncMessage(
            decoder,
            encoder,
            doc,
            conn,
          );
          logger.info(`recv sync message, type=${messageType}`);
          // 如果是 syncStep1, 并且没有 loaded，则先从数据库中加载数据
          if (syncMessageType == 0 && !loaded) {
            logger.info(`load doc ${location} from database`);
            await _loadDoc();
          }
          if (encoding.length(encoder) > 1) {
            sendOnConn(conn, encoding.toUint8Array(encoder));
          }
          break;
        case MESSAGE_AWARENESS: {
          awarenessProtocol.applyAwarenessUpdate(
            awareness,
            decoding.readVarUint8Array(decoder),
            conn,
          );
          break;
        }
      }
    } catch (err) {
      console.error(err);
      doc.emit("error", [err]);
    }
  };

  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(null);
  awareness.on("update", ({ added, updated, removed }, conn) => {
    const changedClients = added.concat(updated, removed);
    if (conn != null) {
      const connControlledIds = conns.get(conn);
      if (connControlledIds != null) {
        added.forEach((clientId) => {
          connControlledIds.add(clientId);
        });
        removed.forEach((clientID) => {
          connControlledIds.delete(clientID);
        });
      }

      // 广播 awarenesses 信息
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients),
      );
      const buff = encoding.toUint8Array(encoder);
      conns.forEach((_, conn) => {
        sendOnConn(conn, buff);
      });
    }
  });

  // doc 更新时
  doc.on("update", (update: Uint8Array, origin) => {
    const numBlocks = doc.getMap("blocks").size;
    logger.info(
      `doc ${location} updated, numBlocks=${numBlocks}, origin=${origin}`,
    );

    // 将 doc 广播到连接到此 doc 的其他连接
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);
    conns.forEach((_, conn: WebSocket) => {
      if (origin != conn) {
        logger.info(`send updates to conn ${conn.url}`);
        sendOnConn(conn, message);
      }
    });

    // 持久化到数据库
    persistence.storeUpdate(location, update);
    updated = true;
    logger.info(`persist updates to database, doc ${location}`);
  });

  // 每隔 5s 尝试整理一次
  setInterval(_compact, 5000);

  return {
    id: location,
    name: location,
    conns,
    awareness,
    addConn,
    closeConn,
    sendOnConn,
    messageHandler,
    ...doc,
  };
};

const setupWsConnection = async (
  conn: WebSocket,
  location: string,
  logger: Logger,
) => {
  logger.info(`new ws connection to ${location}`);

  conn.binaryType = "arraybuffer";

  let doc: WsSharedDoc;
  const docId = `${location}`;
  // 已经打开了这个 doc
  if (allDocs.has(docId)) {
    logger.info(`doc ${docId} already exists, reuse it`);
    doc = allDocs.get(docId)!;
  } else {
    // 没有打开这个 doc
    logger.info(`create doc ${docId}`);
    doc = await mkWsSharedDoc(location, logger);
    allDocs.set(docId, doc);
  }
  doc.addConn(conn);

  // 每隔一段时间检测存活
  let pongReceived = true;
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      if (doc.conns.has(conn)) {
        doc.closeConn(conn);
      }
      clearInterval(pingInterval);
    } else if (doc.conns.has(conn)) {
      pongReceived = false;
      try {
        conn.ping();
      } catch (e) {
        doc.closeConn(conn);
        clearInterval(pingInterval);
      }
    }
  }, PING_TIMEOUT);
  conn.on("close", () => {
    doc.closeConn(conn);
    clearInterval(pingInterval);
  });
  conn.on("pong", () => {
    pongReceived = true;
  });

  // 发送 sync step 1
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, doc);
    doc.sendOnConn(conn, encoding.toUint8Array(encoder));
    const awarenessStates = doc.awareness.getStates();
    if (awarenessStates.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(
          doc.awareness,
          Array.from(awarenessStates.keys()),
        ),
      );
      doc.sendOnConn(conn, encoding.toUint8Array(encoder));
    }
  }
};

export const wsHandlerPlugin: FastifyPluginCallback = (fastify, opts, done) => {
  const wss = new WebSocket.Server({ noServer: true });
  wss.on("connection", (...params) =>
    // @ts-ignore
    setupWsConnection(...params, fastify.log),
  );
  fastify.server.on("upgrade", (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host}`);
    } catch (err) {
      fastify.log.info(`invalid url ${req.url}`);
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
    }
    const params = url.searchParams;
    if (params.has("location") && params.has("authorization")) {
      const location = params.get("location");
      const authorization = params.get("authorization");

      // 鉴权
      if (!authorization) {
        fastify.log.info("missing authorization");
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      try {
        fastify.jwt.verify(authorization);
      } catch (err) {
        fastify.log.info("authorization failed");
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, location);
      });
    } else {
      fastify.log.info("invalid ws request, missing `docName` or `location`");
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
    }
  });
  done();
};
