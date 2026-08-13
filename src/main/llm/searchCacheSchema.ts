export const SEARCH_CACHE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS search_cache (
    cache_key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    fresh_until TEXT NOT NULL,
    stale_until TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_search_cache_stale_until
    ON search_cache(stale_until)`
] as const;
