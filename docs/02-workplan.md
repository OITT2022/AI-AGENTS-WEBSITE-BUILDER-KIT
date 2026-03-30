# Ordered Work Plan

## Phase 0 — Discovery and alignment
Duration: 3–5 days

Deliverables:
- exact list of source fields from current website
- decision on canonical property and project model
- marketing policy and brand guardrails
- approval roles and workflow definition

Tasks:
- map current website DB/CMS fields
- identify media storage paths
- identify required locales
- decide which listings are campaign-eligible
- define audience segments
- define initial campaign angles

---

## Phase 1 — Source export API
Duration: 4–7 days

Deliverables:
- working export endpoints
- authentication for API access
- sample payloads
- incremental changes endpoint

Tasks:
- implement `/properties`
- implement `/projects`
- implement `/changes?since=`
- implement `/media/:entityId`
- add marketing flags to admin

Exit criteria:
- external service can fetch clean JSON for all active items
- changes endpoint returns only changed entities since checkpoint

---

## Phase 2 — Data foundation
Duration: 4–6 days

Deliverables:
- PostgreSQL schema
- source payload archival
- normalization pipeline
- snapshot and change detection

Tasks:
- create internal canonical tables
- store latest snapshot per entity
- create field-level change diffs
- create campaign candidate view

Exit criteria:
- system can identify what changed today

---

## Phase 3 — Scoring and selection
Duration: 4–6 days

Deliverables:
- scoring function
- daily selection batch
- campaign candidate ranking

Tasks:
- define weighted rules
- implement freshness/media/urgency/performance scores
- define max daily count per platform
- prevent over-promotion of same listing

Exit criteria:
- daily batch chooses sensible candidates automatically

---

## Phase 4 — Creative generation
Duration: 7–10 days

Deliverables:
- prompt library
- copy variants
- platform-specific templates

Tasks:
- Facebook image ad copy
- Instagram reel/carousel captions
- TikTok script and hook generation
- language QA pass
- audience and angle variations

Exit criteria:
- every selected item gets at least 2–3 usable creative variants

---

## Phase 5 — Media pipeline
Duration: 5–8 days

Deliverables:
- auto-crops
- hero media selection
- slideshow video renderer
- overlay templates

Tasks:
- crop for 1:1, 4:5, 9:16
- build ffmpeg slideshow flow
- generate subtitles/title cards
- produce cover image

Exit criteria:
- each approved candidate has platform-ready media sizes

---

## Phase 6 — QA and approval
Duration: 4–6 days

Deliverables:
- rule-based QA checks
- human review UI
- regenerate/reject flow

Tasks:
- compare creative facts to source API
- reject risky claims
- duplicate detection
- approval queue

Exit criteria:
- marketer can approve daily queue safely in minutes

---

## Phase 7 — Publishing integrations
Duration: 5–8 days

Deliverables:
- Meta connector
- TikTok connector
- status sync
- publish audit logs

Tasks:
- create draft creatives
- upload media
- store platform IDs
- error and retry handling

Exit criteria:
- approved assets can be pushed to platforms with full traceability

---

## Phase 8 — Analytics and optimization
Duration: 5–8 days

Deliverables:
- metrics collector
- dashboards
- angle/media performance learning

Tasks:
- sync platform metrics
- link metrics to variants
- update future ranking rules
- identify best hooks and formats by audience

Exit criteria:
- system recommends better formats over time

---

## Suggested MVP order inside Claude Code

1. DB schema
2. source API client
3. ingest worker
4. change detection
5. scoring engine
6. prompt library
7. media renderer
8. approval admin pages
9. publisher connectors
10. analytics sync
