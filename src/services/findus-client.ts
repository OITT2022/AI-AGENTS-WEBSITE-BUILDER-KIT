import { PropertyPayloadSchema } from '../models/schemas';
import { ingestProperty, ingestProject, IngestResult } from './ingest';
import { runDailyPipeline } from './pipeline';
import { store } from '../db/store';
import * as log from '../lib/logger';

export interface FindUsConfig {
  api_token: string;
  base_url: string;
  auto_sync: boolean;
  sync_interval_minutes: number;
  last_sync_at: string | null;
  filters: {
    city?: string;
    propertyType?: string;
  };
}

const DEFAULT_CONFIG: FindUsConfig = {
  api_token: '',
  base_url: 'https://www.findus.co.il/api/v1',
  auto_sync: false,
  sync_interval_minutes: 120,
  last_sync_at: null,
  filters: {},
};

export async function loadConfig(): Promise<FindUsConfig> {
  const saved = await store.getConfig('findus');
  return saved ? { ...DEFAULT_CONFIG, ...saved } : { ...DEFAULT_CONFIG };
}

export async function saveConfig(config: Partial<FindUsConfig>): Promise<FindUsConfig> {
  const current = await loadConfig();
  const updated = { ...current, ...config };
  await store.setConfig('findus', updated);
  return updated;
}

async function apiFetch(endpoint: string, config: FindUsConfig): Promise<any> {
  if (!config.api_token) throw new Error('API token not configured');

  const url = `${config.base_url}${endpoint}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${config.api_token}` },
  });

  if (res.status === 401) throw new Error('Unauthorized — check your API token');
  if (!res.ok) throw new Error(`FindUs API error: ${res.status} ${res.statusText}`);

  return res.json();
}

interface FindUsProperty {
  id: string;
  title?: string;
  shortDescription?: string;
  description?: string;
  price?: number | string;
  currency?: string;
  propertyType?: string;
  areaSqm?: number;
  videoUrl?: string;
  websiteUrl?: string;
  status?: string;
  city?: string;
  area?: string;
  address?: string;
  country?: string;
  rooms?: number;
  bathrooms?: number;
  features?: string[];
  images?: Array<{ url: string; altText?: string; isPrimary?: boolean }>;
  documents?: Array<{ url: string; category: string }>;
  project?: { id: string; title?: string; slug?: string };
  [key: string]: unknown;
}

interface FindUsProject {
  id: string;
  title?: string;
  developerName?: string;
  completionDate?: string;
  totalUnits?: number;
  city?: string;
  country?: string;
  description?: string;
  features?: string[];
  videoUrl?: string;
  images?: Array<{ url: string; isPrimary?: boolean }>;
  documents?: Array<{ url: string; category: string }>;
  properties?: FindUsProperty[];
  [key: string]: unknown;
}

// ── Marketing-flag adapters: derive from real API data instead of hardcoding ──

function deriveMarketingFlags(
  fp: FindUsProperty,
  previousSnapshot?: Record<string, unknown>,
): Record<string, unknown> {
  const images = fp.images ?? [];
  const hasHero = images.some(i => i.isPrimary) || images.length > 0;
  const hasVideo = !!fp.videoUrl;
  const hasPrice = fp.price != null;
  const hasCity = !!fp.city;
  const hasTitle = !!fp.title;

  // campaign_ready: entity must have minimum viable data per docs/04-api-spec.md
  const campaign_ready = hasTitle && hasPrice && hasCity && (hasHero || images.length > 0);

  // priority_score: derived from data completeness (0-100)
  let priority_score = 0;
  if (hasTitle) priority_score += 15;
  if (hasPrice) priority_score += 15;
  if (hasCity) priority_score += 10;
  if (hasHero) priority_score += 15;
  if (images.length >= 3) priority_score += 10;
  if (hasVideo) priority_score += 15;
  if (fp.rooms != null) priority_score += 5;
  if (fp.areaSqm != null) priority_score += 5;
  if ((fp.features ?? []).length > 0) priority_score += 5;
  if (fp.description) priority_score += 5;

  // target_audiences: infer from property attributes
  const target_audiences: string[] = [];
  const price = typeof fp.price === 'string' ? parseFloat(fp.price) || 0 : (fp.price ?? 0);
  if (price > 0 && price <= 300000) target_audiences.push('investors');
  if (price > 300000) target_audiences.push('families');
  if ((fp.rooms ?? 0) >= 4) target_audiences.push('families');
  if ((fp.rooms ?? 0) <= 2 && price <= 200000) target_audiences.push('investors');
  if (target_audiences.length === 0) target_audiences.push('general');
  // Deduplicate
  const uniqueAudiences = [...new Set(target_audiences)];

  // angles: infer from available data
  const angles: string[] = [];
  if (fp.city) angles.push('location');
  if (price > 0 && price <= 250000) angles.push('value');
  if (hasVideo || images.length >= 5) angles.push('lifestyle');
  if (fp.project?.id) angles.push('investment');
  if (angles.length === 0) angles.push('location');

  // is_new: true if no previous snapshot exists
  const is_new = !previousSnapshot;

  // price_changed: compare with previous snapshot
  const price_changed = previousSnapshot != null && previousSnapshot.price_amount != null
    && price !== previousSnapshot.price_amount;

  // urgent: price drop or newly listed
  const urgent = price_changed || is_new;

  return {
    campaign_ready,
    priority_score,
    target_audiences: uniqueAudiences,
    angles,
    urgent,
    is_new,
    price_changed,
    video_preferred: hasVideo,
    languages: ['he', 'en'],
  };
}

