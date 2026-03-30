# Workflow and Queue Design

## Scheduled jobs

### Daily jobs
- `daily-source-sync` at 06:00
- `daily-select-candidates` at 06:20
- `daily-generate-creatives` at 06:30
- `daily-build-approval-queue` at 07:00
- `daily-publish-approved` at 10:15
- `daily-metrics-sync` next morning at 06:30

### Intraday jobs
- `intraday-source-sync` every 2 hours
- `urgent-status-check` every 30 minutes for recently published items

## Event-driven jobs
- `on_property_created`
- `on_price_changed`
- `on_media_added`
- `on_status_changed`

## Retry rules
- ingest: 3 retries
- creative generation: 2 retries
- media render: 2 retries
- publish: 5 retries with backoff
- analytics sync: 5 retries

## Dead-letter handling
Store failed jobs with:
- payload
- reason
- stack trace summary
- human action recommendation

## Approval states
- pending
- approved
- approved_with_edits
- rejected
- regeneration_requested
- expired

## Publish states
- queued
- uploaded
- draft_created
- published
- paused
- failed
- withdrawn
