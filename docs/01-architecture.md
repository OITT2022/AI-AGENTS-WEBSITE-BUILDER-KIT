# Full Architecture

## 1. Business objective
Build a daily automation system that turns updates from an existing real-estate listings website into ready-to-publish ads for:
- Facebook
- Instagram
- TikTok

The system must support:
- projects and individual properties
- images and video
- Hebrew and English
- approval-first publishing
- measurable learning from campaign performance

---

## 2. Architecture principles

1. **Existing site is source of truth**
2. **API first, no scraping**
3. **Approval first, full automation later**
4. **Every generation step is versioned**
5. **Publishing is auditable**
6. **Creative selection improves from performance feedback**
7. **All jobs are idempotent and retry-safe**

---

## 3. High-level component map

```txt
Existing Real Estate Website
        |
        | Export API
        v
Source Client / Ingest Worker
        |
        v
Normalization + Validation
        |
        v
Snapshot Store + Change Detection
        |
        v
Scoring & Selection Engine
        |
        +---------------------+
        |                     |
        v                     v
Creative Text Agent     Media Agent
        |                     |
        +----------+----------+
                   v
            QA / Compliance Agent
                   |
                   v
             Approval Workflow
                   |
           +-------+--------+
           |                |
           v                v
      Meta Publisher    TikTok Publisher
           |
           v
     Performance Collector
           |
           v
      Learning / Optimization
```

---

## 4. Services

### A. Source Export API Client
Responsibilities:
- pull active projects and properties
- pull incremental changes since last checkpoint
- pull associated media and marketing flags
- validate payloads using schemas
- store source payload for traceability

### B. Ingest Worker
Responsibilities:
- schedule daily and intraday sync
- normalize fields into internal canonical structure
- create snapshots
- detect additions / removals / edits
- flag items that are campaign-eligible

### C. Change Detection Service
Responsibilities:
- compare latest snapshot vs previous snapshot
- detect field-level changes
- emit events such as:
  - `property_created`
  - `property_price_changed`
  - `property_media_added`
  - `property_status_changed`
  - `project_updated`

### D. Scoring Engine
Responsibilities:
- rank what to promote today
- score by freshness, media quality, urgency, price movement, audience fit, historical performance, and inventory age
- decide preferred campaign angle

### E. Creative Generation Layer
Responsibilities:
- generate platform-specific copy
- generate multiple angle variants
- generate audience variants
- assemble captions, hooks, headlines, CTA, overlays, and scripts

### F. Media Processing Layer
Responsibilities:
- pick hero media
- crop assets for 1:1, 4:5, 9:16
- create slideshow videos
- create text overlays
- create cover frames
- watermark or logo placement if required

### G. QA & Compliance Layer
Responsibilities:
- verify source facts against latest listing state
- reject inactive / sold / withdrawn properties
- reject low-quality or duplicate creatives
- apply policy checks for risky marketing claims
- ensure language quality and brand consistency

### H. Approval System
Responsibilities:
- provide marketer review screen
- show source facts next to generated output
- allow edit / approve / reject / request regeneration
- queue approved assets for publishing

### I. Publishing Connectors
Responsibilities:
- convert approved assets into platform-specific creative payloads
- upload media
- create unpublished posts or ad drafts
- optionally publish according to rules
- record external IDs and status

### J. Performance Feedback Loop
Responsibilities:
- fetch spend / impressions / CTR / video watch metrics / leads
- attach performance back to creative variants
- improve future scoring and angle selection

---

## 5. Core data domains

### Source domain
- projects
- properties
- media assets
- marketing flags
- source change events

### Internal domain
- normalized listings
- listing snapshots
- change events
- campaign candidates
- creative variants
- media derivatives
- QA results
- approvals
- publish actions
- performance metrics

---

## 6. Recommended runtime architecture

### Admin web
- Next.js app
- listing review pages
- campaign review page
- approval queue
- analytics dashboard

### Orchestrator API
- Node.js / TypeScript
- job trigger endpoints
- admin actions
- webhook receivers

### Background workers
- BullMQ workers over Redis
- separate queues for:
  - ingest
  - scoring
  - creative
  - media
  - QA
  - publishing
  - analytics sync

### Database
- PostgreSQL
- append-only event/history tables for traceability

### Storage
- original source media references
- downloaded source cache when needed
- generated derivatives
- video outputs
- rendered overlays

---

## 7. Queue design

Queues:
- `ingest-sync`
- `change-detect`
- `daily-selection`
- `creative-generate`
- `media-render`
- `qa-review`
- `approval-notify`
- `publish-meta`
- `publish-tiktok`
- `analytics-sync`

Every job should have:
- idempotency key
- correlation ID
- listing/project ID
- generation version
- retry policy
- dead-letter behavior

---

## 8. Security and safety

- API keys stored in secret manager
- signed callbacks/webhooks if site pushes events
- role-based admin access
- audit log on approve/edit/publish
- PII separation for lead data if added later
- content restrictions around investment claims and legal/financial promises

---

## 9. Deployment recommendation

### Initial deployment
- single PostgreSQL
- single Redis
- one API service
- 2–4 worker processes
- object storage bucket

### Scale-up path
- split media rendering worker
- split analytics sync worker
- CDN for generated media
- feature flags for auto-publish rules

---

## 10. Why this fits your existing real-estate site

Because your site already contains:
- listings
- projects
- property details
- media
- landing pages

The missing layer is not another website. The missing layer is:
1. export API
2. orchestration
3. creative automation
4. approval workflow
5. publisher connectors
6. performance learning
