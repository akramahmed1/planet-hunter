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
| backend | `CLASSROOM_ENABLED` | leave UNSET (off) in production until the attorney-reviewed privacy notice exists; `1` in staging. Off: every classroom route answers 404 and the site hides Classroom |
| backend | pre-deploy command | `alembic upgrade head` |
| worker (new) | start command `python -m scans.worker`, `DATABASE_URL`, `SCAN_TIME_LIMIT_S=900`, `SCAN_MEMORY_LIMIT_MB=3000` | |
| refresh (cron, check it exists in production) | `DATABASE_URL`, `NASA_API_KEY`, start `python -m live.refresh`, schedule `13 6 * * *` | |
| frontend | `NEXT_PUBLIC_API_BASE` | the production backend URL |
| frontend | `NEXT_PUBLIC_SITE_URL` | the public site address, for share cards (or give the service a public domain; the build fails on Railway if neither exists) |

| backend | `EXPLAINER_ENABLED` | `1` (Akram's launch decision) |
| backend | `EXPLAINER_MONTHLY_CAP_USD` | `20` (the default; Akram's approved cap). Spend over the month, counted from the provider's own token usage (`explainer_spend` table), pauses the explainer quietly at the cap and resets on the 1st (UTC). Also set the matching hard cap in the provider's console. An unreadable or zero value means no spending. A model with no price in `explain/prices.py` is not called unless `EXPLAINER_PRICE_INPUT_PER_MTOK` and `EXPLAINER_PRICE_OUTPUT_PER_MTOK` are set |
| backend | `EXPLAINER_PROVIDER` | `anthropic` (default), `openai` or `openai_compatible`. One provider at a time; there is no automatic fallback to another provider |
| backend | `EXPLAINER_MODEL` | Model name for the chosen provider. Default for anthropic is `claude-opus-5-5`. Any other model is refused until `EXPLAINER_APPROVED_MODEL` is set to `<provider>:<model>`, and that is set only after the 12 case eval passes for that provider and model |
| backend | `EXPLAINER_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Provider key. Railway variables only, never in code or chat |
| backend | `EXPLAINER_BASE_URL` | Only for `openai_compatible`. Must be https (plain http only for localhost) |
| backend | `EXPLAINER_RESPONSE_FORMAT` | Optional for `openai_compatible`; default asks for a JSON object |
| backend | `EXPLAINER_ALLOW_UNAPPROVED` | `1` lets a not yet approved model run, for running the eval only. Never set in production |
| backend | `EMAIL_PROVIDER` | `resend` (default, the one real sender). `memory` is for tests only and must never be set in production. With nothing configured no email is sent and callers are told so |
| backend | `EMAIL_API_KEY` | Resend API key. Railway variable only, never in code or chat. Create it with sending access only |
| backend | `EMAIL_FROM` | Sender, for example `Planet Hunter <hello@yourdomain>`. The domain must be verified at Resend (SPF and DKIM records) or mail lands in spam. Names the provider in the privacy notice as a processor |
| backend | `APP_BASE_URL` | Public address of the website, for example `https://planethunter.example` (no path, no trailing slash). Password reset emails link to `<APP_BASE_URL>/classroom/reset#token=...`. If unset or not https (http only for localhost) no reset email is sent |
| backend | `TOTP_ENCRYPTION_KEY` | 32 random bytes in base64 (`openssl rand -base64 32`). Encrypts teachers' authenticator secrets in the database (AES-256-GCM). Set it once, only in Railway, and keep a copy in the team password manager: **if it is lost or changed, every teacher who turned on two-step sign-in is locked out until an operator clears their setting** (see below). Without it, teachers cannot turn two-step on and sign-in is unchanged |
| backend | `ANTHROPIC_API_KEY` | added by Akram in Railway, never in chat or git |

Not set in production (defaults are the safe values): `AUTH_SIGNUPS_PER_HOUR`, `AUTH_FORGOT_PER_HOUR`,
`WRITE_LIMIT_PER_MINUTE`, `BILLING_ENABLED`, `EXPLAINER_FAKE`. Live Stripe keys are
refused by the code until a later change allows them.

## 3. Release

1. Open the PR `v2` → `main`. CI must be green. Akram approves.
2. Merge. Production deploys from `main`:
   1. backend first: the pre-deploy step runs `alembic upgrade head` (migrations 0001 to 0013,
      all additive, checked 2026-10-22: none drops or renames anything while upgrading; v1 endpoints are unchanged);
   2. worker and refresh;
   3. frontend last.
3. Verify live (section 5).

## 3b. Production database: backups and the restore drill (T47)

Akram applies these in Railway (this session cannot reach it, and has no Railway login):
1. In the `production` environment, add a **Postgres** service (same major version as staging). Name it `Postgres`.
2. Turn on **backups** for that service (Railway: the service's Backups tab, daily; keep the longest retention the plan
   allows) and note the retention period here: `____` days. A backup nobody has restored is only a hope: do the drill.
3. **Restore drill, on staging first** (before the release): create an EMPTY scratch database next to staging's (a
   second database on the staging Postgres, or a throwaway Postgres service), then run
   `SOURCE_DATABASE_URL=<staging url> TARGET_DATABASE_URL=<scratch url> scripts/restore_drill.sh`
   from any machine with `pg_dump`, `pg_restore` and `psql`, taking the two URLs from Railway's variables (never paste them
   into chat or commit them). It dumps staging, restores into the scratch database and compares the row count of every
   table. It refuses to run if the target is not empty or is the same database. Write the date, the result line
   ("OK: N tables, every row count matches") and who ran it in `docs/QA_LOG.md`.
