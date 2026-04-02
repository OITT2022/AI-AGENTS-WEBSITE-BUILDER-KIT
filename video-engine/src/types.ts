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
