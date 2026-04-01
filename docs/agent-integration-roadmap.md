# Agent Integration Roadmap

Seven phases that layer the smart marketing agent onto the existing system.
Each phase is self-contained: it produces a testable outcome and does not
require later phases to deliver value.

---

## Phase 1 — Data Integration

**Goal:** Make ingest production-grade with full audit trail, correlation
tracking, and checkpoint-based incremental sync.

### What exists (reuse)
| Component | File | Notes |
|-----------|------|-------|
| FindUS API client | `src/services/findus-client.ts` | Paginated fetch, bearer auth, property + project endpoints |
| Zod schema validation | `src/models/schemas.ts` | `PropertyPayloadSchema`, `ProjectPayloadSchema` — fail-closed on bad data |
| Normalize + snapshot | `src/services/ingest.ts` | `normalizeProperty`, `normalizeProject`, checksum, version_no |
| Change detection | `src/services/ingest.ts:166-179` | Detects `price_changed`, `status_changed`, `created`, `updated` |
| Raw source archive | `src/services/ingest.ts:145-148` | `source_payload` saved in `entity_snapshots` |
| Google Drive media cache | `src/services/google-drive.ts` | `syncAndCacheDriveMedia` — list, cache, dedup |
| Media merge | `src/services/media-merge.ts` | `mergeMedia(apiPayload, driveRows)` — API + Drive dedup, hero pick |
| Store CRUD | `src/db/store.ts` | `upsertEntity`, `addSnapshot`, `addChangeEvent`, `upsertDriveMedia` |

### What to wrap
| Task | Detail |
|------|--------|
| Checkpoint run tracking | `source_sync_runs` table exists in `db/schema.sql` but is never written to. Wrap `syncFromFindUs` to create a run row at start (`checkpoint_from = last_sync_at`), update it at end (`checkpoint_to`, `status`, `stats_json`). This enables incremental `/changes?since=` calls per `docs/04-api-spec.md`. |
| Correlation ID | Generate a `run_id` at the start of each pipeline invocation. Pass it through ingest, scoring, creative, QA, and publish so every record in a daily run is traceable end-to-end. Add `correlation_id?: string` to `PipelineResult` and to `CreativeBatch`. |

### What to change
| Task | Detail |
|------|--------|
| Structured logging | Replace bare `console.error` / `console.log` with a thin logger (`src/lib/logger.ts`) that emits JSON with `{ run_id, entity_id, source_entity_id, step, level, message, ts }`. Agent spec 01 requires "log every source record ID and updated timestamp." |
| Incremental sync | `syncFromFindUs` always fetches all properties. Add a `since` parameter that passes `updated_since` to the FindUS API, using the last `checkpoint_to` from `source_sync_runs`. Fall back to full sync when no checkpoint exists. |

### Acceptance test
- Run `POST /api/clients/:id/sync`.
- Verify a `source_sync_runs` row is created with `checkpoint_from`, `checkpoint_to`, `stats_json`.
- Verify every `entity_snapshot` and `entity_change_event` created in this run shares the same `correlation_id` (via batch).
- Run again with no source changes — verify no new snapshots (checksum idempotency already works).

---

## Phase 2 — AI Text Generation

**Goal:** Replace template-based copy with LLM-generated, platform-native
ad text while keeping the existing orchestration, DB schema, and media plan
assembly untouched.

### What exists (reuse)
| Component | File | Notes |
|-----------|------|-------|
| Batch + variant orchestration | `src/services/creative.ts:181-258` | `generateCreativesForCandidate` — creates batch, loops platforms x languages, writes DB |
| Media plan assembly | `src/services/creative.ts:212-236` | Hero/gallery/video selection, aspect ratios, reel timeline, video_ad structure |
| Reel timeline generator | `src/services/creative.ts:92-177` | 5-scene 15s storyboard — structural, not copy-dependent |
| Platform image selection | `src/services/creative.ts:6-9` | FB:3, IG:10, TikTok:1 |
| Copy JSON output shapes | `src/services/creative.ts:13-80` | Return shapes already match prompt specs |
| Prompt templates | `prompts/facebook-copy-prompt.md`, `prompts/instagram-copy-prompt.md`, `prompts/tiktok-script-prompt.md` | Platform-specific instructions and expected JSON schema |
| DB writes | `src/db/store.ts` | `addBatch`, `addVariant` — unchanged |

