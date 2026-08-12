-- Migration 002: Partition & Scale Jobs Table Indexes
-- Optimization for Multi-Million Job Ingestion & Sub-50ms Jobpilot Search

CREATE INDEX IF NOT EXISTS idx_jobs_status_last_seen ON jobs (status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_source_external ON jobs (source_id, external_id);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_at_desc ON jobs (posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_company_status ON jobs (company_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_is_remote_status ON jobs (is_remote, status);
CREATE INDEX IF NOT EXISTS idx_jobs_fingerprint ON jobs (fingerprint_hash);

-- Performance optimization for sync logs & workflow retry candidates
CREATE INDEX IF NOT EXISTS idx_workflow_logs_status_retry ON workflow_logs (status, retry_count, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started ON sync_logs (source_id, sync_started_at DESC);

-- Helper function to resolve ISO country alpha-2 codes
CREATE OR REPLACE FUNCTION resolve_country_id(country_code TEXT)
RETURNS UUID AS $$
DECLARE
  cid UUID;
BEGIN
  IF country_code IS NULL OR country_code = '' THEN
    RETURN NULL;
  END IF;
  SELECT id INTO cid FROM countries WHERE UPPER(iso_code) = UPPER(country_code) LIMIT 1;
  RETURN cid;
END;
$$ LANGUAGE plpgsql STABLE;
