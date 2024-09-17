import { asClass, asValue, AwilixContainer } from "awilix";
import { config } from "../config/config";
import Fastify, { FastifyServerOptions, RouteShorthandOptions } from "fastify";
import cors from "@fastify/cors";
import { fastifyMultipart } from "@fastify/multipart";
import { authPlugin } from "../controllers/auth";
import { logger } from "../logger/logger";
import { dbManageController } from "../controllers/db-manage";
import { fsController } from "../controllers/fs";
import { wsController } from "../controllers/ws";
import { miscController } from "../controllers/misc";

export const startServer = async () => {
  // 等待 config 加载完成
  await config.waitTillNonNull();

  const fastify = Fastify(config.getCurrValue());

  try {
    fastify.register(cors);
    fastify.register(fastifyMultipart);
    authPlugin(fastify);
    dbManageController(fastify);
    fsController(fastify);
    wsController(fastify);
    miscController(fastify);

    await fastify.listen({
      host: config.getCurrValue().host ?? "0.0.0.0",
      port: config.getCurrValue().port ?? 8080,
    });
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}