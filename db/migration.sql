DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin', 'manager', 'viewer'); EXCEPTION WHEN duplicate_object THEN null; END $$;
-- Add client_manager role
DO $$ BEGIN ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'client_manager'; EXCEPTION WHEN duplicate_object THEN null; END $$;
-- Add client_ids column for client-scoped access
ALTER TABLE users ADD COLUMN IF NOT EXISTS client_ids UUID[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'viewer',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  contact_person TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  google_drive_folder_id TEXT,
  google_drive_folder_url TEXT,
  drive_last_sync_at TIMESTAMPTZ,
  drive_file_count INTEGER DEFAULT 0,
  api_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE source_entities ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE campaign_candidates ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE creative_batches ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_source_entities_client ON source_entities(client_id);

CREATE INDEX IF NOT EXISTS idx_candidates_client ON campaign_candidates(client_id);

CREATE INDEX IF NOT EXISTS idx_batches_client ON creative_batches(client_id);

CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE clients ADD COLUMN IF NOT EXISTS meta_config JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS tiktok_config JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Google OAuth refresh token for persistent Drive access
ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_email TEXT;

-- Cached Drive media for creative generation
CREATE TABLE IF NOT EXISTS client_drive_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  media_type TEXT NOT NULL,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  size INTEGER,
  drive_created_at TIMESTAMPTZ,
  drive_modified_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_client_drive_media_client ON client_drive_media(client_id);
CREATE INDEX IF NOT EXISTS idx_client_drive_media_type ON client_drive_media(client_id, media_type);

-- Video ad presets: configurable rendering profiles for social media ads
CREATE TABLE IF NOT EXISTS video_ad_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  general_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  text_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  animation_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  audio_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  overlay_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_ad_presets_slug ON video_ad_presets(slug);
CREATE INDEX IF NOT EXISTS idx_video_ad_presets_active ON video_ad_presets(is_active, is_default);

-- Sound asset library for video ad background music
CREATE TABLE IF NOT EXISTS sound_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  filename TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'audio/mpeg',
  file_size INTEGER NOT NULL DEFAULT 0,
  duration_seconds NUMERIC(10,2),
  checksum TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'music',
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sound_assets_checksum ON sound_assets(checksum);
CREATE INDEX IF NOT EXISTS idx_sound_assets_category ON sound_assets(category);
