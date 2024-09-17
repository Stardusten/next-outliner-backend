import { PathLike } from "node:fs";
import * as fs from "fs";
import path from "node:path";

/**
 * 检查指定目录是否为空
 * @param dir - 要检查的目录路径
 * @returns 如果目录为空返回true,否则返回false
 */
export const isDirEmpty = (dir: PathLike) => {
  try {
    // 尝试读取目录内容
    const files = fs.readdirSync(dir);
    // 如果文件数量为0,则目录为空
    return files.length == 0;
  } catch (err) {
    // 如果读取目录时发生错误(例如目录不存在),返回false
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

/**
 * 判断一个路径是否为另一个路径的子目录
 * @param child - 可能的子目录路径
 * @param parent - 可能的父目录路径
 * @returns 如果child是parent的子目录则返回true,否则返回false
 */
export const isChildOf = (child: string, parent: string) => {
  // 如果两个路径相同,则不是子目录关系
  if (child === parent) return false;
  
  // 将路径分割成token,并过滤掉空字符串
  let parentTokens = parent.split("/").filter((i) => i.length);
  let childTokens = child.split("/").filter((i) => i.length);
  
  // 检查父路径的每个token是否与子路径的对应部分匹配
  return parentTokens.every((t, i) => childTokens[i] === t);
};