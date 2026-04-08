import { v4 as uuid } from 'uuid';
import { store } from '../db/store';
import { CampaignCandidate, CreativeBatch, CreativeVariant, Platform } from '../models/schemas';
import { mergeMedia, MergedMedia } from './media-merge';

function selectImagesForPlatform(m: MergedMedia, platform: Platform): string[] {
  const all = m.hero_image ? [m.hero_image, ...m.gallery.filter(u => u !== m.hero_image)] : m.gallery;
  return platform === 'instagram' ? all.slice(0, 10) : platform === 'tiktok' ? all.slice(0, 1) : all.slice(0, 3);
}

// ── Copy generators ──

function genFacebookCopy(p: Record<string, unknown>, angle: string, lang: string, hasVideo: boolean): Record<string, unknown> {
  const t = lang === 'he' ? p.title_he : p.title_en;
  const city = p.city ?? '', area = p.area ?? '';
  const price = p.price_text ?? `${p.price_currency} ${p.price_amount}`;
  const rooms = p.rooms, size = p.size_m2, feat = (p.features as string[]) ?? [];
  const adType = hasVideo ? 'video' : 'image';
  if (lang === 'he') return {
    ad_type: adType,
    primary_text: `${t}\n\n📍 ${city}${area ? `, ${area}` : ''}\n💰 ${price}\n${rooms ? `🏠 ${rooms} חדרים` : ''}${size ? ` | ${size} מ"ר` : ''}\n\n${feat.slice(0,3).join(' • ')}`,
    headline: `${t} | ${city}`,
    description: `נכס ${angle==='value'?'במחיר מיוחד':angle==='new_listing'?'חדש בשוק':'מומלץ'} ב${city}`,
    cta: 'לפרטים נוספים',
    overlay_text: `${price}\n${city}`,
  };
  return {
    ad_type: adType,
    primary_text: `${t}\n\n📍 ${city}${area ? `, ${area}` : ''}\n💰 ${price}\n${rooms ? `🏠 ${rooms} Rooms` : ''}${size ? ` | ${size}m²` : ''}\n\n${feat.slice(0,3).join(' • ')}`,
    headline: `${t} | ${city}`,
    description: `${angle==='value'?'Great value':angle==='new_listing'?'Just listed':'Featured'} in ${city}`,
    cta: 'Learn More',
    overlay_text: `${price}\n${city}`,
  };
}

function genInstagramCopy(p: Record<string, unknown>, angle: string, lang: string, hasVideo: boolean): Record<string, unknown> {
  const t = lang === 'he' ? p.title_he : p.title_en;
  const city = p.city ?? '', area = p.area ?? '', price = p.price_text ?? `${p.price_currency} ${p.price_amount}`;
  const feat = (p.features as string[]) ?? [];
  const adType = hasVideo ? 'reel' : 'carousel';
  if (lang === 'he') return {
    ad_type: adType,
    caption: `✨ ${t}\n\n📍 ${city}${area ? `, ${area}` : ''}\n💰 ${price}\n\n${feat.slice(0,4).join(' | ')}\n\nלפרטים — לינק בביו 👆`,
    cover_text: `${t}\n${price}`,
    story_text: `${city} | ${price}`,
    hashtags: [`#נדלן`,`#${(city as string).replace(/\s/g,'')}`,`#השקעות`,`#נדלן_למכירה`],
    cta: 'לינק בביו',
  };
  return {
    ad_type: adType,
    caption: `✨ ${t}\n\n📍 ${city}${area ? `, ${area}` : ''}\n💰 ${price}\n\n${feat.slice(0,4).join(' | ')}\n\nLink in bio 👆`,
    cover_text: `${t}\n${price}`,
    story_text: `${city} | ${price}`,
    hashtags: [`#realestate`,`#${(city as string).replace(/\s/g,'')}`,`#investment`,`#property`],
    cta: 'Link in Bio',
  };
}

