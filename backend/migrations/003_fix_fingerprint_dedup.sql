-- Migration 003: Fingerprint dedup without batch-aborting collisions
--
-- uq_jobs_fingerprint was a global UNIQUE on jobs.fingerprint_hash. Because
-- persistBatchJobs upserts ON CONFLICT (source_id, external_id), the same
-- posting arriving from a second source raised 23505 and rolled back the whole
-- envelope rather than just that row. With several aggregators running
-- concurrently this fails constantly.
--
-- Cross-source dedup now happens in the application (see persistBatchJobs),
-- which can skip the duplicate row and keep the rest of the batch.
-- idx_jobs_fingerprint (migration 002) provides the lookup this relies on.

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS uq_jobs_fingerprint;
