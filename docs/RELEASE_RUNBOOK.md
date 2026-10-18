# Release runbook: v2 to production (Phase 10)

Nothing here runs until Akram approves the release on his phone. Production is the Railway
`production` environment of project `planet-hunter`, which today serves `main` (v1).

## 1. Before the release

- [x] Staging check green on the `v2` commit being released, including the scan step (needs
      the staging `worker` service) and Playwright against staging. Green on 2026-10-18,
      run 39137620151 on `56eb3d3`: the real TOI 1338 scan is flagged as a known eclipsing
      binary, and Playwright passes on phone and desktop. Rerun on the final commit.
- [ ] Akram has tried on staging: two lessons (tone), a teacher and a student account on his
      phone (Phase 8), the re-reviewed TOI 175 and TOI 193 readouts.
- [x] Decisions (Akram, 2026-10-18): monitoring is Railway logs plus the uptime workflow;
      the Railway URLs stay; the explainer is on at launch, billing off.
- [ ] Explainer: `ANTHROPIC_API_KEY` and `EXPLAINER_ENABLED=1` set on staging, and the live
      eval (`python -m explain.evals --live`) meets the bar there before production.
- [ ] Legal: privacy notice reviewed by an attorney before student accounts open in
      production (ADR 0005); GPL and DSS licence flags reviewed (docs/DATA_SOURCES.md).

## 2. Production settings

Set on the production services, staged, and applied by Akram (Staging → Apply has the same
flow in the production environment):

| Service | Variable | Value |
|---|---|---|
| backend | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (production Postgres) |
| backend | `ALLOWED_ORIGINS` | the production frontend URL |
| backend | `NASA_API_KEY` | Akram's key (already set for v1) |
| backend | pre-deploy command | `alembic upgrade head` |
| worker (new) | start command `python -m scans.worker`, `DATABASE_URL`, `SCAN_TIME_LIMIT_S=900`, `SCAN_MEMORY_LIMIT_MB=3000` | |
| refresh (cron, check it exists in production) | `DATABASE_URL`, `NASA_API_KEY`, start `python -m live.refresh`, schedule `13 6 * * *` | |
| frontend | `NEXT_PUBLIC_API_BASE` | the production backend URL |

| backend | `EXPLAINER_ENABLED` | `1` (Akram's launch decision) |
| backend | `ANTHROPIC_API_KEY` | added by Akram in Railway, never in chat or git |

Not set in production (defaults are the safe values): `AUTH_SIGNUPS_PER_HOUR`,
`WRITE_LIMIT_PER_MINUTE`, `BILLING_ENABLED`, `EXPLAINER_FAKE`. Live Stripe keys are
refused by the code until a later change allows them.

## 3. Release

1. Open the PR `v2` → `main`. CI must be green. Akram approves.
2. Merge. Production deploys from `main`:
   1. backend first: the pre-deploy step runs `alembic upgrade head` (migrations 0001 to 0006,
      all additive; v1 endpoints are unchanged);
   2. worker and refresh;
   3. frontend last.
3. Verify live (section 5).

## 4. Rollback

Every migration so far only adds tables, so the previous backend runs against the new schema.

1. In Railway, open each service in `production` and choose **Redeploy** on its previous
   successful deployment: frontend first, then backend, then worker and refresh.
2. Leave the database as it is. Do not run `alembic downgrade` in production: it drops the
   new tables and their data.
3. If the release must be undone in git as well, revert the merge commit on `main` with a new
   commit (never a force-push).

Migrations must stay backward compatible for one release: a later phase that removes or
renames a column does it in two releases (stop using it, then drop it).

## 5. Live checklist

- [ ] `/api/health` and `/api/v2/health` return 200; v2 health says the database is connected.
- [ ] The v1 QA suites pass against production (`webapp/qa/qa_backend.py`, `qa_frontend.py`).
- [ ] Playwright against production (`PW_BASE_URL=... npx playwright test`), mobile and desktop,
      with axe.
- [ ] A real scan of TIC 260128333 finishes and is flagged as a known eclipsing binary.
- [ ] Lighthouse mobile budget passes on `/`, `/candidates`, `/learn`, `/solar-system`.
- [ ] The uptime workflow lists the production URLs and is green.
- [ ] Akram approves on his phone. The plan's status table moves every phase to `live`.

## 6. v1 retirement

The v2 frontend still reads v1 endpoints: `/api/candidates`, `/api/candidates/{slug}`,
`/api/overview`, `/api/validation`, `/api/method`, `/api/health` and the plot images under
`/api/plots/`. They stay for at least one release after v2 is live, with a deprecation note in the API docs; removing them is a separate PR once the frontend reads v2 only.
