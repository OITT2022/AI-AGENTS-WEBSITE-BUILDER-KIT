import { v4 as uuid } from 'uuid';
import { store } from '../db/store';
import { CampaignCandidate, CreativeBatch, CreativeVariant, Platform } from '../models/schemas';
import { mergeMedia, MergedMedia } from './media-merge';

function selectImagesForPlatform(m: MergedMedia, platform: Platform): string[] {
  const all = m.hero_image ? [m.hero_image, ...m.gallery.filter(u => u !== m.hero_image)] : m.gallery;
  return platform === 'instagram' ? all.slice(0, 10) : platform === 'tiktok' ? all.slice(0, 1) : all.slice(0, 3);
}
function selectVideoForPlatform(m: MergedMedia): string | null {
  return m.videos[0] ?? null;
}

function genFacebookCopy(p: Record<string, unknown>, angle: string, lang: string): Record<string, unknown> {
  const t = lang === 'he' ? p.title_he : p.title_en;
  const city = p.city ?? '', area = p.area ?? '';
  const price = p.price_text ?? `${p.price_currency} ${p.price_amount}`;
  const rooms = p.rooms, size = p.size_m2, feat = (p.features as string[]) ?? [];
  if (lang === 'he') return { primary_text: `${t}\n\n📍 ${city}${area ? `, ${area}` : ''}\n💰 ${price}\n${rooms ? `🏠 ${rooms} חדרים` : ''}${size ? ` | ${size} מ"ר` : ''}\n\n${feat.slice(0,3).join(' • ')}`, headline: `${t} | ${city}`, description: `נכס ${angle==='value'?'במחיר מיוחד':angle==='new_listing'?'חדש בשוק':'מומלץ'} ב${city}`, cta: 'לפרטים נוספים', overlay_text: `${price}\n${city}` };
  return { primary_text: `${t}\n\n📍 ${city}${area ? `, ${area}` : ''}\n💰 ${price}\n${rooms ? `🏠 ${rooms} Rooms` : ''}${size ? ` | ${size}m²` : ''}\n\n${feat.slice(0,3).join(' • ')}`, headline: `${t} | ${city}`, description: `${angle==='value'?'Great value':angle==='new_listing'?'Just listed':'Featured'} in ${city}`, cta: 'Learn More', overlay_text: `${price}\n${city}` };
}
function genInstagramCopy(p: Record<string, unknown>, angle: string, lang: string): Record<string, unknown> {
  const t = lang === 'he' ? p.title_he : p.title_en;
  const city = p.city ?? '', area = p.area ?? '', price = p.price_text ?? `${p.price_currency} ${p.price_amount}`;
  const feat = (p.features as string[]) ?? [];
  if (lang === 'he') return { caption: `✨ ${t}\n\n📍 ${city}${area ? `, ${area}` : ''}\n💰 ${price}\n\n${feat.slice(0,4).join(' | ')}\n\nלפרטים — לינק בביו 👆`, cover_text: `${t}\n${price}`, story_text: `${city} | ${price}`, hashtags: [`#נדלן`,`#${(city as string).replace(/\s/g,'')}`,`#השקעות`,`#נדלן_למכירה`], cta: 'לינק בביו' };
  return { caption: `✨ ${t}\n\n📍 ${city}${area ? `, ${area}` : ''}\n💰 ${price}\n\n${feat.slice(0,4).join(' | ')}\n\nLink in bio 👆`, cover_text: `${t}\n${price}`, story_text: `${city} | ${price}`, hashtags: [`#realestate`,`#${(city as string).replace(/\s/g,'')}`,`#investment`,`#property`], cta: 'Link in Bio' };
}
function genTikTokCopy(p: Record<string, unknown>, angle: string, lang: string): Record<string, unknown> {
  const t = lang === 'he' ? p.title_he : p.title_en;
  const city = p.city ?? '', price = p.price_text ?? `${p.price_currency} ${p.price_amount}`;
  const rooms = p.rooms, size = p.size_m2, feat = (p.features as string[]) ?? [];
  if (lang === 'he') return { hook: `חייבים לראות את הנכס הזה ב${city}! 🔥`, voiceover_script: `${t}. ${rooms ? `${rooms} חדרים` : ''}${size ? `, ${size} מ"ר` : ''}. ${feat.slice(0,2).join(', ')}. במחיר ${price}.`, on_screen_text: [`${city}`,`${price}`,rooms?`${rooms} חדרים`:'',feat[0]??''].filter(Boolean), closing_cta: 'לינק בביו! 👇', suggested_shots: ['exterior','living_room','kitchen','view'] };
  return { hook: `You NEED to see this in ${city}! 🔥`, voiceover_script: `${t}. ${rooms ? `${rooms} rooms` : ''}${size ? `, ${size}m²` : ''}. ${feat.slice(0,2).join(', ')}. ${price}.`, on_screen_text: [`${city}`,`${price}`,rooms?`${rooms} Rooms`:'',feat[0]??''].filter(Boolean), closing_cta: 'Link in bio! 👇', suggested_shots: ['exterior','living_room','kitchen','view'] };
}

function genCopy(platform: Platform, p: Record<string, unknown>, angle: string, lang: string) {
  switch (platform) { case 'facebook': return genFacebookCopy(p,angle,lang); case 'instagram': return genInstagramCopy(p,angle,lang); case 'tiktok': return genTikTokCopy(p,angle,lang); }
}

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

  const angle = candidate.recommended_angle ?? 'location';
  const batch: CreativeBatch = {
    id: uuid(), client_id: entity.client_id, entity_id: entity.id, candidate_id: candidate.id,
    language_code: 'he', angle, audience: candidate.recommended_audiences[0] ?? 'general',
    batch_status: 'generated', created_at: new Date().toISOString(),
  };
  await store.addBatch(batch);

  const variants: CreativeVariant[] = [];
  for (const platform of candidate.recommended_platforms) {
    for (let vn = 1; vn <= 2; vn++) {
      const lang = vn === 1 ? 'he' : 'en';
      const copy = genCopy(platform, p, angle, lang);
      const variant: CreativeVariant = {
        id: uuid(), batch_id: batch.id, platform, variant_no: vn,
        copy_json: { ...copy, language: lang },
        media_plan_json: {
          hero_image: merged.hero_image, gallery: merged.gallery,
          videos: merged.videos,
          selected_images: selectImagesForPlatform(merged, platform),
          selected_video: selectVideoForPlatform(merged),
          aspect_ratios: platform === 'tiktok' ? ['9:16'] : platform === 'instagram' ? ['1:1','4:5','9:16'] : ['1:1','4:5'],
          source_breakdown: merged.source_breakdown,
        },
        generation_metadata: { angle, audience: candidate.recommended_audiences[0] ?? 'general', language: lang, generated_at: new Date().toISOString() },
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