### What to build
| Task | Detail |
|------|--------|
| LLM service | New `src/services/llm.ts`. Single function `callLLM(systemPrompt, userMessage, zodSchema): Promise<T>`. Wraps Anthropic or OpenAI SDK. Validates response with Zod before returning. Includes retry (2x) and timeout. |
| Platform prompt builders | New `src/services/prompt-builder.ts`. Three functions: `buildFacebookPrompt(facts, angle, audience, lang)`, `buildInstagramPrompt(...)`, `buildTikTokPrompt(...)`. Each reads the corresponding `prompts/*.md` file as system prompt and assembles the user message from normalized payload fields. |

### What to change
| Task | Detail |
|------|--------|
| Replace `genFacebookCopy` body | Keep signature `(p, angle, lang, hasVideo) => Record<string, unknown>`. Replace string-template internals with `await callLLM(facebookSystemPrompt, userMsg, FacebookCopySchema)`. Add `compliance_notes` to return shape per `prompts/facebook-copy-prompt.md`. |
| Replace `genInstagramCopy` body | Same pattern. LLM call, Zod-validated JSON output. |
| Replace `genTikTokCopy` body | Same pattern. |
| Multi-variant loop | Prompts ask for **3 variants** per platform. Current code generates 1. Change the platform loop in `generateCreativesForCandidate` to produce `variant_no` 1-3 per platform x language (18 variants per candidate instead of 6). |
| Make `genCopy` async | Currently synchronous. All callers in `generateCreativesForCandidate` already use `await` for DB writes — just need to `await` the copy generation too. |
| Zod output schemas | Add `FacebookCopySchema`, `InstagramCopySchema`, `TikTokCopySchema` to `src/models/schemas.ts`. These validate the JSON returned by the LLM before it is stored in `copy_json`. |

### What to keep untouched
- `mergeMedia`, `selectImagesForPlatform`, `genReelTimeline` — no change.
- `media_plan_json` assembly — no change.
- `generation_metadata` structure — no change.
- `store.addBatch`, `store.addVariant` — no change.

### Acceptance test
- Run `POST /api/creatives/generate` for a candidate.
- Verify each variant's `copy_json` passes the corresponding Zod output schema.
- Verify 18 variants created (3 platforms x 2 languages x 3 variants).
- Verify `generation_metadata` includes `model`, `prompt_version`, `tokens_used`.
- Verify no copy contains risky language patterns from `qa.ts:5-6` (LLM system prompt must forbid them).
- Fallback: if LLM call fails after retries, fall back to existing template generation and flag `generation_metadata.fallback = true`.

---

## Phase 3 — Image Processing

**Goal:** Generate platform-ready image derivatives (cropped, overlaid,
branded) from source URLs and store them with lineage tracking.

### What exists (reuse)
| Component | File | Notes |
|-----------|------|-------|
| Merged media URLs | `src/services/media-merge.ts` | `MergedMedia` with hero, gallery, videos, source_breakdown |
| Platform aspect ratios | `src/services/creative.ts:218` | `aspect_ratios` per platform already in `media_plan_json` |
| `media_assets` table | `db/schema.sql` | `id, entity_id, source_url, media_type, role, width, height, quality_score` — never written to |
| `media_derivatives` table | `db/schema.sql` | `id, media_asset_id, derivative_type, platform, storage_url, width, height` — never written to |
| Overlay text | `src/services/creative.ts` | `copy_json.overlay_text` and `copy_json.cover_text` already generated per variant |

