/**
 * Platform/runtime detection utility.
 * Replaces scattered process.env.VERCEL checks with a single abstraction.
 */

export type PlatformType = 'vercel' | 'aws' | 'local';

export function getPlatform(): PlatformType {
  const explicit = process.env.PLATFORM?.trim().toLowerCase();
  if (explicit === 'vercel' || explicit === 'aws' || explicit === 'local') {
    return explicit;
  }
  if (process.env.VERCEL) return 'vercel';
  if (process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV) return 'aws';
  return 'local';
}

export function isServerless(): boolean {
  const p = getPlatform();
  return p === 'vercel' || p === 'aws';
}

/**
 * Returns a writable base directory for temporary/data files.
 * - Vercel/Lambda: /tmp
 * - Local/Amplify SSR: process.cwd()
 */
export function getWritableBaseDir(): string {
  return isServerless() ? '/tmp' : process.cwd();
}
