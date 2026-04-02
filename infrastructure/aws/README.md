# AWS Infrastructure

This directory contains AWS migration planning and infrastructure documentation for the real-estate marketing agent system.

## Directory Structure

```
infrastructure/aws/
  README.md               -- This file
  architecture.md         -- Target AWS architecture summary
  env-mapping.md          -- Environment variable mapping reference
  deployment-checklist.md -- Deployment steps checklist
  cutover-checklist.md    -- Production cutover checklist
```

## Related Documentation

Full migration documentation is in the `docs/` directory:

- `docs/AWS_MIGRATION_ASSESSMENT.md` -- Current state analysis and risk assessment
- `docs/AWS_TARGET_ARCHITECTURE.md` -- Target AWS architecture design
- `docs/AWS_CODE_CHANGES_PLAN.md` -- Code changes required for migration
- `docs/AWS_DB_MIGRATION_PLAN.md` -- Database migration strategy
- `docs/AWS_ENV_MAPPING.md` -- Complete environment variable mapping
- `docs/AWS_DEPLOYMENT_RUNBOOK.md` -- Step-by-step deployment guide
- `docs/AWS_CUTOVER_CHECKLIST.md` -- Production cutover checklist
- `docs/AWS_ROLLBACK_PLAN.md` -- Rollback procedures

## Current Status

- **Phase**: Planning and documentation complete
- **Next step**: Implement minimal code abstractions (DB driver, storage layer)
- **Migration target**: AWS Amplify + Aurora Serverless v2 + S3
