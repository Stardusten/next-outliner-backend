export type LogLevel = "info" | "warn" | "error";

export type Logger = {
  [key in LogLevel]: (msg: string) => void;
};
