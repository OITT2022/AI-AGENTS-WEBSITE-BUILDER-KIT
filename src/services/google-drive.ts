import { GoogleAuth } from 'google-auth-library';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';
import { store } from '../db/store';
import { DriveMediaFile, DriveMediaCacheRow, Client } from '../models/schemas';

import { getWritableBaseDir } from '../lib/platform';
const CREDENTIALS_PATH = path.join(getWritableBaseDir(), 'data', 'google-credentials.json');
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff'];
const VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/mpeg'];
const MEDIA_MIMES = [...IMAGE_MIMES, ...VIDEO_MIMES];

// ── Auth ──

function getCredentials(): Record<string, unknown> | null {
  if (!fs.existsSync(CREDENTIALS_PATH)) return null;
  return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
}

export function hasCredentials(): boolean { return fs.existsSync(CREDENTIALS_PATH); }

export function saveCredentials(credentials: Record<string, unknown>): void {
  const dir = path.dirname(CREDENTIALS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2));
}

export function getServiceAccountEmail(): string | null {
  return (getCredentials()?.client_email as string) ?? null;
}

async function getServiceAccountToken(): Promise<string> {
  const creds = getCredentials();
  if (!creds) throw new Error('Google credentials not configured. Upload a service account JSON key file.');
  const auth = new GoogleAuth({ credentials: creds as any, scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return (token as any).token ?? token;
}

// Get access token using client's stored OAuth refresh token
export async function getOAuthAccessToken(client: Client): Promise<string | null> {
  if (!client.google_refresh_token) return null;
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret,
        refresh_token: client.google_refresh_token, grant_type: 'refresh_token',
      }),
    });
    const data = await res.json() as any;
    if (data.error) { console.error('OAuth refresh failed:', data.error); return null; }
    return data.access_token;
  } catch (err) { console.error('OAuth refresh error:', err); return null; }
}

// Get best available token: OAuth refresh token first, then service account
async function getAccessToken(client?: Client): Promise<string> {
  if (client) {
    const oauthToken = await getOAuthAccessToken(client);
    if (oauthToken) return oauthToken;
  }
  return getServiceAccountToken();
}

async function driveGet(apiPath: string, client?: Client): Promise<any> {
  const token = await getAccessToken(client);
  const res = await fetch(`${DRIVE_API}${apiPath}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive API error: ${res.status} ${await res.text()}`);
  return res.json();
}

async function driveGetWithClient(apiPath: string, client: Client): Promise<any> {
  return driveGet(apiPath, client);
}

// ── Extract folder ID ──

export function extractFolderId(urlOrId: string): string {
  if (!urlOrId) throw new Error('No folder URL or ID provided');
  if (/^[a-zA-Z0-9_-]{10,}$/.test(urlOrId)) return urlOrId;
  const m = urlOrId.match(/folders\/([a-zA-Z0-9_-]+)/) ?? urlOrId.match(/id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  throw new Error('Cannot extract folder ID from: ' + urlOrId);
}

// ── List files ──

// Browse a folder — returns folders and media items (non-recursive, for the picker UI)
export async function browseDriveFolder(folderId: string): Promise<Array<{ id: string; name: string; type: string; mimeType: string; size?: number; childCount?: string }>> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent('files(id, name, mimeType, size)');
  const data = await driveGet(`/files?q=${q}&pageSize=200&fields=${fields}&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=folder,name`);
  return (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    type: f.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
    mimeType: f.mimeType,
    size: f.size ? parseInt(f.size) : undefined,
  }));
}