### What to build
| Task | Detail |
|------|--------|
| Image processor | New `src/services/image-processor.ts`. Uses Sharp (add `sharp` to dependencies). Functions: `downloadImage(url): Buffer`, `cropToAspect(buffer, ratio): Buffer`, `addTextOverlay(buffer, text, position, style): Buffer`, `addLogoBadge(buffer, logoPath, position): Buffer`. All pure buffer-in/buffer-out. |
| Storage adapter | New `src/services/storage.ts`. Interface `upload(buffer, key, mime): Promise<string>` returning public URL. Initial implementation: local `public/generated/` folder served by Express static. Later swap to S3/GCS. |
| Derivative pipeline | New `src/services/media-pipeline.ts`. For each creative variant: (1) download hero + gallery images, (2) crop each to platform aspect ratios, (3) apply overlay text from `copy_json`, (4) upload derivatives, (5) write `media_assets` + `media_derivatives` rows. |
| Quality scorer | Basic image quality check: resolution >= 600px, aspect ratio tolerance, file size sanity. Write `quality_score` to `media_assets`. |

### What to change
| Task | Detail |
|------|--------|
| `media_plan_json` enhancement | After derivative pipeline runs, update `media_plan_json.derivative_urls` with the actual generated image URLs (keyed by `{platform}_{ratio}`). Currently only has source URLs. |
| `generateCreativesForCandidate` | Call derivative pipeline after variant creation. Sequential: copy first, then media (media needs `overlay_text` from copy). |
| Package.json | Add `sharp` dependency. |

### What to keep untouched
- `mergeMedia` — still responsible for source URL selection.
- `selectImagesForPlatform` — still picks which source images to process.
- All copy generation from Phase 2.

### Acceptance test
- Generate creatives for a candidate with 3+ gallery images.
- Verify `media_derivatives` rows exist for each platform's required ratios (FB: 1:1 + 4:5, IG: 1:1 + 4:5 + 9:16, TikTok: 9:16).
- Verify each derivative has a valid `storage_url` that serves an image.
- Verify overlay text appears on the image (visual spot-check or OCR test).
- Verify `media_assets.quality_score` is populated.
- Verify `media_derivatives.media_asset_id` traces back to the correct `media_assets` row.

---

## Phase 4 — Video Generation

**Goal:** Turn the existing reel timeline spec into rendered short-form
video (9:16, 15s) suitable for Instagram Reels and TikTok.

### What exists (reuse)
| Component | File | Notes |
|-----------|------|-------|
| Reel timeline structure | `src/services/creative.ts:92-177` | `genReelTimeline` — 5 scenes, each with type, duration, source, overlay_text, transition |
| Video URLs from merge | `src/services/media-merge.ts` | `merged.videos` array |
| Drive video cache | `src/services/google-drive.ts` | Videos synced to `client_drive_media` with `media_type = 'video'` |
| `media_plan_json.reel_timeline` | `src/services/creative.ts:223` | Already written for video-capable variants |
| `media_plan_json.video_ad` | `src/services/creative.ts:228-234` | FB in-feed video spec with primary_video, thumbnail, max_duration |
| Storage adapter | `src/services/storage.ts` (from Phase 3) | Upload + URL return |

### What to build
| Task | Detail |
|------|--------|
| Video compositor | New `src/services/video-compositor.ts`. Uses FFmpeg via `fluent-ffmpeg` (add to dependencies). Functions: `downloadAsset(url): string` (to temp file), `compositeReel(timeline, outputPath): Promise<string>` — reads `reel_timeline.scenes`, concatenates clips/images with Ken Burns effects, applies overlay text per scene, applies transitions (`fade_in`, `slide_left`, etc.), adds background music track. Output: 9:16 MP4, H.264, 15s. |
| Cover frame extractor | `extractCoverFrame(videoPath, timeSec): Buffer` — single frame for thumbnail. |
| Slideshow builder | `buildSlideshow(images[], duration, music?): Promise<string>` — for entities with images but no source video. 3s per image with zoom/pan. |

