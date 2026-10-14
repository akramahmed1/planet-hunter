# Claude Code runbook: planet-hunter Phase 1 (contract sync)

Branch: `claude/p1-contract-sync`. Goal: verify Phase 1 end to end on this
machine, open the PR, get CI green, get Akram's approval, merge, deploy, and
verify live. Follow the loop plan → approve → build → verify-live → PR → merge.

## Ground rules

- Stay in scope: only what this runbook lists. Anything else goes in a note at
  the end, not into the code.
- If a test fails, fix the root cause. Never weaken, skip or delete a test to
  get green.
- Never commit secrets or `.env` files.
- Stop and ask Akram whenever something is ambiguous or a step would touch
  production in a way this runbook does not describe.

## 1. Plan (show Akram, wait for "go")

Print a short plan of steps 2 to 8 and wait for approval before running them.

## 2. Preflight

```bash
git fetch origin && git checkout claude/p1-contract-sync && git pull
gh auth status          # must be logged in as akramahmed1
python3 --version       # 3.12 recommended
node --version          # 22 recommended
```

## 3. Backend checks

```bash
cd webapp/backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
python ../../scripts/build_results.py --check
python -m pytest -q        # expect all contract and API tests to pass
cd ../..
```

## 4. Frontend checks

```bash
cd webapp/frontend
npm ci
npm run typecheck
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000 npm run build
cd ../..
```

## 5. Local end-to-end

Start both services, then run every QA suite against them:

```bash
(cd webapp/backend && . .venv/bin/activate && uvicorn app:app --port 8000) &
(cd webapp/frontend && NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000 npm run start -- --port 3000) &
python3 webapp/qa/qa_backend.py http://127.0.0.1:8000
python3 webapp/qa/qa_frontend.py http://127.0.0.1:3000 http://127.0.0.1:8000
python3 webapp/qa/qa_visual.py      # needs Playwright: pip install playwright && playwright install chromium
```

Also open http://127.0.0.1:3000/method and confirm the ExoMiner++ section shows the
note served by the API. Then stop the backend and reload a page: it must show
the "could not be loaded" error box, not stale numbers. Restart the backend.

Fix any failure, commit with a clear message, and rerun until everything passes.

## 6. Pull request

```bash
git push
gh pr create --base main --head claude/p1-contract-sync \
  --title "Phase 1: single source of truth, typed API contract, CI" \
  --body-file docs/PRODUCTION_PLAN.md
gh pr checks --watch     # all CI jobs must be green
```

## 7. Approval checkpoint (stop here)

Show Akram: test counts per suite, CI status, and the two deploy notes below.
Do not merge until he says "approve merge".

Deploy notes:
- The API response shape changed (`/api/candidates` now nests `run` and
  `summary`), so backend and frontend must deploy together.
- The backend needs `ALLOWED_ORIGINS=https://frontend-production-db96.up.railway.app`.

## 8. Merge, deploy, verify live

```bash
gh pr merge --squash --delete-branch
```

1. Find out how Railway deploys (`railway status`, or the Railway dashboard): auto
   from `main`, or manual. If unclear, ask Akram.
2. Set `ALLOWED_ORIGINS` on the backend service (Railway CLI
   `railway variables --set "ALLOWED_ORIGINS=https://frontend-production-db96.up.railway.app"`
   with the backend service selected, or ask Akram to set it in the dashboard).
3. Deploy the backend, then the frontend.
4. Verify live:

```bash
curl -s https://backend-production-f88f2.up.railway.app/api/health   # version 1.1.0, candidate_count 8
curl -s https://backend-production-f88f2.up.railway.app/api/method | grep -c exominer_note   # 1
python3 webapp/qa/qa_backend.py https://backend-production-f88f2.up.railway.app
python3 webapp/qa/qa_frontend.py https://frontend-production-db96.up.railway.app https://backend-production-f88f2.up.railway.app
```

If live verification fails and cannot be fixed quickly: `git revert` the merge
commit on `main`, push, redeploy both services, and tell Akram what failed.

## Done report

Finish with: PR link, merge commit, CI result, local and live QA results, and any
out-of-scope notes.
