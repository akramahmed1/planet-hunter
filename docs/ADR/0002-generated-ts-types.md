# 0002: Frontend types are generated from the OpenAPI schema

Status: Accepted · Date: 2026-10-17

## Context

v1 keeps hand-written TypeScript interfaces in `webapp/frontend/lib/api.ts`,
and `tests/test_contract.py` compares them field by field against the
Pydantic models. That works for a handful of models, but v2 adds dozens of
them. Writing each one by hand in two places invites drift.

## Decision

- FastAPI's OpenAPI schema is the single source of truth for v2 types.
- A script exports the schema from the app object (`app.openapi()`), without
  starting a server, and runs `openapi-typescript` on it. The output is
  committed as `webapp/frontend/lib/api-types.gen.ts`.
- The `openapi-typescript` version is pinned in `package.json` so output is
  reproducible.
- CI regenerates the file and fails if `git diff` shows any change, then runs
  the typecheck and the build.
- v1 types stay hand-written and keep their contract test until v1 is
  removed (ADR 0001).

## Consequences

- A backend model change that isn't paired with a frontend update fails CI.
- The generated file shows up in diffs; reviewers can skim it, since CI
  proves it is fresh.
- Generating needs the backend's Python dependencies installed, which the
  CI frontend job will have to set up.
