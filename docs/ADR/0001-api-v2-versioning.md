# 0001: New endpoints live under `/api/v2`; v1 is frozen

Status: Accepted · Date: 2026-10-17

## Context

The production frontend (`frontend-production-db96`) calls the v1 endpoints
on `backend-production-f88f2`: `/api/health`, `/api/overview`,
`/api/validation`, `/api/candidates`, `/api/candidates/{slug}`,
`/api/method` and `/api/plots/{file}`. v2 is built over ten phases on a `v2`
branch, and production only changes in Phase 10. The backend deploys before
the frontend, so for a while a new backend serves an old frontend.

## Decision

- Every new endpoint is added under `/api/v2/...`, on its own FastAPI router.
- The v1 endpoints keep their paths, response shapes and status codes until
  Phase 10. Changes to v1 are limited to bug fixes that leave the shape alone.
- Changes inside v2 are additive while v2 is unreleased. After release, a
  breaking change needs a new path or an `/api/v3`.
- Every scientific value a v2 endpoint serves carries `source` (name and URL)
  and `kind` (`measured`, `computed` or `estimate`).
- In Phase 10, once the v2 frontend no longer calls v1, v1 stays for one
  release with a deprecation note, then a follow-up PR removes it.

## Consequences

- Any backend build can go to production without breaking the live frontend.
- `tests/test_api.py` and `tests/test_contract.py` keep guarding v1 unchanged.
- There will be some duplication between v1 and v2 models until v1 is removed.
