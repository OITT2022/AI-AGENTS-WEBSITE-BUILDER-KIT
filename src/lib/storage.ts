/**
 * Storage abstraction layer.
 *
 * Provides a unified interface for file storage operations.
 * Selects between local filesystem and S3 based on STORAGE_PROVIDER env var.
 *
 * STORAGE_PROVIDER=local  -> local filesystem (default, current behavior)
 * STORAGE_PROVIDER=s3     -> AWS S3
 */

import fs from 'fs';
import path from 'path';
import { getWritableBaseDir } from './platform';

// ── Interface ──

export interface StorageProvider {
  write(key: string, data: Buffer | string, contentType?: string): Promise<string>;
  read(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  getUrl(key: string): string;
  delete(key: string): Promise<void>;
}

// ── Local filesystem provider ──

class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.join(getWritableBaseDir(), 'data', 'storage');
  }

  private resolvePath(key: string): string {
    return path.join(this.baseDir, key);
  }

  async write(key: string, data: Buffer | string): Promise<string> {
    const filePath = this.resolvePath(key);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, data);
    return filePath;
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFileSync(this.resolvePath(key));
  }

  async exists(key: string): Promise<boolean> {
    return fs.existsSync(this.resolvePath(key));
  }

  getUrl(key: string): string {
    // On EC2 worker, return absolute URL so browsers can reach the file
    const baseUrl = process.env.VIDEO_WORKER_BASE_URL?.replace(/\/+$/, '');
    if (baseUrl) return `${baseUrl}/api/media/storage/${key}`;
    return `/api/media/storage/${key}`;
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolvePath(key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

// ── S3 provider (lazy-loaded to avoid requiring @aws-sdk when not in use) ──

/**
 * S3 storage provider.
 * Requires @aws-sdk/client-s3 to be installed when STORAGE_PROVIDER=s3.
 * Uses dynamic require() to avoid compile-time dependency -- the SDK is only
 * needed at runtime on AWS and should be installed there via:
 *   npm install @aws-sdk/client-s3
 */
class S3StorageProvider implements StorageProvider {
  private bucket: string;
  private region: string;
  private _sdk: any = null;
  private _client: any = null;

  constructor() {
    this.bucket = process.env.S3_BUCKET ?? 'realestate-marketing-assets';
    this.region = process.env.AWS_REGION ?? process.env.S3_REGION ?? 'eu-west-1';
  }

  private getSdk(): any {
    if (this._sdk) return this._sdk;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this._sdk = require('@aws-sdk/client-s3');
    } catch {
      throw new Error(
        'STORAGE_PROVIDER=s3 requires @aws-sdk/client-s3. Install it with: npm install @aws-sdk/client-s3'
      );
    }
    return this._sdk;
  }

  private getClient(): any {
    if (this._client) return this._client;
    const sdk = this.getSdk();
    this._client = new sdk.S3Client({ region: this.region });
    return this._client;
  }

  async write(key: string, data: Buffer | string, contentType?: string): Promise<string> {
    const sdk = this.getSdk();
    await this.getClient().send(new sdk.PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: typeof data === 'string' ? Buffer.from(data) : data,
      ContentType: contentType ?? 'application/octet-stream',
    }));
    return this.getUrl(key);
  }

  async read(key: string): Promise<Buffer> {
    const sdk = this.getSdk();
    const response = await this.getClient().send(new sdk.GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async exists(key: string): Promise<boolean> {
    try {
      const sdk = this.getSdk();
      await this.getClient().send(new sdk.HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
      return true;
    } catch {
      return false;
    }
  }

  getUrl(key: string): string {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  async delete(key: string): Promise<void> {
    const sdk = this.getSdk();
    await this.getClient().send(new sdk.DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
  }
}

// ── Factory ──

let _instance: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (_instance) return _instance;
  const provider = process.env.STORAGE_PROVIDER?.trim().toLowerCase();
  _instance = provider === 's3' ? new S3StorageProvider() : new LocalStorageProvider();
  return _instance;
}

export type { StorageProvider as IStorageProvider };
