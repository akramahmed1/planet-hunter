"""Phase 2 live data layer, tested offline against the saved real source samples.

The clock is frozen at the date the samples were fetched (2026-10-17), and
every HTTP request is answered by live.fixture_transport. Database tests use
TEST_DATABASE_URL like test_v2.py.
"""
import html
import json
import math
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

import app as backend
from api_v2 import live_routes
from live import cache, clock, http, physics, positions, refresh, sources
from live.fixture_transport import FIXTURES, FixtureTransport, OfflineTransport

BACKEND = Path(__file__).resolve().parent.parent
REPO = BACKEND.parent.parent
SAMPLE_TIME = datetime(2026, 10, 17, 12, 0, tzinfo=timezone.utc)
TEST_DB = os.environ.get("TEST_DATABASE_URL", "").strip()
needs_db = pytest.mark.skipif(not TEST_DB and not os.environ.get("REQUIRE_DB"),
                              reason="TEST_DATABASE_URL not set (CI sets REQUIRE_DB=1 so this cannot skip there)")


class Clock:
    def __init__(self, t):
        self.t = t

    def now(self):
        return self.t


@pytest.fixture
def frozen(monkeypatch):
    c = Clock(SAMPLE_TIME)
    monkeypatch.setattr(clock, "now", c.now)
    monkeypatch.setattr(clock, "today", lambda: c.t.date())
    monkeypatch.setattr(http.time, "sleep", lambda s: None)  # no real waits between retries
    monkeypatch.delenv("DATABASE_URL", raising=False)
    cache.clear_memory()
    http.set_transport(FixtureTransport())
    yield c
    http.set_transport(None)
    cache.clear_memory()


@pytest.fixture
def client(frozen):
    with TestClient(backend.app) as c:
        yield c


def fixture_json(name):
    return json.loads((FIXTURES / f"{name}.json").read_text())


def horizons_fixture(body):
    return positions.parse_horizons_vectors(fixture_json(f"horizons_{body}_vectors_helio_today")["result"])


# ---------- reference data ----------

