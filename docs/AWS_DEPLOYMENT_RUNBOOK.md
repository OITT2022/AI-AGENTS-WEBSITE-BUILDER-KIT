# AWS Deployment Runbook

## 1. Staging Deployment Order

### 1.1 Infrastructure Setup (one-time)
1. Create VPC with public/private subnets (or use default VPC)
2. Create Aurora Serverless v2 cluster in private subnet
   - Engine: PostgreSQL 15+
   - Min ACU: 0.5, Max ACU: 4
   - Enable automated backups (7-day retention)
3. Create S3 bucket for uploads/media
   - Enable versioning
   - Block public access (serve via CloudFront or signed URLs)
4. Create Secrets Manager entries for all secret env vars
5. Create Amplify Hosting app connected to git repository
   - Branch: `staging`
   - Build settings from `amplify.yml`
6. Configure Amplify environment variables (all non-secret vars)
7. Configure Amplify to read secrets from Secrets Manager

### 1.2 Database Setup
1. Connect to Aurora staging cluster
2. Create database: `CREATE DATABASE realestate_marketing;`
3. Run schema: `psql -f db/schema.sql`
4. Optionally run seed: migrate data from Neon or run seed script

### 1.3 Application Deployment
1. Push code to `staging` branch
2. Amplify auto-builds and deploys
3. Verify build succeeds in Amplify console

### 1.4 Post-Deployment Verification
- See section 3 below

---

## 2. Production Deployment Order

### 2.1 Prerequisites
- [ ] Staging deployment fully verified
- [ ] All tests passing against Aurora
- [ ] OAuth callback URLs updated in provider consoles
- [ ] DNS strategy decided (Route 53 or external)

### 2.2 Infrastructure Setup (one-time)
1. Create Aurora Serverless v2 production cluster
   - Same config as staging but Max ACU: 8 (adjustable)
   - Enable deletion protection
   - Enable Performance Insights
2. Create production S3 bucket
3. Create production Secrets Manager entries
4. Create Amplify production branch (`main`)
5. Configure custom domain in Amplify (if ready)

### 2.3 Database Migration
Follow `docs/AWS_DB_MIGRATION_PLAN.md` section 9 (Production Cutover Sequence)

### 2.4 Application Deployment
1. Merge code to `main` branch
2. Amplify auto-builds and deploys
3. Verify build succeeds

---

## 3. Manual Checks After Deployment

### Health Endpoint
```bash
curl https://{amplify-url}/api/status
# Expected: 200 OK with JSON showing service status
```

### Dashboard Access
```bash
curl -I https://{amplify-url}/dashboard
# Expected: 200 OK, HTML content
```

### Auth Flow
1. Navigate to `/dashboard` in browser
2. Login with admin credentials
3. Verify session persists across page loads

### API Smoke Test
```bash
# List entities
curl https://{amplify-url}/api/entities

# Check pipeline status
curl https://{amplify-url}/api/pipeline/status

# Check AI service status
curl https://{amplify-url}/api/status
```

---

## 4. Logs to Inspect

| Log Source | Where | What to Look For |
|------------|-------|-----------------|
| Amplify build logs | Amplify Console > App > Build | Build errors, missing deps |
| Amplify runtime logs | CloudWatch > `/amplify/{app-id}` | Startup errors, unhandled exceptions |
| Aurora logs | CloudWatch > `/aws/rds/cluster/{cluster}` | Connection errors, slow queries |
| Application logs | CloudWatch (structured JSON from `src/lib/logger.ts`) | `[ERROR]` entries, stack traces |

### Key log patterns to search for:
```
# Database connection failures
"DATABASE_URL environment variable is required"
"connection refused"
"ECONNREFUSED"

# Application startup
"Server listening on"
"initDatabase"

# Pipeline errors
"Pipeline failed"
"ingest error"
```

---

## 5. Health Endpoints to Check

| Endpoint | Method | Expected Response |
|----------|--------|------------------|
| `GET /api/status` | GET | `200` with JSON status object |
| `GET /dashboard` | GET | `200` with HTML |
| `GET /` | GET | `200` (root page) |
| `POST /api/auth/login` | POST | `200` with session cookie (valid credentials) |

---

## 6. Database Connectivity Checks

```bash
# From Amplify environment (via API endpoint)
curl https://{amplify-url}/api/entities
# Should return JSON array (even if empty)

# Direct Aurora connectivity (from bastion/VPN)
psql "postgresql://user:pass@aurora-endpoint:5432/realestate_marketing" -c "SELECT 1;"

# Verify pgcrypto
psql ... -c "SELECT gen_random_uuid();"

# Check table count
psql ... -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
```

---

## 7. Prisma Migration/Generation Steps

**Not applicable.** This project uses raw SQL, not Prisma.

### Schema Management Steps:
1. Schema is defined in `db/schema.sql`
2. Apply schema to new database: `psql -f db/schema.sql`
3. For schema changes: write SQL migration files manually
4. Apply in order: `psql -f db/migrations/YYYYMMDD_description.sql`

**Recommendation**: Consider adopting a migration tool (e.g., `node-pg-migrate` or `dbmate`) post-migration for better schema version tracking.

---

## 8. Rollback Trigger Criteria

Initiate rollback if ANY of the following occur within the monitoring window:

| Trigger | Severity | Action |
|---------|----------|--------|
| Application fails to start | Critical | Immediate rollback |
| Database connection failures > 5 min | Critical | Immediate rollback |
| 5xx error rate > 10% for 10 min | Critical | Immediate rollback |
| Auth/login broken | High | Rollback within 30 min |
| Pipeline produces incorrect data | High | Rollback within 1 hour |
| Performance degradation > 3x | Medium | Investigate, rollback if not resolved in 1 hour |
| OAuth flows broken | Medium | Can wait for fix if non-blocking |

See `docs/AWS_ROLLBACK_PLAN.md` for detailed rollback procedures.
