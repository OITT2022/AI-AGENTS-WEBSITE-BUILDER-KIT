/**
 * AI video generation adapter.
 *
 * Supports multiple providers behind a single interface.
 * Active provider selected via VIDEO_AI_PROVIDER env variable.
 *
 * ENV variables:
 *   VIDEO_AI_PROVIDER       – 'runway' | 'pika' | 'replicate' | 'creatomate' (default: 'runway')
 *   RUNWAY_API_KEY          – for Runway Gen-3/Gen-4
 *   RUNWAY_MODEL            – model name (default: 'gen3a_turbo')
 *   PIKA_API_KEY            – for Pika Labs API
 *   REPLICATE_API_TOKEN     – for Replicate hosted video models (shared with image-ai)
 *   REPLICATE_VIDEO_MODEL   – Replicate video model version string
 *   CREATOMATE_API_KEY      – for Creatomate template-based video rendering
 */

// ── Types ──

export type VideoProvider = 'runway' | 'pika' | 'replicate' | 'creatomate';

export interface VideoGenerationRequest {
  /** Text prompt describing the video */
  prompt: string;
  /** Source image URL to animate (image-to-video) */
  source_image_url?: string;
  /** Duration in seconds (default 5) */
  duration_sec?: number;
  /** Aspect ratio (default '9:16') */
  aspect_ratio?: '16:9' | '9:16' | '1:1';
}

export interface GeneratedVideo {
  url: string;
  duration_sec: number;
  width: number;
  height: number;
  provider: VideoProvider;
  model: string;
  generation_id: string;
}

export interface VideoFromTimelineRequest {
  /** Reel timeline from creative.ts genReelTimeline output */
  timeline: ReelTimeline;
  /** Template ID for Creatomate (if using template-based rendering) */
  template_id?: string;
}

export interface ReelTimeline {
  total_duration_sec: number;
  aspect_ratio: string;
  scenes: ReelScene[];
  music_suggestion?: string;
  all_video_sources: string[];
  all_image_sources: string[];
}

export interface ReelScene {
  scene: number;
  start_sec: number;
  duration_sec: number;
  type: string;
  source: string | null;
  overlay_text: string;
  transition: string;
}

export interface VideoCompositeResult {
  url: string;
  duration_sec: number;
  thumbnail_url?: string;
  provider: VideoProvider;
  render_id: string;
}

// ── Config ──

function getProvider(): VideoProvider {
  const p = process.env.VIDEO_AI_PROVIDER?.trim().toLowerCase();
  if (p === 'pika' || p === 'replicate' || p === 'creatomate') return p;
  return 'runway';
}

function requireKey(envVar: string, label: string): string {
  const key = process.env[envVar]?.trim();
  if (!key) throw new Error(`${label}: set ${envVar} in environment`);
  return key;
}

const ASPECT_DIMENSIONS = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
} as const;

// ── Runway Gen-3/Gen-4 ──

