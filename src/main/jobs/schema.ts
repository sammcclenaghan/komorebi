export const GENERATION_JOBS_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS generation_jobs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'retry_wait', 'succeeded', 'failed')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL,
    available_at TEXT NOT NULL,
    lease_owner TEXT,
    lease_until TEXT,
    error_kind TEXT,
    error_message TEXT,
    result_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_generation_jobs_due
    ON generation_jobs(status, available_at, lease_until, created_at)`
] as const;
