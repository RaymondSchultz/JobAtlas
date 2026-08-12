/**
 * Seeds the countries and cities gazetteer from GeoNames.
 *
 *   npm run seed:geo                 cities with population >= 15000 (~26k rows)
 *   npm run seed:geo -- --size 1000  population >= 1000 (~150k rows, slower)
 *   npm run seed:geo -- --size 5000
 *
 * GeoNames data is CC BY 4.0; attribution is required wherever this data is
 * surfaced to users.
 *
 * Cities carry population and admin1 (state/province) because the resolver
 * needs both: population to decide that a bare "London" means London GB rather
 * than London, Ontario, and admin1 to resolve "New York, NY" at all.
 */
import { unzipSync } from "fflate";
import { pool } from "../db/pool.js";

const GEONAMES = "https://download.geonames.org/export/dump";
const BATCH = 1000;

interface CityRow {
  geonamesId: number;
  name: string;
  countryCode: string;
  admin1: string;
  latitude: number;
  longitude: number;
  population: number;
  alternateNames: string[];
}

/**
 * alternatenames carries up to ~100 entries per city across every language, so
 * it has to be filtered. Order is alphabetical and therefore meaningless —
 * truncating it drops "New York" from New York City in favour of "Aebura" and
 * "Cathair Nua-Eabhrac". Entries are scored instead, favouring the forms a job
 * feed would plausibly use.
 */
function usefulAlternateNames(raw: string, canonical: string): string[] {
  if (!raw) return [];

  const canonicalLower = canonical.toLowerCase();
  const canonicalTokens = new Set(canonicalLower.split(/\s+/).filter(Boolean));
  const scored: { name: string; score: number }[] = [];
  const seen = new Set<string>();

  for (const candidate of raw.split(",")) {
    const name = candidate.trim();
    // Two-character forms collide with country and region codes.
    if (name.length < 3 || name.length > 60) continue;
    if (!/^[\p{Script=Latin}\p{M}0-9 .'\-]+$/u.test(name)) continue;

    // Stored lowercased: aliases exist only for matching (display always uses
    // the canonical name), and this lets the GIN index serve lookups directly.
    const lower = name.toLowerCase();
    if (lower === canonicalLower || seen.has(lower)) continue;
    seen.add(lower);

    const tokens = lower.split(/\s+/).filter(Boolean);
    let score = 0;
    // A shortening of the canonical name ("New York" of "New York City") is
    // overwhelmingly the form feeds use.
    if (tokens.every((token) => canonicalTokens.has(token))) score += 100;
    // An expansion ("City of New York") is the next most likely.
    else if ([...canonicalTokens].every((token) => tokens.includes(token))) score += 60;
    // Plain ASCII beats transliterations carrying diacritics.
    if (/^[\x20-\x7e]+$/.test(name)) score += 20;
    score -= name.length / 10;

    scored.push({ name, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((entry) => entry.name.toLowerCase());
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!response.ok) throw new Error(`GET ${url} responded ${response.status}`);
  return response.text();
}

async function fetchZipEntry(url: string, entry: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(600_000) });
  if (!response.ok) throw new Error(`GET ${url} responded ${response.status}`);

  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const file = archive[entry];
  if (!file) throw new Error(`${entry} not found in ${url} (has: ${Object.keys(archive).join(", ")})`);
  return new TextDecoder("utf-8").decode(file);
}

/** countryInfo.txt: ISO, ISO3, ISO-numeric, fips, Country, ... (# comments) */
async function seedCountries(): Promise<Map<string, string>> {
  const text = await fetchText(`${GEONAMES}/countryInfo.txt`);
  const rows = text
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => line.split("\t"))
    .filter((cols) => cols[0]?.length === 2 && cols[4])
    .map((cols) => ({ iso: cols[0].trim(), name: cols[4].trim() }));

  console.log(`countries: ${rows.length} parsed`);

  // Both name and iso_code are UNIQUE, so a name collision against a
  // differently-coded row must not abort the batch.
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    await pool.query(
      `INSERT INTO countries (iso_code, name)
       SELECT u.iso, u.name FROM UNNEST($1::text[], $2::text[]) AS u(iso, name)
       ON CONFLICT (iso_code) DO UPDATE SET name = EXCLUDED.name`,
      [slice.map((r) => r.iso), slice.map((r) => r.name)],
    );
  }

  const stored = await pool.query("SELECT id, iso_code FROM countries");
  const byIso = new Map<string, string>();
  for (const row of stored.rows) byIso.set(row.iso_code, row.id);
  console.log(`countries: ${byIso.size} in database`);
  return byIso;
}

