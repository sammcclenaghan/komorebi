# Effect web resilience migration

## Objective

Ship Komorebi as a web-first Effect application that remains usable through
Ollama, search, network, and process failures. Electron is removed only after
the web runtime reaches feature parity and recovery behavior is covered by
tests.

The guarantee is not that infrastructure can never fail. The guarantee is that
recoverable failures do not lose accepted work, corrupt persisted state, or
turn optional dependency outages into whole-application outages.

## Invariants

1. SQLite is the source of truth for user data and accepted background work.
2. Ollama, search, weather, and link preview are optional dependencies for
   application readiness.
3. Every external call has a deadline, bounded response size, classified
   errors, and a bounded attempt.
4. Retryable generation work survives process and container restarts.
5. Permanent failures remain visible and actionable; they do not retry forever.
6. A failed replacement never deletes or hides the last successful result.
7. Duplicate requests and retries cannot create duplicate domain records.
8. Shutdown stops accepting work, finishes or releases leased work, and closes
   the Effect runtime before Docker's grace period expires.
9. Database migrations are ordered, transactional, and tested against a copy of
   the previous production schema.
10. Every UI query and mutation has explicit loading, retrying, offline, and
    terminal-configuration-error states.

## Delivery slices

### 1. Process boundary

- Add unauthenticated liveness and database-backed readiness endpoints.
- Add bounded JSON request bodies and useful malformed-body errors.
- Gracefully close HTTP and the Effect runtime on SIGINT/SIGTERM.
- Add Docker health and shutdown configuration.

### 2. Durable jobs

- Add a `generation_jobs` table with idempotency keys, states, attempts,
  scheduling, leases, payloads, results, and error classification.
- Implement atomic claim, heartbeat, success, retry, and permanent-failure
  operations.
- Reclaim expired leases at startup.
- Test process interruption between every state transition.

### 3. Asynchronous generation

- Change generation commands to persist and return a job before calling Ollama.
- Run a supervised Effect worker that drains due jobs.
- Keep SSE as an acceleration channel; reconnecting clients recover state from
  SQLite rather than relying on missed in-memory events.
- Preserve current suggestions until a replacement succeeds atomically.

### 4. Dependency resilience

- Classify Ollama errors into retryable transport/capacity failures and
  actionable configuration failures.
- Add exponential backoff with jitter and a circuit breaker.
- Cache validated search results for reuse during provider outages.
- Allow useful no-link generation when search has no usable results.
- Expose dependency status without making it part of readiness.

### 5. Web-only runtime

- Replace manual route decoding with schema-validated Effect HTTP endpoints.
- Remove Electron IPC, preload, window, tray, packaging, and mode switches.
- Retain the React renderer as an installable PWA.
- Split production dependencies from build tooling and run as a non-root user
  with a read-only container filesystem.

### 6. Data protection and operations

- Replace best-effort schema alterations with versioned migrations. DONE
- Enable SQLite WAL, foreign keys, and a busy timeout. DONE
- Add online backup, restore, integrity-check, and migration commands. DONE
- Add structured logs with request, job, and generation correlation IDs. DONE
- Document rollback and test it against a production-like backup. DONE

## Current status

- Slice 1: DONE
- Slice 2: DONE
- Slice 3: DONE
- Slice 4: DONE
- Slice 5: DONE
- Slice 6: DONE
