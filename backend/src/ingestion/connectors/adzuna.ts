import { pool } from "../../db/pool.js";
import { fetchJson, isoDate, salaryRange, sleep, text } from "../http.js";
import type { CanonicalJob, ConnectorContext, SourceConnector } from "../types.js";

const PAGE_DELAY_MS = 1_000;
/** Hard server-side cap: requesting 100 still returns 50. */
const RESULTS_PER_PAGE = 50;

/** Every Adzuna country endpoint, so coverage is global by default. */
const DEFAULT_COUNTRIES = [
  "at", "au", "be", "br", "ca", "ch", "de", "es", "fr", "gb",
  "in", "it", "mx", "nl", "nz", "pl", "sg", "us", "za",
];

/**
 * Adzuna caps pagination well before the full catalogue is reachable, and a
 * cursor that ran away would spend the whole quota fetching empty pages.
 */
const MAX_PAGE_BEFORE_RESET = 100;

/**
 * Per-country page cursors, so successive runs walk deeper into the catalogue
 * instead of re-fetching page 1 forever.
 *
 * This is what actually maximises listings under the free tier: the quota is
 * ~1,000 calls/month and a call returns at most 50 jobs, so the ceiling is the
 * number of *distinct* pages fetched, not the frequency of fetching.
 *
 * State lives in source_configs, one row per country — the table already exists
 * for exactly this kind of per-endpoint bookkeeping.
 */
async function loadCursors(countries: string[]): Promise<{ sourceId: string; cursors: Map<string, number> }> {
  await pool.query(
    "INSERT INTO sources (name, type) VALUES ('adzuna', 'ats_api') ON CONFLICT (name) DO NOTHING",
  );
  const source = await pool.query("SELECT id FROM sources WHERE name = 'adzuna'");
  const sourceId = source.rows[0].id as string;

  const existing = await pool.query(
    "SELECT external_ref, metadata FROM source_configs WHERE source_id = $1 AND external_ref = ANY($2::text[])",
    [sourceId, countries],
  );

  const cursors = new Map<string, number>();
  for (const row of existing.rows) {
    const next = Number(row.metadata?.nextPage);
    cursors.set(row.external_ref, Number.isFinite(next) && next > 0 ? next : 1);
  }
  return { sourceId, cursors };
}

async function saveCursor(sourceId: string, country: string, nextPage: number) {
  await pool.query(
    `INSERT INTO source_configs (source_id, external_ref, metadata, is_active)
     VALUES ($1, $2, $3::jsonb, true)
     ON CONFLICT (source_id, external_ref)
     DO UPDATE SET metadata = source_configs.metadata || $3::jsonb, updated_at = now()`,
    [sourceId, country, JSON.stringify({ nextPage })],
  );
}

interface AdzunaJob {
  id?: string | number;
  title?: string;
  description?: string;
  created?: string;
  redirect_url?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  salary_min?: number;
  salary_max?: number;
  contract_time?: string;
  contract_type?: string;
}

/**
 * Adzuna is the highest-value source for the "local jobs, everywhere" goal: it
 * is country-partitioned across 19 countries, carries structured location
 * areas, and is one of the few feeds with real salary figures rather than
 * freeform text.
 *
 * It requires credentials, so the connector stays out of the schedule until
 * ADZUNA_APP_ID and ADZUNA_APP_KEY are set — `requiredEnv` makes that automatic
 * rather than a nightly failure.
 *
 * Budgeting matters here in a way it does not for the free feeds. The free tier
 * allows ~1,000 calls/month and a call returns at most 50 jobs, so each run
 * costs `countries x ADZUNA_MAX_PAGES` calls. The defaults (19 countries, 1
 * page, daily) spend ~570 calls/month and add up to ~950 new jobs a day while
 * the cursor advances. Raising ADZUNA_MAX_PAGES multiplies the spend directly.
 */
