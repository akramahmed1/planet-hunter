"""Habitable ("could hold liquid water") zone around a star.

Kopparapu et al. (2014), "Habitable Zones around Main-sequence Stars: Dependence
on Planetary Mass", ApJL 787, L29, arXiv:1404.5292, Eq. 4 and 5 with the
1 Earth-mass coefficients of Table 1 (read on alphaXiv):

    S_eff = S_eff_sun + a*T + b*T^2 + c*T^3 + d*T^4,   T = Teff - 5780 K
    d     = sqrt((L / L_sun) / S_eff) au

Valid for stellar effective temperatures from 2600 K to 7200 K.
"""
from __future__ import annotations

import math

SOURCE = {"name": "Kopparapu et al. 2014, ApJL 787, L29, Eq. 4-5 and Table 1 (1 Earth mass)",
          "url": "https://arxiv.org/abs/1404.5292"}
TEFF_RANGE = (2600.0, 7200.0)

# (S_eff_sun, a, b, c, d) from Table 1.
COEFFS = {
    "recent_venus": (1.776, 2.136e-4, 2.533e-8, -1.332e-11, -3.097e-15),
    "runaway_greenhouse": (1.107, 1.332e-4, 1.58e-8, -8.308e-12, -1.931e-15),
    "maximum_greenhouse": (0.356, 6.171e-5, 1.698e-9, -3.198e-12, -5.575e-16),
    "early_mars": (0.32, 5.547e-5, 1.526e-9, -2.874e-12, -5.011e-16),
}


def effective_flux(limit: str, teff_k: float) -> float:
    s0, a, b, c, d = COEFFS[limit]
    t = teff_k - 5780.0
    return s0 + a * t + b * t**2 + c * t**3 + d * t**4


def distance_au(limit: str, teff_k: float, luminosity_lsun: float) -> float:
    return math.sqrt(luminosity_lsun / effective_flux(limit, teff_k))


def zone(teff_k: float, luminosity_lsun: float) -> dict:
    """Conservative (runaway to maximum greenhouse) and optimistic (recent Venus to early Mars) edges, in au."""
    return {
        "conservative_inner_au": distance_au("runaway_greenhouse", teff_k, luminosity_lsun),
        "conservative_outer_au": distance_au("maximum_greenhouse", teff_k, luminosity_lsun),
        "optimistic_inner_au": distance_au("recent_venus", teff_k, luminosity_lsun),
        "optimistic_outer_au": distance_au("early_mars", teff_k, luminosity_lsun),
        "in_valid_range": TEFF_RANGE[0] <= teff_k <= TEFF_RANGE[1],
    }


def kepler_semimajor_axis_au(period_days: float, star_mass_msun: float) -> float:
    """Kepler's third law with the planet's mass neglected: a^3 = M * P^2 (au, solar masses, years)."""
    return (star_mass_msun * (period_days / 365.25) ** 2) ** (1 / 3)
