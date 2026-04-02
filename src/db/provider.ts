/**
 * Database provider abstraction.
 * Selects between Neon (HTTP) and standard pg (TCP) based on DB_PROVIDER env var.
 *
 * Usage: import { sql } from './provider' instead of directly from './neon'.
 *
 * DB_PROVIDER=neon  -> uses @neondatabase/serverless (HTTP, current behavior)
 * DB_PROVIDER=pg    -> uses node-postgres Pool (TCP, for Aurora/standard PG)
 * Default: 'neon' (preserves current behavior until explicitly switched)
 */

export type DbProvider = 'neon' | 'pg';

function getProvider(): DbProvider {
  const p = process.env.DB_PROVIDER?.trim().toLowerCase();
  if (p === 'pg') return 'pg';
  return 'neon'; // default: preserve current behavior
}

let _sql: ((text: string, params?: any[]) => Promise<any[]>) | null = null;

async function loadDriver(): Promise<(text: string, params?: any[]) => Promise<any[]>> {
  if (_sql) return _sql;

  const provider = getProvider();
  if (provider === 'pg') {
    const mod = await import('./postgres');
    _sql = mod.sql;
  } else {
    const mod = await import('./neon');
    _sql = mod.sql;
  }
  return _sql;
}

export async function sql(text: string, params: any[] = []): Promise<any[]> {
  const driver = await loadDriver();
  return driver(text, params);
}
