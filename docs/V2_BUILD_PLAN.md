# Planet Hunter v2: build plan for Claude Code

Repo: `akramahmed1/planet-hunter` · Plan date: 2026-10-17 · Owner: Akram

Copy this file into the repo as `docs/V2_BUILD_PLAN.md`, then paste the
kickoff prompt below into Claude Code.

---

## Kickoff prompt (paste into Claude Code)

```text
You are building Planet Hunter v2 in the repo akramahmed1/planet-hunter.
Akram has pasted this whole plan into this message. Do the setup yourself:
  a. Akram works from his phone, so he cannot run terminal commands. Check
     that you can push to the repo (a test push of the `v2` branch is fine).
     For Railway, use the Railway CLI only if a RAILWAY_API_TOKEN env var is
     set; otherwise give Akram short tap-by-tap steps for the Railway
     dashboard/app (create the staging environment, add Postgres, set env
     vars) and wait for him to confirm. Never ask him to paste secrets into
     chat; secrets go in Railway variables or this session's environment
     settings.
  b. Clone or pull the repo, create branch `v2` from `main`, save everything
     in this message from the "# Planet Hunter v2: build plan" heading to the
     end as docs/V2_BUILD_PLAN.md, commit it, and push `v2`.
docs/V2_BUILD_PLAN.md is the single source of truth for scope, decisions,
rules and phases. Read it in full before doing anything else.

Work one phase at a time, in order, starting at Phase 0. For every phase
follow this loop exactly:
  1. Plan: print the phase's tasks, the files you will touch and how you
     will verify them. Wait for Akram to reply "go".
  2. Build on a feature branch cut from `v2` (name: v2/pN-<short-name>).
  3. Verify: run every check in the phase's "Done when" list and show the
     output. Fix root causes; never skip, weaken or delete a test.
  4. Open a PR into `v2` (not main). Wait for CI to be green.
  5. Verify live on the STAGING environment and give Akram the staging URL
     to check on his phone.
  6. Merge only after Akram says "approved". Then update the phase status
     table in docs/V2_BUILD_PLAN.md and stop.

Never touch production (main branch or the Railway production environment)
before Phase 10. Stop and ask Akram whenever anything is ambiguous, a fact
cannot be verified, a paid service or new account is needed, or a step is
not described in the plan. Begin with Phase 0, step 1 (plan only).
```

---

## 1. Product in one line

A space-science classroom built on real NASA data: explore the solar system
and real exoplanet systems in 3D, track missions live, learn with lessons and
quizzes, and hunt for planets in real telescope data. Teachers run classes and
assignments on top of it.

## 2. Decisions (locked unless Akram changes them)

| Topic | Decision |
|---|---|
| "NASA machine" | A 3D, scroll-driven explainer of the TESS telescope: how it orbits, how its cameras watch a sector, how a transit becomes a light curve. |
| "Space system" | A live mission tracker: ISS position on an Earth map, plus distance and status cards for TESS, JWST, Voyager 1 and 2, and others, from JPL data. |
| Age group | Ages 13 and up (high school and college) at launch. Under-13 support needs COPPA work and is a later decision. An age check at sign-up blocks under-13 accounts. |
| Classrooms | Multi-tenant, with role-based access: organization (school) → classes → members. Roles: org admin, teacher, student. |
| Database | Railway Postgres, with Alembic migrations. |
| Units | Miles and °F by default. Toggles for km, AU, °C and Kelvin. |
| Release style | Every phase merges into a `v2` integration branch that deploys to a Railway **staging** environment. Production changes once, in Phase 10. |
| Current live URL | https://frontend-production-db96.up.railway.app stays untouched until Phase 10, then shows v2 at the same URL. |

### Decisions still open (Claude Code asks Akram at the named phase)

- **Phase 0:** whether to use a custom domain; confirm Railway plan limits for an extra worker and cron service.
- **Phase 8:** teacher sign-in method. Recommended: Auth.js with Google plus email magic link through Resend. Students join with a class code, a nickname and a PIN, with no email.
- **Phase 9:** AI provider and model for the explainer (recommended: Anthropic API with the model set in an env var); Stripe pricing for the classroom plan.

## 3. Current repo state (verified 2026-10-17)

