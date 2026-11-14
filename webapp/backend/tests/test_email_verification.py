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
    t = teacher("verify1@school.example", org="Verify School", verified=False)
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
    t = teacher("verify2@school.example", org="Verify School 2", verified=False)
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
    t = teacher("verify3@school.example", org="Verify School 3", verified=False)
    tok = token_in(mail[0])
    with engine.connect() as cx:
        rows = [r[0] for r in cx.execute(text("select token_hash from email_verifications"))]
    assert tok not in rows and data.security.token_hash(tok) in rows
    t.__exit__(None, None, None)


@needs_db
def test_resend_replaces_the_old_link_and_is_limited_to_three_a_day(engine, mail):  # noqa: F811
    t = teacher("verify4@school.example", org="Verify School 4", verified=False)
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
    t = teacher("verify5@school.example", org="Verify School 5", verified=False)
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
    t = teacher("verify6@school.example", org="Verify School 6", verified=False)
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
    t = teacher("verify7@school.example", org="Verify School 7", verified=False)
    assert verified(t) is False
    t.__exit__(None, None, None)


@needs_db
def test_an_unconfirmed_teacher_cannot_use_a_school_a_class_or_a_join_code(engine, mail):  # noqa: F811
    """Found 2026-11-14: a made-up address became school admin with a join code. Now every school, class and
    assignment route answers 403 until the emailed link is used; resend and 'who am I' still work."""
    t = teacher("gate1@school.example", org="Gate School", verified=False)
    me = t.get("/api/v2/auth/me").json()["me"]
    assert me["email_verified"] is False and me["orgs"]
    org_id = me["orgs"][0]["org_id"]
    for method, path, body in [
        ("GET", f"/api/v2/orgs/{org_id}", None),
        ("GET", f"/api/v2/orgs/{org_id}/overview", None),
        ("POST", f"/api/v2/orgs/{org_id}/join-code", {}),
        ("GET", f"/api/v2/orgs/{org_id}/classes", None),
        ("POST", f"/api/v2/orgs/{org_id}/classes", {"name": "Period 3"}),
        ("POST", "/api/v2/orgs", {"name": "Another"}),
    ]:
        r = t.request(method, path, json=body, headers=H) if body is not None else t.request(method, path, headers=H)
        assert r.status_code == 403, (method, path, r.status_code, r.text)
        assert "Confirm your email" in r.json()["detail"]
    assert t.post("/api/v2/auth/teacher/verify/resend", json={}, headers=H).status_code == 202
    # After the link is used the same calls work.
    token = [m for m in mail if m["to"] == "gate1@school.example"][-1]["text"].split("token=")[1].split()[0]
    assert t.post("/api/v2/auth/teacher/verify", json={"token": token}, headers=H).status_code == 200
    assert t.get(f"/api/v2/orgs/{org_id}", headers=H).status_code == 200
    assert t.post(f"/api/v2/orgs/{org_id}/classes", json={"name": "Period 3"}, headers=H).status_code == 201


@needs_db
def test_only_the_reserved_test_domain_is_auto_confirmed_and_only_when_the_switch_is_on(engine, mail, monkeypatch):  # noqa: F811
    """AUTO_CONFIRM_TEST_EMAILS lets browser tests run where nobody can click an emailed link. It must not
    touch a real address, and it is off unless set."""
    monkeypatch.delenv("AUTO_CONFIRM_TEST_EMAILS", raising=False)
    t = teacher("auto1@school.example", org="Auto School 1", verified=False)
    assert verified(t) is False
    monkeypatch.setenv("AUTO_CONFIRM_TEST_EMAILS", "1")
    t = teacher("auto2@school.example", org="Auto School 2", verified=False)
    assert verified(t) is True
    t = teacher("auto3@gmail.com", org="Auto School 3", verified=False)
    assert verified(t) is False
    t = teacher("auto4@pending.example", org="Auto School 4", verified=False)
    assert verified(t) is False
