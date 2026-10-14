# planet-hunter: production plan

Audience: space enthusiasts (core product) with a classroom tier on top.
Principle: the science is computed by deterministic, reproducible code. AI only
explains numbers that were already computed, and every signal stays a
*candidate* until professional follow-up.

## Phase 1: contract and data integrity (this PR)

- One source of truth: `scripts/build_results.py` merges `candidate_shortlist.csv`
  with the human review in `results/annotations.json` into
  `webapp/backend/data/results.json`. Nothing about the scan is hardcoded in the
  backend or the frontend any more.
- New scan targets without a human review publish as **Unreviewed**, never with a
  borrowed verdict.
- Typed API: Pydantic models in `webapp/backend/schemas.py` are the contract.
  `tests/test_contract.py` fails CI if `frontend/lib/api.ts` drifts (missing
  field, extra field, optionality, classification values).
- Fixed drift that was live: `/api/method` never sent `exominer_note`; the method
  page and home page silently showed hardcoded copies (counts, steps, limitations).
  Pages now render only API data and show an explicit error state otherwise.
- Corrected copy: the batch scan searched 0.5 to 30 days (not 1 to 40), so
  long-period planets are out of its reach; this is now stated.
- `ALLOWED_ORIGINS` env var for CORS; non-root container user; healthcheck.
- CI: build check, contract + API tests, frontend typecheck + build, and an
  end-to-end job that boots both services and runs the QA suites.

Deploy notes: set `ALLOWED_ORIGINS=https://frontend-production-db96.up.railway.app`
on the backend service. Response shape changed (`/api/candidates` now nests
`run` and `summary`), so deploy backend and frontend together.

## Phase 2: live scan engine

- Postgres for targets, runs, signals, reviews; object storage for plots and
  light-curve data.
- Job queue + worker running the existing pipeline on any TIC/TOI a user
  requests, with MAST caching, retries, per-user rate limits and quotas.
- Interactive light-curve viewer (zoom, fold slider, periodogram) from
  downsampled data instead of static PNGs.
- Stitch all available sectors; configurable period range.

## Phase 3: vetting and cross-match

- Vetting tests: odd/even depth, secondary eclipse, transit shape (V vs U),
  centroid offsets from target pixel files, Transit Least Squares.
- Cross-match every signal against the NASA Exoplanet Archive, the TOI list on
  ExoFOP, and known eclipsing-binary catalogs; known planets auto-label.
- Proposed classifications from the vetting results, always behind a human
  review gate before publication.

## Phase 4: accounts, AI and classroom tier

- Accounts, saved targets, watchlists, notes; export in ExoFOP-ready format.
- AI explainer: answers "what am I looking at?" for a signal using only the
  computed numbers and vetting results as context, with citations to those
  values. Evaluated in CI against a fixed question set; refuses to call anything
  a discovery.
- Classroom tier: teacher workspace, class codes, guided assignments built on
  real TESS targets, progress view. **Needs your go-ahead**: this introduces
  organizations and roles (multi-tenant).
- Billing (Stripe), analytics, accessibility audit, legal pages.

## Production standards applied throughout

- Error monitoring and tracing (Sentry / OpenTelemetry), uptime checks.
- Security headers (CSP, HSTS), dependency scanning, secrets only in env.
- Every phase ships as a PR with CI green, then verify-live on Railway.
