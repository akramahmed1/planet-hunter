"""Phase 5: exported light curves and periodograms."""
import json

import pytest

from api_v2.phase5_routes import LIGHTCURVES
from tests.test_live import client, frozen  # noqa: F401  (fixtures)

RESULTS = json.loads((LIGHTCURVES.parent / "results.json").read_text())["candidates"]
SIZE_BUDGET = 160 * 1024


@pytest.mark.parametrize("cand", RESULTS, ids=[c["slug"] for c in RESULTS])
def test_every_candidate_has_an_export_within_budget(cand):
    path = LIGHTCURVES / f"{cand['slug']}.json"
    assert path.is_file(), f"run scripts/export_lightcurves.py for {cand['slug']}"
    assert path.stat().st_size <= SIZE_BUDGET, f"{path.name} is {path.stat().st_size} bytes"
    d = json.loads(path.read_text())
    assert d["tic"] == cand["tic"] and len(d["time_btjd"]) == len(d["flux_ppm"]) == d["binning"]["n_bins"]
    assert d["time_btjd"] == sorted(d["time_btjd"])
    assert len(d["periodogram"]["period_d"]) == len(d["periodogram"]["power"]) <= 1500


@pytest.mark.parametrize("cand", RESULTS, ids=[c["slug"] for c in RESULTS])
def test_exported_signal_reproduces_the_published_scan(cand):
    # The export reruns the same pipeline on the same sectors; the period must match the published
    # scan (candidate_shortlist.csv) to 0.1%, and the periodogram peak must sit at that period.
    d = json.loads((LIGHTCURVES / f"{cand['slug']}.json").read_text())
    assert d["signal"]["period_d"] == pytest.approx(cand["period_d"], rel=1e-3)
    pg = d["periodogram"]
    peak = pg["period_d"][max(range(len(pg["power"])), key=pg["power"].__getitem__)]
    assert peak == pytest.approx(d["signal"]["period_d"], rel=2e-3)


def test_endpoints(client):
    r = client.get("/api/v2/lightcurves/toi-700")
    assert r.status_code == 200
    body = r.json()
    assert body["binning"]["bin_minutes"] == 10 and body["source"]["url"].startswith("https://")
    p = client.get("/api/v2/periodogram/toi-700").json()
    assert p["signal"] == body["signal"]
    assert client.get("/api/v2/lightcurves/toi-9999").status_code == 404
    assert client.get("/api/v2/periodogram/BAD").status_code == 422