export async function listFolderFiles(folderId: string, recursive = true, client?: Client): Promise<DriveMediaFile[]> {
  const files: DriveMediaFile[] = [];

  async function fetchPage(parentId: string, pageToken?: string) {
    const q = encodeURIComponent(`'${parentId}' in parents and trashed = false`);
    const fields = encodeURIComponent('nextPageToken, files(id, name, mimeType, webViewLink, webContentLink, thumbnailLink, size, createdTime, modifiedTime)');
    let url = `/files?q=${q}&pageSize=100&fields=${fields}&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const data = await driveGet(url, client);
    for (const f of data.files ?? []) {
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        if (recursive) await fetchPage(f.id);
      } else if (MEDIA_MIMES.includes(f.mimeType)) {
        files.push({
          id: f.id, name: f.name, mimeType: f.mimeType,
          webViewLink: f.webViewLink, webContentLink: f.webContentLink,
          thumbnailLink: f.thumbnailLink,
          size: f.size ? parseInt(f.size) : undefined,
          createdTime: f.createdTime, modifiedTime: f.modifiedTime,
        });
      }
    }
    if (data.nextPageToken) await fetchPage(parentId, data.nextPageToken);
  }

  await fetchPage(folderId);
  return files;
}

function getFileUrl(file: DriveMediaFile): string {
  if (IMAGE_MIMES.includes(file.mimeType)) return `https://drive.google.com/uc?export=view&id=${file.id}`;
  return file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;
}

// ── Test connection ──

export async function testDriveConnection(folderIdOrUrl: string) {
  try {
    const folderId = extractFolderId(folderIdOrUrl);
    const folder = await driveGet(`/files/${folderId}?fields=id,name,mimeType&supportsAllDrives=true`);
    if (folder.mimeType !== 'application/vnd.google-apps.folder') return { success: false, message: 'Not a folder' };
    const files = await listFolderFiles(folderId);
    const images = files.filter(f => IMAGE_MIMES.includes(f.mimeType));
    const videos = files.filter(f => VIDEO_MIMES.includes(f.mimeType));
    return { success: true, message: `Connected to "${folder.name}". Found ${files.length} media files.`, folder_name: folder.name, file_count: files.length, images: images.length, videos: videos.length };
  } catch (err: any) {
    return { success: false, message: err.message?.includes('not found') ? 'Folder not found. Share it with the service account email.' : err.message };
  }
}

// ── Sync ──

export interface DriveSyncResult {
  folder_id: string; folder_name?: string; total_files: number; images: number; videos: number;
  files: DriveMediaFile[]; media_urls: { images: string[]; videos: string[] }; synced_at: string;
}

export async function syncDriveMedia(client: Client): Promise<DriveSyncResult> {
  const fi = client.google_drive_folder_id ?? client.google_drive_folder_url;
  if (!fi) throw new Error('No Google Drive folder configured');

  // Support comma-separated folder IDs (multi-folder selection)
  const folderIds = fi.split(',').map(id => extractFolderId(id.trim())).filter(Boolean);
  if (folderIds.length === 0) throw new Error('No valid folder IDs');

  const allFiles: DriveMediaFile[] = [];
  const folderNames: string[] = [];

  for (const folderId of folderIds) {
    let name: string | undefined;
    try { name = (await driveGet(`/files/${folderId}?fields=name&supportsAllDrives=true`, client)).name; } catch {}
    if (name) folderNames.push(name);
    const files = await listFolderFiles(folderId, true, client);
    allFiles.push(...files);
  }

  const images = allFiles.filter(f => IMAGE_MIMES.includes(f.mimeType));
  const videos = allFiles.filter(f => VIDEO_MIMES.includes(f.mimeType));
  const syncedAt = new Date().toISOString();

  const updated = await store.getClient(client.id);
  if (updated) {
    updated.drive_last_sync_at = syncedAt;
    updated.drive_file_count = allFiles.length;
    updated.updated_at = syncedAt;
    await store.upsertClient(updated);
  }

  return {
    folder_id: folderIds.join(','), folder_name: folderNames.join(', '), total_files: allFiles.length,
    images: images.length, videos: videos.length, files: allFiles,
    media_urls: { images: images.map(getFileUrl), videos: videos.map(getFileUrl) },
    synced_at: syncedAt,
  };
}

// Sync and persist Drive media to cache table for use in creative generation
export async function syncAndCacheDriveMedia(client: Client): Promise<DriveSyncResult> {
  const result = await syncDriveMedia(client);
  const rows: DriveMediaCacheRow[] = result.files.map(f => ({
    id: uuid(),
    client_id: client.id,
    file_id: f.id,
    file_name: f.name,
    mime_type: f.mimeType,
    media_type: (IMAGE_MIMES.includes(f.mimeType) ? 'image' : 'video') as 'image' | 'video',
    url: getFileUrl(f),
    thumbnail_url: f.thumbnailLink,
    size: f.size,
    drive_created_at: f.createdTime,
    drive_modified_at: f.modifiedTime,
    synced_at: result.synced_at,
  }));
  await store.upsertDriveMedia(client.id, rows);
  return result;
}

export async function getDriveMediaForEntity(client: Client) {
  const fi = client.google_drive_folder_id ?? client.google_drive_folder_url;
  if (!fi) return { gallery: [], videos: [] };
  try {
    const folderIds = fi.split(',').map(id => extractFolderId(id.trim())).filter(Boolean);
    const allFiles: DriveMediaFile[] = [];
    for (const folderId of folderIds) {
      const files = await listFolderFiles(folderId);
      allFiles.push(...files);
    }
    const imgs = allFiles.filter(f => IMAGE_MIMES.includes(f.mimeType)).map(getFileUrl);
    const vids = allFiles.filter(f => VIDEO_MIMES.includes(f.mimeType)).map(getFileUrl);
    return { hero_image: imgs[0], gallery: imgs, videos: vids };
  } catch { return { gallery: [], videos: [] }; }
}
