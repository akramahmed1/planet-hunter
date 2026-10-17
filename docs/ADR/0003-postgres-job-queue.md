# 0003: Scan jobs use a Postgres table with `SKIP LOCKED`

Status: Accepted · Date: 2026-10-17

## Context

Phase 6 lets users queue light-curve scans that take minutes and a lot of
memory. A worker service runs them. Postgres is already in the stack, and
adding Redis would mean another paid service to run and monitor.

## Decision

- Jobs live in a `scan_jobs` table with a status (`queued`, `running`,
  `succeeded`, `failed`), attempt count, `locked_by`, `locked_until` (a
  lease) and timestamps.
- A worker claims one job per transaction:
  `SELECT ... WHERE status = 'queued' OR (status = 'running' AND locked_until < now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
  then sets it to `running` with a fresh lease and commits.
- A running worker renews the lease while it works. A job whose lease runs
  out (the worker crashed) goes back to the queue, up to a maximum attempt
  count, then fails.
- Finishing a job only succeeds if the worker still holds the lease
  (`WHERE id = :id AND locked_by = :me`), so two workers can never both
  record a result for the same job.
- Scans of the same target and parameters share a cache key, so a repeat
  request returns the cached result instead of queuing new work.
- `POST /api/v2/scans` enforces a rate limit and a cap on queued jobs.

## Consequences

- No new infrastructure. Throughput is far below what Postgres handles easily.
- Tests must cover concurrent claims and expired leases to prove that no job
  runs twice (Phase 6 "Done when").
- Polling adds a little latency; `LISTEN/NOTIFY` can be added later if needed.
