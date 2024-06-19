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
