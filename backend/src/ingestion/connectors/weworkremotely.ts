import { XMLParser } from "fast-xml-parser";
import { asArray, fetchText, isoDate, text } from "../http.js";
import type { CanonicalJob, ConnectorContext, SourceConnector } from "../types.js";

const FEED_URL = "https://weworkremotely.com/remote-jobs.rss";

interface WwrItem {
  title?: string;
  link?: string;
  guid?: string;
  pubDate?: string;
  region?: string;
  country?: string;
  state?: string;
  category?: string;
  type?: string;
  description?: string;
}

const parser = new XMLParser({
  ignoreAttributes: true,
  // Titles like "37signals" and empty <country/> must stay strings.
  parseTagValue: false,
  trimValues: true,
  processEntities: {
    enabled: true,
    // Each <description> is HTML escaped into &lt;/&gt;/&amp;, so a normal
    // 100-item feed blows past the 1000-expansion default many times over.
    maxTotalExpansions: 500_000,
    maxExpandedLength: 20_000_000,
    // Left tight on purpose: this caps DTD-declared entities, which is the
    // actual billion-laughs vector. Predefined escapes do not count here.
    maxEntityCount: 100,
  },
});

/**
 * We Work Remotely has no JSON API — the `/api/v1/posts` endpoint the old n8n
 * workflow used returns 404. The RSS feed is the supported surface.
 *
 * Item titles fuse company and role as "Company: Job Title", so they are split
 * on the first colon; entries without one fall back to the source-level company
 * name that `normalizeJob` derives.
 */
export const weWorkRemotelyConnector: SourceConnector = {
  key: "weworkremotely",
  displayName: "We Work Remotely",
  cron: "*/20 * * * *",

  async fetch(ctx: ConnectorContext): Promise<CanonicalJob[]> {
    const xml = await fetchText(FEED_URL, ctx.signal);
    const parsed = parser.parse(xml) as { rss?: { channel?: { item?: WwrItem | WwrItem[] } } };
    const items = asArray(parsed?.rss?.channel?.item);
    ctx.log(`fetched ${items.length} feed items`);

    return items.flatMap((item) => {
      const rawTitle = text(item.title);
      const applyUrl = text(item.link) || text(item.guid);
      // guid is the canonical listing URL and is stable across feed refreshes.
      const externalId = text(item.guid) || applyUrl;
      if (!rawTitle || !applyUrl || !externalId) return [];

      const separator = rawTitle.indexOf(":");
      const companyName = separator > 0 ? rawTitle.slice(0, separator).trim() : "";
      const title = separator > 0 ? rawTitle.slice(separator + 1).trim() : rawTitle;
      if (!title) return [];

      return [{
        externalId,
        title,
        companyName: companyName || undefined,
        applyUrl,
        descriptionHtml: text(item.description) || undefined,
        locationRaw: text(item.region) || text(item.state) || text(item.country) || undefined,
        isRemote: true,
        // Feed uses "Full-Time" / "Part-Time"; the normalizer folds the dash.
        employmentType: text(item.type) || undefined,
        postedAt: isoDate(item.pubDate),
      }];
    });
  },
};
