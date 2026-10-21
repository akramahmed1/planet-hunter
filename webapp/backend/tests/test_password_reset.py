"""Teacher forgot-password flow (launch task T17)."""
from __future__ import annotations

import re
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

import app as backend
import mailer
from classroom import data
from tests.test_classroom import ADULT, H, teacher  # noqa: F401
from tests.test_scan_queue import engine  # noqa: F401
from tests.test_v2 import needs_db

OLD = "correct horse battery"
NEW = "a brand new passphrase"
GENERIC = {"ok": True}


@pytest.fixture
def mail(monkeypatch):
    monkeypatch.setenv("EMAIL_PROVIDER", "memory")
    monkeypatch.setenv("APP_BASE_URL", "https://planet.example")
    mailer.outbox.clear()
    yield mailer.outbox
    mailer.outbox.clear()


def forgot(c, email):
    return c.post("/api/v2/auth/teacher/forgot", json={"email": email}, headers=H)


def token_in(msg) -> str:
    m = re.search(r"/classroom/reset#token=([A-Za-z0-9_-]+)", msg["text"])
    assert m, msg["text"]
    return m.group(1)


def reset(c, token, password=NEW):
    return c.post("/api/v2/auth/teacher/reset", json={"token": token, "password": password}, headers=H)


def login(email, password):
    with TestClient(backend.app) as c:
        return c.post("/api/v2/auth/teacher/login", json={"email": email, "password": password}, headers=H)


@needs_db
def test_the_answer_is_the_same_for_a_known_and_an_unknown_address(engine, mail):  # noqa: F811
    t = teacher("reset1@school.example", org="Reset School")
    with TestClient(backend.app) as c:
        known, unknown = forgot(c, "reset1@school.example"), forgot(c, "nobody@school.example")
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json() == GENERIC
    assert known.headers["cache-control"] == "no-store"
    assert [m["to"] for m in mail] == ["reset1@school.example"]  # only the real account gets mail
    t.__exit__(None, None, None)


@needs_db
def test_the_full_flow_changes_the_password_once_and_signs_out_everywhere(engine, mail):  # noqa: F811
    t = teacher("reset2@school.example", org="Reset School 2")
    assert t.get("/api/v2/auth/me").json()["me"] is not None
    with TestClient(backend.app) as c:
        forgot(c, "Reset2@School.example")
        tok = token_in(mail[0])
        assert "planet.example/classroom/reset#token=" in mail[0]["text"] and "?token" not in mail[0]["text"]
        assert reset(c, tok).status_code == 200
        again = reset(c, tok, "another good passphrase")
    assert again.status_code == 422 and "not valid" in again.json()["detail"]
    assert t.get("/api/v2/auth/me").json()["me"] is None  # the old session is gone
    assert login("reset2@school.example", OLD).status_code == 401
    assert login("reset2@school.example", NEW).status_code == 200
    with engine.connect() as cx:
        used = cx.execute(text("select count(*) from password_resets where used_at is not null")).scalar_one()
        assert used >= 1
        assert cx.execute(text("select count(*) from audit_log where action = 'password.reset'")).scalar_one() >= 1
    t.__exit__(None, None, None)


@needs_db
def test_only_the_newest_link_works(engine, mail):  # noqa: F811
    t = teacher("reset3@school.example", org="Reset School 3")
    with TestClient(backend.app) as c:
        forgot(c, "reset3@school.example")
        forgot(c, "reset3@school.example")
        first, second = token_in(mail[0]), token_in(mail[1])
        assert first != second
        assert reset(c, first).status_code == 422
        assert reset(c, second).status_code == 200
    t.__exit__(None, None, None)


