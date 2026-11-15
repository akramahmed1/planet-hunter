# planet-hunter web app

## v2 foundations (Phase 1)

What v2 adds on top of the v1 app described further down. The plan is
`docs/V2_BUILD_PLAN.md`; decisions are in `docs/ADR/`.

**Frontend** (`frontend/`)
- Design system: tokens in `app/globals.css`, components in `components/ui/`
  (Button, Card, Tabs, Toggle, Sheet, Stat, Badge, Skeleton, ErrorState,
  EmptyState). Preview at `/design-system` (not linked from the nav).
- Fonts are bundled in `app/fonts/` (SIL Open Font License), so builds need no font CDN.
- App shell: top bar on wide screens, bottom tab bar on phones (Explore, Solar
  System, Exoplanets, Hunt, More). Unbuilt sections show a "Coming soon" page.
- Units: `lib/units.ts` (°F/°C/K, mi/km/AU, light time). The viewer's choice
  defaults to °F and miles and is saved on the device.
- Candidates: cards on phones, a sortable table on wider screens.

**Backend** (`backend/`)
- `/api/v2` router in `api_v2/`. `GET /api/v2/health` reports database
  connectivity and the deployed commit. v1 endpoints are unchanged.
- SQLAlchemy + Alembic on `DATABASE_URL` (`db.py`, `alembic.ini`,
  `migrations/`). Run `alembic upgrade head` from `backend/`. Without
  `DATABASE_URL`, v2 health reports `not_configured` and v1 is unaffected.

**Generated types (ADR 0002)**
- `npm run gen:types` (in `frontend/`) exports the OpenAPI schema with
  `backend/export_openapi.py` and writes `lib/api-types.gen.ts`. CI fails if the
  committed file is stale. Use them through `lib/api-v2.ts`.

**Tests**
- Backend: `python -m pytest -q` in `backend/`. Database tests need
  `TEST_DATABASE_URL` (CI provides Postgres and sets `REQUIRE_DB=1`).
- Frontend unit tests: `npm run test:unit` (Node's built-in test runner).
- Browser tests: `npm run build && npm run test:e2e` runs Playwright on a
  375x812 phone and a 1280x800 desktop, with axe accessibility checks on every
  page. Set `PW_BASE_URL` to run them against a deployed site.
- The **Staging check** workflow waits until staging serves the pushed commit,
  then runs the v1 QA suites and Playwright against staging.

## v2 live data (Phase 2)

- Endpoints under `/api/v2`: `bodies`, `positions?date=`, `distances?from=&to=&date=`, `iss`,
  `apod`, `space-weather`, `exoplanets/latest` and `exoplanets/{host}`. Every value carries a
  `source` and a `kind` (`measured`, `computed` or `estimate`).
- `live/` holds the fetchers (`sources.py`), the HTTP client with timeouts and retries
  (`http.py`), the cache (`cache.py`, Postgres table `external_cache` from migration `0002`, or
  memory without `DATABASE_URL`), the position maths (`positions.py`) and the estimate
  (`physics.py`).
- If a source fails, the last good copy is served with `stale: true`. With nothing cached, the
  endpoint returns an explicit 503 `{"status": "unavailable", ...}`.
- Bundled reference data in `data/*.v1.json` is built from the saved source samples by
  `scripts/build_reference_data.py`; CI fails if it is stale.
- Daily refresh: `python -m live.refresh` (a Railway cron service in staging).
- Offline mode: `PH_OFFLINE_FIXTURES=1` makes every external request answer from the saved
  samples in `tests/fixtures/external/`. The tests, CI's end-to-end job and local Playwright runs
  use it; deployed environments never set it.
- The Explore page shows live tiles (ISS, picture of the day, exoplanet count, space weather).
  Tap any value to see its source, kind and fetch time.

---

# v1 notes (original local build)

A local web app that presents the results of the planet-hunter exoplanet
transit-detection prototype. Nothing is deployed, nothing is pushed to GitHub,
and nothing is posted anywhere. This is a local build for Akram's review.

## Honesty rules (apply to every page and every endpoint)

- No discovery is claimed anywhere. Every unexplained signal is labeled
  "candidate" or "ambiguous" and flagged as needing professional follow-up.
- TOI 216 and TOI 776 are ambiguous BLS hits, NOT discoveries.
- The TOI 1338 signal is the host eclipsing binary, not a planet.
- All copy avoids em dashes and en dashes.

## What is real vs static

- Real data: `GET /api/candidates` reads `candidate_shortlist.csv` from the
  project root (with a bundled copy in `backend/` as fallback). The 8 rows
  served are the actual 2026-10-09 batch-scan output.
- Real data: the folded plot PNGs are the actual plots produced by the
  pipeline runs, served from the project root by `GET /api/plots/{file}`.
- Static documented facts: validation numbers (16.0509 d vs 16.051 d,
  0.001 percent error, 4 sectors, 62,074 cadences, depth 2356 ppm) and the
  method / limitations / roadmap text come from SUMMARY.md, hardcoded in
  `backend/app.py`. They describe the verified run, not a live computation.
- No database. v1 has no persistence; the CSV file is the data store.
- No scan trigger endpoint. Live MAST runs are long and flaky, so triggering
  a scan from the web app is out of scope. No placeholder pretends to run one.

## Architecture

```
webapp/
  backend/      FastAPI API, port 8000
    app.py
    requirements.txt
    candidate_shortlist.csv   (bundled fallback copy of the real CSV)
  frontend/     Next.js App Router, port 3000
    ...fetches the API at http://127.0.0.1:8000 at request time
```

API endpoints (all GET, verified 2026-10-13):

- `/api/health` -> service status
- `/api/validation` -> TOI 700 c validation result (from SUMMARY.md)
- `/api/candidates` -> all 8 batch-scan rows (from the CSV)
- `/api/candidates/{slug}` -> one row, e.g. `toi-216`; 404 on unknown slug
- `/api/method` -> method steps, limitations, roadmap (from SUMMARY.md)
- `/api/plots/{file}` -> folded plot PNGs (from the project root); 404 on unknown file

CORS allows `http://localhost:3000` and `http://127.0.0.1:3000`.

## Run locally

Backend (needs Python 3 with fastapi and uvicorn):

```
cd webapp/backend
pip install -r requirements.txt
python3 -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Frontend (needs Node 18+):

```
cd webapp/frontend
npm install
npm run dev        # dev server on http://localhost:3000
# or
npm run build && npm start
```

The frontend fetches the API at request time from `NEXT_PUBLIC_API_BASE`
(default `http://127.0.0.1:8000`), so the backend must be running first.

## Pages

- `/` Overview: TOI 700 c validation as the hero proof, key stats,
  candidate-not-discovery banner, links to Candidates and Method.
- `/candidates`: all 8 signals, sortable table, filter by classification.
- `/candidates/[slug]`: detail view with numbers, readout, folded plot
  where one exists.
- `/method`: plain-words method, limitations, ExoMiner++ note, v2 roadmap.
