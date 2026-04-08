/**
 * Video Ad Preset — domain model and Zod validation schemas.
 *
 * A preset defines every visual, audio, and encoding parameter for rendering
 * a social-media video ad.  Settings are split into five logical sections
 * stored as JSONB columns in the `video_ad_presets` table.
 */

import { z } from 'zod';

// ── Enums ──

export const TargetPlatform = z.enum(['vertical_social', 'square_feed', 'landscape', 'custom']);
export const AspectRatio = z.enum(['9:16', '1:1', '16:9', 'custom']);
export const BitrateMode = z.enum(['auto', 'cbr', 'vbr']);
export const FitMode = z.enum(['cover', 'contain', 'blur_fill']);
export const TransitionType = z.enum(['none', 'fade', 'slide', 'wipe']);
export const TextAlign = z.enum(['left', 'center', 'right']);
export const TextCaseMode = z.enum(['none', 'uppercase', 'lowercase']);
export const TextAnimation = z.enum(['none', 'fade', 'slide_up', 'slide_left']);
export const LogoPosition = z.enum(['top_left', 'top_right', 'bottom_left', 'bottom_right', 'center']);
export const GradientDirection = z.enum(['top_bottom', 'bottom_top']);
export const BadgePosition = z.enum(['top_left', 'top_right', 'bottom_left', 'bottom_right']);
export const BadgeStyle = z.enum(['minimal', 'luxury', 'bold']);

// ── General Settings ──

export const GeneralSettingsSchema = z.object({
  targetPlatform: TargetPlatform.default('vertical_social'),
  aspectRatio: AspectRatio.default('9:16'),
  width: z.number().int().min(320).max(3840).default(1080),
  height: z.number().int().min(320).max(3840).default(1920),
  fps: z.number().int().min(15).max(60).default(30),
  durationSeconds: z.number().min(5).max(120).default(15),
  introDurationSeconds: z.number().min(0).max(10).default(1.4),
  outroDurationSeconds: z.number().min(0).max(10).default(1.8),
  imageDurationSeconds: z.number().min(0.5).max(30).default(2.8),
  videoCodec: z.string().default('h264'),
  audioCodec: z.string().default('aac'),
  bitrateMode: BitrateMode.default('auto'),
  videoBitrate: z.string().optional(), // e.g. '5M'
  audioBitrate: z.string().default('128k'),
  crf: z.number().int().min(0).max(51).default(28),
  encodingPreset: z.string().default('fast'),
  outputFormat: z.literal('mp4').default('mp4'),
  backgroundColor: z.string().default('#0f0f10'),
  fitMode: FitMode.default('cover'),
  transitionType: TransitionType.default('fade'),
  transitionDurationMs: z.number().int().min(0).max(3000).default(300),
  stylePreset: z.enum(['luxury', 'modern', 'energetic', 'minimal']).default('luxury'),
});
export type GeneralSettings = z.infer<typeof GeneralSettingsSchema>;

// ── Text Settings ──

export const TextSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  headlineEnabled: z.boolean().default(true),
  subheadlineEnabled: z.boolean().default(true),
  ctaEnabled: z.boolean().default(true),
  fontFamily: z.string().default('sans-serif'),
  fontFilePath: z.string().optional(),
  headlineFontSize: z.number().int().min(8).max(200).default(80),
  subheadlineFontSize: z.number().int().min(8).max(200).default(34),
  ctaFontSize: z.number().int().min(8).max(200).default(28),
  fontColor: z.string().default('#ffffff'),
  strokeColor: z.string().default('#000000'),
  strokeWidth: z.number().min(0).max(20).default(0),
  shadowEnabled: z.boolean().default(true),
  shadowColor: z.string().default('rgba(0,0,0,0.5)'),
  shadowX: z.number().default(0),
  shadowY: z.number().default(4),
  backgroundBoxEnabled: z.boolean().default(false),
  backgroundBoxColor: z.string().default('rgba(0,0,0,0.6)'),
  backgroundBoxOpacity: z.number().min(0).max(1).default(0.6),
  lineSpacing: z.number().min(0.5).max(3).default(1.2),
  textAlign: TextAlign.default('center'),
  maxHeadlineLines: z.number().int().min(1).max(5).default(2),
  maxSubheadlineLines: z.number().int().min(1).max(5).default(2),
  maxCtaLines: z.number().int().min(1).max(3).default(1),
  textCaseMode: TextCaseMode.default('none'),
  safeMarginTopPercent: z.number().min(0).max(50).default(10),
  safeMarginBottomPercent: z.number().min(0).max(50).default(10),
  safeMarginLeftPercent: z.number().min(0).max(50).default(5),
  safeMarginRightPercent: z.number().min(0).max(50).default(5),
});
export type TextSettings = z.infer<typeof TextSettingsSchema>;

