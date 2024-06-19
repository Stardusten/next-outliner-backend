"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wsHandlerPlugin = void 0;
const y_leveldb_1 = require("y-leveldb");
const node_path_1 = __importDefault(require("node:path"));
const ws_1 = require("ws");
const url_1 = require("url");
const Y = require("yjs");
const awarenessProtocol = require("y-protocols/awareness");
const encoding = require("lib0/encoding");
const decoding = require("lib0/decoding");
const syncProtocol = require("y-protocols/sync");
const pingTimeout = 30000;
const messageSync = 0;
const messageAwareness = 1;
// const messageAuth = 2
const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;
const wsReadyStateClosing = 2; // eslint-disable-line
const wsReadyStateClosed = 3; // eslint-disable-line
const allDocs = new Map();
const mkWSSharedDoc = (docName, location, options) => {
    const doc = new Y.Doc(options);
    doc.name = docName;
    doc.conns = new Map();
    doc.closeConn = (conn) => {
        if (doc.conns.has(conn)) {
            const controlledIds = doc.conns.get(conn);
            doc.conns.delete(conn);
            awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
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
        if (conn.readyState !== wsReadyStateConnecting &&
            conn.readyState !== wsReadyStateOpen) {
            doc.closeConn(conn);
        }
        try {
            conn.send(msg, {}, (err) => {
                err != null && doc.closeConn(conn);
            });
        }
        catch (e) {
            console.log("failed to send on conn, close it.");
            doc.closeConn(conn);
        }
    };
    const ldbLocation = node_path_1.default.join(location, "leveldb");
    const ldb = new y_leveldb_1.LeveldbPersistence(ldbLocation);
    const persistence = {
        provider: ldb,
        bindState: async (doc) => {
            const persistedYdoc = await ldb.getYDoc(doc.name);
            console.log("load doc from db, size=", persistedYdoc.getMap("blocks").size);
            const newUpdates = Y.encodeStateAsUpdate(doc);
            await ldb.storeUpdate(doc.name, newUpdates);
            Y.applyUpdate(doc, Y.encodeStateAsUpdate(persistedYdoc));
            doc.on("update", (update) => {
                ldb.storeUpdate(doc.name, update);
                console.log("persist update to ldb, size=", doc.getMap("blocks").size);
            });
        },
        writeState: async () => { },
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
            encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(doc.awareness, changedClients));
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
                    const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
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
                    awarenessProtocol.applyAwarenessUpdate(doc.awareness, decoding.readVarUint8Array(decoder), conn);
                    break;
                }
            }
        }
        catch (err) {
            console.error(err);
            doc.emit("error", [err]);
        }
    };
    doc.on("update", (update, origin, doc, tr) => {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.writeUpdate(encoder, update);
        const message = encoding.toUint8Array(encoder);
        console.log("doc updated, send to ", doc.conns.size, " conns ", new Date().valueOf());
        doc.conns.forEach((_, conn) => doc.sendOnConn(conn, message));
    });
    return doc;
};
const setupWsConnection = async (conn, docName, location) => {
    conn.binaryType = "arraybuffer";
    // create doc if not exists
    let doc;
    if (allDocs.has(docName))
        doc = allDocs.get(docName);
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
        }
        else if (doc.conns.has(conn)) {
            pongReceived = false;
            try {
                conn.ping();
            }
            catch (e) {
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
            encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys())));
            doc.sendOnConn(conn, encoding.toUint8Array(encoder));
        }
    }
};
const wsHandlerPlugin = (fastify, opts, done) => {
    const wss = new ws_1.WebSocket.Server({ noServer: true });
    wss.on("connection", setupWsConnection);
    fastify.server.on("upgrade", (req, socket, head) => {
        let url;
        try {
            url = new url_1.URL(req.url, `http://${req.headers.host}`);
        }
        catch (err) {
            fastify.log.info(`invalid url ${req.url}`);
            return;
        }
        const params = url.searchParams;
        if (params.has("docName") && params.has("location")) {
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit("connection", ws, params.get("docName"), params.get("location"));
            });
        }
        else {
            fastify.log.info("invalid ws request, missing `docName` or `location`");
        }
    });
    return done();
};
exports.wsHandlerPlugin = wsHandlerPlugin;
//# sourceMappingURL=yjs-ws.js.map