4. Also restore one **Railway backup** (not just a dump) into a scratch service once, to prove the provider's own
   backups can be restored, and note how long it took.
5. Rehearsed on 2026-10-22 against a local copy only: dump, restore and compare of a migrated database with sample
   rows: OK, 37 tables, every row count matches. That proves the script, not Railway's backups.

Staging Postgres is not production: do not restore anything over production except as a recovery decision by Akram.

## 4. Rollback

Every migration so far (0001 to 0013) only adds tables or columns, so the previous backend runs against the new schema.

1. In Railway, open each service in `production` and choose **Redeploy** on its previous
   successful deployment: frontend first, then backend, then worker and refresh.
2. Leave the database as it is. Do not run `alembic downgrade` in production: it drops the
   new tables and their data.
3. If the release must be undone in git as well, revert the merge commit on `main` with a new
   commit (never a force-push).

Rehearsed 2026-10-22 on a scratch database: `alembic upgrade head` to 0013, `alembic downgrade base` (all 37 tables
removed), `alembic upgrade head` again: the schema is identical afterwards (compared with `pg_dump --schema-only`). This
shows the migrations go both ways on an empty database; it does NOT make a downgrade safe in production (it deletes
data), so the rule above stands: redeploy, do not downgrade. The Railway "Redeploy previous deployment" step itself has
NOT been rehearsed: it needs Railway, and production is off limits until Akram approves. Do it once on staging
before the release and write the date here: `____`.

Features that can be switched off without a redeploy: `CLASSROOM_ENABLED` (everything for signed-in people),
`EXPLAINER_ENABLED` (the explainer). Removing the mail settings stops all email, including alert emails (T41).

Migrations must stay backward compatible for one release: a later phase that removes or
renames a column does it in two releases (stop using it, then drop it).

## 5. Live checklist

Checks that exist as workflows and run against staging first (T44, T46; see `docs/SECURITY_SCAN.md`): the ZAP baseline
scan ("Security scan"), the k6 load test ("Load test (staging)"), and Firefox and WebKit browser runs inside CI.
Re-run the first two on the release commit and read the results before approving.

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

## Two-step sign-in: a teacher is locked out (operator steps)

A teacher who has lost both their phone and their recovery codes cannot sign in. Only the repository owner does this,
after checking who they are by a route other than the account email (for example through the school's admin), on the
production database, in a transaction:

```sql
begin;
update users set totp_secret_enc = null, totp_enabled_at = null, totp_last_step = null where id = :USER;
delete from recovery_codes where user_id = :USER;
delete from login_challenges where user_id = :USER;
commit;
```

The teacher then signs in with their password and can set two-step up again. Note the date and who asked in the private
deletion and access log.

