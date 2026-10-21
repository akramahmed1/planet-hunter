# QA log

One row per defect or finding: found, fixed, retested. Newest first. Findings outside the current
launch task become new tasks in `docs/LAUNCH_TASKS.md`.

| Date | Task | Found | Fixed in | Retested |
|---|---|---|---|---|
| 2026-10-21 | T01 | No way to review the look of every page. Added the Playwright `screenshots-phone` (Pixel-class Chrome 390x844, scale 3, touch) and `screenshots-laptop` (1440x900) projects (`SCREENSHOTS=1`), uploaded by CI as the `screenshots` artifact. Baseline taken on `v2` `2aaad2e`. | PR #28 | Local 38 passed. CI first run failed: `/` timed out in the screenshot step (live widgets never go network-idle on the runner); fixed by bounding the wait to 4 s; CI green on the second run. Merged `30b9be4`. Staging: NOT verified, Railway incident blocks new builds (test-only change, no runtime effect). |
| 2026-10-21 | T01 | Observation, not a defect of T01: `/hunt` and an unknown candidate slug render the stock 404 (belongs to T10). Full-page phone shots show the fixed bottom nav mid-page (a full-page capture effect, not a bug). | n/a | n/a |
| 2026-10-21 | T02 | og:image and twitter:image pointed at localhost (no `metadataBase`). | PR #29 | Unit 5 cases, e2e absolute-URL check, manual build with a site URL. Staging: pending (Railway incident); must confirm `RAILWAY_PUBLIC_DOMAIN` reaches the build. |
