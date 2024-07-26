import { FastifyPluginCallback } from "fastify";
import path from "node:path";
import { jsonBodyWithProps } from "../utils/validation";
import * as fs from "node:fs";
import archiver from "archiver";

type ValidDatabase = {
  name: string;
  location: string;
  imagesDir: string;
  attachmentsDir: string;
  backupsDir: string;
  [key: string]: any;
};

const getValidDatabases = (config: any) => {
  const validDatabases: ValidDatabase[] = [];
  for (const db of config.databases ?? []) {
    if (db.name && db.location) {
      validDatabases.push({
        name: db.name,
        location: db.location,
        imagesDir: db.imagesDir ?? path.join(db.location, "/attachments"),
        attachmentsDir:
          db.attachmentsDir ?? path.join(db.location, "/attachments/images"),
        backupsDir: db.attachmentsDir ?? path.join(db.location, "/backups"),
      });
    }
  }
  return validDatabases;
};

export const dbManagePlugin: FastifyPluginCallback = (fastify, opts, done) => {
  // 获得所有数据库的信息
  fastify.post("/db/getAllDatabasesInfo", (request, reply) => {
    return getValidDatabases(fastify.config);
  });

  fastify.post(
    "/db/newBackup",
    jsonBodyWithProps({
      index: { type: "number" },
      name: { type: "string" },
    }),
    async (request, reply) => {
      if (!request.authorized) return fastify.NOT_AUTHORIZED;

      // 找到要备份的数据库
      const { index, name } = request.body as any;
      const validDatabases = getValidDatabases(fastify.config);
      const targetDatabase = validDatabases[index];
      if (!targetDatabase || targetDatabase.name != name)
        return { error: "invalid database" };

      const backupsDir = targetDatabase.backupsDir;
      // 备份文件夹尚不存在，创建之
      if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir);

      // 备份文件的名字和路径
      const backupBaseName = new Date().toString();
      const backupName = `${backupBaseName}.gzip`;
      const backupPath = path.join(backupsDir, backupName);
      if (fs.existsSync(backupPath))
        // 备份文件已经存在（不可能）
        return { error: "backup file already exists" };

      const targetDir = path.join(targetDatabase.location, "leveldb");
      if (!fs.existsSync(targetDir))
        // 目标数据库的 leveldb 文件夹不存在
        return { error: "leveldb folder of database doesn't exists" };

      const os = fs.createWriteStream(backupPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      archive.pipe(os);
      archive.directory(targetDir, false);
      await archive.finalize();

      return { success: true };
    },
  );

  done();
};
