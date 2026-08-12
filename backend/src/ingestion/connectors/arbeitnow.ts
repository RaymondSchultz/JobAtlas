import { fetchJson, isoDateFromEpoch, sleep, text } from "../http.js";
import type { CanonicalJob, ConnectorContext, SourceConnector } from "../types.js";

const API_URL = "https://www.arbeitnow.com/api/job-board-api";
const PAGE_DELAY_MS = 1_000;

interface ArbeitnowJob {
  slug?: string;
  title?: string;
  company_name?: string;
  description?: string;
  location?: string;
  remote?: boolean;
  job_types?: string[];
  created_at?: number;
}

/**
 * Arbeitnow covers German and wider EU hiring, and is overwhelmingly local:
 * 164 of 176 sampled postings were tied to a city (Berlin, Köln, Munich,
 * Dortmund) rather than remote. It balances The Muse's US bias.
 *
 * Their terms ask for a link back to arbeitnow.com, which `applyUrl` satisfies —
 * the record's own `url` field points at the employer's site, not the posting,
 * so it is deliberately not used as the apply target.
 */
export const arbeitnowConnector: SourceConnector = {
  key: "arbeitnow",
  displayName: "Arbeitnow",
  cron: "*/30 * * * *",

  async fetch(ctx: ConnectorContext): Promise<CanonicalJob[]> {
    const maxPages = Math.max(1, Number(process.env.ARBEITNOW_MAX_PAGES ?? 3));
    const jobs: CanonicalJob[] = [];

    for (let page = 1; page <= maxPages; page += 1) {
      const payload = await fetchJson<{ data?: ArbeitnowJob[] }>(`${API_URL}?page=${page}`, ctx.signal);
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      if (rows.length === 0) break;

      for (const job of rows) {
        const slug = text(job.slug);
        const title = text(job.title);
        if (!slug || !title) continue;

        jobs.push({
          externalId: slug,
          title,
          companyName: text(job.company_name) || undefined,
          applyUrl: `https://www.arbeitnow.com/jobs/${slug}`,
          descriptionHtml: text(job.description) || undefined,
          locationRaw: text(job.location) || undefined,
          isRemote: job.remote === true,
          // Values like "Full-time"; the normalizer folds the dash.
          employmentType: text(job.job_types?.[0]) || undefined,
          postedAt: isoDateFromEpoch(job.created_at),
        });
      }

      if (page < maxPages) await sleep(PAGE_DELAY_MS);
    }

    ctx.log(`fetched ${jobs.length} postings across up to ${maxPages} page(s)`);
    return jobs;
  },
};