### What to change
| Task | Detail |
|------|--------|
| `media_plan_json` update | After video render, add `rendered_video_url` and `rendered_thumbnail_url` to the variant's `media_plan_json`. |
| `generateCreativesForCandidate` | After Phase 3 image pipeline, run video pipeline for variants where `reel_timeline` exists. |
| Package.json | Add `fluent-ffmpeg`. Require FFmpeg binary available at runtime (document in README). |

### Acceptance test
- Generate creatives for a candidate with at least one video source.
- Verify a 9:16 MP4 is rendered and accessible at `rendered_video_url`.
- Verify duration is within 13-16s.
- Verify overlay text is visible in at least 3 scenes (frame extraction spot-check).
- Verify cover frame thumbnail is generated.
- For image-only entities, verify slideshow fallback is produced.

---

## Phase 5 — Canva Integration

**Goal:** Enable Canva as an alternative creative channel — push property
data and images into Canva templates, pull back finished designs for
approval and publishing.

### What exists (reuse)
| Component | File | Notes |
|-----------|------|-------|
| `creative_variants` table | `db/schema.sql` | `copy_json` + `media_plan_json` hold all data Canva templates need |
| Normalized property payload | `src/services/ingest.ts` | Structured facts (title, price, city, rooms, features) ready for template data |
| Image derivatives | `src/services/storage.ts` (Phase 3) | Cropped images available as public URLs |
| Approval workflow | `src/services/qa.ts` + `src/db/store.ts` | `approval_tasks` with status machine — Canva outputs enter the same flow |

### What to build
| Task | Detail |
|------|--------|
| Canva Connect adapter | New `src/services/canva.ts`. Uses Canva Connect API. Functions: `createDesignFromTemplate(templateId, data): Promise<{ design_id, edit_url }>`, `exportDesign(designId, format): Promise<{ url }>`, `listTemplates(brandId): Promise<Template[]>`. Auth: OAuth2 with Canva, store tokens per client in `clients.canva_config`. |
| Template registry | New table or `app_config` entry mapping `{ platform, entity_type, language } → canva_template_id`. Admin UI to select templates per client. |
| Data mapper | New `src/services/canva-data-mapper.ts`. Maps `normalized_payload` + `copy_json` fields to Canva template placeholders. Property title → `{{title}}`, price → `{{price}}`, hero image URL → `{{hero_image}}`, etc. Each template declares its placeholder schema. |
| Export poller | Canva export is async. Poller checks design export status and, on completion, downloads the rendered image/PDF, uploads via `storage.ts`, and creates a `media_derivatives` row with `derivative_type = 'canva_export'`. |

### What to change
| Task | Detail |
|------|--------|
| `creative_variants.generation_metadata` | Add `canva_design_id`, `canva_template_id`, `canva_edit_url` when a Canva variant is created. Enables the marketer to click through to Canva for manual editing before approval. |
| Approval UI | Add a "Edit in Canva" button on the approval card when `canva_edit_url` is present. |
| `Client` schema | Add optional `canva_config?: { access_token, refresh_token, brand_id, connected_at }` to `Client` interface and `clients` table. |
| Publishing flow | Canva-exported images replace `media_plan_json.derivative_urls` for the variant. Publishing functions (`publishToFacebook`, `publishToInstagram`) already read from `media_plan_json` — they will pick up the Canva URLs without code changes. |

### Modes of operation
1. **Full auto** — Agent generates copy, pushes data to Canva template, exports render, enters QA/approval.
2. **Designer-in-the-loop** — Agent creates Canva design from template, marketer opens `canva_edit_url`, customizes, signals done, agent exports and proceeds.
3. **Template-only** — Agent only maps data to template; no LLM copy. Useful for brand-locked clients.

