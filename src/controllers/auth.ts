import { FastifyInstance } from "fastify";
import { json } from "../utils/validation";
import { fastifyJwt } from "@fastify/jwt";
import { config } from "../config/config";

declare module "fastify" {
  interface FastifyRequest {
    authorized: boolean;
  }

  interface FastifyInstance {
    NOT_AUTHORIZED: { error: "not authorized" };
  }
}

const MAX_ATTEMPTS = 3;
const attempts = new Map<string, number>();

// 这样写是为了让 onRequest 这个 hook 能作用于任何 handler
// 而不仅限于 authHandlerPlugin 这个插件
export const authPlugin = (fastify: FastifyInstance<any>) => {
  const {jwtSecret, password} = config.getCurrValue();
  if (!jwtSecret) throw new Error("missing jwtSecret in config");

  fastify.register(fastifyJwt, { secret: jwtSecret });

  // 登录接口，传入密码，如果正确则签发一个 jwt
  fastify.post(
    "/auth",
    json({
      password: { type: "string" },
    }),
    (request, reply) => {
      const ip = request.ip;

      // 密码错误超过最大尝试次数
      if (attempts.get(ip) > MAX_ATTEMPTS)
        return { error: "Exceed max attemps;" };

      const _password = (request.body as any).password;
      // 未设密码或密码正确
      if (!_password || _password == password) {
        const token = fastify.jwt.sign({});
        return { token };
      } else {
        // 密码错误，错误尝试计数加
        attempts.set(ip, (attempts.get(ip) ?? 0) + 1);
        return { error: "Failed" };
      }
    },
  );

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
    } else {
      try {
        fastify.jwt.verify(token);
        request.authorized = true;
        console.log("valid token", request.headers.authorization);
      } catch (err) {
        console.log("invalid token", request.headers.authorization);
        request.authorized = false;
      }
    }
    done();
  });
};
