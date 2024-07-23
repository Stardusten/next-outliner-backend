import { FastifyPluginCallback } from "fastify";
import path from "node:path";

type ValidDatabase = {
  name: string;
  location: string;
  imagesDir: string;
  attachmentsDir: string;
  [key: string]: any;
};

export const dbManagePlugin: FastifyPluginCallback = (fastify, opts, done) => {
  // 获得所有数据库的信息
  fastify.post("/db/getAllDatabasesInfo", (request, reply) => {
    const validDatabases: ValidDatabase[] = [];
    let invalidDatabaseFound = false;
    for (const db of fastify.config.databases ?? []) {
      if (db.name && db.location) {
        validDatabases.push({
          name: db.name,
          location: db.location,
          imagesDir: db.imagesDir ?? path.join(db.location, "/attachments"),
          attachmentsDir:
            db.attachmentsDir ?? path.join(db.location, "/attachments/images"),
        });
      } else invalidDatabaseFound = true;
    }
    const msg =
      "Invalid database information detected. Please ensure that each database has a specified name and location.";
    if (invalidDatabaseFound) fastify.log.warn(msg);
    return validDatabases;
  });

  done();
};
