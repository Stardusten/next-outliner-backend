import path from "path";
import { isFile, readFileAsString } from "../utils/fs";
import * as toml from "toml";
import { createObservable } from "../reactive/Observable";
import { logger } from "../logger/logger";

export type Config = {
  host: string;
  port: number;
  password: string;
  jwtSecret: string;
  logger: boolean;
  maxParamLength: number;
  databases: Record<string, {
    name: string;
    location: string;
    attachmentsDir: string;
    imagesDir: string;
    musicDir: string;
    videoDir: string;
    documentDir: string;
  }>;
};

const DEFAULT_CONFIG_PATH = path.join(process.cwd(), "config.toml");

// 读取配置文件
const readConfig = async (path?: string) => {
  const configPath = path ?? DEFAULT_CONFIG_PATH;
  if (!(await isFile(configPath)))
    throw new Error(`Config file not found at ${configPath}`);
  const content = await readFileAsString(configPath);
  if (!content)
    throw new Error(`Failed to read config file at ${configPath}`);
  const config = toml.parse(content);
  return __normalizeConfig(config);
};

const __normalizeConfig = (config: any): Config => {
  if (!config.password)
    throw new Error("Password is required in config file");

  const normalizedDatabases = {} as Config["databases"];
  if (config.databases) {
    for (const db of config.database) {
      const { name, location } = db;
      if (!name || !location) {
        logger.warn(`Invalid database found, you must specify both name and location`);
        continue;
      }
      const attachmentsDir = db.attachmentsDir ?? "attachments";
      normalizedDatabases[location] = {
        name, location, attachmentsDir,
        imagesDir: db.imagesDir ?? path.join(attachmentsDir, "images"),
        musicDir: db.musicDir ?? path.join(attachmentsDir, "music"),
        videoDir: db.videoDir ?? path.join(attachmentsDir, "video"),
        documentDir: db.documentDir ?? path.join(attachmentsDir, "document"),
      };
    }
  }
  
  return {
    host: config.host ?? "0.0.0.0",
    port: config.port ?? 8081,
    password: config.password ?? "123456",
    jwtSecret: config.jwtSecret ?? crypto.randomUUID(),
    logger: config.logger ?? true,
    maxParamLength: config.maxParamLength ?? 500,
    databases: normalizedDatabases,
  };
};

export const config = createObservable<Config>(null);
readConfig().then((c) => config.update(c));