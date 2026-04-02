export interface LoggerLike {
  info(message: unknown, ...args: unknown[]): void;
  error(message: unknown, ...args: unknown[]): void;
  warn(message: unknown, ...args: unknown[]): void;
  debug(message: unknown, ...args: unknown[]): void;
}

export const consoleLogger: LoggerLike = {
  info: (...args) => console.log(...args),
  error: (...args) => console.error(...args),
  warn: (...args) => console.warn(...args),
  debug: (...args) => console.debug(...args)
};
