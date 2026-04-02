# AWS Environment Variable Mapping

## Legend
- **Secret**: Must be stored in AWS Secrets Manager
- **Config**: Can be set as Amplify environment variable
- **New**: Variable that does not exist in current setup

## Database

| Old Variable | New Variable | Purpose | Where Used | Secret? | Migration Notes |
|-------------|-------------|---------|------------|---------|-----------------|
| `DATABASE_URL` | `DATABASE_URL` | PostgreSQL connection string | `src/db/neon.ts` | Secret | Change from Neon URL to Aurora endpoint. Format: `postgresql://user:pass@cluster-endpoint:5432/dbname?sslmode=require` |
| `REDIS_URL` | `REDIS_URL` | Redis connection (unused in code) | `.env.example` only | Secret | Not currently used. Future: ElastiCache endpoint |
| -- | `DB_PROVIDER` | Select DB driver: `neon` or `pg` | New: `src/db/provider.ts` | Config | **New.** Default: `pg` on AWS, `neon` on Vercel. Safe default: `pg` |

## Source API

| Old Variable | New Variable | Purpose | Where Used | Secret? | Migration Notes |
|-------------|-------------|---------|------------|---------|-----------------|
| `SOURCE_API_BASE_URL` | `SOURCE_API_BASE_URL` | Real estate website API base | `src/services/findus-client.ts` | Config | No change |
| `SOURCE_API_KEY` | `SOURCE_API_KEY` | API authentication token | `src/services/findus-client.ts` | Secret | No change |
| `SOURCE_API_TIMEOUT_MS` | `SOURCE_API_TIMEOUT_MS` | API timeout | `src/services/findus-client.ts` | Config | No change. Default: `15000` |

## Storage

| Old Variable | New Variable | Purpose | Where Used | Secret? | Migration Notes |
|-------------|-------------|---------|------------|---------|-----------------|
| `S3_ENDPOINT` | `S3_ENDPOINT` | S3-compatible endpoint | Not yet used in code | Config | Set to empty for AWS S3 (uses default). Only needed for S3-compatible services |
| `S3_BUCKET` | `S3_BUCKET` | Upload bucket name | Not yet used in code | Config | Default: `realestate-marketing-assets` |
| `S3_ACCESS_KEY_ID` | -- | S3 access key | Not yet used | -- | **Remove.** Use IAM role on AWS instead of explicit keys |
| `S3_SECRET_ACCESS_KEY` | -- | S3 secret key | Not yet used | -- | **Remove.** Use IAM role on AWS instead of explicit keys |
| `S3_REGION` | `AWS_REGION` | AWS region | Not yet used in code | Config | Use standard `AWS_REGION`. Default: `eu-west-1` |
| -- | `STORAGE_PROVIDER` | Select storage: `local` or `s3` | New: `src/lib/storage.ts` | Config | **New.** Default: `local` for dev, `s3` for AWS |

## AI Services

| Old Variable | New Variable | Purpose | Where Used | Secret? | Migration Notes |
|-------------|-------------|---------|------------|---------|-----------------|
| `ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY` | Claude AI text generation | `.env.example` | Secret | No change |
| `AI_MODEL_PRIMARY` | `AI_MODEL_PRIMARY` | Primary AI model | `.env.example` | Config | No change |
| `AI_MODEL_HEAVY` | `AI_MODEL_HEAVY` | Heavy AI model | `.env.example` | Config | No change |
| `IMAGE_AI_PROVIDER` | `IMAGE_AI_PROVIDER` | Image gen provider | `src/services/image-ai.ts` | Config | No change |
| `OPENAI_API_KEY` | `OPENAI_API_KEY` | OpenAI image gen | `src/services/image-ai.ts` | Secret | No change |
| `OPENAI_IMAGE_MODEL` | `OPENAI_IMAGE_MODEL` | Image model name | `src/services/image-ai.ts` | Config | No change |
| `STABILITY_API_KEY` | `STABILITY_API_KEY` | Stability AI | `src/services/image-ai.ts` | Secret | No change |
| `STABILITY_MODEL` | `STABILITY_MODEL` | Stability model | `src/services/image-ai.ts` | Config | No change |
| `REPLICATE_API_TOKEN` | `REPLICATE_API_TOKEN` | Replicate API | `src/services/image-ai.ts` | Secret | No change |
| `REPLICATE_IMAGE_MODEL` | `REPLICATE_IMAGE_MODEL` | Replicate image model | `src/services/image-ai.ts` | Config | No change |
| `VIDEO_AI_PROVIDER` | `VIDEO_AI_PROVIDER` | Video gen provider | `src/services/video-ai.ts` | Config | No change |
| `RUNWAY_API_KEY` | `RUNWAY_API_KEY` | RunwayML API | `src/services/video-ai.ts` | Secret | No change |
| `RUNWAY_MODEL` | `RUNWAY_MODEL` | Runway model | `src/services/video-ai.ts` | Config | No change |
| `PIKA_API_KEY` | `PIKA_API_KEY` | Pika video | `src/services/video-ai.ts` | Secret | No change |
| `REPLICATE_VIDEO_MODEL` | `REPLICATE_VIDEO_MODEL` | Replicate video model | `src/services/video-ai.ts` | Config | No change |
| `CREATOMATE_API_KEY` | `CREATOMATE_API_KEY` | Creatomate | `src/services/video-ai.ts` | Secret | No change |
| `ENABLE_EXTERNAL_AI` | `ENABLE_EXTERNAL_AI` | Toggle external AI | `src/server.ts` | Config | No change |

