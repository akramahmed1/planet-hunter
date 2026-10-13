# planet-hunter web API
# FastAPI app serving verified results from the exoplanet transit pipeline.
# Data is read from candidate_shortlist.csv (parent folder, with bundled fallback)
# and from facts documented in SUMMARY.md. Nothing here runs a live MAST scan.

import csv
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parent.parent  # ~/workspace/reverse-engineering/exoplanet-hunt
CSV_PRIMARY = PROJECT_ROOT / "candidate_shortlist.csv"
CSV_FALLBACK = HERE / "candidate_shortlist.csv"
PLOT_DIRS = [
    PROJECT_ROOT,            # plots live next to the CSV in the project root
    HERE / "plots",
]
PLOT_FILES = {
    "toi700_validation_fold.png",
    "top1_TIC_260128333_fold.png",
    "top2_TIC_259377017_fold.png",
    "top3_TIC_55652896_fold.png",
}

# Classification derived from the readouts in SUMMARY.md (2026-10-09 run).
CLASSIFICATIONS = {
    "TOI 1338": ("eclipsing-binary", "Eclipsing binary, not a planet"),
    "TOI 270": ("clean-recovery", "Clean recovery"),
    "TOI 216": ("ambiguous", "Ambiguous, needs follow-up"),
    "TOI 776": ("ambiguous", "Ambiguous, needs follow-up"),
    "TOI 700": ("clean-recovery", "Clean recovery"),
    "TOI 125": ("clean-recovery", "Clean recovery"),
    "TOI 849": ("marginal", "Marginal"),
    "TOI 178": ("likely-noise", "Likely noise"),
}

READOUTS = {
    "TOI 1338": (
        "Matches the host stars' 14.6 d eclipsing-binary period, NOT the planet "
        "(TOI 1338 b is about 95 d). Correctly found the strongest signal; it is stellar. "
        "Candidate signal, needs professional follow-up."
    ),
    "TOI 270": (
        "Matches published TOI 270 c (5.66 d). Clean recovery of a known planet signal. "
        "Candidate signal, needs professional follow-up."
    ),
    "TOI 216": (
        "Unexplained. Known planets are at 17.16 d and 34.56 d. Possible aliasing "
        "between the two, or a false positive. V-shaped dip suggests binary contamination. "
        "Candidate signal, needs professional follow-up. NOT a discovery."
    ),
    "TOI 776": (
        "Unexplained. Known planets are near 8.25 d and 15.7 d. Could be a harmonic "
        "or a false positive. Candidate signal, needs professional follow-up. NOT a discovery."
    ),
    "TOI 700": (
        "TOI 700 c again, consistent with the validation run. Clean recovery of a "
        "known planet signal. Candidate signal, needs professional follow-up."
    ),
    "TOI 125": (
        "Matches published TOI 125 b (4.65 d). Clean recovery of a known planet signal. "
        "Candidate signal, needs professional follow-up."
    ),
    "TOI 849": (
        "Near published TOI 849 b (0.765 d) but 3.5 percent off and very weak "
        "(SNR 4.2). Marginal at best. Candidate signal, needs professional follow-up."
    ),
    "TOI 178": (
        "Weak (SNR 1.5), likely noise. No known planet at this period. "
        "Candidate signal, needs professional follow-up."
    ),
}

# Folded plot PNGs produced by the real pipeline runs. Only the top 3
# candidates and the validation run have plots.
PLOT_BY_TARGET = {
    "TOI 1338": "top1_TIC_260128333_fold.png",
    "TOI 270": "top2_TIC_259377017_fold.png",
    "TOI 216": "top3_TIC_55652896_fold.png",
    "TOI 700": "toi700_validation_fold.png",
}


def _csv_path() -> Path:
    if CSV_PRIMARY.exists():
        return CSV_PRIMARY
    return CSV_FALLBACK


def _slug(target: str) -> str:
    return target.lower().replace(" ", "-")


def _load_candidates() -> list[dict]:
    rows: list[dict] = []
    with open(_csv_path(), newline="") as f:
        for row in csv.DictReader(f):
            target = row["target"]
            classification, label = CLASSIFICATIONS.get(target, ("ambiguous", "Ambiguous"))
            plot_file = PLOT_BY_TARGET.get(target)
            rows.append(
                {
                    "rank": int(row["rank"]),
                    "target": target,
                    "slug": _slug(target),
                    "tic": row["tic"],
                    "period_d": float(row["period_d"]),
                    "duration_d": float(row["duration_d"]),
                    "depth_ppm": int(row["depth_ppm"]),
                    "snr": float(row["snr"]),
                    "bls_power": float(row["bls_power"]),
                    "n_cadences": int(row["n_cadences"]),
                    "classification": classification,
                    "classification_label": label,
                    "readout": READOUTS.get(target, row["note"]),
                    "plot_url": f"/api/plots/{plot_file}" if plot_file else None,
                }
            )
    rows.sort(key=lambda r: r["rank"])
    return rows