function genTikTokCopy(p: Record<string, unknown>, angle: string, lang: string): Record<string, unknown> {
  const t = lang === 'he' ? p.title_he : p.title_en;
  const city = p.city ?? '', price = p.price_text ?? `${p.price_currency} ${p.price_amount}`;
  const rooms = p.rooms, size = p.size_m2, feat = (p.features as string[]) ?? [];
  if (lang === 'he') return {
    ad_type: 'short_video',
    hook: `חייבים לראות את הנכס הזה ב${city}! 🔥`,
    voiceover_script: `${t}. ${rooms ? `${rooms} חדרים` : ''}${size ? `, ${size} מ"ר` : ''}. ${feat.slice(0,2).join(', ')}. במחיר ${price}.`,
    on_screen_text: [`${city}`,`${price}`,rooms?`${rooms} חדרים`:'',feat[0]??''].filter(Boolean),
    closing_cta: 'לינק בביו! 👇',
    suggested_shots: ['exterior','living_room','kitchen','view'],
  };
  return {
    ad_type: 'short_video',
    hook: `You NEED to see this in ${city}! 🔥`,
    voiceover_script: `${t}. ${rooms ? `${rooms} rooms` : ''}${size ? `, ${size}m²` : ''}. ${feat.slice(0,2).join(', ')}. ${price}.`,
    on_screen_text: [`${city}`,`${price}`,rooms?`${rooms} Rooms`:'',feat[0]??''].filter(Boolean),
    closing_cta: 'Link in bio! 👇',
    suggested_shots: ['exterior','living_room','kitchen','view'],
  };
}

function genCopy(platform: Platform, p: Record<string, unknown>, angle: string, lang: string, hasVideo: boolean) {
  switch (platform) {
    case 'facebook': return genFacebookCopy(p, angle, lang, hasVideo);
    case 'instagram': return genInstagramCopy(p, angle, lang, hasVideo);
    case 'tiktok': return genTikTokCopy(p, angle, lang);
  }
}

// ── Video reel / short ad scene timeline ──

function genReelTimeline(p: Record<string, unknown>, merged: MergedMedia, lang: string): Record<string, unknown> {
  const t = lang === 'he' ? p.title_he : p.title_en;
  const city = p.city ?? '';
  const price = p.price_text ?? `${p.price_currency} ${p.price_amount}`;
  const rooms = p.rooms, size = p.size_m2;
  const feat = (p.features as string[]) ?? [];
  const images = merged.hero_image ? [merged.hero_image, ...merged.gallery.slice(0, 4)] : merged.gallery.slice(0, 5);
  const videos = merged.videos;

  const scenes: Record<string, unknown>[] = [];
  let timeOffset = 0;

  // Scene 1: Hook — video clip or hero image (0-3s)
  scenes.push({
    scene: 1,
    start_sec: timeOffset,
    duration_sec: 3,
    type: videos.length > 0 ? 'video_clip' : 'image_zoom',
    source: videos[0] || images[0] || null,
    overlay_text: lang === 'he' ? `🔥 ${city}` : `🔥 ${city}`,
    transition: 'fade_in',
  });
  timeOffset += 3;

  // Scene 2: Property overview — image or second video clip (3-6s)
  scenes.push({
    scene: 2,
    start_sec: timeOffset,
    duration_sec: 3,
    type: images.length > 1 ? 'image_pan' : 'video_clip',
    source: images[1] || videos[0] || images[0] || null,
    overlay_text: `${t}`,
    transition: 'slide_left',
  });
  timeOffset += 3;

  // Scene 3: Key details — price + specs (6-9s)
  const detailParts = [price];
  if (rooms) detailParts.push(lang === 'he' ? `${rooms} חדרים` : `${rooms} Rooms`);
  if (size) detailParts.push(lang === 'he' ? `${size} מ"ר` : `${size}m²`);
  scenes.push({
    scene: 3,
    start_sec: timeOffset,
    duration_sec: 3,
    type: images.length > 2 ? 'image_zoom' : 'video_clip',
    source: images[2] || videos[1] || videos[0] || images[0] || null,
    overlay_text: detailParts.join(' | '),
    transition: 'slide_right',
  });
  timeOffset += 3;

  // Scene 4: Features highlight (9-12s)
  if (feat.length > 0 || images.length > 3) {
    scenes.push({
      scene: 4,
      start_sec: timeOffset,
      duration_sec: 3,
      type: images.length > 3 ? 'image_pan' : 'video_clip',
      source: images[3] || videos[0] || images[0] || null,
      overlay_text: feat.slice(0, 3).join(' • ') || (lang === 'he' ? 'נכס מומלץ' : 'Featured Property'),
      transition: 'zoom_in',
    });
    timeOffset += 3;
  }

  // Scene 5: CTA closing (12-15s)
  scenes.push({
    scene: scenes.length + 1,
    start_sec: timeOffset,
    duration_sec: 3,
    type: videos.length > 1 ? 'video_clip' : 'image_zoom',
    source: videos[videos.length - 1] || images[images.length - 1] || images[0] || null,
    overlay_text: lang === 'he' ? `📍 ${city}\n💰 ${price}\nלפרטים — לינק בביו 👇` : `📍 ${city}\n💰 ${price}\nLink in bio 👇`,
    transition: 'fade_out',
  });
  timeOffset += 3;

  return {
    total_duration_sec: timeOffset,
    aspect_ratio: '9:16',
    scenes,
    music_suggestion: lang === 'he' ? 'upbeat modern beat' : 'upbeat modern beat',
    all_video_sources: videos,
    all_image_sources: images,
  };
}

