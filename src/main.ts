import Fastify, { FastifyServerOptions, RouteShorthandOptions } from "fastify";
import cors from "@fastify/cors";

import { wsHandlerPlugin } from "./handlers/ws";
import { fileHandlerPlugin } from "./handlers/fs";
import { fetchWebTitlePlugin } from "./handlers/fetch-web-title";
import { fastifyMultipart } from "@fastify/multipart";
import { registerAuthPlugin } from "./handlers/auth";
import path from "node:path";
import { isFile, readFileAsString } from "./utils/fs-utils";
import * as toml from "toml";
import { dbManagePlugin } from "./handlers/db-manage";

declare module "fastify" {
  interface FastifyInstance {
    config: {
      password?: string;
      jwtSecret?: string;
      databases?: {
        name?: string;
        location?: string;
        imagesDir?: string;
        attachmentsDir?: string;
        backupsDir?: string;
        [key: string]: any;
      }[];
      [key: string]: any;
    } & FastifyServerOptions;
  }
}

const readConfig = async () => {
  const cwd = process.cwd();
  const configPath = path.join(cwd, "config.toml");
  if (!(await isFile(configPath))) return {};
  const content = await readFileAsString(configPath);
  if (!content) return {};
  return toml.parse(content);
};

const start = async () => {
  // 读取配置文件，并绑定到 fastify 上
  const config = await readConfig();
  const fastify = Fastify(config);
  fastify.decorate("config", config);

  try {
    // 注册插件
    fastify.register(cors);
    fastify.register(wsHandlerPlugin);
    fastify.register(fastifyMultipart);
    fastify.register(fileHandlerPlugin);
    fastify.register(fetchWebTitlePlugin);
    fastify.register(dbManagePlugin);
    registerAuthPlugin(fastify);

    // 开始监听
    await fastify.listen({
      host: config.host ?? "0.0.0.0",
      port: config.port ?? 8080,
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
