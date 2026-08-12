import { fetchJson, isoDate, text } from "../http.js";
import type { CanonicalJob, ConnectorContext, SourceConnector } from "../types.js";

const API_URL = "https://remotive.com/api/remote-jobs";

interface RemotiveJob {
  id?: number | string;
  url?: string;
  title?: string;
  company_name?: string;
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  description?: string;
}

/**
 * Remotive's API terms require linking back to the Remotive URL and crediting
 * Remotive as the source, so `applyUrl` must stay pointed at their listing.
 * Postings are also delayed 24h upstream by design.
 *
 * The response wraps the array in `{ jobs: [...] }` alongside two banner keys
 * ("00-warning", "0-legal-notice") that are not jobs.
 */
export const remotiveConnector: SourceConnector = {
  key: "remotive",
  displayName: "Remotive",
  cron: "*/15 * * * *",

  async fetch(ctx: ConnectorContext): Promise<CanonicalJob[]> {
    const payload = await fetchJson<{ jobs?: RemotiveJob[] }>(API_URL, ctx.signal);
    const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
    ctx.log(`fetched ${jobs.length} postings`);

    return jobs.flatMap((job) => {
      const externalId = text(job.id);
      const title = text(job.title);
      const applyUrl = text(job.url);
      if (!externalId || !title || !applyUrl) return [];

      return [{
        externalId,
        title,
        companyName: text(job.company_name) || undefined,
        applyUrl,
        descriptionHtml: text(job.description) || undefined,
        locationRaw: text(job.candidate_required_location) || undefined,
        isRemote: true,
        employmentType: text(job.job_type) || undefined,
        // `salary` is a freeform string ("OTE $25k - $35k"); parsing it reliably
        // is a separate job, so the numeric columns stay null.
        salaryMin: null,
        salaryMax: null,
        postedAt: isoDate(job.publication_date),
      }];
    });
  },
};
