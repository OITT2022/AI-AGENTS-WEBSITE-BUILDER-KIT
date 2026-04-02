# AWS Cutover Checklist

## 1. Pre-Cutover Checklist (T-7 days to T-1 day)

### Infrastructure Ready
- [ ] Aurora Serverless v2 production cluster created and accessible
- [ ] S3 production bucket created with correct permissions
- [ ] Secrets Manager entries created with production values
- [ ] Amplify Hosting app created and connected to repository
- [ ] Amplify custom domain configured (if applicable)
- [ ] VPC / security groups allow Amplify -> Aurora connectivity
- [ ] CloudWatch log groups created
- [ ] CloudWatch alarms configured (5xx rate, DB connection errors)

### Code Ready
- [ ] `pg` driver abstraction tested against Aurora in staging
- [ ] Storage abstraction tested with S3 in staging
- [ ] All API endpoints verified in staging
- [ ] OAuth flows verified in staging
- [ ] Full pipeline run completed successfully in staging
- [ ] No Neon-specific code paths remain in active use

### Staging Validation Complete
- [ ] Staging environment running for at least 48 hours without errors
- [ ] At least 2 full pipeline runs completed in staging
- [ ] Auth login/logout/session tested
- [ ] File upload tested (if S3 migration is in scope)
- [ ] All dashboard pages load correctly
- [ ] Performance acceptable (response times within 2x of current)

### External Dependencies Updated
- [ ] Google OAuth console: redirect URIs updated for new domain
- [ ] Meta developer console: redirect URIs updated
- [ ] TikTok developer console: redirect URIs updated
- [ ] DNS TTL lowered to 60 seconds (if switching DNS)
- [ ] Google domain verification file served from new host

---

## 2. Freeze Checklist (T-2 hours)

- [ ] Notify team: maintenance window starting
- [ ] Disable any external integrations that write to the database
- [ ] Stop any scheduled pipelines (if configured)
- [ ] Note current Neon database row counts for all tables
- [ ] Take screenshot of current Neon dashboard for reference
- [ ] Ensure rollback credentials (Neon) are accessible

---

## 3. Final Database Sync Checklist (T-0)

- [ ] Put application in maintenance mode (or stop Vercel deployment)
- [ ] Wait 2 minutes for in-flight requests to complete
- [ ] Run final `pg_dump` from Neon production
- [ ] Verify dump file integrity (check size, spot-check tables)
- [ ] Run `pg_restore` to Aurora production
- [ ] Verify row counts match Neon (compare all tables)
- [ ] Verify `gen_random_uuid()` works on Aurora
- [ ] Verify ENUM types present
- [ ] Verify indexes present
- [ ] Run a test INSERT + SELECT + DELETE cycle
- [ ] Record Aurora endpoint for connection string

---

## 4. Secret Switch Checklist (T-0 + 15 min)

- [ ] Update `DATABASE_URL` in Secrets Manager to Aurora endpoint
- [ ] Update `ADMIN_BASE_URL` to new domain/URL
- [ ] Set `DB_PROVIDER=pg` in Amplify environment
- [ ] Set `STORAGE_PROVIDER=s3` (if S3 migration is in scope)
- [ ] Set `PLATFORM=aws` in Amplify environment
- [ ] Verify all other secrets are present in Secrets Manager
- [ ] Double-check: no Neon-specific connection strings remain in active config

---

## 5. DNS Switch Checklist (T-0 + 20 min)

### If moving DNS to Route 53:
- [ ] Create Route 53 hosted zone
- [ ] Create A/AAAA records pointing to Amplify
- [ ] Update domain registrar nameservers to Route 53
- [ ] Wait for propagation (monitor with `dig` or `nslookup`)

### If keeping external DNS temporarily:
- [ ] Create CNAME record pointing to Amplify URL
- [ ] Verify domain verification in Amplify
- [ ] Document plan for full DNS migration later

---

## 6. Post-Cutover Verification (T-0 + 25 min)

### Critical Path (must pass within 10 minutes)
- [ ] Application responds at new URL: `curl https://{domain}/api/status`
- [ ] Dashboard loads: `curl -I https://{domain}/dashboard`
- [ ] Login works with admin credentials
- [ ] API returns data: `curl https://{domain}/api/entities`
- [ ] Database queries succeed (check CloudWatch for errors)

### Extended Verification (within 30 minutes)
- [ ] Create a test entity via API
- [ ] List entities and confirm test entity appears
- [ ] Run pipeline manually: `POST /api/pipeline/daily`
- [ ] Verify pipeline completes without errors
- [ ] Check Google Drive integration (if configured)
- [ ] Check Canva integration (if configured)
- [ ] Test file upload (if S3 migration is in scope)
- [ ] Verify video engine output serves correctly

### OAuth Verification (within 1 hour)
- [ ] Google OAuth callback works
- [ ] Meta OAuth callback works (if configured)
- [ ] TikTok OAuth callback works (if configured)

---

## 7. Monitoring Window (T-0 + 30 min to T-0 + 24 hours)

### First 30 minutes
- Watch CloudWatch for:
  - [ ] No 5xx errors
  - [ ] No database connection errors
  - [ ] Application logs show normal operation
  - [ ] Response times are acceptable

### First 2 hours
- [ ] No error spikes in CloudWatch
- [ ] Memory/CPU within normal range
- [ ] Aurora ACU scaling behaves as expected
- [ ] No session issues (users can stay logged in)

### First 24 hours
- [ ] Daily pipeline runs successfully (if scheduled)
- [ ] No data integrity issues reported
- [ ] All OAuth tokens still valid
- [ ] No unexpected errors in logs
- [ ] Performance stable

---

## 8. Rollback Threshold

### Immediate rollback (within 5 minutes) if:
- Application does not start on Amplify
- Database connection completely fails
- Data corruption detected

### Rollback within 30 minutes if:
- Error rate exceeds 10% of requests
- Critical features broken (auth, pipeline, API)
- Performance degradation > 5x

### Rollback within 2 hours if:
- OAuth integrations cannot be fixed
- Persistent data issues
- Unresolvable compatibility problems

### Do NOT rollback if:
- Minor UI issues (fix forward)
- Single non-critical API endpoint issue (fix forward)
- Performance slightly slower but functional (optimize forward)

See `docs/AWS_ROLLBACK_PLAN.md` for detailed rollback procedures.

---

## 9. Post-Cutover Cleanup (T + 7 days)

After 7 days of stable operation:
- [ ] Disable Vercel deployment (do not delete yet)
- [ ] Set Neon database to read-only or pause
- [ ] Remove `@neondatabase/serverless` dependency (if fully migrated)
- [ ] Remove `api/index.ts` Vercel handler (if fully migrated)
- [ ] Update all documentation to reflect AWS-only setup
- [ ] Archive Vercel project
- [ ] Cancel Neon subscription (after 30 days if no issues)
