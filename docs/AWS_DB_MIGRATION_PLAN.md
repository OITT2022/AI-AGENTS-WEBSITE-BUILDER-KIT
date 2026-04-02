# AWS Database Migration Plan

## 1. Current PostgreSQL Access Model

| Aspect | Current State |
|--------|--------------|
| Provider | Neon PostgreSQL (serverless) |
| Driver | `@neondatabase/serverless` (HTTP protocol) |
| ORM | None -- raw SQL via `src/db/store.ts` |
| Schema file | `db/schema.sql` |
| Migration tool | None -- manual SQL execution |
| Seed script | `tsx src/seed.ts` |
| Connection pooling | Neon-managed (server-side) |
| Extensions | `pgcrypto` |
| Custom types | 5 ENUMs: `entity_type`, `publish_platform`, `approval_status`, `publish_status`, `review_status` |
| Tables | 12 main tables + auth tables (users, sessions, clients, drive_media_cache) |
| Indexes | 6 custom indexes |

## 2. Migration Ownership Assumptions

- Database schema is owned by this project (no shared databases)
- No other applications connect to this Neon database
- Schema changes are applied manually (no automated migration pipeline)
- The application is the sole writer

## 3. Migration Method Recommendation

### Recommended: pg_dump / pg_restore

**Why**: The database is a single-tenant PostgreSQL instance with standard features. A logical dump/restore is the safest, most transparent method.

**Alternative considered**: AWS DMS (Database Migration Service) -- overkill for a single PostgreSQL-to-PostgreSQL migration with no ongoing replication needs.

### Method Details:
1. `pg_dump` from Neon (logical, custom format)
2. Create Aurora Serverless v2 cluster
3. `pg_restore` to Aurora
4. Verify data integrity
5. Update connection string

## 4. Dump/Restore Rehearsal Plan

### Step 1: Export from Neon
```bash
# Get Neon connection string from dashboard or env
pg_dump "$NEON_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --verbose \
  --file=neon_backup_$(date +%Y%m%d_%H%M%S).dump
```

### Step 2: Create Aurora Cluster
```bash
# Via AWS CLI or Console
# Aurora Serverless v2, PostgreSQL 15+, min 0.5 ACU, max 4 ACU
```

### Step 3: Restore to Aurora
```bash
pg_restore \
  --host=$AURORA_ENDPOINT \
  --port=5432 \
  --username=postgres \
  --dbname=realestate_marketing \
  --no-owner \
  --no-privileges \
  --verbose \
  neon_backup.dump
```

### Step 4: Verify
```sql
-- Count rows in all tables
SELECT schemaname, relname, n_live_tup 
FROM pg_stat_user_tables 
ORDER BY relname;

-- Verify extensions
SELECT * FROM pg_extension;

-- Verify custom types
SELECT typname FROM pg_type WHERE typtype = 'e';
```

## 5. Schema Verification Plan

| Check | SQL/Command | Expected |
|-------|-------------|----------|
| Extensions | `SELECT * FROM pg_extension` | `pgcrypto` present |
| ENUM types | `SELECT typname FROM pg_type WHERE typtype = 'e'` | 5 ENUMs |
| Tables | `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'` | 12+ tables |
| Indexes | `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'` | 6+ custom indexes |
| Foreign keys | `SELECT count(*) FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY'` | Expected count |
| UUID generation | `SELECT gen_random_uuid()` | Returns valid UUID |

## 6. Extensions Verification Plan

| Extension | Required By | Verification |
|-----------|-------------|-------------|
| `pgcrypto` | UUID generation (`gen_random_uuid()`) | `CREATE EXTENSION IF NOT EXISTS "pgcrypto"; SELECT gen_random_uuid();` |

Aurora PostgreSQL supports `pgcrypto` natively. No compatibility issues expected.

**Note**: PostgreSQL 13+ has `gen_random_uuid()` built into core. If using Aurora PostgreSQL 15+, `pgcrypto` may not be strictly required for UUID generation, but should be installed for compatibility.

## 7. Index and Constraint Validation Plan

After restore, verify all indexes are intact:

```sql
-- List all indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- Verify unique constraints work
-- (attempt to insert duplicate; expect error)

-- Verify foreign key constraints work  
-- (attempt to insert orphan row; expect error)

-- Check index usage stats are reset (expected after restore)
SELECT * FROM pg_stat_user_indexes WHERE schemaname = 'public';
```

## 8. Staging Migration Rehearsal

### Prerequisites
- Aurora Serverless v2 staging cluster created
- Security group allows access from Amplify staging environment
- VPC networking configured

### Rehearsal Steps
1. Take fresh `pg_dump` from Neon production
2. Restore to Aurora staging cluster
3. Update staging `DATABASE_URL` to Aurora endpoint
4. Deploy application to Amplify staging
5. Run full test suite against staging
6. Run daily pipeline end-to-end
7. Verify all dashboard pages load data correctly
8. Document any issues found
9. Time the full rehearsal process

### Success Criteria
- All tables present with correct row counts
- All API endpoints return expected data
- OAuth flows complete successfully
- Pipeline runs without errors
- No SQL compatibility issues

## 9. Production Cutover Sequence

### T-24h: Preparation
- [ ] Final staging rehearsal completed successfully
- [ ] Aurora production cluster created and tested
- [ ] DNS TTL lowered (if applicable)
- [ ] Team notified of maintenance window

### T-0: Cutover
1. **Freeze writes**: Disable API endpoints or put app in maintenance mode
2. **Final dump**: `pg_dump` from Neon with `--no-sync` flag
3. **Verify dump**: Check dump file size and table counts
4. **Restore**: `pg_restore` to Aurora production
5. **Verify restore**: Run schema and data verification queries
6. **Update secrets**: Switch `DATABASE_URL` in Secrets Manager to Aurora
7. **Deploy**: Trigger Amplify production deployment
8. **Verify**: Run health checks and smoke tests
9. **Monitor**: Watch CloudWatch for errors (30-minute window)
10. **Announce**: Confirm cutover complete

### Estimated downtime: 15-30 minutes (depending on data volume)

## 10. Rollback Sequence

### If issues detected within 1 hour of cutover:
1. Revert `DATABASE_URL` to Neon connection string
2. Redeploy Amplify with Neon configuration
3. Verify application works with Neon
4. Investigate Aurora issues
5. Plan re-attempt

### If issues detected after 1 hour:
1. Assess data written to Aurora since cutover
2. If minimal: revert to Neon, manually replay critical writes
3. If significant: fix forward on Aurora

**Key**: Keep Neon database active (read-only) for at least 7 days after successful cutover.

## 11. Post-Migration Verification Checklist

- [ ] All tables present with correct schemas
- [ ] Row counts match between Neon and Aurora
- [ ] All ENUM types created correctly
- [ ] All indexes present and functional
- [ ] `gen_random_uuid()` works
- [ ] JSONB queries work correctly
- [ ] Timestamp/timezone handling matches
- [ ] Application can connect and query
- [ ] Auth sessions work (login/logout)
- [ ] Full pipeline run succeeds
- [ ] Performance is acceptable (query latency)
- [ ] Connection pooling configured appropriately
- [ ] Automated backups enabled
- [ ] Point-in-time recovery tested