// ── Animation Settings ──

export const AnimationSettingsSchema = z.object({
  headlineAnimation: TextAnimation.default('fade'),
  subheadlineAnimation: TextAnimation.default('fade'),
  ctaAnimation: TextAnimation.default('slide_up'),
  headlineInDurationMs: z.number().int().min(0).max(3000).default(400),
  headlineOutDurationMs: z.number().int().min(0).max(3000).default(300),
  subheadlineInDurationMs: z.number().int().min(0).max(3000).default(400),
  subheadlineOutDurationMs: z.number().int().min(0).max(3000).default(300),
  ctaInDurationMs: z.number().int().min(0).max(3000).default(500),
  ctaOutDurationMs: z.number().int().min(0).max(3000).default(300),
  headlineStartMs: z.number().int().min(0).default(200),
  headlineEndMs: z.number().int().min(0).default(0), // 0 = end of scene
  subheadlineStartMs: z.number().int().min(0).default(600),
  subheadlineEndMs: z.number().int().min(0).default(0),
  ctaStartMs: z.number().int().min(0).default(1000),
  ctaEndMs: z.number().int().min(0).default(0),
});
export type AnimationSettings = z.infer<typeof AnimationSettingsSchema>;

// ── Audio Settings ──

export const AudioSettingsSchema = z.object({
  musicEnabled: z.boolean().default(false),
  musicVolume: z.number().min(0).max(1).default(0.3),
  musicFadeInMs: z.number().int().min(0).max(5000).default(500),
  musicFadeOutMs: z.number().int().min(0).max(5000).default(1000),
  musicTrimStartMs: z.number().int().min(0).default(0),
  musicTrimEndMs: z.number().int().min(0).default(0), // 0 = auto
  musicLoop: z.boolean().default(true),
  voiceoverEnabled: z.boolean().default(false),
  voiceoverVolume: z.number().min(0).max(1).default(1.0),
  duckingEnabled: z.boolean().default(false),
  duckingLevel: z.number().min(0).max(1).default(0.2),
  normalizeAudio: z.boolean().default(false),
});
export type AudioSettings = z.infer<typeof AudioSettingsSchema>;

// ── Overlay Settings ──

export const OverlaySettingsSchema = z.object({
  logoEnabled: z.boolean().default(false),
  logoPosition: LogoPosition.default('top_right'),
  logoWidth: z.number().int().min(20).max(500).default(140),
  logoHeight: z.number().int().min(0).max(500).default(0), // 0 = auto aspect
  logoOpacity: z.number().min(0).max(1).default(1.0),
  watermarkEnabled: z.boolean().default(false),
  watermarkText: z.string().default(''),
  watermarkOpacity: z.number().min(0).max(1).default(0.3),
  gradientOverlayEnabled: z.boolean().default(true),
  gradientDirection: GradientDirection.default('bottom_top'),
  gradientOpacity: z.number().min(0).max(1).default(0.4),
  propertyBadgeEnabled: z.boolean().default(false),
  propertyBadgePosition: BadgePosition.default('top_left'),
  propertyBadgeStyle: BadgeStyle.default('luxury'),
});
export type OverlaySettings = z.infer<typeof OverlaySettingsSchema>;

// ── Full Preset ──

export const VideoAdPresetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/),
  description: z.string().max(500).optional(),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
  general_settings: GeneralSettingsSchema,
  text_settings: TextSettingsSchema,
  animation_settings: AnimationSettingsSchema,
  audio_settings: AudioSettingsSchema,
  overlay_settings: OverlaySettingsSchema,
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type VideoAdPreset = z.infer<typeof VideoAdPresetSchema>;

/** Input schema for creating/updating a preset (no id required). */
export const VideoAdPresetInputSchema = VideoAdPresetSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
}).partial({
  is_active: true,
  is_default: true,
  general_settings: true,
  text_settings: true,
  animation_settings: true,
  audio_settings: true,
  overlay_settings: true,
});
export type VideoAdPresetInput = z.infer<typeof VideoAdPresetInputSchema>;
