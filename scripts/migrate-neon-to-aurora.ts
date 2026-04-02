/**
 * Neon -> Aurora migration script.
 *
 * Usage:
 *   npx tsx scripts/migrate-neon-to-aurora.ts
 *
 * Required env vars (set in .env):
 *   DATABASE_URL          = Neon connection string (source)
 *   AURORA_DATABASE_URL   = Aurora connection string (target)
 *
 * What it does:
 *   1. Connects to both databases
 *   2. Creates schema on Aurora (schema.sql + migration.sql)
 *   3. Copies all data from Neon to Aurora table by table
 *   4. Verifies row counts match
 */

import { Pool } from 'pg';
import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

// ── Config ──

const NEON_URL = process.env.DATABASE_URL;
const AURORA_HOST = process.env.AURORA_HOST || 'database-1-instance-1.cjyuu8a6qoc3.eu-north-1.rds.amazonaws.com';
const AURORA_USER = process.env.AURORA_USER || 'postgres';
const AURORA_PASSWORD = process.env.AURORA_PASSWORD; // IAM token or master password
const AURORA_DB = process.env.AURORA_DB || 'advplanner-ai-marketing-agent';

if (!NEON_URL) { console.error('ERROR: DATABASE_URL (Neon) not set in .env'); process.exit(1); }
if (!AURORA_PASSWORD) { console.error('ERROR: AURORA_PASSWORD not set in .env (use IAM token or master password)'); process.exit(1); }

// Tables in dependency order (parents before children)
const TABLES = [
  'source_sync_runs',
  'source_entities',
  'entity_snapshots',
  'entity_change_events',
  'media_assets',
  'media_derivatives',
  'campaign_candidates',
  'creative_batches',
  'creative_variants',
  'qa_reviews',
  'approval_tasks',
  'publish_actions',
  'performance_metrics',
  'users',
  'sessions',
  'clients',
  'client_drive_media',
  'app_config',
];

// ── Helpers ──

const neonSql = neon(NEON_URL);
const aurora = new Pool({
  host: AURORA_HOST,
  port: 5432,
  user: AURORA_USER,
  password: AURORA_PASSWORD,
  database: AURORA_DB,
  ssl: { rejectUnauthorized: false },
  max: 5,
  connectionTimeoutMillis: 10000,
});

async function neonQuery(text: string): Promise<any[]> {
  return neonSql.query(text) as Promise<any[]>;
}

async function auroraQuery(text: string, params: any[] = []): Promise<any[]> {
  const res = await aurora.query(text, params);
  return res.rows;
}

async function auroraExec(text: string): Promise<void> {
  await aurora.query(text);
}

// ── Step 1: Run schema on Aurora ──

async function runSchema() {
  console.log('\n== Step 1: Creating schema on Aurora ==\n');

  for (const file of ['db/schema.sql', 'db/migration.sql']) {
    const filepath = path.join(process.cwd(), file);
    if (!fs.existsSync(filepath)) {
      console.log(`  SKIP: ${file} not found`);
      continue;
    }

    console.log(`  Running ${file}...`);
    const content = fs.readFileSync(filepath, 'utf-8');

    // Split into statements (handle multi-line, $$ blocks)
    const statements: string[] = [];
    let current = '';
    let inBlock = false;

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('--')) {
        current += line + '\n';
        continue;
      }

      if (trimmed.includes('$$')) {
        inBlock = !inBlock;
      }

      current += line + '\n';

      if (!inBlock && trimmed.endsWith(';')) {
        const stmt = current.trim();
        if (stmt && stmt !== ';') statements.push(stmt);
        current = '';
      }
    }
    if (current.trim()) statements.push(current.trim());

    let ok = 0, skip = 0, fail = 0;
    for (const stmt of statements) {
      try {
        await auroraExec(stmt);
        ok++;
      } catch (e: any) {
        const msg = e.message || '';
        if (msg.includes('already exists') || msg.includes('duplicate')) {
          skip++;
        } else {
          fail++;
          console.log(`  WARN: ${msg.slice(0, 100)}`);
        }
      }
    }
    console.log(`  ${file}: ${ok} OK, ${skip} skipped (already exist), ${fail} failed`);
  }
}

