"""Fake scan functions for the worker tests (run in the worker's child process)."""
import time

from scans import run


def ok(tic_id, params, progress, catalogs):
    progress("pretending to scan")
    return ({"pipeline_version": "test", "sectors": [1], "n_cadences": 1000,
             "lightcurve": {"time_btjd": [1.0], "flux_ppm": [0]}, "periodogram": {"period_d": [1.0], "power": [0.1]}},
            {"period_d": 3.0, "t0_btjd": 1.0, "duration_d": 0.1, "depth_ppm": 500.0, "snr": 9.0, "power": 0.1,
             "vetting": [], "crossmatch": {"matches": []}, "proposed_label": "no_match"})


def nodata(tic_id, params, progress, catalogs):
    raise run.NoData(f"no TESS SPOC light curves for TIC {tic_id}")


def flaky(tic_id, params, progress, catalogs):
    raise RuntimeError("MAST timed out")


def slow(tic_id, params, progress, catalogs):
    time.sleep(30)


def hog(tic_id, params, progress, catalogs):
    blocks = []
    while True:
        blocks.append(bytearray(50 * 1024 * 1024))


def threads(tic_id, params, progress, catalogs):
    """Reports the maths-thread settings the child process started with."""
    import os
    result, signal = ok(tic_id, params, progress, catalogs)
    signal["crossmatch"] = {"matches": [], "env": {k: os.environ.get(k) for k in
                                                   ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS")}}
    return result, signal
