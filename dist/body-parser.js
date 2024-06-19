"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerJsonBodyParser = void 0;
const registerJsonBodyParser = (server) => {
    server.removeContentTypeParser(["application/json"]);
    server.addContentTypeParser("application/json", { parseAs: "string" }, function (req, body, done) {
        try {
            console.log("start parsing!");
            const json = JSON.parse(body);
            done(null, json);
        }
        catch (err) {
            err.statusCode = 400;
            done(err, undefined);
        }
    });
};
exports.registerJsonBodyParser = registerJsonBodyParser;
//# sourceMappingURL=body-parser.js.map