function mapFindUsProperty(fp: FindUsProperty, previousSnapshot?: Record<string, unknown>, baseUrl?: string): Record<string, unknown> {
  const images = fp.images ?? [];
  const primaryImage = images.find(i => i.isPrimary)?.url ?? images[0]?.url;
  const gallery = images.map(i => i.url);

  return {
    id: fp.id,
    type: 'property',
    status: (fp.status ?? 'ACTIVE').toLowerCase() === 'active' ? 'active' : fp.status?.toLowerCase(),
    title: {
      he: fp.title ?? '',
      en: fp.title ?? '',
    },
    descriptions: {
      short: { he: fp.shortDescription || fp.description || '', en: fp.shortDescription || fp.description || '' },
      long: { he: fp.description || '', en: fp.description || '' },
    },
    country: fp.country ?? '',
    city: fp.city ?? '',
    area: fp.area || fp.address || '',
    project_id: fp.project?.id,
    price: fp.price != null ? {
      amount: typeof fp.price === 'string' ? parseFloat(fp.price) || 0 : fp.price,
      currency: fp.currency ?? 'EUR',
      price_text: `${fp.currency === 'EUR' ? '€' : fp.currency ?? '€'}${Number(fp.price).toLocaleString()}`,
    } : undefined,
    rooms: fp.rooms,
    bathrooms: fp.bathrooms,
    size_m2: fp.areaSqm,
    features: fp.features ?? [],
    media: {
      hero_image: primaryImage,
      gallery,
      videos: fp.videoUrl ? [fp.videoUrl] : [],
      floorplans: (fp.documents ?? []).filter(d => d.category === 'plan').map(d => d.url),
    },
    marketing: deriveMarketingFlags(fp, previousSnapshot),
    seo: { url: fp.websiteUrl || (baseUrl ? `${baseUrl.replace(/\/api\/v1$/, '')}/property/${fp.id}` : '') },
    updated_at: new Date().toISOString(),
  };
}

/** Derive features from project's child properties when the project itself has none. */
function deriveProjectFeatures(proj: FindUsProject): string[] {
  const featureSet = new Set<string>();
  for (const p of proj.properties ?? []) {
    for (const f of p.features ?? []) featureSet.add(f);
  }
  return [...featureSet].slice(0, 10);
}

/** Collect video URLs from project's child properties. */
function collectProjectVideos(proj: FindUsProject): string[] {
  const videos: string[] = [];
  for (const p of proj.properties ?? []) {
    if (p.videoUrl) videos.push(p.videoUrl);
  }
  return videos;
}

function mapFindUsProject(proj: FindUsProject, baseUrl?: string): Record<string, unknown> {
  const images = proj.images ?? [];
  const primaryImage = images.find(i => i.isPrimary)?.url ?? images[0]?.url;

  const hasTitle = !!proj.title;
  const hasCity = !!proj.city;
  const hasImages = images.length > 0;

  // Derive marketing flags from real project data
  let priority_score = 0;
  if (hasTitle) priority_score += 20;
  if (hasCity) priority_score += 15;
  if (hasImages) priority_score += 15;
  if (images.length >= 3) priority_score += 10;
  if (proj.developerName) priority_score += 10;
  if (proj.totalUnits != null) priority_score += 10;
  if (proj.completionDate) priority_score += 10;
  if (proj.description) priority_score += 10;

  const angles: string[] = [];
  if (proj.city) angles.push('location');
  if (proj.totalUnits != null) angles.push('investment');
  if (proj.completionDate) angles.push('new_development');
  if (angles.length === 0) angles.push('location');

  return {
    id: proj.id,
    type: 'project',
    status: 'active',
    title: {
      he: proj.title ?? '',
      en: proj.title ?? '',
    },
    descriptions: {
      short: {
        he: proj.developerName ? `פרויקט של ${proj.developerName}` : '',
        en: proj.developerName ? `Project by ${proj.developerName}` : '',
      },
    },
    country: proj.country ?? '',
    city: proj.city ?? '',
    total_units: proj.totalUnits,
    features: proj.features ?? deriveProjectFeatures(proj),
    delivery: proj.completionDate ? {
      status: 'under_construction',
      expected_date: proj.completionDate,
    } : undefined,
    media: {
      hero_image: primaryImage,
      gallery: images.map(i => i.url),
      videos: proj.videoUrl ? [proj.videoUrl] : collectProjectVideos(proj),
    },
    marketing: {
      campaign_ready: hasTitle && hasCity && hasImages,
      priority_score,
      target_audiences: ['investors'],
      angles,
      languages: ['he', 'en'],
    },
    seo: { url: baseUrl ? `${baseUrl.replace(/\/api\/v1$/, '')}/project/${proj.id}` : '' },
    updated_at: new Date().toISOString(),
  };
}

