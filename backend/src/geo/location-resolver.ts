/**
 * Turns a free-text location string into country/city ids.
 *
 * Job feeds do not agree on a format. The strings actually present in this
 * database include "US, CA, Santa Clara", "New York, NY", "London",
 * "Anywhere in the World", "2 Locations" and "N/A" — four parseable shapes plus
 * two that carry no location at all. The resolver therefore tokenises and looks
 * for evidence rather than assuming any single layout.
 *
 * Use `resolveLocations` for anything batch-shaped: it loads only the cities the
 * batch's own tokens could match, which is the difference between one small
 * query and shipping the entire 34k-row gazetteer over the wire.
 */
import type { DbClient } from "../db/pool.js";

export interface ResolvedLocation {
  countryId: string | null;
  cityId: string | null;
  confidence: "city" | "country" | "none";
  reason: string;
}

interface CityEntry {
  id: string;
  countryId: string;
  countryIso: string;
  admin1: string | null;
  population: number;
  /** False when matched via an alternate name, so canonical names win ties. */
  canonical: boolean;
}

export interface Gazetteer {
  citiesByName: Map<string, CityEntry[]>;
  countryIdByIso: Map<string, string>;
  countryIdByName: Map<string, string>;
  /** Admin1 codes that exist per country, for spotting "NY" as a region token. */
  admin1ByCountry: Map<string, Set<string>>;
}

const NONE: ResolvedLocation = { countryId: null, cityId: null, confidence: "none", reason: "unresolved" };

/**
 * Strings that look like locations but name no place: remote markers, multi-site
 * placeholders, continents and supranational regions (GeoNames has no row for
 * "North America", and guessing a country from one would be wrong).
 */
const NON_PLACES = new Set([
  "anywhere", "anywhere in the world", "worldwide", "world wide", "global", "globally",
  "remote", "remote work", "fully remote", "work from home", "wfh", "distributed",
  "n/a", "na", "none", "unspecified", "various", "various locations", "multiple locations",
  "north america", "south america", "latin america", "central america", "europe", "emea",
  "apac", "asia", "asia pacific", "africa", "oceania", "middle east", "americas",
  "united states or canada", "us or canada", "eu", "european union",
]);

const MULTI_SITE = /^\d+\s+locations?$/i;

/** Qualifiers that decorate a location without naming one. */
const NOISE = /\b(remote|hybrid|on-?site|in-?office|flexible|optional|based|area|region|metro|greater|multiple)\b/gi;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Loads only the cities whose canonical or alternate name matches one of the
 * supplied tokens.
 *
 * Transferring the whole gazetteer is not viable: 34k rows takes ~45 seconds
 * over the pooled Neon connection, which dwarfs the ingest it serves. A batch
 * of jobs references a few hundred distinct tokens at most, so the lookup is
 * scoped to those. Countries are loaded whole — there are only ~250.
 */
export async function loadGazetteer(db: DbClient, tokens?: string[]): Promise<Gazetteer> {
  const scoped = tokens !== undefined;
  const distinct = scoped ? [...new Set(tokens)].filter(Boolean) : [];

  const cityQuery = scoped
    ? db.query(
        `SELECT ci.id, ci.name, ci.alternate_names, ci.admin1_code, ci.population, ci.country_id, co.iso_code
         FROM cities ci JOIN countries co ON co.id = ci.country_id
         WHERE lower(ci.name) = ANY($1::text[]) OR ci.alternate_names && $1::text[]`,
        [distinct],
      )
    : db.query(
        `SELECT ci.id, ci.name, ci.alternate_names, ci.admin1_code, ci.population, ci.country_id, co.iso_code
         FROM cities ci JOIN countries co ON co.id = ci.country_id`,
      );

  const [cities, countries] = await Promise.all([
    scoped && distinct.length === 0 ? Promise.resolve({ rows: [] as never[] }) : cityQuery,
    db.query("SELECT id, name, iso_code FROM countries"),
  ]);

  const citiesByName = new Map<string, CityEntry[]>();
  const admin1ByCountry = new Map<string, Set<string>>();

  const index = (key: string, entry: CityEntry) => {
    const bucket = citiesByName.get(key);
    if (bucket) bucket.push(entry);
    else citiesByName.set(key, [entry]);
  };

  for (const row of cities.rows) {
    const base = {
      id: row.id,
      countryId: row.country_id,
      countryIso: row.iso_code,
      admin1: row.admin1_code,
      population: Number(row.population) || 0,
    };

    index(normalize(row.name), { ...base, canonical: true });
    for (const alias of (row.alternate_names as string[] | null) ?? []) {
      const key = normalize(alias);
      if (key) index(key, { ...base, canonical: false });
    }

    if (row.admin1_code) {
      const set = admin1ByCountry.get(row.iso_code) ?? new Set<string>();
      set.add(String(row.admin1_code).toLowerCase());
      admin1ByCountry.set(row.iso_code, set);
    }
  }

  // Most populous first, so a bare "London" resolves to GB rather than Ontario.
  for (const bucket of citiesByName.values()) bucket.sort((a, b) => b.population - a.population);

  const countryIdByIso = new Map<string, string>();
  const countryIdByName = new Map<string, string>();
  for (const row of countries.rows) {
    countryIdByIso.set(String(row.iso_code).toLowerCase(), row.id);
    countryIdByName.set(normalize(row.name), row.id);
  }

  // Common aliases the gazetteer's official names miss.
  const aliases: Record<string, string> = {
    usa: "us", "u.s.": "us", "u.s.a.": "us", "united states of america": "us",
    uk: "gb", "u.k.": "gb", "great britain": "gb", england: "gb", scotland: "gb", wales: "gb",
    "south korea": "kr", "north korea": "kp", russia: "ru", vietnam: "vn", uae: "ae",
    "czech republic": "cz", turkey: "tr", "ivory coast": "ci",
  };
  for (const [alias, iso] of Object.entries(aliases)) {
    const id = countryIdByIso.get(iso);
    if (id) countryIdByName.set(alias, id);
  }

  return { citiesByName, countryIdByIso, countryIdByName, admin1ByCountry };
}

