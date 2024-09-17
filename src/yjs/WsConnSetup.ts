import { encoding } from "lib0";
import { WsSharedDoc } from "./WsSharedDoc";
import { WebSocket } from "ws";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import { asClass } from "awilix";
import { logger } from "../logger/logger";

const PING_TIMEOUT = 30000;

export class WsConnManager {
  private readonly allDocs: Map<string, WsSharedDoc>;

  constructor() {
    this.allDocs = new Map();
  }

  public setupConnection(conn: WebSocket, location: string) {
    logger.info(`new ws connection to ${location}`);

    conn.binaryType = "arraybuffer";

    let doc: WsSharedDoc;
    // 已经打开了这个 doc
    if (this.allDocs.has(location)) {
      logger.info(`doc ${location} already exists, reuse it`);
      doc = this.allDocs.get(location)!;
    } else {
      // 没有打开这个 doc
      logger.info(`create doc ${location}`);
      doc = new WsSharedDoc(location, {});
      this.allDocs.set(location, doc);
    }
    doc.addConn(conn);

    // 每隔一段时间检测存活
    doc.setupAliveChecker(conn, PING_TIMEOUT);

    // 发送 sync step 1
    doc.sendSyncStep1(conn);
  }
}