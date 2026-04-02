import pino from "pino";

export const createLogger = (level: string) => pino({ level });
