# Verification of prior status claims (2026-11-03)

Every row was checked in this session. Evidence is the command or tool call and what it returned. Nothing was applied, merged or changed in Railway or GitHub.
Production (`main`, Railway `production`) was only read.

| # | Claim | Result | Evidence |
|---|---|---|---|
| 1 | `main` is f7e25f3 and production runs it | **CONFIRMED** (with a note) | `git rev-parse origin/main` = `f7e25f30...`. Railway `list-deployments`, production env `8f01f6bd`: backend and frontend, status SUCCESS, commit `f7e25f3`. Note: production has only those two services (no Postgres, worker or refresh), and a **staged, unapplied** Railway patch (created 2026-10-27) holds 6 variable changes (names only: NASA_API_KEY, EMAIL_API_KEY, ANTHROPIC_API_KEY on backend; ANTHROPIC_API_KEY, EMAIL_API_KEY added and RESEND_API_KEY removed as shared variables). It must be reviewed before anyone applies it: it would put an AI key in production while the explainer flag and Classroom flag are not set. |
| 2 | `v2` is 56cb046 and both staging services report it | **CONFIRMED for v2 and Railway records; UNKNOWN for what the services report about themselves** | `git rev-parse origin/v2` = `56cb046a...`. Railway `list-deployments` (Staging env `29dafcd8`): backend, frontend, worker, refresh all SUCCESS on `56cb046` (deployed 2026-10-29). `environment-status` Staging: 5 services, 0 with issues. This session's network blocks the staging host (`curl` gave proxy 403), so I could not read the commit from the live health endpoint. |
| 3 | PR #18 open and unmerged; PR #84 open | **CONFIRMED** | GitHub API: #18 `state=open, merged=false`, head `56cb046`, base `main`. #84 `state=open, merged=false`, head `95535f6`, base `v2`. |
| 4 | Number of merged PRs | **CONFIRMED by API, no earlier figure to compare** | `gh api repos/.../pulls?state=closed --paginate`: 82 closed, 82 merged (81 into `v2`, 1 into `main`), 0 closed unmerged. #18 and #84 are open. |
| 5 | Anthropic key is set on staging backend | **CONFIRMED (name only)** | Railway `list-variables` Staging backend lists `ANTHROPIC_API_KEY`. Value not read. Whether the key is valid or has a spend cap set at the provider is **UNKNOWN**. |
| 6 | Stage B items on v2 | see below | |
| 7 | Stage C | **NOT DONE** | see below |
| 8 | CodeQL on #18 and whether #84 fixes them | **PARTLY WRONG** | see below |
| 9 | Staging check, explainer eval, scan check, load test on the v2 head | **WRONG / UNKNOWN** | see below |

## 6. Stage B (code on v2 `56cb046`)
| Item | Result | Evidence |
|---|---|---|
| B1 metadataBase | CONFIRMED present | `webapp/frontend/app/layout.tsx:36` `metadataBase: siteUrl()`. Behaviour in production not run. |
| B2 CLASSROOM_ENABLED | CONFIRMED present | `webapp/backend/classroom/flags.py`, `tests/test_classroom_flag.py`, `e2e/classroom-off.spec.ts`. Production variable absent from the production service (staged patch does not set it). |
| B3 explainer spend caps | CONFIRMED present | `explain/spend.py`, `explain/prices.py`, runbook row for `EXPLAINER_MONTHLY_CAP_USD`. The cap at the provider console: UNKNOWN. |
| B4 to B6 polish | PARTLY CHECKED | Bug-batch work is logged in `docs/QA_LOG.md` (2026-10-27/28). I did not re-verify each polish item in a browser. |
| B7 CI Postgres version | CONFIRMED | `.github/workflows/ci.yml` lines 31 and 98: `postgres:18`. |
| B8 runbook update | CONFIRMED present; one blank | Runbook has Classroom flag, spend cap and backup sections. Backup retention is still `____ days` (section 3b step 2). |

## 7. Stage C (status only)
- Production Postgres with backups: **not done**. Production env has no Postgres service.
- Restore drill on staging: **not recorded**. The only rehearsal in the runbook (2026-10-22) was against a local copy. Railway's own backup restore: no record.
- Production settings staged: **only partly**. The staged patch holds 3 API-key variables and none of the runbook section 2 settings (`DATABASE_URL`, `ALLOWED_ORIGINS`, worker and refresh services).

## 8. CodeQL
- On `56cb046` (the PR #18 head) the CodeQL check reports "No new alerts in code changed by this pull request". The 6 alerts (3 high, 3 medium) in `docs/QA_LOG.md` (2026-10-27) were on an older head. I cannot list repository alerts (API 403, the token lacks code-scanning access), so the current open count is **UNKNOWN**.
- PR #84 head `95535f6`: CodeQL **fails** with 1 new high alert at `webapp/backend/api_v2/phase5_routes.py:29` (path built from a user value). **#84 does not resolve it.**
- PR #84 also **breaks the backend**: `import re` was inserted above the module docstring and above `from __future__ import annotations` in `phase9_routes.py`, a SyntaxError (`from __future__ imports must occur at the beginning of the file`). CI jobs "Backend contract + API tests" and "Frontend typecheck + build" fail on it, and the browser job was skipped. Do not merge #84 as it stands.

## 9. Gates on the v2 head `56cb046`
- CI (push and pull request) and Security: **green**.
- Staging check (run 40907897751): **RED**. APOD no longer fails. It now fails at "Playwright against staging": 5 failed, 540 passed, 89 skipped: `cosmos.spec.ts:19` (mobile), `explain.spec.ts:66` (mobile, desktop), `two-factor.spec.ts:29` (mobile, desktop). The statement in the PR #18 body that the check is red only on `/api/v2/apod` is **stale**.
- Explainer eval, scan check (TOI 700, TOI 270): **no run exists on `56cb046`** (none in the 100 latest Actions runs).
- Load test and ZAP: last runs 2026-10-27 on `a7083c9` (success). Not on the current head.
- The ISS trail test `iss-board.spec.ts:57` did not fail in the CI or staging runs on `56cb046`. Its earlier failure (QA log 2026-10-27) is not reproduced on this head.

## Corrections made
- `docs/HANDOVER.md` section 1: `v2` row updated from `4a28346` to `56cb046` and the merged-PR counts added.
- To fix on the PR #18 body (not edited here): the "Verified as of 2026-10-26, head 1b65b04" block and the "red only on APOD" statement are stale.

## Could not verify
Live staging health and commit (network blocked); staging logs (not yet read); open CodeQL alert list (403); Anthropic key validity and provider-side spend cap; Stripe state; production backups.
