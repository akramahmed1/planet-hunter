"""Numerical core of the pipeline. numpy and astropy only, so it runs anywhere.

Downloading and flattening use lightkurve (scripts/export_lightcurves.py and
the Phase 6 worker); these functions take plain arrays.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

# Same search grid as candidate_scan.py.
PERIOD_MIN, PERIOD_MAX, N_PERIODS = 0.5, 30.0, 12000
DURATIONS = np.linspace(0.05, 0.4, 8)


@dataclass
class Signal:
    period_d: float
    duration_d: float
    t0_btjd: float
    depth_ppm: float
    power: float
    snr: float


def bls_snr(time, flux, period, duration, t0) -> float:
    """Simple transit SNR: in-transit depth over out-of-transit scatter (as in candidate_scan.py)."""
    phase = ((time - t0 + 0.5 * period) % period) - 0.5 * period
    in_tr = np.abs(phase) < duration / 2.0
    if in_tr.sum() < 5 or (~in_tr).sum() < 50:
        return 0.0
    depth = np.median(flux[~in_tr]) - np.median(flux[in_tr])
    noise = np.std(flux[~in_tr])
    if noise <= 0:
        return 0.0
    return float(depth / noise * np.sqrt(in_tr.sum()))


def bls_search(time, flux, period_min=PERIOD_MIN, period_max=PERIOD_MAX, n_periods=N_PERIODS, durations=None):
    """Box Least Squares over a linear period grid. Returns (periods, power, best Signal)."""
    from astropy.timeseries import BoxLeastSquares

    bls = BoxLeastSquares(time, flux)
    periods = np.linspace(period_min, period_max, n_periods)
    res = bls.power(periods, DURATIONS if durations is None else np.asarray(durations), oversample=10)
    best = int(np.argmax(res.power))
    p, d, t0 = float(res.period[best]), float(res.duration[best]), float(res.transit_time[best])
    sig = Signal(period_d=p, duration_d=d, t0_btjd=t0, depth_ppm=float(res.depth[best]) * 1e6,
                 power=float(res.power[best]), snr=bls_snr(time, flux, p, d, t0))
    return np.asarray(res.period), np.asarray(res.power), sig


def phase_fold(time, period, t0):
    """Phase in days, centered on the transit: in [-P/2, P/2)."""
    return ((np.asarray(time) - t0 + 0.5 * period) % period) - 0.5 * period


def bin_time_series(time, flux, bin_days):
    """Median flux in fixed-width time bins; empty bins are dropped. Returns (bin centers, medians, counts)."""
    time, flux = np.asarray(time), np.asarray(flux)
    edges = np.arange(time.min(), time.max() + bin_days, bin_days)
    idx = np.digitize(time, edges) - 1
    centers, meds, counts = [], [], []
    for k in np.unique(idx):
        m = idx == k
        centers.append(edges[k] + bin_days / 2)
        meds.append(float(np.median(flux[m])))
        counts.append(int(m.sum()))
    return np.array(centers), np.array(meds), np.array(counts)


def downsample_peaks(x, y, n_out):
    """Keep the maximum of y in each of n_out equal chunks, so periodogram peaks survive."""
    x, y = np.asarray(x), np.asarray(y)
    if len(x) <= n_out:
        return x, y
    chunks = np.array_split(np.arange(len(x)), n_out)
    keep = [c[np.argmax(y[c])] for c in chunks]
    return x[keep], y[keep]
