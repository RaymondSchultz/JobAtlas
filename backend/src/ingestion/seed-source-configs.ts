/**
 * Reconstructs ATS board identifiers from the apply_url values of jobs already
 * in the database, validates each against the live ATS API, and seeds
 * source_configs with the ones that check out.
 *
 *   npm run seed:source-configs            report only, writes nothing
 *   npm run seed:source-configs -- --apply insert the validated candidates
 *
 * ATS platforms expose one endpoint per employer (Greenhouse wants a board
 * token, Lever a company slug, Ashby a job-board name), so a connector cannot
 * run until those identifiers exist. This recovers whatever is already implied
 * by ingested data; the rest has to be curated by hand.
 *
 * Every candidate is validated with a real request before being written —
 * an unvalidated token would seed a connector that silently fetches nothing.
 */
import { pool } from "../db/pool.js";

interface Candidate {
  source: string;
  externalRef: string;
  endpointUrl: string;
  jobs: number;
  origin: string;
}

type Extractor = (url: URL) => string | null;

/**
 * Greenhouse apply URLs usually point at the employer's own careers page with a
 * `gh_jid` parameter (https://stripe.com/jobs/search?gh_jid=...) rather than at
 * boards.greenhouse.io, so the board token is not present literally. The
 * registrable domain label is the conventional token and is right often enough
 * to be worth proposing — validation is what makes the guess safe.
 */
const extractors: Record<string, Extractor> = {
  greenhouse: (url) => {
    if (url.hostname.endsWith("greenhouse.io")) {
      const segments = url.pathname.split("/").filter(Boolean);
      const boardIndex = segments.indexOf("boards");
      if (boardIndex >= 0 && segments[boardIndex + 1]) return segments[boardIndex + 1];
      return segments[0] ?? null;
    }
    if (!url.searchParams.has("gh_jid")) return null;
    const label = url.hostname.replace(/^www\./, "").split(".")[0];
    return label && label !== "jobs" ? label : null;
  },

  lever: (url) => (url.hostname.endsWith("lever.co") ? url.pathname.split("/").filter(Boolean)[0] ?? null : null),

  ashby: (url) => (url.hostname.endsWith("ashbyhq.com") ? url.pathname.split("/").filter(Boolean)[0] ?? null : null),

  // A usable Workday reference needs both tenant and site, which only appear on
  // real *.myworkdayjobs.com hosts. Placeholder hosts yield nothing.
  workday: (url) => {
    const match = url.hostname.match(/^([^.]+)\.wd\d+\.myworkdayjobs\.com$/);
    if (!match) return null;
    const site = url.pathname.split("/").filter(Boolean)[0];
    return site ? `${match[1]}/${site}` : null;
  },
};

const endpointFor: Record<string, (ref: string) => string> = {
  greenhouse: (ref) => `https://boards-api.greenhouse.io/v1/boards/${ref}/jobs?content=true`,
  lever: (ref) => `https://api.lever.co/v0/postings/${ref}?mode=json`,
  ashby: (ref) => `https://api.ashbyhq.com/posting-api/job-board/${ref}`,
  workday: (ref) => `https://${ref.split("/")[0]}.wd1.myworkdayjobs.com/wday/cxs/${ref}/jobs`,
};

/** A candidate counts as valid only if the board answers with an actual job array. */
async function validate(source: string, ref: string): Promise<{ ok: boolean; detail: string }> {
  if (source === "workday") {
    return { ok: false, detail: "workday needs a POST with a search payload; not auto-validated" };
  }

  const url = endpointFor[source](ref);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "JobAtlas/1.0 (+https://jobatlas.io)", Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return { ok: false, detail: `HTTP ${response.status}` };

    const body = (await response.json()) as Record<string, unknown>;
    const jobs = Array.isArray(body) ? body : (body.jobs as unknown[]) ?? [];
    if (!Array.isArray(jobs)) return { ok: false, detail: "no job array in response" };
    return { ok: true, detail: `${jobs.length} live postings` };
  } catch (error) {
    return { ok: false, detail: (error as Error).message };
  }
}

async function collectCandidates(): Promise<{ candidates: Candidate[]; unrecoverable: Map<string, number> }> {
  const result = await pool.query(
    `SELECT s.name AS source, j.apply_url
     FROM jobs j
     JOIN sources s ON s.id = j.source_id
     WHERE s.name = ANY($1::text[]) AND j.apply_url IS NOT NULL`,
    [Object.keys(extractors)],
  );

  const grouped = new Map<string, Candidate>();
  const unrecoverable = new Map<string, number>();

  for (const row of result.rows) {
    const extractor = extractors[row.source];
    let ref: string | null = null;
    let origin = "(unparseable)";

    try {
      const url = new URL(row.apply_url);
      origin = url.hostname;
      ref = extractor(url);
    } catch {
      ref = null;
    }

    if (!ref) {
      const key = `${row.source} @ ${origin}`;
      unrecoverable.set(key, (unrecoverable.get(key) ?? 0) + 1);
      continue;
    }

    const key = `${row.source}:${ref}`;
    const existing = grouped.get(key);
    if (existing) existing.jobs += 1;
    else grouped.set(key, { source: row.source, externalRef: ref, endpointUrl: endpointFor[row.source](ref), jobs: 1, origin });
  }

  return { candidates: [...grouped.values()].sort((a, b) => b.jobs - a.jobs), unrecoverable };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { candidates, unrecoverable } = await collectCandidates();

  if (candidates.length === 0) {
    console.log("No board identifiers could be recovered from existing apply_url values.");
    return;
  }

  console.log(`Found ${candidates.length} candidate board identifier(s). Validating against live APIs...\n`);

  const validated: Candidate[] = [];
  for (const candidate of candidates) {
    const { ok, detail } = await validate(candidate.source, candidate.externalRef);
    const mark = ok ? "OK    " : "REJECT";
    console.log(`  ${mark} ${candidate.source}/${candidate.externalRef}  (${candidate.jobs} jobs, from ${candidate.origin})  -> ${detail}`);
    if (ok) validated.push(candidate);
  }

  if (unrecoverable.size > 0) {
    console.log("\nNot recoverable from apply_url:");
    for (const [key, count] of [...unrecoverable.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(4)} jobs  ${key}`);
    }
  }

  if (!apply) {
    console.log(`\n${validated.length} candidate(s) would be written. Re-run with --apply to insert.`);
    return;
  }

  let written = 0;
  for (const candidate of validated) {
    const source = await pool.query("SELECT id FROM sources WHERE name = $1", [candidate.source]);
    if (!source.rows[0]) {
      console.log(`  skipped ${candidate.source}/${candidate.externalRef} — no sources row`);
      continue;
    }

    await pool.query(
      `INSERT INTO source_configs (source_id, external_ref, endpoint_url, metadata, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (source_id, external_ref) DO UPDATE
         SET endpoint_url = EXCLUDED.endpoint_url, is_active = true, updated_at = now()`,
      [
        source.rows[0].id,
        candidate.externalRef,
        candidate.endpointUrl,
        JSON.stringify({ seededFrom: "apply_url backfill", jobsAtSeedTime: candidate.jobs }),
      ],
    );
    written += 1;
  }

  console.log(`\nWrote ${written} source_configs row(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
