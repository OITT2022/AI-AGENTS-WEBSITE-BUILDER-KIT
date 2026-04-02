# AWS Target Architecture

## 1. Architecture Overview

```
                    Route 53 (DNS)
                         |
                    CloudFront (CDN)
                         |
                  AWS Amplify Hosting
                  (Express SSR app)
                         |
          +--------------+--------------+
          |              |              |
    Aurora PostgreSQL   S3 Bucket   Secrets Manager
    (Serverless v2)    (uploads,    (API keys,
                       media,       DB credentials)
                       static)
          |
     CloudWatch
     (logs + metrics)
```

## 2. Target Hosting Model

### AWS Amplify Hosting

| Aspect | Decision |
|--------|----------|
| Service | AWS Amplify Hosting (SSR) |
| Runtime | Node.js 18+ |
| Build | `tsc` (same as current) |
| Entry point | Standard Express `app.listen()` |
| Static assets | Served via Express or offloaded to S3+CloudFront |

**Why Amplify**: This is an Express app (not Next.js). Amplify Hosting supports Node.js SSR apps with managed deployments, custom domains, and environment variables. It avoids the complexity of ECS/Fargate for a single Express server while providing auto-scaling.

**Alternative considered**: ECS Fargate -- more control but significantly more infrastructure management. Reserved for future if Amplify proves insufficient.

**Rejected**: App Runner (per instruction), Lambda (Express app with many routes and stateful sessions is a poor fit for Lambda without significant refactoring).

## 3. Target DB Model

### Amazon Aurora PostgreSQL Serverless v2

| Aspect | Decision |
|--------|----------|
| Engine | Aurora PostgreSQL 15+ |
| Mode | Serverless v2 |
| Min ACU | 0.5 |
| Max ACU | 4 (adjustable based on load) |
| Connection | Standard PostgreSQL TCP via `pg` driver |
| Pooling | Application-level `pg-pool` or RDS Proxy if needed |

**Why Aurora Serverless v2**:
- Scales to zero-ish (0.5 ACU minimum) for cost efficiency
- Compatible with standard PostgreSQL wire protocol
- Supports all PostgreSQL extensions used (`pgcrypto`)
- Automatic storage scaling
- Built-in backups and point-in-time recovery
- No Neon-specific features are used that require Neon

**Connection strategy**:
- Replace `@neondatabase/serverless` with standard `pg` (node-postgres) library
- Use connection pooling via `pg.Pool` with sensible defaults (max 10 connections)
- Connection string via Secrets Manager, injected as `DATABASE_URL`

## 4. Target Secrets Strategy

### AWS Secrets Manager

| Secret | Source |
|--------|--------|
| `DATABASE_URL` | Aurora connection string |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `CANVA_CLIENT_SECRET` | Canva API |
| `META_APP_SECRET` | Facebook/Meta |
| `TIKTOK_CLIENT_SECRET` | TikTok |
| `OPENAI_API_KEY` | Image AI |
| `RUNWAY_API_KEY` | Video AI |
| All `*_API_KEY`, `*_SECRET`, `*_TOKEN` vars | Various integrations |

**Non-secret env vars** (safe in Amplify environment variables):
- `APP_TIMEZONE`, `DEFAULT_MARKETING_LOCALE`, `DEFAULT_CURRENCY`
- `ADMIN_BASE_URL`, `IMAGE_AI_PROVIDER`, `VIDEO_AI_PROVIDER`
- `SOURCE_API_BASE_URL`, `S3_BUCKET`, `S3_REGION`

**Why Secrets Manager**: Automatic rotation support, IAM-based access control, audit trail via CloudTrail. Amplify can reference Secrets Manager values natively.

## 5. Target Assets/Storage Strategy

### Amazon S3

| Bucket | Purpose |
|--------|---------|
| `{project}-uploads` | User file uploads (multer) |
| `{project}-media` | Generated creatives, video output |
| `{project}-credentials` | Service account credentials (encrypted, restricted ACL) |

**Migration path**:
1. Abstract storage layer with a `StorageProvider` interface
2. Implement `LocalStorageProvider` (current behavior) and `S3StorageProvider`
3. Switch provider via environment variable
4. Multer configured with S3 storage adapter in production

## 6. Target CDN Strategy

### Amazon CloudFront

- Front the S3 media bucket for generated creative assets
- Origin: S3 bucket with OAI (Origin Access Identity)
- Cache: Standard caching for media files (images, videos)
- Static dashboard HTML can optionally be served via CloudFront -> S3

**Note**: CloudFront is optional in Phase 1. Amplify provides its own CDN for the app. CloudFront becomes important when media volume grows.

## 7. Logging/Monitoring Strategy

### Amazon CloudWatch

| Component | Log Group |
|-----------|-----------|
| Application logs | `/amplify/{app-id}/logs` |
| Aurora slow queries | `/aws/rds/cluster/{cluster}/postgresql` |
| API access logs | Amplify built-in |

- Structured JSON logging already implemented (`src/lib/logger.ts`)
- CloudWatch Logs Insights for query analysis
- Alarms: DB connection failures, 5xx error rate, high latency
- Dashboard: API latency, DB connections, error rates

## 8. Scheduled Jobs Strategy

### Current State
No automated scheduling exists. Pipeline runs are triggered manually via API endpoints (`/api/pipeline/daily`, `/api/pipeline/run`).

### Target State (Phase 2)
- **Amazon EventBridge Scheduler** to trigger pipeline endpoints on schedule
- Alternative: EventBridge -> Lambda -> HTTP call to Amplify endpoint
- Cron expression: Daily at configured time (e.g., `cron(0 6 * * ? *)` for 6 AM UTC)

This is deferred to Phase 2 since it doesn't block migration.

## 9. Staging Architecture

Identical to production but with:
- Separate Aurora Serverless v2 cluster (staging)
- Separate S3 buckets (staging prefix)
- Separate Secrets Manager entries (staging prefix)
- Amplify branch deployment (e.g., `staging` branch)
- Staging subdomain (e.g., `staging.advplanner.com`)

## 10. Production Architecture

- Amplify Hosting connected to `main` branch
- Aurora Serverless v2 with automated backups (7-day retention)
- S3 with versioning enabled
- CloudFront distribution (optional Phase 1)
- Route 53 for DNS (when ready to migrate domain)
- Secrets Manager with rotation policies
- CloudWatch alarms and dashboards

## 11. Service Selection Rationale

| AWS Service | Why Chosen | What It Replaces |
|-------------|-----------|-----------------|
| Amplify Hosting | Managed Node.js hosting, git-based deploys, custom domains | Vercel hosting |
| Aurora Serverless v2 | PostgreSQL-compatible, auto-scaling, cost-efficient | Neon PostgreSQL |
| S3 | Durable object storage, lifecycle policies | Local filesystem |
| Secrets Manager | Secure secret storage with rotation | Vercel env vars |
| CloudFront | Global CDN for media assets | Vercel edge network |
| Route 53 | DNS management integrated with AWS | External DNS |
| CloudWatch | Centralized logging and monitoring | Vercel logs |
| EventBridge (Phase 2) | Scheduled job triggering | Manual API calls |
