# planet-hunter web app QA report

Date: 2026-10-13. Verified locally against the running backend (FastAPI, port 8000) and the production frontend build (Next.js 15.5.4, port 3000).

## Automated test suites

- `qa/qa_backend.py`: 117 checks. Health, validation numbers, all 8 candidate rows field by field against the source `candidate_shortlist.csv`, per-slug detail, 404s for unknown slug and unknown plot, path traversal rejection, CORS allow-origin for the frontend origin, byte-identical plot serving, no em dashes or en dashes in served text, honesty labels on TOI 216 and TOI 776. Result: all pass.
- `qa/qa_frontend.py`: 100 checks. Every route and every one of the 8 detail pages returns 200, no fallback error boxes or placeholder text when the backend is up, all internal links resolve, all served images are real PNGs over 100 KB, home banner and validation numbers present, method page carries limitations and the ExoMiner++ comparison, TOI 216 and TOI 776 carry "NOT a discovery". Result: all pass.
- `qa/qa_visual.py` (Playwright + Chromium): screenshots of every route at 1440x900 and 390x844, checked for HTTP status, horizontal overflow, broken images, and console errors. Result: 0 issues across all 22 captures.
- Interactivity check (Playwright): sort by SNR descending puts rank 4 (SNR 39.7) first; the Ambiguous filter shows exactly 2 rows; detail navigation works from a filtered table; the footer repo link points to github.com/akramahmed1/planet-hunter. Result: pass.

## Bugs found and fixed

1. **Copy inconsistency on /candidates**: the intro text said "Two matched known planets cleanly" while the home page stat grid and the CSV both show 3 clean recoveries (TOI 270 c, TOI 125 b, TOI 700 c). Fixed the intro to say three. Rebuilt and re-verified.
2. **Test expectation, not an app bug**: `qa_backend.py` initially expected 404 for the trailing-slash path `/api/candidates/`; FastAPI redirects it to `/api/candidates` (200 after redirect), which is standard. Fixed the test to accept the redirect.
3. **Test script bug**: a stray `len()` on an int in `qa_visual.py` crashed the visual suite on its first run. Fixed; the suite then ran clean.

## UI/UX findings (from the screenshots)

- Desktop and mobile both render well. The sticky header collapses to a stacked layout under 760px, the stat grid goes 4 to 2 columns, and the detail page grids stack to one column.
- The candidates table scrolls horizontally inside its card on small screens instead of breaking the layout (min-width 640px plus overflow-x), and the automated overflow check confirmed no page-level horizontal overflow at 390px width.
- Badges are color coded and labeled with words (clean recovery, eclipsing binary, ambiguous, marginal, likely noise), so meaning does not depend on color alone. Contrast on the dark theme is good for all text classes.
- Folded plot images scale to their container width, keep aspect ratio, and carry descriptive alt text. Targets without plots (TOI 776, 125, 849, 178) show an explanatory note instead of a broken frame.
- One nit noticed and kept: the home page renders the validation transit depth as "2,356 ppm" (thousands separator) while SUMMARY.md writes 2356 ppm. Same number, display formatting only, and it matches how 62,074 cadences is formatted next to it. Left as is.
- `sort-btn` uses `all: unset`, so default button styling is removed; focus visibility is handled through `:focus-visible` styles. Verified keyboard-relevant classes exist. Full keyboard walkthrough was not done.

## Copy audit

- No em dashes or en dashes anywhere in UI or backend copy (checked by byte scan in both automated suites).
- No discovery claims anywhere. TOI 216 and TOI 776 are labeled "Ambiguous, needs follow-up" with "NOT a discovery" in their readouts and a "What this is NOT" note on their detail pages. TOI 1338 is labeled "Eclipsing binary, not a planet".
- Every number was checked against `candidate_shortlist.csv` and SUMMARY.md. Validation: 16.0509 vs 16.051 days, 0.001 percent error, 4 sectors, 62,074 cadences, depth 2356 ppm. Batch: all 8 rows match field by field.

## Known limitations (not bugs, by design)

- No live scan trigger: the app serves the verified 2026-10-09 run. Nothing pretends to run a new MAST scan.
- No database: the CSV file is the data store.
- The QA run above covers desktop Chromium and one mobile viewport in Chromium. No Safari or Firefox check was done locally.
