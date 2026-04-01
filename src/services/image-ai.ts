/**
 * AI image generation adapter.
 *
 * Supports multiple providers behind a single interface.
 * Active provider selected via IMAGE_AI_PROVIDER env variable.
 *
 * ENV variables:
 *   IMAGE_AI_PROVIDER       – 'openai' | 'stability' | 'replicate' (default: 'openai')
 *   OPENAI_API_KEY          – for DALL-E 3 / gpt-image-1
 *   OPENAI_IMAGE_MODEL      – model name (default: 'gpt-image-1')
 *   STABILITY_API_KEY       – for Stability AI (SDXL, SD3)
 *   STABILITY_MODEL         – model name (default: 'stable-diffusion-xl-1024-v1-0')
 *   REPLICATE_API_TOKEN     – for Replicate hosted models
 *   REPLICATE_IMAGE_MODEL   – model version string
 */

// ── Types ──

export type ImageProvider = 'openai' | 'stability' | 'replicate';

export interface ImageGenerationRequest {
  prompt: string;
  negative_prompt?: string;
  width: number;
  height: number;
  style?: string;
  /** Number of images to generate (default 1) */
  count?: number;
}

export interface GeneratedImage {
  url: string;
  /** base64-encoded image data, when URL is not available */
  b64_data?: string;
  width: number;
  height: number;
  provider: ImageProvider;
  model: string;
  generation_id?: string;
}

export interface ImageEditRequest {
  /** Source image URL to edit */
  source_url: string;
  prompt: string;
  /** Overlay text to render onto the image */
  overlay_text?: string;
  overlay_position?: 'top' | 'center' | 'bottom';
  width: number;
  height: number;
}

/** Platform-specific aspect ratios */
export const PLATFORM_SIZES = {
  facebook_feed: { width: 1080, height: 1080 },    // 1:1
  facebook_story: { width: 1080, height: 1920 },   // 9:16
  instagram_square: { width: 1080, height: 1080 },  // 1:1
  instagram_portrait: { width: 1080, height: 1350 }, // 4:5
  instagram_story: { width: 1080, height: 1920 },   // 9:16
  tiktok: { width: 1080, height: 1920 },            // 9:16
} as const;

export type PlatformSize = keyof typeof PLATFORM_SIZES;

// ── Config ──

function getProvider(): ImageProvider {
  const p = process.env.IMAGE_AI_PROVIDER?.trim().toLowerCase();
  if (p === 'stability' || p === 'replicate') return p;
  return 'openai';
}

function requireKey(envVar: string, label: string): string {
  const key = process.env[envVar]?.trim();
  if (!key) throw new Error(`${label}: set ${envVar} in environment`);
  return key;
}

// ── OpenAI (DALL-E 3 / gpt-image-1) ──

async function generateOpenAI(req: ImageGenerationRequest): Promise<GeneratedImage[]> {
  const apiKey = requireKey('OPENAI_API_KEY', 'OpenAI Image');
  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1';
  const count = req.count ?? 1;

  const sizeStr = `${req.width}x${req.height}`;

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: req.prompt,
      n: count,
      size: sizeStr,
      quality: 'high',
      ...(req.style ? { style: req.style } : {}),
    }),
  });
  const data: any = await res.json();
  if (data.error) throw new Error(`OpenAI Image: ${data.error.message}`);

  return (data.data ?? []).map((img: any) => ({
    url: img.url ?? '',
    b64_data: img.b64_json,
    width: req.width,
    height: req.height,
    provider: 'openai' as const,
    model,
    generation_id: data.id,
  }));
}

async function editOpenAI(req: ImageEditRequest): Promise<GeneratedImage> {
  const apiKey = requireKey('OPENAI_API_KEY', 'OpenAI Image');
  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1';

  const prompt = req.overlay_text
    ? `${req.prompt}. Add text overlay "${req.overlay_text}" at the ${req.overlay_position ?? 'bottom'} of the image.`
    : req.prompt;

  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      image: req.source_url,
      prompt,
      size: `${req.width}x${req.height}`,
    }),
  });
  const data: any = await res.json();
  if (data.error) throw new Error(`OpenAI Image Edit: ${data.error.message}`);

  const img = data.data?.[0];
  return {
    url: img?.url ?? '',
    b64_data: img?.b64_json,
    width: req.width,
    height: req.height,
    provider: 'openai',
    model,
    generation_id: data.id,
  };
}

// ── Stability AI ──

