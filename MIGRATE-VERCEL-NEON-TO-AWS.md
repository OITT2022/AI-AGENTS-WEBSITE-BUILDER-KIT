# Migrate from Vercel + Neon DB to AWS (Amplify + Aurora PostgreSQL)

> **Drop this file into any Express/Node.js project that runs on Vercel with Neon DB.**
> Follow the phases in order. Each phase is safe to deploy independently.
> All code templates use `// CUSTOMIZE:` markers where project-specific changes are needed.

---

## Prerequisites

- AWS account with permissions for: RDS, Amplify, S3, Secrets Manager, Route 53 (or external DNS)
- Access to current Vercel dashboard (env vars, domains)
- Access to current Neon dashboard (connection string)
- Node.js 18+ and npm installed locally
- `pg` npm package (will be added in Phase 1)
- Git repository connected to both Vercel and AWS Amplify

---

## Phase 1 — Code Preparation (non-breaking)

> Goal: Add abstraction layers so the app can run on **either** Vercel+Neon or AWS+Aurora.
> After this phase, deploy to Vercel as usual. Nothing changes for users.

### 1.1 Install dependencies

```bash
npm install pg
npm install -D @types/pg
```

### 1.2 Create database abstraction layer

**Create `src/db/postgres.ts`** (new Aurora/standard PostgreSQL driver):

```typescript
// src/db/postgres.ts
import { Pool, QueryResult } from 'pg';

let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL environment variable is required');
    // Strip sslmode from URL — we configure SSL ourselves.
    // Aurora's AWS-issued certs fail with pg's verify-full default.
    const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
    _pool = new Pool({
      connectionString: cleanUrl,
      max: 10,                       // CUSTOMIZE: adjust pool size for your workload
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: { rejectUnauthorized: false },
    });
  }
  return _pool;
}

export async function sql(text: string, params: any[] = []): Promise<any[]> {
  const pool = getPool();
  const result: QueryResult = await pool.query(text, params);
  return result.rows;
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
```

**Create `src/db/provider.ts`** (factory that selects the driver):

```typescript
// src/db/provider.ts
/**
 * Database provider abstraction.
 * Selects between Neon (HTTP) and standard pg (TCP) based on DB_PROVIDER env var.
 *
 * DB_PROVIDER=neon  -> @neondatabase/serverless (HTTP, current behavior)
 * DB_PROVIDER=pg    -> node-postgres Pool (TCP, for Aurora/standard PG)
 * Default: 'neon' (preserves current behavior until explicitly switched)
 */

export type DbProvider = 'neon' | 'pg';

function getProvider(): DbProvider {
  const p = process.env.DB_PROVIDER?.trim().toLowerCase();
  if (p === 'pg') return 'pg';
  return 'neon';
}

let _sql: ((text: string, params?: any[]) => Promise<any[]>) | null = null;

async function loadDriver(): Promise<(text: string, params?: any[]) => Promise<any[]>> {
  if (_sql) return _sql;
  const provider = getProvider();
  if (provider === 'pg') {
    const mod = await import('./postgres');
    _sql = mod.sql;
  } else {
    // CUSTOMIZE: change './neon' to wherever your current Neon driver lives
    const mod = await import('./neon');
    _sql = mod.sql;
  }
  return _sql;
}

export async function sql(text: string, params: any[] = []): Promise<any[]> {
  const driver = await loadDriver();
  return driver(text, params);
}
```

**Update all imports** — Find every file that imports directly from your Neon driver and change:

```typescript
// BEFORE:
import { sql } from './neon';       // or '../db/neon', etc.

// AFTER:
import { sql } from './provider';   // or '../db/provider', etc.
```

Search command to find all Neon imports:

```bash
grep -rn "from.*['\"].*neon['\"]" src/ --include="*.ts"
```

### 1.3 Create platform detection utility

**Create `src/lib/platform.ts`**:

```typescript
// src/lib/platform.ts
/**
 * Platform/runtime detection utility.
 * Replaces scattered process.env.VERCEL checks with a single abstraction.
 */

export type PlatformType = 'vercel' | 'aws' | 'local';

export function getPlatform(): PlatformType {
  const explicit = process.env.PLATFORM?.trim().toLowerCase();
  if (explicit === 'vercel' || explicit === 'aws' || explicit === 'local') {
    return explicit;
  }
  // Auto-detect from runtime environment
  if (process.env.VERCEL) return 'vercel';
  if (process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV) return 'aws';
  return 'local';
}

export function isServerless(): boolean {
  const p = getPlatform();
  return p === 'vercel' || p === 'aws';
}

/**
 * Returns a writable base directory for temporary/data files.
 * - Vercel/Lambda: /tmp (ephemeral)
 * - Local/Amplify SSR: process.cwd() (persistent)
 */
export function getWritableBaseDir(): string {
  return isServerless() ? '/tmp' : process.cwd();
}
```

**Replace all `process.env.VERCEL` checks** in your codebase:

```bash
grep -rn "process.env.VERCEL" src/ --include="*.ts"
```

Replace each with the appropriate function from `platform.ts`.

### 1.4 Create storage abstraction (optional, for S3 later)

**Create `src/lib/storage.ts`**:

```typescript
// src/lib/storage.ts
/**
 * Storage abstraction layer.
 * STORAGE_PROVIDER=local  -> local filesystem (default)
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
    // CUSTOMIZE: adjust the default storage path for your project
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
    // CUSTOMIZE: adjust the URL path to match your API route for serving files
    return `/api/media/storage/${key}`;
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolvePath(key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

// ── S3 provider (lazy-loaded to avoid requiring @aws-sdk when not in use) ──

class S3StorageProvider implements StorageProvider {
  private bucket: string;
  private region: string;
  private _sdk: any = null;
  private _client: any = null;

  constructor() {
    // CUSTOMIZE: set your default bucket name and region
    this.bucket = process.env.S3_BUCKET ?? 'my-app-assets';
    this.region = process.env.AWS_REGION ?? process.env.S3_REGION ?? 'us-east-1';
  }

  private getSdk(): any {
    if (this._sdk) return this._sdk;
    try {
      this._sdk = require('@aws-sdk/client-s3');
    } catch {
      throw new Error(
        'STORAGE_PROVIDER=s3 requires @aws-sdk/client-s3. Install: npm install @aws-sdk/client-s3'
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
      Bucket: this.bucket, Key: key,
      Body: typeof data === 'string' ? Buffer.from(data) : data,
      ContentType: contentType ?? 'application/octet-stream',
    }));
    return this.getUrl(key);
  }

  async read(key: string): Promise<Buffer> {
    const sdk = this.getSdk();
    const response = await this.getClient().send(new sdk.GetObjectCommand({
      Bucket: this.bucket, Key: key,
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
        Bucket: this.bucket, Key: key,
      }));
      return true;
    } catch { return false; }
  }

  getUrl(key: string): string {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  async delete(key: string): Promise<void> {
    const sdk = this.getSdk();
    await this.getClient().send(new sdk.DeleteObjectCommand({
      Bucket: this.bucket, Key: key,
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
```

> You do NOT need to integrate `getStorage()` into your app now. Just having the file ready is enough. Wire it in Phase 2 when S3 is provisioned.

### 1.5 Create Amplify entry point

**Create `src/amplify-entry.ts`**:

