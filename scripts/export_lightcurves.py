#!/usr/bin/env python3
"""Export each target's light curve and BLS periodogram as compact JSON (Phase 5).

Runs the same steps as candidate_scan.py (SPOC light curves from MAST, first
MAX_SECTORS sectors, stitch, remove NaNs and 5-sigma outliers, flatten with a
1001-cadence window, BLS from 0.5 to 30 days), then saves:

  webapp/backend/data/lightcurves/<slug>.json
    time_btjd, flux_ppm   flattened flux, median in 10-minute bins, as parts per
                          million from 1 (integers), so the file stays small
    periodogram           BLS power, downsampled to 1500 points keeping each chunk's peak
    signal                the strongest BLS signal (period, t0, duration, depth, SNR)

Size budget: 160 KB per file (checked by the backend tests).

Needs MAST access, so it runs on GitHub's machines (.github/workflows/lightcurves.yml):
    python scripts/export_lightcurves.py
"""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "webapp" / "backend"))
from pipeline.core import bin_time_series, bls_search, downsample_peaks  # noqa: E402

OUT = REPO / "webapp" / "backend" / "data" / "lightcurves"
TARGETS = [  # same list and order as candidate_scan.py
    ("TIC 150428135", "TOI 700"), ("TIC 259377017", "TOI 270"), ("TIC 251848941", "TOI 178"),
    ("TIC 183985250", "TOI 193"), ("TIC 260128333", "TOI 1338"), ("TIC 55652896", "TOI 216"),
    ("TIC 52368076", "TOI 125"), ("TIC 307210830", "TOI 175"),
]
MAX_SECTORS = 2
BIN_MINUTES = 10
PERIODOGRAM_POINTS = 1500


def retry(fn, what, tries=6):
    for attempt in range(1, tries + 1):
        try:
            return fn()
        except Exception as exc:  # MAST is occasionally flaky
            print(f"{what}: attempt {attempt} failed ({type(exc).__name__}: {exc})")
            if attempt == tries:
                raise
            time.sleep(8 * attempt)


def export(tic: str, label: str) -> dict:
    from lightkurve import search_lightcurve

    sr = retry(lambda: search_lightcurve(tic, mission="TESS", author="SPOC"), f"{label} search")
    picked = sr[:MAX_SECTORS]
    lcs = retry(lambda: picked.download_all(), f"{label} download")
    lc = lcs.stitch().remove_nans().remove_outliers(sigma=5)
    flat = lc.flatten(window_length=1001)
    t, f = flat.time.value, flat.flux.value
    periods, power, sig = bls_search(t, f)
    bt, bf, counts = bin_time_series(t, f, BIN_MINUTES / 1440)
    pp, pw = downsample_peaks(periods, power, PERIODOGRAM_POINTS)
    sectors = sorted({int(s) for s in np.atleast_1d(picked.table["sequence_number"])})
    exptimes = sorted({float(x) for x in np.atleast_1d(picked.table["exptime"])})
    return {
        "dataset": "lightcurve",
        "version": 1,
        "slug": label.lower().replace(" ", "-"),
        "target": label,
        "tic": tic,
        "source": {"name": "NASA TESS SPOC light curves (PDCSAP) from MAST, via lightkurve",
                   "url": "https://archive.stsci.edu/missions-and-data/tess",
                   "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds")},
        "sectors": sectors,
        "exposure_s": exptimes,
        "n_cadences": int(len(lc)),
        "processing": ("Stitched, NaNs removed, 5-sigma outliers removed, flattened with a 1001-cadence "
                       "window (lightkurve), as in candidate_scan.py."),
        "binning": {"method": "median of the flattened flux in fixed 10-minute bins of BTJD time; empty bins dropped",
                    "bin_minutes": BIN_MINUTES, "n_bins": int(len(bt))},
        "time_btjd": [round(float(x), 5) for x in bt],
        "flux_ppm": [int(round((float(x) - 1) * 1e6)) for x in bf],
        "periodogram": {"method": f"BLS power on the unbinned flattened flux, {len(periods)} periods from "
                                  f"{periods[0]} to {periods[-1]} days, kept as the peak of each of "
                                  f"{PERIODOGRAM_POINTS} equal chunks",
                        "period_d": [round(float(x), 5) for x in pp],
                        "power": [round(float(x), 7) for x in pw]},
        "signal": {"period_d": round(sig.period_d, 5), "t0_btjd": round(sig.t0_btjd, 5),
                   "duration_d": round(sig.duration_d, 4), "depth_ppm": round(sig.depth_ppm),
                   "snr": round(sig.snr, 1), "power": sig.power},
    }


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:])
    failed = []
    for tic, label in TARGETS:
        slug = label.lower().replace(" ", "-")
        if only and slug not in only:
            continue
        try:
            data = export(tic, label)
        except Exception as exc:
            print(f"{label}: FAILED ({exc})")
            failed.append(label)
            continue
        text = json.dumps(data, separators=(",", ":")) + "\n"
        (OUT / f"{slug}.json").write_text(text)
        s = data["signal"]
        print(f"{label}: sectors {data['sectors']} bins {data['binning']['n_bins']} "
              f"size {len(text) / 1024:.0f} KB  P={s['period_d']} depth={s['depth_ppm']} snr={s['snr']}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
