# Cutover Checklist (Quick Reference)

## Before Cutover
- [ ] Staging validated for 48+ hours
- [ ] OAuth redirect URIs updated in provider consoles
- [ ] DNS TTL lowered to 60 seconds
- [ ] Team notified of maintenance window
- [ ] Rollback credentials accessible

## During Cutover
- [ ] Application in maintenance mode
- [ ] Final pg_dump from Neon
- [ ] pg_restore to Aurora
- [ ] Row counts verified
- [ ] Secrets updated to Aurora
- [ ] Amplify deployment triggered
- [ ] Health checks pass

## After Cutover
- [ ] Monitor CloudWatch for 30 minutes
- [ ] Extended verification (1 hour)
- [ ] OAuth flows tested
- [ ] 24-hour monitoring window

## Rollback Decision
- Immediate if: app won't start, DB unreachable, data corruption
- Within 30 min if: auth broken, high error rate
- Fix forward if: minor issues, performance slightly slower

See `docs/AWS_CUTOVER_CHECKLIST.md` and `docs/AWS_ROLLBACK_PLAN.md` for full details.
