import path from "path";
import { isFile, readFileAsString } from "../utils/fs";
import * as toml from "toml";
import { createObservable } from "../reactive/Observable";

const readConfig = async () => {
  const cwd = process.cwd();
  const configPath = path.join(cwd, "config.toml");
  if (!(await isFile(configPath))) return {};
  const content = await readFileAsString(configPath);
  if (!content) return {};
  return toml.parse(content);
};

export const config = createObservable(null);

readConfig().then((c) => config.update(c));