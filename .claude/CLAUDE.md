# Claude Code Project Instructions

You are working on a real-estate marketing automation system.

## Product goal
Every day, ingest updated projects and properties from the existing real-estate website, choose the best items to market, generate platform-specific creatives for Facebook / Instagram / TikTok, run QA, and submit for approval or publish according to rules.

## Hard constraints
- The existing website export API is the source of truth.
- Never infer price, size, room count, status, availability, or location if the source API does not provide it.
- No creative may claim guaranteed yield, guaranteed appreciation, legal certainty, or financial outcomes.
- Approval-first workflow is mandatory unless an explicit `auto_publish_rule` allows publication.
- Keep multilingual support: Hebrew first, then English.
- Design code for retry-safe, idempotent jobs.

## Engineering standards
- TypeScript strict mode.
- Zod validation on all inbound API data.
- Every background job must emit structured logs and job events.
- Every generated creative must be versioned.
- Every publish action must be auditable.
- Prefer pure functions for scoring, selection, and recommendation logic.

## Core modules
1. source ingest
2. change detection
3. scoring engine
4. prompt/creative generation
5. media processing
6. QA/compliance
7. approval workflow
8. publishing connectors
9. analytics feedback loop

## Output priorities
1. correctness of listing data
2. operational safety
3. good marketer UX
4. performance and scale
5. deeper automation

## When implementing
- Start from DB schema and domain models.
- Then implement source API client.
- Then implement ingest and change detection.
- Then implement scoring.
- Only then implement creative generation.
- Only after that implement publisher integrations.

## Default ad output types
- Facebook lead-style static image ad
- Instagram reel caption + cover + carousel draft
- TikTok short script + on-screen text + CTA draft
- Story format 9:16 image/video draft

## Project files to trust
- `docs/01-architecture.md`
- `docs/04-api-spec.md`
- `db/schema.sql`
- `automation/workflows.md`
