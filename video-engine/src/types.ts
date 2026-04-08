export type Platform = 'tiktok' | 'instagram-reel' | 'facebook-reel' | 'facebook-feed' | 'square';
export type StylePreset = 'luxury' | 'modern' | 'energetic' | 'minimal';

export type FitMode = 'cover' | 'contain';

export type TextBlock = {
  title: string;
  subtitle?: string;
  cta?: string;
};

export type ImageAsset = {
  src: string;
  alt?: string;
  holdSeconds?: number;
  caption?: string;
};

export type MusicAsset = {
  src: string;
  volume?: number;
  trimStartSeconds?: number;
  trimEndSeconds?: number;
};

export type LogoAsset = {
  src: string;
  width?: number;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
};

/** Preset config injected from the backend VideoAdPreset system. */
export type PresetConfig = {
  /** Scene timing */
  introDurationSeconds?: number;
  outroDurationSeconds?: number;
  imageDurationSeconds?: number;
  transitionType?: 'none' | 'fade' | 'slide' | 'wipe';
  transitionDurationMs?: number;
  /** Text styling */
  text?: {
    fontFamily?: string;
    headlineFontSize?: number;
    subheadlineFontSize?: number;
    ctaFontSize?: number;
    fontColor?: string;
    strokeColor?: string;
    strokeWidth?: number;
    shadowEnabled?: boolean;
    shadowColor?: string;
    shadowX?: number;
    shadowY?: number;
    backgroundBoxEnabled?: boolean;
    backgroundBoxColor?: string;
    backgroundBoxOpacity?: number;
    textAlign?: 'left' | 'center' | 'right';
    safeMargins?: { top: number; bottom: number; left: number; right: number };
    /** Custom text positions from the Board editor (percent of canvas) */
    positions?: {
      headline?: { x: number; y: number };
      subtitle?: { x: number; y: number };
      cta?: { x: number; y: number };
      description?: { x: number; y: number };
    };
  };
  /** Overlay styling */
  overlay?: {
    logoOpacity?: number;
    logoWidth?: number;
    gradientEnabled?: boolean;
    gradientDirection?: 'top_bottom' | 'bottom_top';
    gradientOpacity?: number;
  };
  /** Audio */
  audio?: {
    musicVolume?: number;
    fadeInFrames?: number;
    fadeOutFrames?: number;
  };
  /** Encoding (passed through to render.ts) */
  encoding?: {
    crf?: number;
    x264Preset?: string;
    audioBitrate?: string;
  };
};

export type JobInput = {
  projectId: string;
  platform: Platform;
  language: 'he' | 'en' | 'ar' | 'fr' | 'de';
  rtl?: boolean;
  style: StylePreset;
  fps?: number;
  title: string;
  subtitle?: string;
  cta?: string;
  outroTitle?: string;
  outroSubtitle?: string;
  themeColor?: string;
  textColor?: string;
  backgroundColor?: string;
  fitMode?: FitMode;
  images: ImageAsset[];
  logo?: LogoAsset;
  music?: MusicAsset;
  /** Preset overrides from the backend preset system */
  preset?: PresetConfig;
};

export type PlannedScene = {
  id: string;
  type: 'intro' | 'image' | 'outro';
  from: number;
  durationInFrames: number;
  image?: ImageAsset;
};

export type PlannedVideo = {
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  scenes: PlannedScene[];
  input: JobInput;
};
