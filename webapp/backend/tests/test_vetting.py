"""Vetting and cross-match on the 8 exported light curves and the saved catalog samples."""
import gzip
import json

import pytest

from live.fixture_transport import FIXTURES
from live import reference
from pipeline import crossmatch, vetting

LC = reference.DATA / "lightcurves"
STARS = reference.stars()["stars"]
SRC = {"planets": {"name": "pscomppars", "url": "x"}, "tois": {"name": "toi", "url": "x"}, "ebs": {"name": "ebs", "url": "x"}}
PLANETS = json.loads((FIXTURES / "exoplanet_archive_systems_by_tic_p6.json").read_text())
TOIS = json.loads((FIXTURES / "exoplanet_archive_toi_targets_p6.json").read_text())
EBS = reference.tess_ebs()["ebs"]


def load(slug):
    return json.loads((LC / f"{slug}.json").read_text())


def cm_for(d):
    tic = d["tic"]
    n = int(tic.split()[1])
    return crossmatch.crossmatch(d["signal"]["period_d"], [p for p in PLANETS if p["tic_id"] == tic],
                                 [t for t in TOIS if t["tid"] == n], EBS.get(str(n), []), SRC)


EXPECTED = {
    "toi-1338": ("known_eclipsing_binary", None),
    "toi-270": ("known_planet", "TOI-270 c"),
    "toi-216": ("no_match", None),
    "toi-175": ("known_planet", "L 98-59 c"),
    "toi-700": ("known_planet", "TOI-700 c"),
    "toi-125": ("known_planet", "TOI-125 b"),
    "toi-193": ("known_planet", "LTT 9779 b"),
    "toi-178": ("no_match", None),
}


@pytest.mark.parametrize("slug", sorted(EXPECTED))
def test_crossmatch_labels_every_target(slug):
    cm = cm_for(load(slug))
    label, planet = EXPECTED[slug]
    assert cm["proposed_label"] == label
    assert cm["reviewed"] is False
    if planet:
        assert planet in [m["name"] for m in cm["matches"] if m["kind"] == "planet"]


def test_the_known_eclipsing_binary_is_flagged_by_vetting():
    d = load("toi-1338")
    cm = cm_for(d)
    row = crossmatch.as_vetting_row(cm)
    assert row["status"] == "fail" and "14.6086" in row["explanation"]
    # No other target is flagged as a known eclipsing binary at its signal's period.
    for slug in EXPECTED:
        if slug != "toi-1338":
            assert crossmatch.as_vetting_row(cm_for(load(slug)))["status"] == "pass", slug


def test_eb_catalog_matches_the_source_file():
    rows = gzip.open(FIXTURES / "cds_tess_ebs_dat_gz_p6.gz", "rt").read().splitlines()
    line = next(r for r in rows if int(r.split("|")[0]) == 260128333)
    assert float(line.split("|")[12]) == pytest.approx(EBS["260128333"][0]["period_d"], abs=1e-6)


def test_harmonics_and_tolerance():
    planets = [{"pl_name": "X b", "pl_orbper": 10.0}]
    assert crossmatch.crossmatch(10.05, planets, [], [], SRC)["proposed_label"] == "known_planet"
    assert crossmatch.crossmatch(10.2, planets, [], [], SRC)["proposed_label"] == "no_match"
    half = crossmatch.crossmatch(5.0, planets, [], [], SRC)
    assert half["proposed_label"] == "harmonic_of_known" and half["matches"][0]["relation"] == "half the period"
    fp = crossmatch.crossmatch(3.0, [], [{"toi": "1.01", "pl_orbper": 3.0, "tfopwg_disp": "FP"}], [], SRC)
    assert fp["proposed_label"] == "known_false_positive"


@pytest.mark.parametrize("slug", sorted(EXPECTED))
def test_vetting_rows_are_complete_and_explained(slug):
    d = load(slug)
    s = d["signal"]
    rows = vetting.vet(d["time_btjd"], d["flux_ppm"], s["period_d"], s["t0_btjd"], s["duration_d"], s["depth_ppm"],
                       STARS[d["tic"]]["radius_rsun"])
    assert [r["id"] for r in rows] == ["odd_even", "secondary", "shape", "size", "tls"]
    for r in rows:
        assert r["status"] in {"pass", "warn", "fail", "unknown"} and r["explanation"]


def test_vetting_catches_synthetic_eclipsing_binary_signs():
    import numpy as np
    P, t0, dur = 2.0, 0.5, 0.1
    t = np.arange(0, 60, 0.002)
    ph = ((t - t0 + P / 2) % P) - P / 2
    ep = np.round((t - t0) / P).astype(int)
    f = np.ones_like(t) + np.random.default_rng(1).normal(0, 2e-4, t.size)
    f[(np.abs(ph) < dur / 2) & (ep % 2 == 0)] -= 0.02  # deep even eclipses
    f[(np.abs(ph) < dur / 2) & (ep % 2 == 1)] -= 0.012  # shallower odd ones
    rows = {r["id"]: r for r in vetting.vet(t, f, P, t0, dur, 16000, 1.0)}
    assert rows["odd_even"]["status"] == "fail"
    v = 1 - 0.03 * np.clip(1 - np.abs(ph) / (dur / 2), 0, None)  # a V-shaped dip
    assert vetting.transit_shape(t, v, P, t0, dur)["status"] == "fail"
    sec = f.copy()
    ph2 = ((t - t0) % P) - P / 2
    sec[np.abs(ph2) < dur / 2] -= 0.003
    assert vetting.secondary_eclipse(t, sec, P, t0, dur)["status"] == "fail"
    assert vetting.implied_size(40000, 1.5)["status"] == "fail"
