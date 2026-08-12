import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { parseLimit } from "../utils/pagination.js";

export const locationsRouter = Router();

/**
 * City/country autocomplete.
 *
 * Radius search needs coordinates, and a user types a place name. Without this
 * the client would have to carry its own gazetteer or call an external
 * geocoder, so the lookup is served from the same data the resolver uses —
 * which also guarantees the coordinates agree with what jobs were matched
 * against.
 */
locationsRouter.get("/search", async (req, res) => {
  const parsed = z
    .object({
      q: z.string().trim().min(1).max(120),
      country: z.string().trim().length(2).optional(),
      // Restricts results to places that actually have postings.
      withJobs: z.enum(["true", "false"]).optional(),
    })
    .safeParse(req.query);

  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid location query", parsed.error.flatten());
  }

  const { q, country, withJobs } = parsed.data;
  const limit = parseLimit(req.query.limit, 10, 25);
  const params: unknown[] = [q.toLowerCase(), `${q.toLowerCase()}%`];
  const where = [`(lower(ci.name) LIKE $2 OR ci.alternate_names @> ARRAY[$1]::text[])`];

  if (country) {
    params.push(country.toUpperCase());
    where.push(`co.iso_code = $${params.length}`);
  }
  if (withJobs === "true") {
    where.push(`EXISTS (SELECT 1 FROM jobs j WHERE j.city_id = ci.id AND j.status = 'active')`);
  }

  params.push(limit);
  const result = await pool.query(
    `SELECT ci.id, ci.name, ci.admin1_code, ci.latitude, ci.longitude, ci.population,
            co.iso_code AS country_code, co.name AS country_name,
            (SELECT COUNT(*)::int FROM jobs j WHERE j.city_id = ci.id AND j.status = 'active') AS job_count
     FROM cities ci
     JOIN countries co ON co.id = ci.country_id
     WHERE ${where.join(" AND ")}
     ORDER BY (lower(ci.name) = $1) DESC, ci.population DESC
     LIMIT $${params.length}`,
    params,
  );

  res.json({
    data: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      region: row.admin1_code,
      country: { code: row.country_code, name: row.country_name },
      // Feed these straight back into /jobs?lat=&lng=&radiusKm=
      lat: row.latitude === null ? null : Number(row.latitude),
      lng: row.longitude === null ? null : Number(row.longitude),
      population: row.population,
      jobCount: row.job_count,
    })),
  });
});

/** Countries that currently have active postings, for a filter menu. */
locationsRouter.get("/countries", async (_req, res) => {
  const result = await pool.query(
    `SELECT co.id, co.name, co.iso_code AS code, COUNT(j.id)::int AS job_count
     FROM countries co
     JOIN jobs j ON j.country_id = co.id AND j.status = 'active'
     GROUP BY co.id, co.name, co.iso_code
     ORDER BY job_count DESC, co.name ASC`,
  );
  res.json({ data: result.rows });
});

/** Cities that currently have active postings, optionally scoped to a country. */
locationsRouter.get("/cities", async (req, res) => {
  const country = typeof req.query.country === "string" ? req.query.country.toUpperCase() : null;
  const limit = parseLimit(req.query.limit, 50, 200);

  const params: unknown[] = [];
  const where = ["j.status = 'active'", "j.city_id IS NOT NULL"];
  if (country) {
    params.push(country);
    where.push(`co.iso_code = $${params.length}`);
  }

  params.push(limit);
  const result = await pool.query(
    `SELECT ci.id, ci.name, ci.admin1_code AS region, ci.latitude, ci.longitude,
            co.iso_code AS country_code, COUNT(j.id)::int AS job_count
     FROM jobs j
     JOIN cities ci ON ci.id = j.city_id
     JOIN countries co ON co.id = ci.country_id
     WHERE ${where.join(" AND ")}
     GROUP BY ci.id, ci.name, ci.admin1_code, ci.latitude, ci.longitude, co.iso_code
     ORDER BY job_count DESC, ci.name ASC
     LIMIT $${params.length}`,
    params,
  );

  res.json({
    data: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      region: row.region,
      country: row.country_code,
      lat: row.latitude === null ? null : Number(row.latitude),
      lng: row.longitude === null ? null : Number(row.longitude),
      jobCount: row.job_count,
    })),
  });
});