export interface SyncResult {
  properties_fetched: number;
  projects_fetched: number;
  properties_ingested: IngestResult[];
  projects_ingested: IngestResult[];
  pipeline?: {
    candidates: number;
    selected: number;
    variants: number;
    approvals: number;
  };
  synced_at: string;
  errors: string[];
}

/**
 * Fetch properties from FindUS API.
 * @param since — ISO timestamp for incremental sync (only fetch updated after this point)
 */
export async function fetchProperties(config: FindUsConfig, since?: string): Promise<FindUsProperty[]> {
  const params = new URLSearchParams();
  params.set('limit', '100');
  if (config.filters.city) params.set('city', config.filters.city);
  if (config.filters.propertyType) params.set('propertyType', config.filters.propertyType);
  if (since) params.set('updated_since', since);

  const allProperties: FindUsProperty[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    params.set('page', String(page));
    const result = await apiFetch(`/properties?${params}`, config);
    const data: FindUsProperty[] = result.data ?? result ?? [];
    allProperties.push(...data);
    hasMore = data.length >= 100;
    page++;
  }

  return allProperties;
}

/**
 * Fetch projects from FindUS API.
 * @param since — ISO timestamp for incremental sync
 */
export async function fetchProjects(config: FindUsConfig, since?: string): Promise<FindUsProject[]> {
  const params = new URLSearchParams();
  if (since) params.set('updated_since', since);
  const endpoint = params.toString() ? `/projects?${params}` : '/projects';
  const result = await apiFetch(endpoint, config);
  return result.data ?? result ?? [];
}