@needs_db
def test_an_expired_token_is_refused(engine, mail):  # noqa: F811
    t = teacher("reset4@school.example", org="Reset School 4")
    with TestClient(backend.app) as c:
        forgot(c, "reset4@school.example")
        tok = token_in(mail[0])
        with engine.begin() as cx:
            cx.execute(text("update password_resets set expires_at = now() - interval '1 minute'"))
        assert reset(c, tok).status_code == 422
    assert login("reset4@school.example", OLD).status_code == 200  # password unchanged
    t.__exit__(None, None, None)


@needs_db
def test_the_token_is_stored_only_as_a_hash(engine, mail):  # noqa: F811
    t = teacher("reset5@school.example", org="Reset School 5")
    with TestClient(backend.app) as c:
        forgot(c, "reset5@school.example")
    tok = token_in(mail[0])
    with engine.connect() as cx:
        rows = [r[0] for r in cx.execute(text("select token_hash from password_resets"))]
    assert tok not in rows and data.security.token_hash(tok) in rows
    t.__exit__(None, None, None)


@needs_db
def test_a_weak_new_password_or_a_wrong_token_changes_nothing(engine, mail):  # noqa: F811
    t = teacher("reset6@school.example", org="Reset School 6")
    with TestClient(backend.app) as c:
        forgot(c, "reset6@school.example")
        tok = token_in(mail[0])
        assert reset(c, tok, "short").status_code == 422
        assert reset(c, "x" * 43).status_code == 422
        assert reset(c, tok).status_code == 200  # the good token still works after a weak password attempt
    t.__exit__(None, None, None)


@needs_db
def test_requests_are_rate_limited_per_address_and_per_caller(engine, mail):  # noqa: F811
    t = teacher("reset7@school.example", org="Reset School 7")
    with TestClient(backend.app) as c:
        codes = [forgot(c, "reset7@school.example").status_code for _ in range(5)]
    assert codes[:3] == [202, 202, 202] and codes[3:] == [429, 429]
    assert len(mail) == 3
    t.__exit__(None, None, None)


@needs_db
def test_a_mail_problem_never_changes_the_answer(engine, monkeypatch):  # noqa: F811
    monkeypatch.setenv("EMAIL_PROVIDER", "resend")
    monkeypatch.delenv("EMAIL_API_KEY", raising=False)
    monkeypatch.delenv("APP_BASE_URL", raising=False)
    t = teacher("reset8@school.example", org="Reset School 8")
    with TestClient(backend.app) as c:
        r = forgot(c, "reset8@school.example")
    assert r.status_code == 202 and r.json() == GENERIC
    t.__exit__(None, None, None)


@needs_db
def test_an_unusable_base_url_sends_no_link(engine, monkeypatch):  # noqa: F811
    monkeypatch.setenv("EMAIL_PROVIDER", "memory")
    monkeypatch.setenv("APP_BASE_URL", "javascript:alert(1)")
    mailer.outbox.clear()
    t = teacher("reset9@school.example", org="Reset School 9")
    with TestClient(backend.app) as c:
        assert forgot(c, "reset9@school.example").status_code == 202
    assert mailer.outbox == []
    t.__exit__(None, None, None)


@needs_db
def test_a_bad_address_and_a_missing_csrf_header_are_refused(engine):  # noqa: F811
    with TestClient(backend.app) as c:
        assert c.post("/api/v2/auth/teacher/forgot", json={"email": "nope"}, headers=H).status_code == 422
        assert c.post("/api/v2/auth/teacher/forgot", json={"email": "a@b.example"}).status_code == 403
        assert c.post("/api/v2/auth/teacher/reset", json={"token": "x" * 30, "password": NEW}).status_code == 403


@needs_db
def test_the_email_has_no_dashes_that_break_copying_and_names_the_expiry(engine, mail):  # noqa: F811
    t = teacher("reset10@school.example", org="Reset School 10")
    with TestClient(backend.app) as c:
        forgot(c, "reset10@school.example")
    body = mail[0]["text"]
    assert "60 minutes" in body and "—" not in body and "–" not in body
    t.__exit__(None, None, None)
