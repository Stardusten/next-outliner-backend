"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSseHandler = void 0;
const global_event_emitter_1 = require("../global-event-emitter");
const registerSseHandler = (server) => {
    server.get("/sse", (request, reply) => {
        const listener = ([id, data]) => reply.sse({ id, data });
        global_event_emitter_1.gee.on("sse", listener);
        request.socket.on("close", () => global_event_emitter_1.gee.off("sse", listener));
    });
};
exports.registerSseHandler = registerSseHandler;
//# sourceMappingURL=sse-handler.js.map