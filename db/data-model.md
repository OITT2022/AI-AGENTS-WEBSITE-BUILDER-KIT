# Data Model Notes

## Core idea
Keep the source website as truth, but store internal normalized copies, snapshots, change events, creative versions, and publishing history.

## Main entities
- `source_sync_runs`
- `source_entities`
- `entity_snapshots`
- `entity_change_events`
- `campaign_candidates`
- `creative_batches`
- `creative_variants`
- `media_assets`
- `media_derivatives`
- `qa_reviews`
- `approval_tasks`
- `publish_actions`
- `performance_metrics`

## Important relationships
- one source entity has many snapshots
- one snapshot may generate many change events
- one entity may appear in many campaign candidates over time
- one creative batch may contain many creative variants
- one variant may map to many publish actions across platforms