export async function syncFromFindUs(runPipeline: boolean = true, clientId?: string, clientApiConfig?: { base_url: string; api_token: string; filters?: { city?: string; propertyType?: string } }): Promise<SyncResult> {
  const config: FindUsConfig = clientApiConfig
    ? { ...DEFAULT_CONFIG, api_token: clientApiConfig.api_token, base_url: clientApiConfig.base_url, filters: clientApiConfig.filters ?? {} }
    : await loadConfig();
  const errors: string[] = [];
  const propertyResults: IngestResult[] = [];
  const projectResults: IngestResult[] = [];

  // Track this sync run in source_sync_runs
  const { v4: uuidv4 } = await import('uuid');
  const syncRunId = uuidv4();
  const lastCheckpoint = await store.getLastSyncCheckpoint();
  await store.createSyncRun(syncRunId, lastCheckpoint ?? undefined);
  const syncLog = log.child({ run_id: syncRunId, client_id: clientId });

  syncLog.info('sync.start', lastCheckpoint
    ? `Incremental sync since ${lastCheckpoint}`
    : 'Full sync (no prior checkpoint)');

  let properties: FindUsProperty[] = [];
  let projects: FindUsProject[] = [];

  // Fetch properties (incremental when checkpoint exists, full otherwise)
  try {
    properties = await fetchProperties(config, lastCheckpoint ?? undefined);
    syncLog.info('sync.fetch', `Fetched ${properties.length} properties`);
  } catch (err: any) {
    errors.push(`Properties fetch failed: ${err.message}`);
    syncLog.error('sync.fetch', `Properties fetch failed: ${err.message}`);
  }

  // Fetch projects
  try {
    projects = await fetchProjects(config, lastCheckpoint ?? undefined);
    syncLog.info('sync.fetch', `Fetched ${projects.length} projects`);
  } catch (err: any) {
    errors.push(`Projects fetch failed: ${err.message}`);
    syncLog.error('sync.fetch', `Projects fetch failed: ${err.message}`);
  }

  // Ingest properties — pass previous snapshot so marketing flags are derived from real delta
  for (const fp of properties) {
    try {
      const existing = await store.getEntityBySourceId('property', fp.id);
      let previousPayload: Record<string, unknown> | undefined;
      if (existing) {
        const snapshots = await store.getSnapshots(existing.id);
        previousPayload = snapshots[0]?.normalized_payload;
      }
      const mapped = mapFindUsProperty(fp, previousPayload, config.base_url);
      const result = await ingestProperty(mapped, clientId);
      propertyResults.push(result);
      syncLog.info('sync.ingest', `Property ${fp.id}: ${result.is_new ? 'new' : result.changed ? result.change_type : 'unchanged'}`, {
        source_entity_id: fp.id, entity_id: result.entity_id,
      });
    } catch (err: any) {
      errors.push(`Property ${fp.id}: ${err.message}`);
      syncLog.error('sync.ingest', `Property ${fp.id} failed: ${err.message}`, { source_entity_id: fp.id });
    }
  }

  // Ingest projects
  for (const proj of projects) {
    try {
      const mapped = mapFindUsProject(proj, config.base_url);
      const result = await ingestProject(mapped, clientId);
      projectResults.push(result);
      syncLog.info('sync.ingest', `Project ${proj.id}: ${result.is_new ? 'new' : result.changed ? result.change_type : 'unchanged'}`, {
        source_entity_id: proj.id, entity_id: result.entity_id,
      });
    } catch (err: any) {
      errors.push(`Project ${proj.id}: ${err.message}`);
      syncLog.error('sync.ingest', `Project ${proj.id} failed: ${err.message}`, { source_entity_id: proj.id });
    }
  }

  // Delete stale entities not in the current API response
  if (clientId && (properties.length > 0 || projects.length > 0)) {
    const currentSourceIds = [
      ...properties.map(p => p.id),
      ...projects.map(p => p.id),
    ];
    const deleted = await store.deleteStaleEntities(clientId, currentSourceIds);
    if (deleted > 0) {
      syncLog.info('sync.cleanup', `Removed ${deleted} stale entities not in current API response`);
    }
    // Clean old candidates — they'll be regenerated by the pipeline
    const deletedCandidates = await store.deleteCandidatesByClient(clientId);
    if (deletedCandidates > 0) {
      syncLog.info('sync.cleanup', `Cleared ${deletedCandidates} old candidates`);
    }
    // Clean unapproved creatives — approved ones are preserved
    const deletedCreatives = await store.deleteUnapprovedCreatives(clientId);
    if (deletedCreatives > 0) {
      syncLog.info('sync.cleanup', `Cleared ${deletedCreatives} unapproved creatives`);
    }
  }

  // Run pipeline
  let pipeline;
  if (runPipeline && (propertyResults.length > 0 || projectResults.length > 0)) {
    const pResult = await runDailyPipeline(undefined, clientId);
    pipeline = {
      candidates: pResult.candidates,
      selected: pResult.selected,
      variants: pResult.variants,
      approvals: pResult.approvals,
    };
  }

  const syncedAt = new Date().toISOString();
  await saveConfig({ last_sync_at: syncedAt });

  // Finalize sync run tracking
  const stats = {
    properties_fetched: properties.length,
    projects_fetched: projects.length,
    properties_ingested: propertyResults.length,
    projects_ingested: projectResults.length,
    new_entities: propertyResults.filter(r => r.is_new).length + projectResults.filter(r => r.is_new).length,
    changed_entities: propertyResults.filter(r => r.changed).length + projectResults.filter(r => r.changed).length,
    errors: errors.length,
  };
  const syncStatus = errors.length > 0 && (propertyResults.length + projectResults.length) === 0 ? 'failed' : 'completed';
  await store.finishSyncRun(syncRunId, syncStatus, stats, errors.length > 0 ? errors.join('; ') : undefined);

  syncLog.info('sync.complete', `Sync ${syncStatus}: ${stats.properties_ingested} properties, ${stats.projects_ingested} projects, ${stats.new_entities} new, ${stats.changed_entities} changed, ${stats.errors} errors`);

  return {
    properties_fetched: properties.length,
    projects_fetched: projects.length,
    properties_ingested: propertyResults,
    projects_ingested: projectResults,
    pipeline,
    synced_at: syncedAt,
    errors,
  };
}

export async function testConnection(token: string, baseUrl: string): Promise<{ success: boolean; message: string; property_count?: number }> {
  try {
    const config: FindUsConfig = { ...DEFAULT_CONFIG, api_token: token, base_url: baseUrl };
    const params = new URLSearchParams({ limit: '1' });
    const result = await apiFetch(`/properties?${params}`, config);
    const data = result.data ?? result ?? [];
    return {
      success: true,
      message: `Connected successfully. Found properties.`,
      property_count: Array.isArray(data) ? data.length : undefined,
    };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}
