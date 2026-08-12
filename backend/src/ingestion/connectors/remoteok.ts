import { fetchJson, isoDate, salaryRange, text } from "../http.js";
import type { CanonicalJob, ConnectorContext, SourceConnector } from "../types.js";

const API_URL = "https://remoteok.com/api";

const EMPLOYMENT_TAGS = new Set(["full time", "part time", "contract", "internship", "temporary"]);

interface RemoteOkJob {
  id?: string | number;
  position?: string;
  company?: string;
  url?: string;
  apply_url?: string;
  description?: string;
  location?: string;
  tags?: string[];
  salary_min?: number;
  salary_max?: number;
  date?: string;
}

/**
 * RemoteOK's terms require a followed link back and crediting Remote OK.
 *
 * The response is a bare array whose first element is a legal notice object
 * ({ last_updated, legal }) rather than a job — hence the id/position guard
 * instead of a positional slice, which would break if they reorder.
 */
export const remoteOkConnector: SourceConnector = {
  key: "remoteok",
  displayName: "RemoteOK",
  cron: "*/15 * * * *",

  async fetch(ctx: ConnectorContext): Promise<CanonicalJob[]> {
    const payload = await fetchJson<RemoteOkJob[]>(API_URL, ctx.signal);
    const rows = Array.isArray(payload) ? payload : [];
    ctx.log(`fetched ${rows.length} rows (including the legal-notice entry)`);

    return rows.flatMap((job) => {
      const externalId = text(job.id);
      const title = text(job.position);
      const applyUrl = text(job.url) || text(job.apply_url);
      if (!externalId || !title || !applyUrl) return [];

      const employmentTag = (job.tags ?? []).find((tag) => EMPLOYMENT_TAGS.has(text(tag).toLowerCase()));
      const salary = salaryRange(job.salary_min, job.salary_max);

      return [{
        externalId,
        title,
        companyName: text(job.company) || undefined,
        applyUrl,
        descriptionHtml: text(job.description) || undefined,
        // Locations arrive with a trailing separator, e.g. "Brisbane, ".
        locationRaw: text(job.location).replace(/[,\s]+$/, "") || undefined,
        isRemote: true,
        employmentType: employmentTag,
        salaryMin: salary.min,
        salaryMax: salary.max,
        postedAt: isoDate(job.date),
      }];
    });
  },
};