def test_reference_data_is_rebuilt_from_samples():
    r = subprocess.run([sys.executable, str(REPO / "scripts" / "build_reference_data.py"), "--check"],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr


def page_text(name):
    raw = (FIXTURES / f"{name}.html").read_text(encoding="utf-8", errors="replace")
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", raw)))


def test_bodies_quotes_are_verbatim_and_conversions_exact(client):
    r = client.get("/api/v2/bodies")
    assert r.status_code == 200
    assert "max-age=86400" in r.headers["cache-control"]
    bodies = r.json()["bodies"]
    assert [b["id"] for b in bodies] == ["sun", "mercury", "venus", "earth", "moon", "mars", "jupiter", "saturn",
                                         "uranus", "neptune", "pluto"]
    for b in bodies:
        assert b["source"]["url"].startswith("https://nssdc.gsfc.nasa.gov/planetary/factsheet/")
        text = page_text(f"nssdca_{b['id']}fact")
        assert b["temperatures"], b["id"]
        for t in b["temperatures"]:
            assert t["quote"] in text, (b["id"], t["quote"])
            assert t["kind"] == "measured"
            for temp in (t["value"], t["low"], t["high"]):
                if temp:
                    assert temp["celsius"] == pytest.approx(temp["kelvin"] - 273.15, abs=0.01)
                    assert temp["fahrenheit"] == pytest.approx((temp["kelvin"] - 273.15) * 1.8 + 32, abs=0.01)
    earth = next(b for b in bodies if b["id"] == "earth")
    assert earth["mass"] == {**earth["mass"], "value": 5.9722, "unit": "1e24 kg", "kind": "measured"}
    mercury = next(b for b in bodies if b["id"] == "mercury")
    assert mercury["temperatures"][0]["value"]["kelvin"] == 440  # not the 590-725 K side note


# ---------- positions ----------

def test_positions_today_come_from_horizons(client):
    r = client.get("/api/v2/positions")
    assert r.status_code == 200
    body = r.json()
    assert body["date"] == "2026-10-17"
    got = {p["id"]: p for p in body["bodies"]}
    assert set(got) == set(live_routes.POSITION_BODIES)
    assert got["sun"]["kind"] == "computed" and got["sun"]["x_au"] == 0
    for b in sources.HORIZONS_IDS:
        assert got[b]["kind"] == "measured", b
        assert (got[b]["x_au"], got[b]["y_au"], got[b]["z_au"]) == pytest.approx(horizons_fixture(b))
        assert got[b]["stale"] is False


def test_positions_other_dates_are_computed_without_the_moon(client):
    body = client.get("/api/v2/positions", params={"date": "1969-07-20"}).json()
    ids = [p["id"] for p in body["bodies"]]
    assert "moon" not in ids and len(ids) == 10
    assert all(p["kind"] == "computed" for p in body["bodies"])
    assert body["notes"]


@pytest.mark.parametrize("value", ["1799-12-31", "2051-01-01", "2026-13-01", "yesterday"])
def test_positions_reject_dates_outside_jpl_range(client, value):
    assert client.get("/api/v2/positions", params={"date": value}).status_code == 422


# JPL's nominal 1800-2050 errors for Table 1: longitude and latitude in arcsec, distance in 1000 km
# (https://ssd.jpl.nasa.gov/planets/approx_pos.html). The test allows 3x the combined nominal error,
# since JPL states typical, not maximum, errors.
NOMINAL = {"mercury": (15, 1, 1), "venus": (20, 1, 4), "earth": (20, 8, 6), "mars": (40, 2, 25),
           "jupiter": (400, 10, 600), "saturn": (600, 25, 1500), "uranus": (50, 2, 1000), "neptune": (10, 1, 200)}


@pytest.mark.parametrize("body", sorted(NOMINAL))
def test_computed_positions_match_horizons_within_jpl_tolerance(body):
    hz = horizons_fixture(body)
    ours = positions.kepler_position(body, SAMPLE_TIME.date())
    r_km = math.hypot(*hz) * live_routes.KM_PER_AU
    lam, phi, rho = NOMINAL[body]
    arcsec = math.radians(1 / 3600)
    nominal_km = math.sqrt((r_km * lam * arcsec) ** 2 + (r_km * phi * arcsec) ** 2 + (rho * 1000) ** 2)
    assert math.dist(hz, ours) * live_routes.KM_PER_AU < 3 * nominal_km


def test_pluto_interpolation_matches_horizons():
    err_au = math.dist(horizons_fixture("pluto"), positions.pluto_position(SAMPLE_TIME.date()))
    assert err_au < 1e-4  # 15,000 km at 34 au


def test_julian_day_reference_points():
    from datetime import date
    assert positions.julian_day(date(2000, 1, 1)) == 2451544.5
    assert positions.julian_day(date(1800, 1, 4)) == 2378499.5  # first row of the Horizons Pluto table


def test_distance_and_light_time(client):
    r = client.get("/api/v2/distances", params={"from": "earth", "to": "mars"})
    assert r.status_code == 200
    body = r.json()
    expected_au = math.dist(horizons_fixture("earth"), horizons_fixture("mars"))
    assert body["distance"]["au"] == pytest.approx(expected_au)
    assert body["distance"]["km"] == pytest.approx(expected_au * 149_597_870.7)
    assert body["distance"]["mi"] == pytest.approx(body["distance"]["km"] / 1.609344)
    assert body["light_time_seconds"] == pytest.approx(body["distance"]["km"] / 299_792.458)
    assert body["kind"] == "computed"


def test_distance_validation(client):
    assert client.get("/api/v2/distances", params={"from": "earth", "to": "vulcan"}).status_code == 422
    assert client.get("/api/v2/distances", params={"from": "earth", "to": "earth"}).status_code == 422
    r = client.get("/api/v2/distances", params={"from": "earth", "to": "moon", "date": "2000-01-01"})
    assert r.status_code == 422
    assert client.get("/api/v2/distances", params={"from": "earth", "to": "moon"}).status_code == 200


# ---------- ISS, APOD, space weather ----------

def test_iss(client):
    r = client.get("/api/v2/iss")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "public, max-age=5"
    body, raw = r.json(), fixture_json("iss_wheretheiss")
    assert (body["latitude"], body["longitude"], body["altitude_km"]) == (raw["latitude"], raw["longitude"],
                                                                          raw["altitude"])
    assert body["source"]["url"] == "https://wheretheiss.at/w/developer" and body["stale"] is False


def test_apod(client):
    body = client.get("/api/v2/apod").json()
    raw = fixture_json("nasa_apod")
    assert body["title"] == raw["title"] and body["date"] == raw["date"]
    assert body["copyright"] is None


def test_apod_error_with_http_200_is_treated_as_failure(frozen):
    # api.nasa.gov returned HTTP 200 with {"code": 500, ...} during Phase 2 sampling.
    http.set_transport(httpx.MockTransport(lambda req: httpx.Response(200, json=fixture_json("nasa_apod_p2"))))
    with pytest.raises(http.FetchError):
        sources.apod()


def test_space_weather_unavailable_is_explicit(client):
    # The saved DONKI sample is a real 503.
    r = client.get("/api/v2/space-weather")
    assert r.status_code == 503
    body = r.json()
    assert body["status"] == "unavailable" and "DONKI" in body["message"]
    assert body["source"]["url"].startswith("https://")
    assert r.headers["retry-after"] == "300"


def test_donki_items_without_expected_keys_are_dropped(frozen):
    items = [{"messageType": "FLR", "messageIssueTime": "2026-10-16T10:00Z", "messageURL": "https://x"},
             {"unexpected": True}]
    http.set_transport(httpx.MockTransport(lambda req: httpx.Response(200, json=items)))
    assert sources.donki(SAMPLE_TIME.date()) == [{"type": "FLR", "issued": "2026-10-16T10:00Z",
                                                  "url": "https://x"}]


# ---------- exoplanets ----------

def test_exoplanets_latest(client):
    body = client.get("/api/v2/exoplanets/latest").json()
    assert body["confirmed_count"]["value"] == fixture_json("exoplanet_archive_count")[0]["n"]
    assert body["latest"] and body["since"] == "2026-08"
    pubdates = [p["disc_pubdate"] for p in body["latest"]]
    assert pubdates == sorted(pubdates, reverse=True)


def test_exoplanet_system(client):
    body = client.get("/api/v2/exoplanets/TOI-700").json()
    assert [p["name"] for p in body["planets"]] == ["TOI-700 b", "TOI-700 c", "TOI-700 e", "TOI-700 d"]
    lum = body["star"]["luminosity_lsun"]
    assert lum["kind"] == "computed" and lum["value"] == pytest.approx(10 ** -1.63264, rel=1e-5)
    assert all(p["equilibrium_temperature"]["kind"] == "measured" for p in body["planets"])


def test_exoplanet_name_validation(client):
    assert client.get("/api/v2/exoplanets/TOI-700'; drop").status_code == 422
    assert client.get("/api/v2/exoplanets/No Such Star").status_code == 404


# Checks the estimate's formula against NASA's own numbers: each NSSDCA fact sheet gives a
# black-body temperature and a Bond albedo; the Sun's sheet gives 5772 K and 695,700 km.
# Pluto is left out: its sheet's 37.5 K is not reproduced (we get 32.3 K), and the sheet
# does not say how that value was derived.
@pytest.mark.parametrize("body", ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"])
def test_equilibrium_formula_reproduces_nasa_blackbody_temperatures(body):
    from live import reference

    bodies = {b["id"]: b for b in reference.bodies()["bodies"]}
    sun = bodies["sun"]
    teff = next(t["kelvin"] for t in sun["temperatures"] if t["label"] == "Effective temperature")
    text = page_text(f"nssdca_{body}fact")
    albedo = float(re.search(r"Bond albedo\s+([\d.]+)", text).group(1))
    facts = bodies[body]["facts"]
    a_au = facts["semimajor_axis_1e6_km"] * 1e6 / physics.KM_PER_AU
    est = physics.equilibrium_temperature_k(teff, sun["facts"]["mean_radius_km"] / physics.R_SUN_KM, a_au, albedo)
    assert est == pytest.approx(facts["blackbody_temperature_k"], rel=0.005)


def test_missing_equilibrium_temperature_is_estimated_and_labeled():
    row = dict(fixture_json("exoplanet_archive_system_toi700")[3], pl_eqt=None)
    q = live_routes._eq_temp(row)
    assert q.kind == "estimate" and q.note and "1011.0428" in q.source.url
    assert live_routes._eq_temp(dict(row, pl_orbsmax=None)) is None


# ---------- failures: stale copies and explicit unavailability ----------

# Each endpoint's cache lifetime, so the test can step just past it on the same day
# (the APOD and exoplanet cache keys include the date).
EXPIRY = {"/api/v2/iss": timedelta(seconds=6), "/api/v2/apod": timedelta(hours=3, minutes=1),
          "/api/v2/exoplanets/latest": timedelta(hours=12, minutes=1),
          "/api/v2/exoplanets/TOI-700": timedelta(hours=24, minutes=1)}


@pytest.mark.parametrize("path", sorted(EXPIRY))
def test_network_down_serves_last_good_copy_as_stale(client, frozen, path):
    frozen.t = SAMPLE_TIME.replace(hour=0, minute=30)
    first = client.get(path)
    assert first.status_code == 200 and first.json()["stale"] is False
    frozen.t += EXPIRY[path]
    http.set_transport(OfflineTransport())
    again = client.get(path)
    assert again.status_code == 200
    assert again.json()["stale"] is True
    assert again.json()["fetched_at"] == first.json()["fetched_at"]


@pytest.mark.parametrize("path", ["/api/v2/iss", "/api/v2/apod", "/api/v2/space-weather",
                                  "/api/v2/exoplanets/latest"])
def test_network_down_with_nothing_cached_is_explicitly_unavailable(client, path):
    http.set_transport(OfflineTransport())
    r = client.get(path)
    assert r.status_code == 503
    assert r.json()["status"] == "unavailable" and r.json()["message"]


def test_horizons_is_called_one_request_at_a_time(client, frozen):
    import threading

    active, peak, lock = [0], [0], threading.Lock()
    fixtures = FixtureTransport()

    def counting(request):
        with lock:
            active[0] += 1
            peak[0] = max(peak[0], active[0])
        try:
            return fixtures.handle_request(request)
        finally:
            with lock:
                active[0] -= 1

    http.set_transport(httpx.MockTransport(counting))
    assert client.get("/api/v2/positions").status_code == 200
    assert peak[0] == 1


def test_network_down_positions_fall_back_to_computed(client):
    http.set_transport(OfflineTransport())
    body = client.get("/api/v2/positions").json()
    planets = [p for p in body["bodies"] if p["id"] != "sun"]
    assert planets and all(p["kind"] == "computed" and p["note"] for p in planets)
    assert "moon" not in [p["id"] for p in planets]


def test_failed_source_is_not_retried_on_every_request(client, frozen):
    calls = []

    def down(request):
        calls.append(1)
        return httpx.Response(503)

    http.set_transport(httpx.MockTransport(down))
    assert client.get("/api/v2/space-weather").status_code == 503
    first = len(calls)
    assert first == http.RETRIES + 1
    assert client.get("/api/v2/space-weather").status_code == 503
    assert len(calls) == first  # answered from the failure backoff, no upstream call
    frozen.t += cache.FAILURE_BACKOFF + timedelta(seconds=1)
    http.set_transport(FixtureTransport())
    assert client.get("/api/v2/iss").status_code == 200  # other keys unaffected
    http.set_transport(httpx.MockTransport(down))
    assert client.get("/api/v2/space-weather").status_code == 503
    assert len(calls) == 2 * first  # retried once the backoff expired


def test_retries_then_succeeds(frozen):
    calls = []

    def flaky(request):
        calls.append(1)
        return httpx.Response(503) if len(calls) < 3 else httpx.Response(200, json=fixture_json("iss_wheretheiss"))

    http.set_transport(httpx.MockTransport(flaky))
    assert sources.iss()["latitude"] == fixture_json("iss_wheretheiss")["latitude"]
    assert len(calls) == 3


def test_refresh_job(frozen):
    assert refresh.main() == 0  # all but DONKI succeed against the samples
    assert cache._read("exo:count").payload == fixture_json("exoplanet_archive_count")[0]["n"]
    assert cache._read(f"donki:{SAMPLE_TIME.date()}") is None


# ---------- the Postgres-backed cache ----------

@needs_db
def test_cache_round_trips_through_postgres(frozen, monkeypatch):
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine, text

    assert TEST_DB, "REQUIRE_DB is set but TEST_DATABASE_URL is empty"
    monkeypatch.setenv("DATABASE_URL", TEST_DB)
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "migrations"))
    command.upgrade(cfg, "head")
    try:
        src = {"name": "test", "url": "https://example.org"}
        assert cache.cached("t:key", timedelta(minutes=5), lambda: {"v": 1}, src).stale is False
        cache.clear_memory()  # force the next read to come from Postgres
        frozen.t += timedelta(minutes=10)

        def down():
            raise http.FetchError("down")

        hit = cache.cached("t:key", timedelta(minutes=5), down, src)
        assert hit.stale is True and hit.payload == {"v": 1}
        with create_engine(db_url := cache.db.database_url()).connect() as conn:
            assert conn.execute(text("select source->>'name' from external_cache where key='t:key'")).scalar() == "test"
    finally:
        command.downgrade(cfg, "base")


