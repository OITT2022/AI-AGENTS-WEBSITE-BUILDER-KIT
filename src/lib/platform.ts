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

/**
 * Returns the temp directory for video rendering workspaces.
 * Uses VIDEO_TEMP_DIR env var if set, otherwise falls back to OS temp dir.
 */
export function getVideoTempDir(): string {
  return process.env.VIDEO_TEMP_DIR?.trim() || require('os').tmpdir();
}

/**
 * Whether this runtime can run FFmpeg / Remotion video rendering.
 * True when VIDEO_ENGINE_ENABLED=true (explicit opt-in on AWS),
 * or when running locally (PLATFORM=local / unset).
 * Serverless environments (Vercel/Lambda) are excluded by default
 * because they lack persistent temp storage and FFmpeg.
 */
export function isVideoCapable(): boolean {
  const explicit = process.env.VIDEO_ENGINE_ENABLED?.trim().toLowerCase();
  if (explicit === 'true' || explicit === '1') return true;
  if (explicit === 'false' || explicit === '0') return false;
  // Default: allow on local, block on serverless
  return !isServerless();
}
