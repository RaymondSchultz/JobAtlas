import { createHash } from "node:crypto";
import type { DbClient } from "../db/pool.js";
import { pool } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { extractJobsFromEnvelope, jobEnvelopeSchema, normalizeJob, type JobEnvelope, type NormalizedJob } from "./job-normalizer.js";
import { indexJobsInMeili } from "./search-indexer.js";

export interface ProcessResult {
  jobId?: string;
  action: "created" | "updated" | "rejected" | "duplicate";
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

async function persistBatchJobs(db: DbClient, sourceId: string, validJobs: NormalizedJob[]): Promise<ProcessResult[]> {
  if (validJobs.length === 0) return [];

  const companyPairs = Array.from(
    new Map(validJobs.map((j) => [j.companySlug, { name: j.companyName, slug: j.companySlug }])).values(),
  );

  const companyRes = await db.query(
    `INSERT INTO companies (name, slug)
     SELECT u.name, u.slug
     FROM UNNEST($1::text[], $2::text[]) AS u(name, slug)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
     RETURNING id, slug`,
    [companyPairs.map((c) => c.name), companyPairs.map((c) => c.slug)],
  );

  const companyMap = new Map<string, string>();
  for (const row of companyRes.rows) {
    companyMap.set(row.slug, row.id);
  }

  const jobItems = validJobs.map((job) => {
    const companyId = companyMap.get(job.companySlug)!;
    const fpHash = fingerprint(job);
    return { job, companyId, fpHash };
  });

  const results: ProcessResult[] = [];

  // A single payload can carry the same posting twice: under one external id, or
  // under two ids that fingerprint identically. Collapse both before the upsert.
  // Each collapse is recorded so the caller's counts reconcile against the
  // number of records fetched, rather than a row silently disappearing.
  const byExternalId = new Map<string, typeof jobItems[0]>();
  for (const item of jobItems) {
    if (byExternalId.has(item.job.externalId)) {
      results.push({ action: "duplicate", fingerprintHash: item.fpHash, reason: "DUPLICATE_EXTERNAL_ID_IN_BATCH" });
    }
    byExternalId.set(item.job.externalId, item);
  }

  const byFingerprint = new Map<string, typeof jobItems[0]>();
  for (const item of byExternalId.values()) {
    if (byFingerprint.has(item.fpHash)) {
      results.push({ action: "duplicate", fingerprintHash: item.fpHash, reason: "DUPLICATE_FINGERPRINT_IN_BATCH" });
      continue;
    }
    byFingerprint.set(item.fpHash, item);
  }

  // The same posting syndicated by several aggregators fingerprints identically.
  // Skip rows already owned by a different (source_id, external_id) so one
  // duplicate does not cost us the rest of the batch.
  const claimedBy = new Map<string, { sourceId: string; externalId: string }>();
  if (byFingerprint.size > 0) {
    const claimRes = await db.query(
      `SELECT fingerprint_hash, source_id, external_id
       FROM jobs
       WHERE fingerprint_hash = ANY($1::char(64)[])`,
      [Array.from(byFingerprint.keys())],
    );
    for (const row of claimRes.rows) {
      claimedBy.set(row.fingerprint_hash, { sourceId: row.source_id, externalId: row.external_id });
    }
  }

  const uniqueItems: typeof jobItems = [];
  for (const item of byFingerprint.values()) {
    const claim = claimedBy.get(item.fpHash);
    const ownedByThisRow = claim && claim.sourceId === sourceId && claim.externalId === item.job.externalId;
    if (claim && !ownedByThisRow) {
      results.push({ action: "duplicate", fingerprintHash: item.fpHash, reason: "DUPLICATE_OF_EXISTING_JOB" });
      continue;
    }
    uniqueItems.push(item);
  }

  if (uniqueItems.length === 0) return results;

  const upsertRes = await db.query(
    `INSERT INTO jobs (
       source_id, external_id, fingerprint_hash, company_id, title, description, description_html,
       location_raw, is_remote, employment_type, salary_min, salary_max, currency, posted_at, apply_url,
       last_seen_at, updated_at, status
     )
     SELECT
       $1,
       u.external_id,
       u.fingerprint_hash,
       u.company_id,
       u.title,
       u.description,
       u.description_html,
       u.location_raw,
       u.is_remote,
       u.employment_type::employment_type,
       u.salary_min,
       u.salary_max,
       u.currency,
       u.posted_at,
       u.apply_url,
       now(),
       now(),
       'active'::job_status
     FROM UNNEST(
       $2::text[], $3::text[], $4::uuid[], $5::text[], $6::text[], $7::text[],
       $8::text[], $9::boolean[], $10::text[], $11::numeric[], $12::numeric[],
       $13::text[], $14::timestamptz[], $15::text[]
     ) AS u(
       external_id, fingerprint_hash, company_id, title, description, description_html,
       location_raw, is_remote, employment_type, salary_min, salary_max,
       currency, posted_at, apply_url
     )
     ON CONFLICT (source_id, external_id)
     DO UPDATE SET
       fingerprint_hash = EXCLUDED.fingerprint_hash,
       company_id = EXCLUDED.company_id,
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       description_html = EXCLUDED.description_html,
       location_raw = EXCLUDED.location_raw,
       is_remote = EXCLUDED.is_remote,
       employment_type = EXCLUDED.employment_type,
       salary_min = EXCLUDED.salary_min,
       salary_max = EXCLUDED.salary_max,
       currency = EXCLUDED.currency,
       posted_at = EXCLUDED.posted_at,
       apply_url = EXCLUDED.apply_url,
       last_seen_at = now(),
       updated_at = now(),
       status = 'active'::job_status,
       expired_at = NULL
     RETURNING id, fingerprint_hash, (xmax = 0) AS was_inserted`,
    [
      sourceId,
      uniqueItems.map((i) => i.job.externalId),
      uniqueItems.map((i) => i.fpHash),
      uniqueItems.map((i) => i.companyId),
      uniqueItems.map((i) => i.job.title),
      uniqueItems.map((i) => i.job.description),
      uniqueItems.map((i) => i.job.descriptionHtml || null),
      uniqueItems.map((i) => i.job.locationRaw || null),
      uniqueItems.map((i) => i.job.isRemote),
      uniqueItems.map((i) => i.job.employmentType),
      uniqueItems.map((i) => i.job.salaryMin ?? null),
      uniqueItems.map((i) => i.job.salaryMax ?? null),
      uniqueItems.map((i) => i.job.currency || null),
      uniqueItems.map((i) => (i.job.postedAt ? new Date(i.job.postedAt) : null)),
      uniqueItems.map((i) => i.job.applyUrl),
    ],
  );

  const updateJobIds: string[] = [];
  const updateChangeTypes: string[] = [];

  for (const row of upsertRes.rows) {
    const action = row.was_inserted ? "created" : "updated";
    results.push({ jobId: row.id, action, fingerprintHash: row.fingerprint_hash });
    updateJobIds.push(row.id);
    updateChangeTypes.push(action === "created" ? "created" : "refreshed");
  }

  if (updateJobIds.length > 0) {
    await db.query(
      `INSERT INTO job_updates (job_id, change_type)
       SELECT u.id, u.change_type
       FROM UNNEST($1::uuid[], $2::text[]) AS u(id, change_type)`,
      [updateJobIds, updateChangeTypes],
    );
  }

  return results;
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
    const validJobs: NormalizedJob[] = [];

    for (const rawJob of rawJobs) {
      const normalized = normalizeJob(envelope, rawJob);
      if (isRejectedJob(normalized)) {
        results.push(normalized);
      } else {
        validJobs.push(normalized);
      }
    }

    if (validJobs.length > 0) {
      const sourceId = await getSourceId(client, envelope.source);
      const batchResults = await persistBatchJobs(client, sourceId, validJobs);
      results.push(...batchResults);
    }

    await updateSourceSync(client, envelope, results);
    await client.query("COMMIT");

    const affectedJobIds = results
      .filter((r) => (r.action === "created" || r.action === "updated") && r.jobId)
      .map((r) => r.jobId as string);
    if (affectedJobIds.length > 0) {
      setImmediate(() => {
        indexJobsInMeili(affectedJobIds).catch((err) =>
          console.error("Async Meilisearch indexing error:", err),
        );
      });
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

  if (result.rows.length > 0) {
    await pool.query(
      `INSERT INTO job_updates (job_id, change_type)
       SELECT id, 'expired' FROM UNNEST($1::uuid[]) AS t(id)`,
      [result.rows.map((row) => row.id)],
    );
  }

  return { expired: result.rowCount ?? 0 };
}