### Acceptance test
- Configure a Canva template for Facebook 1:1 with placeholders `{{title}}`, `{{price}}`, `{{hero_image}}`.
- Run creative generation for a candidate.
- Verify a Canva design is created with correct property data filled in.
- Export the design — verify a rendered image URL is stored in `media_derivatives`.
- Approve the variant — verify publish uses the Canva-rendered image.

---

## Phase 6 — Triggers & Scheduling

**Goal:** Move from manual button presses to automated cron jobs,
event-driven reactions, and queue-based retry — matching the schedule in
`automation/workflows.md` and `docs/03-daily-automation-flow.md`.

### What exists (reuse)
| Component | File | Notes |
|-----------|------|-------|
| Pipeline orchestrator | `src/services/pipeline.ts` | `runDailyPipeline(date, clientId)` — already chains sync → score → generate → QA |
| Sync function | `src/services/findus-client.ts` | `syncFromFindUs(runPipeline, clientId)` |
| Trigger endpoints | `src/server.ts` | `POST /api/clients/:id/sync`, `POST /api/pipeline/run`, `POST /api/findus/sync` |
| Change events | `src/db/store.ts` | `addChangeEvent` writes `change_type` — events exist but nothing subscribes |
| Scheduled job spec | `automation/workflows.md` | Full cron schedule + retry rules + dead-letter spec |
| Daily flow spec | `docs/03-daily-automation-flow.md` | Minute-by-minute schedule + emergency automation |

### What to build
| Task | Detail |
|------|--------|
| Job scheduler | Add `node-cron` (or BullMQ scheduled jobs if Redis is available). New `src/jobs/scheduler.ts` that registers the daily schedule from `automation/workflows.md`: |
| | `06:00` — `daily-source-sync` → calls `syncFromFindUs(false)` per active client |
| | `06:20` — `daily-select-candidates` → calls `scoreAndSelectCandidates` |
| | `06:30` — `daily-generate-creatives` → calls `generateCreativesForCandidate` for selected |
| | `07:00` — `daily-build-approval-queue` → calls `runQAAndCreateApprovals` |
| | `10:15` — `daily-publish-approved` → queries approved tasks, calls publish functions |
| | `06:30+1d` — `daily-metrics-sync` → calls metrics fetcher (Phase 7 dependency) |
| | `*/2h` — `intraday-source-sync` → incremental sync with `since` parameter (Phase 1) |
| | `*/30m` — `urgent-status-check` → check recently published entities for status changes |
| Event dispatcher | New `src/services/event-bus.ts`. Simple in-process event emitter. `ingestEntity` emits `property_created`, `price_changed`, `status_changed`, `media_added`. Listeners: (1) `price_changed` → invalidate old creatives, queue regeneration. (2) `status_changed` to inactive → pause active publish_actions, notify operator. Per `docs/03-daily-automation-flow.md` emergency automation. |
| Job runner with retry | New `src/jobs/runner.ts`. Wraps each job step with retry logic per `automation/workflows.md`: ingest 3x, creative 2x, media 2x, publish 5x with exponential backoff. On exhaustion, write to `dead_letter_jobs` table (new) with payload, error, stack trace summary, recommended human action. |
| Admin job dashboard | New route `GET /api/jobs/status` returning recent runs, failures, dead-letter items. Surface in admin UI. |

### What to change
| Task | Detail |
|------|--------|
| Publishing: idempotency | Before publishing, check `publish_actions` for existing `creative_variant_id + platform` with `status = 'published'`. Skip if already published. Required before automated publishing is safe. |
| Publishing: draft mode | Add `mode` parameter to `publishToFacebook` / `publishToInstagram`. When `mode = 'draft'`, use Meta's `published=false` parameter. Scheduled job at 10:15 publishes drafts, not live posts, unless `auto_publish_rule` allows live. |
| Publishing: auto-pause | On `status_changed` to inactive, find `publish_actions` with `status = 'published'` for that entity. Call Meta API to pause/delete the post. Update `publish_actions.status = 'withdrawn'`. |
| `server.ts` startup | Register cron scheduler on server boot. Add env flag `ENABLE_SCHEDULER=true` to control (off by default in dev, on in production). |

