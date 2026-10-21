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


# A period that is off by dP drifts a transit by (baseline / P) * dP over the whole light curve. To keep
# that drift under shortest_duration / PERIOD_OVERSAMPLE, the grid step must be a fixed fraction of the
# period (a geometric grid), and finer the longer the baseline. A fixed linear grid of 12,000 periods
# (0.0025 d apart) missed the true period of a star observed in far-apart sectors.
PERIOD_OVERSAMPLE = 3.0
MAX_PERIODS = 250_000
REFINE_POINTS = 301


def period_grid(time, period_min, period_max, shortest_duration, n_min=0):
    """Geometric period grid fine enough for the light curve's baseline (at least n_min periods)."""
    baseline = float(np.ptp(time))
    step = shortest_duration / (PERIOD_OVERSAMPLE * max(baseline, 1e-6))  # relative step, dP / P
    n = int(np.ceil(np.log(period_max / period_min) / np.log1p(step))) + 1
    return np.geomspace(period_min, period_max, int(min(MAX_PERIODS, max(n, n_min))))


def bls_search(time, flux, period_min=PERIOD_MIN, period_max=PERIOD_MAX, n_periods=N_PERIODS, durations=None):
    """Box Least Squares over a period grid sized to the baseline, then a fine pass around the best peak.

    Returns (periods, power, best Signal); periods and power are the coarse grid, for the periodogram chart.
    """
    from astropy.timeseries import BoxLeastSquares

    time = np.asarray(time)
    durs = np.asarray(DURATIONS if durations is None else durations)
    bls = BoxLeastSquares(time, flux)
    periods = period_grid(time, period_min, period_max, float(durs.min()), n_periods)
    res = bls.power(periods, durs, oversample=10)
    best = int(np.argmax(res.power))
    # Fine pass: the coarse step is up to shortest_duration / 3 of drift, so re-search +/- 2 steps around the peak.
    step = float(np.log(periods[-1] / periods[0]) / max(len(periods) - 1, 1))
    lo, hi = periods[best] * np.exp(-2 * step), periods[best] * np.exp(2 * step)
    fine = bls.power(np.linspace(max(lo, period_min * 0.5), hi, REFINE_POINTS), durs, oversample=10)
    fb = int(np.argmax(fine.power))
    res_best = fine if fine.power[fb] >= res.power[best] else res
    k = fb if res_best is fine else best
    p, d, t0 = float(res_best.period[k]), float(res_best.duration[k]), float(res_best.transit_time[k])
    sig = Signal(period_d=p, duration_d=d, t0_btjd=t0, depth_ppm=float(res_best.depth[k]) * 1e6,
                 power=float(res_best.power[k]), snr=bls_snr(time, flux, p, d, t0))
    return np.asarray(res.period), np.asarray(res.power), sig


# The flattening window is a length of time, not a number of cadences. 1001 two-minute cadences (about 33 hours)
# is what the batch scan and the validation used. A 20-second sector (TOI 270, sector 30) flattened with 1001
# cadences gets a 5.6 hour window, which partly erases a 1 to 2 hour transit: depth 3,474 ppm fell to 1,414 ppm.
FLATTEN_SECONDS = 1001 * 120


def flatten_window_length(cadence_s: float) -> int:
    """Odd number of cadences covering FLATTEN_SECONDS (1001 for 2-minute data)."""
    n = int(round(FLATTEN_SECONDS / max(cadence_s, 1.0)))
    return max(101, n | 1)


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