async function generateRunway(req: VideoGenerationRequest): Promise<GeneratedVideo> {
  const apiKey = requireKey('RUNWAY_API_KEY', 'Runway');
  const model = process.env.RUNWAY_MODEL?.trim() || 'gen4_turbo';
  const duration = req.duration_sec ?? 5;
  const ratio = req.aspect_ratio ?? '9:16';

  // Runway uses pixel ratio format (width:height)
  const ratioMap: Record<string, string> = {
    '16:9': '1280:720', '9:16': '720:1280', '1:1': '1080:1080',
  };
  const runwayRatio = ratioMap[ratio] || '1280:720';

  const body: Record<string, unknown> = {
    model,
    promptText: req.prompt,
    duration,
    ratio: runwayRatio,
  };
  if (req.source_image_url) {
    body.promptImage = req.source_image_url;
  }

  // Start generation
  const payload = JSON.stringify(body);
  const res = await fetch('https://api.dev.runwayml.com/v1/image_to_video', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Runway-Version': '2024-11-06' },
    body: payload,
  });
  const rawText = await res.text();
  let data: any;
  try { data = JSON.parse(rawText); } catch { throw new Error(`Runway: HTTP ${res.status} — ${rawText.slice(0, 300)}`); }
  if (!res.ok || data.error) throw new Error(`Runway ${res.status}: ${rawText.slice(0, 500)}`);

  const taskId = data.id;

  // Poll for completion (max 5 min for video)
  const start = Date.now();
  while (Date.now() - start < 300_000) {
    const poll = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'X-Runway-Version': '2024-11-06' },
    });
    const status: any = await poll.json();
    if (status.status === 'SUCCEEDED') {
      const dims = ASPECT_DIMENSIONS[ratio] ?? ASPECT_DIMENSIONS['9:16'];
      return {
        url: status.output?.[0] ?? '',
        duration_sec: duration,
        width: dims.width,
        height: dims.height,
        provider: 'runway',
        model,
        generation_id: taskId,
      };
    }
    if (status.status === 'FAILED') throw new Error(`Runway failed: ${status.failure ?? 'unknown error'}`);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Runway task ${taskId} timed out`);
}

// ── Pika Labs ──

async function generatePika(req: VideoGenerationRequest): Promise<GeneratedVideo> {
  const apiKey = requireKey('PIKA_API_KEY', 'Pika');
  const duration = req.duration_sec ?? 5;
  const ratio = req.aspect_ratio ?? '9:16';

  const body: Record<string, unknown> = {
    prompt: req.prompt,
    duration,
    aspect_ratio: ratio,
  };
  if (req.source_image_url) body.image_url = req.source_image_url;

  const res = await fetch('https://api.pika.art/v1/generate', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data: any = await res.json();
  if (data.error) throw new Error(`Pika: ${data.error.message || data.error}`);

  const generationId = data.id ?? data.generation_id;

  // Poll for completion
  const start = Date.now();
  while (Date.now() - start < 300_000) {
    const poll = await fetch(`https://api.pika.art/v1/generate/${generationId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const status: any = await poll.json();
    if (status.status === 'completed' || status.status === 'succeeded') {
      const dims = ASPECT_DIMENSIONS[ratio] ?? ASPECT_DIMENSIONS['9:16'];
      return {
        url: status.video_url ?? status.output?.url ?? '',
        duration_sec: duration,
        width: dims.width,
        height: dims.height,
        provider: 'pika',
        model: 'pika-v2',
        generation_id: generationId,
      };
    }
    if (status.status === 'failed') throw new Error(`Pika failed: ${status.error ?? 'unknown'}`);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Pika generation ${generationId} timed out`);
}

// ── Replicate ──

async function generateReplicate(req: VideoGenerationRequest): Promise<GeneratedVideo> {
  const apiToken = requireKey('REPLICATE_API_TOKEN', 'Replicate');
  const model = process.env.REPLICATE_VIDEO_MODEL?.trim();
  if (!model) throw new Error('REPLICATE_VIDEO_MODEL must be set');

  const duration = req.duration_sec ?? 5;
  const ratio = req.aspect_ratio ?? '9:16';
  const input: Record<string, unknown> = {
    prompt: req.prompt,
    duration,
    aspect_ratio: ratio,
  };
  if (req.source_image_url) input.image = req.source_image_url;

  const res = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: model, input }),
  });
  const prediction: any = await res.json();
  if (prediction.error) throw new Error(`Replicate Video: ${prediction.error}`);

  const predictionUrl = prediction.urls?.get || `https://api.replicate.com/v1/predictions/${prediction.id}`;
  const start = Date.now();
  while (Date.now() - start < 300_000) {
    const poll = await fetch(predictionUrl, { headers: { 'Authorization': `Bearer ${apiToken}` } });
    const status: any = await poll.json();
    if (status.status === 'succeeded') {
      const output = Array.isArray(status.output) ? status.output[0] : status.output;
      const dims = ASPECT_DIMENSIONS[ratio] ?? ASPECT_DIMENSIONS['9:16'];
      return {
        url: output ?? '',
        duration_sec: duration,
        width: dims.width,
        height: dims.height,
        provider: 'replicate',
        model,
        generation_id: prediction.id,
      };
    }
    if (status.status === 'failed') throw new Error(`Replicate failed: ${status.error}`);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Replicate prediction ${prediction.id} timed out`);
}

// ── Creatomate (template-based video rendering) ──

async function renderCreatomate(req: VideoFromTimelineRequest): Promise<VideoCompositeResult> {
  const apiKey = requireKey('CREATOMATE_API_KEY', 'Creatomate');
  const templateId = req.template_id;
  if (!templateId) throw new Error('Creatomate requires a template_id');

  // Map reel timeline to Creatomate modifications
  const modifications: Record<string, string> = {};
  for (const scene of req.timeline.scenes) {
    const prefix = `scene_${scene.scene}`;
    if (scene.source) modifications[`${prefix}_media`] = scene.source;
    if (scene.overlay_text) modifications[`${prefix}_text`] = scene.overlay_text;
  }

  const res = await fetch('https://api.creatomate.com/v1/renders', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      template_id: templateId,
      modifications,
    }]),
  });
  const data: any = await res.json();
  if (data.error) throw new Error(`Creatomate: ${data.error}`);
  const render = Array.isArray(data) ? data[0] : data;
  const renderId = render.id;

  // Poll for completion
  const start = Date.now();
  while (Date.now() - start < 300_000) {
    const poll = await fetch(`https://api.creatomate.com/v1/renders/${renderId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const status: any = await poll.json();
    if (status.status === 'succeeded') {
      return {
        url: status.url,
        duration_sec: req.timeline.total_duration_sec,
        thumbnail_url: status.snapshot_url,
        provider: 'creatomate',
        render_id: renderId,
      };
    }
    if (status.status === 'failed') throw new Error(`Creatomate render failed: ${status.error_message ?? 'unknown'}`);
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error(`Creatomate render ${renderId} timed out`);
}

