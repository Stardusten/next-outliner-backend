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
exports.fetchWebTitlePlugin = void 0;
const axios_1 = __importDefault(require("axios"));
const he = __importStar(require("html-entities"));
const validation_1 = require("../utils/validation");
const fetchWebTitlePlugin = (fastify, opts, done) => {
    fastify.post("/fetch-webpage-title", (0, validation_1.jsonBodyWithProps)({
        webpageUrl: { type: "string" },
    }), async (request, reply) => {
        if (!request.authorized)
            return fastify.NOT_AUTHORIZED;
        let { webpageUrl } = request.body;
        const inner = async (url) => {
            const resp = await axios_1.default.get(url, {
                responseType: "text",
                maxRedirects: 10,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                },
            });
            const regex = /<title(?:\s+[^>]*?)?>([^<>\n\r]+)<\/title>/;
            const match = regex.exec(resp.data);
            if (!match)
                return null;
            // decode html entities
            const content = match[1];
            return he.decode(content);
        };
        webpageUrl = webpageUrl.trim();
        const rawUrl = webpageUrl.startsWith("https://")
            ? webpageUrl.slice(8)
            : webpageUrl.startsWith("http://")
                ? webpageUrl.slice(7)
                : webpageUrl;
        const title = (await inner("https://" + rawUrl)) || (await inner("http://" + rawUrl));
        return { title };
    });
    done();
};
exports.fetchWebTitlePlugin = fetchWebTitlePlugin;
//# sourceMappingURL=fetch-web-title.js.map