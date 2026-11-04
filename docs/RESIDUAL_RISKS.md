# Residual risks and what is left (written 2026-10-22, for Akram's decision)

This is the list you read before approving the release. It is plain on purpose. Nothing here says "100 percent correct":
it says what was checked, what was not, and what only you can do. Production is untouched and release PR #18 is not merged.

## 1. Where things stand
- Every launch task T01 to T48 is built and merged into `v2`, each with its own tests, in small pull requests that merged only
  when all CI checks were green. The newest `v2` commit is the one to release-test.
- CI on every change: backend tests (470+), unit tests (133), typecheck, build, size budget, browser tests in Chrome (phone
  and desktop), Firefox and Safari's engine on the main flows, accessibility (axe) on every route, Lighthouse, CodeQL,
  dependency audits (0 vulnerabilities), secret scan.
- Real staging measurements taken so far (2026-10-22, staging running an OLDER build): security scan 0 failures and nothing
  High; load test no failed requests, 95% of answers under 46 ms at about 16 to 23 requests a second.

## 2. NOT verified, and why
1. **Staging consistency (resolved 2026-10-26).** The backend had been stuck on `2aaad2e` because its image never copied the
   `watch` package (`ModuleNotFoundError: No module named 'watch'`), fixed in #75. Railway shows backend, frontend, worker,
   refresh and Postgres on staging all live, all running `1b65b04`. The strict staging check on `1b65b04` (2026-10-23) failed
   only on `/api/v2/apod` (NASA 503); see the newest run in the QA log for the re-run.
2. **No real email has ever been sent** (password reset, email confirmation, alert emails). Needs your Resend account,
   a verified sending domain, `EMAIL_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL`.
3. **The explainer has only run against the fake model.** It needs your provider key, a matching hard cap in the provider's
   console, and the 12 case eval passing for that model. It is OFF in production until then (the page hides it).
4. **No real phone, Chromebook or screen reader.** Everything was tested in emulated browsers. Two things to look at on a real
   phone: the Method page slide-in (a test once saw the first frame late) and the sky atlas (below).
5. **The sky atlas (Aladin Lite) was only tested against a stand-in**, because my sandbox cannot reach CDS. Open one
   candidate page with the real viewer on phone and laptop: do the marker and ring draw, do the field buttons work?
6. **Load and security scans were light.** The scan saw only the staging frontend (not the backend's own headers, not
   signed-in pages) on an older build. The load test is a small short test of one small instance; it is not a capacity
   figure for production.
7. **Production database, backups and the restore drill** (T47) are written down and the script is rehearsed locally, but
   need you in Railway. The Railway "redeploy previous deployment" rollback has not been rehearsed.
8. **Every Phase 6 number above came from an older staging build**; repeat the scan and the load test on the release
   candidate (they run from Actions, "Security scan" and "Load test (staging)").

## 3. Known risks I am carrying (small, listed so they are not a surprise)
- **Bigger first load after the Next 16 upgrade:** about 30 KB more JavaScript (solar page 124 to 154 KB, home page 122 to 150 KB
  gzipped; limit 200 KB). Slower on a weak phone and a slow network; not measured on a real one.
- **CSP still allows inline scripts and styles** (Next.js needs them; fixing it means per-request nonces on every page). Everything
  else in the policy is tight.
- **Tests that were flaky in CI and are now fixed or explained:** tap size of the flat solar and exoplanet maps on a short
  phone (real small targets, fixed), the page slide-in test, the search shortcut test, WebKit being slow on CI (longer limits).
  The browser install step on GitHub is slow (10 to 14 minutes) and is the usual reason a CI run takes long.
- **A page's first frame can come late on a slow machine** (the motion test saw it once); harmless but worth a real-phone look.
- **Forgot-password timing:** a known address does a little more database work than an unknown one before replying (milliseconds).
- **Teacher two-step sign-in has no QR code** (key and phone link only). Teacher home has no per-student drill down.
- **Home globe** has Natural Earth continents and an atmosphere glow since #78; a NASA Blue Marble layer would still need a network that can reach NASA.
- **Alert emails (T41):** one email per change per person, failures are not retried (a missed alert beats a repeated one).
- **Production stays safe by default:** Classroom is OFF in production (`CLASSROOM_ENABLED` unset), the explainer is OFF until
  you add a key, and mail sends nothing until configured.

## 4. Decisions and tasks only you can do
1. Staging backend deployment: checked and healthy on 2026-10-26 (see section 2, point 1). Decide: wait for NASA or re-run the staging gate by hand.
2. Rotate every key per `docs/INCIDENT_RAILWAY_2026-10-21.md` and note the date.
3. Attorney review of the privacy notice, and answers to the ASK items in `docs/DATA_DELETION.md` (24 months of progress
   data, response time, identity check, backup retention, nicknames in the audit log).
4. Email: Resend account, verified domain, the three variables. AI provider key and cap.
5. A real-phone pass (and Chromebook if you have one): home, a candidate page, the sky atlas, Learn, Classroom sign-up, search.
6. Production Postgres, backups and the restore drill (runbook section 3b).
7. Hosting: Vercel Hobby is non-commercial only; decide with the Railway question.
8. Written approval, only after reading this list and seeing a green run of everything on ONE release candidate commit.

## 5. What happens after you approve
Per `docs/RELEASE_RUNBOOK.md`: open the release from `v2` to `main` (PR #18), CI green, merge, backend then worker and
refresh then frontend, live checklist (section 5 of the runbook), rollback is "redeploy the previous deployment" (do not
downgrade the database). No code changes after the release candidate is chosen; a change means re-running the gate for
what it touches.
