"""Scan API: ID validation, queueing, status, results, rate limits (real Postgres, no network)."""
import pytest
from fastapi.testclient import TestClient

import app as backend
from scans import queue
from tests.test_live import frozen  # noqa: F401
from tests.test_scan_queue import RUN, SIGNAL, engine  # noqa: F401
from tests.test_v2 import needs_db
from scans import catalogs


def test_target_ids_are_parsed_strictly(frozen):  # noqa: F811
    assert catalogs.resolve("TIC 150428135") == (150428135, None)
    assert catalogs.resolve("  150428135 ") == (150428135, None)
    assert catalogs.resolve("tic-150428135") == (150428135, None)
    for bad in ["", "TIC", "TIC 12345678901", "TIC 1; drop table", "Proxima", "TOI 70000000", "TIC -5"]:
        with pytest.raises(catalogs.BadTarget):
            catalogs.resolve(bad)


def test_toi_numbers_resolve_through_the_toi_list(frozen, monkeypatch):  # noqa: F811
    monkeypatch.setattr(catalogs, "_tap", lambda q: [{"tid": 150428135, "toi": "700.01"}] if "700" in q else [])
    assert catalogs.resolve("TOI 700") == (150428135, "TOI 700")
    assert catalogs.resolve("toi-700.01") == (150428135, "TOI 700")
    with pytest.raises(catalogs.BadTarget):
        catalogs.resolve("TOI 99999")


def test_scans_without_a_database_say_so(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with TestClient(backend.app) as c:
        r = c.post("/api/v2/scans", json={"target": "TIC 150428135"})
        assert r.status_code == 503 and "database" in r.json()["detail"]
        assert c.post("/api/v2/scans", json={"target": "nonsense"}).status_code == 422


@needs_db
def test_scan_lifecycle(engine, monkeypatch):  # noqa: F811
    with TestClient(backend.app) as c:
        r = c.post("/api/v2/scans", json={"target": "TIC 150428135"}, headers={"X-Forwarded-For": "203.0.113.5"})
        assert r.status_code == 202
        body = r.json()
        assert body["created"] and body["status"] == "queued" and body["tic_id"] == 150428135
        again = c.post("/api/v2/scans", json={"target": "150428135"}, headers={"X-Forwarded-For": "198.51.100.7"})
        assert again.json() == {**body, "created": False}
        st = c.get(f"/api/v2/scans/{body['id']}").json()
        assert st["status"] == "queued" and st["signal"] is None and st["preset"] == "standard"
        assert c.get(f"/api/v2/scans/{body['id']}/lightcurve").status_code == 404

        job = queue.claim(engine, "w")
        sig = {**SIGNAL, "vetting": [{"id": "odd_even", "name": "Odd and even dips", "status": "pass", "value": None,
                                      "explanation": "same"}],
               "crossmatch": {"matches": [], "proposed_label": "no_match", "label_text": "No match", "note": None,
                              "tolerance": 0.01, "reviewed": False}}
        run = {**RUN, "lightcurve": {"source": {"name": "n", "url": "https://x", "fetched_at": "2026-10-18T00:00:00+00:00"},
                                     "processing": "p", "binning": {"method": "m", "bin_minutes": 10, "n_bins": 1},
                                     "time_btjd": [1.0], "flux_ppm": [0]},
               "periodogram": {"method": "m", "period_d": [1.0], "power": [0.1]}}
        assert queue.complete(engine, job, "w", run, sig)
        st = c.get(f"/api/v2/scans/{body['id']}").json()
        assert st["status"] == "succeeded"
        assert st["signal"]["label_status"] == "proposed, not reviewed"
        lc = c.get(f"/api/v2/scans/{body['id']}/lightcurve").json()
        assert lc["signal"]["period_d"] == 1.0 and lc["tic"] == "TIC 150428135"
        assert c.get(f"/api/v2/scans/{body['id']}/periodogram").status_code == 200
        assert c.get("/api/v2/scans/999999").status_code == 404


@needs_db
def test_scan_rate_limit_is_per_client(engine):  # noqa: F811
    with TestClient(backend.app) as c:
        h = {"X-Forwarded-For": "192.0.2.1"}
        for i in range(queue.MAX_PER_REQUESTER_PER_HOUR):
            assert c.post("/api/v2/scans", json={"target": f"TIC {9000 + i}"}, headers=h).status_code == 202
        r = c.post("/api/v2/scans", json={"target": "TIC 9999"}, headers=h)
        assert r.status_code == 429 and r.headers["retry-after"] == "3600"
        other = c.post("/api/v2/scans", json={"target": "TIC 9999"}, headers={"X-Forwarded-For": "192.0.2.2"})
        assert other.status_code == 202
