# AWS Code Changes Plan

## 1. Files Likely Affected

### Must Change
| File | Change Required |
|------|----------------|
| `src/db/neon.ts` | Replace Neon driver with standard `pg` driver |
| `api/index.ts` | Remove Vercel handler wrapper (or keep as compatibility shim) |
| `package.json` | Add `pg`, `pg-pool`; keep `@neondatabase/serverless` until cutover |
| `src/server.ts:74` | Abstract upload directory logic |
| `src/services/google-drive.ts:8` | Abstract credentials file path |

### Should Change (recommended)
| File | Change Required |
|------|----------------|
| `src/db/store.ts` | No change needed (uses `neon.ts` abstraction already) |
| `src/services/video-engine-local.ts:215` | Update serverless detection logic |
| `src/server.ts:1604` | Ensure `app.listen()` works standalone (already does for dev) |

### May Need Change Later
| File | Change Required |
|------|----------------|
| `src/services/image-ai.ts` | No change (uses external APIs via HTTP) |
| `src/services/video-ai.ts` | No change (uses external APIs via HTTP) |
| `src/services/canva.ts` | No change (uses external APIs) |
| `src/services/social-publish.ts` | No change (uses external APIs) |
| `vercel.json` | Keep as-is until Vercel is decommissioned |

## 2. Vercel-Specific Code to Isolate

### `api/index.ts` (Vercel entry point)
```
Current: Vercel serverless function wrapping Express app
Action: Keep file for Vercel compatibility; create new standalone entry for AWS
```

### `process.env.VERCEL` checks (3 locations)
```
src/server.ts:74           -> uploadDir path selection
src/services/google-drive.ts:8 -> credentials path selection  
src/services/video-engine-local.ts:215 -> serverless detection
Action: Replace with platform-agnostic runtime detection utility
```

### `vercel.json`
```
Action: Keep as-is. Do not delete until Vercel is fully decommissioned.
```

## 3. Neon-Specific Code to Isolate

### `src/db/neon.ts` (sole Neon coupling point)
```
Current: import { neon } from '@neondatabase/serverless'
Action: Create src/db/postgres.ts with standard pg driver
        Create src/db/provider.ts to select driver based on env
        Keep neon.ts intact for rollback capability
```

### `package.json`
```
Current: "@neondatabase/serverless": "^1.0.2"
Action: Add "pg": "^8.x" and "@types/pg"
        Keep @neondatabase/serverless until cutover complete
```

## 4. Environment Changes Needed

See `docs/AWS_ENV_MAPPING.md` for full mapping.

Key changes:
- `DATABASE_URL` format stays the same (PostgreSQL connection string)
- Add `DB_PROVIDER=neon|pg` to select database driver
- Add `STORAGE_PROVIDER=local|s3` to select storage backend
- Add `PLATFORM=vercel|aws|local` for runtime detection
- S3 vars (`S3_BUCKET`, `S3_REGION`, etc.) already in `.env.example`

## 5. Prisma Changes Needed

**Not applicable.** This project does not use Prisma. Database access is via raw SQL through the Neon serverless driver (`src/db/neon.ts` -> `src/db/store.ts`).

Schema is managed via `db/schema.sql`. Migration strategy is manual SQL execution.

## 6. Upload/Storage Abstraction Needs

### Current storage points:
1. **Multer uploads** -> `data/uploads/` or `/tmp/data/uploads/` (Vercel)
2. **Video engine output** -> `video-engine/output/`
3. **Google credentials** -> `data/google-credentials.json`

### Proposed abstraction:
```typescript
// src/lib/storage.ts
interface StorageProvider {
  write(key: string, data: Buffer): Promise<string>;  // returns URL
  read(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  getUrl(key: string): string;
}
```
- `LocalStorageProvider` -- current filesystem behavior
- `S3StorageProvider` -- AWS S3 via `@aws-sdk/client-s3`
- Selected via `STORAGE_PROVIDER` env var

## 7. Callback URL Changes Needed

| Callback | Current | AWS Target |
|----------|---------|------------|
| Google OAuth redirect | `{ADMIN_BASE_URL}/api/google/callback` | Same pattern, new base URL |
| Meta OAuth redirect | `{ADMIN_BASE_URL}/api/meta/callback` | Same pattern, new base URL |
| TikTok OAuth redirect | `{ADMIN_BASE_URL}/api/tiktok/callback` | Same pattern, new base URL |
| Google domain verification | `/google8379582d5bf9d84d.html` | Must serve same file on new host |

**Action**: All callbacks use `ADMIN_BASE_URL` -- updating this single env var handles the change. OAuth provider consoles must also be updated with new redirect URIs.

## 8. Scripts/Build/Deploy Changes Needed

### Build
- `tsc` compilation remains unchanged
- Add production start script if not present
- Ensure `dist/` output works with Amplify's Node.js runtime

### Deploy
- Create `amplify.yml` build spec for Amplify Hosting
- Configure Amplify environment variables
- Set up branch-based deployments (staging, production)

### New files needed:
- `amplify.yml` -- Amplify build configuration
- `src/db/postgres.ts` -- Standard pg driver adapter
- `src/lib/storage.ts` -- Storage abstraction layer
- `src/lib/platform.ts` -- Platform/runtime detection utility

## 9. Local Development Impact

**Minimal.** Local development already uses:
- `tsx watch --env-file=.env src/server.ts` (direct Express startup)
- Local filesystem for uploads
- `DATABASE_URL` pointing to any PostgreSQL instance

The `pg` driver works with any PostgreSQL database (including Neon) via standard connection string. Local dev flow remains unchanged.

## 10. Testing Requirements Before Cutover

| Test | Description |
|------|-------------|
| DB connectivity | Verify `pg` driver connects to Aurora with same queries |
| Schema compatibility | Run `db/schema.sql` on Aurora, verify all tables/indexes |
| CRUD operations | Test all store.ts functions against Aurora |
| Auth flow | Login, session creation, session validation |
| OAuth flows | Google, Meta, TikTok callback roundtrips |
| File upload | Multer -> S3 upload and retrieval |
| Video engine | Video generation and output serving |
| Pipeline | Full daily pipeline run (ingest -> score -> generate -> QA) |
| Static assets | Dashboard HTML pages load correctly |
| API endpoints | All routes return expected responses |
