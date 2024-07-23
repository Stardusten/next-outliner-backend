"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAuthPlugin = void 0;
const validation_1 = require("../utils/validation");
const jwt_1 = require("@fastify/jwt");
// 这样写是为了让 onRequest 这个 hook 能作用于任何 handler
// 而不仅限于 authHandlerPlugin 这个插件
const registerAuthPlugin = (fastify) => {
    if (!fastify.config.jwtSecret)
        throw new Error("missing jwtSecret in config");
    fastify.register(jwt_1.fastifyJwt, { secret: fastify.config.jwtSecret });
    // 登录接口，传入密码，如果正确则签发一个 jwt
    fastify.post("/auth", (0, validation_1.jsonBodyWithProps)({
        password: { type: "string" },
    }), (request, reply) => {
        const { password } = request.body;
        // 未设密码或密码正确
        if (!fastify.config.password || password == fastify.config.password) {
            const token = fastify.jwt.sign({});
            return { token };
        }
        else {
            // 密码错误
            return { error: "Failed" };
        }
    });
    // 向 request 中添加一个 authorized 属性
    fastify.decorateRequest("authorized", false);
    // 未授权访问时应该返回的响应
    fastify.decorate("NOT_AUTHORIZED", { error: "not authorized" });
    // 校验 jwt，更新 authorized 属性
    fastify.addHook("onRequest", (request, reply, done) => {
        const token = request.headers.authorization;
        if (!token) {
            console.log("no token");
            request.authorized = false;
        }
        else {
            try {
                fastify.jwt.verify(token);
                request.authorized = true;
                console.log("valid token", request.headers.authorization);
            }
            catch (err) {
                console.log("invalid token", request.headers.authorization);
                request.authorized = false;
            }
        }
        done();
    });
};
exports.registerAuthPlugin = registerAuthPlugin;
//# sourceMappingURL=auth.js.map