import { PropertyPayloadSchema } from '../models/schemas';
import { ingestProperty, ingestProject, IngestResult } from './ingest';
import { runDailyPipeline } from './pipeline';
import { store } from '../db/store';

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
  images?: Array<{ url: string; isPrimary?: boolean }>;
  documents?: Array<{ url: string; category: string }>;
  properties?: FindUsProperty[];
  [key: string]: unknown;
}

function mapFindUsProperty(fp: FindUsProperty): Record<string, unknown> {
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
    country: fp.country ?? 'Cyprus',
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
    marketing: {
      campaign_ready: true,
      priority_score: 70,
      target_audiences: ['investors', 'families'],
      angles: ['location', 'value'],
      urgent: false,
      is_new: false,
      price_changed: false,
      video_preferred: !!fp.videoUrl,
      languages: ['he', 'en'],
    },
    seo: { url: fp.websiteUrl || `https://www.findus.co.il/property/${fp.id}` },
    updated_at: new Date().toISOString(),
  };
}

function mapFindUsProject(proj: FindUsProject): Record<string, unknown> {
  const images = proj.images ?? [];
  const primaryImage = images.find(i => i.isPrimary)?.url ?? images[0]?.url;

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
    country: proj.country ?? 'Cyprus',
    city: proj.city ?? '',
    total_units: proj.totalUnits,
    features: [],
    delivery: proj.completionDate ? {
      status: 'under_construction',
      expected_date: proj.completionDate,
    } : undefined,
    media: {
      hero_image: primaryImage,
      gallery: images.map(i => i.url),
      videos: [],
    },
    marketing: {
      campaign_ready: true,
      priority_score: 75,
      target_audiences: ['investors'],
      angles: ['investment', 'location'],
      languages: ['he', 'en'],
    },
    seo: { url: `https://www.findus.co.il/project/${proj.id}` },
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

export async function fetchProperties(config: FindUsConfig): Promise<FindUsProperty[]> {
  const params = new URLSearchParams();
  params.set('limit', '100');
  if (config.filters.city) params.set('city', config.filters.city);
  if (config.filters.propertyType) params.set('propertyType', config.filters.propertyType);

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

export async function fetchProjects(config: FindUsConfig): Promise<FindUsProject[]> {
  const result = await apiFetch('/projects', config);
  return result.data ?? result ?? [];
}

export async function syncFromFindUs(runPipeline: boolean = true, clientId?: string, clientApiConfig?: { base_url: string; api_token: string; filters?: { city?: string; propertyType?: string } }): Promise<SyncResult> {
  const baseConfig = await loadConfig();
  const config = clientApiConfig ? { ...baseConfig, ...clientApiConfig, filters: clientApiConfig.filters ?? {} } : baseConfig;
  const errors: string[] = [];
  const propertyResults: IngestResult[] = [];
  const projectResults: IngestResult[] = [];

  let properties: FindUsProperty[] = [];
  let projects: FindUsProject[] = [];

  // Fetch properties
  try {
    properties = await fetchProperties(config);
  } catch (err: any) {
    errors.push(`Properties fetch failed: ${err.message}`);
  }

  // Fetch projects
  try {
    projects = await fetchProjects(config);
  } catch (err: any) {
    errors.push(`Projects fetch failed: ${err.message}`);
  }

  // Ingest properties
  for (const fp of properties) {
    try {
      const mapped = mapFindUsProperty(fp);
      const result = await ingestProperty(mapped, clientId);
      propertyResults.push(result);
    } catch (err: any) {
      errors.push(`Property ${fp.id}: ${err.message}`);
    }
  }

  // Ingest projects
  for (const proj of projects) {
    try {
      const mapped = mapFindUsProject(proj);
      const result = await ingestProject(mapped, clientId);
      projectResults.push(result);
    } catch (err: any) {
      errors.push(`Project ${proj.id}: ${err.message}`);
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
