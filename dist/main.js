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
const auth_1 = require("./handlers/auth");
const node_path_1 = __importDefault(require("node:path"));
const fs_utils_1 = require("./utils/fs-utils");
const toml = __importStar(require("toml"));
const db_manage_1 = require("./handlers/db-manage");
const readConfig = async () => {
    const cwd = process.cwd();
    const configPath = node_path_1.default.join(cwd, "config.toml");
    if (!(await (0, fs_utils_1.isFile)(configPath)))
        return {};
    const content = await (0, fs_utils_1.readFileAsString)(configPath);
    if (!content)
        return {};
    return toml.parse(content);
};
const start = async () => {
    // 读取配置文件，并绑定到 fastify 上
    const config = await readConfig();
    const fastify = (0, fastify_1.default)(config);
    fastify.decorate("config", config);
    try {
        // 注册插件
        fastify.register(cors_1.default);
        fastify.register(yjs_ws_1.wsHandlerPlugin);
        fastify.register(multipart_1.fastifyMultipart);
        fastify.register(fs_1.fileHandlerPlugin);
        fastify.register(fetch_web_title_1.fetchWebTitlePlugin);
        fastify.register(db_manage_1.dbManagePlugin);
        (0, auth_1.registerAuthPlugin)(fastify);
        // 开始监听
        await fastify.listen({
            host: config.host ?? "0.0.0.0",
            port: config.port ?? 8080,
        });
    }
    catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};
start();
//# sourceMappingURL=main.js.map