"""CLASSROOM_ENABLED: with the switch off, no classroom route works and nothing signs anyone in."""
from __future__ import annotations

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

import app as backend
from api_v2 import classroom_routes, phase9_routes
from classroom import auth, flags
from learn import store
from tests.test_scan_queue import engine  # noqa: F401
from tests.test_v2 import needs_db

H = {"x-ph-csrf": "1"}


def _path(route: APIRoute) -> str:
    out = route.path
    for name in route.param_convertors:
        out = out.replace("{" + name + "}", "1")
    return out


def _calls(router):
    for r in router.routes:
        if isinstance(r, APIRoute):
            for m in sorted(r.methods - {"HEAD", "OPTIONS"}):
                yield m, _path(r), r


@pytest.fixture
def off(monkeypatch):
    monkeypatch.delenv("CLASSROOM_ENABLED", raising=False)
    with TestClient(backend.app) as c:
        yield c


def test_the_switch_is_off_unless_explicitly_on(monkeypatch):
    monkeypatch.delenv("CLASSROOM_ENABLED", raising=False)
    assert flags.classroom_enabled() is False
    for v in ("", "0", "false", "no", "off", "enabled?"):
        monkeypatch.setenv("CLASSROOM_ENABLED", v)
        assert flags.classroom_enabled() is False, v
    for v in ("1", "true", "TRUE", " yes ", "on"):
        monkeypatch.setenv("CLASSROOM_ENABLED", v)
        assert flags.classroom_enabled() is True, v


def test_every_classroom_route_is_404_when_off(off):
    seen = 0
    for method, path, _ in _calls(classroom_routes.router):
        r = off.request(method, path, json={}, headers=H)
        assert r.status_code == 404, f"{method} {path} answered {r.status_code} with Classroom off"
        seen += 1
    assert seen > 20  # signup, login, join, auth/me, orgs, classes, assignments, gradebook, hunt


def test_teacher_signup_and_student_join_create_nothing_when_off(off):
    body = {"email": "ada@school.example", "password": "correct horse battery", "display_name": "Ada",
            "birth_year": 1980, "birth_month": 1, "org_name": "School"}
    r = off.post("/api/v2/auth/teacher/signup", json=body, headers=H)
    assert r.status_code == 404 and "ph_session" not in r.headers.get("set-cookie", "")
    r = off.post("/api/v2/auth/student/join", headers=H,
                 json={"class_code": "ABCDEFGH", "nickname": "Nova", "pin": "4321", "birth_year": 2010, "birth_month": 1})
    assert r.status_code == 404 and "ph_session" not in r.headers.get("set-cookie", "")


def test_teacher_only_billing_routes_are_404_when_off(off):
    for method, path, r in _calls(phase9_routes.router):
        if any(isinstance(d.call, auth.Auth) for d in r.dependant.dependencies):
            assert off.request(method, path, json={}, headers=H).status_code == 404, f"{method} {path}"


@needs_db
def test_public_pages_still_work_when_off(off, engine):  # noqa: F811
    assert off.get("/api/health").status_code == 200
    assert off.get("/api/v2/lessons").status_code == 200
    assert off.get("/api/v2/billing/plans").status_code == 200


@needs_db
def test_a_leftover_session_cookie_signs_nobody_in_when_off(off, engine, monkeypatch):  # noqa: F811
    """The lesson-answer route records progress for signed-in students; with Classroom off it must not
    even look the session up."""
    store.sync(engine)
    def boom(*a, **k):
        raise AssertionError("a session must not be looked up while Classroom is off")
    monkeypatch.setattr(auth, "load", boom)
    off.cookies.set(auth.COOKIE, "stale-token")
    r = off.post("/api/v2/lessons/transits/answers", json={"question": "depth_ratio", "choice": 0}, headers=H)
    assert r.status_code == 200, r.text


def test_features_reports_the_switch(monkeypatch):
    with TestClient(backend.app) as c:
        monkeypatch.delenv("CLASSROOM_ENABLED", raising=False)
        r = c.get("/api/v2/features")
        assert r.status_code == 200 and r.json() == {"classroom": False}
        monkeypatch.setenv("CLASSROOM_ENABLED", "1")
        assert c.get("/api/v2/features").json() == {"classroom": True}