export const adzunaConnector: SourceConnector = {
  key: "adzuna",
  displayName: "Adzuna",
  // Daily, not hourly: the monthly quota is the binding constraint, and the
  // cursor means a run covers new ground rather than repeating itself.
  cron: "0 3 * * *",
  requiredEnv: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"],

  async fetch(ctx: ConnectorContext): Promise<CanonicalJob[]> {
    const appId = process.env.ADZUNA_APP_ID!.trim();
    const appKey = process.env.ADZUNA_APP_KEY!.trim();
    const countries = (process.env.ADZUNA_COUNTRIES ?? DEFAULT_COUNTRIES.join(","))
      .split(",")
      .map((code) => code.trim().toLowerCase())
      .filter(Boolean);
    const pagesPerRun = Math.max(1, Number(process.env.ADZUNA_MAX_PAGES ?? 1));

    const { sourceId, cursors } = await loadCursors(countries);
    ctx.log(`${countries.length} countries x ${pagesPerRun} page(s) = ${countries.length * pagesPerRun} API calls this run`);

    const jobs: CanonicalJob[] = [];

    for (const country of countries) {
      const startPage = cursors.get(country) ?? 1;
      let page = startPage;

      for (let fetched = 0; fetched < pagesPerRun; fetched += 1) {
        const url =
          `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}` +
          `?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}` +
          `&results_per_page=${RESULTS_PER_PAGE}&content-type=application/json`;

        const payload = await fetchJson<{ results?: AdzunaJob[] }>(url, ctx.signal);
        const results = Array.isArray(payload?.results) ? payload.results : [];

        // Exhausted this country's pagination — restart from the top next run
        // so refreshed listings are picked up.
        if (results.length === 0) {
          page = 1;
          break;
        }

        for (const job of results) {
          const externalId = text(job.id);
          const title = text(job.title);
          const applyUrl = text(job.redirect_url);
          if (!externalId || !title || !applyUrl) continue;

          const salary = salaryRange(job.salary_min, job.salary_max);
          // `area` is ordered broad -> specific ("UK", "London", "Shoreditch");
          // display_name is already the readable join, so prefer it.
          const area = job.location?.area ?? [];
          const locationRaw = text(job.location?.display_name) || area.slice(-2).reverse().join(", ");

          jobs.push({
            // Adzuna ids are unique per country, not globally.
            externalId: `${country}:${externalId}`,
            title,
            companyName: text(job.company?.display_name) || undefined,
            applyUrl,
            descriptionHtml: text(job.description) || undefined,
            locationRaw: locationRaw || undefined,
            isRemote: /remote|work from home/i.test(`${title} ${locationRaw}`),
            employmentType: text(job.contract_time) || text(job.contract_type) || undefined,
            salaryMin: salary.min,
            salaryMax: salary.max,
            // The API returns salaries in each country's own currency.
            currency: currencyForCountry(country),
            postedAt: isoDate(job.created),
          });
        }

        page += 1;
        if (page > MAX_PAGE_BEFORE_RESET) {
          page = 1;
          break;
        }
        if (fetched < pagesPerRun - 1) await sleep(PAGE_DELAY_MS);
      }

      await saveCursor(sourceId, country, page);
      ctx.log(`${country}: pages ${startPage}..${page - 1 || 1}, cumulative ${jobs.length} postings`);
      await sleep(PAGE_DELAY_MS);
    }

    return jobs;
  },
};

function currencyForCountry(country: string): string | null {
  const currencies: Record<string, string> = {
    us: "USD", gb: "GBP", ca: "CAD", au: "AUD", nz: "NZD", in: "INR",
    za: "ZAR", sg: "SGD", br: "BRL", mx: "MXN", ch: "CHF", pl: "PLN",
    at: "EUR", be: "EUR", de: "EUR", es: "EUR", fr: "EUR", it: "EUR", nl: "EUR",
  };
  return currencies[country] ?? null;
}
