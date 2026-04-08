/**
 * Video Ad Preset service — CRUD, default resolution, and seed data.
 */

import { v4 as uuid } from 'uuid';
import { store } from '../db/store';
import {
  VideoAdPreset,
  VideoAdPresetInput,
  VideoAdPresetInputSchema,
  GeneralSettingsSchema,
  TextSettingsSchema,
  AnimationSettingsSchema,
  AudioSettingsSchema,
  OverlaySettingsSchema,
} from '../models/video-preset';
import * as log from '../lib/logger';

// ── CRUD ──

export async function listPresets(activeOnly = false): Promise<VideoAdPreset[]> {
  return store.getVideoPresets(activeOnly);
}

export async function getPreset(id: string): Promise<VideoAdPreset | undefined> {
  return store.getVideoPreset(id);
}

export async function getPresetBySlug(slug: string): Promise<VideoAdPreset | undefined> {
  return store.getVideoPresetBySlug(slug);
}

export async function getDefaultPreset(): Promise<VideoAdPreset | undefined> {
  return store.getDefaultVideoPreset();
}

/** Resolve the best preset: explicit id → default → first active → built-in fallback. */
export async function resolvePreset(presetId?: string): Promise<VideoAdPreset> {
  if (presetId) {
    const p = await store.getVideoPreset(presetId);
    if (p) return p;
  }
  const def = await store.getDefaultVideoPreset();
  if (def) return def;
  const all = await store.getVideoPresets(true);
  if (all.length > 0) return all[0];
  // No presets in DB — seed and return default
  await seedDefaultPresets();
  return (await store.getDefaultVideoPreset())!;
}

export async function createPreset(input: VideoAdPresetInput): Promise<VideoAdPreset> {
  const validated = VideoAdPresetInputSchema.parse(input);
  const preset: VideoAdPreset = {
    id: uuid(),
    name: validated.name,
    slug: validated.slug,
    description: validated.description,
    is_active: validated.is_active ?? true,
    is_default: validated.is_default ?? false,
    general_settings: GeneralSettingsSchema.parse(validated.general_settings ?? {}),
    text_settings: TextSettingsSchema.parse(validated.text_settings ?? {}),
    animation_settings: AnimationSettingsSchema.parse(validated.animation_settings ?? {}),
    audio_settings: AudioSettingsSchema.parse(validated.audio_settings ?? {}),
    overlay_settings: OverlaySettingsSchema.parse(validated.overlay_settings ?? {}),
  };
  if (preset.is_default) await store.clearDefaultVideoPreset();
  return store.upsertVideoPreset(preset);
}

export async function updatePreset(id: string, input: Partial<VideoAdPresetInput>): Promise<VideoAdPreset> {
  const existing = await store.getVideoPreset(id);
  if (!existing) throw new Error('Preset not found');
  const merged: VideoAdPreset = {
    ...existing,
    name: input.name ?? existing.name,
    slug: input.slug ?? existing.slug,
    description: input.description ?? existing.description,
    is_active: input.is_active ?? existing.is_active,
    is_default: input.is_default ?? existing.is_default,
    general_settings: GeneralSettingsSchema.parse({ ...existing.general_settings, ...(input.general_settings ?? {}) }),
    text_settings: TextSettingsSchema.parse({ ...existing.text_settings, ...(input.text_settings ?? {}) }),
    animation_settings: AnimationSettingsSchema.parse({ ...existing.animation_settings, ...(input.animation_settings ?? {}) }),
    audio_settings: AudioSettingsSchema.parse({ ...existing.audio_settings, ...(input.audio_settings ?? {}) }),
    overlay_settings: OverlaySettingsSchema.parse({ ...existing.overlay_settings, ...(input.overlay_settings ?? {}) }),
  };
  if (merged.is_default && !existing.is_default) await store.clearDefaultVideoPreset();
  return store.upsertVideoPreset(merged);
}

export async function deletePreset(id: string): Promise<boolean> {
  return store.deleteVideoPreset(id);
}

export async function setDefault(id: string): Promise<VideoAdPreset> {
  const preset = await store.getVideoPreset(id);
  if (!preset) throw new Error('Preset not found');
  await store.clearDefaultVideoPreset();
  preset.is_default = true;
  return store.upsertVideoPreset(preset);
}

// ── Seed defaults ──

