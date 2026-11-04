"""Computed facts for the lessons (Phase 7).

A lesson fact or quiz answer with `"check": {"computed": "<name>"}` must contain
the string the function of that name returns (numeric answers must match the
returned number). Every function reads the same bundled datasets the rest of the
site uses, so a lesson can never disagree with the 3D views or the hunt pages.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from live import habitable

DATA = Path(__file__).resolve().parent.parent / "data"
# 1 au and the speed of light, as printed in JPL Horizons output (IAU 2012 au; SI c).
KM_PER_AU = 149_597_870.7
C_KM_S = 299_792.458


@lru_cache(maxsize=1)
def _bodies() -> dict[str, dict]:
    return {b["id"]: b for b in json.loads((DATA / "bodies.v1.json").read_text())["bodies"]}


def _fact(body: str, key: str) -> float:
    return float(_bodies()[body]["facts"][key])


def _temp(body: str, label: str) -> float:
    return next(t["kelvin"] for t in _bodies()[body]["temperatures"] if t["label"] == label)


def _fmt(v: float, digits: int = 0) -> str:
    return f"{v:,.{digits}f}"


def _light_seconds(body: str) -> float:
    return _fact(body, "semimajor_axis_1e6_km") * 1e6 / C_KM_S


def sunlight_earth() -> str:
    s = round(_light_seconds("earth"))
    return f"{s // 60} minutes {s % 60} seconds"


def sunlight_earth_minutes() -> float:
    return round(_light_seconds("earth") / 60, 1)


def sunlight_neptune() -> str:
    return f"{_light_seconds('neptune') / 3600:.1f} hours"


def sunlight_neptune_hours() -> float:
    return round(_light_seconds("neptune") / 3600, 1)


def earth_au() -> str:
    return f"{_fact('earth', 'semimajor_axis_1e6_km') * 1e6 / KM_PER_AU:.2f} au"


def neptune_au() -> str:
    return f"{_fact('neptune', 'semimajor_axis_1e6_km') * 1e6 / KM_PER_AU:.1f} au"


def venus_mercury_temps() -> str:
    return f"Venus averages {_fmt(_temp('venus', 'Average temperature'))} K and Mercury " \
           f"{_fmt(_temp('mercury', 'Average temperature'))} K"


def sun_surface_core() -> str:
    return f"about {_fmt(_temp('sun', 'Effective temperature'))} K at its visible surface and about " \
           f"{_temp('sun', 'Central temperature') / 1e6:.1f} million K at its core"


def earth_average_temp() -> str:
    return f"{_fmt(_temp('earth', 'Average temperature'))} K"


def neptune_temp() -> str:
    return f"{_fmt(_temp('neptune', 'Temperature at 1 bar'))} K"


def _depth(body: str) -> float:
    return (_fact(body, "mean_radius_km") / _fact("sun", "mean_radius_km")) ** 2


def earth_transit_ppm() -> str:
    return f"about {round(_depth('earth') * 1e6)} parts per million"


def earth_transit_ppm_value() -> float:
    return float(round(_depth("earth") * 1e6))


def jupiter_transit_percent() -> str:
    return f"about {_depth('jupiter') * 100:.0f}%"


def _sun_zone() -> dict:
    return habitable.zone(_temp("sun", "Effective temperature"), 1.0)


def sun_zone_conservative() -> str:
    z = _sun_zone()
    return f"{z['conservative_inner_au']:.2f} to {z['conservative_outer_au']:.2f} au"


def sun_zone_optimistic() -> str:
    z = _sun_zone()
    return f"{z['optimistic_inner_au']:.2f} to {z['optimistic_outer_au']:.2f} au"


def _au(body: str) -> float:
    return _fact(body, "semimajor_axis_1e6_km") * 1e6 / KM_PER_AU


def mars_au() -> str:
    return f"{_au('mars'):.2f} au"


def mars_in_zone() -> str:
    z = _sun_zone()
    assert z["conservative_inner_au"] < _au("mars") < z["conservative_outer_au"]
    return "inside the conservative zone"


def venus_au() -> str:
    z = _sun_zone()
    assert _au("venus") < z["optimistic_inner_au"]
    return f"{_au('venus'):.2f} au"


def mars_temp() -> str:
    return f"{_fmt(_temp('mars', 'Average temperature'))} K"


def sun_zone_inner_value() -> float:
    return round(_sun_zone()["conservative_inner_au"], 2)


def toi_counts() -> str:
    """TESS Objects of Interest by TFOPWG disposition, from the saved Exoplanet Archive query."""
    path = DATA.parent / "tests" / "fixtures" / "external" / "nasa_tess_toi_count_p7.json"
    n = {r["tfopwg_disp"]: r["n"] for r in json.loads(path.read_text())}
    return f"{n['PC']:,} planetary candidates, {n['CP']:,} confirmed planets and {n['FP']:,} false positives"


def toi1338_circumbinary() -> str:
    systems = json.loads((DATA / "systems.v1.json").read_text())["systems"]
    s = systems["TIC 260128333"]
    assert s["circumbinary"]
    return f"{len(s['planets'])} confirmed planets"


def toi1338_eb_period() -> str:
    ebs = json.loads((DATA / "tess_ebs.v1.json").read_text())["ebs"]["260128333"]
    return f"{ebs[0]['period_d']:.4f} days"


COMPUTED = {name: fn for name, fn in globals().items()
            if callable(fn) and not name.startswith("_") and fn.__module__ == __name__}