```typescript
// src/amplify-entry.ts
// AWS Amplify SSR compute entry point

const path = require('path');
const fs = require('fs');

// Amplify does NOT inject env vars at runtime like Vercel does.
// The build step serializes them into env.json — load them here.
try {
  const jp = path.join(__dirname, 'env.json');
  if (fs.existsSync(jp)) {
    const v = JSON.parse(fs.readFileSync(jp, 'utf-8'));
    for (const [k, val] of Object.entries(v)) {
      if (typeof val === 'string') process.env[k] = val;
    }
  }
} catch {}

// CUSTOMIZE: update these import paths to match your project structure
const app = require('./server').default;
const { initDatabase } = require('./db/store');       // your DB init function
const { ensureDefaultAdmin } = require('./services/auth'); // optional: seed admin user

// Start server IMMEDIATELY, init DB in background (don't block health checks)
app.listen(3000, () => {
  console.log('Server on port 3000');
  initDatabase()
    .then(() => ensureDefaultAdmin())
    .then(() => console.log('DB ready'))
    .catch((e: any) => console.error('DB init failed:', e.message));
});
```

### 1.6 Create Amplify build config

**Create `amplify.yml`** in project root:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
        # Assemble .amplify-hosting structure for SSR compute
        - rm -rf .amplify-hosting
        - mkdir -p .amplify-hosting/compute/default
        - mkdir -p .amplify-hosting/static
        # Copy compiled server code
        - cp -r dist/* .amplify-hosting/compute/default/
        - cp package.json .amplify-hosting/compute/default/package.json
        - cp -r node_modules .amplify-hosting/compute/default/node_modules
        # CUSTOMIZE: copy any extra runtime files your app needs
        # Example: DB schema files used by initDatabase()
        # - mkdir -p .amplify-hosting/compute/default/db
        # - cp db/schema.sql .amplify-hosting/compute/default/db/
        # Debug — verify env vars exist during build
        - echo "DEBUG DATABASE_URL set = $(if [ -n \"$DATABASE_URL\" ]; then echo YES; else echo NO; fi)"
        - echo "DEBUG DB_PROVIDER = ${DB_PROVIDER:-not set}"
        # Serialize ALL env vars to JSON (Amplify doesn't inject at runtime)
        - >-
          node -e "
            fs=require('fs');
            vars={};
            Object.keys(process.env)
              .filter(k => !/^(npm_|_|HOME|PATH|SHELL|USER|LOGNAME|LANG|TERM|SHLVL|PWD|OLDPWD|HOSTNAME|CODEBUILD|AWS_CONTAINER|ECS)/.test(k))
              .forEach(k => vars[k] = process.env[k]);
            fs.writeFileSync('.amplify-hosting/compute/default/env.json', JSON.stringify(vars));
            console.log('env.json keys:', Object.keys(vars).length);
          "
        # Entry point — use the Amplify entry instead of the Vercel handler
        - cp .amplify-hosting/compute/default/amplify-entry.js .amplify-hosting/compute/default/index.js
        # Copy public/static files for Express and CDN
        - cp -r public .amplify-hosting/compute/default/public
        - cp -r public/* .amplify-hosting/static/ || true
        # Deploy manifest
        - cp deploy-manifest.json .amplify-hosting/deploy-manifest.json
        - echo "Build complete."
        - ls -la .amplify-hosting/compute/default/index.js
  artifacts:
    baseDirectory: .amplify-hosting
    files:
      - '**/*'
```

**Create `deploy-manifest.json`** in project root:

```json
{
  "version": 1,
  "routes": [
    {
      "path": "/*.*",
      "target": {
        "kind": "Static",
        "cacheControl": "public, max-age=3600"
      },
      "fallback": {
        "kind": "Compute",
        "src": "default"
      }
    },
    {
      "path": "/*",
      "target": {
        "kind": "Compute",
        "src": "default"
      }
    }
  ],
  "computeResources": [
    {
      "name": "default",
      "runtime": "nodejs20.x",
      "entrypoint": "index.js"
    }
  ],
  "framework": {
    "name": "express",
    "version": "4.x"
  }
}
```

### 1.7 Update .env.example

Add these new variables:

```env
# Platform / runtime (new for AWS migration)
PLATFORM=local              # local | vercel | aws
DB_PROVIDER=neon            # neon | pg
STORAGE_PROVIDER=local      # local | s3

