-- Migration 004: Pooler-safe ingestion locking
--
-- The runner originally used pg_try_advisory_lock/pg_advisory_unlock to stop
-- two instances ingesting the same source at once. Those locks are session
-- scoped, and the deployment connects through Neon's -pooler endpoint
-- (PgBouncer, transaction mode), where consecutive statements are not
-- guaranteed to reach the same server backend. The unlock could therefore run
-- on a different backend than the lock, leaking it and wedging that source for
-- good.
--
-- A lease row is unaffected by connection pooling, works across processes and
-- instances, and expires on its own so a crashed run cannot hold a source
-- forever.

CREATE TABLE IF NOT EXISTS ingestion_locks (
  source TEXT PRIMARY KEY,
  holder TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ingestion_locks_expires ON ingestion_locks (expires_at);
