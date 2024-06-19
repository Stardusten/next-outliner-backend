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
exports.fileHandlerPlugin = void 0;
const helpers_1 = require("./helpers");
const fs = __importStar(require("fs"));
const fileHandlerPlugin = (fastify, opts, done) => {
    fastify.post("/get-file-stat", (0, helpers_1.jsonBodyWithProps)({
        filePath: { type: "string" },
    }), (request, reply) => {
        const { filePath } = request.body;
        try {
            const { ctime, mtime, size } = fs.statSync(filePath);
            return { ctime, mtime, size };
        }
        catch (err) {
            return { error: "Failed" };
        }
    });
    fastify.post("/get-file-content", (0, helpers_1.jsonBodyWithProps)({
        filePath: {
            type: "string",
        },
        returnType: {
            type: "string",
        },
    }, ["filePath"]), (request, reply) => {
        const { filePath, returnType } = request.body;
        try {
            if (returnType == "octet-stream") {
                const stream = fs.createReadStream(filePath);
                reply.type("application/octet-stream").send(stream);
            }
            else if (returnType == "text") {
                const fileContent = fs.readFileSync(filePath, "utf8");
                reply.type("text/plain").send(fileContent);
            }
            else if (returnType == "base64") {
                const image = fs.readFileSync(filePath);
                const base64Image = image.toString("base64");
                reply.type("text/plain").send(base64Image);
            }
        }
        catch (err) {
            reply.send({ error: "Failed" });
        }
    });
    done();
};
exports.fileHandlerPlugin = fileHandlerPlugin;
//# sourceMappingURL=file-handler.js.map