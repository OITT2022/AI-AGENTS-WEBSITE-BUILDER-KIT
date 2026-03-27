import { randomBytes } from "node:crypto";

// ── Existing retry ──

export async function retry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

// ── New utilities ──

/**
 * Generate a unique ID with an optional prefix, e.g. "task_abc123".
 */
export function generateId(prefix?: string): string {
  const id = randomBytes(8).toString("hex");
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Retry a function with exponential backoff.
 */
export interface RetryOptions {
  attempts?: number;
  baseDelay?: number;
  maxDelay?: number;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { attempts = 3, baseDelay = 500, maxDelay = 10_000 } = options;
  let lastError: unknown;

  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        const delay = Math.min(baseDelay * 2 ** i, maxDelay);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

/**
 * Format a Date to ISO string.
 */
export function formatDate(date: Date): string {
  return date.toISOString();
}

/**
 * Convert text to a URL-safe slug.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Truncate text to maxLength, appending "..." if truncated.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Redact secrets from text by replacing patterns with "[REDACTED]".
 */
const DEFAULT_SECRET_PATTERNS: RegExp[] = [
  /(?:sk|pk|api[_-]?key|token|secret|password|bearer)[_-]?\w{8,}/gi,
  /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g,
  /xox[bpsorta]-[A-Za-z0-9-]+/g,
];

export function redactSecrets(text: string, patterns?: RegExp[]): string {
  const allPatterns = patterns ?? DEFAULT_SECRET_PATTERNS;
  let result = text;
  for (const pattern of allPatterns) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

export { MemoryCache } from "./cache.js";
export { hasPermission, getRolePermissions, type Role, type Permission } from "./permissions.js";
