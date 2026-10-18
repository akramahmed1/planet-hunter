"""Vetting tests for a transit-like signal, each with a plain-language verdict.

Inputs are the flattened light curve (time in days, flux as a fraction or in
ppm) and the BLS signal. Verdicts are "pass", "warn", "fail" or "unknown"
(not enough data to tell). These are screening checks, not proof either way.
"""
from __future__ import annotations

import math

import numpy as np

R_SUN_KM = 695_700.0  # IAU nominal solar radius (also in live.physics)
R_JUP_KM = 69_911.0  # NSSDCA Jupiter mean radius (data/bodies.v1.json)


def _phase(t, period, t0):
    return ((t - t0 + 0.5 * period) % period) - 0.5 * period


def _mean_err(x):
    x = np.asarray(x)
    if len(x) < 3:
        return None, None
    return float(np.mean(x)), float(np.std(x) / math.sqrt(len(x)))


def _grade(sigma, warn=2.0, fail=3.0):
    return "pass" if sigma < warn else "warn" if sigma < fail else "fail"


def odd_even(t, f, period, t0, duration) -> dict:
    """A planet makes the same dip every orbit. Two stars of different brightness make alternating depths."""
    ph = _phase(t, period, t0)
    epoch = np.round((t - t0) / period).astype(int)
    intr = np.abs(ph) < duration / 2
    base = float(np.median(f[np.abs(ph) > duration]))
    odd = base - f[intr & (epoch % 2 == 1)]
    even = base - f[intr & (epoch % 2 == 0)]
    (do, eo), (de, ee) = _mean_err(odd), _mean_err(even)
    if do is None or de is None or not eo or not ee:
        return {"id": "odd_even", "name": "Odd and even dips", "status": "unknown", "value": None,
                "explanation": "Not enough points inside the dips to compare odd and even ones."}
    sigma = abs(do - de) / math.hypot(eo, ee)
    status = _grade(sigma)
    words = {"pass": "Odd and even dips are the same depth, as a planet's would be.",
             "warn": "Odd and even dips differ a little. Could be noise, or two stars eclipsing each other.",
             "fail": "Odd and even dips have different depths. That is typical of two stars eclipsing each other, "
                     "with the true period twice this one."}
    return {"id": "odd_even", "name": "Odd and even dips", "status": status,
            "value": {"odd_depth": do, "even_depth": de, "difference_sigma": round(sigma, 2)},
            "explanation": words[status]}


def secondary_eclipse(t, f, period, t0, duration) -> dict:
    """A dip halfway between transits means the companion gives off its own light: usually a star."""
    ph2 = _phase(t, period, t0 + period / 2)
    sec = f[np.abs(ph2) < duration / 2]
    ph = _phase(t, period, t0)
    out = f[(np.abs(ph) > duration) & (np.abs(ph2) > duration)]
    if len(sec) < 3 or len(out) < 30:
        return {"id": "secondary", "name": "Dip halfway round the orbit", "status": "unknown", "value": None,
                "explanation": "Not enough points halfway between dips to look for a second, shallower dip."}
    depth = float(np.median(out) - np.mean(sec))
    err = float(np.std(out) / math.sqrt(len(sec)))
    sigma = depth / err if err > 0 else 0.0
    status = _grade(sigma)
    words = {"pass": "No dip halfway between the transits.",
             "warn": "A possible small dip halfway between the transits. Worth checking.",
             "fail": "A dip halfway between the transits. A planet rarely shows one this clearly; a companion star "
                     "passing behind would."}
    return {"id": "secondary", "name": "Dip halfway round the orbit", "status": status,
            "value": {"depth": depth, "sigma": round(sigma, 2)}, "explanation": words[status]}


def transit_shape(t, f, period, t0, duration) -> dict:
    """Planets make flat-bottomed (U) dips; grazing eclipses of two stars make pointed (V) ones."""
    ph = np.abs(_phase(t, period, t0))
    base = float(np.median(f[ph > duration]))
    centre = f[ph < duration / 4]
    edge = f[(ph >= duration / 4) & (ph < duration / 2)]
    if len(centre) < 3 or len(edge) < 3:
        return {"id": "shape", "name": "Dip shape (U or V)", "status": "unknown", "value": None,
                "explanation": "Not enough points inside the dip to tell its shape."}
    dc, de = base - float(np.mean(centre)), base - float(np.mean(edge))
    if dc <= 0:
        return {"id": "shape", "name": "Dip shape (U or V)", "status": "unknown", "value": None,
                "explanation": "The dip is too shallow here to tell its shape."}
    ratio = de / dc
    status = "pass" if ratio >= 0.7 else "warn" if ratio >= 0.4 else "fail"
    words = {"pass": "The dip is flat-bottomed (U-shaped), like a planet crossing the star.",
             "warn": "The dip is somewhat pointed. Could be a planet crossing near the star's edge, or two stars.",
             "fail": "The dip is V-shaped, which is typical of two stars grazing each other."}
    return {"id": "shape", "name": "Dip shape (U or V)", "status": status,
            "value": {"edge_to_centre_depth": round(ratio, 2)}, "explanation": words[status]}


def implied_size(depth_ppm: float, star_radius_rsun: float | None) -> dict:
    """Depth = (planet radius / star radius)^2, so the dip gives a size. Very large means likely a star."""
    if not star_radius_rsun or depth_ppm <= 0:
        return {"id": "size", "name": "Size the dip implies", "status": "unknown", "value": None,
                "explanation": "The star's size is not known, so the object's size cannot be worked out."}
    r_km = math.sqrt(depth_ppm / 1e6) * star_radius_rsun * R_SUN_KM
    rj = r_km / R_JUP_KM
    status = "pass" if rj <= 2 else "fail"
    words = {"pass": f"The dip implies an object about {rj:.2f} times Jupiter's size, which a planet can be.",
             "fail": f"The dip implies an object about {rj:.1f} times Jupiter's size. Planets are rarely more than "
                     "about twice Jupiter's size (a rule of thumb), so this is probably a star."}
    return {"id": "size", "name": "Size the dip implies", "status": status,
            "value": {"radius_jupiter": round(rj, 3), "radius_earth": round(r_km / 6371.0, 2)},
            "explanation": words[status]}


def vet(t, f, period, t0, duration, depth_ppm, star_radius_rsun=None) -> list[dict]:
    t, f = np.asarray(t, float), np.asarray(f, float)
    return [
        odd_even(t, f, period, t0, duration),
        secondary_eclipse(t, f, period, t0, duration),
        transit_shape(t, f, period, t0, duration),
        implied_size(depth_ppm, star_radius_rsun),
        {"id": "tls", "name": "Transit Least Squares", "status": "unknown", "value": None,
         "explanation": "Not run: the optional TLS check is not installed on this server."},
    ]
