/**
 * Generic REST API provider — connects to any REST API that returns
 * property/project listings. Uses configurable endpoints, auth, and
 * field mapping from the provider definition.
 */

import { ingestProperty, ingestProject } from './ingest';
import { store } from '../db/store';
import { runDailyPipeline } from './pipeline';
import { getProviderDef, ApiProvider, ApiProviderDefinition, SyncResult } from './provider-registry';
import * as log from '../lib/logger';

// ── HTTP helper with configurable auth ──

async function apiFetch(url: string, token: string, providerDef: ApiProviderDefinition): Promise<any> {
  const headers: Record<string, string> = { 'Accept': 'application/json' };

  switch (providerDef.auth_type) {
    case 'bearer':
      headers['Authorization'] = `Bearer ${token}`;
      break;
    case 'api_key_header':
      headers[providerDef.auth_header_name || 'X-API-Key'] = token;
      break;
    case 'query_param': {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}${providerDef.auth_query_param || 'api_key'}=${encodeURIComponent(token)}`;
      break;
    }
  }

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json();
}

// ── Field mapping ──

function mapFields(raw: Record<string, any>, mapping: Record<string, string>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [targetField, sourceField] of Object.entries(mapping)) {
    // Support dot notation: "location.city" -> raw.location?.city
    const parts = sourceField.split('.');
    let value: any = raw;
    for (const p of parts) {
      value = value?.[p];
    }
    if (value !== undefined) result[targetField] = value;
  }
  return result;
}

const DEFAULT_PROPERTY_MAPPING: Record<string, string> = {
  id: 'id',
  title: 'title',
  status: 'status',
  city: 'city',
  country: 'country',
  area: 'area',
  price_amount: 'price',
  price_currency: 'currency',
  rooms: 'rooms',
  bathrooms: 'bathrooms',
  size_m2: 'area_sqm',
  hero_image: 'image',
  description: 'description',
  url: 'url',
};

function normalizeGenericProperty(raw: any, mapping: Record<string, string>, baseUrl: string): Record<string, unknown> {
  const m = { ...DEFAULT_PROPERTY_MAPPING, ...mapping };
  const mapped = mapFields(raw, m);

  // Build normalized payload matching what ingestProperty expects
  const title = mapped.title || '';
  const images = raw.images || raw.gallery || raw.photos || [];
  const imageUrls = Array.isArray(images) ? images.map((i: any) => typeof i === 'string' ? i : i.url || i.src || '') .filter(Boolean) : [];
  const heroImage = mapped.hero_image || imageUrls[0] || null;

  return {
    id: String(mapped.id || raw.id || ''),
    type: 'property',
    status: mapped.status || 'active',
    title: typeof title === 'object' ? title : { he: String(title), en: String(title) },
    country: mapped.country || '',
    city: mapped.city || '',
    area: mapped.area || '',
    price: {
      amount: Number(mapped.price_amount) || null,
      currency: mapped.price_currency || 'EUR',
      price_text: mapped.price_amount ? `${mapped.price_currency || '€'}${Number(mapped.price_amount).toLocaleString()}` : null,
    },
    rooms: mapped.rooms || null,
    bathrooms: mapped.bathrooms || null,
    size_m2: mapped.size_m2 || null,
    media: {
      hero_image: heroImage,
      gallery: imageUrls,
      videos: raw.videos || [],
    },
    descriptions: {
      short: typeof mapped.description === 'object' ? mapped.description : { he: mapped.description || '', en: mapped.description || '' },
    },
    features: raw.features || [],
    marketing: {
      campaign_ready: !!(title && mapped.city && (heroImage || imageUrls.length > 0)),
      priority_score: 50,
      target_audiences: ['general'],
      angles: ['location'],
      languages: ['he', 'en'],
    },
    seo: { url: mapped.url || raw.websiteUrl || raw.listing_url || '' },
    updated_at: raw.updated_at || raw.updatedAt || new Date().toISOString(),
  };
}

function normalizeGenericProject(raw: any, mapping: Record<string, string>, baseUrl: string): Record<string, unknown> {
  const prop = normalizeGenericProperty(raw, mapping, baseUrl);
  return { ...prop, type: 'project', total_units: raw.total_units || raw.totalUnits || null };
}

// ── Provider implementation ──

export const genericRestProvider: ApiProvider = {
  async sync(clientId, apiConfig, runPipeline) {
    const providerId = apiConfig.provider_id || 'generic_rest';
    const providerDef = await getProviderDef(providerId);
    if (!providerDef) throw new Error(`Provider ${providerId} not found`);

    const baseUrl = apiConfig.base_url || providerDef.default_base_url;
    const token = apiConfig.api_token;
    if (!token) throw new Error('API token is required');

    const propEndpoint = providerDef.endpoints?.properties || '/properties';
    const projEndpoint = providerDef.endpoints?.projects || '/projects';
    const mapping = providerDef.field_mapping || {};
    const errors: string[] = [];
    const propertyResults: any[] = [];
    const projectResults: any[] = [];

    const syncLog = log.child({ provider: providerId, client_id: clientId });
    syncLog.info('sync.start', `Generic REST sync from ${baseUrl}`);

    // Fetch properties
    try {
      let url = `${baseUrl}${propEndpoint}`;
      // Add filters as query params
      const params = new URLSearchParams();
      if (apiConfig.filters?.city) params.set('city', apiConfig.filters.city);
      if (apiConfig.filters?.propertyType) params.set('type', apiConfig.filters.propertyType);
      if (params.toString()) url += (url.includes('?') ? '&' : '?') + params.toString();

      const data = await apiFetch(url, token, providerDef);
      const items = Array.isArray(data) ? data : data.data || data.results || data.items || data.properties || [];
      syncLog.info('sync.fetch', `Fetched ${items.length} properties`);

      for (const raw of items) {
        try {
          const mapped = normalizeGenericProperty(raw, mapping, baseUrl);
          const result = await ingestProperty(mapped, clientId);
          propertyResults.push(result);
        } catch (err) {
          errors.push(`Property ${raw.id}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      errors.push(`Properties fetch failed: ${(err as Error).message}`);
      syncLog.error('sync.fetch', `Properties: ${(err as Error).message}`);
    }

    // Fetch projects (optional — skip gracefully if endpoint doesn't exist)
    try {
      let url = `${baseUrl}${projEndpoint}`;
      const data = await apiFetch(url, token, providerDef);
      const items = Array.isArray(data) ? data : data.data || data.results || data.items || data.projects || [];
      syncLog.info('sync.fetch', `Fetched ${items.length} projects`);

      for (const raw of items) {
        try {
          const mapped = normalizeGenericProject(raw, mapping, baseUrl);
          const result = await ingestProject(mapped, clientId);
          projectResults.push(result);
        } catch (err) {
          errors.push(`Project ${raw.id}: ${(err as Error).message}`);
        }
      }
    } catch {
      // Projects endpoint is optional — many APIs don't have it
    }

    // Cleanup stale + run pipeline
    if (clientId && (propertyResults.length > 0 || projectResults.length > 0)) {
      const currentIds = [
        ...propertyResults.map((r: any) => r.source_entity_id),
        ...projectResults.map((r: any) => r.source_entity_id),
      ];
      await store.deleteStaleEntities(clientId, currentIds);
      await store.deleteCandidatesByClient(clientId);
      await store.deleteUnapprovedCreatives(clientId);
    }

    let pipeline;
    if (runPipeline && (propertyResults.length > 0 || projectResults.length > 0)) {
      pipeline = await runDailyPipeline(undefined, clientId);
    }

    return {
      success: errors.length === 0 || propertyResults.length > 0,
      properties_fetched: propertyResults.length,
      projects_fetched: projectResults.length,
      new_entities: propertyResults.filter((r: any) => r.is_new).length,
      errors,
      pipeline,
    };
  },

  async testConnection(token, baseUrl, providerDef) {
    if (!providerDef) return { success: false, message: 'Provider definition required' };
    try {
      const endpoint = providerDef.endpoints?.properties || '/properties';
      const url = `${baseUrl}${endpoint}?limit=1`;
      const data = await apiFetch(url, token, providerDef);
      const items = Array.isArray(data) ? data : data.data || data.results || data.items || [];
      return { success: true, message: `Connected. Found ${items.length} items.`, property_count: items.length };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  },
};