/** Colloquial forms no gazetteer carries, seen directly in the feed data. */
const SHORTHAND: Record<string, string> = {
  nyc: "new york city", sf: "san francisco", "bay area": "san francisco",
  la: "los angeles", dc: "washington", "washington dc": "washington",
  sfo: "san francisco", blr: "bengaluru", "silicon valley": "san jose",
};

function tokenize(raw: string): string[] {
  const cleaned = raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    // "US-Remote" and "Remote in the US" both wrap a country in filler.
    .replace(/\b(in|within|across|anywhere in)\s+the\b/gi, " ")
    .replace(NOISE, " ")
    .replace(/\b(and|or)\s+\d+\s+more\b/gi, " ");

  const parts = cleaned
    // Hyphens without spaces separate real tokens in feeds ("US-Remote").
    .split(/[,/|;·•-]|\s+–\s+|\s+\bor\b\s+|\s+\band\b\s+/i)
    .map((part) => normalize(part))
    .filter(Boolean);

  return parts.map((part) => SHORTHAND[part] ?? part);
}

export function resolveLocation(raw: string | null | undefined, gaz: Gazetteer): ResolvedLocation {
  if (!raw || !raw.trim()) return NONE;

  const whole = normalize(raw);
  if (NON_PLACES.has(whole) || MULTI_SITE.test(whole)) {
    return { countryId: null, cityId: null, confidence: "none", reason: "not a place" };
  }

  const tokens = tokenize(raw).filter((token) => !NON_PLACES.has(token) && !MULTI_SITE.test(token));
  if (tokens.length === 0) return { countryId: null, cityId: null, confidence: "none", reason: "not a place" };

  // Country evidence, from an ISO code or a country name anywhere in the string.
  let countryId: string | null = null;
  let countryIso: string | null = null;
  for (const token of tokens) {
    const byName = gaz.countryIdByName.get(token);
    const byIso = token.length === 2 ? gaz.countryIdByIso.get(token) : undefined;
    const id = byName ?? byIso;
    if (id) {
      countryId = id;
      for (const [iso, isoId] of gaz.countryIdByIso) {
        if (isoId === id) { countryIso = iso; break; }
      }
      break;
    }
  }

  // Region evidence ("CA", "NY"). Only meaningful alongside a city, and only
  // within a country that actually uses that code.
  const regionTokens = tokens.filter((token) => {
    if (token.length !== 2) return false;
    if (countryIso) return gaz.admin1ByCountry.get(countryIso.toUpperCase())?.has(token) ?? false;
    return [...gaz.admin1ByCountry.values()].some((set) => set.has(token));
  });

  let best: CityEntry | null = null;
  let bestScore = -1;

  for (const token of tokens) {
    const candidates = gaz.citiesByName.get(token);
    if (!candidates) continue;

    for (const candidate of candidates) {
      let score = 0;
      if (countryId && candidate.countryId === countryId) score += 100;
      else if (countryId) continue; // contradicts an explicit country
      if (candidate.admin1 && regionTokens.includes(candidate.admin1.toLowerCase())) score += 50;
      // A canonical name is stronger evidence than an alternate spelling.
      if (candidate.canonical) score += 20;
      // Population only breaks ties; it must never outweigh explicit evidence.
      score += Math.min(candidate.population / 1_000_000, 9);

      if (score > bestScore) { bestScore = score; best = candidate; }
    }
  }

  if (best) {
    return { countryId: best.countryId, cityId: best.id, confidence: "city", reason: "city matched" };
  }
  if (countryId) {
    return { countryId, cityId: null, confidence: "country", reason: "country only" };
  }
  return NONE;
}

/**
 * Resolves a batch of location strings with a single scoped gazetteer load.
 *
 * This is the entry point callers should use. Resolving one string at a time
 * would either re-query per row or force a full-gazetteer load; tokenising the
 * whole batch first means one query sized to what the batch actually mentions.
 */
export async function resolveLocations(
  db: DbClient,
  raws: (string | null | undefined)[],
): Promise<ResolvedLocation[]> {
  const tokens = raws.flatMap((raw) => (raw?.trim() ? tokenize(raw) : []));
  const gazetteer = await loadGazetteer(db, tokens);
  return raws.map((raw) => resolveLocation(raw, gazetteer));
}
