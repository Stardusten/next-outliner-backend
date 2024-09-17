import { FastifyInstance, FastifyPluginCallback } from "fastify";
import * as fs from "fs";
import path from "node:path";
import { json } from "../utils/validation";

export const fsController = (fastify: FastifyInstance<any>) => {
  fastify.post(
    "/fs/stat",
    json({
      filePath: { type: "string" },
    }),
    (request, reply) => {
      if (!request.authorized) return fastify.NOT_AUTHORIZED;
      const { filePath } = request.body as any;
      try {
        const { ctime, mtime, size } = fs.statSync(filePath);
        return { ctime, mtime, size };
      } catch (err) {
        return { error: "Failed" };
      }
    },
  );

  fastify.post("/fs/list", json({}), async (request, reply) => {
    if (!request.authorized) return fastify.NOT_AUTHORIZED;
    const { dirPath } = request.body as any;
    try {
      const dirents = await fs.promises.readdir(dirPath, {
        withFileTypes: true,
      });
      return dirents.map((dirent) => ({
        isFile: dirent.isFile(),
        name: dirent.name,
        hasChildren: dirent.isFile()
          ? false
          : fs.readdirSync(path.join(dirPath, dirent.name)).length > 0,
      }));
    } catch (err) {
      return { error: "Failed" };
    }
  });

  fastify.post("/fs/upload", async (request, reply) => {
    if (!request.authorized) return fastify.NOT_AUTHORIZED;
    let targetPath: string | null = null;
    try {
      for await (const part of request.parts()) {
        if (targetPath == null) {
          // expect path now
          if (part.type == "field" && typeof part.value == "string") {
            targetPath = part.value;
            const dirname = path.dirname(targetPath);
            if (!fs.existsSync(dirname)) {
              return { error: "Directory does not exist" };
            }
            if (fs.existsSync(targetPath)) {
              return { error: "Path already exists" };
            }
          } else {
            return { error: "Invalid request body" };
          }
        } else {
          // expect file now
          try {
            await new Promise((resolve, reject) => {
              const ws = fs.createWriteStream(targetPath);
              if (part.type == "field" && typeof part.value == "string") {
                ws.write(part.value as string, (err) => {
                  if (err) return reject(err);
                  else resolve(undefined);
                });
              } else if (part.type == "file") {
                part.file.pipe(ws);
                part.file.on("end", resolve);
                part.file.on("error", reject);
              }
            });
          } catch (err) {
            return { error: "Error when writing file" };
          }
          return { success: true };
        }
      }
    } catch (err) {
      return { error: "Unexpected error" };
    }
  });

  fastify.get("/fs/download/:filePath", async (request, reply) => {
    if (!request.authorized) return fastify.NOT_AUTHORIZED;
    const { filePath } = request.params as any;
    const { range } = request.headers;
    try {
      const stat = await fs.promises.stat(filePath);
      const fileSize = stat.size;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;
        const stream = fs.createReadStream(filePath, { start, end });
        return reply
          .code(206)
          .headers({
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": chunkSize,
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="${path.basename(filePath)}"`,
          })
          .send(stream);
      } else {
        const stream = fs.createReadStream(filePath);
        return reply
          .headers({
            "Content-Length": fileSize,
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="${path.basename(filePath)}"`,
          })
          .send(stream);
      }
    } catch (err) {
      console.log(err);
      reply.send({ error: "Failed" });
    }
  });
};
