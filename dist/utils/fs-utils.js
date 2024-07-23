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
exports.readFileAsString = exports.isFile = exports.isDirEmpty = void 0;
const fs = __importStar(require("fs"));
const isDirEmpty = (dir) => {
    try {
        const files = fs.readdirSync(dir);
        return files.length == 0;
    }
    catch (err) {
        return false;
    }
};
exports.isDirEmpty = isDirEmpty;
// 判断路径是否是文件
const isFile = (filePath) => {
    return new Promise((resolve) => {
        fs.stat(filePath, (err, stats) => {
            if (err) {
                resolve(false);
            }
            else {
                resolve(stats.isFile());
            }
        });
    });
};
exports.isFile = isFile;
// 读出文件内容为字符串
const readFileAsString = (filePath) => {
    return new Promise((resolve) => {
        fs.readFile(filePath, "utf8", (err, data) => {
            if (err) {
                resolve(null);
            }
            else {
                resolve(data);
            }
        });
    });
};
exports.readFileAsString = readFileAsString;
//# sourceMappingURL=fs-utils.js.map