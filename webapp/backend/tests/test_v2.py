"""Tests for /api/v2 and the database layer.

Database tests use TEST_DATABASE_URL (a disposable Postgres). CI sets it and
also sets REQUIRE_DB=1, so there a missing database fails instead of skipping.
"""
import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text

import app as backend
import db

BACKEND = Path(__file__).resolve().parent.parent
TEST_DB = os.environ.get("TEST_DATABASE_URL", "").strip()

needs_db = pytest.mark.skipif(
    not TEST_DB and not os.environ.get("REQUIRE_DB"),
    reason="TEST_DATABASE_URL not set (CI sets REQUIRE_DB=1 so this cannot skip there)",
)


@pytest.fixture
def client():
    with TestClient(backend.app) as c:
        yield c


@pytest.fixture
def database_url(monkeypatch):
    assert TEST_DB, "REQUIRE_DB is set but TEST_DATABASE_URL is empty"
    monkeypatch.setenv("DATABASE_URL", TEST_DB)
    return db.database_url()


def test_database_url_normalizes_railway_schemes(monkeypatch):
    for raw in ("postgresql://u:p@h:5432/d", "postgres://u:p@h:5432/d"):
        monkeypatch.setenv("DATABASE_URL", raw)
        assert db.database_url() == "postgresql+psycopg://u:p@h:5432/d"
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@h/d")
    assert db.database_url() == "postgresql+psycopg://u:p@h/d"
    monkeypatch.setenv("DATABASE_URL", "  ")
    assert db.database_url() is None


def test_v2_health_without_database(monkeypatch, client):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    r = client.get("/api/v2/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "degraded"
    assert body["api_version"] == "2"
    assert body["database"] == {"status": "not_configured", "latency_ms": None}
    assert r.headers["cache-control"] == "no-store"


def test_v2_health_reports_deployed_commit(monkeypatch, client):
    monkeypatch.delenv("RAILWAY_GIT_COMMIT_SHA", raising=False)
    assert client.get("/api/v2/health").json()["commit"] is None
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "abc123")
    assert client.get("/api/v2/health").json()["commit"] == "abc123"


def test_v2_health_with_unreachable_database_hides_details(monkeypatch, client):
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:s3cret-pw@127.0.0.1:1/nope")
    r = client.get("/api/v2/health")
    assert r.status_code == 200
    assert r.json()["database"]["status"] == "unavailable"
    assert "s3cret-pw" not in r.text and "127.0.0.1" not in r.text


def test_v1_health_does_not_depend_on_database(monkeypatch, client):
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@127.0.0.1:1/nope")
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_openapi_lists_v2_health_and_keeps_v1(client):
    paths = client.get("/openapi.json").json()["paths"]
    assert "/api/v2/health" in paths
    for v1 in ["/api/health", "/api/overview", "/api/validation", "/api/candidates",
               "/api/candidates/{slug}", "/api/method", "/api/plots/{filename}"]:
        assert v1 in paths, v1


@needs_db
def test_v2_health_with_database(database_url, client):
    r = client.get("/api/v2/health")
    body = r.json()
    assert body["status"] == "ok"
    assert body["database"]["status"] == "connected"
    assert isinstance(body["database"]["latency_ms"], float)


@needs_db
def test_migrations_upgrade_and_downgrade(database_url):
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "migrations"))
    cfg.attributes["database_url"] = database_url
    command.upgrade(cfg, "head")
    eng = create_engine(database_url)
    with eng.connect() as conn:
        head = ScriptDirectory.from_config(cfg).get_current_head()
        assert conn.execute(text("select version_num from alembic_version")).scalar() == head
    command.downgrade(cfg, "base")
    with eng.connect() as conn:
        assert conn.execute(text("select count(*) from alembic_version")).scalar() == 0
    assert set(inspect(eng).get_table_names()) <= {"alembic_version"}
    eng.dispose()
