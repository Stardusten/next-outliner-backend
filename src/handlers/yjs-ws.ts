import { LeveldbPersistence } from "y-leveldb";
import path from "node:path";
import { WebSocket } from "ws";
import { FastifyPluginCallback } from "fastify";
import { URL } from "url";
const Y = require("yjs");
type Y = typeof Y;
const awarenessProtocol = require("y-protocols/awareness");
type AwarenessProtocol = typeof awarenessProtocol;
const encoding = require("lib0/encoding");
const decoding = require("lib0/decoding");
const syncProtocol = require("y-protocols/sync");

export type Persistence<Provider> = {
  provider: Provider;
  bindState: (doc: WSSharedDoc) => Promise<void>;
  writeState: (doc: WSSharedDoc) => Promise<void>;
};

export type WSSharedDoc = {
  name: string;
  conns: Map<Object, Set<number>>;
  closeConn: (conn: WebSocket) => void;
  sendOnConn: (conn: WebSocket, msg: Uint8Array) => void;
  onMessage: (conn: WebSocket, msg: Uint8Array) => void;
  persistence: Persistence<any>;
  awareness: AwarenessProtocol["Awareness"];
} & Y["Doc"];

const pingTimeout = 30000;

const messageSync = 0;
const messageAwareness = 1;
// const messageAuth = 2

const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;
const wsReadyStateClosing = 2;
const wsReadyStateClosed = 3;

const allDocs = new Map<WSSharedDoc["name"], WSSharedDoc>();

const mkWSSharedDoc = (
  docName: string,
  location: string,
  options?: typeof Y.Doc.DocOpts,
): Promise<WSSharedDoc> => {
  const doc = new Y.Doc(options) as WSSharedDoc;
  doc.name = docName;
  doc.conns = new Map<Object, Set<number>>();

  doc.closeConn = (conn) => {
    if (doc.conns.has(conn)) {
      const controlledIds = doc.conns.get(conn);
      doc.conns.delete(conn);
      awarenessProtocol.removeAwarenessStates(
        doc.awareness,
        Array.from(controlledIds),
        null,
      );
      if (doc.conns.size === 0 && doc.persistence !== null) {
        // if persisted, we store state and destroy ydocument
        doc.persistence.writeState(doc.name, doc).then(() => {
          doc.destroy();
          doc.persistence.provider.destroy();
          allDocs.delete(doc.name);
        });
      }
    }
    conn.close();
  };

  doc.sendOnConn = (conn, msg) => {
    if (
      conn.readyState !== wsReadyStateConnecting &&
      conn.readyState !== wsReadyStateOpen
    ) {
      doc.closeConn(conn);
    }
    try {
      conn.send(msg, {}, (err) => {
        err != null && doc.closeConn(conn);
      });
    } catch (e) {
      console.log("failed to send on conn, close it.");
      doc.closeConn(conn);
    }
  };

  const ldbLocation = path.join(location, "leveldb");
  const ldb = new LeveldbPersistence(ldbLocation);
  const persistence: Persistence<LeveldbPersistence> = {
    provider: ldb,
    bindState: async (doc) => {
      const persistedYdoc = await ldb.getYDoc(doc.name);
      console.log(
        "load doc from db, blocks-size=",
        persistedYdoc.getMap("blocks").size,
        ", repeatables-size=",
        persistedYdoc.getMap("repeatables").size,
      );
      const newUpdates = Y.encodeStateAsUpdate(doc);
      await ldb.storeUpdate(doc.name, newUpdates);
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(persistedYdoc));
      doc.on("update", (update) => {
        ldb.storeUpdate(doc.name, update);
        console.log(
          "persist update to ldb, blocks-size=",
          doc.getMap("blocks").size,
          ", repeatables-size=",
          doc.getMap("repeatables").size,
        );
      });
    },
    writeState: async () => {},
  };
  doc.persistence = persistence;

  doc.awareness = new awarenessProtocol.Awareness(doc);
  doc.awareness.setLocalState(null);
  doc.awareness.on("update", ({ added, updated, removed }, conn) => {
    const changedClients = added.concat(updated, removed);
    if (conn != null) {
      const connControlledIds = doc.conns.get(conn);
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
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(doc.awareness, changedClients),
      );
      const buff = encoding.toUint8Array(encoder);
      doc.conns.forEach((_, conn) => {
        doc.sendOnConn(conn, buff);
      });
    }
  });

  doc.onMessage = async (conn, msg) => {
    try {
      const encoder = encoding.createEncoder();
      const decoder = decoding.createDecoder(msg);
      const messageType = decoding.readVarUint(decoder);
      switch (messageType) {
        case messageSync:
          encoding.writeVarUint(encoder, messageSync);
          const syncMessageType = syncProtocol.readSyncMessage(
            decoder,
            encoder,
            doc,
            conn,
          );
          // 如果是 syncStep1, 先从数据库中加载数据, 然后回复
          if (syncMessageType == 0) {
            await doc.persistence.bindState(doc);
          }

          // If the `encoder` only contains the type of reply message and no
          // message, there is no need to send the message. When `encoder` only
          // contains the type of reply, its length is 1.
          if (encoding.length(encoder) > 1) {
            doc.sendOnConn(conn, encoding.toUint8Array(encoder));
          }
          break;
        case messageAwareness: {
          awarenessProtocol.applyAwarenessUpdate(
            doc.awareness,
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

  doc.on("update", (update, origin, doc, tr) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);
    console.log(
      "doc updated, send to ",
      doc.conns.size,
      " conns ",
      new Date().valueOf(),
    );
    doc.conns.forEach((_, conn) => doc.sendOnConn(conn, message));
  });

  return doc;
};

const setupWsConnection = async (
  conn: WebSocket,
  docName: string,
  location: string,
) => {
  conn.binaryType = "arraybuffer";

  // create doc if not exists
  let doc: WSSharedDoc;
  if (allDocs.has(docName)) doc = allDocs.get(docName)!;
  else {
    doc = await mkWSSharedDoc(docName, location);
    allDocs.set(docName, doc);
  }

  doc.conns.set(conn, new Set());
  conn.on("message", (message) => doc.onMessage(conn, new Uint8Array(message)));
  console.log("new ws connection to doc ", docName, ", total ", doc.conns.size);

  // check alive periodically
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
  }, pingTimeout);
  conn.on("close", () => {
    doc.closeConn(conn);
    clearInterval(pingInterval);
  });
  conn.on("pong", () => {
    pongReceived = true;
  });

  // send sync step 1
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    doc.sendOnConn(conn, encoding.toUint8Array(encoder));
    const awarenessStates = doc.awareness.getStates();
    if (awarenessStates.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
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
  wss.on("connection", setupWsConnection);
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
    if (
      params.has("docName") &&
      params.has("location") &&
      params.has("location")
    ) {
      const docName = params.get("docName");
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
        wss.emit("connection", ws, docName, location);
      });
    } else {
      fastify.log.info("invalid ws request, missing `docName` or `location`");
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
    }
  });
  return done();
};
