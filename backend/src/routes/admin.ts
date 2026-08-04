import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireJwt } from "../middleware/auth.js";
import { parseLimit } from "../utils/pagination.js";

export const adminRouter = Router();

adminRouter.use(requireJwt("admin"));

adminRouter.get("/sources", async (_req, res) => {
  const result = await pool.query(
    `SELECT s.id, s.name, s.type, s.is_active AS "isActive", s.last_synced_at AS "lastSyncedAt",
            s.sync_interval_minutes AS "syncIntervalMinutes",
            COALESCE(ROUND(100.0 * COUNT(sl.*) FILTER (WHERE sl.success) / NULLIF(COUNT(sl.*), 0), 2), 100) AS "last7dSuccessRate"
     FROM sources s
     LEFT JOIN sync_logs sl ON sl.source_id = s.id AND sl.sync_started_at > now() - interval '7 days'
     GROUP BY s.id
     ORDER BY s.name ASC`,
  );
  res.json({ data: result.rows });
});

adminRouter.patch("/sources/:id", async (req, res) => {
  const result = await pool.query(
    `UPDATE sources
     SET is_active = COALESCE($2, is_active),
         sync_interval_minutes = COALESCE($3, sync_interval_minutes)
     WHERE id = $1
     RETURNING id, name, is_active AS "isActive", sync_interval_minutes AS "syncIntervalMinutes"`,
    [req.params.id, req.body.isActive, req.body.syncIntervalMinutes],
  );
  res.json(result.rows[0]);
});

adminRouter.post("/sources/:id/trigger-sync", async (req, res) => {
  res.status(202).json({ accepted: true, sourceId: req.params.id, note: "n8n trigger integration is configured at deployment time" });
});

adminRouter.get("/workflow-logs", async (req, res) => {
  const limit = parseLimit(req.query.limit, 50, 200);
  const params: unknown[] = [];
  const where: string[] = [];
  if (req.query.status) {
    params.push(req.query.status);
    where.push(`status = $${params.length}`);
  }
  if (req.query.sourceId) {
    params.push(req.query.sourceId);
    where.push(`source_id = $${params.length}`);
  }
  params.push(limit);
  const result = await pool.query(
    `SELECT *
     FROM workflow_logs
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  res.json({ data: result.rows });
});

adminRouter.get("/stats", async (_req, res) => {
  const [activeJobs, dailyUpdates, failedIngestion] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS count FROM jobs WHERE status = 'active'"),
    pool.query("SELECT COUNT(*)::int AS count FROM job_updates WHERE changed_at > now() - interval '24 hours'"),
    pool.query("SELECT COUNT(*)::int AS count FROM workflow_logs WHERE status = 'failed' AND created_at > now() - interval '24 hours'"),
  ]);
  res.json({
    activeJobs: activeJobs.rows[0].count,
    dailyUpdates: dailyUpdates.rows[0].count,
    failedIngestionRuns24h: failedIngestion.rows[0].count,
  });
});

adminRouter.get("/analytics/search", async (_req, res) => {
  const result = await pool.query(
    `SELECT query, COUNT(*)::int AS count
     FROM search_history
     WHERE query IS NOT NULL
     GROUP BY query
     ORDER BY count DESC
     LIMIT 50`,
  );
  res.json({ data: result.rows });
});
