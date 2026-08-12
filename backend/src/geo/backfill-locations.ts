/**
 * Resolves location_raw into country_id/city_id for jobs already in the table.
 *
 *   npm run backfill:locations             report hit rate, write nothing
 *   npm run backfill:locations -- --apply  write the resolved ids
 *
 * Report mode exists because the interesting output is the miss list: it names
 * exactly which string formats the resolver does not yet handle, which is the
 * only reliable guide to what to improve next.
 */
import { pool } from "../db/pool.js";
import { resolveLocations } from "./location-resolver.js";

const BATCH = 500;

async function main() {
  const apply = process.argv.includes("--apply");

  const jobs = await pool.query("SELECT id, location_raw FROM jobs");
  console.log(`Resolving ${jobs.rowCount} jobs...\n`);

  const resolutions = await resolveLocations(pool, jobs.rows.map((row) => row.location_raw));

  const updates: { id: string; countryId: string | null; cityId: string | null }[] = [];
  const counts = { city: 0, country: 0, none: 0, blank: 0 };
  const misses = new Map<string, number>();

  for (const [i, row] of jobs.rows.entries()) {
    if (!row.location_raw?.trim()) {
      counts.blank += 1;
      continue;
    }

    const resolved = resolutions[i];
    counts[resolved.confidence] += 1;

    if (resolved.confidence === "none") {
      const key = String(row.location_raw).slice(0, 60);
      misses.set(key, (misses.get(key) ?? 0) + 1);
      continue;
    }

    updates.push({ id: row.id, countryId: resolved.countryId, cityId: resolved.cityId });
  }

  const withLocation = jobs.rowCount! - counts.blank;
  const resolvedCount = counts.city + counts.country;
  const pct = (n: number) => (withLocation > 0 ? ((n / withLocation) * 100).toFixed(1) : "0.0");

  console.log("RESULTS (of jobs that have a location string):");
  console.log(`  city + country : ${counts.city} (${pct(counts.city)}%)`);
  console.log(`  country only   : ${counts.country} (${pct(counts.country)}%)`);
  console.log(`  unresolved     : ${counts.none} (${pct(counts.none)}%)`);
  console.log(`  ---`);
  console.log(`  total resolved : ${resolvedCount}/${withLocation} (${pct(resolvedCount)}%)`);
  console.log(`  no location str: ${counts.blank}`);

  if (misses.size > 0) {
    console.log("\nTOP UNRESOLVED STRINGS:");
    for (const [value, count] of [...misses.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
      console.log(`  ${String(count).padStart(4)}  ${JSON.stringify(value)}`);
    }
  }

  if (!apply) {
    console.log(`\n${updates.length} rows would be updated. Re-run with --apply to write.`);
    return;
  }

  for (let i = 0; i < updates.length; i += BATCH) {
    const slice = updates.slice(i, i + BATCH);
    await pool.query(
      `UPDATE jobs SET country_id = u.country_id, city_id = u.city_id, updated_at = now()
       FROM UNNEST($1::uuid[], $2::uuid[], $3::uuid[]) AS u(id, country_id, city_id)
       WHERE jobs.id = u.id`,
      [slice.map((u) => u.id), slice.map((u) => u.countryId), slice.map((u) => u.cityId)],
    );
  }

  console.log(`\nUpdated ${updates.length} jobs.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
