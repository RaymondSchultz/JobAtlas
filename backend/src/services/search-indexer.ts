import { Meilisearch } from "meilisearch";
import { config } from "../config.js";
import { pool } from "../db/pool.js";

export interface MeiliJobDocument {
  id: string;
  title: string;
  description: string;
  companyId: string;
  companyName: string;
  companyLogoUrl: string | null;
  locationRaw: string | null;
  isRemote: boolean;
  countryIso: string | null;
  cityName: string | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  postedAt: string | null;
  postedAtTimestamp: number;
  applyUrl: string;
  status: string;
}

let client: Meilisearch | null = null;
const INDEX_NAME = "jobs";

export function getMeiliClient(): Meilisearch | null {
  if (client) return client;
  if (!config.meilisearchUrl) return null;

  try {
    client = new Meilisearch({
      host: config.meilisearchUrl,
      apiKey: config.meiliMasterKey || undefined,
    });
    return client;
  } catch (error) {
    console.warn("Failed to initialize Meilisearch client:", error);
    return null;
  }
}

export async function ensureMeiliIndex() {
  const meili = getMeiliClient();
  if (!meili) return;

  try {
    const index = meili.index(INDEX_NAME);
    await index.updateSettings({
      searchableAttributes: ["title", "description", "companyName", "locationRaw"],
      filterableAttributes: ["status", "isRemote", "employmentType", "companyId", "countryIso", "cityName"],
      sortableAttributes: ["postedAtTimestamp", "salaryMin", "salaryMax"],
    });
  } catch (error) {
    console.warn("Meilisearch setup warning:", error);
  }
}

export async function indexJobsInMeili(jobIds: string[]) {
  const meili = getMeiliClient();
  if (!meili || jobIds.length === 0) return;

  try {
    const result = await pool.query(
      `SELECT j.id, j.title, j.description, j.company_id, j.location_raw, j.is_remote,
              j.employment_type, j.salary_min, j.salary_max, j.currency, j.posted_at,
              j.apply_url, j.status,
              c.name AS company_name, c.logo_url AS company_logo_url,
              co.iso_code AS country_iso, ci.name AS city_name
       FROM jobs j
       JOIN companies c ON c.id = j.company_id
       LEFT JOIN countries co ON co.id = j.country_id
       LEFT JOIN cities ci ON ci.id = j.city_id
       WHERE j.id = ANY($1::uuid[])`,
      [jobIds],
    );

    const documents: MeiliJobDocument[] = result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description || "",
      companyId: row.company_id,
      companyName: row.company_name,
      companyLogoUrl: row.company_logo_url,
      locationRaw: row.location_raw,
      isRemote: Boolean(row.is_remote),
      countryIso: row.country_iso,
      cityName: row.city_name,
      employmentType: row.employment_type,
      salaryMin: row.salary_min !== null ? Number(row.salary_min) : null,
      salaryMax: row.salary_max !== null ? Number(row.salary_max) : null,
      currency: row.currency,
      postedAt: row.posted_at ? new Date(row.posted_at).toISOString() : null,
      postedAtTimestamp: row.posted_at ? new Date(row.posted_at).getTime() : 0,
      applyUrl: row.apply_url,
      status: row.status,
    }));

    if (documents.length > 0) {
      await meili.index(INDEX_NAME).addDocuments(documents);
    }
  } catch (error) {
    console.error("Failed to index jobs in Meilisearch:", error);
  }
}
