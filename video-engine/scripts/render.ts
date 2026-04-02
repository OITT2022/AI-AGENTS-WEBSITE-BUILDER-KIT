import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {bundle} from '@remotion/bundler';
import {getCompositions, renderMedia} from '@remotion/renderer';
import {loadJobFile} from '../src/engine/loadJob';
import {planVideo} from '../src/engine/planner';
import type {JobInput} from '../src/types';

/**
 * Remotion v4 cannot load file:// URLs for assets (Audio, Img).
 * We work around this by:
 * 1. Creating a temp "public" dir with symlinks/copies of all local assets
 * 2. Passing that as publicDir to bundle()
 * 3. Rewriting asset paths to use staticFile() format: /asset-name
 */

function isLocalPath(p: string): boolean {
  return !p.startsWith('http://') && !p.startsWith('https://') && !p.startsWith('data:');
}

function prepareAssets(input: JobInput): { publicDir: string; rewritten: JobInput } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 've-assets-'));
  let counter = 0;

  const mapPath = (filePath: string): string => {
    if (!isLocalPath(filePath)) return filePath;
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) {
      console.warn(`Asset not found: ${absPath}`);
      return filePath;
    }
    const ext = path.extname(absPath);
    const key = `asset-${counter++}${ext}`;
    fs.copyFileSync(absPath, path.join(tmpDir, key));
    // Remotion staticFile() resolves to /public/<key> from the bundle
    return key;
  };

  const rewritten: JobInput = {
    ...input,
    images: input.images.map((img) => ({
      ...img,
      src: mapPath(img.src),
    })),
    logo: input.logo
      ? {...input.logo, src: mapPath(input.logo.src)}
      : undefined,
    music: input.music
      ? {...input.music, src: mapPath(input.music.src)}
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

  // Load and validate the job
  const rawInput = loadJobFile(jobPath);

  // Prepare local assets for Remotion (copy to temp public dir)
  const {publicDir, rewritten} = prepareAssets(rawInput);

  try {
    const video = planVideo(rewritten);

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
      outputLocation: outputPath,
      inputProps: {video},
    });

    console.log(`Rendered video to ${outputPath}`);
  } finally {
    // Clean up temp public dir
    try {
      fs.rmSync(publicDir, {recursive: true, force: true});
    } catch {
      // ignore cleanup errors
    }
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
