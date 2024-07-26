"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// import { LeveldbPersistence } from "y-leveldb";
// import path from "node:path";
// import { WebSocket } from "ws";
// import { FastifyPluginCallback } from "fastify";
// import { URL } from "url";
// import { Logger } from "../utils/log";
// const Y = require("yjs");
// type Y = typeof Y;
// const awarenessProtocol = require("y-protocols/awareness");
// type AwarenessProtocol = typeof awarenessProtocol;
// const encoding = require("lib0/encoding");
// const decoding = require("lib0/decoding");
// const syncProtocol = require("y-protocols/sync");
//
// export type WSSharedDoc = {
//   name: string;
//   conns: Map<Object, Set<number>>;
//   closeConn: (conn: WebSocket) => void;
//   sendOnConn: (conn: WebSocket, msg: Uint8Array) => void;
//   onMessage: (conn: WebSocket, msg: Uint8Array) => void;
//   persistence: LeveldbPersistence;
//   awareness: AwarenessProtocol["Awareness"];
// } & Y["Doc"];
//
// const pingTimeout = 30000;
//
// const messageSync = 0;
// const messageAwareness = 1;
// // const messageAuth = 2
//
// const wsReadyStateConnecting = 0;
// const wsReadyStateOpen = 1;
// const wsReadyStateClosing = 2;
// const wsReadyStateClosed = 3;
//
// const allDocs = new Map<WSSharedDoc["name"], WSSharedDoc>();
//
// const mkWSSharedDoc = (
//   docName: string,
//   location: string,
//   logger: Logger,
//   options?: typeof Y.Doc.DocOpts,
// ): Promise<WSSharedDoc> => {
//   const doc = new Y.Doc(options) as WSSharedDoc;
//   doc.name = docName;
//   doc.conns = new Map<Object, Set<number>>();
//
//   doc.closeConn = (conn) => {
//     if (doc.conns.has(conn)) {
//       const controlledIds = doc.conns.get(conn);
//       doc.conns.delete(conn);
//       awarenessProtocol.removeAwarenessStates(
//         doc.awareness,
//         Array.from(controlledIds),
//         null,
//       );
//     }
//     conn.close();
//   };
//
//   doc.sendOnConn = (conn, msg) => {
//     if (
//       conn.readyState !== wsReadyStateConnecting &&
//       conn.readyState !== wsReadyStateOpen
//     ) {
//       doc.closeConn(conn);
//     }
//     try {
//       conn.send(msg, {}, (err) => {
//         err != null && doc.closeConn(conn);
//       });
//     } catch (e) {
//       console.log("failed to send on conn, close it.");
//       doc.closeConn(conn);
//     }
//   };
//
//   const ldbLocation = path.join(location, "leveldb");
//   const ldb = new LeveldbPersistence(ldbLocation);
//   doc.persistence = ldb;
//   let updated = false; // 自上次整理以来是否有更新
//
//   const bindDoc = async (doc: WSSharedDoc) => {
//     logger.info(`load doc start`);
//     const persistedYdoc = await ldb.getYDoc(doc.name);
//     const numBlocks = persistedYdoc.getMap("blocks").size;
//     const numRepeatables = persistedYdoc.getMap("repeatables").size;
//     logger.info(
//       `load doc finished, numBlocks=${numBlocks}, numRepeatables=${numRepeatables}`,
//     );
//
//     // 将 doc 与 persistedYdoc 合并
//     const newUpdates = Y.encodeStateAsUpdate(doc);
//     await ldb.storeUpdate(doc.name, newUpdates);
//     Y.applyUpdate(doc, Y.encodeStateAsUpdate(persistedYdoc));
//
//     // doc 更新时，将更新持久化
//     doc.on("update", (update) => {
//       logger.info(`persist update start`);
//       ldb.storeUpdate(doc.name, update);
//       updated = true;
//       const numBlocks = doc.getMap("blocks").size;
//       const numRepeatables = doc.getMap("repeatables").size;
//       logger.info(
//         `persist update finished, numBlocks=${numBlocks}, numRepeatables=${numRepeatables}`,
//       );
//     });
//   };
//
//   // 每隔 5s 整理一次
//   setInterval(async () => {
//     if (updated) {
//       logger.info(`compact start`);
//       await ldb.flushDocument(doc.name);
//       updated = false;
//       logger.info(`compact finished`);
//     }
//   }, 5000);
//
//   doc.awareness = new awarenessProtocol.Awareness(doc);
//   doc.awareness.setLocalState(null);
//   doc.awareness.on("update", ({ added, updated, removed }, conn) => {
//     const changedClients = added.concat(updated, removed);
//     if (conn != null) {
//       const connControlledIds = doc.conns.get(conn);
//       if (connControlledIds != null) {
//         added.forEach((clientId) => {
//           connControlledIds.add(clientId);
//         });
//         removed.forEach((clientID) => {
//           connControlledIds.delete(clientID);
//         });
//       }
//
//       // 广播 awarenesses 信息
//       const encoder = encoding.createEncoder();
//       encoding.writeVarUint(encoder, messageAwareness);
//       encoding.writeVarUint8Array(
//         encoder,
//         awarenessProtocol.encodeAwarenessUpdate(doc.awareness, changedClients),
//       );
//       const buff = encoding.toUint8Array(encoder);
//       doc.conns.forEach((_, conn) => {
//         doc.sendOnConn(conn, buff);
//       });
//     }
//   });
//
//   doc.onMessage = async (conn, msg) => {
//     try {
//       const encoder = encoding.createEncoder();
//       const decoder = decoding.createDecoder(msg);
//       const messageType = decoding.readVarUint(decoder);
//       switch (messageType) {
//         case messageSync:
//           encoding.writeVarUint(encoder, messageSync);
//           const syncMessageType = syncProtocol.readSyncMessage(
//             decoder,
//             encoder,
//             doc,
//             conn,
//           );
//           // 如果是 syncStep1, 先从数据库中加载数据, 然后回复
//           if (syncMessageType == 0) {
//             await bindDoc(doc);
//           }
//           if (encoding.length(encoder) > 1) {
//             doc.sendOnConn(conn, encoding.toUint8Array(encoder));
//           }
//           break;
//         case messageAwareness: {
//           awarenessProtocol.applyAwarenessUpdate(
//             doc.awareness,
//             decoding.readVarUint8Array(decoder),
//             conn,
//           );
//           break;
//         }
//       }
//     } catch (err) {
//       console.error(err);
//       doc.emit("error", [err]);
//     }
//   };
//
//   doc.on("update", (update, origin, doc, tr) => {
//     const encoder = encoding.createEncoder();
//     encoding.writeVarUint(encoder, messageSync);
//     syncProtocol.writeUpdate(encoder, update);
//     const message = encoding.toUint8Array(encoder);
//     logger.info(`doc updated, send to ${doc.conns.size} conns`);
//     doc.conns.forEach((_, conn) => doc.sendOnConn(conn, message));
//   });
//
//   return doc;
// };
//
// const setupWsConnection = async (
//   conn: WebSocket,
//   docName: string,
//   location: string,
//   logger: Logger,
// ) => {
//   conn.binaryType = "arraybuffer";
//
//   logger.info(`new ws connection to doc ${docName}`);
//
//   // create doc if not exists
//   let doc: WSSharedDoc;
//   const docKey = docName + location;
//   if (allDocs.has(docKey)) {
//     logger.info(`doc ${docName} already exists, reuse it`);
//     doc = allDocs.get(docKey)!;
//   } else {
//     logger.info(``);
//     doc = await mkWSSharedDoc(docName, location, logger);
//     allDocs.set(docKey, doc);
//   }
//
//   doc.conns.set(conn, new Set());
//   conn.on("message", (message) => doc.onMessage(conn, new Uint8Array(message)));
//
//   // check alive periodically
//   let pongReceived = true;
//   const pingInterval = setInterval(() => {
//     if (!pongReceived) {
//       if (doc.conns.has(conn)) {
//         doc.closeConn(conn);
//       }
//       clearInterval(pingInterval);
//     } else if (doc.conns.has(conn)) {
//       pongReceived = false;
//       try {
//         conn.ping();
//       } catch (e) {
//         doc.closeConn(conn);
//         clearInterval(pingInterval);
//       }
//     }
//   }, pingTimeout);
//   conn.on("close", () => {
//     doc.closeConn(conn);
//     clearInterval(pingInterval);
//   });
//   conn.on("pong", () => {
//     pongReceived = true;
//   });
//
//   // send sync step 1
//   {
//     const encoder = encoding.createEncoder();
//     encoding.writeVarUint(encoder, messageSync);
//     syncProtocol.writeSyncStep1(encoder, doc);
//     doc.sendOnConn(conn, encoding.toUint8Array(encoder));
//     const awarenessStates = doc.awareness.getStates();
//     if (awarenessStates.size > 0) {
//       const encoder = encoding.createEncoder();
//       encoding.writeVarUint(encoder, messageAwareness);
//       encoding.writeVarUint8Array(
//         encoder,
//         awarenessProtocol.encodeAwarenessUpdate(
//           doc.awareness,
//           Array.from(awarenessStates.keys()),
//         ),
//       );
//       doc.sendOnConn(conn, encoding.toUint8Array(encoder));
//     }
//   }
// };
//
// export const wsHandlerPlugin: FastifyPluginCallback = (fastify, opts, done) => {
//   const wss = new WebSocket.Server({ noServer: true });
//   wss.on("connection", (...params) =>
//     // @ts-ignore
//     setupWsConnection(...params, fastify.log),
//   );
//   fastify.server.on("upgrade", (req, socket, head) => {
//     let url;
//     try {
//       url = new URL(req.url, `http://${req.headers.host}`);
//     } catch (err) {
//       fastify.log.info(`invalid url ${req.url}`);
//       socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
//       socket.destroy();
//     }
//     const params = url.searchParams;
//     if (
//       params.has("docName") &&
//       params.has("location") &&
//       params.has("authorization")
//     ) {
//       const docName = params.get("docName");
//       const location = params.get("location");
//       const authorization = params.get("authorization");
//
//       // 鉴权
//       if (!authorization) {
//         fastify.log.info("missing authorization");
//         socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
//         socket.destroy();
//         return;
//       }
//       try {
//         fastify.jwt.verify(authorization);
//       } catch (err) {
//         fastify.log.info("authorization failed");
//         socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
//         socket.destroy();
//         return;
//       }
//
//       wss.handleUpgrade(req, socket, head, (ws) => {
//         wss.emit("connection", ws, docName, location);
//       });
//     } else {
//       fastify.log.info("invalid ws request, missing `docName` or `location`");
//       socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
//       socket.destroy();
//     }
//   });
//   return done();
// };
//# sourceMappingURL=yjs-ws.js.map