# AWS-specific (only needed when PLATFORM=aws)
AWS_REGION=us-east-1
S3_BUCKET=my-app-assets
```

### 1.8 Update .gitignore

Ensure these entries exist:

```gitignore
.amplify-hosting/
dist/
.vercel/
```

### 1.9 Verify Phase 1

```bash
# Must still compile
npx tsc --noEmit

# Must still build
npm run build

# Must still work locally with DB_PROVIDER=neon (default)
npm run dev
```

Deploy to Vercel. Everything should work exactly as before since `DB_PROVIDER` defaults to `neon`.

---

## Phase 2 — AWS Infrastructure Setup

> Checklist format. Use AWS Console or CLI.

### 2.1 Aurora Serverless v2

- [ ] Create Aurora PostgreSQL Serverless v2 cluster
  - Engine: PostgreSQL 15+ compatible
  - Capacity: 0.5 - 4 ACU (start small)
  - Region: match your preferred region
  - VPC: default or custom (ensure Amplify can reach it)
  - Public access: enable for initial migration, disable after
- [ ] Note the cluster endpoint (writer), port, master username, password
- [ ] Create database: `CREATE DATABASE your_db_name;`
- [ ] Test connection from local machine:
  ```bash
  psql "postgresql://postgres:PASSWORD@CLUSTER_ENDPOINT:5432/your_db_name?sslmode=require"
  ```

### 2.2 AWS Amplify App

- [ ] Create new Amplify app connected to your Git repository
- [ ] Set branch: connect a staging branch first (e.g., `staging` or `aws-migration`)
- [ ] Framework: select "Web compute - SSR"
- [ ] Build settings: Amplify should auto-detect `amplify.yml`
- [ ] Add environment variables in Amplify Console:

| Variable | Value |
|----------|-------|
| `PLATFORM` | `aws` |
| `DB_PROVIDER` | `pg` |
| `DATABASE_URL` | `postgresql://user:pass@aurora-endpoint:5432/dbname` |
| `STORAGE_PROVIDER` | `local` |
| All other env vars | Copy from Vercel dashboard |

### 2.3 S3 Bucket (optional, for file uploads)

- [ ] Create S3 bucket (if using `STORAGE_PROVIDER=s3`)
- [ ] Set CORS policy for your domain
- [ ] Install SDK: `npm install @aws-sdk/client-s3`

### 2.4 DNS Preparation

- [ ] Lower TTL on your domain's DNS records to 60s (do this days before cutover)
- [ ] Note current DNS configuration for rollback

---

## Phase 3 — Database Migration

### 3.1 Create migration script

**Create `scripts/migrate-to-aurora.ts`**:

```typescript
// scripts/migrate-to-aurora.ts
/**
 * Neon -> Aurora migration script.
 *
 * Usage:
 *   npx tsx scripts/migrate-to-aurora.ts
 *
 * Required env vars (set in .env):
 *   DATABASE_URL        = Neon connection string (source)
 *   AURORA_HOST         = Aurora cluster endpoint
 *   AURORA_USER         = Aurora master username (default: postgres)
 *   AURORA_PASSWORD     = Aurora master password
 *   AURORA_DB           = Aurora database name
 */

import { Pool } from 'pg';
import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

// ── Config ──

const NEON_URL = process.env.DATABASE_URL;
// CUSTOMIZE: set your Aurora defaults
const AURORA_HOST = process.env.AURORA_HOST || 'your-cluster.region.rds.amazonaws.com';
const AURORA_USER = process.env.AURORA_USER || 'postgres';
const AURORA_PASSWORD = process.env.AURORA_PASSWORD;
const AURORA_DB = process.env.AURORA_DB || 'your_database_name';

if (!NEON_URL) { console.error('ERROR: DATABASE_URL (Neon) not set'); process.exit(1); }
if (!AURORA_PASSWORD) { console.error('ERROR: AURORA_PASSWORD not set'); process.exit(1); }

// CUSTOMIZE: list tables in dependency order (parents before children)
const TABLES = [
  // 'users',
  // 'sessions',
  // 'posts',
  // 'comments',
  // ... add all your tables here
];

// ── Helpers ──

const neonSql = neon(NEON_URL);
const aurora = new Pool({
  host: AURORA_HOST, port: 5432,
  user: AURORA_USER, password: AURORA_PASSWORD, database: AURORA_DB,
  ssl: { rejectUnauthorized: false },
  max: 5, connectionTimeoutMillis: 10000,
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

  // CUSTOMIZE: list your schema files
  for (const file of ['db/schema.sql', 'db/migration.sql']) {
    const filepath = path.join(process.cwd(), file);
    if (!fs.existsSync(filepath)) { console.log(`  SKIP: ${file} not found`); continue; }

    console.log(`  Running ${file}...`);
    const content = fs.readFileSync(filepath, 'utf-8');

    // Split into statements (handles multi-line and $$ blocks)
    const statements: string[] = [];
    let current = '';
    let inBlock = false;

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('--')) { current += line + '\n'; continue; }
      if (trimmed.includes('$$')) inBlock = !inBlock;
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
        if (msg.includes('already exists') || msg.includes('duplicate')) { skip++; }
        else { fail++; console.log(`  WARN: ${msg.slice(0, 100)}`); }
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
      const rows = await neonQuery(`SELECT * FROM ${table}`);
      if (!rows || rows.length === 0) { console.log(`  ${table}: empty (0 rows)`); continue; }

      // Clear target table (safe for re-runs)
      await auroraExec(`DELETE FROM ${table}`);

      const columns = Object.keys(rows[0]);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const insertSql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

      let inserted = 0;
      for (const row of rows) {
        const values = columns.map(c => {
          const v = row[c];
          // JSONB columns: objects must be serialized to JSON strings
          if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
            return JSON.stringify(v);
          }
          return v;
        });
        try { await auroraQuery(insertSql, values); inserted++; }
        catch (e: any) { console.log(`  ${table}: INSERT error: ${e.message?.slice(0, 100)}`); }
      }
      console.log(`  ${table}: ${inserted}/${rows.length} rows copied`);
    } catch (e: any) {
      const msg = e.message || '';
      if (msg.includes('does not exist')) { console.log(`  ${table}: not found on Neon (skip)`); }
      else { console.log(`  ${table}: ERROR: ${msg.slice(0, 120)}`); }
    }
  }

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
      let neonCount = 0, auroraCount = 0;
      try { const nr = await neonQuery(`SELECT count(*)::int as c FROM ${table}`); neonCount = nr[0]?.c ?? 0; } catch {}
      try { const ar = await auroraQuery(`SELECT count(*)::int as c FROM ${table}`); auroraCount = ar[0]?.c ?? 0; } catch {}
      const match = neonCount === auroraCount ? 'OK' : 'MISMATCH';
      if (match !== 'OK') allMatch = false;
      console.log(`  ${table.padEnd(25)} | ${String(neonCount).padStart(6)} | ${String(auroraCount).padStart(6)} | ${match}`);
    } catch { console.log(`  ${table.padEnd(25)} | error`); }
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

  console.log('\nTesting connections...');
  try { await neonQuery('SELECT 1'); console.log('  Neon:   OK'); }
  catch (e: any) { console.error('  Neon:   FAILED -', e.message); process.exit(1); }

  try { await auroraQuery('SELECT 1'); console.log('  Aurora: OK'); }
  catch (e: any) { console.error('  Aurora: FAILED -', e.message); process.exit(1); }

  await runSchema();
  await copyData();
  await verify();

  console.log('Done. Set DB_PROVIDER=pg and update DATABASE_URL to Aurora.\n');
  await aurora.end();
}

main().catch((e) => { console.error('Migration failed:', e); process.exit(1); });
```

### 3.2 Run migration