### Acceptance test
- Set `ENABLE_SCHEDULER=true`, start server.
- Verify cron jobs registered for all 8 scheduled times.
- Manually trigger `daily-source-sync` job — verify it creates a `source_sync_runs` row.
- Simulate a `price_changed` event — verify old creatives are invalidated and regeneration is queued.
- Simulate a publish failure — verify retry fires up to 5x, then a dead-letter row is created.
- Publish a variant, then call publish again — verify idempotency (no duplicate post).

---

## Phase 7 — QA & Compliance Hardening

**Goal:** Expand QA from basic regex checks to full factual verification,
LLM-based language review, metrics-fed learning, and automated feedback
into scoring.

### What exists (reuse)
| Component | File | Notes |
|-----------|------|-------|
| Active-status check | `src/services/qa.ts:10-13` | `checkFacts` verifies `status === 'active'` |
| Risky language regex (EN + HE) | `src/services/qa.ts:5-6` | 8 EN + 5 HE forbidden patterns |
| Pass/warn/fail flow | `src/services/qa.ts:39` | `ReviewStatus` enum, stored in `qa_reviews` |
| Batch QA + approval creation | `src/services/qa.ts:58-68` | `runQAAndCreateApprovals(batchId)` |
| QA prompt | `prompts/qa-prompt.md` | LLM instructions for deep review |
| `performance_metrics` table | `db/schema.sql` | Full schema for impressions, clicks, spend, CTR, leads, video views |
| `addMetric` / `getMetrics` | `src/db/store.ts:312-329` | CRUD ready |
| KPI spec | `docs/05-kpis-and-optimization.md` | Primary + secondary KPIs, learning dimensions, first optimization rules |

### What to change (factual checks)
| Task | Detail |
|------|--------|
| Price-match check | In `checkFacts`: extract price text from `copy_json`, compare against `normalized_payload.price_text` / `price_amount`. Flag mismatch as `error`. |
| City/area-match check | In `checkFacts`: verify city/area mentioned in copy matches `normalized_payload.city` / `normalized_payload.area`. Flag mismatch as `error`. |
| Overuse check | New `checkOveruse(entityId)`: query `publish_actions` for this entity in the last 7 days. If count exceeds threshold (configurable, default 3), flag as `warning`. Feeds into agent 02 suppression rules. |

### What to wrap (LLM QA pass)
| Task | Detail |
|------|--------|
| LLM review | After rule-based checks pass, run an LLM pass using `prompts/qa-prompt.md`. Input: source facts + generated copy. Output: `{ status, violations, warnings, suggested_fixes }`. Parse with Zod. If LLM finds issues that regex missed, downgrade status. |
| Suggested fixes | Add `suggested_fixes` array to `qa_reviews.review_json`. Surface in approval UI so marketer sees both the issue and the recommended fix. |
| Language quality | LLM checks for grammar, tone consistency, brand voice alignment. Hebrew-specific: check for mixed-direction text issues, proper punctuation. English-specific: check for awkward real-estate jargon. |