/**
 * cities{N}.txt columns (tab separated, no header):
 * 0 geonameid, 1 name, 2 asciiname, 3 alternatenames, 4 lat, 5 lng,
 * 6 feature class, 7 feature code, 8 country code, 9 cc2, 10 admin1 ... 14 population
 */
function parseCities(text: string): CityRow[] {
  const cities: CityRow[] = [];

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const c = line.split("\t");
    const lat = Number(c[4]);
    const lng = Number(c[5]);
    if (!c[0] || !c[1] || !c[8] || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    cities.push({
      geonamesId: Number(c[0]),
      name: c[1].trim(),
      countryCode: c[8].trim(),
      admin1: (c[10] ?? "").trim(),
      latitude: lat,
      longitude: lng,
      population: Number(c[14]) || 0,
      alternateNames: usefulAlternateNames(c[3] ?? "", c[1].trim()),
    });
  }

  return cities;
}

async function seedCities(size: number, countryByIso: Map<string, string>) {
  const text = await fetchZipEntry(`${GEONAMES}/cities${size}.zip`, `cities${size}.txt`);
  const cities = parseCities(text);
  console.log(`cities: ${cities.length} parsed from cities${size}.txt`);

  // The unique index keys on (country_id, lower(name), admin1). Duplicates
  // within one batch would make the upsert fail with "cannot affect row a
  // second time", so collapse them here, keeping the largest by population.
  const deduped = new Map<string, CityRow>();
  let skippedNoCountry = 0;

  for (const city of cities) {
    if (!countryByIso.has(city.countryCode)) {
      skippedNoCountry += 1;
      continue;
    }
    const key = `${city.countryCode}|${city.name.toLowerCase()}|${city.admin1}`;
    const existing = deduped.get(key);
    if (!existing || city.population > existing.population) deduped.set(key, city);
  }

  const rows = [...deduped.values()];
  console.log(`cities: ${rows.length} after dedupe (${skippedNoCountry} skipped for unknown country)`);

  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    await pool.query(
      `INSERT INTO cities (country_id, name, admin1_code, latitude, longitude, population, geonames_id, alternate_names)
       SELECT u.country_id, u.name, NULLIF(u.admin1, ''), u.lat, u.lng, u.population, u.geonames_id,
              COALESCE(string_to_array(NULLIF(u.alternates, ''), '|'), '{}')
       FROM UNNEST($1::uuid[], $2::text[], $3::text[], $4::numeric[], $5::numeric[], $6::int[], $7::int[], $8::text[])
         AS u(country_id, name, admin1, lat, lng, population, geonames_id, alternates)
       ON CONFLICT (country_id, lower(name), coalesce(admin1_code, ''))
       DO UPDATE SET
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         population = EXCLUDED.population,
         geonames_id = EXCLUDED.geonames_id,
         alternate_names = EXCLUDED.alternate_names`,
      [
        slice.map((c) => countryByIso.get(c.countryCode)!),
        slice.map((c) => c.name),
        slice.map((c) => c.admin1),
        slice.map((c) => c.latitude),
        slice.map((c) => c.longitude),
        slice.map((c) => c.population),
        slice.map((c) => c.geonamesId),
        // Joined with "|" because alternate names themselves contain commas.
        slice.map((c) => c.alternateNames.join("|")),
      ],
    );
    written += slice.length;
    if (written % 20_000 === 0 || written === rows.length) console.log(`  ...${written}/${rows.length}`);
  }
}

async function main() {
  const sizeArg = process.argv.indexOf("--size");
  const size = sizeArg >= 0 ? Number(process.argv[sizeArg + 1]) : 15_000;
  if (![1000, 5000, 15_000].includes(size)) {
    throw new Error(`--size must be 1000, 5000 or 15000 (got ${size})`);
  }

  console.log(`Seeding GeoNames gazetteer (cities${size})...\n`);
  const started = Date.now();

  const countryByIso = await seedCountries();
  await seedCities(size, countryByIso);

  const totals = await pool.query(
    "SELECT (SELECT count(*)::int FROM countries) countries, (SELECT count(*)::int FROM cities) cities",
  );
  console.log(`\nDone in ${Math.round((Date.now() - started) / 1000)}s:`, totals.rows[0]);
  console.log("Geo data (c) GeoNames, CC BY 4.0 — attribution required where surfaced.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
