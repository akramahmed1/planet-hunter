"""One scan: download a star's TESS light curves, search, vet, cross-match.

The same steps as candidate_scan.py and validate_toi700.py, through the shared
pipeline module. Runs inside the worker's child process (scans/worker.py).
"""
from __future__ import annotations

import time
from datetime import datetime, timezone

import numpy as np

from pipeline import crossmatch as xm
from pipeline import vetting
from pipeline.core import bin_time_series, bls_search, downsample_peaks

from scans.presets import PIPELINE_VERSION, PRESETS  # noqa: F401  (re-exported)


class NoData(Exception):
    """Permanent: nothing to scan (no TESS light curves, too few points)."""


class Transient(Exception):
    """Retryable: the archive or network failed."""


def _retry(fn, what, tries=4):
    for attempt in range(1, tries + 1):
        try:
            return fn()
        except Exception as exc:  # MAST is occasionally flaky
            if attempt == tries:
                raise Transient(f"{what} failed: {type(exc).__name__}: {exc}") from exc
            time.sleep(5 * attempt)


def scan(tic_id: int, params: dict, progress=lambda msg: None, catalogs=None) -> tuple[dict, dict]:
    """Returns (run, signal) ready for scans.queue.complete."""
    from lightkurve import search_lightcurve

    progress("searching the TESS archive")
    sr = _retry(lambda: search_lightcurve(f"TIC {tic_id}", mission="TESS", author="SPOC"), "MAST search")
    if len(sr) == 0:
        raise NoData(f"no TESS SPOC light curves for TIC {tic_id}")
    picked = sr[: params["max_sectors"]]
    progress(f"downloading {len(picked)} sector(s)")
    lcs = _retry(lambda: picked.download_all(), "download")
    if lcs is None or len(lcs) == 0:
        raise Transient("download returned nothing")
    progress("cleaning and flattening the light curve")
    lc = lcs.stitch().remove_nans().remove_outliers(sigma=5)
    if len(lc) < 500:
        raise NoData(f"only {len(lc)} usable points")
    flat = lc.flatten(window_length=1001)
    t, f = flat.time.value, flat.flux.value
    progress("searching for repeating dips (BLS)")
    d0, d1, nd = params["durations"]
    periods, power, sig = bls_search(t, f, params["period_min"], params["period_max"], params["n_periods"],
                                     np.linspace(d0, d1, int(nd)))
    progress("vetting the strongest signal")
    star_radius = catalogs.star_radius(tic_id) if catalogs else None
    rows = vetting.vet(t, f, sig.period_d, sig.t0_btjd, sig.duration_d, sig.depth_ppm, star_radius)
    progress("checking catalogs")
    cm = catalogs.crossmatch(tic_id, sig.period_d) if catalogs else {
        "matches": [], "proposed_label": "no_match", "label_text": xm.LABELS["no_match"], "note": None,
        "tolerance": xm.TOLERANCE, "reviewed": False}
    rows.insert(0, xm.as_vetting_row(cm))

    bt, bf, _ = bin_time_series(t, f, 10 / 1440)
    pp, pw = downsample_peaks(periods, power, 1500)
    sectors = sorted({int(s) for s in np.atleast_1d(picked.table["sequence_number"])})
    fetched = datetime.now(timezone.utc).isoformat(timespec="seconds")
    signal = {"period_d": round(sig.period_d, 6), "t0_btjd": round(sig.t0_btjd, 6), "duration_d": round(sig.duration_d, 4),
              "depth_ppm": round(sig.depth_ppm, 1), "snr": round(sig.snr, 2), "power": sig.power}
    source = {"name": "NASA TESS SPOC light curves (PDCSAP) from MAST, via lightkurve",
              "url": "https://archive.stsci.edu/missions-and-data/tess", "fetched_at": fetched}
    processing = ("Stitched, NaNs removed, 5-sigma outliers removed, flattened with a 1001-cadence window "
                  "(lightkurve), as in candidate_scan.py.")
    run = {
        "pipeline_version": PIPELINE_VERSION, "sectors": sectors, "n_cadences": int(len(lc)),
        "lightcurve": {"source": source, "processing": processing,
                       "binning": {"method": "median of the flattened flux in fixed 10-minute bins of BTJD time; "
                                             "empty bins dropped", "bin_minutes": 10, "n_bins": int(len(bt))},
                       "time_btjd": [round(float(x), 5) for x in bt],
                       "flux_ppm": [int(round((float(x) - 1) * 1e6)) for x in bf]},
        "periodogram": {"method": f"BLS power, {len(periods)} periods from {periods[0]} to {periods[-1]} days, "
                                  "kept as the peak of each of 1500 equal chunks",
                        "period_d": [round(float(x), 5) for x in pp], "power": [round(float(x), 7) for x in pw]},
    }
    return run, {**signal, "vetting": rows, "crossmatch": cm, "proposed_label": cm["proposed_label"]}
