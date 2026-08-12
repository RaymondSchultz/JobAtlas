import { fetchJson, isoDate, sleep, text } from "../http.js";
import type { CanonicalJob, ConnectorContext, SourceConnector } from "../types.js";

const API_URL = "https://www.themuse.com/api/public/jobs";
const PAGE_DELAY_MS = 1_000;

interface MuseJob {
  id?: number | string;
  name?: string;
  contents?: string;
  publication_date?: string;
  company?: { name?: string };
  locations?: { name?: string }[];
  refs?: { landing_page?: string };
}

/**
 * The Muse is the first source here that is not a remote-work board: sampling
 * returned 20 of 20 postings tied to a physical city (Burbank CA, Seattle WA,
 * Frisco TX). That is the local hiring the remote aggregators structurally
 * cannot supply.
 *
 * The catalogue is ~407k jobs over ~20k pages, so a run takes the freshest N
 * pages rather than the whole thing. Raise THEMUSE_MAX_PAGES to backfill deeper;
 * upserts make repeated overlap harmless.
 *
 * No key is required, but the unauthenticated endpoint is rate limited, hence
 * the delay between pages.
 */
export const theMuseConnector: SourceConnector = {
  key: "themuse",
  displayName: "The Muse",
  cron: "*/30 * * * *",

  async fetch(ctx: ConnectorContext): Promise<CanonicalJob[]> {
    const maxPages = Math.max(1, Number(process.env.THEMUSE_MAX_PAGES ?? 10));
    const jobs: CanonicalJob[] = [];

    for (let page = 1; page <= maxPages; page += 1) {
      const payload = await fetchJson<{ results?: MuseJob[]; page_count?: number }>(
        `${API_URL}?page=${page}`,
        ctx.signal,
      );
      const results = Array.isArray(payload?.results) ? payload.results : [];
      if (results.length === 0) break;

      for (const job of results) {
        const externalId = text(job.id);
        const title = text(job.name);
        const applyUrl = text(job.refs?.landing_page);
        if (!externalId || !title || !applyUrl) continue;

        const locations = (job.locations ?? []).map((location) => text(location.name)).filter(Boolean);
        // "Flexible / Remote" is how The Muse marks remote rather than a flag.
        const isRemote = locations.some((location) => /flexible|remote/i.test(location));
        const physical = locations.find((location) => !/flexible|remote/i.test(location));

        jobs.push({
          externalId,
          title,
          companyName: text(job.company?.name) || undefined,
          applyUrl,
          descriptionHtml: text(job.contents) || undefined,
          // Prefer a real city over the remote marker when a job lists both.
          locationRaw: physical || locations[0] || undefined,
          isRemote,
          postedAt: isoDate(job.publication_date),
        });
      }

      if (page < maxPages) await sleep(PAGE_DELAY_MS);
    }

    ctx.log(`fetched ${jobs.length} postings across up to ${maxPages} page(s)`);
    return jobs;
  },
};
