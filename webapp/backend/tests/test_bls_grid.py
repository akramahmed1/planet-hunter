"""BLS must find the true period when the light curve spans a long baseline (sectors far apart)."""
import numpy as np

from pipeline import core


def synthetic(period=5.6605, t0=1389.5, depth_ppm=3474, duration=0.08, windows=((1386, 1436), (2000, 2050))):
    rng = np.random.default_rng(7)
    t = np.concatenate([np.arange(a, b, 30 / 1440) for a, b in windows])
    flux = 1 + rng.normal(0, 1000e-6, len(t))
    phase = ((t - t0 + 0.5 * period) % period) - 0.5 * period
    flux[np.abs(phase) < duration / 2] -= depth_ppm * 1e-6
    return t, flux


def test_long_baseline_period_and_depth():
    t, f = synthetic()
    _, _, sig = core.bls_search(t, f, 0.5, 10.0, 12000, np.linspace(0.05, 0.4, 8))
    assert abs(sig.period_d - 5.6605) < 0.0005
    assert abs(sig.depth_ppm - 3474) / 3474 < 0.2
    assert sig.snr > 15


def test_grid_step_keeps_transit_drift_under_a_third_of_the_shortest_duration():
    # The replaced linear grid (12,000 periods, 0.0025 d apart) drifted a transit by 0.0025 * 700 / 5.66 = 0.31 d
    # over a 700 d baseline, several times a 0.08 d transit. Whether it still hit the right period was luck.
    t, _ = synthetic()
    grid = core.period_grid(t, 0.5, 30.0, 0.05)
    drift = np.max(np.diff(grid) / grid[:-1]) * float(np.ptp(t))  # in cycles-times-period = days at any P
    assert drift <= 0.05 / core.PERIOD_OVERSAMPLE * 1.001


def test_grid_is_finer_for_longer_baselines():
    short = core.period_grid(np.array([0.0, 27.0]), 0.5, 30.0, 0.05)
    long_ = core.period_grid(np.array([0.0, 700.0]), 0.5, 30.0, 0.05)
    assert len(long_) > len(short) and len(long_) <= core.MAX_PERIODS
    assert np.all(np.diff(long_) > 0)


def test_short_baseline_keeps_the_requested_number_of_periods():
    assert len(core.period_grid(np.array([0.0, 27.0]), 0.5, 30.0, 0.05, n_min=12000)) == 12000
