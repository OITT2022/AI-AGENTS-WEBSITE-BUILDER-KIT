import fs from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import type {JobInput} from '../types';

const imageAssetSchema = z.object({
  src: z.string(),
  alt: z.string().optional(),
  holdSeconds: z.number().positive().optional(),
  caption: z.string().optional()
});

const jobSchema = z.object({
  projectId: z.string().min(1),
  platform: z.enum(['tiktok', 'instagram-reel', 'facebook-reel', 'facebook-feed', 'square']),
  language: z.enum(['he', 'en', 'ar', 'fr', 'de']),
  rtl: z.boolean().optional(),
  style: z.enum(['luxury', 'modern', 'energetic', 'minimal']),
  fps: z.number().positive().max(60).optional(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  cta: z.string().optional(),
  outroTitle: z.string().optional(),
  outroSubtitle: z.string().optional(),
  themeColor: z.string().optional(),
  textColor: z.string().optional(),
  backgroundColor: z.string().optional(),
  fitMode: z.enum(['cover', 'contain']).optional(),
  images: z.array(imageAssetSchema).min(1),
  logo: z.object({
    src: z.string(),
    width: z.number().positive().optional(),
    position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).optional()
  }).optional(),
  music: z.object({
    src: z.string(),
    volume: z.number().min(0).max(1).optional(),
    trimStartSeconds: z.number().min(0).optional(),
    trimEndSeconds: z.number().min(0).optional()
  }).optional()
});

const absolutize = (baseDir: string, inputPath: string) => {
  // Skip URLs — they should be passed through as-is for remote asset download
  if (inputPath.startsWith('http://') || inputPath.startsWith('https://') || inputPath.startsWith('data:')) {
    return inputPath;
  }
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.resolve(baseDir, inputPath);
};

export const loadJobFile = (jobPath: string): JobInput => {
  const absoluteJobPath = path.resolve(jobPath);
  const jobDir = path.dirname(absoluteJobPath);
  const raw = fs.readFileSync(absoluteJobPath, 'utf8');
  const parsed = jobSchema.parse(JSON.parse(raw)) as JobInput;

  return {
    ...parsed,
    images: parsed.images.map((image) => ({
      ...image,
      src: absolutize(jobDir, image.src)
    })),
    logo: parsed.logo
      ? {
          ...parsed.logo,
          src: absolutize(jobDir, parsed.logo.src)
        }
      : undefined,
    music: parsed.music
      ? {
          ...parsed.music,
          src: absolutize(jobDir, parsed.music.src)
        }
      : undefined
  };
};
