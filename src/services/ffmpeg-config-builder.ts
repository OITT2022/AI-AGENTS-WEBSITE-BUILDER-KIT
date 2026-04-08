/**
 * FFmpeg Config Builder — maps VideoAdPreset settings into Remotion renderMedia
 * options and video-engine JobInput overrides.
 *
 * Architecture:
 * - VideoPresetResolver: picks the right preset
 * - TextOverlayBuilder: maps text settings → component props
 * - AudioMixBuilder: maps audio settings → Remotion audio props
 * - OverlayBuilder: maps overlay settings → component props
 * - OutputFormatBuilder: maps encoding settings → renderMedia options
 * - FFmpegCommandBuilder: combines all into a unified config
 *
 * This module does NOT execute FFmpeg. It produces configuration objects
 * consumed by video-engine/scripts/render.ts and SlideshowAd.tsx.
 */

import type {
  VideoAdPreset,
  GeneralSettings,
  TextSettings,
  AnimationSettings,
  AudioSettings,
  OverlaySettings,
} from '../models/video-preset';

// ── Output types consumed by the video engine ──

export interface RenderMediaConfig {
  codec: 'h264';
  crf: number;
  x264Preset: string;
  pixelFormat: 'yuv420p';
  audioCodec: 'aac';
  audioBitrate: string;
  videoBitrate?: string;
}

export interface TextOverlayConfig {
  enabled: boolean;
  headline: {
    enabled: boolean;
    fontSize: number;
    animation: string;
    inDurationMs: number;
    outDurationMs: number;
    startMs: number;
    endMs: number;
  };
  subheadline: {
    enabled: boolean;
    fontSize: number;
    animation: string;
    inDurationMs: number;
    outDurationMs: number;
    startMs: number;
    endMs: number;
  };
  cta: {
    enabled: boolean;
    fontSize: number;
    animation: string;
    inDurationMs: number;
    outDurationMs: number;
    startMs: number;
    endMs: number;
  };
  fontFamily: string;
  fontColor: string;
  strokeColor: string;
  strokeWidth: number;
  shadow: { enabled: boolean; color: string; x: number; y: number };
  backgroundBox: { enabled: boolean; color: string; opacity: number };
  textAlign: string;
  textCaseMode: string;
  lineSpacing: number;
  maxLines: { headline: number; subheadline: number; cta: number };
  safeMargins: { top: number; bottom: number; left: number; right: number };
}

export interface AudioMixConfig {
  musicEnabled: boolean;
  musicVolume: number;
  fadeInFrames: number;
  fadeOutFrames: number;
  trimStartMs: number;
  trimEndMs: number;
  loop: boolean;
  voiceoverEnabled: boolean;
  voiceoverVolume: number;
  duckingEnabled: boolean;
  duckingLevel: number;
  normalize: boolean;
}

export interface OverlayConfig {
  logo: {
    enabled: boolean;
    position: string;
    width: number;
    height: number;
    opacity: number;
  };
  watermark: { enabled: boolean; text: string; opacity: number };
  gradient: { enabled: boolean; direction: string; opacity: number };
  badge: { enabled: boolean; position: string; style: string };
}

export interface VideoSceneConfig {
  introDurationSeconds: number;
  outroDurationSeconds: number;
  imageDurationSeconds: number;
  transitionType: string;
  transitionDurationMs: number;
}

/** Full config object produced from a preset — consumed by the video engine. */
export interface VideoRenderConfig {
  /** Render output settings (codec, quality, bitrate) */
  output: RenderMediaConfig;
  /** Canvas dimensions and FPS */
  canvas: { width: number; height: number; fps: number; durationSeconds: number };
  /** Visual style */
  style: { preset: string; backgroundColor: string; fitMode: string };
  /** Text overlay configuration */
  text: TextOverlayConfig;
  /** Audio mix configuration */
  audio: AudioMixConfig;
  /** Overlay (logo, gradient, badge) configuration */
  overlays: OverlayConfig;
  /** Scene timing */
  scenes: VideoSceneConfig;
}

// ── Builders ──

export function buildOutputConfig(g: GeneralSettings): RenderMediaConfig {
  const config: RenderMediaConfig = {
    codec: 'h264',
    crf: g.crf,
    x264Preset: g.encodingPreset,
    pixelFormat: 'yuv420p',
    audioCodec: 'aac',
    audioBitrate: g.audioBitrate,
  };
  if (g.bitrateMode === 'cbr' && g.videoBitrate) {
    // CBR: use videoBitrate, drop CRF (Remotion doesn't allow both)
    delete (config as any).crf;
    config.videoBitrate = g.videoBitrate;
  }
  return config;
}