VALIDATION = {
    "target": "TOI 700",
    "tic": "TIC 150428135",
    "planet": "TOI 700 c",
    "recovered_period_d": 16.0509,
    "published_period_d": 16.051,
    "period_error_pct": 0.001,
    "sectors": 4,
    "n_cadences": 62074,
    "depth_ppm": 2356,
    "search_period_min_d": 1.0,
    "search_period_max_d": 40.0,
    "data": "NASA TESS 2-minute cadence PDCSAP light curves",
    "archive": "MAST archive, free, no key",
    "plot_url": "/api/plots/toi700_validation_fold.png",
}

METHOD = {
    "data_source": {
        "mission": "NASA TESS (Transiting Exoplanet Survey Satellite)",
        "curves": "2-minute cadence PDCSAP light curves",
        "archive": "MAST archive, free, no key required",
        "stack": "Python 3.12, lightkurve 2.6.0, astropy 8.0.1 (Box Least Squares)",
    },
    "steps": [
        {
            "title": "Download",
            "body": (
                "Pull light curves for a target from the MAST archive with the "
                "lightkurve package. The validation used 4 TESS sectors of TOI 700 "
                "(62,074 cadences). The batch scan used 2 sectors per target."
            ),
        },
        {
            "title": "Detrend",
            "body": (
                "Remove the slow drift in a star's brightness with a Savitzky-Golay "
                "filter and drop outlier points. This leaves the short, sharp dips "
                "that a transiting planet would cause."
            ),
        },
        {
            "title": "Search with Box Least Squares",
            "body": (
                "Box Least Squares (BLS) in astropy tests thousands of candidate "
                "periods from 1 to 40 days and looks for a repeating box-shaped "
                "dip. The strongest periodogram spike is the reported signal."
            ),
        },
        {
            "title": "Fold and plot",
            "body": (
                "Fold the light curve on the best period so all the dips stack on "
                "top of each other at phase zero, and plot it. A real transit "
                "shows up as a clear dip; noise does not."
            ),
        },
    ],
    "limitations": [
        "False positives dominate. BLS cannot tell a planet from an eclipsing binary, "
        "a background blended binary, starspot modulation, or instrument systematics. "
        "TOI 1338 is the textbook case: the strongest signal is the host stars "
        "eclipsing each other.",
        "Only the strongest signal per target is reported. Real systems are "
        "multi-planet; this pipeline is blind to everything after the first hit.",
        "Only 2 sectors per target were scanned (the validation used 4). Longer "
        "baselines find longer periods and beat down noise.",
        "No vetting tests were done: no odd/even transit depth comparison, no "
        "secondary eclipse search, no centroid shift check, no transit shape fitting.",
        "BLS is a box model. Real transits are limb-darkened U shapes; the Transit "
        "Least Squares (TLS) algorithm is more sensitive, especially for small planets.",
        "This does not beat NASA's ExoMiner++. ExoMiner++ is a deep-learning "
        "classifier trained on Kepler plus TESS data that triaged 7,000 candidates "
        "in one run, with false-positive rejection built in. This pipeline is a "
        "single classical algorithm with no learned vetting. Its value is as an "
        "independent, explainable check, not as a competitor.",
    ],
    "roadmap": [
        "Cross-match every signal against the NASA Exoplanet Archive and the "
        "ExoMiner++ candidate list before calling anything interesting.",
        "Add vetting: odd/even depth test, secondary eclipse search, transit shape "
        "(V vs U), centroid offsets, and a check against known eclipsing-binary catalogs.",
        "Swap BLS for TLS for small-planet sensitivity.",
        "Stitch all available sectors per target instead of 2.",
        "Cross-check ambiguous signals on Planet Hunters TESS, where human eyes "
        "still beat algorithms on long-period and odd-shaped transits.",
        "Submit interesting survivors to ExoFOP (the community follow-up portal), "
        "never announced as discoveries.",
    ],
}

app = FastAPI(title="planet-hunter API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _find_plot(filename: str) -> Path | None:
    if filename not in PLOT_FILES:
        return None
    for d in PLOT_DIRS:
        p = d / filename
        if p.exists():
            return p
    return None


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "planet-hunter-api", "version": "1.0.0"}


@app.get("/api/validation")
def validation() -> dict:
    return VALIDATION


@app.get("/api/candidates")
def candidates() -> dict:
    rows = _load_candidates()
    return {
        "count": len(rows),
        "run_date": "2026-10-09",
        "sectors_per_target": 2,
        "honesty": "Nothing here is a planet discovery. Every signal is a candidate "
        "signal that needs professional follow-up.",
        "candidates": rows,
    }


@app.get("/api/candidates/{slug}")
def candidate(slug: str) -> dict:
    for row in _load_candidates():
        if row["slug"] == slug:
            return row
    raise HTTPException(status_code=404, detail=f"unknown candidate slug: {slug}")


@app.get("/api/method")
def method() -> dict:
    return METHOD


@app.get("/api/plots/{filename}")
def plot(filename: str):
    path = _find_plot(filename)
    if path is None:
        raise HTTPException(status_code=404, detail=f"unknown plot file: {filename}")
    return FileResponse(path, media_type="image/png")
