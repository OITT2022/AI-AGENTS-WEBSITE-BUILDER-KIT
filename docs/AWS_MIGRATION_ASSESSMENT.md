# AWS Migration Assessment

## 1. Current Architecture Summary

| Component | Current Provider | Details |
|-----------|-----------------|---------|
| Hosting | Vercel (serverless Node) | Express app wrapped in `api/index.ts` Vercel handler |
| Database | Neon PostgreSQL (serverless) | `@neondatabase/serverless` driver, HTTP-mode queries |
| ORM | None (raw SQL via Neon driver) | No Prisma despite instructions -- uses `neon()` tagged-template SQL |
| Framework | Express 4.x (not Next.js) | TypeScript, compiled with `tsc`, runs via `tsx` in dev |
| Static assets | Vercel + Express static | Public HTML dashboard served from `public/` |
| File uploads | Local filesystem / Vercel `/tmp` | `multer` to `data/uploads/` or `/tmp` on Vercel |
| Video output | Local filesystem | `video-engine/output/` served via Express static |
| CDN | None explicit | Vercel edge network handles assets implicitly |
| Secrets | `.env` file / Vercel env vars | `dotenv` loaded at runtime |
| Auth | Cookie-based sessions in PostgreSQL | Custom session management in `services/auth.ts` |
| DNS | External (advplanner.com) | Google domain verification present |
| Cron/Jobs | Manual trigger via API endpoints | No scheduled infrastructure detected |

## 2. Detected Vercel Dependencies

### Direct Vercel coupling (3 locations):

1. **`api/index.ts`** -- Vercel serverless function entry point. Wraps the Express app in a Vercel handler function.
2. **`vercel.json`** -- Routing config mapping all paths to `api/index.ts` via `@vercel/node` builder.
3. **`process.env.VERCEL`** checks in source code:
   - `src/server.ts:74` -- upload directory selection (`/tmp` vs `cwd()`)
   - `src/services/google-drive.ts:8` -- credentials file path
   - `src/services/video-engine-local.ts:215` -- serverless environment detection

### Implicit Vercel assumptions:
- `/tmp` is the only writable directory in production
- Cold starts initialize DB connection and default admin
- No persistent filesystem across invocations
- `process.cwd()` for static file paths in `public/`
- Vercel edge network handles SSL termination

## 3. Detected Neon Dependencies

### Direct Neon coupling (1 file):

- **`src/db/neon.ts`** -- The sole database access layer. Uses `@neondatabase/serverless` (`neon()`) for HTTP-based PostgreSQL queries.
- **`src/db/store.ts`** -- All database operations route through `neon.ts`. Raw SQL queries, no ORM.
- **`package.json`** -- `@neondatabase/serverless` v1.0.2 dependency.

### Neon-specific behaviors:
- HTTP-mode query protocol (not standard `pg` TCP connections)
- No connection pooling configured (Neon handles this server-side)
- No `pgBouncer` or pooler URL detected
- `DATABASE_URL` is the single connection string

## 4. Current Deployment Assumptions

- Single Vercel project deployment
- Build command: `tsc` (TypeScript compilation)
- Output: `dist/` directory (CommonJS modules)
- Entry point: `api/index.ts` imports from `src/server`
- No build framework (not Next.js build, just `tsc`)
- Static files served from `public/` at runtime
- No preview deployment branches detected
- `.vercel/` directory present locally

## 5. Current DB Assumptions

- PostgreSQL with `pgcrypto` extension
- Custom ENUM types (`entity_type`, `publish_platform`, `approval_status`, etc.)
- `gen_random_uuid()` for UUID generation
- 12 tables with foreign keys, cascading deletes
- JSONB columns for flexible payloads
- Multiple composite indexes
- No migration tool -- schema managed via `db/schema.sql`
- Seed script: `tsx src/seed.ts`

## 6. Upload/Storage Assumptions

- **Uploads**: `multer` stores to local filesystem (`data/uploads/` or `/tmp`)
- **Video output**: Written to `video-engine/output/` and served via Express static
- **Google Drive credentials**: Stored as JSON file on filesystem
- **No S3 integration** in current code (despite `.env.example` having S3 vars)
- **No CDN** for generated media

## 7. Auth/Callback/Domain Assumptions

- Google OAuth callbacks use `ADMIN_BASE_URL` env var
- Meta (Facebook) OAuth callbacks exist in server routes
- TikTok OAuth callbacks exist in server routes
- Google domain verification file served at root
- Cookie-based auth with `SameSite=Lax`
- Sessions stored in PostgreSQL

## 8. Migration Blockers

| Blocker | Severity | Notes |
|---------|----------|-------|
| Neon serverless driver | **High** | Must replace with standard `pg` driver for Aurora |
| Filesystem writes in production | **High** | Uploads, credentials, video output all write to local fs |
| Vercel handler wrapper | **Medium** | `api/index.ts` must be replaced with standard Express listener |
| No migration tool | **Medium** | Schema changes managed manually; need strategy for Aurora |
| OAuth callback URLs | **Low** | Must update when domain/URL changes |

## 9. High-Risk Points

1. **Database driver swap**: `@neondatabase/serverless` uses HTTP protocol; Aurora needs TCP (`pg` or `pg-pool`). All queries go through `src/db/neon.ts` -- single point of change but must verify SQL compatibility.
2. **Filesystem dependency**: Video engine, uploads, and credential storage all assume writable local filesystem. On Amplify/Lambda, `/tmp` is limited and ephemeral.
3. **Cold start initialization**: `api/index.ts` runs `initDatabase()` + `ensureDefaultAdmin()` once per cold start. Must replicate on AWS.
4. **Session management**: Cookie sessions reference production domain. Must configure for new domain/proxy.
5. **ENUM types**: PostgreSQL ENUMs must be created before table creation on Aurora.

## 10. Recommended Migration Approach

**Incremental, staging-first migration:**

1. Abstract the database layer behind a provider-agnostic interface
2. Abstract file storage behind a provider-agnostic interface
3. Replace Neon driver with standard `pg` driver (works with both Neon and Aurora)
4. Deploy to AWS Amplify in staging with Aurora Serverless v2
5. Validate all functionality in staging
6. Cut over production

## 11. Recommended Order of Execution

1. Create all migration documentation (this phase)
2. Abstract `src/db/neon.ts` to support both Neon and standard `pg`
3. Abstract file storage paths to support both local and S3
4. Set up AWS infrastructure (Aurora, Amplify, S3)
5. Deploy staging environment
6. Rehearse DB migration (dump/restore)
7. Validate all API endpoints and OAuth flows
8. Production cutover with rollback plan
