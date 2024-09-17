import { FastifyInstance } from "fastify";
import { WebSocketServer } from "ws";
import { WsConnManager } from "../yjs/WsConnSetup";

export const wsController = (fastify: FastifyInstance<any>) => {
  
  const wsConnManager = new WsConnManager();
  
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (...params) => {
    // @ts-ignore
    wsConnManager.setupConnection(...params);
  });

  // 
  fastify.server.on("upgrade", (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host}`);
    } catch (err) {
      fastify.log.info(`invalid url ${req.url}`);
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
    }
    const params = url.searchParams;
    if (params.has("location") && params.has("authorization")) {
      const location = params.get("location");
      const authorization = params.get("authorization");

      // 鉴权
      if (!authorization) {
        fastify.log.info("missing authorization");
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      try {
        fastify.jwt.verify(authorization);
      } catch (err) {
        fastify.log.info("authorization failed");
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, location);
      });
    } else {
      fastify.log.info("invalid ws request, missing `docName` or `location`");
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
    }
  });
}