export function buildTextConfig(t: TextSettings, a: AnimationSettings): TextOverlayConfig {
  return {
    enabled: t.enabled,
    headline: {
      enabled: t.headlineEnabled,
      fontSize: t.headlineFontSize,
      animation: a.headlineAnimation,
      inDurationMs: a.headlineInDurationMs,
      outDurationMs: a.headlineOutDurationMs,
      startMs: a.headlineStartMs,
      endMs: a.headlineEndMs,
    },
    subheadline: {
      enabled: t.subheadlineEnabled,
      fontSize: t.subheadlineFontSize,
      animation: a.subheadlineAnimation,
      inDurationMs: a.subheadlineInDurationMs,
      outDurationMs: a.subheadlineOutDurationMs,
      startMs: a.subheadlineStartMs,
      endMs: a.subheadlineEndMs,
    },
    cta: {
      enabled: t.ctaEnabled,
      fontSize: t.ctaFontSize,
      animation: a.ctaAnimation,
      inDurationMs: a.ctaInDurationMs,
      outDurationMs: a.ctaOutDurationMs,
      startMs: a.ctaStartMs,
      endMs: a.ctaEndMs,
    },
    fontFamily: t.fontFamily,
    fontColor: t.fontColor,
    strokeColor: t.strokeColor,
    strokeWidth: t.strokeWidth,
    shadow: { enabled: t.shadowEnabled, color: t.shadowColor, x: t.shadowX, y: t.shadowY },
    backgroundBox: { enabled: t.backgroundBoxEnabled, color: t.backgroundBoxColor, opacity: t.backgroundBoxOpacity },
    textAlign: t.textAlign,
    textCaseMode: t.textCaseMode,
    lineSpacing: t.lineSpacing,
    maxLines: { headline: t.maxHeadlineLines, subheadline: t.maxSubheadlineLines, cta: t.maxCtaLines },
    safeMargins: {
      top: t.safeMarginTopPercent,
      bottom: t.safeMarginBottomPercent,
      left: t.safeMarginLeftPercent,
      right: t.safeMarginRightPercent,
    },
  };
}

export function buildAudioConfig(a: AudioSettings, fps: number): AudioMixConfig {
  return {
    musicEnabled: a.musicEnabled,
    musicVolume: a.musicVolume,
    fadeInFrames: Math.round((a.musicFadeInMs / 1000) * fps),
    fadeOutFrames: Math.round((a.musicFadeOutMs / 1000) * fps),
    trimStartMs: a.musicTrimStartMs,
    trimEndMs: a.musicTrimEndMs,
    loop: a.musicLoop,
    voiceoverEnabled: a.voiceoverEnabled,
    voiceoverVolume: a.voiceoverVolume,
    duckingEnabled: a.duckingEnabled,
    duckingLevel: a.duckingLevel,
    normalize: a.normalizeAudio,
  };
}

export function buildOverlayConfig(o: OverlaySettings): OverlayConfig {
  return {
    logo: {
      enabled: o.logoEnabled,
      position: o.logoPosition,
      width: o.logoWidth,
      height: o.logoHeight,
      opacity: o.logoOpacity,
    },
    watermark: { enabled: o.watermarkEnabled, text: o.watermarkText, opacity: o.watermarkOpacity },
    gradient: { enabled: o.gradientOverlayEnabled, direction: o.gradientDirection, opacity: o.gradientOpacity },
    badge: { enabled: o.propertyBadgeEnabled, position: o.propertyBadgePosition, style: o.propertyBadgeStyle },
  };
}

export function buildSceneConfig(g: GeneralSettings): VideoSceneConfig {
  return {
    introDurationSeconds: g.introDurationSeconds,
    outroDurationSeconds: g.outroDurationSeconds,
    imageDurationSeconds: g.imageDurationSeconds,
    transitionType: g.transitionType,
    transitionDurationMs: g.transitionDurationMs,
  };
}

// ── Main builder ──

/**
 * Build a complete VideoRenderConfig from a preset.
 * This is the single entry point — all other builders are internal.
 */
export function buildRenderConfig(preset: VideoAdPreset): VideoRenderConfig {
  const g = preset.general_settings as GeneralSettings;
  const t = preset.text_settings as TextSettings;
  const a = preset.animation_settings as AnimationSettings;
  const au = preset.audio_settings as AudioSettings;
  const o = preset.overlay_settings as OverlaySettings;

  return {
    output: buildOutputConfig(g),
    canvas: { width: g.width, height: g.height, fps: g.fps, durationSeconds: g.durationSeconds },
    style: { preset: g.stylePreset, backgroundColor: g.backgroundColor, fitMode: g.fitMode },
    text: buildTextConfig(t, a),
    audio: buildAudioConfig(au, g.fps),
    overlays: buildOverlayConfig(o),
    scenes: buildSceneConfig(g),
  };
}
