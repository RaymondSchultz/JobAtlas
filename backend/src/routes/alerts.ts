import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { requireJwt } from "../middleware/auth.js";

export const alertsRouter = Router();

alertsRouter.use(requireJwt("user"));

const alertSchema = z.object({
  name: z.string().min(1),
  keywords: z.string().optional(),
  countryId: z.string().uuid().optional(),
  cityId: z.string().uuid().optional(),
  isRemoteOnly: z.boolean().default(false),
  salaryMin: z.number().optional(),
  employmentType: z.enum(["full_time", "part_time", "contract", "internship", "temporary", "unknown"]).optional(),
  categoryId: z.string().uuid().optional(),
  frequency: z.enum(["instant", "daily", "weekly"]).default("daily"),
});

alertsRouter.get("/", async (req, res) => {
  const result = await pool.query(
    `SELECT id, name, keywords, country_id AS "countryId", city_id AS "cityId",
            is_remote_only AS "isRemoteOnly", salary_min AS "salaryMin",
            employment_type AS "employmentType", category_id AS "categoryId",
            frequency, is_active AS "isActive", last_sent_at AS "lastSentAt", created_at AS "createdAt"
     FROM job_alerts
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [req.user!.id],
  );
  res.json({ data: result.rows });
});

alertsRouter.post("/", async (req, res) => {
  const body = alertSchema.parse(req.body);
  const result = await pool.query(
    `INSERT INTO job_alerts (
      user_id, name, keywords, country_id, city_id, is_remote_only, salary_min, employment_type, category_id, frequency
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING id, name, frequency, created_at AS "createdAt"`,
    [
      req.user!.id,
      body.name,
      body.keywords ?? null,
      body.countryId ?? null,
      body.cityId ?? null,
      body.isRemoteOnly,
      body.salaryMin ?? null,
      body.employmentType ?? null,
      body.categoryId ?? null,
      body.frequency,
    ],
  );
  res.status(201).json(result.rows[0]);
});

alertsRouter.patch("/:id", async (req, res) => {
  const body = alertSchema.partial().extend({ isActive: z.boolean().optional() }).parse(req.body);
  const existing = await pool.query("SELECT id FROM job_alerts WHERE id = $1 AND user_id = $2", [req.params.id, req.user!.id]);
  if (!existing.rows[0]) throw new ApiError(404, "ALERT_NOT_FOUND", "Alert not found");

  const result = await pool.query(
    `UPDATE job_alerts SET
      name = COALESCE($3, name),
      keywords = COALESCE($4, keywords),
      is_remote_only = COALESCE($5, is_remote_only),
      salary_min = COALESCE($6, salary_min),
      frequency = COALESCE($7, frequency),
      is_active = COALESCE($8, is_active)
     WHERE id = $1 AND user_id = $2
     RETURNING id, name, frequency, is_active AS "isActive"`,
    [req.params.id, req.user!.id, body.name, body.keywords, body.isRemoteOnly, body.salaryMin, body.frequency, body.isActive],
  );
  res.json(result.rows[0]);
});

alertsRouter.delete("/:id", async (req, res) => {
  await pool.query("DELETE FROM job_alerts WHERE id = $1 AND user_id = $2", [req.params.id, req.user!.id]);
  res.status(204).end();
});
