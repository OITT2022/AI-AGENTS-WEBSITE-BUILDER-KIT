/**
 * Local video-engine wrapper — AWS-compatible edition.
 *
 * Runs the VideoEngine (Remotion-based slideshow renderer) as an isolated
 * child process.  This wrapper:
 * - Downloads remote assets to a temp workspace before rendering
 * - Uses a configurable temp directory (VIDEO_TEMP_DIR or os.tmpdir())
 * - Uploads the rendered MP4 to persistent storage (S3 or local)
 * - Tracks render lifecycle: pending → processing → completed → failed
 * - Cleans up temp files in all code paths
 *
 * No external video APIs. Requires FFmpeg on the system PATH (or FFMPEG_PATH).
 *
 * Usage:
 *   import { renderLocalVideo, renderLocalVideoFromFile } from './video-engine-local';
 *
 *   const result = await renderLocalVideo(job);
 *   // result.url is the persistent URL (S3 or local serve path)
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as log from '../lib/logger';
import { isVideoCapable, getVideoTempDir } from '../lib/platform';
import { getStorage } from '../lib/storage';

// ── Types (mirrors video-engine/src/types.ts without importing) ──

export interface LocalVideoJob {
  projectId: string;
  platform: 'tiktok' | 'instagram-reel' | 'facebook-reel' | 'facebook-feed' | 'square';
  language: 'he' | 'en' | 'ar' | 'fr' | 'de';
  rtl?: boolean;
  style: 'luxury' | 'modern' | 'energetic' | 'minimal';
  fps?: number;
  title: string;
  subtitle?: string;
  cta?: string;
  outroTitle?: string;
  outroSubtitle?: string;
  themeColor?: string;
  textColor?: string;
  backgroundColor?: string;
  fitMode?: 'cover' | 'contain';
  images: Array<{
    src: string;
    alt?: string;
    holdSeconds?: number;
    caption?: string;
  }>;
  logo?: {
    src: string;
    width?: number;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  };
  music?: {
    src: string;
    volume?: number;
    trimStartSeconds?: number;
    trimEndSeconds?: number;
  };
}

export type RenderStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface LocalVideoResult {
  success: boolean;
  /** Persistent URL (S3 or local serve path) — use this in the API response. */
  url: string;
  /** Duration of the render process in milliseconds. */
  durationMs: number;
  /** Render lifecycle status. */
  status: RenderStatus;
  /** File size in bytes (0 on failure). */
  fileSizeBytes: number;
  /** Error message on failure. */
  error?: string;
  /** Storage provider used ('s3' | 'local'). */
  storageProvider: string;
}

// ── Paths ──

/** Resolve the video-engine directory relative to this file's compiled location. */
function getVideoEngineDir(): string {
  // In dev: src/services/ → ../../video-engine
  // In dist: dist/services/ → ../../video-engine
  const candidates = [
    path.resolve(__dirname, '../../video-engine'),
    path.resolve(process.cwd(), 'video-engine'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'scripts', 'render.ts')) ||
        fs.existsSync(path.join(c, 'scripts', 'render.js'))) {
      return c;
    }
  }
  return candidates[0]; // fallback
}

// ── Helpers ──

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Create a unique temp workspace inside VIDEO_TEMP_DIR. */
function createTempWorkspace(): string {
  const baseDir = getVideoTempDir();
  ensureDir(baseDir);
  const workspace = fs.mkdtempSync(path.join(baseDir, 'video-render-'));
  log.info('video-engine-local', `Created temp workspace: ${workspace}`);
  return workspace;
}

/** Remove a temp workspace directory. Swallows errors. */
function cleanupWorkspace(workspace: string): void {
  try {
    if (fs.existsSync(workspace)) {
      fs.rmSync(workspace, { recursive: true, force: true });
      log.info('video-engine-local', `Cleaned up workspace: ${workspace}`);
    }
  } catch (err) {
    log.warn('video-engine-local', `Workspace cleanup failed: ${(err as Error).message}`, { workspace });
  }
}

/**
 * Upload the rendered video to persistent storage and return the URL.
 * Falls back to local serve path if storage write fails.
 */
