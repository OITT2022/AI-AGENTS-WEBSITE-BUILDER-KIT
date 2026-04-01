import { DriveMediaCacheRow } from '../models/schemas';

export interface MergedMedia {
  hero_image: string | null;
  gallery: string[];
  videos: string[];
  total_image_count: number;
  total_video_count: number;
  source_breakdown: { api: number; drive: number };
}

/**
 * Merge media from the property API snapshot with cached Google Drive media.
 * API media takes priority (hero image, ordering), Drive media supplements.
 */
export function mergeMedia(
  apiPayload: Record<string, unknown>,
  driveMedia: DriveMediaCacheRow[]
): MergedMedia {
  const apiHero = (apiPayload.hero_image as string) || null;
  const apiGallery = (apiPayload.gallery as string[]) ?? [];
  const apiVideos = (apiPayload.videos as string[]) ?? [];

  const driveImages = driveMedia
    .filter(f => f.media_type === 'image')
    .map(f => f.url);
  const driveVideos = driveMedia
    .filter(f => f.media_type === 'video')
    .map(f => f.url);

  // Deduplicate: collect all API URLs in a Set, only add Drive URLs that are new
  const seenUrls = new Set<string>();
  if (apiHero) seenUrls.add(apiHero);
  for (const u of apiGallery) seenUrls.add(u);
  for (const u of apiVideos) seenUrls.add(u);

  const uniqueDriveImages = driveImages.filter(u => !seenUrls.has(u));
  const uniqueDriveVideos = driveVideos.filter(u => !seenUrls.has(u));

  // Hero: API hero first, then first Drive image as fallback
  const hero = apiHero || uniqueDriveImages[0] || null;

  // Gallery: API gallery + Drive images (excluding hero if it came from Drive)
  const gallery = [...apiGallery];
  for (const u of uniqueDriveImages) {
    if (u !== hero) gallery.push(u);
  }

  // Videos: API videos + Drive videos
  const videos = [...apiVideos, ...uniqueDriveVideos];

  return {
    hero_image: hero,
    gallery,
    videos,
    total_image_count: (hero ? 1 : 0) + gallery.length,
    total_video_count: videos.length,
    source_breakdown: {
      api: apiGallery.length + apiVideos.length + (apiHero ? 1 : 0),
      drive: uniqueDriveImages.length + uniqueDriveVideos.length,
    },
  };
}
