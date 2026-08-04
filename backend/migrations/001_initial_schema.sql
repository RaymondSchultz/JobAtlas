CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pgvector extension is not installed; job_embeddings.embedding will be created with REAL[] fallback';
END $$;

DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('active', 'expired', 'flagged', 'removed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE employment_type AS ENUM ('full_time', 'part_time', 'contract', 'internship', 'temporary', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE source_type AS ENUM ('ats_api', 'government_feed', 'company_website');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  iso_code CHAR(2) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id UUID NOT NULL REFERENCES countries(id),
  name TEXT NOT NULL,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  CONSTRAINT uq_city_per_country UNIQUE (country_id, name)
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  parent_id UUID REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type source_type NOT NULL,
  base_url TEXT,
  sync_interval_minutes INTEGER NOT NULL DEFAULT 60,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  website TEXT,
  logo_url TEXT,
  description TEXT,
  industry TEXT,
  size_range TEXT,
  hq_country_id UUID REFERENCES countries(id),
  hq_city_id UUID REFERENCES cities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  external_ref TEXT NOT NULL,
  endpoint_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_source_config_ref UNIQUE (source_id, external_ref)
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT NOT NULL UNIQUE,
  password_hash TEXT,
  role user_role NOT NULL DEFAULT 'user',
  full_name TEXT,
  oauth_provider TEXT,
  oauth_subject TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_oauth_identity UNIQUE (oauth_provider, oauth_subject)
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  user_agent TEXT,
  ip_address INET,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id),
  external_id TEXT NOT NULL,
  fingerprint_hash CHAR(64) NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  description_html TEXT,
  country_id UUID REFERENCES countries(id),
  city_id UUID REFERENCES cities(id),
  location_raw TEXT,
  is_remote BOOLEAN NOT NULL DEFAULT FALSE,
  employment_type employment_type NOT NULL DEFAULT 'unknown',
  category_id UUID REFERENCES categories(id),
  salary_min NUMERIC(12,2),
  salary_max NUMERIC(12,2),
  currency CHAR(3),
  status job_status NOT NULL DEFAULT 'active',
  posted_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expired_at TIMESTAMPTZ,
  apply_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_jobs_source_external UNIQUE (source_id, external_id),
  CONSTRAINT uq_jobs_fingerprint UNIQUE (fingerprint_hash),
  CONSTRAINT chk_salary_range CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max)
);

CREATE TABLE IF NOT EXISTS job_skills (
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  confidence NUMERIC(3,2) DEFAULT 1.00,
  PRIMARY KEY (job_id, skill_id)
);

CREATE TABLE IF NOT EXISTS job_updates (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bookmarks (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_id)
);

CREATE TABLE IF NOT EXISTS job_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  keywords TEXT,
  country_id UUID REFERENCES countries(id),
  city_id UUID REFERENCES cities(id),
  is_remote_only BOOLEAN NOT NULL DEFAULT FALSE,
  salary_min NUMERIC(12,2),
  employment_type employment_type,
  category_id UUID REFERENCES categories(id),
  frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('instant', 'daily', 'weekly')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resume_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
  parsed_skills JSONB,
  parsed_experience JSONB,
  parsed_titles TEXT[],
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_matches (
  id BIGSERIAL PRIMARY KEY,
  resume_profile_id UUID NOT NULL REFERENCES resume_profiles(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  match_score NUMERIC(5,4) NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_match UNIQUE (resume_profile_id, job_id)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
    EXECUTE 'CREATE TABLE IF NOT EXISTS job_embeddings (
      job_id UUID PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      embedding VECTOR(1536),
      model_version TEXT NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )';
  ELSE
    EXECUTE 'CREATE TABLE IF NOT EXISTS job_embeddings (
      job_id UUID PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      embedding REAL[],
      model_version TEXT NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS workflow_logs (
  id BIGSERIAL PRIMARY KEY,
  source_id UUID REFERENCES sources(id),
  workflow_name TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  records_fetched INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id BIGSERIAL PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES sources(id),
  sync_started_at TIMESTAMPTZ NOT NULL,
  sync_finished_at TIMESTAMPTZ,
  jobs_created INTEGER DEFAULT 0,
  jobs_updated INTEGER DEFAULT 0,
  jobs_expired INTEGER DEFAULT 0,
  jobs_rejected INTEGER DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS api_logs (
  id BIGSERIAL PRIMARY KEY,
  request_id UUID NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  user_id UUID REFERENCES users(id),
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  admin_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS search_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  query TEXT,
  filters JSONB,
  result_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_last_seen ON jobs (status, last_seen_at);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs (company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_location ON jobs (country_id, city_id);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_at ON jobs (posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_fulltext ON jobs USING GIN (to_tsvector('english', title || ' ' || description));
CREATE INDEX IF NOT EXISTS idx_job_skills_skill ON job_skills (skill_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks (user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON job_alerts (is_active, frequency);
CREATE INDEX IF NOT EXISTS idx_synclogs_source ON sync_logs (source_id, sync_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_logs_status_created ON workflow_logs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_created ON api_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_search_history_user_created ON search_history (user_id, created_at DESC);

INSERT INTO sources (name, type, sync_interval_minutes)
VALUES
  ('greenhouse', 'ats_api', 15),
  ('lever', 'ats_api', 15),
  ('ashby', 'ats_api', 15),
  ('workday', 'ats_api', 60),
  ('government', 'government_feed', 60),
  ('company_website', 'company_website', 720)
ON CONFLICT (name) DO NOTHING;
