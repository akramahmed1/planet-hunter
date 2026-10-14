"""HTTP-level tests. Need fastapi + httpx (requirements-dev.txt); skipped otherwise."""
import pytest

fastapi = pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient  # noqa: E402

import app as backend  # noqa: E402
import data_store  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(backend.app) as c:
        yield c


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["candidate_count"] == data_store.results().summary.count


def test_every_endpoint_matches_its_schema(client):
    for path in ["/api/overview", "/api/validation", "/api/candidates", "/api/method"]:
        assert client.get(path).status_code == 200, path


def test_every_candidate_detail_and_plot_resolves(client):
    for c in client.get("/api/candidates").json()["candidates"]:
        d = client.get(f"/api/candidates/{c['slug']}")
        assert d.status_code == 200
        assert d.json() == c
        if c["plot_url"]:
            p = client.get(c["plot_url"])
            assert p.status_code == 200 and p.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_unknown_slug_and_plot_404(client):
    assert client.get("/api/candidates/toi-0").status_code == 404
    assert client.get("/api/plots/nope.png").status_code == 404
    assert client.get("/api/plots/..%2Fapp.py").status_code == 404


def test_cors_allows_configured_origin(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://example.test")
    assert "https://example.test" in backend.allowed_origins()
