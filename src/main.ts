import Fastify, { FastifyServerOptions, RouteShorthandOptions } from "fastify";
import { mkDbConn } from "./db";
import cors from "@fastify/cors";

import { wsHandlerPlugin } from "./handlers/yjs-ws";
import { fileHandlerPlugin } from "./handlers/fs";
import { fetchWebTitlePlugin } from "./handlers/fetch-web-title";
import { fastifyMultipart } from "@fastify/multipart";

const serverOptions: FastifyServerOptions = {
  logger: true,
  maxParamLength: 500,
};

const start = async () => {
  const server = Fastify(serverOptions);
  try {
    server.register(cors);
    server.register(wsHandlerPlugin);
    server.register(fastifyMultipart);
    server.register(fileHandlerPlugin);
    server.register(fetchWebTitlePlugin);
    await server.listen({ host: "0.0.0.0", port: 8080 });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