// ── Public interface ──

/** Generate a short video clip from a text prompt (optionally with a source image). */
export async function generateVideo(req: VideoGenerationRequest): Promise<GeneratedVideo> {
  const provider = getProvider();
  switch (provider) {
    case 'runway': return generateRunway(req);
    case 'pika': return generatePika(req);
    case 'replicate': return generateReplicate(req);
    case 'creatomate': throw new Error('Use renderVideoFromTimeline() for Creatomate');
  }
}

/** Generate an image-to-video clip: animate a still property photo. */
export async function animateImage(
  imageUrl: string,
  prompt: string,
  durationSec = 5,
  aspectRatio: '16:9' | '9:16' | '1:1' = '9:16',
): Promise<GeneratedVideo> {
  return generateVideo({
    prompt,
    source_image_url: imageUrl,
    duration_sec: durationSec,
    aspect_ratio: aspectRatio,
  });
}

/**
 * Render a full reel video from a timeline spec (output of genReelTimeline).
 * Uses Creatomate for template-based rendering, or falls back to generating
 * individual clips and returning them for local FFmpeg compositing.
 */
export async function renderVideoFromTimeline(
  req: VideoFromTimelineRequest,
): Promise<VideoCompositeResult> {
  const provider = getProvider();
  if (provider === 'creatomate') {
    return renderCreatomate(req);
  }
  // For AI providers: generate a clip from each scene's source image, return
  // the clips for external compositing (FFmpeg). This is a partial render.
  const clips: GeneratedVideo[] = [];
  for (const scene of req.timeline.scenes) {
    if (!scene.source) continue;
    const clip = await generateVideo({
      prompt: `Real estate property scene: ${scene.overlay_text}. Style: cinematic, smooth camera movement.`,
      source_image_url: scene.source,
      duration_sec: scene.duration_sec,
      aspect_ratio: (req.timeline.aspect_ratio as '9:16' | '16:9' | '1:1') ?? '9:16',
    });
    clips.push(clip);
  }
  if (clips.length === 0) throw new Error('No scenes with source media to render');
  return {
    url: clips[0].url, // First clip; full compositing needs FFmpeg
    duration_sec: req.timeline.total_duration_sec,
    provider,
    render_id: clips[0].generation_id,
  };
}

/**
 * Build a real-estate ad video from property data + timeline.
 * High-level helper that selects the best approach per provider.
 */
export async function generateAdVideo(
  payload: Record<string, unknown>,
  timeline: ReelTimeline,
  templateId?: string,
): Promise<VideoCompositeResult> {
  const provider = getProvider();
  // Creatomate with template: best for consistent branded output
  if (provider === 'creatomate' && templateId) {
    return renderVideoFromTimeline({ timeline, template_id: templateId });
  }
  // AI provider: animate the hero image as a single clip
  const heroImage = timeline.all_image_sources[0];
  if (heroImage) {
    const title = String(payload.title_he || payload.title_en || '');
    const city = String(payload.city || '');
    const price = String(payload.price_text || '');
    const clip = await animateImage(
      heroImage,
      `Cinematic real estate video of ${title} in ${city}. Price: ${price}. Smooth drone-style camera movement, golden hour lighting.`,
      Math.min(timeline.total_duration_sec, 10),
      (timeline.aspect_ratio as '9:16') ?? '9:16',
    );
    return {
      url: clip.url,
      duration_sec: clip.duration_sec,
      provider: clip.provider,
      render_id: clip.generation_id,
    };
  }
  throw new Error('No source images available for video generation');
}

export function isConfigured(): boolean {
  const provider = getProvider();
  switch (provider) {
    case 'runway': return !!process.env.RUNWAY_API_KEY?.trim();
    case 'pika': return !!process.env.PIKA_API_KEY?.trim();
    case 'replicate': return !!(process.env.REPLICATE_API_TOKEN?.trim() && process.env.REPLICATE_VIDEO_MODEL?.trim());
    case 'creatomate': return !!process.env.CREATOMATE_API_KEY?.trim();
  }
}
