import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import { processEnvelope, type ProcessResult } from "../services/job-processor.js";
import { getConnector, missingEnv } from "./connectors/index.js";
import type { SourceConnector } from "./types.js";

const FETCH_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 5_000;

/**
 * Comfortably longer than the worst case run (3 fetch attempts at 120s plus
 * backoff plus persistence), so a live run is never evicted, but short enough
 * that a crashed process frees the source within one cycle.
 */
const LOCK_TTL_SECONDS = 900;

export interface RunSummary {
  source: string;
  status: "success" | "partial" | "failed" | "skipped";
  fetched: number;
  created: number;
  updated: number;
  duplicate: number;
  rejected: number;
  durationMs: number;
  error?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Claims the source by writing a lease row, taking over only if the previous
 * lease has expired. The whole claim is one statement, so two racing runners
 * cannot both win.
 */
async function acquireLock(sourceKey: string, holder: string): Promise<boolean> {
  const result = await pool.query(
    `INSERT INTO ingestion_locks (source, holder, acquired_at, expires_at)
     VALUES ($1, $2, now(), now() + ($3::text || ' seconds')::interval)
     ON CONFLICT (source) DO UPDATE
       SET holder = EXCLUDED.holder,
           acquired_at = now(),
           expires_at = EXCLUDED.expires_at
       WHERE ingestion_locks.expires_at < now()
     RETURNING holder`,
    [sourceKey, holder, LOCK_TTL_SECONDS],
  );
  return result.rowCount === 1;
}

/** Scoped to this holder so we can never release a lease someone else took over. */
async function releaseLock(sourceKey: string, holder: string) {
  await pool.query("DELETE FROM ingestion_locks WHERE source = $1 AND holder = $2", [sourceKey, holder]);
}

/**
 * n8n gave retries for free via `retryOnFail`/`maxTries`. Only the fetch is
 * retried — persistence runs in a transaction and is not safe to blindly repeat.
 */
async function fetchWithRetry(connector: SourceConnector, log: (message: string) => void) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await connector.fetch({ signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), log });
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS) break;
      const delay = BASE_BACKOFF_MS * 2 ** (attempt - 1);
      log(`attempt ${attempt} failed (${(error as Error).message}); retrying in ${delay}ms`);
      await sleep(delay);
    }
  }

  throw lastError;
}

async function recordRun(summary: RunSummary, connector: SourceConnector, startedAt: Date) {
  try {
    const source = await pool.query("SELECT id FROM sources WHERE name = $1", [connector.key]);
    await pool.query(
      `INSERT INTO workflow_logs (
         source_id, workflow_name, status, started_at, finished_at,
         records_fetched, records_failed, error_message, metadata
       ) VALUES ($1,$2,$3,$4,now(),$5,$6,$7,$8)`,
      [
        source.rows[0]?.id ?? null,
        `Ingestion/${connector.displayName}`,
        summary.status === "skipped" ? "partial" : summary.status,
        startedAt,
        summary.fetched,
        summary.rejected,
        summary.error ?? null,
        JSON.stringify(summary),
      ],
    );
  } catch (error) {
    // Never let bookkeeping mask the ingestion result.
    console.error(`[ingest:${connector.key}] failed to write workflow_logs:`, error);
  }
}

function summarize(results: ProcessResult[]) {
  return {
    created: results.filter((result) => result.action === "created").length,
    updated: results.filter((result) => result.action === "updated").length,
    duplicate: results.filter((result) => result.action === "duplicate").length,
    rejected: results.filter((result) => result.action === "rejected").length,
  };
}

/**
 * Fetch one source and persist it through the same `processEnvelope` the
 * internal HTTP route uses — in-process, so there is no service key, no HTTP
 * hop, and no request body ceiling.
 *
 * A lease row keeps two instances (or a manual CLI run overlapping a scheduled
 * tick) from ingesting the same source concurrently.
 */
export async function runSource(sourceKey: string): Promise<RunSummary> {
  const connector = getConnector(sourceKey);
  if (!connector) {
    throw new Error(`Unknown ingestion source: ${sourceKey}`);
  }

  const startedAt = new Date();
  const started = Date.now();
  const log = (message: string) => console.log(`[ingest:${connector.key}] ${message}`);

  const absent = missingEnv(connector);
  if (absent.length > 0) {
    log(`skipped — missing env: ${absent.join(", ")}`);
    return {
      source: connector.key,
      status: "skipped",
      fetched: 0, created: 0, updated: 0, duplicate: 0, rejected: 0,
      durationMs: Date.now() - started,
      error: `Missing env: ${absent.join(", ")}`,
    };
  }

  const holder = `${hostname()}:${process.pid}:${randomUUID()}`;
  let locked = false;

  try {
    locked = await acquireLock(connector.key, holder);

    if (!locked) {
      log("skipped — another run holds the lock");
      return {
        source: connector.key,
        status: "skipped",
        fetched: 0, created: 0, updated: 0, duplicate: 0, rejected: 0,
        durationMs: Date.now() - started,
        error: "Run already in progress",
      };
    }

    const jobs = await fetchWithRetry(connector, log);
    const results = await processEnvelope({
      source: connector.key,
      fetchedAt: startedAt.toISOString(),
      raw: jobs,
    });

    const counts = summarize(results);
    const summary: RunSummary = {
      source: connector.key,
      status: counts.rejected > 0 ? "partial" : "success",
      fetched: jobs.length,
      ...counts,
      durationMs: Date.now() - started,
    };

    log(
      `done in ${summary.durationMs}ms — fetched ${summary.fetched}, created ${summary.created}, ` +
      `updated ${summary.updated}, duplicate ${summary.duplicate}, rejected ${summary.rejected}`,
    );
    await recordRun(summary, connector, startedAt);
    return summary;
  } catch (error) {
    const summary: RunSummary = {
      source: connector.key,
      status: "failed",
      fetched: 0, created: 0, updated: 0, duplicate: 0, rejected: 0,
      durationMs: Date.now() - started,
      error: (error as Error).message,
    };
    console.error(`[ingest:${connector.key}] failed:`, error);
    await recordRun(summary, connector, startedAt);
    return summary;
  } finally {
    if (locked) {
      await releaseLock(connector.key, holder).catch((error) =>
        console.error(`[ingest:${connector.key}] failed to release lock:`, error),
      );
    }
  }
}
