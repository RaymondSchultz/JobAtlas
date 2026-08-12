import { z } from "zod";
import { ApiError } from "../errors.js";

/**
 * Shared geographic filtering for the jobs and search routes.
 *
 * Both build SQL by pushing onto a params array, so this follows the same
 * pattern rather than introducing a query builder. Keeping it in one place is
 * what stops the two endpoints from drifting into filtering differently.
 */

const MAX_RADIUS_KM = 500;
const EARTH_RADIUS_KM = 6371;

const geoQuerySchema = z.object({
  /** ISO-3166 alpha-2, or a country name. */
  country: z.string().trim().min(2).max(60).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(MAX_RADIUS_KM).default(50),
  /**
   * Remote jobs have no city, so a strict location filter excludes them. Most
   * "jobs near me" searches still want them, but that is the caller's call.
   */
  includeRemote: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export type GeoQuery = z.infer<typeof geoQuerySchema>;

export function parseGeoQuery(query: unknown): GeoQuery {
  const parsed = geoQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid location filter", parsed.error.flatten());
  }

  const { lat, lng } = parsed.data;
  // One coordinate alone silently returns unfiltered results, which reads as a
  // working query returning wrong data — reject it instead.
  if ((lat === undefined) !== (lng === undefined)) {
    throw new ApiError(400, "VALIDATION_ERROR", "lat and lng must be supplied together");
  }

  return parsed.data;
}

export interface GeoFilterResult {
  /** SQL scalar yielding kilometres from the requested point, when one was given. */
  distanceExpr: string | null;
}

/**
 * Appends geo predicates to `where`/`params` in place.
 *
 * `cityAlias` is the already-joined cities row; both callers LEFT JOIN it, so
 * distance needs no extra join.
 */
export function applyGeoFilter(
  geo: GeoQuery,
  params: unknown[],
  where: string[],
  cityAlias = "ci",
  countryAlias = "co",
): GeoFilterResult {
  const clauses: string[] = [];
  let distanceExpr: string | null = null;

  if (geo.country) {
    params.push(geo.country.toUpperCase(), geo.country.toLowerCase());
    clauses.push(`(${countryAlias}.iso_code = $${params.length - 1} OR lower(${countryAlias}.name) = $${params.length})`);
  }

  if (geo.city) {
    // Matches alternate spellings too, so "Bangalore" finds Bengaluru jobs.
    params.push(geo.city.toLowerCase());
    clauses.push(
      `(lower(${cityAlias}.name) = $${params.length} OR ${cityAlias}.alternate_names @> ARRAY[$${params.length}]::text[])`,
    );
  }

  if (geo.lat !== undefined && geo.lng !== undefined) {
    const { lat, lng, radiusKm } = geo;

    // Bounding box first so idx_cities_lat_lng can exclude most rows before the
    // trigonometry runs. Longitude degrees shrink toward the poles; clamp the
    // cosine so a near-polar query cannot divide by ~0.
    const latDelta = radiusKm / 111.32;
    const lngDelta = radiusKm / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));

    params.push(lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta);
    const [latMin, latMax, lngMin, lngMax] = [
      params.length - 3,
      params.length - 2,
      params.length - 1,
      params.length,
    ];

    params.push(lat, lng);
    const latParam = params.length - 1;
    const lngParam = params.length;

    // LEAST(1, ...) guards acos against floating-point drift past 1 for points
    // at zero distance, which would otherwise produce NaN.
    //
    // The CASE is not redundant: Postgres LEAST *ignores* NULL arguments, so a
    // job with no resolved city would yield LEAST(1, NULL) = 1, acos(1) = 0,
    // and report itself as being exactly at the search point — sorting ahead of
    // every real match under sort=distance.
    distanceExpr =
      `(CASE WHEN ${cityAlias}.latitude IS NULL OR ${cityAlias}.longitude IS NULL THEN NULL ELSE ` +
      `${EARTH_RADIUS_KM} * acos(LEAST(1, ` +
      `cos(radians($${latParam})) * cos(radians(${cityAlias}.latitude)) * ` +
      `cos(radians(${cityAlias}.longitude) - radians($${lngParam})) + ` +
      `sin(radians($${latParam})) * sin(radians(${cityAlias}.latitude))` +
      `)) END)`;

    params.push(radiusKm);
    clauses.push(
      `(${cityAlias}.latitude BETWEEN $${latMin} AND $${latMax} ` +
      `AND ${cityAlias}.longitude BETWEEN $${lngMin} AND $${lngMax} ` +
      `AND ${distanceExpr} <= $${params.length})`,
    );
  }

  if (clauses.length === 0) return { distanceExpr: null };

  const combined = clauses.join(" AND ");
  where.push(geo.includeRemote ? `((${combined}) OR j.is_remote = true)` : combined);

  return { distanceExpr };
}
