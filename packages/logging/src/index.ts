// ── Types ──

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
  service?: string;
}

// ── Log level ordering ──

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ── Logger interface ──

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// ── Factory ──

export function createLogger(service: string, minLevel: LogLevel = "debug"): Logger {
  const minOrder = LOG_LEVEL_ORDER[minLevel];

  function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LOG_LEVEL_ORDER[level] < minOrder) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      service,
      ...(meta !== undefined ? { meta } : {}),
    };

    const line = JSON.stringify(entry);

    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  return {
    debug: (message, meta?) => emit("debug", message, meta),
    info: (message, meta?) => emit("info", message, meta),
    warn: (message, meta?) => emit("warn", message, meta),
    error: (message, meta?) => emit("error", message, meta),
  };
}

// ── Redaction helper ──

export function redactLog(entry: LogEntry, secrets: string[]): LogEntry {
  if (secrets.length === 0) return entry;

  let serialised = JSON.stringify(entry);
  for (const secret of secrets) {
    if (secret.length === 0) continue;
    // Replace all occurrences of each secret value
    serialised = serialised.split(secret).join("[REDACTED]");
  }
  return JSON.parse(serialised) as LogEntry;
}

// ── Legacy helpers (kept for backwards compat) ──

export function logInfo(message: string, meta?: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: "info", message, meta }));
}

export function logError(message: string, meta?: Record<string, unknown>): void {
  console.error(JSON.stringify({ level: "error", message, meta }));
}
