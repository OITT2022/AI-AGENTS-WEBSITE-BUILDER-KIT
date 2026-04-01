/**
 * Structured JSON logger for pipeline traceability.
 *
 * Every log line is a single JSON object with:
 *   ts, level, step, message, and optional context fields (run_id, entity_id, etc.)
 *
 * No external dependencies. Writes to stdout (info) and stderr (warn/error).
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogContext {
  run_id?: string;
  entity_id?: string;
  source_entity_id?: string;
  client_id?: string;
  batch_id?: string;
  variant_id?: string;
  platform?: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, step: string, message: string, ctx?: LogContext): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    step,
    message,
    ...ctx,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export function info(step: string, message: string, ctx?: LogContext): void {
  emit('info', step, message, ctx);
}

export function warn(step: string, message: string, ctx?: LogContext): void {
  emit('warn', step, message, ctx);
}

export function error(step: string, message: string, ctx?: LogContext): void {
  emit('error', step, message, ctx);
}

/** Create a child logger with pre-bound context (e.g. run_id). */
export function child(baseCtx: LogContext) {
  return {
    info: (step: string, message: string, ctx?: LogContext) => info(step, message, { ...baseCtx, ...ctx }),
    warn: (step: string, message: string, ctx?: LogContext) => warn(step, message, { ...baseCtx, ...ctx }),
    error: (step: string, message: string, ctx?: LogContext) => error(step, message, { ...baseCtx, ...ctx }),
  };
}
