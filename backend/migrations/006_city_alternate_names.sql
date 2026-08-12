-- Migration 006: City alternate names
--
-- Matching on the canonical GeoNames name alone misses common usage: the city
-- is stored as "New York City" but job feeds say "New York", and as "Bengaluru"
-- where feeds say "Bangalore". Together those two accounted for the largest
-- block of genuinely-resolvable misses in the first backfill.
--
-- GeoNames ships these in the alternatenames column; this stores a filtered
-- subset so the resolver can match them at lower priority than canonical names.

ALTER TABLE cities ADD COLUMN IF NOT EXISTS alternate_names TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_cities_alternate_names ON cities USING GIN (alternate_names);