# ---------- orbits (Phase 3) ----------

def test_orbits_pass_through_the_computed_positions(client):
    body = client.get("/api/v2/orbits").json()
    orbits = {o["id"]: o for o in body["orbits"]}
    assert list(orbits) == live_routes.ORBIT_BODIES
    for body_id, o in orbits.items():
        assert len(o["points"]) == 180 and o["kind"] == "computed"
        # Every computed position for a date should lie on (close to) the drawn path.
        pos = positions.computed_position(body_id, SAMPLE_TIME.date())
        r = math.hypot(*pos)
        nearest = min(math.dist(pos, p) for p in o["points"])
        # 180 samples: the chord gap is at most about pi * r / 180 for a near-circular orbit.
        assert nearest < 2 * math.pi * r / 180, body_id


def test_orbit_periods_come_from_nssdca(client):
    facts = {b["id"]: b for b in client.get("/api/v2/bodies").json()["bodies"]}
    for o in client.get("/api/v2/orbits").json()["orbits"]:
        assert o["period_days"] == facts[o["id"]]["orbit_period"]["value"]


def test_orbit_windows_stay_inside_the_valid_range():
    lo, hi = positions.valid_range()
    with pytest.raises(ValueError):
        positions.orbit_path("pluto", (hi - lo).days + 1)
    # Pluto's 248-year orbit only just fits in 1800-2050; it must not raise.
    assert len(positions.orbit_path("pluto", 90_560.0)) == 180


@pytest.mark.parametrize("reply,reason", [({"error": "TAP service under maintenance"}, "returned an error"),
                                           ([{}], "count missing")])
def test_exoplanet_archive_failures_are_logged_with_what_it_sent(monkeypatch, caplog, reply, reason):
    monkeypatch.setattr(sources.http, "get_json", lambda url, params: reply)
    with caplog.at_level("WARNING", logger="planet-hunter.live"), pytest.raises(sources.http.FetchError):
        sources.exoplanet_count()
    assert any(f"fetch failed: Exoplanet Archive {reason}" in r.getMessage() for r in caplog.records)