export async function seedDefaultPresets(): Promise<void> {
  const existing = await store.getVideoPresets();
  if (existing.length > 0) return; // Already seeded

  log.info('video-preset', 'Seeding default video ad presets');

  const defaults: Array<Omit<VideoAdPreset, 'created_at' | 'updated_at'>> = [
    {
      id: uuid(),
      name: 'Vertical Social',
      slug: 'vertical-social',
      description: 'TikTok / Instagram Reels / Stories (9:16)',
      is_active: true,
      is_default: true,
      general_settings: GeneralSettingsSchema.parse({
        targetPlatform: 'vertical_social',
        aspectRatio: '9:16',
        width: 1080,
        height: 1920,
        fps: 30,
        durationSeconds: 15,
        fitMode: 'cover',
        stylePreset: 'luxury',
      }),
      text_settings: TextSettingsSchema.parse({
        enabled: true,
        headlineEnabled: true,
        subheadlineEnabled: true,
        ctaEnabled: true,
        headlineFontSize: 80,
        subheadlineFontSize: 34,
        ctaFontSize: 28,
        textAlign: 'center',
        safeMarginTopPercent: 12,
        safeMarginBottomPercent: 15,
      }),
      animation_settings: AnimationSettingsSchema.parse({
        headlineAnimation: 'fade',
        subheadlineAnimation: 'fade',
        ctaAnimation: 'slide_up',
      }),
      audio_settings: AudioSettingsSchema.parse({
        musicEnabled: false,
        musicVolume: 0.3,
      }),
      overlay_settings: OverlaySettingsSchema.parse({
        gradientOverlayEnabled: true,
        gradientDirection: 'bottom_top',
        gradientOpacity: 0.4,
      }),
    },
    {
      id: uuid(),
      name: 'Square Feed',
      slug: 'square-feed',
      description: 'Facebook / Instagram feed posts (1:1)',
      is_active: true,
      is_default: false,
      general_settings: GeneralSettingsSchema.parse({
        targetPlatform: 'square_feed',
        aspectRatio: '1:1',
        width: 1080,
        height: 1080,
        fps: 30,
        durationSeconds: 15,
        fitMode: 'cover',
        stylePreset: 'modern',
      }),
      text_settings: TextSettingsSchema.parse({
        enabled: true,
        headlineEnabled: true,
        subheadlineEnabled: true,
        ctaEnabled: true,
        headlineFontSize: 64,
        subheadlineFontSize: 28,
        ctaFontSize: 24,
        textAlign: 'center',
        safeMarginTopPercent: 8,
        safeMarginBottomPercent: 12,
      }),
      animation_settings: AnimationSettingsSchema.parse({
        headlineAnimation: 'slide_up',
        subheadlineAnimation: 'fade',
        ctaAnimation: 'fade',
      }),
      audio_settings: AudioSettingsSchema.parse({}),
      overlay_settings: OverlaySettingsSchema.parse({
        gradientOverlayEnabled: true,
        gradientOpacity: 0.35,
      }),
    },
    {
      id: uuid(),
      name: 'Landscape',
      slug: 'landscape',
      description: 'YouTube / Facebook landscape ads (16:9)',
      is_active: true,
      is_default: false,
      general_settings: GeneralSettingsSchema.parse({
        targetPlatform: 'landscape',
        aspectRatio: '16:9',
        width: 1920,
        height: 1080,
        fps: 30,
        durationSeconds: 15,
        fitMode: 'cover',
        stylePreset: 'luxury',
      }),
      text_settings: TextSettingsSchema.parse({
        enabled: true,
        headlineEnabled: true,
        subheadlineEnabled: true,
        ctaEnabled: true,
        headlineFontSize: 72,
        subheadlineFontSize: 32,
        ctaFontSize: 26,
        textAlign: 'left',
        safeMarginTopPercent: 8,
        safeMarginBottomPercent: 10,
        safeMarginLeftPercent: 8,
        safeMarginRightPercent: 8,
      }),
      animation_settings: AnimationSettingsSchema.parse({
        headlineAnimation: 'slide_left',
        subheadlineAnimation: 'slide_left',
        ctaAnimation: 'fade',
      }),
      audio_settings: AudioSettingsSchema.parse({}),
      overlay_settings: OverlaySettingsSchema.parse({
        gradientOverlayEnabled: true,
        gradientDirection: 'bottom_top',
        gradientOpacity: 0.45,
      }),
    },
  ];

  for (const preset of defaults) {
    await store.upsertVideoPreset(preset);
    log.info('video-preset', `Seeded preset: ${preset.name} (${preset.slug})`);
  }
}
