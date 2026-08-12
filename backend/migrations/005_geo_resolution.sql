-- Migration 005: Geographic resolution support
--
-- jobs.country_id and jobs.city_id existed from 001 and are joined by the jobs,
-- search and metadata routes, but nothing ever populated them: every row was
-- NULL and the countries/cities tables were empty. Location lived only in the
-- free-text jobs.location_raw, so "jobs near me" was not expressible.
--
-- This prepares cities to hold a real GeoNames-derived gazetteer.

-- Population drives disambiguation: "London" alone should resolve to London GB,
-- not London, Ontario. admin1_code carries the state/province, which is what
-- makes "New York, NY" and "US, CA, Santa Clara" resolvable at all.
ALTER TABLE cities ADD COLUMN IF NOT EXISTS admin1_code TEXT;
ALTER TABLE cities ADD COLUMN IF NOT EXISTS population INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cities ADD COLUMN IF NOT EXISTS geonames_id INTEGER;

-- UNIQUE (country_id, name) cannot hold a real gazetteer: the US alone has
-- many distinct Springfields. Key on the region as well.
ALTER TABLE cities DROP CONSTRAINT IF EXISTS uq_city_per_country;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cities_geonames_id ON cities (geonames_id) WHERE geonames_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cities_country_name_admin1
  ON cities (country_id, lower(name), coalesce(admin1_code, ''));

-- Name lookup is the resolver's hot path; it always matches case-insensitively.
CREATE INDEX IF NOT EXISTS idx_cities_lower_name ON cities (lower(name));
CREATE INDEX IF NOT EXISTS idx_cities_population ON cities (population DESC);

-- Bounding-box prefilter for radius search (phase 2).
CREATE INDEX IF NOT EXISTS idx_cities_lat_lng ON cities (latitude, longitude);

-- Serving filtered job lists by location.
CREATE INDEX IF NOT EXISTS idx_jobs_country_status ON jobs (country_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_city_status ON jobs (city_id, status);
