"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const yjs_ws_1 = require("./handlers/yjs-ws");
const fs_1 = require("./handlers/fs");
const fetch_web_title_1 = require("./handlers/fetch-web-title");
const multipart_1 = require("@fastify/multipart");
const serverOptions = {
    logger: true,
    maxParamLength: 500,
};
const start = async () => {
    const server = (0, fastify_1.default)(serverOptions);
    try {
        server.register(cors_1.default);
        server.register(yjs_ws_1.wsHandlerPlugin);
        server.register(multipart_1.fastifyMultipart);
        server.register(fs_1.fileHandlerPlugin);
        server.register(fetch_web_title_1.fetchWebTitlePlugin);
        await server.listen({ host: "0.0.0.0", port: 8080 });
    }
    catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};
start();
//# sourceMappingURL=main.js.map