async function uploadToStorage(localPath: string, storageKey: string): Promise<{ url: string; provider: string }> {
  const storage = getStorage();
  const providerName = process.env.STORAGE_PROVIDER?.trim().toLowerCase() === 's3' ? 's3' : 'local';

  try {
    const data = fs.readFileSync(localPath);
    const url = await storage.write(storageKey, data, 'video/mp4');
    log.info('video-engine-local', `Uploaded to ${providerName}: ${storageKey}`, {
      size_bytes: data.length,
      url,
    });
    return { url: providerName === 's3' ? url : storage.getUrl(storageKey), provider: providerName };
  } catch (err) {
    log.error('video-engine-local', `Storage upload failed: ${(err as Error).message}`, { storageKey });
    throw err;
  }
}

/**
 * Spawn the video-engine render script as a child process.
 * Runs inside video-engine/ so that Remotion resolves its own node_modules.
 */
function spawnRender(
  videoEngineDir: string,
  jobFilePath: string,
  outputFilePath: string,
  timeoutMs = 600_000,
): Promise<{ success: boolean; durationMs: number; error?: string }> {
  const start = Date.now();

  return new Promise((resolve) => {
    // Build environment with FFmpeg path support
    const env = { ...process.env };

    // Check for FFmpeg in env-configured path
    if (env.FFMPEG_PATH && fs.existsSync(env.FFMPEG_PATH)) {
      const ffmpegDir = path.dirname(env.FFMPEG_PATH);
      env.PATH = `${ffmpegDir}${path.delimiter}${env.PATH || ''}`;
    } else {
      // Fallback: check for ffmpeg in common locations
      const commonPaths = [
        path.join(path.parse(process.cwd()).root, 'ffmpeg'),
        '/usr/local/bin',
        '/usr/bin',
      ];
      for (const dir of commonPaths) {
        const ffmpegBin = path.join(dir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
        if (fs.existsSync(ffmpegBin)) {
          env.PATH = `${dir}${path.delimiter}${env.PATH || ''}`;
          break;
        }
      }
    }

    // Find the render script (support both .ts and .js)
    const renderScriptTs = path.join(videoEngineDir, 'scripts', 'render.ts');
    const renderScriptJs = path.join(videoEngineDir, 'scripts', 'render.js');
    const renderScript = fs.existsSync(renderScriptTs) ? renderScriptTs : renderScriptJs;
    const runner = fs.existsSync(renderScriptTs) ? 'tsx' : 'node';

    log.info('video-engine-local', `Spawning render: npx ${runner} <script>`, {
      job: jobFilePath,
      output: outputFilePath,
      timeout_ms: timeoutMs,
    });

    // Quote paths that may contain spaces (critical on Windows with shell: true)
    const q = (p: string) => `"${p}"`;

    // Use shell: true so that npx resolves correctly on all platforms
    // (on Windows, npx is npx.cmd and execFile without shell won't find it)
    const child = execFile(
      'npx',
      [runner, q(renderScript), q(jobFilePath), q(outputFilePath)],
      {
        cwd: videoEngineDir,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
        shell: true,
        env,
      },
      (error, _stdout, stderr) => {
        const durationMs = Date.now() - start;

        if (error) {
          const msg = stderr?.trim() || error.message;
          log.error('video-engine-local', `Render failed after ${durationMs}ms: ${msg}`, { durationMs });
          resolve({ success: false, durationMs, error: msg });
          return;
        }

        if (!fs.existsSync(outputFilePath)) {
          const msg = 'Render completed but output file not found';
          log.error('video-engine-local', msg, { outputPath: outputFilePath });
          resolve({ success: false, durationMs, error: msg });
          return;
        }

        const stat = fs.statSync(outputFilePath);
        if (stat.size === 0) {
          const msg = 'Render produced empty output file';
          log.error('video-engine-local', msg, { outputPath: outputFilePath });
          resolve({ success: false, durationMs, error: msg });
          return;
        }

        log.info('video-engine-local', `Render complete: ${(stat.size / 1024 / 1024).toFixed(2)} MB in ${durationMs}ms`, {
          durationMs,
          size_bytes: stat.size,
        });
        resolve({ success: true, durationMs });
      },
    );

    // Stream child stdout/stderr to structured logs
    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) log.info('video-engine-local', text);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) log.warn('video-engine-local', text);
    });
  });
}

