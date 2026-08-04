import { Router } from "express";
import { pool } from "../db/pool.js";
import { parseLimit } from "../utils/pagination.js";

export const searchRouter = Router();

searchRouter.get("/", async (req, res) => {
  const started = Date.now();
  const q = String(req.query.q ?? "").trim();
  const limit = parseLimit(req.query.limit);
  const params: unknown[] = [];
  const where = ["j.status = 'active'"];

  if (q) {
    params.push(q);
    where.push(`to_tsvector('english', j.title || ' ' || j.description) @@ plainto_tsquery('english', $${params.length})`);
  }
  if (req.query.remote !== undefined) {
    params.push(String(req.query.remote) === "true");
    where.push(`j.is_remote = $${params.length}`);
  }

  params.push(limit);
  const result = await pool.query(
    `SELECT j.id, j.title, j.location_raw, j.is_remote, j.employment_type, j.salary_min, j.salary_max,
            j.currency, j.posted_at, j.apply_url, j.status, j.company_id,
            c.name AS company_name, c.logo_url, co.iso_code AS country_iso, ci.name AS city_name
     FROM jobs j
     JOIN companies c ON c.id = j.company_id
     LEFT JOIN countries co ON co.id = j.country_id
     LEFT JOIN cities ci ON ci.id = j.city_id
     WHERE ${where.join(" AND ")}
     ORDER BY j.posted_at DESC NULLS LAST
     LIMIT $${params.length}`,
    params,
  );

  res.json({
    data: result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      company: { id: row.company_id, name: row.company_name, logoUrl: row.logo_url },
      location: { country: row.country_iso, city: row.city_name, isRemote: row.is_remote, raw: row.location_raw },
      employmentType: row.employment_type,
      salary: { min: row.salary_min === null ? null : Number(row.salary_min), max: row.salary_max === null ? null : Number(row.salary_max), currency: row.currency },
      postedAt: row.posted_at,
      applyUrl: row.apply_url,
    })),
    pagination: { limit, nextCursor: null, hasMore: result.rows.length === limit },
    meta: { tookMs: Date.now() - started, totalEstimate: result.rows.length, mode: req.query.mode ?? "keyword" },
  });
});

searchRouter.get("/suggestions", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json({ suggestions: [] });
  const result = await pool.query(
    `SELECT DISTINCT title
     FROM jobs
     WHERE status = 'active' AND title ILIKE $1
     ORDER BY title
     LIMIT 10`,
    [`${q}%`],
  );
  res.json({ suggestions: result.rows.map((row) => row.title) });
});