### What to build (metrics + learning)
| Task | Detail |
|------|--------|
| Meta Insights fetcher | New `src/services/metrics-fetcher.ts`. For each `publish_action` with `platform = 'facebook'` or `'instagram'` and `status = 'published'`: call `GET /{post_id}/insights?metric=impressions,reach,clicks,spend` (Meta Insights API). Map to `PerformanceMetric` row. Run daily at 06:30 per schedule. |
| TikTok analytics fetcher | Same pattern for TikTok: `GET /video/query` with `video_id`. Map `view_count`, `like_count`, `share_count` to `PerformanceMetric`. |
| History score (scoring.ts) | Replace hardcoded `50` in `scoreHistory`. New function: query `performance_metrics` for this entity's past campaigns. Compute score from avg CTR, lead conversion, video completion relative to portfolio benchmarks. |
| Audience score (scoring.ts) | Replace hardcoded `50` in `scoreAudience`. New function: for this entity's `target_audiences`, look up historical performance of that audience segment across all past campaigns. High-performing segments score higher. |
| Pattern analyzer | New `src/services/learning.ts`. Weekly batch job that aggregates `performance_metrics` × `creative_variants.generation_metadata` (angle, audience, platform, language, format). Outputs: (1) best angle × audience pairings per city/price band, (2) format win rates (carousel vs reel vs video), (3) suppression list for underperforming patterns. Store in `app_config` under `learning_priors`. Scoring engine reads these priors for `score_audience` and `score_history`. |
| Optimization rules | Implement first rules from `docs/05-kpis-and-optimization.md`: (1) TikTok poor completion → shorten script, (2) IG carousel beats reel → shift weight, (3) repeated assets lose CTR → lower reuse score. These modify `learning_priors` which scoring reads. |

### Acceptance test
- Generate a creative with wrong price in copy (simulate) — verify `checkFacts` catches it as `error`.
- Generate a creative with "guaranteed return" in Hebrew — verify regex catches it.
- Generate a creative with subtle misleading claim — verify LLM QA pass catches it and provides `suggested_fixes`.
- Publish an ad, wait, run metrics fetcher — verify `performance_metrics` row created with real data.
- After 10+ published campaigns, run pattern analyzer — verify `learning_priors` in `app_config` contains angle × audience performance data.
- Run scoring with priors populated — verify `score_history` and `score_audience` are no longer hardcoded 50.

---

## Phase Dependencies

```
Phase 1  Data Integration
  |
  v
Phase 2  AI Text ──────────────> Phase 5  Canva (needs copy_json)
  |
  v
Phase 3  Images ──────────────> Phase 5  Canva (needs storage adapter)
  |
  v
Phase 4  Video
  |
  v
Phase 6  Triggers (needs all content generation phases to automate)
  |
  v
Phase 7  QA & Learning (needs triggers for scheduled metrics + needs
         published data from Phase 6 to learn from)
```

Phases 2 + 3 can run in parallel after Phase 1.
Phase 5 (Canva) can start after Phase 2 + Phase 3.
Phase 4 depends on Phase 3 (shares storage adapter and image processor).
Phase 6 depends on Phases 1-4 being functional.
Phase 7 depends on Phase 6 (needs automated publishing to generate metrics).

---

## Files touched per phase

| Phase | New files | Modified files |
|-------|-----------|----------------|
| 1 | `src/lib/logger.ts` | `src/services/findus-client.ts`, `src/services/ingest.ts`, `src/services/pipeline.ts` |
| 2 | `src/services/llm.ts`, `src/services/prompt-builder.ts` | `src/services/creative.ts`, `src/models/schemas.ts`, `package.json` |
| 3 | `src/services/image-processor.ts`, `src/services/storage.ts`, `src/services/media-pipeline.ts` | `src/services/creative.ts`, `package.json` |
| 4 | `src/services/video-compositor.ts` | `src/services/creative.ts`, `package.json` |
| 5 | `src/services/canva.ts`, `src/services/canva-data-mapper.ts` | `src/models/schemas.ts`, `src/db/store.ts`, `db/schema.sql`, `public/campaign.html` |
| 6 | `src/jobs/scheduler.ts`, `src/jobs/runner.ts`, `src/services/event-bus.ts` | `src/server.ts`, `src/services/ingest.ts`, `src/services/social-publish.ts` |
| 7 | `src/services/metrics-fetcher.ts`, `src/services/learning.ts` | `src/services/qa.ts`, `src/services/scoring.ts`, `public/campaign.html` |
