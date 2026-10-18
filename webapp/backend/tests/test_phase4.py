"""Phase 4: target systems, habitable zone, spacecraft, ISS track, TESS facts.

Offline against the saved real samples (the `p4` set), like test_live.py.
"""
import json
import math
import re

import pytest

from live import habitable, sources
from live.fixture_transport import FIXTURES
from tests.test_live import client, frozen, page_text  # noqa: F401  (fixtures)

TARGET_SLUGS = ["toi-1338", "toi-270", "toi-216", "toi-776", "toi-700", "toi-125", "toi-849", "toi-178"]


def fixture(name):
    return json.loads((FIXTURES / f"{name}.json").read_text())


# ---------- habitable zone (Kopparapu et al. 2014) ----------

def test_habitable_zone_for_the_sun_matches_the_paper():
    # For the Sun (T* = 0) the distance is 1/sqrt(S_eff_sun): Table 1 gives 1.107 and 0.356.
    z = habitable.zone(5780, 1.0)
    assert z["conservative_inner_au"] == pytest.approx(1 / math.sqrt(1.107), rel=1e-12)
    assert z["conservative_outer_au"] == pytest.approx(1 / math.sqrt(0.356), rel=1e-12)
    assert z["optimistic_inner_au"] == pytest.approx(1 / math.sqrt(1.776), rel=1e-12)
    assert z["optimistic_outer_au"] == pytest.approx(1 / math.sqrt(0.32), rel=1e-12)
    # Earth (1 au) lies inside the zone for the Sun.
    assert z["conservative_inner_au"] < 1.0 < z["conservative_outer_au"] and z["in_valid_range"]


def test_habitable_zone_scales_with_luminosity_and_flags_range():
    a, b = habitable.zone(3500, 0.02), habitable.zone(3500, 0.08)
    assert b["conservative_inner_au"] == pytest.approx(2 * a["conservative_inner_au"])
    assert habitable.zone(2500, 0.001)["in_valid_range"] is False


def test_kepler_third_law_reproduces_the_archive_orbit():
    # TOI-700 c: archive period 16.0511039 d and orbit 0.0931 au; TIC star mass 0.413 Msun.
    st = json.loads((FIXTURES.parent.parent.parent / "data" / "stars.v1.json").read_text())["stars"]["TIC 150428135"]
    a = habitable.kepler_semimajor_axis_au(16.0511039, st["mass_msun"])
    assert a == pytest.approx(0.0931, rel=0.01)


# ---------- targets and systems ----------

def test_targets_list_every_target_with_mast_coordinates(client):
    body = client.get("/api/v2/targets").json()
    assert [t["slug"] for t in body["targets"]] == TARGET_SLUGS
    mast = {str(r["ID"]): r for r in fixture("mast_tic_targets_p4")["data"]}
    for t in body["targets"]:
        row = mast[t["tic"].split()[1]]
        assert (t["ra_deg"], t["dec_deg"]) == (row["ra"], row["dec"])
    counts = {t["slug"]: t["confirmed_planets"] for t in body["targets"]}
    assert counts["toi-700"] == 4 and counts["toi-178"] == 6 and counts["toi-1338"] == 0


def test_system_labels_our_signal_and_never_calls_it_a_planet(client):
    body = client.get("/api/v2/targets/toi-700/system").json()
    names = [p["name"] for p in body["planets"]]
    assert names == ["TOI-700 b", "TOI 700 pipeline signal", "TOI-700 c", "TOI-700 e", "TOI-700 d"]
    ours = next(p for p in body["planets"] if p["status"] == "pipeline_signal")
    assert ours["orbit_au"]["kind"] == "computed" and "never a discovery" in ours["note"]
    assert all(p["status"] == "confirmed" for p in body["planets"] if p is not ours)
    hz = body["habitable_zone"]
    assert hz["source"]["url"] == "https://arxiv.org/abs/1404.5292"
    # TOI-700 d sits in the conservative zone, as its discovery papers report.
    d = next(p for p in body["planets"] if p["name"] == "TOI-700 d")
    assert hz["conservative_inner_au"] < d["orbit_au"]["value"] < hz["conservative_outer_au"]


