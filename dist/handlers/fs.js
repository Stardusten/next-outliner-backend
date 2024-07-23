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
exports.fileHandlerPlugin = void 0;
const fs = __importStar(require("fs"));
const node_path_1 = __importDefault(require("node:path"));
const validation_1 = require("../utils/validation");
const fileHandlerPlugin = (fastify, opts, done) => {
    fastify.post("/fs/stat", (0, validation_1.jsonBodyWithProps)({
        filePath: { type: "string" },
    }), (request, reply) => {
        if (!request.authorized)
            return fastify.NOT_AUTHORIZED;
        const { filePath } = request.body;
        try {
            const { ctime, mtime, size } = fs.statSync(filePath);
            return { ctime, mtime, size };
        }
        catch (err) {
            return { error: "Failed" };
        }
    });
    fastify.post("/fs/list", (0, validation_1.jsonBodyWithProps)({}), async (request, reply) => {
        if (!request.authorized)
            return fastify.NOT_AUTHORIZED;
        const { dirPath } = request.body;
        try {
            const dirents = await fs.promises.readdir(dirPath, {
                withFileTypes: true,
            });
            return dirents.map((dirent) => ({
                isFile: dirent.isFile(),
                name: dirent.name,
                hasChildren: dirent.isFile()
                    ? false
                    : fs.readdirSync(node_path_1.default.join(dirPath, dirent.name)).length > 0,
            }));
        }
        catch (err) {
            return { error: "Failed" };
        }
    });
    fastify.post("/fs/upload", async (request, reply) => {
        if (!request.authorized)
            return fastify.NOT_AUTHORIZED;
        let targetPath = null;
        try {
            for await (const part of request.parts()) {
                if (targetPath == null) {
                    // expect path now
                    if (part.type == "field" && typeof part.value == "string") {
                        targetPath = part.value;
                        const dirname = node_path_1.default.dirname(targetPath);
                        if (!fs.existsSync(dirname)) {
                            return { error: "Directory does not exist" };
                        }
                        if (fs.existsSync(targetPath)) {
                            return { error: "Path already exists" };
                        }
                    }
                    else {
                        return { error: "Invalid request body" };
                    }
                }
                else {
                    // expect file now
                    try {
                        await new Promise((resolve, reject) => {
                            const ws = fs.createWriteStream(targetPath);
                            if (part.type == "field" && typeof part.value == "string") {
                                ws.write(part.value, (err) => {
                                    if (err)
                                        return reject(err);
                                    else
                                        resolve(undefined);
                                });
                            }
                            else if (part.type == "file") {
                                part.file.pipe(ws);
                                part.file.on("end", resolve);
                                part.file.on("error", reject);
                            }
                        });
                    }
                    catch (err) {
                        return { error: "Error when writing file" };
                    }
                    return { success: true };
                }
            }
        }
        catch (err) {
            return { error: "Unexpected error" };
        }
    });
    fastify.get("/fs/download/:filePath", async (request, reply) => {
        if (!request.authorized)
            return fastify.NOT_AUTHORIZED;
        const { filePath } = request.params;
        const { range } = request.headers;
        try {
            const stat = await fs.promises.stat(filePath);
            const fileSize = stat.size;
            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunkSize = end - start + 1;
                const stream = fs.createReadStream(filePath, { start, end });
                return reply
                    .code(206)
                    .headers({
                    "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                    "Accept-Ranges": "bytes",
                    "Content-Length": chunkSize,
                    "Content-Type": "application/octet-stream",
                    "Content-Disposition": `attachment; filename="${node_path_1.default.basename(filePath)}"`,
                })
                    .send(stream);
            }
            else {
                const stream = fs.createReadStream(filePath);
                return reply
                    .headers({
                    "Content-Length": fileSize,
                    "Content-Type": "application/octet-stream",
                    "Content-Disposition": `attachment; filename="${node_path_1.default.basename(filePath)}"`,
                })
                    .send(stream);
            }
        }
        catch (err) {
            console.log(err);
            reply.send({ error: "Failed" });
        }
    });
    done();
};
exports.fileHandlerPlugin = fileHandlerPlugin;
//# sourceMappingURL=fs.js.map