// ── Public API ──

// ── Remote worker delegation ──

/**
 * Delegate rendering to a remote EC2/ECS worker via HTTP.
 * Used when VIDEO_WORKER_URL is set (hybrid Amplify + EC2 architecture).
 */
async function renderViaWorker(
  workerUrl: string,
  job: LocalVideoJob,
  variantId?: string,
): Promise<LocalVideoResult> {
  const url = `${workerUrl.replace(/\/+$/, '')}/api/video/render`;
  log.info('video-engine-local', `Delegating render to worker: ${url}`, {
    variant_id: variantId,
    platform: job.platform,
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 600_000); // 10 min timeout

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job, variantId }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Worker responded ${res.status}: ${body}`);
    }

    const result = await res.json() as LocalVideoResult;
    log.info('video-engine-local', `Worker render complete`, {
      variant_id: variantId,
      url: result.url,
      status: result.status,
      size_bytes: result.fileSizeBytes,
    });
    return result;
  } catch (err) {
    const msg = (err as Error).message;
    log.error('video-engine-local', `Worker render failed: ${msg}`, { variant_id: variantId });
    return {
      success: false,
      url: '',
      durationMs: 0,
      status: 'failed',
      fileSizeBytes: 0,
      error: `Video worker error: ${msg}`,
      storageProvider: 'none',
    };
  }
}

/**
 * Render a video from an in-memory job object.
 *
 * If VIDEO_WORKER_URL is set, delegates to the remote EC2 worker.
 * Otherwise, renders locally:
 * 1. Create temp workspace
 * 2. Write job JSON to workspace
 * 3. Spawn Remotion render (assets are downloaded inside render.ts)
 * 4. Validate output
 * 5. Upload to persistent storage (S3 or local)
 * 6. Cleanup temp workspace
 *
 * Returns a persistent URL for the rendered video.
 */
export async function renderLocalVideo(
  job: LocalVideoJob,
  variantId?: string,
): Promise<LocalVideoResult> {
  // Delegate to remote worker if configured (hybrid Amplify + EC2 setup)
  const workerUrl = process.env.VIDEO_WORKER_URL?.trim();
  if (workerUrl) {
    return renderViaWorker(workerUrl, job, variantId);
  }
  const videoEngineDir = getVideoEngineDir();
  const workspace = createTempWorkspace();
  const jobId = `job-${randomUUID()}`;
  const outputFilename = `${variantId || job.projectId}-${job.platform}-${Date.now()}.mp4`;
  const tmpJobPath = path.join(workspace, `${jobId}.json`);
  const tmpOutputPath = path.join(workspace, outputFilename);

  log.info('video-engine-local', `Starting render for ${job.projectId}`, {
    platform: job.platform,
    language: job.language,
    image_count: job.images.length,
    variant_id: variantId,
    status: 'processing' as RenderStatus,
  });

  try {
    // Step 1: Write job file
    fs.writeFileSync(tmpJobPath, JSON.stringify(job, null, 2), 'utf8');
    log.info('video-engine-local', `Job file written: ${tmpJobPath}`);

    // Step 2: Render
    const renderResult = await spawnRender(videoEngineDir, tmpJobPath, tmpOutputPath);

    if (!renderResult.success) {
      return {
        success: false,
        url: '',
        durationMs: renderResult.durationMs,
        status: 'failed',
        fileSizeBytes: 0,
        error: renderResult.error,
        storageProvider: 'none',
      };
    }

    // Step 3: Get file size
    const stat = fs.statSync(tmpOutputPath);

    // Step 4: Upload to persistent storage
    const storageKey = `videos/${new Date().toISOString().split('T')[0]}/${outputFilename}`;
    const { url, provider } = await uploadToStorage(tmpOutputPath, storageKey);

    log.info('video-engine-local', `Render pipeline complete`, {
      variant_id: variantId,
      url,
      storage_provider: provider,
      size_bytes: stat.size,
      duration_ms: renderResult.durationMs,
      status: 'completed' as RenderStatus,
    });

    return {
      success: true,
      url,
      durationMs: renderResult.durationMs,
      status: 'completed',
      fileSizeBytes: stat.size,
      storageProvider: provider,
    };
  } catch (err) {
    const msg = (err as Error).message;
    log.error('video-engine-local', `Render pipeline failed: ${msg}`, {
      variant_id: variantId,
      status: 'failed' as RenderStatus,
    });
    return {
      success: false,
      url: '',
      durationMs: 0,
      status: 'failed',
      fileSizeBytes: 0,
      error: msg,
      storageProvider: 'none',
    };
  } finally {
    // Step 5: Cleanup temp workspace
    cleanupWorkspace(workspace);
  }
}

/**
 * Render a video from an existing job JSON file.
 * Does not modify or delete the job file — useful for manual/test runs.
 */
export async function renderLocalVideoFromFile(
  jobFilePath: string,
  outputPath?: string,
): Promise<LocalVideoResult> {
  const absoluteJobPath = path.resolve(jobFilePath);

  if (!fs.existsSync(absoluteJobPath)) {
    return {
      success: false,
      url: '',
      durationMs: 0,
      status: 'failed',
      fileSizeBytes: 0,
      error: `Job file not found: ${absoluteJobPath}`,
      storageProvider: 'none',
    };
  }

  const videoEngineDir = getVideoEngineDir();
  const workspace = createTempWorkspace();
  const finalOutput = outputPath
    ? path.resolve(outputPath)
    : path.join(workspace, `render-${Date.now()}.mp4`);

  ensureDir(path.dirname(finalOutput));

  try {
    const renderResult = await spawnRender(videoEngineDir, absoluteJobPath, finalOutput);

    if (!renderResult.success) {
      return {
        success: false,
        url: '',
        durationMs: renderResult.durationMs,
        status: 'failed',
        fileSizeBytes: 0,
        error: renderResult.error,
        storageProvider: 'none',
      };
    }

    const stat = fs.statSync(finalOutput);
    const filename = path.basename(finalOutput);
    const storageKey = `videos/${new Date().toISOString().split('T')[0]}/${filename}`;
    const { url, provider } = await uploadToStorage(finalOutput, storageKey);

    return {
      success: true,
      url,
      durationMs: renderResult.durationMs,
      status: 'completed',
      fileSizeBytes: stat.size,
      storageProvider: provider,
    };
  } finally {
    // Only cleanup workspace if output was inside it
    if (!outputPath) {
      cleanupWorkspace(workspace);
    }
  }
}

/**
 * Check whether video-engine is ready to run.
 * Uses isVideoCapable() which respects VIDEO_ENGINE_ENABLED env var,
 * so it can be explicitly enabled on AWS EC2/ECS while staying off on Lambda.
 */
export function isVideoEngineReady(): { ready: boolean; issues: string[]; skipped: boolean } {
  // Remote worker mode — always ready if URL is configured
  if (process.env.VIDEO_WORKER_URL?.trim()) {
    return { ready: true, issues: [], skipped: false };
  }

  if (!isVideoCapable()) {
    return { ready: false, issues: [], skipped: true };
  }

  const videoEngineDir = getVideoEngineDir();

  // If the video-engine directory doesn't exist at all, treat as skipped
  // (e.g. Amplify deploy where video-engine is intentionally excluded)
  const renderScriptTs = path.join(videoEngineDir, 'scripts', 'render.ts');
  const renderScriptJs = path.join(videoEngineDir, 'scripts', 'render.js');
  if (!fs.existsSync(renderScriptTs) && !fs.existsSync(renderScriptJs)) {
    log.info('video-engine-local', 'Video engine not deployed on this host — skipping');
    return { ready: false, issues: [], skipped: true };
  }

  const issues: string[] = [];

  const nodeModules = path.join(videoEngineDir, 'node_modules');
  if (!fs.existsSync(nodeModules)) {
    issues.push('video-engine/node_modules not found — run: cd video-engine && npm install');
  }

  // Check FFmpeg availability
  if (process.env.FFMPEG_PATH && !fs.existsSync(process.env.FFMPEG_PATH)) {
    issues.push(`FFMPEG_PATH points to missing file: ${process.env.FFMPEG_PATH}`);
  }

  return { ready: issues.length === 0, issues, skipped: false };
}
