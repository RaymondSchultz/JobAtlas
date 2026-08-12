import { Router } from "express";
import { pool } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { applyGeoFilter, parseGeoQuery } from "../utils/geo-filter.js";
import { decodeCursor, encodeCursor, parseLimit } from "../utils/pagination.js";

export const jobsRouter = Router();

function mapJob(row: any) {
  return {
    id: row.id,
    title: row.title,
    company: { id: row.company_id, name: row.company_name, logoUrl: row.logo_url },
    location: {
      country: row.country_iso,
      city: row.city_name,
      isRemote: row.is_remote,
      raw: row.location_raw,
      // Present only for radius queries; rounded because sub-100m precision on
      // a city centroid would imply accuracy the data does not have.
      ...(row.distance_km !== undefined && row.distance_km !== null
        ? { distanceKm: Math.round(Number(row.distance_km) * 10) / 10 }
        : {}),
    },
    employmentType: row.employment_type,
    salary: { min: row.salary_min === null ? null : Number(row.salary_min), max: row.salary_max === null ? null : Number(row.salary_max), currency: row.currency },
    postedAt: row.posted_at,
    applyUrl: row.apply_url,
    status: row.status,
  };
}

jobsRouter.get("/", async (req, res) => {
  const limit = parseLimit(req.query.limit);
  const cursor = decodeCursor<{ postedAt: string; id: string }>(String(req.query.cursor ?? ""));
  const params: unknown[] = [];
  const where = ["j.status = 'active'"];

  if (req.query.remote !== undefined) {
    params.push(String(req.query.remote) === "true");
    where.push(`j.is_remote = $${params.length}`);
  }
  if (req.query.employmentType) {
    params.push(req.query.employmentType);
    where.push(`j.employment_type = $${params.length}`);
  }
  if (req.query.companyId) {
    params.push(req.query.companyId);
    where.push(`j.company_id = $${params.length}`);
  }

  const geo = parseGeoQuery(req.query);
  const { distanceExpr } = applyGeoFilter(geo, params, where);

  // Distance ordering has no stable cursor, so that mode is a single page.
  const sortByDistance = distanceExpr !== null && req.query.sort === "distance";

  if (cursor && !sortByDistance) {
    params.push(cursor.postedAt, cursor.id);
    where.push(`(j.posted_at, j.id) < ($${params.length - 1}, $${params.length})`);
  }

  params.push(limit + 1);
  const result = await pool.query(
    `SELECT j.*, c.name AS company_name, c.logo_url, co.iso_code AS country_iso, ci.name AS city_name
            ${distanceExpr ? `, ${distanceExpr} AS distance_km` : ""}
     FROM jobs j
     JOIN companies c ON c.id = j.company_id
     LEFT JOIN countries co ON co.id = j.country_id
     LEFT JOIN cities ci ON ci.id = j.city_id
     WHERE ${where.join(" AND ")}
     ORDER BY ${sortByDistance ? "distance_km ASC NULLS LAST, " : ""}j.posted_at DESC NULLS LAST, j.id DESC
     LIMIT $${params.length}`,
    params,
  );

  const rows = result.rows.slice(0, limit);
  const last = rows.at(-1);
  res.json({
    data: rows.map(mapJob),
    pagination: {
      limit,
      nextCursor:
        !sortByDistance && result.rows.length > limit && last
          ? encodeCursor({ postedAt: last.posted_at, id: last.id })
          : null,
      hasMore: result.rows.length > limit,
    },
  });
});

jobsRouter.get("/:id", async (req, res) => {
  const result = await pool.query(
    `SELECT j.*, c.name AS company_name, c.logo_url, co.iso_code AS country_iso, ci.name AS city_name
     FROM jobs j
     JOIN companies c ON c.id = j.company_id
     LEFT JOIN countries co ON co.id = j.country_id
     LEFT JOIN cities ci ON ci.id = j.city_id
     WHERE j.id = $1`,
    [req.params.id],
  );
  if (!result.rows[0]) throw new ApiError(404, "JOB_NOT_FOUND", "Job not found");
  res.json({ ...mapJob(result.rows[0]), descriptionHtml: result.rows[0].description_html, description: result.rows[0].description, skills: [] });
});

jobsRouter.get("/:id/similar", async (req, res) => {
  const current = await pool.query("SELECT company_id, category_id FROM jobs WHERE id = $1", [req.params.id]);
  if (!current.rows[0]) throw new ApiError(404, "JOB_NOT_FOUND", "Job not found");
  const result = await pool.query(
    `SELECT j.*, c.name AS company_name, c.logo_url, co.iso_code AS country_iso, ci.name AS city_name
     FROM jobs j
     JOIN companies c ON c.id = j.company_id
     LEFT JOIN countries co ON co.id = j.country_id
     LEFT JOIN cities ci ON ci.id = j.city_id
     WHERE j.id <> $1 AND j.status = 'active'
       AND (j.company_id = $2 OR ($3::uuid IS NOT NULL AND j.category_id = $3))
     ORDER BY j.posted_at DESC NULLS LAST
     LIMIT 10`,
    [req.params.id, current.rows[0].company_id, current.rows[0].category_id],
  );
  res.json({ data: result.rows.map(mapJob) });
});

jobsRouter.get("/:id/apply", async (req, res) => {
  const result = await pool.query("SELECT id, apply_url, title, status FROM jobs WHERE id = $1", [req.params.id]);
  if (!result.rows[0]) throw new ApiError(404, "JOB_NOT_FOUND", "Job not found");
  res.json({
    id: result.rows[0].id,
    title: result.rows[0].title,
    applyUrl: result.rows[0].apply_url,
    status: result.rows[0].status,
  });
});

