import { fetchJson, isoDate, salaryRange, sleep, text } from "../http.js";
import type { CanonicalJob, ConnectorContext, SourceConnector } from "../types.js";

const PAGE_DELAY_MS = 1_000;
const RESULTS_PER_PAGE = 50;

/** Adzuna partitions by country; every request names one. */
const DEFAULT_COUNTRIES = ["us", "gb"];

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
 * is country-partitioned, carries structured location areas, and is one of the
 * few feeds with real salary figures rather than freeform text.
 *
 * It requires credentials (free tier), so the connector stays out of the
 * schedule until ADZUNA_APP_ID and ADZUNA_APP_KEY are set — `requiredEnv` makes
 * that automatic rather than a nightly failure.
 *
 * Configure coverage with ADZUNA_COUNTRIES (comma separated, default "us,gb").
 * Supported: at, au, be, br, ca, ch, de, es, fr, gb, in, it, mx, nl, nz, pl,
 * sg, us, za.
 */
export const adzunaConnector: SourceConnector = {
  key: "adzuna",
  displayName: "Adzuna",
  cron: "0 */2 * * *",
  requiredEnv: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"],

  async fetch(ctx: ConnectorContext): Promise<CanonicalJob[]> {
    const appId = process.env.ADZUNA_APP_ID!.trim();
    const appKey = process.env.ADZUNA_APP_KEY!.trim();
    const countries = (process.env.ADZUNA_COUNTRIES ?? DEFAULT_COUNTRIES.join(","))
      .split(",")
      .map((code) => code.trim().toLowerCase())
      .filter(Boolean);
    const maxPages = Math.max(1, Number(process.env.ADZUNA_MAX_PAGES ?? 3));

    const jobs: CanonicalJob[] = [];

    for (const country of countries) {
      for (let page = 1; page <= maxPages; page += 1) {
        const url =
          `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}` +
          `?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}` +
          `&results_per_page=${RESULTS_PER_PAGE}&content-type=application/json`;

        const payload = await fetchJson<{ results?: AdzunaJob[] }>(url, ctx.signal);
        const results = Array.isArray(payload?.results) ? payload.results : [];
        if (results.length === 0) break;

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

        if (page < maxPages) await sleep(PAGE_DELAY_MS);
      }

      ctx.log(`${country}: cumulative ${jobs.length} postings`);
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
