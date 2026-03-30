import { neon } from '@neondatabase/serverless';

let _sql: ReturnType<typeof neon> | null = null;

function getClient() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL environment variable is required');
    _sql = neon(url);
  }
  return _sql;
}

export async function sql(text: string, params: any[] = []): Promise<any[]> {
  const client = getClient();
  return client.query(text, params) as Promise<any[]>;
}

export function sqlTagged() {
  return getClient();
}
