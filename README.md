# planet-hunter

Hunting exoplanet transits in NASA's public TESS telescope data.

All TESS and Kepler data is public on the MAST archive. This pipeline downloads light curves, detrends them, and runs a Box Least Squares search for the telltale dip of a planet crossing its star.


## Web app

The results are also live as a web app, with a FastAPI backend and a Next.js frontend, deployed on Railway:

- Live site: https://frontend-production-db96.up.railway.app
- API: https://backend-production-f88f2.up.railway.app

Source: `webapp/` in this repo. See `webapp/QA-REPORT.md` for the QA results.

### v2 (in progress)

v2 is being built phase by phase on the `v2` branch, following `docs/V2_BUILD_PLAN.md`,
and deploys to a Railway staging environment. The live site above does not change until
the final release phase.

- Staging site: https://frontend-staging-5fce.up.railway.app
- Staging API: https://backend-staging-bade.up.railway.app (new endpoints under `/api/v2`)

## How results reach the web app

`candidate_scan.py` writes `candidate_shortlist.csv`. A human reviews each target in
`results/annotations.json`, then `python scripts/build_results.py` publishes
`webapp/backend/data/results.json`, the only thing the API serves. CI fails if the
published data is stale or if the frontend types drift from the API contract.
Targets nobody has reviewed yet show as "Unreviewed". See `docs/PRODUCTION_PLAN.md`.

## Validation

Before hunting anything unknown, the pipeline proved itself on a known planet: it recovered TOI 700 c at P = 16.0509 days versus the published 16.051 days. Error: 0.001%, across 4 sectors and 62,074 cadences. See `toi700_validation_fold.png`.

## How it works

1. `validate_toi700.py` - downloads TESS light curves from MAST, detrends, runs BLS, folds and plots. The validation gate.
2. `candidate_scan.py` - batch scanner over TOI targets. Outputs a ranked shortlist (`candidate_shortlist.csv`) plus folded plots for the top candidates.

## Run it

```bash
python -m venv venv && source venv/bin/activate
pip install lightkurve astropy matplotlib numpy
python validate_toi700.py
python candidate_scan.py
```

Note: MAST can be flaky; both scripts retry with backoff.

## Rules

- Every signal is a *candidate*, never a discovery, until professional telescope follow-up. No exceptions.
- This does not beat NASA's ExoMiner++. Its value is as an independent, explainable check, and the story.

## Latest scan

8 TOI targets: recovered known planets (TOI 270 c, TOI 125 b, TOI 700 c). One unexplained signal (TOI 216) flagged as an ambiguous BLS hit, not a discovery. Correction (2026-10-18): two targets were mislabelled; the stars scanned as "TOI 776" and "TOI 849" are TOI 175 (L 98-59) and TOI 193 (LTT 9779), and are marked unreviewed until re-reviewed.

## Honest limitations

BLS cannot distinguish planets from eclipsing binaries. Only the strongest signal per target is reported. Two sectors per target, no vetting tests yet (odd/even, secondary eclipse, centroid). See SUMMARY.md.

## Roadmap

Cross-match against the NASA Exoplanet Archive and ExoMiner++ candidates before flagging anything; add vetting tests; swap BLS for Transit Least Squares; stitch all sectors; cross-check ambiguous signals on Planet Hunters TESS.