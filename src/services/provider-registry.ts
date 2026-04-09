/**
 * API Provider Registry — dispatches sync/test to the correct provider module.
 *
 * Provider definitions are stored in app_config key 'api_providers'.
 * Each client references a provider via client.api_config.provider_id.
 */

import { store } from '../db/store';
import { syncFromFindUs, testConnection as testFindUs } from './findus-client';
import * as log from '../lib/logger';

// ── Types ──

export interface ApiProviderDefinition {
  id: string;
  name: string;
  type: 'findus' | 'generic_rest';
  default_base_url: string;
  auth_type: 'bearer' | 'api_key_header' | 'query_param';
  auth_header_name?: string;
  auth_query_param?: string;
  endpoints?: {
    properties?: string;
    projects?: string;
  };
  field_mapping?: Record<string, string>;
  description?: string;
  is_builtin?: boolean;
  created_at?: string;
}

export interface SyncResult {
  success: boolean;
  properties_fetched?: number;
  projects_fetched?: number;
  new_entities?: number;
  changed_entities?: number;
  errors?: string[];
  pipeline?: any;
}

export interface ApiProvider {
  sync(clientId: string, apiConfig: any, runPipeline: boolean): Promise<SyncResult>;
  testConnection(token: string, baseUrl: string, providerDef?: ApiProviderDefinition): Promise<{ success: boolean; message: string; property_count?: number }>;
}

// ── FindUS adapter (wraps existing findus-client.ts) ──

const findusProvider: ApiProvider = {
  async sync(clientId, apiConfig, runPipeline) {
    const config = {
      base_url: String(apiConfig.base_url || ''),
      api_token: String(apiConfig.api_token || ''),
      filters: {
        city: apiConfig.filters?.city ? String(apiConfig.filters.city) : undefined,
        propertyType: apiConfig.filters?.propertyType ? String(apiConfig.filters.propertyType) : undefined,
      },
    };
    const result = await syncFromFindUs(runPipeline, clientId, config) as any;
    return {
      success: !result.errors?.length || (result.properties?.length > 0 || result.projects?.length > 0),
      properties_fetched: result.properties?.length ?? 0,
      projects_fetched: result.projects?.length ?? 0,
      new_entities: (result.properties || []).filter((r: any) => r.is_new).length + (result.projects || []).filter((r: any) => r.is_new).length,
      errors: result.errors,
      pipeline: result.pipeline,
    };
  },
  async testConnection(token, baseUrl) {
    return testFindUs(token, baseUrl);
  },
};

// ── Provider dispatch ──

export function getProvider(providerId: string): ApiProvider {
  switch (providerId) {
    case 'findus':
      return findusProvider;
    case 'generic_rest': {
      const { genericRestProvider } = require('./generic-rest-client');
      return genericRestProvider;
    }
    default:
      return findusProvider;
  }
}

// ── Provider CRUD (stored in app_config) ──

const CONFIG_KEY = 'api_providers';

const BUILTIN_FINDUS: ApiProviderDefinition = {
  id: 'findus',
  name: 'FindUS / Aradre',
  type: 'findus',
  default_base_url: 'https://www.findus.co.il/api/v1',
  auth_type: 'bearer',
  description: 'FindUS real-estate platform API (properties & projects)',
  is_builtin: true,
  created_at: '2026-01-01T00:00:00.000Z',
};

export async function listProviders(): Promise<ApiProviderDefinition[]> {
  const saved = await store.getConfig(CONFIG_KEY);
  if (!saved || !Array.isArray(saved) || saved.length === 0) {
    // Seed with FindUS on first access
    await store.setConfig(CONFIG_KEY, [BUILTIN_FINDUS]);
    return [BUILTIN_FINDUS];
  }
  // Ensure FindUS is always present
  if (!saved.find((p: any) => p.id === 'findus')) {
    saved.unshift(BUILTIN_FINDUS);
    await store.setConfig(CONFIG_KEY, saved);
  }
  return saved;
}

export async function getProviderDef(id: string): Promise<ApiProviderDefinition | undefined> {
  const all = await listProviders();
  return all.find(p => p.id === id);
}

export async function saveProvider(def: ApiProviderDefinition): Promise<ApiProviderDefinition[]> {
  const all = await listProviders();
  const idx = all.findIndex(p => p.id === def.id);
  if (idx >= 0) {
    // Don't allow changing builtin type
    if (all[idx].is_builtin) def.is_builtin = true;
    all[idx] = { ...all[idx], ...def };
  } else {
    def.created_at = def.created_at || new Date().toISOString();
    all.push(def);
  }
  await store.setConfig(CONFIG_KEY, all);
  return all;
}

export async function deleteProvider(id: string): Promise<boolean> {
  if (id === 'findus') return false; // Cannot delete builtin
  const all = await listProviders();
  const filtered = all.filter(p => p.id !== id);
  if (filtered.length === all.length) return false;
  await store.setConfig(CONFIG_KEY, filtered);
  return true;
}