- `main` @ `f7e25f3`: Phase 1 merged (PR #1). The live backend reports version 1.1.0, schema_version 1, and 8 candidates from the 2026-10-09 run.
- **Pipeline (repo root):**
  - `candidate_scan.py` and `validate_toi700.py` use lightkurve and astropy BLS.
  - `candidate_shortlist.csv`, `results/annotations.json` and `results/method.json` hold the scan output and human review.
  - `scripts/build_results.py` publishes `webapp/backend/data/results.json`. CI checks that it is fresh.
- **Backend:** `webapp/backend`. FastAPI 0.141.1 and Pydantic v2. Data is file-based (no database), GET only. CORS through `ALLOWED_ORIGINS`.
  - Endpoints: `/api/health`, `/api/overview`, `/api/validation`, `/api/candidates`, `/api/candidates/{slug}`, `/api/method`, `/api/plots/{file}`.
  - Tests: `tests/test_api.py`, and `tests/test_contract.py`, which compares the TS types with the Pydantic models.
- **Frontend:** `webapp/frontend`. Next.js 15.5 and React 19.1 with custom CSS, no UI kit.
  - Pages: `/`, `/candidates`, `/candidates/[slug]`, `/method`.
  - Fetches are server-side with `cache: "no-store"`. `NEXT_PUBLIC_API_BASE` is baked in at build time.
- **QA:** `webapp/qa/` (backend, frontend and visual scripts) and `.github/workflows/ci.yml` (backend tests, typecheck and build, E2E).
- **Deploy:** Railway, two services: `frontend-production-db96`, `backend-production-f88f2`.
- **Known issues to fix:**
  - The candidates table overflows horizontally on phones.
  - Plots are static PNGs.
  - There are no raw light-curve arrays to build interactive charts from.
  - There are no star coordinates for the sky map.
- Stale branches `claude/p1-contract-sync` and `claude/p1-contract-sync-59hes1` are fully merged and can be deleted in Phase 0.

## 4. Non-negotiable rules

1. **Nothing breaks live.** API changes are additive only. New endpoints go under `/api/v2/...`, and the existing v1 endpoints keep their shapes until Phase 10. Backend deploys before frontend.
2. **Frontend and backend stay in sync by construction.**
   - TypeScript types are generated from FastAPI's OpenAPI schema with `openapi-typescript` into `webapp/frontend/lib/api-types.gen.ts`.
   - CI fails if the generated file is stale or the build breaks.
   - The existing `test_contract.py` keeps guarding v1 until v1 is removed.
3. **Every number has a source.** Every scientific value the API serves carries a `source` field (name and URL) and a `kind` of `measured`, `computed` or `estimate`. The UI labels estimates as estimates.
4. **Keep the honesty framing.** Candidate signals are never called discoveries.
5. **Never fabricate.** If an external API or fact can't be verified, stop and ask Akram. Don't fill in from memory.
6. **No secrets in git.** Use Railway env vars; `.env.example` lists the names only.
7. **Tests are never weakened** to get to green.
8. **Accessibility and performance are part of "done":**
   - Mobile-first at 375 px wide.
   - WCAG AA contrast.
   - Keyboard reachable.
   - `prefers-reduced-motion` respected.
   - 3D is lazy-loaded, with a 2D fallback when WebGL is unavailable.
9. **Tenant isolation.** Every classroom table carries `org_id`. The backend enforces role-based access on every request, and tests prove that one org can't read another's data.
10. **Docs are updated in the same PR as the code:** README, `webapp/README.md`, and this plan's status table.

## 5. Target architecture

```
Railway project: planet-hunter
 ├─ environment: production  (main)  ← untouched until Phase 10
 └─ environment: staging     (v2)
     ├─ frontend   Next.js 15 (App Router), React 19
     ├─ backend    FastAPI, v1 + /api/v2, Alembic migrations
     ├─ worker     Python, runs light-curve scans from a Postgres job table
     ├─ cron       daily refresh of live data caches
     └─ postgres   Railway Postgres
```

**Frontend libraries:**
- `three`, `@react-three/fiber` and `@react-three/drei` for 3D.
- `uplot` for fast interactive light-curve charts.
- `leaflet` with OpenStreetMap tiles for the Earth map.
- Aladin Lite v3 from CDS for the sky map.
- `openapi-typescript` for types.
- Playwright and `@axe-core/playwright` for tests.

**Backend additions:** SQLAlchemy 2, Alembic, `psycopg[binary]`, `httpx` for external fetches (timeouts and retries), and APScheduler or a Railway cron service for refreshes.

**Job queue:** a Postgres table using `SELECT ... FOR UPDATE SKIP LOCKED`. This avoids running a separate Redis service.

**External data sources.** Phase 0 verifies the URL, terms, rate limits and response shape for each before any code depends on it:

| Data | Source |
|---|---|
| Planet temperatures, sizes, orbital distances | NASA Planetary Fact Sheet (NSSDCA) |
| Today's planet and spacecraft positions, Earth distances | NASA JPL Horizons API |
| Date slider between refreshes | JPL "Keplerian elements for approximate positions of the major planets" (computed locally; labeled `computed`) |
| Exoplanets, host stars, equilibrium temperatures, newly confirmed planets | NASA Exoplanet Archive TAP service |
| Star coordinates (RA/Dec) for TIC targets | MAST |
| ISS live position | A public ISS position API (Phase 0 picks one that serves HTTPS) |
| Picture of the day, space weather (DONKI) | api.nasa.gov (needs our own API key, since DEMO_KEY limits are too low) |
| Sky imagery | CDS Aladin Lite / HiPS surveys |
| 3D models (TESS, spacecraft) | NASA 3D Resources. Phase 0 confirms the license and file format; otherwise use simple procedural models. |

## 6. Phases

Status values: `todo`, `in-progress`, `staging-verified`, `merged-to-v2`, `live`.

| # | Phase | Status |
|---|---|---|
| 0 | Prep and verification | todo |
| 1 | Foundations and design system | todo |
| 2 | Live data layer | todo |
| 3 | 3D solar system | todo |
| 4 | Exoplanet systems, sky map, TESS explainer, mission tracker | todo |
| 5 | Hunt lab (interactive light curves) | todo |
| 6 | Live scan engine, vetting, cross-match | todo |
| 7 | Learn and quiz | todo |
| 8 | Accounts and multi-tenant classrooms | todo |
| 9 | AI explainer and billing | todo |
| 10 | Hardening and production release | todo |

---

### Phase 0: Prep and verification (no app code)

**Tasks**
1. Create branch `v2` from `main`. Delete the two merged `claude/p1-contract-sync*` branches (ask first).
2. **Railway (guide Akram through it or use the Railway CLI):**
   - Create a `staging` environment that deploys the `v2` branch, with its own frontend and backend services.
   - Add a Postgres database to staging.
   - Record the staging URLs in this file.
3. **Verify every external source** in the section 5 table:
   - Make a real request and save one trimmed sample response under `webapp/backend/tests/fixtures/external/`.
   - Record the rate limit, terms and HTTPS support in `docs/DATA_SOURCES.md`.
   - Ask Akram to create a free api.nasa.gov key and add it as a Railway env var.
4. Write `docs/ADR/` entries for:
   - The `/api/v2` versioning rule.
   - Generated TypeScript types.
   - The Postgres job queue.
   - The tenant-isolation model.
   - The 13+ age policy.

**Done when:**
- Staging serves the current app at its own URL.
- `docs/DATA_SOURCES.md` lists every source as verified, or flagged for Akram.
- Fixtures are committed.
- Akram approves.

### Phase 1: Foundations and design system

**Tasks**
1. **Design system** in `webapp/frontend/app/globals.css` and `components/ui/`:
   - Color tokens.
   - Type scale (a display font plus a mono font for data, through `next/font`).
   - Spacing, radius, elevation and motion tokens.
   - Components: Button, Card, Tabs, Toggle, Sheet (mobile bottom sheet), Stat, Badge, Skeleton, ErrorState, EmptyState.
   - Load the `frontend-design` skill for direction: a premium, cinematic deep-space look, never templated.
2. **App shell:** new nav for Explore (home), Solar System, Exoplanets, Missions, Hunt, Learn, and Classroom (later). Mobile uses a bottom tab bar; desktop uses a top bar.
3. **Candidates page:** card layout on mobile, table on desktop. This fixes the overflow.
4. **Units:**
   - A `lib/units.ts` module with tested conversions between °F, °C and K, and between miles, km and AU, plus light-time.
   - A global units preference that defaults to miles and °F and persists in `localStorage` (try/catch guarded).
5. **Backend foundations:**
   - A `/api/v2` router.
   - SQLAlchemy and Alembic wired to `DATABASE_URL`, with an empty first migration.
   - `/api/v2/health` that reports database connectivity.
   - The v1 endpoints stay unchanged.
6. **Type generation:**
   - An `openapi-typescript` script, with the generated file committed.
   - A CI step that regenerates it and fails on any diff.
7. **Testing setup:**
   - Playwright with mobile (375×812) and desktop projects, plus axe accessibility checks on every page.
   - Add these to CI.
   - Keep the existing QA scripts working.

**Done when:**
- CI is green, including the type-freshness check, Playwright on both viewports, and zero serious or critical axe violations.
- The staging home and candidates pages look right on Akram's phone.
- The v1 QA suite still passes against staging.

### Phase 2: Live data layer

**Tasks**
1. **Postgres table `external_cache`** with columns `key`, `payload` (JSON), `source`, `fetched_at` and `expires_at`. Fetchers use `httpx` with timeouts and retries. If an upstream service fails, serve the last good copy with a `stale: true` flag; never return an empty error page.
2. **Endpoints**, each with Pydantic models, `source` and `kind` fields, and cache headers:
   - `GET /api/v2/bodies`: Sun, the planets, the Moon and Pluto from the NASA Fact Sheet. Temperatures (mean, min and max where given) in K, °C and °F, plus radius, mass, day length and orbital distance. These are stable values bundled as a versioned JSON file with their source.
   - `GET /api/v2/positions?date=YYYY-MM-DD`: heliocentric positions. Use the cached JPL Horizons data for today; for other dates, compute from Keplerian elements and label the result `computed`.
   - `GET /api/v2/distances?from=earth&to=mars&date=`: the gap between two bodies, with light-time.
   - `GET /api/v2/iss`: current position, cached for 5 seconds.
   - `GET /api/v2/apod` and `GET /api/v2/space-weather`.
   - `GET /api/v2/exoplanets/latest` and `GET /api/v2/exoplanets/{name}`: systems with star temperature, planet orbits and equilibrium temperature. Where a value is missing, compute it and label it `estimate`.
3. **Cron service:** a daily refresh of Horizons, the Exoplanet Archive, APOD and space weather.
4. **Explore home page:**
   - Live tiles: ISS now, today's picture, the latest confirmed exoplanet count, space-weather alerts.
   - "Last updated" times, plus skeleton and stale states.

**Done when:**
- The fixture-based tests pass offline.
- One live smoke test per source runs on staging.
- Every value on the home page shows its source on tap.
- Killing network access in tests produces stale-but-working responses.

### Phase 3: 3D solar system

**Tasks.** Page `/solar-system`, built with React Three Fiber and lazy-loaded.
1. The Sun and 8 planets plus Pluto at real positions for the selected date.
2. Two scale modes: "easy view" (compressed) and "true scale". True scale is the default lesson on how empty space is.
3. **Tap a planet** to open a bottom sheet showing:
   - Temperature in the user's unit, with a range where it applies.
   - Distance from the Sun.
   - The gap to the previous and next planet.
   - Distance from Earth today.
   - Light-time.
   - Day and year length.
   - A source link on every value.
4. **Tap empty space** to show the deep-space card: about 2.7 K (−455°F, −270°C) cosmic background, with a short explanation that a vacuum has no air to carry temperature.
5. **Measure mode:** tap two bodies to draw a line with the distance between them in the user's unit.
6. **Tour mode:** Next and Back buttons move Sun → Neptune, one fact and one optional quiz question per stop.
7. A date slider and a "today" button. Unit toggles in the header.
8. **Fallbacks:** a 2D top-down orbit view when WebGL is unavailable, and reduced motion when the user asks for it.

**Done when:**
- Playwright covers tap → card, measure, tour Next and Back, unit switching, and the WebGL-off fallback.
- Unit tests check that conversion and distance math match JPL values to within a stated tolerance.
- The first meaningful paint stays under budget, with 3D loaded after.
- Akram checks it on his phone.

### Phase 4: Exoplanet systems, sky map, TESS explainer, mission tracker

**Tasks**
1. **`/exoplanets/[name]`:** a 3D system view.
   - The star is colored by temperature, the orbits are drawn to scale, and the habitable ("could hold water") zone is a ring, computed from star luminosity with the formula cited.
   - Planet cards work the same way as in Phase 3.
   - Includes the 8 Planet Hunter targets, linked from the candidate pages.
2. **Sky map:** Aladin Lite centered on each target star, using RA/Dec added to `results.json` by `scripts/build_results.py`, looked up from MAST once and committed. A "where in the sky" panel on each candidate page.
3. **`/missions/tess`:** a scroll-driven 3D explainer of TESS:
   - Its orbit.
   - The 4 cameras and how a sector works.
   - How a transit becomes a light curve.
   - Facts are verified against NASA TESS pages and cited.
   - Uses a NASA 3D model if its license allows (confirmed in Phase 0), otherwise a procedural model.
4. **`/missions`:**
   - The ISS on a Leaflet map, updated live every 5 s, with its ground track.
   - Cards for TESS, JWST, Voyager 1 and Voyager 2 showing distance from Earth and from the Sun (JPL Horizons), launch date, status and a source link.

**Done when:**
- Playwright covers each page on mobile.
- Cross-checks against Horizons pass within tolerance.
- The Content Security Policy is updated to allow only the required external hosts.

### Phase 5: Hunt lab (interactive light curves)

**Tasks**
1. **`scripts/export_lightcurves.py`:**
   - For each target, save the flattened and binned light curve plus the BLS periodogram as compact JSON under `webapp/backend/data/lightcurves/`, with a size budget and the binning method documented.
   - Run it locally or in a manual GitHub Actions workflow, since it needs MAST access.
2. **Endpoints:** `/api/v2/lightcurves/{slug}` and `/api/v2/periodogram/{slug}`.
3. **Interactive chart (uPlot):**
   - Zoom and pan.
   - A fold slider for the period.
   - A phase-folded view.
   - The periodogram with the peak marked.
   - This replaces the static PNGs; the PNGs stay as a fallback image.
4. **"Find the dip" challenge:** the student moves the fold slider to find the period. The app scores how close they got against the pipeline's answer and explains what an eclipsing binary looks like.

**Done when:**
- Every candidate has an interactive chart on mobile.
- The challenge scoring has tests.
- The JSON size stays within budget.

### Phase 6: Live scan engine, vetting, cross-match

**Tasks**
1. **Migrations:** tables `targets`, `scan_jobs`, `scan_runs`, `signals`, `reviews`.
2. **`POST /api/v2/scans`:**
   - Takes a TIC or TOI ID, validates it, and creates a job.
   - Rate-limited, with a cap on queued jobs.
   - A matching `GET` returns the job status.
3. **Worker service:**
   - Runs the existing flatten + BLS pipeline, reused as a module rather than copied, on all available sectors with a configurable period range.
   - Stores the results and light-curve JSON.
   - Has a timeout and a memory cap. Repeat scans come from the cache.
4. **Vetting:**
   - Odd/even depth.
   - Secondary eclipse.
   - Transit shape (V vs U).
   - Optional Transit Least Squares.
   - Each test is shown with a plain-language pass, warn or fail explanation.
5. **Cross-match:** compare each signal against the NASA Exoplanet Archive and the TOI list, so known planets and known false positives are labeled automatically.
6. **Labels:** proposed labels always show as "proposed, not reviewed" until a human review exists.
7. **UI:** a scan page with a progress state, and results that reuse the Phase 5 charts.

**Done when:**
- Rescanning TOI 700 reproduces the recorded validation (period error within 0.01%).
- The vetting tests flag the known eclipsing binary in the current set.
- Queue tests cover concurrency, with no job ever run twice.

### Phase 7: Learn and quiz

**Tasks**
1. **Content model:** Postgres tables for `lessons`, `lesson_steps`, `quizzes`, `questions` and `choices`, each with an explanation and a source. Seed from versioned files in `content/` so lessons are reviewable in PRs.
2. **Starter lessons, 6–8:**
   - What is a planet.
   - Temperature in space.
   - Distances and light-time.
   - How TESS works.
   - Transits.
   - Eclipsing binaries.
   - The habitable zone.
   - How science avoids false claims.
   - Each lesson links to the 3D views, the Hunt lab and the missions pages.
3. **Quiz engine:**
   - Multiple choice and numeric answers with tolerance.
   - An explanation after every answer.
   - Retry.
   - Badges.
4. **Progress:** stored on the device for anonymous users, and moved to the account once one exists (Phase 8).
5. **Checks:** every fact in a lesson has a cited source, and a content-lint test fails if one is missing.

**Done when:**
- Content lint, quiz-engine and Playwright tests all pass.
- Akram reads two lessons on staging and approves the tone.

### Phase 8: Accounts and multi-tenant classrooms

**Tasks**
1. **Confirm the sign-in method with Akram first** (see Decisions still open).
2. **Migrations:**
   - Tables: `organizations`, `users`, `memberships` (org_id, user_id, role), `classes`, `class_members`, `assignments`, `submissions`, `audit_log`.
   - Every classroom row carries `org_id`.
3. **Teachers:**
   - Sign up, create or join an organization, and create classes with a join code.
   - Assign lessons, quizzes and hunt challenges with due dates.
   - See a gradebook and export it as CSV.
4. **Students:**
   - Join with a class code, a nickname and a PIN.
   - No email, an age confirmation of 13+, and no free-text sharing between students.
   - Teachers can reset a PIN and remove a student.
5. **Backend enforcement:**
   - Role-based access on every endpoint through one dependency, with org scoping applied to every query.
   - Audit log entries for role changes, deletes and exports.
6. **Privacy:**
   - Store the minimum data.
   - Export and delete actions for a whole class.
   - A draft privacy notice for students and teachers, marked for attorney review.

**Done when:**
- Tests prove that a teacher in org A can't read, list or modify org B's data, and that a student can't use teacher endpoints.
- End-to-end test: a teacher creates a class, a student joins, completes an assignment, and the grade appears.
- Akram tests it on his phone with two accounts.

### Phase 9: AI explainer and billing

**Tasks**
1. **Confirm the AI provider, model and budget with Akram.** Store the key in a Railway env var.
2. **"What am I looking at?" explainer:**
   - On candidate, scan and planet pages.
   - Grounded only on that item's JSON plus the lesson content.
   - Answers must cite those fields and must say "not known" when the data doesn't have the answer.
   - Per-user and per-class rate limits, with prompt-injection hardening.
   - An eval set of at least 10 cases: grounded answers, refusals and injection attempts.
3. **Billing:**
   - Stripe in test mode.
   - A classroom plan per teacher or school (pricing confirmed with Akram).
   - Free explorer for everyone.
   - Webhook verification, and plan limits enforced in the backend.

**Done when:**
- The evals pass at the agreed threshold.
- Stripe test checkout and the webhook work on staging.
- No AI feature is reachable without rate limits.

### Phase 10: Hardening and production release

**Tasks**
1. **Security:**
   - Security headers (CSP, HSTS and others).
   - Rate limiting on every write.
   - Dependency scanning (Dependabot).
   - Error monitoring (Sentry or OpenTelemetry, asked first), plus an uptime check.
2. **Performance:** a Lighthouse budget for mobile, image optimization and code splitting for 3D.
3. **Full regression:** Playwright on mobile and desktop, axe, backend tests, the v1 QA scripts, and a fresh-clone rebuild.
4. **v1 retirement:** once the v2 frontend doesn't call v1, keep the v1 endpoints for one release with a deprecation note. Remove them in a follow-up PR.
5. **Release:**
   - PR `v2` → `main`. Akram approves.
   - Set the production env vars and run production migrations.
   - Deploy the backend, then the frontend.
   - Verify live at the existing URL.
6. **Rollback plan, written before release:** redeploy the previous Railway deployment for each service. Migrations must be backward compatible for one release.

**Done when:**
- The live site passes the full checklist.
- Akram approves on his phone.
- The status table shows every phase as `live`.

---

## 7. What Akram provides

- Railway access: a staging environment, Postgres, and worker and cron services.
- A free api.nasa.gov API key.
- Phase 8: the teacher sign-in choice, and a Resend account if email is used.
- Phase 9: an AI API key and budget, a Stripe account (test first), and pricing.
- An attorney review of the privacy notice and terms before charging schools.
- An approval at the end of every phase.

## 8. Staging URLs (filled in during Phase 0)

- Frontend:
- Backend:
