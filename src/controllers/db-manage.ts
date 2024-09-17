import { FastifyInstance, FastifyPluginCallback } from "fastify";
import path from "node:path";
import { json } from "../utils/validation";
import * as fs from "node:fs";
import archiver from "archiver";
import { config } from "../config/config";

type ValidDatabase = {
  name: string;
  location: string;
  imagesDir: string;
  attachmentsDir: string;
  backupsDir: string;
  [key: string]: any;
};

export const getValidDatabases = (config: any) => {
  const validDatabases: ValidDatabase[] = [];
  for (const db of config.databases ?? []) {
    if (db.name && db.location) {
      validDatabases.push({
        name: db.name,
        location: db.location,
        imagesDir:
          db.imagesDir ?? path.join(db.location, "/attachments/images"),
        attachmentsDir:
          db.attachmentsDir ?? path.join(db.location, "/attachments"),
        backupsDir: db.attachmentsDir ?? path.join(db.location, "/backups"),
      });
    }
  }
  return validDatabases;
};

export const dbManageController = (fastify: FastifyInstance<any>) => {
  // 获得所有数据库的信息
  fastify.post("/db/getAllDatabasesInfo", (request, reply) => {
    return getValidDatabases(config.getCurrValue());
  });

  fastify.post("/db/getAllBackups", json({
    index: { type: "number" },
    name: { type: "string" },
  }) ,async (request, reply) => {
    if (!request.authorized) return fastify.NOT_AUTHORIZED;

      // 找到要备份的数据库
      const { index, name } = request.body as any;
      const validDatabases = getValidDatabases(config.getCurrValue());
      const targetDatabase = validDatabases[index];
      if (!targetDatabase || targetDatabase.name != name)
        return { error: "invalid database" };

      const backupsDir = targetDatabase.backupsDir;
      // 备份文件夹尚不存在，返回空
      if (!fs.existsSync(backupsDir)) return { success: true, backups: [] };

      // 读取备份文件夹，返回所有备份文件的文件名
      const backups = fs.readdirSync(backupsDir);
      return { success: true, backups };
  });

  fastify.post(
    "/db/newBackup",
    json({
      index: { type: "number" },
      name: { type: "string" },
      type: { type: "string" },
    }),
    async (request, reply) => {
      if (!request.authorized) return fastify.NOT_AUTHORIZED;

      // 找到要备份的数据库
      const { index, name, type } = request.body as any;
      const validDatabases = getValidDatabases(config.getCurrValue());
      const targetDatabase = validDatabases[index];
      if (!targetDatabase || targetDatabase.name != name)
        return { error: "invalid database" };

      const backupsDir = targetDatabase.backupsDir;
      // 备份文件夹尚不存在，创建之
      if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir);

      // 备份文件的名字和路径
      const backupBaseName = new Date().toISOString();
      const backupName = `${backupBaseName}-${type}.gzip`;
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

      return { success: true, data: {} };
    },
  );
};
