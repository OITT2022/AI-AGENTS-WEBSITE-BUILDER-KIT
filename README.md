# Real Estate Daily Marketing Agent System

Production-ready planning pack for building a **daily real-estate marketing agent** around an **existing listings website** that exposes a marketing API.

This pack is designed for **VS Code + Claude Code** workflows and focuses on:
- existing real-estate site as source of truth
- Cyprus / international property marketing
- daily content generation for Facebook, Instagram, and TikTok
- photos + video automation
- approval-first workflow, then full automation
- learn-from-performance feedback loop

## What is inside

- `docs/01-architecture.md` — full system architecture
- `docs/02-workplan.md` — phased implementation plan
- `docs/03-daily-automation-flow.md` — end-to-end daily runbook
- `docs/04-api-spec.md` — export API specification for the existing site
- `docs/05-kpis-and-optimization.md` — metrics and learning loop
- `agents/` — agent definitions and responsibilities
- `prompts/` — reusable prompts for Claude Code / model orchestration
- `db/schema.sql` — PostgreSQL schema
- `db/data-model.md` — explanation of DB tables and relationships
- `api/openapi.yaml` — initial OpenAPI contract
- `automation/workflows.md` — scheduler, queues, retries, approvals
- `.claude/CLAUDE.md` — project guidance for Claude Code
- `.env.example` — environment variable template

## Recommended stack

- Frontend admin: Next.js
- Internal API / orchestrator: Node.js + TypeScript
- Queue: Redis + BullMQ
- Database: PostgreSQL
- Object storage: S3 or Cloudflare R2
- AI provider layer: Anthropic API or your preferred LLM abstraction
- Video/image processing: FFmpeg + template renderer + optional AI media tools
- Ad integrations: Meta Marketing API, TikTok Business / Marketing API

## Recommended rollout

### Phase 1 — approval-first MVP
- read daily changes from your site API
- score projects / properties
- generate ad drafts
- generate cropped media and simple slideshow videos
- send to admin dashboard for approval

### Phase 2 — assisted publishing
- push drafts to Meta and TikTok as unpublished creatives
- store creative history and performance
- A/B variants by angle and audience

### Phase 3 — adaptive automation
- auto-select best angle per property type
- auto-prioritize media types by performance
- optional auto-publish rules for trusted content classes

## Suggested monorepo structure when you begin coding

```txt
/apps
  /admin-web
  /orchestrator-api
/workers
  /ingest-worker
  /creative-worker
  /media-worker
  /publisher-worker
/packages
  /shared-types
  /prompt-library
  /platform-clients
  /scoring-engine
/infrastructure
  docker-compose.yml
  terraform/
```

## How to use this pack in VS Code with Claude Code

1. Open the folder in VS Code.
2. Install Claude Code for terminal/VS Code according to Anthropic documentation. Claude Code is available as a terminal-first coding tool with IDE integrations, and Anthropic documents VS Code integration plus `CLAUDE.md` project guidance files. citeturn532493search0turn532493search10turn532493search2
3. Keep `.claude/CLAUDE.md` at the project root so Claude Code can use your project rules and context. Anthropic explicitly documents using `CLAUDE.md` files to customize Claude Code behavior for a codebase. citeturn532493search2turn532493search0
4. Start by asking Claude Code to implement the database and API contract first.
5. Then implement the ingest + scoring pipeline.
6. Only after that, add creative generation and publishing connectors.

## First Claude Code tasks to run

- "Read `docs/01-architecture.md` and create the initial TypeScript monorepo skeleton."
- "Implement the PostgreSQL schema from `db/schema.sql` using Prisma models."
- "Implement the export API client from `api/openapi.yaml`."
- "Create a BullMQ pipeline for ingest -> scoring -> creative -> qa -> approval."
- "Create an admin page to review daily campaigns and approve publishing."

## Notes

- Keep your existing website as the **source of truth**.
- Do **not** scrape your own site if you can expose structured export endpoints.
- Begin with **manual approval** for all ads.
- Add TikTok / Meta publishing only after 2–4 weeks of successful draft generation.
