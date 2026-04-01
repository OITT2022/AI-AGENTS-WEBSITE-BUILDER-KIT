/**
 * Canva Connect API adapter.
 *
 * All credentials come from ENV variables:
 *   CANVA_CLIENT_ID        – OAuth app client ID
 *   CANVA_CLIENT_SECRET     – OAuth app client secret
 *   CANVA_BRAND_ID          – default brand kit (optional, can be per-client)
 *
 * Per-client OAuth tokens are stored in clients.canva_config via the store.
 */

import { store } from '../db/store';
import { Client } from '../models/schemas';

const CANVA_API = 'https://api.canva.com/rest/v1';

// ── Config ──

interface CanvaEnv {
  clientId: string;
  clientSecret: string;
  brandId: string;
}

function getEnv(): CanvaEnv {
  const clientId = process.env.CANVA_CLIENT_ID?.trim() ?? '';
  const clientSecret = process.env.CANVA_CLIENT_SECRET?.trim() ?? '';
  const brandId = process.env.CANVA_BRAND_ID?.trim() ?? '';
  return { clientId, clientSecret, brandId };
}

function requireEnv(): CanvaEnv {
  const env = getEnv();
  if (!env.clientId || !env.clientSecret) {
    throw new Error('CANVA_CLIENT_ID and CANVA_CLIENT_SECRET must be set');
  }
  return env;
}

// ── Types ──

export interface CanvaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

export interface CanvaTemplate {
  id: string;
  title: string;
  thumbnail_url?: string;
  width: number;
  height: number;
}

export interface CanvaDesign {
  id: string;
  title: string;
  edit_url: string;
  thumbnail_url?: string;
  status: string;
}

export interface CanvaExportResult {
  export_id: string;
  status: 'in_progress' | 'completed' | 'failed';
  urls?: string[];
}

export interface CanvaDataBinding {
  [placeholder: string]: string;
}

// ── OAuth ──

export function getCanvaAuthUrl(clientId: string, redirectUri: string): string {
  const env = requireEnv();
  const scopes = 'design:content:read design:content:write asset:read asset:write brandtemplate:content:read brandtemplate:meta:read';
  return `https://www.canva.com/api/oauth/authorize?client_id=${env.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${clientId}`;
}

