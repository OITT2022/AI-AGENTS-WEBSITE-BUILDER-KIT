import { google, drive_v3 } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { store } from '../db/store';
import { DriveMediaFile, Client } from '../models/schemas';

const CREDENTIALS_PATH = path.join(process.cwd(), 'data', 'google-credentials.json');
const MEDIA_CACHE_DIR = path.join(process.cwd(), 'data', 'drive-media');

const IMAGE_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff',
];
const VIDEO_MIME_TYPES = [
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/mpeg',
];
const MEDIA_MIME_TYPES = [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES];

// ── Auth ──

function getCredentials(): Record<string, unknown> | null {
  if (!fs.existsSync(CREDENTIALS_PATH)) return null;
  return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
}

export function hasCredentials(): boolean {
  return fs.existsSync(CREDENTIALS_PATH);
}

export function saveCredentials(credentials: Record<string, unknown>): void {
  const dir = path.dirname(CREDENTIALS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2));
}

export function getServiceAccountEmail(): string | null {
  const creds = getCredentials();
  return (creds?.client_email as string) ?? null;
}

function getDriveClient(): drive_v3.Drive {
  const creds = getCredentials();
  if (!creds) throw new Error('Google credentials not configured. Upload a service account JSON key file.');

  const auth = new google.auth.GoogleAuth({
    credentials: creds as any,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  return google.drive({ version: 'v3', auth });
}

// ── Extract folder ID from URL ──

export function extractFolderId(urlOrId: string): string {
  if (!urlOrId) throw new Error('No folder URL or ID provided');
  // Direct ID
  if (/^[a-zA-Z0-9_-]{10,}$/.test(urlOrId)) return urlOrId;
  // URL formats
  const match = urlOrId.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  const match2 = urlOrId.match(/id=([a-zA-Z0-9_-]+)/);
  if (match2) return match2[1];
  throw new Error('Cannot extract folder ID from: ' + urlOrId);
}

// ── List files in folder ──

export async function listFolderFiles(folderId: string, recursive: boolean = true): Promise<DriveMediaFile[]> {
  const drive = getDriveClient();
  const files: DriveMediaFile[] = [];

  async function fetchPage(parentId: string, pageToken?: string) {
    const query = `'${parentId}' in parents and trashed = false`;
    const res = await drive.files.list({
      q: query,
      pageSize: 100,
      pageToken,
      fields: 'nextPageToken, files(id, name, mimeType, webViewLink, webContentLink, thumbnailLink, size, createdTime, modifiedTime)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    for (const file of res.data.files ?? []) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        if (recursive) {
          await fetchPage(file.id!, undefined);
        }
      } else if (MEDIA_MIME_TYPES.includes(file.mimeType!)) {
        files.push({
          id: file.id!,
          name: file.name!,
          mimeType: file.mimeType!,
          webViewLink: file.webViewLink ?? undefined,
          webContentLink: file.webContentLink ?? undefined,
          thumbnailLink: file.thumbnailLink ?? undefined,
          size: file.size ? parseInt(file.size) : undefined,
          createdTime: file.createdTime ?? undefined,
          modifiedTime: file.modifiedTime ?? undefined,
        });
      }
    }

    if (res.data.nextPageToken) {
      await fetchPage(parentId, res.data.nextPageToken);
    }
  }

  await fetchPage(folderId);
  return files;
}

// ── Get a publicly accessible URL for a file ──

function getFileUrl(file: DriveMediaFile): string {
  // For images, use the Drive thumbnail/content link
  if (IMAGE_MIME_TYPES.includes(file.mimeType)) {
    // Direct download link
    return `https://drive.google.com/uc?export=view&id=${file.id}`;
  }
  // For videos, link to the Drive viewer
  return file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;
}

// ── Test connection to a folder ──

export async function testDriveConnection(folderIdOrUrl: string): Promise<{
  success: boolean;
  message: string;
  folder_name?: string;
  file_count?: number;
  images?: number;
  videos?: number;
}> {
  try {
    const folderId = extractFolderId(folderIdOrUrl);
    const drive = getDriveClient();

    // Get folder metadata
    const folder = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, mimeType',
      supportsAllDrives: true,
    });

    if (folder.data.mimeType !== 'application/vnd.google-apps.folder') {
      return { success: false, message: 'The provided ID is not a folder' };
    }

    // List files
    const files = await listFolderFiles(folderId);
    const images = files.filter(f => IMAGE_MIME_TYPES.includes(f.mimeType));
    const videos = files.filter(f => VIDEO_MIME_TYPES.includes(f.mimeType));

    return {
      success: true,
      message: `Connected to "${folder.data.name}". Found ${files.length} media files.`,
      folder_name: folder.data.name!,
      file_count: files.length,
      images: images.length,
      videos: videos.length,
    };
  } catch (err: any) {
    const msg = err.message?.includes('not found')
      ? 'Folder not found. Make sure to share the folder with the service account email.'
      : err.message;
    return { success: false, message: msg };
  }
}

// ── Sync Drive media for a client ──

export interface DriveSyncResult {
  folder_id: string;
  folder_name?: string;
  total_files: number;
  images: number;
  videos: number;
  files: DriveMediaFile[];
  media_urls: { images: string[]; videos: string[] };
  synced_at: string;
}

export async function syncDriveMedia(client: Client): Promise<DriveSyncResult> {
  const folderInput = client.google_drive_folder_id ?? client.google_drive_folder_url;
  if (!folderInput) throw new Error('No Google Drive folder configured for this client');

  const folderId = extractFolderId(folderInput);
  const drive = getDriveClient();

  // Get folder name
  let folderName: string | undefined;
  try {
    const folder = await drive.files.get({ fileId: folderId, fields: 'name', supportsAllDrives: true });
    folderName = folder.data.name!;
  } catch {}

  const files = await listFolderFiles(folderId);
  const images = files.filter(f => IMAGE_MIME_TYPES.includes(f.mimeType));
  const videos = files.filter(f => VIDEO_MIME_TYPES.includes(f.mimeType));

  const imageUrls = images.map(f => getFileUrl(f));
  const videoUrls = videos.map(f => getFileUrl(f));

  const syncedAt = new Date().toISOString();

  // Update client with sync info
  const updated = store.getClient(client.id);
  if (updated) {
    updated.drive_last_sync_at = syncedAt;
    updated.drive_file_count = files.length;
    updated.updated_at = syncedAt;
    store.upsertClient(updated);
  }

  return {
    folder_id: folderId,
    folder_name: folderName,
    total_files: files.length,
    images: images.length,
    videos: videos.length,
    files,
    media_urls: { images: imageUrls, videos: videoUrls },
    synced_at: syncedAt,
  };
}

// ── Get Drive media URLs for a client (cached from last sync) ──

export async function getDriveMediaForEntity(client: Client): Promise<{ hero_image?: string; gallery: string[]; videos: string[] }> {
  const folderInput = client.google_drive_folder_id ?? client.google_drive_folder_url;
  if (!folderInput) return { gallery: [], videos: [] };

  try {
    const folderId = extractFolderId(folderInput);
    const files = await listFolderFiles(folderId);
    const images = files.filter(f => IMAGE_MIME_TYPES.includes(f.mimeType));
    const videos = files.filter(f => VIDEO_MIME_TYPES.includes(f.mimeType));

    const imageUrls = images.map(f => getFileUrl(f));
    const videoUrls = videos.map(f => getFileUrl(f));

    return {
      hero_image: imageUrls[0],
      gallery: imageUrls,
      videos: videoUrls,
    };
  } catch {
    return { gallery: [], videos: [] };
  }
}
