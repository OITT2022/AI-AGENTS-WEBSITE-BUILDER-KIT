DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin', 'manager', 'viewer'); EXCEPTION WHEN duplicate_object THEN null; END $$;

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