export async function exchangeCanvaCode(code: string, redirectUri: string): Promise<CanvaTokens> {
  const env = requireEnv();
  const res = await fetch(`${CANVA_API}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${env.clientId}:${env.clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });
  const data: any = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
  };
}

export async function refreshCanvaToken(refreshToken: string): Promise<CanvaTokens> {
  const env = requireEnv();
  const res = await fetch(`${CANVA_API}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${env.clientId}:${env.clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  const data: any = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expires_at: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
  };
}

// ── Authenticated API calls ──

async function canvaFetch(path: string, accessToken: string, options?: RequestInit): Promise<any> {
  const res = await fetch(`${CANVA_API}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Canva API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** Get a valid access token for a client, refreshing if expired. */
async function getClientToken(client: Client): Promise<string> {
  const config = (client as any).canva_config as CanvaTokens | undefined;
  if (!config?.access_token) throw new Error('Canva not connected for this client');
  // Refresh if expired (with 5min buffer)
  if (config.expires_at && new Date(config.expires_at).getTime() < Date.now() + 300_000) {
    if (!config.refresh_token) throw new Error('Canva refresh token missing — re-authorize');
    const refreshed = await refreshCanvaToken(config.refresh_token);
    (client as any).canva_config = refreshed;
    client.updated_at = new Date().toISOString();
    await store.upsertClient(client);
    return refreshed.access_token;
  }
  return config.access_token;
}

// ── Templates ──

export async function listTemplates(client: Client): Promise<CanvaTemplate[]> {
  const token = await getClientToken(client);
  const env = getEnv();
  const brandId = env.brandId;
  const path = brandId
    ? `/brand-templates?brand_id=${brandId}&limit=50`
    : '/brand-templates?limit=50';
  const data = await canvaFetch(path, token);
  return (data.items ?? []).map((t: any) => ({
    id: t.id,
    title: t.title,
    thumbnail_url: t.thumbnail?.url,
    width: t.width ?? 0,
    height: t.height ?? 0,
  }));
}

// ── Design creation ──

export async function createDesignFromTemplate(
  client: Client,
  templateId: string,
  title: string,
  dataBindings: CanvaDataBinding,
): Promise<CanvaDesign> {
  const token = await getClientToken(client);
  const data = await canvaFetch('/designs', token, {
    method: 'POST',
    body: JSON.stringify({
      design_type: 'brand_template',
      brand_template_id: templateId,
      title,
      data: dataBindings,
    }),
  });
  const design = data.design ?? data;
  return {
    id: design.id,
    title: design.title ?? title,
    edit_url: design.urls?.edit_url ?? `https://www.canva.com/design/${design.id}/edit`,
    thumbnail_url: design.thumbnail?.url,
    status: design.status ?? 'created',
  };
}

// ── Export ──

export async function startExport(
  client: Client,
  designId: string,
  format: 'png' | 'jpg' | 'pdf' = 'png',
): Promise<CanvaExportResult> {
  const token = await getClientToken(client);
  const data = await canvaFetch('/exports', token, {
    method: 'POST',
    body: JSON.stringify({
      design_id: designId,
      format: { type: format },
    }),
  });
  const exp = data.export ?? data;
  return {
    export_id: exp.id,
    status: exp.status ?? 'in_progress',
    urls: exp.urls,
  };
}

export async function getExportStatus(client: Client, exportId: string): Promise<CanvaExportResult> {
  const token = await getClientToken(client);
  const data = await canvaFetch(`/exports/${exportId}`, token);
  const exp = data.export ?? data;
  return {
    export_id: exp.id,
    status: exp.status,
    urls: exp.urls,
  };
}

/** Poll export until complete or timeout (default 60s). */
export async function waitForExport(client: Client, exportId: string, timeoutMs = 60_000): Promise<CanvaExportResult> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await getExportStatus(client, exportId);
    if (result.status === 'completed' || result.status === 'failed') return result;
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`Canva export ${exportId} timed out after ${timeoutMs}ms`);
}

// ── Asset upload ──

export async function uploadAsset(
  client: Client,
  imageUrl: string,
  name: string,
): Promise<{ asset_id: string }> {
  const token = await getClientToken(client);
  const data = await canvaFetch('/assets', token, {
    method: 'POST',
    body: JSON.stringify({
      name,
      url: imageUrl,
    }),
  });
  return { asset_id: data.asset?.id ?? data.id };
}

// ── Connection status ──

export function isConfigured(): boolean {
  const env = getEnv();
  return !!(env.clientId && env.clientSecret);
}

export function isClientConnected(client: Client): boolean {
  return !!((client as any).canva_config?.access_token);
}

// ── Data mapper: normalized payload → Canva template placeholders ──

export function mapPropertyToBindings(
  payload: Record<string, unknown>,
  copyJson: Record<string, unknown>,
  mediaUrls: string[],
): CanvaDataBinding {
  return {
    '{{title}}': String(payload.title_he || payload.title_en || ''),
    '{{title_en}}': String(payload.title_en || ''),
    '{{title_he}}': String(payload.title_he || ''),
    '{{price}}': String(payload.price_text || ''),
    '{{city}}': String(payload.city || ''),
    '{{area}}': String(payload.area || ''),
    '{{rooms}}': payload.rooms != null ? String(payload.rooms) : '',
    '{{size}}': payload.size_m2 != null ? `${payload.size_m2}m²` : '',
    '{{headline}}': String(copyJson.headline || copyJson.cover_text || ''),
    '{{description}}': String(copyJson.description || copyJson.caption || ''),
    '{{cta}}': String(copyJson.cta || ''),
    '{{hero_image}}': mediaUrls[0] || '',
    '{{image_2}}': mediaUrls[1] || '',
    '{{image_3}}': mediaUrls[2] || '',
  };
}