```bash
# Set env vars for migration
export DATABASE_URL="postgresql://user:pass@neon-endpoint/dbname?sslmode=require"
export AURORA_HOST="your-cluster.region.rds.amazonaws.com"
export AURORA_PASSWORD="your-aurora-password"
export AURORA_DB="your_database_name"

npx tsx scripts/migrate-to-aurora.ts
```

### 3.3 Verify

- All tables should show `OK` in the verification output
- Connect to Aurora directly and spot-check critical tables
- Run a few read queries to confirm data integrity

---

## Phase 4 — Staging Validation

### 4.1 Deploy to staging

- [ ] Push Phase 1 code to your staging branch
- [ ] Amplify should auto-build and deploy
- [ ] Check Amplify build logs for errors

### 4.2 Validation checklist

- [ ] App loads (health check / home page)
- [ ] Authentication works (login, logout, session persistence)
- [ ] Database reads work (list pages, detail pages)
- [ ] Database writes work (create, update, delete)
- [ ] File uploads work (if applicable)
- [ ] OAuth integrations work (Google, Meta, etc.)
  - Update redirect URIs in provider consoles to include Amplify staging URL
- [ ] Background jobs / pipelines work (if applicable)
- [ ] API endpoints return correct data
- [ ] Static assets load (CSS, JS, images, favicons)
- [ ] Environment variables are all present (`/api/status` or similar health endpoint)

### 4.3 Performance baseline

- [ ] Compare response times: Vercel vs Amplify staging
- [ ] Check database query latency
- [ ] Note any cold start differences

---

## Phase 5 — Production Cutover

> Schedule during low-traffic window. Estimated time: 30-60 minutes.

### 5.1 Pre-cutover (1-2 days before)

- [ ] Confirm DNS TTL is lowered to 60s
- [ ] Confirm Aurora production cluster is ready
- [ ] Confirm all env vars are set in Amplify production
- [ ] Confirm staging validation passed all checks
- [ ] Notify team / stakeholders

### 5.2 Cutover sequence

```
1. Put app in maintenance mode (optional)
2. Run final database migration (to capture latest data)
   npx tsx scripts/migrate-to-aurora.ts
3. Verify migration row counts
4. Merge code to production branch (triggers Amplify deploy)
5. Wait for Amplify build to complete
6. Test Amplify URL directly (before DNS switch)
7. Update OAuth redirect URIs to production domain
8. Switch DNS:
   - Route 53: Update A/CNAME record to Amplify endpoint
   - External DNS: Update CNAME to Amplify domain
9. Verify site loads on production domain
10. Test critical flows: login, data display, writes
11. Remove maintenance mode
```

### 5.3 Post-cutover monitoring (24 hours)

- [ ] Monitor error rates
- [ ] Monitor response times
- [ ] Monitor database connections (Aurora console)
- [ ] Check all OAuth flows work
- [ ] Check all scheduled jobs / automations
- [ ] Check email / notification delivery

---

## Phase 6 — Rollback Plan

### When to rollback vs fix forward

| Situation | Action |
|-----------|--------|
| App won't start on Amplify | ROLLBACK immediately |
| Database connection fails completely | ROLLBACK immediately |
| Data corruption detected | ROLLBACK immediately |
| Auth/login broken | ROLLBACK within 30 min |
| Error rate > 10% sustained | ROLLBACK within 30 min |
| Single non-critical endpoint broken | FIX FORWARD |
| Minor UI issues | FIX FORWARD |
| Slightly slower (< 2x) | FIX FORWARD |

### Rollback sequence (10-35 minutes total)

```
1. DNS: Point back to Vercel
   - Update DNS record to Vercel's CNAME/IP
   - Wait for TTL propagation (60s if you lowered it)

2. Vercel: Trigger redeploy
   - Push to main branch (auto-deploys) or trigger manually

3. Database: Revert connection
   - Set DATABASE_URL back to Neon connection string in Vercel env vars
   - DB_PROVIDER should still default to 'neon'
   - Redeploy

4. Verify:
   - curl https://your-domain.com/api/status
   - Test login, data endpoints

5. Post-mortem:
   - Document what failed
   - Fix the issue
   - Retry cutover when ready
```

