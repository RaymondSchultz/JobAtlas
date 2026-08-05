import { createHash } from "node:crypto";
import type { DbClient } from "../db/pool.js";
import { pool } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { extractJobsFromEnvelope, jobEnvelopeSchema, normalizeJob, type JobEnvelope, type NormalizedJob } from "./job-normalizer.js";
import { indexJobsInMeili } from "./search-indexer.js";

export interface ProcessResult {
  jobId?: string;
  action: "created" | "updated" | "rejected";
  fingerprintHash?: string;
  reason?: string;
  validationErrors?: string[];
}

function fingerprint(job: NormalizedJob) {
  return createHash("sha256")
    .update(`${job.companyName}|${job.title}|${job.locationRaw ?? ""}|${job.applyUrl}`.toLowerCase())
    .digest("hex");
}

async function getSourceId(db: DbClient, sourceName: string) {
  const result = await db.query("SELECT id FROM sources WHERE name = $1", [sourceName]);
  if (result.rows[0]) return result.rows[0].id as string;

  const inserted = await db.query(
    "INSERT INTO sources (name, type) VALUES ($1, 'ats_api') RETURNING id",
    [sourceName],
  );
  return inserted.rows[0].id as string;
}

async function upsertCompany(db: DbClient, name: string, slug: string) {
  const result = await db.query(
    `INSERT INTO companies (name, slug)
     VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
     RETURNING id`,
    [name, slug],
  );
  return result.rows[0].id as string;
}

async function persistJob(db: DbClient, job: NormalizedJob): Promise<ProcessResult> {
  const sourceId = await getSourceId(db, job.source);
  const companyId = await upsertCompany(db, job.companyName, job.companySlug);
  const fingerprintHash = fingerprint(job);

  const existing = await db.query(
    "SELECT id FROM jobs WHERE (source_id = $1 AND external_id = $2) OR fingerprint_hash = $3 LIMIT 1",
    [sourceId, job.externalId, fingerprintHash],
  );

  if (existing.rows[0]) {
    const id = existing.rows[0].id as string;
    await db.query(
      `UPDATE jobs SET
         source_id = $1,
         external_id = $2,
         fingerprint_hash = $3,
         company_id = $4,
         title = $5,
         description = $6,
         description_html = $7,
         location_raw = $8,
         is_remote = $9,
         employment_type = $10,
         salary_min = $11,
         salary_max = $12,
         currency = $13,
         posted_at = $14,
         apply_url = $15,
         last_seen_at = now(),
         updated_at = now(),
         status = 'active',
         expired_at = NULL
       WHERE id = $16`,
      [
        sourceId,
        job.externalId,
        fingerprintHash,
        companyId,
        job.title,
        job.description,
        job.descriptionHtml,
        job.locationRaw,
        job.isRemote,
        job.employmentType,
        job.salaryMin,
        job.salaryMax,
        job.currency,
        job.postedAt,
        job.applyUrl,
        id,
      ],
    );
    await db.query("INSERT INTO job_updates (job_id, change_type) VALUES ($1, 'refreshed')", [id]);
    return { jobId: id, action: "updated", fingerprintHash };
  }

  const inserted = await db.query(
    `INSERT INTO jobs (
       source_id, external_id, fingerprint_hash, company_id, title, description, description_html,
       location_raw, is_remote, employment_type, salary_min, salary_max, currency, posted_at, apply_url
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id`,
    [
      sourceId,
      job.externalId,
      fingerprintHash,
      companyId,
      job.title,
      job.description,
      job.descriptionHtml,
      job.locationRaw,
      job.isRemote,
      job.employmentType,
      job.salaryMin,
      job.salaryMax,
      job.currency,
      job.postedAt,
      job.applyUrl,
    ],
  );

  const id = inserted.rows[0].id as string;
  await db.query("INSERT INTO job_updates (job_id, change_type) VALUES ($1, 'created')", [id]);
  return { jobId: id, action: "created", fingerprintHash };
}

function isRejectedJob(value: NormalizedJob | { action: "rejected" }): value is { action: "rejected"; reason: string; validationErrors: string[] } {
  return "action" in value && value.action === "rejected";
}

export async function processEnvelope(input: unknown): Promise<ProcessResult[]> {
  const parsed = jobEnvelopeSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid job envelope", parsed.error.flatten());
  }

  const envelope = parsed.data;
  const rawJobs = extractJobsFromEnvelope(envelope);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const results: ProcessResult[] = [];
    for (const rawJob of rawJobs) {
      const normalized = normalizeJob(envelope, rawJob);
      if (isRejectedJob(normalized)) {
        results.push(normalized);
        continue;
      }
      results.push(await persistJob(client, normalized));
    }
    await updateSourceSync(client, envelope, results);
    await client.query("COMMIT");

    // Asynchronously trigger Meilisearch indexing for created/updated jobs
    const affectedJobIds = results
      .filter((r) => (r.action === "created" || r.action === "updated") && r.jobId)
      .map((r) => r.jobId as string);
    if (affectedJobIds.length > 0) {
      indexJobsInMeili(affectedJobIds).catch((err) =>
        console.error("Async Meilisearch indexing error:", err),
      );
    }

    return results;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function processBatch(input: unknown): Promise<ProcessResult[]> {
  if (Array.isArray(input)) {
    const results: ProcessResult[][] = [];
    for (const item of input) {
      results.push(await processEnvelope(item));
    }
    return results.flat();
  }
  return processEnvelope(input);
}

async function updateSourceSync(db: DbClient, envelope: JobEnvelope, results: ProcessResult[]) {
  const sourceId = await getSourceId(db, envelope.source);
  const created = results.filter((result) => result.action === "created").length;
  const updated = results.filter((result) => result.action === "updated").length;
  const rejected = results.filter((result) => result.action === "rejected").length;
  const success = rejected === 0;

  await db.query("UPDATE sources SET last_synced_at = now() WHERE id = $1", [sourceId]);
  await db.query(
    `INSERT INTO sync_logs (
      source_id, sync_started_at, sync_finished_at, jobs_created, jobs_updated, jobs_rejected, success
    ) VALUES ($1, $2, now(), $3, $4, $5, $6)`,
    [sourceId, envelope.fetchedAt ? new Date(envelope.fetchedAt) : new Date(), created, updated, rejected, success],
  );
}

export async function expireJobs(olderThanDays: number) {
  const result = await pool.query(
    `UPDATE jobs
     SET status = 'expired', expired_at = now(), updated_at = now()
     WHERE status = 'active'
       AND last_seen_at < now() - ($1::text || ' days')::interval
     RETURNING id`,
    [olderThanDays],
  );
  for (const row of result.rows) {
    await pool.query("INSERT INTO job_updates (job_id, change_type) VALUES ($1, 'expired')", [row.id]);
  }
  return { expired: result.rowCount ?? 0 };
}
