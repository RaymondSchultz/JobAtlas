import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { requireInternalServiceKey } from "../middleware/auth.js";
import { expireJobs, processBatch, processEnvelope } from "../services/job-processor.js";

export const internalRouter = Router();

internalRouter.use(requireInternalServiceKey);

internalRouter.post("/jobs", async (req, res) => {
  const results = await processEnvelope(req.body);
  res.json(results.length === 1 ? results[0] : { results });
});

internalRouter.post("/jobs/batch", async (req, res) => {
  const results = await processBatch(req.body);
  res.json({
    results,
    summary: {
      created: results.filter((item) => item.action === "created").length,
      updated: results.filter((item) => item.action === "updated").length,
      duplicate: results.filter((item) => item.action === "duplicate").length,
      rejected: results.filter((item) => item.action === "rejected").length,
    },
  });
});

internalRouter.post("/jobs/expire-check", async (req, res) => {
  const body = z.object({ olderThanDays: z.number().int().positive().max(3650).default(30) }).parse(req.body);
  res.json(await expireJobs(body.olderThanDays));
});

internalRouter.post("/workflow-logs", async (req, res) => {
  const body = z.object({
    workflowName: z.string().min(1),
    source: z.string().optional(),
    status: z.enum(["success", "failed", "partial"]).default("success"),
    startedAt: z.string().datetime().optional(),
    finishedAt: z.string().datetime().optional(),
    recordsFetched: z.number().int().nonnegative().default(0),
    recordsFailed: z.number().int().nonnegative().default(0),
    errorMessage: z.string().optional(),
    metadata: z.unknown().optional(),
  }).parse(req.body);

  const sourceResult = body.source
    ? await pool.query("SELECT id FROM sources WHERE name = $1", [body.source])
    : { rows: [] };

  const inserted = await pool.query(
    `INSERT INTO workflow_logs (
      source_id, workflow_name, status, started_at, finished_at, records_fetched, records_failed, error_message, metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING id`,
    [
      sourceResult.rows[0]?.id ?? null,
      body.workflowName,
      body.status,
      body.startedAt ? new Date(body.startedAt) : new Date(),
      body.finishedAt ? new Date(body.finishedAt) : null,
      body.recordsFetched,
      body.recordsFailed,
      body.errorMessage ?? null,
      JSON.stringify(body.metadata ?? {}),
    ],
  );

  res.status(201).json({ id: inserted.rows[0].id });
});

internalRouter.post("/health/source-check", async (req, res) => {
  const body = z.object({
    maxMissedCycles: z.number().positive().default(2),
    minSuccessRate7d: z.number().min(0).max(1).default(0.9),
  }).parse(req.body);

  const overdue = await pool.query(
    `SELECT name, last_synced_at, sync_interval_minutes
     FROM sources
     WHERE is_active = true
       AND (last_synced_at IS NULL OR last_synced_at < now() - (sync_interval_minutes * $1 || ' minutes')::interval)`,
    [body.maxMissedCycles],
  );

  const successRates = await pool.query(
    `SELECT s.name,
            COUNT(sl.*) FILTER (WHERE sl.success) AS successes,
            COUNT(sl.*) AS total
     FROM sources s
     LEFT JOIN sync_logs sl ON sl.source_id = s.id AND sl.sync_started_at > now() - interval '7 days'
     GROUP BY s.id, s.name`,
  );

  const unhealthyRates = successRates.rows.filter((row) => {
    const total = Number(row.total);
    if (total === 0) return false;
    return Number(row.successes) / total < body.minSuccessRate7d;
  });

  res.json({ overdue: overdue.rows, unhealthyRates });
});

internalRouter.post("/workflows/retry-failed-jobs", async (req, res) => {
  const body = z.object({
    sinceHours: z.number().int().positive().default(24),
    maxRetryCount: z.number().int().nonnegative().default(3),
  }).parse(req.body);

  const failures = await pool.query(
    `SELECT *
     FROM workflow_logs
     WHERE status = 'failed'
       AND created_at > now() - ($1::text || ' hours')::interval
       AND retry_count < $2
     ORDER BY created_at ASC
     LIMIT 100`,
    [body.sinceHours, body.maxRetryCount],
  );

  res.json({ retryCandidates: failures.rows });
});

internalRouter.post("/alerts/match", async (req, res) => {
  const body = z.object({
    frequency: z.enum(["instant", "daily", "weekly"]).optional(),
    mode: z.string().optional(),
  }).passthrough().parse(req.body);

  const frequency = body.frequency ?? "daily";
  const alerts = await pool.query(
    `SELECT id, user_id, name, keywords, frequency
     FROM job_alerts
     WHERE is_active = true AND frequency = $1
     LIMIT 500`,
    [frequency],
  );

  res.json({ mode: body.mode ?? "digest", frequency, alerts: alerts.rows });
});

internalRouter.post("/notifications/dispatch-email", async (req, res) => {
  await pool.query(
    `INSERT INTO workflow_logs (workflow_name, status, started_at, finished_at, metadata)
     VALUES ('Notifications/Email Alerts', 'success', now(), now(), $1)`,
    [JSON.stringify({ payload: req.body })],
  );
  res.json({ queued: true });
});

internalRouter.post("/ai/resume/parse", async (req, res) => {
  const body = z.object({ resumeId: z.string().uuid().optional() }).passthrough().parse(req.body);
  if (!body.resumeId) {
    throw new ApiError(202, "ACCEPTED_NOOP", "Resume parse endpoint is scaffolded; provide resumeId when resume storage is implemented");
  }
  res.json({ resumeId: body.resumeId, status: "processing" });
});

internalRouter.post("/ai/matching/run", async (req, res) => {
  res.json({ accepted: true, mode: req.body?.mode ?? "manual", queuedAt: new Date().toISOString() });
});