async function generateStability(req: ImageGenerationRequest): Promise<GeneratedImage[]> {
  const apiKey = requireKey('STABILITY_API_KEY', 'Stability AI');
  const model = process.env.STABILITY_MODEL?.trim() || 'stable-diffusion-xl-1024-v1-0';
  const count = req.count ?? 1;

  const res = await fetch(`https://api.stability.ai/v1/generation/${model}/text-to-image`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      text_prompts: [
        { text: req.prompt, weight: 1.0 },
        ...(req.negative_prompt ? [{ text: req.negative_prompt, weight: -1.0 }] : []),
      ],
      width: req.width,
      height: req.height,
      samples: count,
      steps: 30,
      ...(req.style ? { style_preset: req.style } : {}),
    }),
  });
  const data: any = await res.json();
  if (data.message) throw new Error(`Stability AI: ${data.message}`);

  return (data.artifacts ?? []).map((art: any) => ({
    url: '',
    b64_data: art.base64,
    width: req.width,
    height: req.height,
    provider: 'stability' as const,
    model,
    generation_id: art.seed?.toString(),
  }));
}

// ── Replicate ──

async function generateReplicate(req: ImageGenerationRequest): Promise<GeneratedImage[]> {
  const apiToken = requireKey('REPLICATE_API_TOKEN', 'Replicate');
  const model = process.env.REPLICATE_IMAGE_MODEL?.trim();
  if (!model) throw new Error('REPLICATE_IMAGE_MODEL must be set (e.g., "stability-ai/sdxl:version")');

  // Create prediction
  const res = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: model,
      input: {
        prompt: req.prompt,
        negative_prompt: req.negative_prompt ?? '',
        width: req.width,
        height: req.height,
        num_outputs: req.count ?? 1,
      },
    }),
  });
  const prediction: any = await res.json();
  if (prediction.error) throw new Error(`Replicate: ${prediction.error}`);

  // Poll for completion (max 120s)
  const predictionUrl = prediction.urls?.get || `https://api.replicate.com/v1/predictions/${prediction.id}`;
  const start = Date.now();
  while (Date.now() - start < 120_000) {
    const poll = await fetch(predictionUrl, { headers: { 'Authorization': `Bearer ${apiToken}` } });
    const status: any = await poll.json();
    if (status.status === 'succeeded') {
      return (status.output ?? []).map((url: string) => ({
        url,
        width: req.width,
        height: req.height,
        provider: 'replicate' as const,
        model,
        generation_id: prediction.id,
      }));
    }
    if (status.status === 'failed') throw new Error(`Replicate failed: ${status.error}`);
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`Replicate prediction ${prediction.id} timed out`);
}

// ── Public interface ──

export async function generateImage(req: ImageGenerationRequest): Promise<GeneratedImage[]> {
  const provider = getProvider();
  switch (provider) {
    case 'openai': return generateOpenAI(req);
    case 'stability': return generateStability(req);
    case 'replicate': return generateReplicate(req);
  }
}

export async function editImage(req: ImageEditRequest): Promise<GeneratedImage> {
  const provider = getProvider();
  switch (provider) {
    case 'openai': return editOpenAI(req);
    default: throw new Error(`Image editing not supported for provider "${provider}". Use IMAGE_AI_PROVIDER=openai.`);
  }
}

/**
 * Generate a real-estate ad image for a specific platform size.
 * Builds a prompt from property data + copy, sends to the active provider.
 */
export async function generateAdImage(
  payload: Record<string, unknown>,
  copyJson: Record<string, unknown>,
  platformSize: PlatformSize,
): Promise<GeneratedImage[]> {
  const size = PLATFORM_SIZES[platformSize];
  const title = String(payload.title_he || payload.title_en || '');
  const city = String(payload.city || '');
  const price = String(payload.price_text || '');
  const features = (payload.features as string[] || []).slice(0, 3).join(', ');

  const prompt = [
    `Professional real-estate advertisement photo for social media.`,
    `Property: ${title} in ${city}.`,
    price ? `Price: ${price}.` : '',
    features ? `Features: ${features}.` : '',
    `Style: modern, clean, high-end real-estate marketing.`,
    `Layout: ${size.width}x${size.height} ${platformSize.replace(/_/g, ' ')}.`,
    copyJson.overlay_text ? `Include text overlay: "${copyJson.overlay_text}".` : '',
  ].filter(Boolean).join(' ');

  return generateImage({
    prompt,
    negative_prompt: 'blurry, low quality, watermark, text artifacts, distorted',
    width: size.width,
    height: size.height,
  });
}

export function isConfigured(): boolean {
  const provider = getProvider();
  switch (provider) {
    case 'openai': return !!process.env.OPENAI_API_KEY?.trim();
    case 'stability': return !!process.env.STABILITY_API_KEY?.trim();
    case 'replicate': return !!(process.env.REPLICATE_API_TOKEN?.trim() && process.env.REPLICATE_IMAGE_MODEL?.trim());
  }
}