// ── Main creative generation ──

export async function generateCreativesForCandidate(candidate: CampaignCandidate): Promise<{ batch: CreativeBatch; variants: CreativeVariant[] }> {
  const entity = await store.getEntity(candidate.entity_id);
  if (!entity) throw new Error(`Entity ${candidate.entity_id} not found`);
  const snapshots = await store.getSnapshots(entity.id);
  const latest = snapshots[0];
  if (!latest) throw new Error(`No snapshot for entity ${entity.id}`);

  const p = latest.normalized_payload;

  // Merge API media with cached Google Drive media for this client
  const driveMedia = entity.client_id ? await store.getDriveMediaByClient(entity.client_id) : [];
  const merged = mergeMedia(p, driveMedia);
  const hasVideo = merged.videos.length > 0;

  const angle = candidate.recommended_angle ?? 'location';
  // Derive language from entity's actual marketing languages
  const entityLanguages = (p.languages as string[]) ?? [];
  const primaryLang = entityLanguages[0] ?? (p.title_he ? 'he' : p.title_en ? 'en' : 'he');
  const batch: CreativeBatch = {
    id: uuid(), client_id: entity.client_id, entity_id: entity.id, candidate_id: candidate.id,
    language_code: primaryLang, angle, audience: candidate.recommended_audiences[0] ?? 'general',
    batch_status: 'generated', created_at: new Date().toISOString(),
  };
  await store.addBatch(batch);

  const variants: CreativeVariant[] = [];
  let variantNo = 0;

  // Generate 1 variant per property: primary language, first recommended platform
  const bestPlatform = candidate.recommended_platforms[0] ?? 'facebook';
  const bestLang = (primaryLang === 'he' || primaryLang === 'en') ? primaryLang as 'he' | 'en' : 'he';
  {
    const platform = bestPlatform;
    const lang = bestLang;
    {
      variantNo++;
      const copy = genCopy(platform, p, angle, lang, hasVideo);
      const isVideoAd = hasVideo && (platform === 'tiktok' || platform === 'instagram');

      const mediaPlan: Record<string, unknown> = {
        hero_image: merged.hero_image,
        gallery: merged.gallery,
        videos: merged.videos,
        selected_images: selectImagesForPlatform(merged, platform),
        selected_video: merged.videos[0] ?? null,
        aspect_ratios: platform === 'tiktok' ? ['9:16'] : platform === 'instagram' ? ['1:1','4:5','9:16'] : ['1:1','4:5'],
        source_breakdown: merged.source_breakdown,
      };

      // Add reel/short video timeline for video-capable platforms
      if (isVideoAd) {
        mediaPlan.reel_timeline = genReelTimeline(p, merged, lang);
      }

      // For Facebook video ads, add video ad structure
      if (hasVideo && platform === 'facebook') {
        mediaPlan.video_ad = {
          type: 'in_feed_video',
          primary_video: merged.videos[0],
          thumbnail: merged.hero_image || merged.gallery[0] || null,
          aspect_ratio: '4:5',
          max_duration_sec: 15,
        };
      }

      const variant: CreativeVariant = {
        id: uuid(), batch_id: batch.id, platform, variant_no: variantNo,
        copy_json: { ...copy, language: lang },
        media_plan_json: mediaPlan,
        generation_metadata: {
          angle,
          audience: candidate.recommended_audiences[0] ?? 'general',
          language: lang,
          has_video: hasVideo,
          video_count: merged.videos.length,
          image_count: merged.gallery.length,
          drive_image_count: merged.source_breakdown.drive,
          api_image_count: merged.source_breakdown.api,
          generator: 'template_v1',
          entity_snapshot_version: latest.version_no,
          candidate_score: candidate.score_total,
          generated_at: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
      };
      await store.addVariant(variant);
      variants.push(variant);
    }
  }
  return { batch, variants };
}

export async function generateAllCreatives(date: string) {
  const candidates = await store.getCandidates(date);
  const selected = candidates.filter(c => c.selected);
  return Promise.all(selected.map(c => generateCreativesForCandidate(c)));
}