def test_eclipsing_binary_target_has_no_confirmed_planets(client):
    body = client.get("/api/v2/targets/toi-1338/system").json()
    assert [p["status"] for p in body["planets"]] == ["pipeline_signal"]
    assert "Eclipsing binary" in body["planets"][0]["note"]


def test_unknown_target_is_404(client):
    assert client.get("/api/v2/targets/toi-9999/system").status_code == 404
    assert client.get("/api/v2/targets/BAD!/system").status_code == 422


# ---------- missions (JPL Horizons) ----------

@pytest.mark.parametrize("craft", ["tess", "jwst", "voyager1", "voyager2"])
def test_spacecraft_distances_are_horizons_range_and_light_time(client, craft):
    got = next(c for c in client.get("/api/v2/missions").json()["spacecraft"] if c["id"] == craft)
    for key, frame in (("from_earth", "geo"), ("from_sun", "helio")):
        km, lt = sources.parse_horizons_range(fixture(f"horizons_{craft}_vectors_{frame}_p4")["result"])
        assert got[key]["distance"]["km"] == km and got[key]["light_time_seconds"] == lt
        assert got[key]["distance"]["au"] == pytest.approx(km / 149_597_870.7)
    assert got["launch"]["quote"]


def test_voyager1_distance_agrees_with_nasa_light_day_milestone(client):
    # NASA: Voyager 1 will be one light-day (25.902 billion km) from Earth on 2026-11-18. A month earlier our
    # distance must be just under that; Earth's own motion moves it by up to 2 au, so allow 1%.
    assert "16.094 billion miles (25.902 bil" in page_text("jpl_voyager_status")
    v1 = next(c for c in client.get("/api/v2/missions").json()["spacecraft"] if c["id"] == "voyager1")
    km = v1["from_earth"]["distance"]["km"]
    assert km < 25.902e9 and km == pytest.approx(25.902e9, rel=0.01)


def test_mission_facts_quote_the_saved_pages():
    m = json.loads((FIXTURES.parent.parent.parent / "data" / "missions.v1.json").read_text())["missions"]
    assert m["tess"]["launch"]["quote"] in page_text("nasa_tess_mission")
    assert m["voyager1"]["status"]["quote"] in page_text("nasa_voyager1_mission")
    assert m["jwst"]["status"] is None  # NASA's Webb page gives no status line; we show none rather than guess


def test_missions_degrade_when_horizons_is_down(client, monkeypatch):
    from live import http
    from live.fixture_transport import OfflineTransport
    http.set_transport(OfflineTransport())
    body = client.get("/api/v2/missions").json()
    assert all(c["from_earth"] is None and c["note"] for c in body["spacecraft"])
    assert all(c["launch"] for c in body["spacecraft"])


# ---------- ISS track and TESS facts ----------

def test_iss_track(client):
    body = client.get("/api/v2/iss/track").json()
    assert len(body["points"]) == 10 and body["kind"] == "computed"
    for p in body["points"]:
        assert -90 <= p["latitude"] <= 90 and -180 <= p["longitude"] <= 180
    stamps = [p["timestamp"] for p in body["points"]]
    assert stamps == sorted(stamps)


def test_tess_facts_are_quoted_from_their_sources(client):
    facts = client.get("/api/v2/tess").json()["facts"]
    assert set(facts) == {"orbit", "sector", "cameras", "pole", "stars", "launch"}
    assert "24° x 96°" in facts["sector"]["quote"] and "27 days" in facts["sector"]["quote"]
    mit = page_text("mit_tess_observations")
    for k in ("sector", "cameras", "pole"):
        assert facts[k]["quote"] in re.sub(r"\s+", " ", mit)
