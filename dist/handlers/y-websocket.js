"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.yWebSocketPlugin = exports.mkLevelDbPersistence = void 0;
const WebSocket = __importStar(require("ws"));
const utils_1 = require("y-websocket/bin/utils");
const y_leveldb_1 = require("y-leveldb");
const url_1 = require("url");
const Y = require("yjs");
const awarenessProtocol = require("y-protocols/awareness");
const mkLevelDbPersistence = (location) => {
    const ldb = new y_leveldb_1.LeveldbPersistence(location);
    return {
        provider: ldb,
        bindState: async (docName, yDoc) => {
            const persistedYdoc = await ldb.getYDoc(docName);
            const newUpdates = Y.encodeStateAsUpdate(yDoc);
            ldb.storeUpdate(docName, newUpdates);
            Y.applyUpdate(yDoc, Y.encodeStateAsUpdate(persistedYdoc));
            yDoc.on("update", (update) => {
                ldb.storeUpdate(docName, update);
            });
        },
        writeState: async (docName, yDoc) => { },
    };
};
exports.mkLevelDbPersistence = mkLevelDbPersistence;
class YNotebook extends Y.Doc {
    async init(name, location) {
        const persistence = new y_leveldb_1.LeveldbPersistence(location);
        const allDocNames = await persistence.getAllDocNames();
        if (!allDocNames.includes(name)) {
            throw new Error(`doc ${name} doesn't exist in `);
        }
    }
}
const yWebSocketPlugin = (fastify, opts, done) => {
    fastify.decorate("setPersistence", utils_1.setPersistence);
    fastify.decorate("getPersistence", utils_1.getPersistence);
    const wss = new WebSocket.Server({ noServer: true });
    wss.on("connection", utils_1.setupWSConnection);
    fastify.server.on("upgrade", (req, socket, head) => {
        // parse docPath from url
        const url = new url_1.URL(req.url);
        if (!url.searchParams.has("docPath")) {
        }
        const docPath = url.searchParams.get("docPath");
        // TODO validate docPath
        // establish websocket connection
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit("connection", ws, req);
        });
    });
    return done();
};
exports.yWebSocketPlugin = yWebSocketPlugin;
//# sourceMappingURL=y-websocket.js.map