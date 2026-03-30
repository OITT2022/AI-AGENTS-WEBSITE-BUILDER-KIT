import { v4 as uuid } from 'uuid';
import { store } from '../db/store';
import { CampaignCandidate, Platform } from '../models/schemas';

const WEIGHTS = { freshness: 0.25, media: 0.20, business: 0.20, urgency: 0.15, audience: 0.10, history: 0.10 };

function scoreFreshness(p: Record<string, unknown>): number {
  if (p.is_new === true) return 100;
  const u = p.updated_at as string | undefined;
  if (!u) return 20;
  const h = (Date.now() - new Date(u).getTime()) / 3600000;
  return h < 24 ? 90 : h < 72 ? 70 : h < 168 ? 50 : 30;
}
function scoreMedia(p: Record<string, unknown>): number {
  let s = p.hero_image ? 40 : 0;
  s += Math.min(((p.gallery_count as number) ?? 0) * 10, 30);
  s += Math.min(((p.video_count as number) ?? 0) * 15, 30);
  return s;
}
function scoreBusiness(p: Record<string, unknown>): number { return Math.min((p.priority_score as number) ?? 0, 100); }
function scoreUrgency(p: Record<string, unknown>): number {
  let s = 0; if (p.urgent === true) s += 50; if (p.price_changed === true) s += 30; if (p.is_new === true) s += 20;
  return Math.min(s, 100);
}
function recommendAngle(p: Record<string, unknown>): string {
  const a = (p.angles as string[]) ?? [];
  if (a.length > 0) return a[0];
  if (p.price_changed === true) return 'value';
  if (p.is_new === true) return 'new_listing';
  return 'location';
}
function recommendPlatforms(p: Record<string, unknown>): Platform[] {
  const plat: Platform[] = ['facebook', 'instagram'];
  if (((p.video_count as number) ?? 0) > 0 || p.video_preferred === true) plat.push('tiktok');
  return plat;
}
function recommendAudiences(p: Record<string, unknown>): string[] {
  const a = (p.target_audiences as string[]) ?? [];
  return a.length > 0 ? a : ['investors', 'families'];
}

export async function scoreAndSelectCandidates(date: string, maxCandidates: number = 10, clientId?: string): Promise<CampaignCandidate[]> {
  let entities = await store.getEntities();
  entities = entities.filter(e => e.campaign_ready && e.source_status === 'active');
  if (clientId) entities = entities.filter(e => e.client_id === clientId);

  const candidates: CampaignCandidate[] = [];
  for (const entity of entities) {
    const snapshots = await store.getSnapshots(entity.id);
    const latest = snapshots[0];
    if (!latest) continue;
    const p = latest.normalized_payload;
    if (!(p.title_he || p.title_en) || p.price_amount == null || !p.city || !(p.hero_image || (p.gallery_count as number) > 0) || !p.listing_url) continue;

    const sf = scoreFreshness(p), sm = scoreMedia(p), sb = scoreBusiness(p), su = scoreUrgency(p), sh = 50;
    const total = sf * WEIGHTS.freshness + sm * WEIGHTS.media + sb * WEIGHTS.business + su * WEIGHTS.urgency + 50 * WEIGHTS.audience + sh * WEIGHTS.history;

    candidates.push({
      id: uuid(), client_id: entity.client_id, entity_id: entity.id, candidate_date: date,
      score_total: Math.round(total * 100) / 100, score_freshness: sf, score_media: sm,
      score_business: sb, score_urgency: su, score_history: sh,
      recommended_angle: recommendAngle(p), recommended_audiences: recommendAudiences(p),
      recommended_platforms: recommendPlatforms(p), selected: false, created_at: new Date().toISOString(),
    });
  }

  candidates.sort((a, b) => b.score_total - a.score_total);
  candidates.slice(0, maxCandidates).forEach((c, i) => { c.selected = true; c.selection_reason = `Rank #${i + 1}`; });
  // Upsert and use the returned DB IDs (may differ from generated UUIDs on conflict)
  const saved: CampaignCandidate[] = [];
  for (const c of candidates) saved.push(await store.upsertCandidate(c));
  return saved;
}
