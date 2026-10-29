"""Estimates used when the Exoplanet Archive has no value. Each is labeled `estimate`.

Only the equilibrium temperature is estimated: its formula is cited from a
paper we read (below). A missing orbit size is left empty rather than derived
from an uncited relation.
"""
from __future__ import annotations

import math

# Solar radius in km: NASA NSSDCA Sun Fact Sheet, "Volumetric mean radius (km) 695,700"
# (bundled in data/bodies.v1.json).
R_SUN_KM = 695_700.0
KM_PER_AU = 149_597_870.7

EQ_TEMP_SOURCE = {
    "name": "Cowan & Agol, arXiv:1011.0428, Eq. 9: T = T_eff (R*/2a)^1/2 (1 - A)^1/4 (1 - e^2)^-1/8, "
            "with Bond albedo A = 0 and a circular orbit",
    "url": "https://arxiv.org/abs/1011.0428",
}


def equilibrium_temperature_k(star_teff_k: float, star_radius_rsun: float, a_au: float,
                              bond_albedo: float = 0.0) -> float:
    """Full-redistribution equilibrium temperature for a circular orbit (Eq. 9, e = 0).

    The API uses bond_albedo = 0, since exoplanet albedos are almost never known.
    """
    r_star_km = star_radius_rsun * R_SUN_KM
    a_km = a_au * KM_PER_AU
    return star_teff_k * math.sqrt(r_star_km / (2 * a_km)) * (1 - bond_albedo) ** 0.25

