import { Router } from "express";
import { pool } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { parseLimit } from "../utils/pagination.js";

export const companiesRouter = Router();

companiesRouter.get("/", async (req, res) => {
  const limit = parseLimit(req.query.limit, 20, 100);
  const offset = Number(req.query.offset ?? 0);
  const search = String(req.query.search ?? "").trim();
  const params: unknown[] = [];
  const where: string[] = [];

  if (search) {
    params.push(`%${search}%`);
    where.push(`name ILIKE $${params.length}`);
  }

  params.push(limit, offset);
  const result = await pool.query(
    `SELECT c.*, COUNT(j.id) FILTER (WHERE j.status = 'active') AS active_job_count
     FROM companies c
     LEFT JOIN jobs j ON j.company_id = c.id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     GROUP BY c.id
     ORDER BY c.name ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  res.json({ data: result.rows.map(mapCompany), pagination: { limit, offset } });
});

companiesRouter.get("/:id", async (req, res) => {
  const result = await pool.query(
    `SELECT c.*, COUNT(j.id) FILTER (WHERE j.status = 'active') AS active_job_count
     FROM companies c
     LEFT JOIN jobs j ON j.company_id = c.id
     WHERE c.id = $1
     GROUP BY c.id`,
    [req.params.id],
  );
  if (!result.rows[0]) throw new ApiError(404, "COMPANY_NOT_FOUND", "Company not found");
  res.json(mapCompany(result.rows[0]));
});

companiesRouter.get("/:id/jobs", async (req, res) => {
  const limit = parseLimit(req.query.limit);
  const result = await pool.query(
    `SELECT id, title, location_raw, is_remote, employment_type, salary_min, salary_max, currency, posted_at, apply_url
     FROM jobs
     WHERE company_id = $1 AND status = 'active'
     ORDER BY posted_at DESC NULLS LAST
     LIMIT $2`,
    [req.params.id, limit],
  );
  res.json({ data: result.rows, pagination: { limit, nextCursor: null, hasMore: result.rows.length === limit } });
});

function mapCompany(row: any) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    website: row.website,
    logoUrl: row.logo_url,
    description: row.description,
    industry: row.industry,
    sizeRange: row.size_range,
    activeJobCount: Number(row.active_job_count ?? 0),
  };
}
