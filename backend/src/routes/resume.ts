import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { requireJwt } from "../middleware/auth.js";

export const resumeRouter = Router();

resumeRouter.post("/resume", requireJwt("user"), async (req, res) => {
  const body = z.object({ fileUrl: z.string().url() }).parse(req.body);
  const result = await pool.query(
    `INSERT INTO resume_profiles (user_id, file_url, status)
     VALUES ($1, $2, 'processing')
     RETURNING id AS "resumeId", status`,
    [req.user!.id, body.fileUrl],
  );
  res.status(202).json(result.rows[0]);
});

resumeRouter.get("/resume/:id", requireJwt("user"), async (req, res) => {
  const result = await pool.query(
    `SELECT id, status, parsed_skills AS "parsedSkills", parsed_experience AS "parsedExperience",
            parsed_titles AS "parsedTitles", created_at AS "createdAt"
     FROM resume_profiles
     WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user!.id],
  );
  if (!result.rows[0]) throw new ApiError(404, "RESUME_NOT_FOUND", "Resume not found");
  res.json(result.rows[0]);
});

resumeRouter.get("/recommendations", requireJwt("user"), async (req, res) => {
  const resume = await pool.query(
    "SELECT id FROM resume_profiles WHERE user_id = $1 AND status = 'ready' ORDER BY created_at DESC LIMIT 1",
    [req.user!.id],
  );
  if (!resume.rows[0]) throw new ApiError(422, "NO_RESUME_ON_FILE", "No processed resume on file");

  const result = await pool.query(
    `SELECT jm.match_score AS "matchScore", j.id, j.title, j.apply_url AS "applyUrl", c.name AS "companyName"
     FROM job_matches jm
     JOIN jobs j ON j.id = jm.job_id
     JOIN companies c ON c.id = j.company_id
     WHERE jm.resume_profile_id = $1 AND j.status = 'active'
     ORDER BY jm.match_score DESC
     LIMIT 50`,
    [resume.rows[0].id],
  );
  res.json({ data: result.rows });
});
