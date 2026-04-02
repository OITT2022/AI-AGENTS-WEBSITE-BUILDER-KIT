# Deployment Checklist

## Staging Deployment

- [ ] Aurora Serverless v2 staging cluster created
- [ ] S3 staging bucket created
- [ ] Secrets Manager entries created
- [ ] Amplify app created, connected to `staging` branch
- [ ] Environment variables configured in Amplify
- [ ] Database schema applied (`db/schema.sql`)
- [ ] Application deploys successfully
- [ ] Health check passes (`GET /api/status`)
- [ ] Auth login works
- [ ] API endpoints return data
- [ ] Pipeline runs successfully

## Production Deployment

- [ ] All staging tests pass
- [ ] Aurora production cluster created
- [ ] S3 production bucket created
- [ ] Production secrets configured
- [ ] Amplify production branch (`main`) configured
- [ ] Database migrated (see `docs/AWS_DB_MIGRATION_PLAN.md`)
- [ ] Application deploys successfully
- [ ] All verification checks pass

See `docs/AWS_DEPLOYMENT_RUNBOOK.md` for detailed steps.
