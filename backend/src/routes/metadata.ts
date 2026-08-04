import { Router } from "express";
import { pool } from "../db/pool.js";

export const metadataRouter = Router();

metadataRouter.get("/filters", async (_req, res) => {
  const [countries, employmentTypes, categories] = await Promise.all([
    pool.query(
      `SELECT co.iso_code AS code, COUNT(j.id)::int AS count
       FROM countries co
       JOIN jobs j ON j.country_id = co.id AND j.status = 'active'
       GROUP BY co.iso_code
       ORDER BY count DESC`,
    ),
    pool.query(
      `SELECT employment_type AS value, COUNT(*)::int AS count
       FROM jobs
       WHERE status = 'active'
       GROUP BY employment_type
       ORDER BY count DESC`,
    ),
    pool.query(
      `SELECT ca.slug, ca.name, COUNT(j.id)::int AS count
       FROM categories ca
       LEFT JOIN jobs j ON j.category_id = ca.id AND j.status = 'active'
       GROUP BY ca.id
       ORDER BY ca.name ASC`,
    ),
  ]);

  res.json({ countries: countries.rows, employmentTypes: employmentTypes.rows, categories: categories.rows });
});

metadataRouter.get("/categories", async (_req, res) => {
  const result = await pool.query("SELECT id, name, slug, parent_id AS \"parentId\" FROM categories ORDER BY name ASC");
  res.json({ data: result.rows });
});

metadataRouter.get("/skills", async (_req, res) => {
  const result = await pool.query("SELECT id, name, slug FROM skills ORDER BY name ASC");
  res.json({ data: result.rows });
});