## Canva

| Old Variable | New Variable | Purpose | Where Used | Secret? | Migration Notes |
|-------------|-------------|---------|------------|---------|-----------------|
| `CANVA_CLIENT_ID` | `CANVA_CLIENT_ID` | Canva OAuth | `src/services/canva.ts` | Config | No change |
| `CANVA_CLIENT_SECRET` | `CANVA_CLIENT_SECRET` | Canva OAuth | `src/services/canva.ts` | Secret | No change |
| `CANVA_BRAND_ID` | `CANVA_BRAND_ID` | Canva brand | `src/services/canva.ts` | Config | No change |

## Google

| Old Variable | New Variable | Purpose | Where Used | Secret? | Migration Notes |
|-------------|-------------|---------|------------|---------|-----------------|
| `GOOGLE_CLIENT_ID` | `GOOGLE_CLIENT_ID` | Google OAuth | `src/server.ts`, `src/services/google-drive.ts` | Config | No change |
| `GOOGLE_CLIENT_SECRET` | `GOOGLE_CLIENT_SECRET` | Google OAuth | `src/server.ts`, `src/services/google-drive.ts` | Secret | No change |
| `GOOGLE_API_KEY` | `GOOGLE_API_KEY` | Google Picker API | `src/server.ts` | Secret | No change |

## Social Platforms

| Old Variable | New Variable | Purpose | Where Used | Secret? | Migration Notes |
|-------------|-------------|---------|------------|---------|-----------------|
| `META_APP_ID` | `META_APP_ID` | Facebook/Instagram | `src/services/social-publish.ts` | Config | No change |
| `META_APP_SECRET` | `META_APP_SECRET` | Facebook/Instagram | `src/services/social-publish.ts` | Secret | No change |
| `META_AD_ACCOUNT_ID` | `META_AD_ACCOUNT_ID` | Meta ads | `.env.example` | Config | No change |
| `META_ACCESS_TOKEN` | `META_ACCESS_TOKEN` | Meta API | `.env.example` | Secret | No change |
| `TIKTOK_CLIENT_KEY` | `TIKTOK_CLIENT_KEY` | TikTok | `src/services/social-publish.ts` | Config | No change |
| `TIKTOK_CLIENT_SECRET` | `TIKTOK_CLIENT_SECRET` | TikTok | `src/services/social-publish.ts` | Secret | No change |
| `TIKTOK_ADVERTISER_ID` | `TIKTOK_ADVERTISER_ID` | TikTok ads | `.env.example` | Config | No change |
| `TIKTOK_ACCESS_TOKEN` | `TIKTOK_ACCESS_TOKEN` | TikTok API | `.env.example` | Secret | No change |

## Application

| Old Variable | New Variable | Purpose | Where Used | Secret? | Migration Notes |
|-------------|-------------|---------|------------|---------|-----------------|
| `ADMIN_BASE_URL` | `ADMIN_BASE_URL` | Base URL for callbacks | `src/server.ts` | Config | **Must update** to new Amplify URL or custom domain |
| `APP_TIMEZONE` | `APP_TIMEZONE` | Timezone | `.env.example` | Config | No change. Default: `Asia/Jerusalem` |
| `DEFAULT_MARKETING_LOCALE` | `DEFAULT_MARKETING_LOCALE` | Locale | `.env.example` | Config | No change. Default: `he` |
| `DEFAULT_CURRENCY` | `DEFAULT_CURRENCY` | Currency | `.env.example` | Config | No change. Default: `EUR` |
| `PORT` | `PORT` | Server port | `src/server.ts` | Config | Amplify sets this automatically |
| `NODE_ENV` | `NODE_ENV` | Environment | `src/server.ts` | Config | Set to `production` on Amplify |

## Notifications

| Old Variable | New Variable | Purpose | Where Used | Secret? | Migration Notes |
|-------------|-------------|---------|------------|---------|-----------------|
| `SMTP_HOST` | `SMTP_HOST` | Email server | `.env.example` | Config | Consider Amazon SES |
| `SMTP_PORT` | `SMTP_PORT` | Email port | `.env.example` | Config | No change |
| `SMTP_USER` | `SMTP_USER` | Email auth | `.env.example` | Secret | No change |
| `SMTP_PASSWORD` | `SMTP_PASSWORD` | Email auth | `.env.example` | Secret | No change |
| `NOTIFY_EMAIL` | `NOTIFY_EMAIL` | Notification target | `.env.example` | Config | No change |
| `SLACK_WEBHOOK_URL` | `SLACK_WEBHOOK_URL` | Slack notifications | `.env.example` | Secret | No change |

## New Variables for AWS

| Variable | Purpose | Default | Secret? |
|----------|---------|---------|---------|
| `PLATFORM` | Runtime detection: `vercel`, `aws`, `local` | `local` | Config |
| `DB_PROVIDER` | Database driver: `neon`, `pg` | `pg` | Config |
| `STORAGE_PROVIDER` | Storage backend: `local`, `s3` | `local` | Config |
| `AWS_REGION` | AWS region for all services | `eu-west-1` | Config |
