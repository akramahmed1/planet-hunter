# QA log

One row per defect or finding: found, fixed, retested. Newest first. Findings outside the current
launch task become new tasks in `docs/LAUNCH_TASKS.md`.

| Date | Task | Found | Fixed in | Retested |
|---|---|---|---|---|
| 2026-10-21 | T01 | No way to review the look of every page. Added the Playwright `screenshots-phone` (Pixel-class Chrome 390x844, scale 3, touch) and `screenshots-laptop` (1440x900) projects (`SCREENSHOTS=1`), uploaded by CI as the `screenshots` artifact. Baseline taken on `v2` `2aaad2e`. | PR for T01 | Local: 38 passed (36 pictures). Staging: pending merge. |
| 2026-10-21 | T01 | Observation, not a defect of T01: `/hunt` and an unknown candidate slug render the stock 404 (belongs to T10). Full-page phone shots show the fixed bottom nav mid-page (a full-page capture effect, not a bug). | n/a | n/a |
