CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE entity_type AS ENUM ('property', 'project');
CREATE TYPE publish_platform AS ENUM ('facebook', 'instagram', 'tiktok');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'approved_with_edits', 'rejected', 'regeneration_requested', 'expired');
CREATE TYPE publish_status AS ENUM ('queued', 'uploaded', 'draft_created', 'published', 'paused', 'failed', 'withdrawn');
CREATE TYPE review_status AS ENUM ('pass', 'warn', 'fail');

CREATE TABLE source_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  checkpoint_from TIMESTAMPTZ,
  checkpoint_to TIMESTAMPTZ,
  status TEXT NOT NULL,
  stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_text TEXT
);

CREATE TABLE source_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type entity_type NOT NULL,
  source_entity_id TEXT NOT NULL,
  source_updated_at TIMESTAMPTZ,
  source_status TEXT,
  country TEXT,
  city TEXT,
  area TEXT,
  title_he TEXT,
  title_en TEXT,
  listing_url TEXT,
  campaign_ready BOOLEAN NOT NULL DEFAULT false,
  current_snapshot_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, source_entity_id)
);

CREATE TABLE entity_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES source_entities(id) ON DELETE CASCADE,
  sync_run_id UUID REFERENCES source_sync_runs(id) ON DELETE SET NULL,
  version_no INTEGER NOT NULL,
  normalized_payload JSONB NOT NULL,
  source_payload JSONB NOT NULL,
  checksum TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_id, version_no)
);

ALTER TABLE source_entities
ADD CONSTRAINT fk_current_snapshot
FOREIGN KEY (current_snapshot_id) REFERENCES entity_snapshots(id) ON DELETE SET NULL;

CREATE TABLE entity_change_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES source_entities(id) ON DELETE CASCADE,
  from_snapshot_id UUID REFERENCES entity_snapshots(id) ON DELETE SET NULL,
  to_snapshot_id UUID REFERENCES entity_snapshots(id) ON DELETE SET NULL,
  change_type TEXT NOT NULL,
  diff_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES source_entities(id) ON DELETE CASCADE,
  source_media_id TEXT,
  source_url TEXT NOT NULL,
  media_type TEXT NOT NULL,
  role TEXT,
  width INTEGER,
  height INTEGER,
  duration_seconds NUMERIC(10,2),
  quality_score NUMERIC(5,2),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_id, source_url)
);

CREATE TABLE media_derivatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  derivative_type TEXT NOT NULL,
  platform publish_platform,
  storage_url TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_seconds NUMERIC(10,2),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE campaign_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES source_entities(id) ON DELETE CASCADE,
  candidate_date DATE NOT NULL,
  score_total NUMERIC(8,2) NOT NULL,
  score_freshness NUMERIC(8,2) NOT NULL DEFAULT 0,
  score_media NUMERIC(8,2) NOT NULL DEFAULT 0,
  score_business NUMERIC(8,2) NOT NULL DEFAULT 0,
  score_urgency NUMERIC(8,2) NOT NULL DEFAULT 0,
  score_history NUMERIC(8,2) NOT NULL DEFAULT 0,
  recommended_angle TEXT,
  recommended_audiences JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_platforms JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected BOOLEAN NOT NULL DEFAULT false,
  selection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_id, candidate_date)
);

CREATE TABLE creative_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES source_entities(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES campaign_candidates(id) ON DELETE SET NULL,
  language_code TEXT NOT NULL,
  angle TEXT,
  audience TEXT,
  batch_status TEXT NOT NULL DEFAULT 'generated',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE creative_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES creative_batches(id) ON DELETE CASCADE,
  platform publish_platform NOT NULL,
  variant_no INTEGER NOT NULL,
  copy_json JSONB NOT NULL,
  media_plan_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  generation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, platform, variant_no)
);

CREATE TABLE qa_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_variant_id UUID NOT NULL REFERENCES creative_variants(id) ON DELETE CASCADE,
  status review_status NOT NULL,
  review_json JSONB NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE approval_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_variant_id UUID NOT NULL REFERENCES creative_variants(id) ON DELETE CASCADE,
  assigned_to TEXT,
  status approval_status NOT NULL DEFAULT 'pending',
  decision_notes TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE publish_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_variant_id UUID NOT NULL REFERENCES creative_variants(id) ON DELETE CASCADE,
  platform publish_platform NOT NULL,
  publish_mode TEXT NOT NULL,
  status publish_status NOT NULL DEFAULT 'queued',
  external_object_id TEXT,
  request_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publish_action_id UUID NOT NULL REFERENCES publish_actions(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  ctr NUMERIC(8,4),
  leads INTEGER NOT NULL DEFAULT 0,
  video_3s_views INTEGER NOT NULL DEFAULT 0,
  video_completions INTEGER NOT NULL DEFAULT 0,
  raw_metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (publish_action_id, metric_date)
);

CREATE INDEX idx_source_entities_type_status ON source_entities(entity_type, source_status);
CREATE INDEX idx_snapshots_entity_created_at ON entity_snapshots(entity_id, created_at DESC);
CREATE INDEX idx_change_events_entity_created_at ON entity_change_events(entity_id, created_at DESC);
CREATE INDEX idx_candidates_date_selected ON campaign_candidates(candidate_date, selected);
CREATE INDEX idx_publish_actions_status_platform ON publish_actions(status, platform);
CREATE INDEX idx_performance_metrics_date ON performance_metrics(metric_date);
