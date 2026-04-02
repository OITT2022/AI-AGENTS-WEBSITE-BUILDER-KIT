# AWS Rollback Plan

## 1. Rollback Triggers

| Trigger | Severity | Decision Time |
|---------|----------|--------------|
| Application fails to start on AWS | Critical | Immediate |
| Database connection failures persist > 5 min | Critical | Immediate |
| Data corruption or loss detected | Critical | Immediate |
| 5xx error rate > 10% for 10 min | Critical | 5 minutes |
| Auth/sessions completely broken | High | 15 minutes |
| Pipeline produces incorrect results | High | 30 minutes |
| Multiple OAuth flows broken | High | 30 minutes |
| Performance > 5x degradation sustained | Medium | 1 hour |
| Non-critical endpoint failures | Low | Fix forward preferred |

## 2. What to Revert First

### Priority Order:
1. **DNS** -- Point domain back to Vercel (fastest user-facing fix)
2. **Application** -- Re-enable Vercel deployment
3. **Database** -- Revert `DATABASE_URL` to Neon connection string
4. **Secrets** -- Restore original env vars in Vercel dashboard

### Step-by-step:

#### Step 1: Restore DNS (if changed)
```bash
# If using Route 53 -- update A record to old Vercel CNAME
# If using external DNS -- revert CNAME to Vercel target
# This takes effect within TTL (should be 60s if lowered pre-cutover)
```

#### Step 2: Re-enable Vercel
```bash
# In Vercel dashboard:
# 1. Navigate to project
# 2. Trigger redeployment of last known good commit
# 3. Verify deployment succeeds
```

#### Step 3: Revert Database Connection
```bash
# In Vercel dashboard > Environment Variables:
# Set DATABASE_URL = <original Neon connection string>
# Trigger redeployment
```

#### Step 4: Verify Vercel is serving traffic
```bash
curl https://{domain}/api/status
curl https://{domain}/dashboard
```

## 3. How to Restore Old Environment

### Vercel Environment Variables
All original environment variables should still be present in Vercel dashboard (we do not delete them during migration).

If they were modified:
1. Check `.env.example` for variable names
2. Retrieve secret values from team password manager
3. Re-enter in Vercel dashboard
4. Redeploy

### Key variables to verify:
- `DATABASE_URL` -- Neon connection string
- `ADMIN_BASE_URL` -- Original Vercel URL
- All OAuth secrets remain unchanged

## 4. How to Restore Old DB Endpoint Usage

### If only application code was changed:
```bash
# Revert to pre-migration commit
git revert <migration-commit-hash>
git push origin main
# Vercel auto-deploys
```

### If database code abstraction was introduced:
```bash
# Set environment variable to use Neon driver
DB_PROVIDER=neon
# The abstraction layer will route to the Neon driver
```

### If data was written to Aurora during cutover:
1. Assess volume of new data (query Aurora for records created after cutover timestamp)
2. If minimal (< 100 rows): manually replay critical writes to Neon
3. If significant: export delta from Aurora, import to Neon
4. If too complex: accept data loss for the cutover window, communicate to team

### Neon database should be kept active for at least 7 days post-cutover:
- Do NOT delete Neon project during migration
- Do NOT downgrade Neon plan until rollback window closes
- Neon connection string must remain valid

## 5. How to Restore Old Hosting

### Vercel Hosting Restoration

1. **Verify Vercel project still exists** (we do not delete it)
2. **Check last successful deployment** in Vercel dashboard
3. **Trigger redeployment**:
   - Option A: Push to the deployment branch
   - Option B: Use Vercel CLI: `vercel --prod`
   - Option C: Click "Redeploy" in Vercel dashboard
4. **Verify**: 
   ```bash
   curl -I https://{vercel-url}/
   # Expected: 200 OK
   ```
5. **Restore domain** (if DNS was changed):
   - Update DNS to point to Vercel
   - Or re-add custom domain in Vercel dashboard

### Amplify Cleanup After Rollback
- Pause Amplify deployments (do not delete -- may retry migration)
- Keep Aurora cluster running if data was written
- Document what went wrong for next attempt

## 6. Communication Notes

### Pre-cutover communication:
- Notify team of planned maintenance window
- Share expected downtime duration (15-30 minutes)
- Share rollback criteria
- Designate rollback decision maker

### During rollback:
- **Immediate**: Notify team via Slack: "Rolling back AWS migration -- reverting to Vercel/Neon"
- **Within 5 min**: Confirm rollback is in progress, share ETA
- **After rollback**: Confirm service restored, share timeline for next steps

### Post-rollback communication:
- Document what triggered the rollback
- Document timeline of events
- Document what was tried before deciding to rollback
- Schedule post-mortem within 48 hours
- Create action items for addressing root cause before retry

### Template Slack message:
```
[AWS Migration Rollback]
Status: Rolling back to Vercel/Neon
Trigger: {describe trigger}
Started: {timestamp}
Expected resolution: {ETA}
Impact: {describe user impact}
```

## 7. Validation After Rollback

### Immediate checks (within 5 minutes of rollback):
- [ ] Application responds at original URL
- [ ] Dashboard loads correctly
- [ ] Login works with existing credentials
- [ ] API returns data from Neon database
- [ ] No error spikes in Vercel logs

### Extended checks (within 1 hour):
- [ ] All API endpoints functional
- [ ] OAuth flows work with original callback URLs
- [ ] Pipeline can be triggered and completes
- [ ] File uploads work
- [ ] Sessions persist correctly
- [ ] No data inconsistencies

### Data integrity check:
```sql
-- Compare row counts with pre-cutover snapshot
SELECT 'source_entities' as tbl, count(*) FROM source_entities
UNION ALL
SELECT 'entity_snapshots', count(*) FROM entity_snapshots
UNION ALL
SELECT 'campaign_candidates', count(*) FROM campaign_candidates
UNION ALL
SELECT 'creative_batches', count(*) FROM creative_batches
UNION ALL
SELECT 'creative_variants', count(*) FROM creative_variants
UNION ALL
SELECT 'users', count(*) FROM users
UNION ALL
SELECT 'sessions', count(*) FROM sessions
UNION ALL
SELECT 'clients', count(*) FROM clients;
```

## 8. Rollback Timeline Expectations

| Phase | Duration | Cumulative |
|-------|----------|-----------|
| Detect issue | 0-10 min | 0-10 min |
| Decide to rollback | 2-5 min | 2-15 min |
| Revert DNS | 1-5 min (depends on TTL) | 3-20 min |
| Re-enable Vercel | 2-5 min | 5-25 min |
| Verify restoration | 5-10 min | 10-35 min |
| **Total estimated** | | **10-35 minutes** |

## 9. Preventing the Same Issue on Retry

Before attempting migration again:
1. Root cause analysis completed
2. Fix implemented and tested in staging
3. Staging validation extended to cover the failure scenario
4. Rollback procedure updated with lessons learned
5. Team aligned on retry timeline