### Safety nets

- **Keep Neon alive for 7+ days** after cutover (do NOT delete)
- **Keep Vercel project intact** (do NOT remove)
- **Keep `@neondatabase/serverless`** in package.json (can revert `DB_PROVIDER=neon`)
- **Keep `vercel.json`** in the repo (Vercel auto-deploys from it)

---

## Known Gotchas

### Aurora SSL
PostgreSQL `pg` driver's default `verify-full` SSL fails with Aurora's AWS-issued certs. Solution: strip `sslmode` from the URL and set `ssl: { rejectUnauthorized: false }` in the Pool config. This is handled in the `postgres.ts` template above.

### Amplify env vars at runtime
**Amplify does NOT auto-inject environment variables** into your running Node.js process. This is the #1 gotcha. Solution: the `amplify.yml` build step serializes all env vars into `env.json`, and `amplify-entry.ts` loads them at startup.

### SQL statement splitting
If your schema uses `$$` blocks (for functions, triggers, etc.), a naive `.split(';')` will break them. The migration script template handles this with `$$` block tracking.

### JSONB columns in migration
When copying data from Neon to Aurora row-by-row, JavaScript objects (from JSONB columns) must be `JSON.stringify()`-ed before insertion. The migration script handles this automatically.

### Connection pooling
Neon uses server-side pooling (no config needed). Aurora needs client-side pooling via `pg.Pool`. The `postgres.ts` template sets `max: 10` connections. Adjust based on your workload and Aurora ACU capacity.

### Domain verification files
If you serve Google/Meta/other verification files, ensure they're served from the new host. Check for HTML files in your root directory or routes that serve verification content.

### OAuth redirect URIs
All OAuth providers (Google, Meta, TikTok, etc.) have configured redirect URIs pointing to your Vercel domain. These **must** be updated to the new domain before or during cutover.

### Filesystem uploads
Files stored on Vercel's `/tmp` are ephemeral. On Amplify SSR, files persist longer but are still not permanent across deploys. Plan to move uploads to S3 for persistence.

---

## Quick Reference: New Environment Variables

| Variable | Values | Default | Purpose |
|----------|--------|---------|---------|
| `PLATFORM` | `local` / `vercel` / `aws` | auto-detect | Runtime platform detection |
| `DB_PROVIDER` | `neon` / `pg` | `neon` | Database driver selection |
| `STORAGE_PROVIDER` | `local` / `s3` | `local` | File storage backend |
| `AWS_REGION` | e.g., `us-east-1` | — | AWS region for S3/RDS |
| `S3_BUCKET` | bucket name | — | S3 bucket for file storage |

---

## File Summary: What Gets Created

| File | Purpose |
|------|---------|
| `src/db/provider.ts` | Database driver factory (neon/pg) |
| `src/db/postgres.ts` | Aurora/standard PostgreSQL driver |
| `src/lib/platform.ts` | Platform detection utility |
| `src/lib/storage.ts` | Storage abstraction (local/S3) |
| `src/amplify-entry.ts` | Amplify SSR entry point |
| `amplify.yml` | Amplify build specification |
| `deploy-manifest.json` | Amplify routing manifest |
| `scripts/migrate-to-aurora.ts` | Database migration script |

**Files modified:**
- All files importing from Neon directly → import from `provider` instead
- All files using `process.env.VERCEL` → use `platform.ts` utilities
- `.env.example` → add new variables
- `.gitignore` → add `.amplify-hosting/`
- `package.json` → add `pg` and `@types/pg`

**Files NOT modified (kept for rollback):**
- `vercel.json`
- `src/db/neon.ts` (original driver)
- `api/index.ts` (Vercel entry point)
