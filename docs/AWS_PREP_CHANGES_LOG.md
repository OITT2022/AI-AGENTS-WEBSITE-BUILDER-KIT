# AWS Preparation Changes Log

**Date**: 2026-04-02
**Phase**: Code preparation (no deployment, no migration, no production changes)

## Summary

All changes are minimal, reversible, and non-breaking. The existing Vercel + Neon stack continues to work unchanged. New abstractions are opt-in via environment variables.

---

## New Files Created

### 1. `src/lib/platform.ts` -- Platform detection utility
- Replaces scattered `process.env.VERCEL` checks
- Exports: `getPlatform()`, `isServerless()`, `getWritableBaseDir()`
- Supports `PLATFORM=vercel|aws|local` env var (auto-detects if not set)

### 2. `src/db/postgres.ts` -- Standard PostgreSQL driver
- Uses `pg` (node-postgres) Pool with TCP connections
- Drop-in replacement for `neon.ts` query interface
- Configured for SSL when connection string includes `sslmode=require`
- Pool: max 10 connections, 30s idle timeout, 5s connect timeout

### 3. `src/db/provider.ts` -- Database provider selector
- Routes queries to either Neon (HTTP) or pg (TCP) based on `DB_PROVIDER` env var
- `DB_PROVIDER=neon` (default) -- preserves current behavior
- `DB_PROVIDER=pg` -- uses standard pg driver for Aurora/RDS

### 4. `src/lib/storage.ts` -- Storage abstraction layer
- Interface: `write()`, `read()`, `exists()`, `getUrl()`, `delete()`
- `LocalStorageProvider` -- filesystem (current behavior)
- `S3StorageProvider` -- AWS S3 (requires `@aws-sdk/client-s3` at runtime)
- Selected via `STORAGE_PROVIDER=local|s3` env var

### 5. `amplify.yml` -- AWS Amplify build specification
- Configures build pipeline for Amplify Hosting
- Runs `npm ci` + `npm run build` (tsc)
- Includes dist, public, db, and node_modules in artifacts

---

## Modified Files

### 1. `src/db/store.ts` (line 1)
**Before**: `import { sql, sqlTagged } from './neon';`
**After**: `import { sql } from './provider';`
- Routes all DB queries through the provider abstraction
- `sqlTagged` was imported but never used -- removed dead import
- **Reversible**: Change import back to `'./neon'` to restore original behavior

### 2. `src/server.ts` (line 74)
**Before**: `const uploadDir = path.join(process.env.VERCEL ? '/tmp' : process.cwd(), 'data', 'uploads');`
**After**:
```typescript
import { getWritableBaseDir } from './lib/platform';
const uploadDir = path.join(getWritableBaseDir(), 'data', 'uploads');
```
- Uses platform utility instead of Vercel-specific check
- Behavior is identical (returns `/tmp` on Vercel, `cwd()` locally)

### 3. `src/services/google-drive.ts` (line 8)
**Before**: `const CREDENTIALS_PATH = path.join(process.env.VERCEL ? '/tmp' : process.cwd(), 'data', 'google-credentials.json');`
**After**:
```typescript
import { getWritableBaseDir } from '../lib/platform';
const CREDENTIALS_PATH = path.join(getWritableBaseDir(), 'data', 'google-credentials.json');
```
- Same behavior, platform-agnostic

### 4. `src/services/video-engine-local.ts` (lines 213-216)
**Before**:
```typescript
/** Returns true when running inside a serverless environment (Vercel, AWS Lambda, etc.) */
function isServerless(): boolean {
  return !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
}
```
**After**: `import { isServerless } from '../lib/platform';`
- Uses shared platform utility
- Same detection logic, now centralized

### 5. `.env.example`
**Added**:
```
PLATFORM=local
DB_PROVIDER=neon
STORAGE_PROVIDER=local
```

### 6. `package.json` + `package-lock.json`
**Added dependency**: `pg` (^8.x) + `@types/pg` (dev)

---

## What Was NOT Changed

- `api/index.ts` -- Vercel entry point kept intact
- `vercel.json` -- Vercel routing kept intact
- `src/db/neon.ts` -- Neon driver kept intact
- `db/schema.sql` -- Schema unchanged
- All service files (except google-drive.ts, video-engine-local.ts) -- untouched
- No production secrets modified
- No production domain changed
- No deployment performed

---

## How to Revert

To revert ALL changes and restore original behavior:

1. In `src/db/store.ts`, change import back to: `import { sql, sqlTagged } from './neon';`
2. In `src/server.ts`, revert upload dir line to: `const uploadDir = path.join(process.env.VERCEL ? '/tmp' : process.cwd(), 'data', 'uploads');`
3. In `src/services/google-drive.ts`, revert credentials path to: `const CREDENTIALS_PATH = path.join(process.env.VERCEL ? '/tmp' : process.cwd(), 'data', 'google-credentials.json');`
4. In `src/services/video-engine-local.ts`, restore the local `isServerless()` function
5. Remove new files: `src/db/provider.ts`, `src/db/postgres.ts`, `src/lib/platform.ts`, `src/lib/storage.ts`, `amplify.yml`
6. Run `npm uninstall pg @types/pg`

Or simply: set `DB_PROVIDER=neon` (or leave unset) to use the original Neon driver path.

---

## Environment Variable Defaults

| Variable | Default | Effect |
|----------|---------|--------|
| `PLATFORM` | auto-detect | `vercel` if `VERCEL` env is set, `aws` if AWS env detected, else `local` |
| `DB_PROVIDER` | `neon` | Uses Neon HTTP driver (current behavior unchanged) |
| `STORAGE_PROVIDER` | `local` | Uses local filesystem (current behavior unchanged) |
