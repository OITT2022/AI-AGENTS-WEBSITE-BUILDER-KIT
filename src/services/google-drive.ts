import { GoogleAuth } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import { store } from '../db/store';
import { DriveMediaFile, Client } from '../models/schemas';

const CREDENTIALS_PATH = path.join(process.cwd(), 'data', 'google-credentials.json');
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

async function getAccessToken(): Promise<string> {
  const creds = getCredentials();
  if (!creds) throw new Error('Google credentials not configured. Upload a service account JSON key file.');
  const auth = new GoogleAuth({ credentials: creds as any, scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return (token as any).token ?? token;
}

async function driveGet(path: string): Promise<any> {
  const token = await getAccessToken();
  const res = await fetch(`${DRIVE_API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive API error: ${res.status} ${await res.text()}`);
  return res.json();
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

export async function listFolderFiles(folderId: string, recursive = true): Promise<DriveMediaFile[]> {
  const files: DriveMediaFile[] = [];

  async function fetchPage(parentId: string, pageToken?: string) {
    const q = encodeURIComponent(`'${parentId}' in parents and trashed = false`);
    const fields = encodeURIComponent('nextPageToken, files(id, name, mimeType, webViewLink, webContentLink, thumbnailLink, size, createdTime, modifiedTime)');
    let url = `/files?q=${q}&pageSize=100&fields=${fields}&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const data = await driveGet(url);
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
  const folderId = extractFolderId(fi);

  let folderName: string | undefined;
  try { folderName = (await driveGet(`/files/${folderId}?fields=name&supportsAllDrives=true`)).name; } catch {}

  const files = await listFolderFiles(folderId);
  const images = files.filter(f => IMAGE_MIMES.includes(f.mimeType));
  const videos = files.filter(f => VIDEO_MIMES.includes(f.mimeType));
  const syncedAt = new Date().toISOString();

  const updated = await store.getClient(client.id);
  if (updated) {
    updated.drive_last_sync_at = syncedAt;
    updated.drive_file_count = files.length;
    updated.updated_at = syncedAt;
    await store.upsertClient(updated);
  }

  return {
    folder_id: folderId, folder_name: folderName, total_files: files.length,
    images: images.length, videos: videos.length, files,
    media_urls: { images: images.map(getFileUrl), videos: videos.map(getFileUrl) },
    synced_at: syncedAt,
  };
}

export async function getDriveMediaForEntity(client: Client) {
  const fi = client.google_drive_folder_id ?? client.google_drive_folder_url;
  if (!fi) return { gallery: [], videos: [] };
  try {
    const files = await listFolderFiles(extractFolderId(fi));
    const imgs = files.filter(f => IMAGE_MIMES.includes(f.mimeType)).map(getFileUrl);
    const vids = files.filter(f => VIDEO_MIMES.includes(f.mimeType)).map(getFileUrl);
    return { hero_image: imgs[0], gallery: imgs, videos: vids };
  } catch { return { gallery: [], videos: [] }; }
}
