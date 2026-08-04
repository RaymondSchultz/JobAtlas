import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { requireJwt } from "../middleware/auth.js";
import { parseLimit } from "../utils/pagination.js";

export const bookmarksRouter = Router();

bookmarksRouter.use(requireJwt("user"));

bookmarksRouter.get("/", async (req, res) => {
  const limit = parseLimit(req.query.limit);
  const offset = Number(req.query.offset ?? 0);
  const result = await pool.query(
    `SELECT j.id, j.title, j.location_raw, j.is_remote, j.employment_type, j.salary_min, j.salary_max,
            j.currency, j.posted_at, j.apply_url, c.name AS company_name, c.logo_url
     FROM bookmarks b
     JOIN jobs j ON j.id = b.job_id
     JOIN companies c ON c.id = j.company_id
     WHERE b.user_id = $1
     ORDER BY b.created_at DESC
     LIMIT $2 OFFSET $3`,
    [req.user!.id, limit, offset],
  );
  res.json({ data: result.rows, pagination: { limit, offset } });
});

bookmarksRouter.post("/", async (req, res) => {
  const body = z.object({ jobId: z.string().uuid() }).parse(req.body);
  try {
    await pool.query("INSERT INTO bookmarks (user_id, job_id) VALUES ($1, $2)", [req.user!.id, body.jobId]);
    res.status(201).json({ jobId: body.jobId });
  } catch (error: any) {
    if (error.code === "23503") throw new ApiError(404, "JOB_NOT_FOUND", "Job not found");
    if (error.code === "23505") throw new ApiError(409, "ALREADY_BOOKMARKED", "Job already bookmarked");
    throw error;
  }
});

bookmarksRouter.delete("/:jobId", async (req, res) => {
  await pool.query("DELETE FROM bookmarks WHERE user_id = $1 AND job_id = $2", [req.user!.id, req.params.jobId]);
  res.status(204).end();
});
