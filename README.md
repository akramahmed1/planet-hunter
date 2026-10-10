# planet-hunter

Hunting exoplanet transits in NASA's public TESS telescope data.

All TESS and Kepler data is public on the MAST archive. This pipeline downloads light curves, detrends them, and runs a Box Least Squares search for the telltale dip of a planet crossing its star.

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

8 TOI targets: recovered known planets (TOI 270 c, TOI 125 b, TOI 700 c). Two unexplained signals (TOI 216, TOI 776) flagged as ambiguous BLS hits, not discoveries.

## Honest limitations

BLS cannot distinguish planets from eclipsing binaries. Only the strongest signal per target is reported. Two sectors per target, no vetting tests yet (odd/even, secondary eclipse, centroid). See SUMMARY.md.

## Roadmap

Cross-match against the NASA Exoplanet Archive and ExoMiner++ candidates before flagging anything; add vetting tests; swap BLS for Transit Least Squares; stitch all sectors; cross-check ambiguous signals on Planet Hunters TESS.
