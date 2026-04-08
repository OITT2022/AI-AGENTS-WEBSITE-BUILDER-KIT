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
function scoreMedia(p: Record<string, unknown>, driveMediaCount = 0): number {
  let s = p.hero_image ? 40 : 0;
  s += Math.min(((p.gallery_count as number) ?? 0) * 10, 30);
  s += Math.min(((p.video_count as number) ?? 0) * 15, 30);
  // Bonus for Drive media availability
  if (driveMediaCount > 0) s = Math.min(s + 15, 100);
  return s;
}
function scoreBusiness(p: Record<string, unknown>): number { return Math.min((p.priority_score as number) ?? 0, 100); }
function scoreUrgency(p: Record<string, unknown>): number {
  let s = 0; if (p.urgent === true) s += 50; if (p.price_changed === true) s += 30; if (p.is_new === true) s += 20;
  return Math.min(s, 100);
}

/** Score history from real performance_metrics data. Falls back to 50 when no data exists. */
async function scoreHistory(entityId: string): Promise<number> {
  const perf = await store.getEntityPerformance(entityId);
  if (!perf || perf.campaign_count === 0) return 50; // neutral when no history
  // Scale CTR relative to a 1% baseline (typical for real-estate ads)
  const ctrScore = Math.min((perf.avg_ctr / 0.01) * 50, 80);
  // Bonus for volume of successful campaigns
  const volumeBonus = Math.min(perf.campaign_count * 5, 20);
  return Math.min(Math.round(ctrScore + volumeBonus), 100);
}

/** Score audience from real cross-campaign performance. Falls back to 50 when no data. */
async function scoreAudience(audiences: string[]): Promise<number> {
  if (audiences.length === 0) return 50;
  const results = await Promise.all(audiences.map(aud => store.getAudiencePerformance(aud)));
  let totalCtr = 0;
  let count = 0;
  for (const perf of results) {
    if (perf && perf.campaign_count > 0) {
      totalCtr += perf.avg_ctr;
      count++;
    }
  }
  if (count === 0) return 50;
  const avgCtr = totalCtr / count;
  return Math.min(Math.round((avgCtr / 0.01) * 60), 100);
}

function recommendAngle(p: Record<string, unknown>): string {
  const a = (p.angles as string[]) ?? [];
  if (a.length > 0) return a[0];
  if (p.price_changed === true) return 'value';
  if (p.is_new === true) return 'new_listing';
  return 'location';
}
function recommendPlatforms(p: Record<string, unknown>, driveMediaCount = 0, driveVideoCount = 0): Platform[] {
  const plat: Platform[] = ['facebook', 'instagram'];
  if (((p.video_count as number) ?? 0) > 0 || p.video_preferred === true || driveVideoCount > 0) plat.push('tiktok');
  return plat;
}
function recommendAudiences(p: Record<string, unknown>): string[] {
  const a = (p.target_audiences as string[]) ?? [];
  return a.length > 0 ? a : ['general'];
}

/** Max publishes per entity in the suppression window before it is penalized. */
const OVERUSE_THRESHOLD = 3;
const OVERUSE_WINDOW_DAYS = 7;

export async function scoreAndSelectCandidates(date: string, maxCandidates: number = 10, clientId?: string): Promise<CampaignCandidate[]> {
  // Clean old candidates for this client so each entity gets exactly 1 candidate
  if (clientId) {
    await store.deleteCandidatesByClient(clientId);
  }

  let entities = await store.getEntities();
  entities = entities.filter(e => e.campaign_ready && e.source_status === 'active');
  if (clientId) entities = entities.filter(e => e.client_id === clientId);

  // Pre-fetch Drive media counts per client for scoring bonus (parallel)
  const driveCountCache = new Map<string, number>();
  const driveVideoCountCache = new Map<string, number>();
  const uniqueClientIds = [...new Set(entities.map(e => e.client_id).filter((id): id is string => !!id))];
  await Promise.all(uniqueClientIds.map(async (cid) => {
    const [count, videoCount] = await Promise.all([store.getDriveMediaCount(cid), store.getDriveVideoCount(cid)]);
    driveCountCache.set(cid, count);
    driveVideoCountCache.set(cid, videoCount);
  }));

  const candidates: CampaignCandidate[] = [];
  for (const entity of entities) {
    const snapshots = await store.getSnapshots(entity.id);
    const latest = snapshots[0];
    if (!latest) continue;
    const p = latest.normalized_payload;
    const driveCount = entity.client_id ? driveCountCache.get(entity.client_id) ?? 0 : 0;
    // Minimum requirements: title + city + (some media OR Drive media) + listing URL
    // Price is optional (projects use price_range, not price_amount)
    if (!(p.title_he || p.title_en) || !p.city || !(p.hero_image || (p.gallery_count as number) > 0 || driveCount > 0) || !p.listing_url) continue;

    // Overuse suppression: skip entities published too recently
    const recentPublishes = await store.getRecentPublishCount(entity.id, OVERUSE_WINDOW_DAYS);
    if (recentPublishes >= OVERUSE_THRESHOLD) continue;

    const audiences = recommendAudiences(p);
    const sf = scoreFreshness(p), sm = scoreMedia(p, driveCount), sb = scoreBusiness(p), su = scoreUrgency(p);
    const sh = await scoreHistory(entity.id);
    const sa = await scoreAudience(audiences);
    const total = sf * WEIGHTS.freshness + sm * WEIGHTS.media + sb * WEIGHTS.business + su * WEIGHTS.urgency + sa * WEIGHTS.audience + sh * WEIGHTS.history;

    candidates.push({
      id: uuid(), client_id: entity.client_id, entity_id: entity.id, candidate_date: date,
      score_total: Math.round(total * 100) / 100, score_freshness: sf, score_media: sm,
      score_business: sb, score_urgency: su, score_history: sh,
      recommended_angle: recommendAngle(p), recommended_audiences: audiences,
      recommended_platforms: recommendPlatforms(p, driveCount, entity.client_id ? driveVideoCountCache.get(entity.client_id) ?? 0 : 0), selected: false, created_at: new Date().toISOString(),
    });
  }

  candidates.sort((a, b) => b.score_total - a.score_total);
  // Select all candidates — each property/project gets exactly 1 candidate, all selected
  candidates.forEach((c, i) => { c.selected = true; c.selection_reason = `Rank #${i + 1}`; });
  // Upsert and use the returned DB IDs (may differ from generated UUIDs on conflict)
  const saved: CampaignCandidate[] = [];
  for (const c of candidates) saved.push(await store.upsertCandidate(c));
  return saved;
}
