"""Teacher email verification (launch task T18)."""
from __future__ import annotations

import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

import app as backend
import mailer
from classroom import data
from tests.test_classroom import H, teacher
from tests.test_scan_queue import engine  # noqa: F401
from tests.test_v2 import needs_db


@pytest.fixture
def mail(monkeypatch):
    monkeypatch.setenv("EMAIL_PROVIDER", "memory")
    monkeypatch.setenv("APP_BASE_URL", "https://planet.example")
    mailer.outbox.clear()
    yield mailer.outbox
    mailer.outbox.clear()


def token_in(msg) -> str:
    m = re.search(r"/classroom/verify#token=([A-Za-z0-9_-]+)", msg["text"])
    assert m, msg["text"]
    return m.group(1)


def verify(c, token):
    return c.post("/api/v2/auth/teacher/verify", json={"token": token}, headers=H)


def verified(c) -> bool:
    return c.get("/api/v2/auth/me").json()["me"]["email_verified"]


@needs_db
def test_signup_sends_a_link_and_the_link_verifies_once(engine, mail):  # noqa: F811
    t = teacher("verify1@school.example", org="Verify School")
    assert [m["to"] for m in mail] == ["verify1@school.example"]
    assert "48 hours" in mail[0]["text"] and "planet.example/classroom/verify#token=" in mail[0]["text"]
    assert verified(t) is False
    tok = token_in(mail[0])
    with TestClient(backend.app) as anon:  # no sign-in needed: the link is the proof
        assert verify(anon, tok).status_code == 200
        again = verify(anon, tok)
    assert again.status_code == 422 and "not valid" in again.json()["detail"]
    assert verified(t) is True
    with engine.connect() as cx:
        assert cx.execute(text("select count(*) from audit_log where action = 'email.verify'")).scalar_one() >= 1
    t.__exit__(None, None, None)


@needs_db
def test_a_wrong_or_expired_token_changes_nothing(engine, mail):  # noqa: F811
    t = teacher("verify2@school.example", org="Verify School 2")
    tok = token_in(mail[0])
    with TestClient(backend.app) as anon:
        assert verify(anon, "x" * 43).status_code == 422
        with engine.begin() as cx:
            cx.execute(text("update email_verifications set expires_at = now() - interval '1 minute'"))
        assert verify(anon, tok).status_code == 422
    assert verified(t) is False
    t.__exit__(None, None, None)


@needs_db
def test_the_token_is_stored_only_as_a_hash(engine, mail):  # noqa: F811
    t = teacher("verify3@school.example", org="Verify School 3")
    tok = token_in(mail[0])
    with engine.connect() as cx:
        rows = [r[0] for r in cx.execute(text("select token_hash from email_verifications"))]
    assert tok not in rows and data.security.token_hash(tok) in rows
    t.__exit__(None, None, None)


@needs_db
def test_resend_replaces_the_old_link_and_is_limited_to_three_a_day(engine, mail):  # noqa: F811
    t = teacher("verify4@school.example", org="Verify School 4")
    first = token_in(mail[0])
    codes = [t.post("/api/v2/auth/teacher/verify/resend", headers=H).status_code for _ in range(4)]
    assert codes == [202, 202, 202, 429]
    assert len(mail) == 4  # signup + three resends
    newest = token_in(mail[-1])
    with TestClient(backend.app) as anon:
        assert verify(anon, first).status_code == 422
        assert verify(anon, newest).status_code == 200
    t.__exit__(None, None, None)


@needs_db
def test_resend_needs_a_teacher_and_csrf_and_does_nothing_once_verified(engine, mail):  # noqa: F811
    t = teacher("verify5@school.example", org="Verify School 5")
    with TestClient(backend.app) as anon:
        assert anon.post("/api/v2/auth/teacher/verify/resend", headers=H).status_code == 401
    assert t.post("/api/v2/auth/teacher/verify/resend").status_code == 403
    with TestClient(backend.app) as anon:
        verify(anon, token_in(mail[0]))
    n = len(mail)
    assert t.post("/api/v2/auth/teacher/verify/resend", headers=H).status_code == 202
    assert len(mail) == n  # already verified: nothing sent
    t.__exit__(None, None, None)


@needs_db
def test_a_link_for_an_old_address_does_not_verify_a_changed_one(engine, mail):  # noqa: F811
    t = teacher("verify6@school.example", org="Verify School 6")
    tok = token_in(mail[0])
    with engine.begin() as cx:
        cx.execute(text("update users set email = 'changed@school.example' where lower(email) = 'verify6@school.example'"))
    with TestClient(backend.app) as anon:
        assert verify(anon, tok).status_code == 422
    t.__exit__(None, None, None)


@needs_db
def test_mail_trouble_never_breaks_signup(engine, monkeypatch):  # noqa: F811
    monkeypatch.setenv("EMAIL_PROVIDER", "resend")
    monkeypatch.delenv("EMAIL_API_KEY", raising=False)
    monkeypatch.delenv("APP_BASE_URL", raising=False)
    t = teacher("verify7@school.example", org="Verify School 7")
    assert verified(t) is False
    t.__exit__(None, None, None)
