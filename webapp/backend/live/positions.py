"""Heliocentric positions: JPL Horizons for today, computed for other dates.

Other dates use JPL's "Keplerian elements for approximate positions of the
major planets", Table 1 (valid 1800 to 2050), with the method on that page:
https://ssd.jpl.nasa.gov/planets/approx_pos.html. Pluto is not in Table 1, so
it is interpolated linearly between Horizons positions saved every 30 days.
All coordinates are heliocentric, ecliptic of J2000, in au.
"""
from __future__ import annotations

import math
from bisect import bisect_left
from datetime import date

from live import reference

# Table 1 names for our body ids. Earth uses the Earth-Moon barycenter row,
# which sits about 4,700 km from Earth's center: far below Table 1's accuracy.
KEPLER_NAMES = {
    "mercury": "Mercury", "venus": "Venus", "earth": "EM Bary", "mars": "Mars",
    "jupiter": "Jupiter", "saturn": "Saturn", "uranus": "Uranus", "neptune": "Neptune",
}

# JD of 0h TDB on a calendar date (Gregorian). Fliegel and Van Flandern's integer algorithm.
def julian_day(d: date) -> float:
    a = (14 - d.month) // 12
    y = d.year + 4800 - a
    m = d.month + 12 * a - 3
    jdn = d.day + (153 * m + 2) // 5 + 365 * y + y // 4 - y // 100 + y // 400 - 32045
    return jdn - 0.5


def kepler_position(body_id: str, d: date) -> tuple[float, float, float]:
    row = reference.kepler()["bodies"][KEPLER_NAMES[body_id]]
    el, rate = row["elements"], row["rates_per_century"]
    T = (julian_day(d) - 2451545.0) / 36525.0
    a, e, inc, L, varpi, node = (el[k] + rate[k] * T for k in
                                 ("a_au", "e", "i_deg", "L_deg", "long_peri_deg", "long_node_deg"))
    omega = varpi - node
    M = (L - varpi + 180.0) % 360.0 - 180.0
    # Solve Kepler's equation M = E - e* sin E, with e* in degrees (JPL's formulation).
    e_star = math.degrees(e)
    E = M + e_star * math.sin(math.radians(M))
    for _ in range(50):
        dM = M - (E - e_star * math.sin(math.radians(E)))
        dE = dM / (1 - e * math.cos(math.radians(E)))
        E += dE
        if abs(dE) < 1e-9:
            break
    Er = math.radians(E)
    xp = a * (math.cos(Er) - e)
    yp = a * math.sqrt(1 - e * e) * math.sin(Er)
    w, O, I = math.radians(omega), math.radians(node), math.radians(inc)
    cw, sw, cO, sO, cI, sI = math.cos(w), math.sin(w), math.cos(O), math.sin(O), math.cos(I), math.sin(I)
    x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp
    y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp
    z = (sw * sI) * xp + (cw * sI) * yp
    return x, y, z


def pluto_position(d: date) -> tuple[float, float, float]:
    rows = reference.pluto()["rows"]
    jd = julian_day(d)
    if not rows[0][0] <= jd <= rows[-1][0]:
        raise ValueError("date outside the Pluto table")
    i = bisect_left([r[0] for r in rows], jd)
    if rows[i][0] == jd:
        return tuple(rows[i][1:4])
    lo, hi = rows[i - 1], rows[i]
    f = (jd - lo[0]) / (hi[0] - lo[0])
    return tuple(lo[k] + f * (hi[k] - lo[k]) for k in (1, 2, 3))


def computed_position(body_id: str, d: date) -> tuple[float, float, float]:
    if body_id == "sun":
        return (0.0, 0.0, 0.0)
    if body_id == "pluto":
        return pluto_position(d)
    return kepler_position(body_id, d)


def valid_range() -> tuple[date, date]:
    """Dates every body can be computed for: Table 1's span cut to the Pluto table's."""
    rows = reference.pluto()["rows"]
    return _date_from_jd(rows[0][0]), min(date(2050, 12, 31), _date_from_jd(rows[-1][0]))


def _date_from_jd(jd: float) -> date:
    return date.fromordinal(int(jd + 0.5) - 1721425)


def parse_horizons_vectors(result: str) -> tuple[float, float, float]:
    """First row of a Horizons VECTORS table requested with VEC_TABLE=1 and CSV_FORMAT=YES."""
    try:
        block = result[result.index("$$SOE") + 5 : result.index("$$EOE")].strip()
        parts = [p.strip() for p in block.splitlines()[0].split(",")]
        return float(parts[2]), float(parts[3]), float(parts[4])
    except (ValueError, IndexError) as exc:
        raise ValueError("unexpected Horizons output") from exc
