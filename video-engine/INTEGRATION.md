# VideoEngine — Integration Guide

## Overview

VideoEngine is a **local-only** slideshow video renderer based on [Remotion](https://remotion.dev/).  
It takes a JSON job definition (images, text, logo, music) and outputs an MP4 file.  
**No external APIs. No cloud services. No AI providers.**

---

## Prerequisites

| Requirement | Details |
|-------------|---------|
| **Node.js** | v20+ recommended |
| **FFmpeg** | Must be installed and available on system `PATH` |
| **npm** | For installing dependencies |

### Verify FFmpeg

```bash
ffmpeg -version
```

If not installed — download from https://ffmpeg.org/download.html and add to PATH.

On this system, FFmpeg is installed at `C:\ffmpeg\ffmpeg.exe`.  
The wrapper (`src/services/video-engine-local.ts`) automatically adds `C:\ffmpeg` to PATH for child processes.

---

## Installation

VideoEngine has its **own** `package.json` — install separately from the main project:

```bash
cd video-engine
npm install
```

This does **not** affect the main project's `node_modules` or `package.json`.

---

## Manual Usage (CLI)

### Render a specific job file

```bash
cd video-engine
npm run render -- jobs/sample-he.json output/my-video.mp4
```

### Render the bundled Hebrew sample

```bash
cd video-engine
npm run render:sample
```

Output: `video-engine/output/sample-he.mp4`

### Preview in Remotion Studio (interactive)

```bash
cd video-engine
npm run dev
```

### Type-check only

```bash
cd video-engine
npm run check
```

---

## Programmatic Usage (from main project)

A thin wrapper exists at `src/services/video-engine-local.ts`.  
It spawns VideoEngine as an **isolated child process** — no shared dependencies.

```typescript
import {
  renderLocalVideo,
  renderLocalVideoFromFile,
  isVideoEngineReady,
} from './services/video-engine-local';

// 1. Check readiness
const { ready, issues } = isVideoEngineReady();
if (!ready) console.warn('VideoEngine issues:', issues);

// 2. Render from an existing job file
const result = await renderLocalVideoFromFile(
  'video-engine/jobs/sample-he.json',
  'video-engine/output/ad.mp4',
);

// 3. Render from an in-memory job object
const result2 = await renderLocalVideo({
  projectId: 'proj-123',
  platform: 'instagram-reel',
  language: 'he',
  rtl: true,
  style: 'luxury',
  title: 'כותרת הפרויקט',
  images: [{ src: '/absolute/path/to/image.jpg' }],
});
```

### Return type

```typescript
{
  success: boolean;
  outputPath: string;   // absolute path to the rendered MP4
  durationMs: number;   // render wall-clock time
  error?: string;       // error message if success === false
}
```

---

## Job JSON Format

Place job files in `video-engine/jobs/`. Full schema:

```jsonc
{
  "projectId": "string (required)",
  "platform": "tiktok | instagram-reel | facebook-reel | facebook-feed | square",
  "language": "he | en | ar | fr | de",
  "rtl": true,                          // optional, auto-detected for he/ar
  "style": "luxury | modern | energetic | minimal",
  "fps": 30,                            // optional, 1–60, default 30
  "title": "string (required)",
  "subtitle": "string (optional)",
  "cta": "string (optional)",
  "outroTitle": "string (optional)",
  "outroSubtitle": "string (optional)",
  "themeColor": "#hex (optional)",
  "textColor": "#hex (optional)",
  "backgroundColor": "#hex (optional)",
  "fitMode": "cover | contain",         // optional, default cover
  "images": [                           // at least 1 required
    {
      "src": "../assets/samples/property-1.jpg",
      "caption": "optional overlay text",
      "holdSeconds": 2.8                 // optional, default 2.8
    }
  ],
  "logo": {                             // optional
    "src": "../assets/logos/logo-example.png",
    "width": 180,
    "position": "top-right"
  },
  "music": {                            // optional
    "src": "../assets/music/background-track.wav",
    "volume": 0.6,
    "trimStartSeconds": 0,
    "trimEndSeconds": 30
  }
}
```

Image/logo/music `src` paths are resolved **relative to the job file location**.

---

## Output Location

All rendered videos are saved to `video-engine/output/`.  
This directory is gitignored (only `.gitkeep` is tracked).

When using the programmatic wrapper, you can specify a custom output path.

---

## Pre-Integration Checklist

Before connecting VideoEngine to the production pipeline, verify:

- [ ] `ffmpeg -version` works on the target machine
- [ ] `cd video-engine && npm install` completes without errors
- [ ] `npm run render:sample` produces `output/sample-he.mp4`
- [ ] The output MP4 plays correctly (correct dimensions, text, audio)
- [ ] `npm run build` in the **main project** still passes
- [ ] `npm run dev` in the **main project** still starts normally
- [ ] The wrapper `isVideoEngineReady()` returns `{ ready: true }`

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| FFmpeg not installed | Render fails | `isVideoEngineReady()` checks for it; clear error message |
| video-engine/node_modules missing | Render fails | Wrapper checks for node_modules before spawning |
| Long render time (30s–2min) | Blocks caller | Wrapper runs as child process with 5-min timeout |
| Remotion version conflict | Build errors in video-engine | Separate package.json prevents conflicts |
| Disk space (large MP4 output) | Fills disk | Output dir should be cleaned periodically |
| Path issues on Windows | Render fails | All paths use `path.resolve()` for cross-platform safety |

---

## How to Roll Back

To remove VideoEngine integration completely:

1. Delete `src/services/video-engine-local.ts`
2. In `src/server.ts`: remove the `import * as videoEngineLocal` line
3. In `src/server.ts`: remove the `app.use('/video-output', ...)` static route line
4. In `src/server.ts`: remove the "Phase 4: Local VideoEngine slideshow" block and `local_video` from the persist/response objects
5. In `public/campaign.html`: remove the `localVideo` display block
6. Run `npm run build` to verify

The `video-engine/` directory can remain as a standalone CLI tool or be deleted entirely.

---

## Next Steps (Future — Not Implemented Yet)

When ready to connect to the production pipeline:

1. **Add a route** (e.g. `POST /api/video-engine/render`) that accepts a job JSON and calls `renderLocalVideo()`
2. **Wire into pipeline.ts** — after creative generation, optionally call VideoEngine for slideshow ads
3. **Store output metadata** in the `media_derivatives` or `media_assets` DB table
4. **Add to approval workflow** — generated videos go through the same QA/approval flow
5. **Queue support** — when BullMQ is implemented, add a `video-render` queue for async processing

Each step should be done incrementally with its own testing cycle.

---

## Platform Output Dimensions

| Platform | Width | Height | Aspect |
|----------|-------|--------|--------|
| tiktok | 1080 | 1920 | 9:16 |
| instagram-reel | 1080 | 1920 | 9:16 |
| facebook-reel | 1080 | 1920 | 9:16 |
| facebook-feed | 1080 | 1350 | 4:5 |
| square | 1080 | 1080 | 1:1 |
