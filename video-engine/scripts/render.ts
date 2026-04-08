import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import http from 'node:http';
import {bundle} from '@remotion/bundler';
import {getCompositions, renderMedia} from '@remotion/renderer';
import {loadJobFile} from '../src/engine/loadJob';
import {planVideo} from '../src/engine/planner';
import type {JobInput} from '../src/types';

/**
 * Remotion v4 cannot load file:// URLs for assets (Audio, Img).
 * We work around this by:
 * 1. Creating a temp "public" dir with copies of all local/remote assets
 * 2. Passing that as publicDir to bundle()
 * 3. Rewriting asset paths to use staticFile() format: /asset-name
 */

function isLocalPath(p: string): boolean {
  return !p.startsWith('http://') && !p.startsWith('https://') && !p.startsWith('data:');
}

/** Download a remote URL to a local file. Follows redirects (up to 5). */
function downloadFile(url: string, dest: string, maxRedirects = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error(`Too many redirects for ${url}`));
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 60_000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).toString();
        downloadFile(redirectUrl, dest, maxRedirects - 1).then(resolve, reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`Download failed: HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const stream = fs.createWriteStream(dest);
      res.pipe(stream);
      stream.on('finish', () => { stream.close(); resolve(); });
      stream.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Download timeout for ${url}`)); });
  });
}

/** Guess file extension from a URL or default to .jpg */
function extFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname);
    if (ext && ext.length <= 5) return ext;
  } catch { /* ignore */ }
  return '.jpg';
}

async function prepareAssets(input: JobInput): Promise<{ publicDir: string; rewritten: JobInput }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 've-assets-'));
  let counter = 0;

  const mapPath = async (filePath: string): Promise<string> => {
    const ext = isLocalPath(filePath) ? path.extname(filePath) : extFromUrl(filePath);
    const key = `asset-${counter++}${ext || '.bin'}`;
    const destPath = path.join(tmpDir, key);

    if (isLocalPath(filePath)) {
      const absPath = path.resolve(filePath);
      if (!fs.existsSync(absPath)) {
        console.warn(`Asset not found: ${absPath}`);
        return filePath;
      }
      fs.copyFileSync(absPath, destPath);
    } else {
      // Download remote asset to temp dir
      console.log(`Downloading asset: ${filePath}`);
      try {
        await downloadFile(filePath, destPath);
        const stat = fs.statSync(destPath);
        if (stat.size === 0) {
          console.warn(`Downloaded empty file from ${filePath}`);
          return filePath;
        }
        console.log(`Downloaded ${(stat.size / 1024).toFixed(1)} KB → ${key}`);
      } catch (err) {
        console.warn(`Failed to download ${filePath}: ${(err as Error).message}`);
        return filePath; // fall back to original URL
      }
    }
    return key;
  };

  const rewritten: JobInput = {
    ...input,
    images: await Promise.all(input.images.map(async (img) => ({
      ...img,
      src: await mapPath(img.src),
    }))),
    logo: input.logo
      ? {...input.logo, src: await mapPath(input.logo.src)}
      : undefined,
    music: input.music
      ? {...input.music, src: await mapPath(input.music.src)}
      : undefined,
  };

  return {publicDir: tmpDir, rewritten};
}

const main = async () => {
  const [, , jobArg, outArg] = process.argv;

  if (!jobArg || !outArg) {
    console.error('Usage: npm run render -- <job.json> <output.mp4>');
    process.exit(1);
  }

  const jobPath = path.resolve(jobArg);
  const outputPath = path.resolve(outArg);

  console.log(`[render] Loading job: ${jobPath}`);
  console.log(`[render] Output: ${outputPath}`);

  // Load and validate the job
  const rawInput = loadJobFile(jobPath);

  // Prepare local + remote assets for Remotion (download/copy to temp public dir)
  console.log(`[render] Preparing ${rawInput.images.length} images...`);
  const {publicDir, rewritten} = await prepareAssets(rawInput);
  console.log(`[render] Assets staged in: ${publicDir}`);

  try {
    const video = planVideo(rewritten);

    // Configure FFmpeg path for Remotion if specified via env
    const renderOptions: Record<string, unknown> = {};
    if (process.env.FFMPEG_PATH) {
      renderOptions.ffmpegExecutable = process.env.FFMPEG_PATH;
    }
    if (process.env.FFPROBE_PATH) {
      renderOptions.ffprobeExecutable = process.env.FFPROBE_PATH;
    }

    // ── Encoding quality / compression settings ──
    // Priority: job preset > env vars > defaults
    const jobPreset = rawInput.preset as Record<string, unknown> | undefined;
    const encoding = (jobPreset as any)?.encoding as Record<string, unknown> | undefined;
    const crf = (encoding?.crf as number) ?? parseInt(process.env.VIDEO_CRF || '28', 10);
    const x264Preset = ((encoding?.x264Preset as string) ?? process.env.VIDEO_PRESET ?? 'fast') as 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow';
    const audioBitrate = ((encoding?.audioBitrate as string) ?? process.env.VIDEO_AUDIO_BITRATE ?? '128k') as `${number}k`;

    console.log(`[render] Encoding: crf=${crf} preset=${x264Preset} audio=${audioBitrate}`);

    console.log(`[render] Bundling Remotion composition...`);
    const bundled = await bundle({
      entryPoint: path.resolve('src/index.ts'),
      publicDir,
    });

    const compositions = await getCompositions(bundled, {
      inputProps: {video},
    });

    const composition = compositions.find((c) => c.id === 'SlideshowAd');

    if (!composition) {
      throw new Error('Composition SlideshowAd not found.');
    }

    console.log(`[render] Rendering ${video.totalFrames} frames at ${video.fps}fps (${video.width}x${video.height})...`);
    await renderMedia({
      composition: {
        ...composition,
        width: video.width,
        height: video.height,
        fps: video.fps,
        durationInFrames: video.totalFrames,
      },
      serveUrl: bundled,
      codec: 'h264',
      crf,
      x264Preset,
      pixelFormat: 'yuv420p',
      audioCodec: 'aac',
      audioBitrate,
      outputLocation: outputPath,
      inputProps: {video},
      ...renderOptions,
    });

    // Validate output
    const outputStat = fs.statSync(outputPath);
    console.log(`[render] Success: ${outputPath} (${(outputStat.size / 1024 / 1024).toFixed(2)} MB)`);
  } finally {
    // Clean up temp public dir
    try {
      fs.rmSync(publicDir, {recursive: true, force: true});
      console.log(`[render] Cleaned up temp assets`);
    } catch {
      // ignore cleanup errors
    }
  }
};

main().catch((error) => {
  console.error('[render] FATAL:', error);
  process.exit(1);
});
