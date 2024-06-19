"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.gee = void 0;
const node_events_1 = __importDefault(require("node:events"));
const _gee = new node_events_1.default.EventEmitter();
let sseIdCounter = 0;
exports.gee = {
    on: _gee.on,
    off: _gee.removeListener,
    once: _gee.once,
    emitSse: (data) => {
        _gee.emit("sse", [sseIdCounter++, data]);
    },
};
//# sourceMappingURL=global-event-emitter.js.map