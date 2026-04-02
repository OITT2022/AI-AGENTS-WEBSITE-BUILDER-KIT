# AWS Target Architecture (Quick Reference)

## Stack

| Layer | Service |
|-------|---------|
| Hosting | AWS Amplify Hosting (Node.js SSR) |
| Database | Amazon Aurora PostgreSQL Serverless v2 |
| Storage | Amazon S3 |
| CDN | Amazon CloudFront (Phase 2) |
| Secrets | AWS Secrets Manager |
| DNS | Amazon Route 53 (when ready) |
| Logs | Amazon CloudWatch |
| Scheduling | Amazon EventBridge (Phase 2) |

## Architecture Diagram

```
  Client Browser
       |
  Route 53 (DNS)
       |
  CloudFront (optional)
       |
  Amplify Hosting
  ┌─────────────────┐
  │  Express App     │
  │  (Node.js SSR)   │
  └──┬───┬───┬──────┘
     │   │   │
     │   │   └── S3 (uploads, media)
     │   │
     │   └── Secrets Manager
     │
     └── Aurora PostgreSQL
         (Serverless v2)
```

## Key Decisions

1. **Not Next.js** -- This is a plain Express app. Amplify supports this as a Node.js SSR app.
2. **No Prisma** -- Raw SQL via `pg` driver. No ORM migration needed.
3. **Aurora Serverless v2** -- Scales automatically, PostgreSQL-compatible, cost-efficient.
4. **IAM roles over access keys** -- Use Amplify's IAM role for S3 access, not explicit credentials.

See `docs/AWS_TARGET_ARCHITECTURE.md` for full details.
