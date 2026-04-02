# Environment Variable Mapping (Quick Reference)

## New Variables for AWS

| Variable | Purpose | Default |
|----------|---------|---------|
| `PLATFORM` | Runtime: `vercel`, `aws`, `local` | `local` |
| `DB_PROVIDER` | DB driver: `neon`, `pg` | `pg` |
| `STORAGE_PROVIDER` | Storage: `local`, `s3` | `local` |
| `AWS_REGION` | AWS region | `eu-west-1` |

## Variables That Change

| Variable | Old Value | New Value |
|----------|-----------|-----------|
| `DATABASE_URL` | Neon connection string | Aurora connection string |
| `ADMIN_BASE_URL` | Vercel URL | Amplify URL or custom domain |

## Variables That Stay the Same

All API keys, OAuth credentials, and service configuration variables remain unchanged.

See `docs/AWS_ENV_MAPPING.md` for the complete mapping with all 50+ variables.
