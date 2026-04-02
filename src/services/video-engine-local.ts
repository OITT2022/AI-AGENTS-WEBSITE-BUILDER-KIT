/**
 * Local video-engine wrapper.
 *
 * Runs the VideoEngine (Remotion-based slideshow renderer) as an isolated
 * child process.  This wrapper does NOT touch the existing pipeline —
 * it only provides a programmatic way to trigger a local video render
 * from a job JSON file or an in-memory job object.
 *
 * No external APIs. No cloud services. Requires FFmpeg on the system PATH.
 *
 * Usage:
 *   import { renderLocalVideo, renderLocalVideoFromFile } from './video-engine-local';
 *
 *   // From an in-memory job object:
 *   const result = await renderLocalVideo(job, 'output/my-video.mp4');
 *
 *   // From an existing job JSON file:
 *   const result = await renderLocalVideoFromFile('video-engine/jobs/sample-he.json', 'output/ad.mp4');
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as log from '../lib/logger';

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

export interface LocalVideoResult {
  success: boolean;
  outputPath: string;
  durationMs: number;
  error?: string;
}

// ── Paths ──

const VIDEO_ENGINE_DIR = path.resolve(__dirname, '../../video-engine');
const RENDER_SCRIPT = path.join(VIDEO_ENGINE_DIR, 'scripts/render.ts');
const DEFAULT_OUTPUT_DIR = path.join(VIDEO_ENGINE_DIR, 'output');

// ── Helpers ──

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Spawn the video-engine render script as a child process.
 * Runs inside video-engine/ so that Remotion resolves its own node_modules.
 */
function spawnRender(jobFilePath: string, outputFilePath: string, timeoutMs = 300_000): Promise<LocalVideoResult> {
  const start = Date.now();

  return new Promise((resolve) => {
    // Ensure FFmpeg is on PATH for Remotion renderer
    const env = { ...process.env };
    const ffmpegDir = path.join(path.parse(process.cwd()).root, 'ffmpeg');
    if (fs.existsSync(path.join(ffmpegDir, 'ffmpeg.exe')) || fs.existsSync(path.join(ffmpegDir, 'ffmpeg'))) {
      env.PATH = `${ffmpegDir}${path.delimiter}${env.PATH || ''}`;
    }

    const child = execFile(
      'npx',
      ['tsx', RENDER_SCRIPT, jobFilePath, outputFilePath],
      {
        cwd: VIDEO_ENGINE_DIR,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10 MB stdout/stderr buffer
        windowsHide: true,
        env,
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - start;

        if (error) {
          const msg = stderr?.trim() || error.message;
          log.error('video-engine-local', `Render failed: ${msg}`, { durationMs });
          resolve({ success: false, outputPath: outputFilePath, durationMs, error: msg });
          return;
        }

        if (!fs.existsSync(outputFilePath)) {
          const msg = 'Render completed but output file not found';
          log.error('video-engine-local', msg, { outputPath: outputFilePath });
          resolve({ success: false, outputPath: outputFilePath, durationMs, error: msg });
          return;
        }

        log.info('video-engine-local', `Render complete: ${outputFilePath}`, { durationMs });
        resolve({ success: true, outputPath: outputFilePath, durationMs });
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

/**
 * Render a video from an in-memory job object.
 *
 * Writes a temporary job JSON, invokes video-engine, then cleans up.
 * Output is saved to the specified path (or auto-generated inside video-engine/output/).
 */
export async function renderLocalVideo(
  job: LocalVideoJob,
  outputPath?: string,
): Promise<LocalVideoResult> {
  ensureDir(DEFAULT_OUTPUT_DIR);

  const jobId = `job-${randomUUID()}`;
  const tmpJobPath = path.join(VIDEO_ENGINE_DIR, 'jobs', `${jobId}.json`);
  const finalOutput = outputPath
    ? path.resolve(outputPath)
    : path.join(DEFAULT_OUTPUT_DIR, `${job.projectId}-${job.platform}.mp4`);

  ensureDir(path.dirname(finalOutput));

  try {
    // Write temporary job file
    fs.writeFileSync(tmpJobPath, JSON.stringify(job, null, 2), 'utf8');
    log.info('video-engine-local', `Created temp job: ${tmpJobPath}`);

    const result = await spawnRender(tmpJobPath, finalOutput);
    return result;
  } finally {
    // Clean up temp job file
    try {
      if (fs.existsSync(tmpJobPath)) fs.unlinkSync(tmpJobPath);
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Render a video from an existing job JSON file.
 *
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
      outputPath: outputPath ?? '',
      durationMs: 0,
      error: `Job file not found: ${absoluteJobPath}`,
    };
  }

  ensureDir(DEFAULT_OUTPUT_DIR);
  const finalOutput = outputPath
    ? path.resolve(outputPath)
    : path.join(DEFAULT_OUTPUT_DIR, `render-${Date.now()}.mp4`);

  ensureDir(path.dirname(finalOutput));

  return spawnRender(absoluteJobPath, finalOutput);
}

/**
 * Check whether video-engine is ready to run.
 *  - render script exists
 *  - node_modules installed
 *  - ffmpeg on PATH
 */
export function isVideoEngineReady(): { ready: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!fs.existsSync(RENDER_SCRIPT)) {
    issues.push(`Render script not found: ${RENDER_SCRIPT}`);
  }

  const nodeModules = path.join(VIDEO_ENGINE_DIR, 'node_modules');
  if (!fs.existsSync(nodeModules)) {
    issues.push('video-engine/node_modules not found — run: cd video-engine && npm install');
  }

  return { ready: issues.length === 0, issues };
}
