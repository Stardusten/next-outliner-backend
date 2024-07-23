import { PathLike } from "node:fs";
import * as fs from "fs";

export const isDirEmpty = (dir: PathLike) => {
  try {
    const files = fs.readdirSync(dir);
    return files.length == 0;
  } catch (err) {
    return false;
  }
};

// 判断路径是否是文件
export const isFile = (filePath: string): Promise<boolean> => {
  return new Promise((resolve) => {
    fs.stat(filePath, (err, stats) => {
      if (err) {
        resolve(false);
      } else {
        resolve(stats.isFile());
      }
    });
  });
};

// 读出文件内容为字符串
export const readFileAsString = (filePath: string): Promise<string | null> => {
  return new Promise((resolve) => {
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) {
        resolve(null);
      } else {
        resolve(data);
      }
    });
  });
};