// ── Step 2: Copy data ──

async function copyData() {
  console.log('\n== Step 2: Copying data from Neon to Aurora ==\n');

  // Disable FK checks during import
  await auroraExec('SET session_replication_role = replica;');

  for (const table of TABLES) {
    try {
      // Check if table exists on Neon
      const rows = await neonQuery(`SELECT * FROM ${table}`);

      if (!rows || rows.length === 0) {
        console.log(`  ${table}: empty (0 rows)`);
        continue;
      }

      // Clear target table first (in case of re-run)
      await auroraExec(`DELETE FROM ${table}`);

      // Get column names from first row
      const columns = Object.keys(rows[0]);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const insertSql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

      let inserted = 0;
      for (const row of rows) {
        const values = columns.map(c => {
          const v = row[c];
          // Convert objects/arrays to JSON strings for JSONB columns
          if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
            return JSON.stringify(v);
          }
          return v;
        });

        try {
          await auroraQuery(insertSql, values);
          inserted++;
        } catch (e: any) {
          console.log(`  ${table}: INSERT error: ${e.message?.slice(0, 100)}`);
        }
      }

      console.log(`  ${table}: ${inserted}/${rows.length} rows copied`);
    } catch (e: any) {
      const msg = e.message || '';
      if (msg.includes('does not exist') || msg.includes('relation')) {
        console.log(`  ${table}: table not found on Neon (skipping)`);
      } else {
        console.log(`  ${table}: ERROR: ${msg.slice(0, 120)}`);
      }
    }
  }

  // Re-enable FK checks
  await auroraExec('SET session_replication_role = DEFAULT;');
}

// ── Step 3: Verify ──

async function verify() {
  console.log('\n== Step 3: Verification ==\n');
  console.log('  Table                    | Neon   | Aurora | Match');
  console.log('  -------------------------|--------|--------|------');

  let allMatch = true;

  for (const table of TABLES) {
    try {
      let neonCount = 0;
      let auroraCount = 0;

      try {
        const nr = await neonQuery(`SELECT count(*)::int as c FROM ${table}`);
        neonCount = nr[0]?.c ?? 0;
      } catch { /* table doesn't exist on neon */ }

      try {
        const ar = await auroraQuery(`SELECT count(*)::int as c FROM ${table}`);
        auroraCount = ar[0]?.c ?? 0;
      } catch { /* table doesn't exist on aurora */ }

      const match = neonCount === auroraCount ? 'OK' : 'MISMATCH';
      if (match !== 'OK') allMatch = false;

      const tn = table.padEnd(25);
      const nc = String(neonCount).padStart(6);
      const ac = String(auroraCount).padStart(6);
      console.log(`  ${tn} | ${nc} | ${ac} | ${match}`);
    } catch {
      console.log(`  ${table.padEnd(25)} | error`);
    }
  }

  console.log(allMatch ? '\n  ALL TABLES MATCH\n' : '\n  WARNING: Some tables have mismatches\n');
}

// ── Main ──

async function main() {
  console.log('===========================================');
  console.log('  Neon -> Aurora Migration Script');
  console.log('===========================================');
  console.log(`  Source: ${NEON_URL?.replace(/:[^@]+@/, ':***@')}`);
  console.log(`  Target: ${AURORA_USER}@${AURORA_HOST}/${AURORA_DB}`);

  // Test connections
  console.log('\nTesting connections...');
  try {
    await neonQuery('SELECT 1');
    console.log('  Neon:   OK');
  } catch (e: any) {
    console.error('  Neon:   FAILED -', e.message);
    process.exit(1);
  }

  try {
    await auroraQuery('SELECT 1');
    console.log('  Aurora: OK');
  } catch (e: any) {
    console.error('  Aurora: FAILED -', e.message);
    process.exit(1);
  }

  await runSchema();
  await copyData();
  await verify();

  console.log('Done. You can now set DB_PROVIDER=pg and AURORA URL as DATABASE_URL.\n');

  await aurora.end();
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
