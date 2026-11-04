"""Optional two-step sign-in for teachers (launch task T20)."""
from __future__ import annotations

import base64

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

import app as backend
from classroom import totp
from tests.test_classroom import H, teacher
from tests.test_scan_queue import engine  # noqa: F401
from tests.test_v2 import needs_db

PW = "correct horse battery"
KEY = base64.b64encode(bytes(range(32))).decode()


@pytest.fixture(autouse=True)
def key(monkeypatch):
    monkeypatch.setenv("TOTP_ENCRYPTION_KEY", KEY)


def post(c, path, **body):
    return c.post(f"/api/v2/auth/teacher/{path}", json=body, headers=H)


def me(c):
    return c.get("/api/v2/auth/me").json()["me"]


def turn_on(t):
    """Set up and enable two-step; returns (secret, recovery_codes, the step used to enable)."""
    secret = post(t, "2fa/setup").json()["secret"]
    step = totp.current_step()
    r = post(t, "2fa/enable", code=totp.code_at(secret, step))
    assert r.status_code == 200, r.text
    return secret, r.json()["recovery_codes"], step


def next_code(secret, after_step):
    """A code for a step newer than `after_step` (the app's next code), within the accepted window."""
    return totp.code_at(secret, after_step + 1), after_step + 1


def login_first_step(email="tfa@school.example"):
    c = TestClient(backend.app)
    c.__enter__()
    r = post(c, "login", email=email, password=PW)
    return c, r


@needs_db
def test_setup_alone_changes_nothing_at_sign_in(engine):  # noqa: F811
    t = teacher("tfa1@school.example", org="TFA School 1")
    r = post(t, "2fa/setup")
    assert r.status_code == 200 and r.json()["otpauth_uri"].startswith("otpauth://totp/Planet%20Hunter:tfa1%40")
    assert me(t)["two_factor"] is False
    c, login = login_first_step("tfa1@school.example")
    assert login.json() == {"ok": True, "needs_2fa": False, "challenge": None} and me(c) is not None
    for x in (t, c):
        x.__exit__(None, None, None)


@needs_db
def test_enabling_needs_a_right_code_and_returns_ten_recovery_codes_once(engine):  # noqa: F811
    t = teacher("tfa2@school.example", org="TFA School 2")
    secret = post(t, "2fa/setup").json()["secret"]
    assert post(t, "2fa/enable", code="000000").status_code == 422
    assert me(t)["two_factor"] is False
    r = post(t, "2fa/enable", code=totp.code_at(secret, totp.current_step()))
    codes = r.json()["recovery_codes"]
    assert len(codes) == 10 and me(t)["two_factor"] is True
    with engine.connect() as cx:
        stored = [x[0] for x in cx.execute(text("select code_hash from recovery_codes"))]
        blob = cx.execute(text("select totp_secret_enc from users where lower(email) = 'tfa2@school.example'")).scalar_one()
    assert not set(codes) & set(stored) and secret.encode() not in bytes(blob)  # hashes and ciphertext only
    assert post(t, "2fa/setup").status_code == 409  # already on
    t.__exit__(None, None, None)


@needs_db
def test_with_two_step_on_the_password_alone_gives_no_session(engine):  # noqa: F811
    t = teacher("tfa3@school.example", org="TFA School 3")
    secret, _codes, step = turn_on(t)
    c, r = login_first_step("tfa3@school.example")
    body = r.json()
    assert r.status_code == 200 and body["needs_2fa"] is True and len(body["challenge"]) > 20
    assert "set-cookie" not in r.headers and me(c) is None  # no session yet
    code, _ = next_code(secret, step)
    ok = post(c, "login/2fa", challenge=body["challenge"], code=code)
    assert ok.status_code == 200 and me(c)["email"] == "tfa3@school.example"
    for x in (t, c):
        x.__exit__(None, None, None)


@needs_db
def test_a_code_works_once_and_the_ticket_works_once(engine):  # noqa: F811
    t = teacher("tfa4@school.example", org="TFA School 4")
    secret, _c, step = turn_on(t)
    code, used = next_code(secret, step)
    c1, r1 = login_first_step("tfa4@school.example")
    assert post(c1, "login/2fa", challenge=r1.json()["challenge"], code=code).status_code == 200
    c2, r2 = login_first_step("tfa4@school.example")  # a new ticket, but the same code
    assert post(c2, "login/2fa", challenge=r2.json()["challenge"], code=code).status_code == 401
    assert me(c2) is None
    with TestClient(backend.app) as other:  # the spent ticket is useless, even with another good code
        assert post(other, "login/2fa", challenge=r1.json()["challenge"], code=totp.code_at(secret, used + 1)).status_code == 401
        assert me(other) is None
    for x in (t, c1, c2):
        x.__exit__(None, None, None)


@needs_db
def test_five_wrong_codes_burn_the_ticket_even_if_the_sixth_is_right(engine):  # noqa: F811
    t = teacher("tfa5@school.example", org="TFA School 5")
    secret, _c, step = turn_on(t)
    c, r = login_first_step("tfa5@school.example")
    ticket = r.json()["challenge"]
    for _ in range(5):
        assert post(c, "login/2fa", challenge=ticket, code="000000").status_code == 401
    assert post(c, "login/2fa", challenge=ticket, code=totp.code_at(secret, step + 1)).status_code == 401
    assert me(c) is None
    for x in (t, c):
        x.__exit__(None, None, None)


@needs_db
def test_a_wrong_or_expired_ticket_is_refused(engine):  # noqa: F811
    t = teacher("tfa6@school.example", org="TFA School 6")
    secret, _c, step = turn_on(t)
    c, r = login_first_step("tfa6@school.example")
    good = totp.code_at(secret, step + 1)
    assert post(c, "login/2fa", challenge="x" * 43, code=good).status_code == 401
    with engine.begin() as cx:
        cx.execute(text("update login_challenges set expires_at = now() - interval '1 second'"))
    assert post(c, "login/2fa", challenge=r.json()["challenge"], code=good).status_code == 401
    for x in (t, c):
        x.__exit__(None, None, None)


@needs_db
def test_a_ticket_for_one_teacher_cannot_be_used_with_another_teachers_code(engine):  # noqa: F811
    a = teacher("tfa7a@school.example", org="TFA School 7a")
    b = teacher("tfa7b@school.example", org="TFA School 7b")
    secret_a, _c, step = turn_on(a)
    secret_b, _d, _s = turn_on(b)
    c, r = login_first_step("tfa7a@school.example")
    assert post(c, "login/2fa", challenge=r.json()["challenge"], code=totp.code_at(secret_b, step + 1)).status_code == 401
    for x in (a, b, c):
        x.__exit__(None, None, None)


@needs_db
def test_a_recovery_code_signs_in_once_and_only_once(engine):  # noqa: F811
    t = teacher("tfa8@school.example", org="TFA School 8")
    _secret, codes, _step = turn_on(t)
    c1, r1 = login_first_step("tfa8@school.example")
    assert post(c1, "login/2fa", challenge=r1.json()["challenge"], code=codes[0].lower().replace("-", " ")).status_code == 200
    c2, r2 = login_first_step("tfa8@school.example")
    assert post(c2, "login/2fa", challenge=r2.json()["challenge"], code=codes[0]).status_code == 401
    c3, r3 = login_first_step("tfa8@school.example")
    assert post(c3, "login/2fa", challenge=r3.json()["challenge"], code=codes[1]).status_code == 200
    for x in (t, c1, c2, c3):
        x.__exit__(None, None, None)


@needs_db
def test_turning_it_off_needs_the_password_and_a_code_and_clears_everything(engine):  # noqa: F811
    t = teacher("tfa9@school.example", org="TFA School 9")
    secret, _c, step = turn_on(t)
    code, used = next_code(secret, step)
    assert post(t, "2fa/disable", password="wrong password!", code=code).status_code == 401
    assert post(t, "2fa/disable", password=PW, code="000000").status_code == 422
    assert me(t)["two_factor"] is True
    assert post(t, "2fa/disable", password=PW, code=code).status_code == 200
    assert me(t)["two_factor"] is False
    with engine.connect() as cx:
        row = cx.execute(text("select totp_secret_enc, totp_enabled_at from users where lower(email) = 'tfa9@school.example'")).one()
        assert row == (None, None)
        assert cx.execute(text("""select count(*) from recovery_codes r join users u on u.id = r.user_id
                                  where lower(u.email) = 'tfa9@school.example'""")).scalar_one() == 0
    c, r = login_first_step("tfa9@school.example")
    assert r.json()["needs_2fa"] is False
    for x in (t, c):
        x.__exit__(None, None, None)


@needs_db
def test_new_recovery_codes_replace_the_old_ones(engine):  # noqa: F811
    t = teacher("tfa10@school.example", org="TFA School 10")
    secret, old, step = turn_on(t)
    code, used = next_code(secret, step)
    new = post(t, "2fa/recovery-codes", password=PW, code=code).json()["recovery_codes"]
    assert len(new) == 10 and not set(new) & set(old)
    c, r = login_first_step("tfa10@school.example")
    assert post(c, "login/2fa", challenge=r.json()["challenge"], code=old[0]).status_code == 401
    c2, r2 = login_first_step("tfa10@school.example")
    assert post(c2, "login/2fa", challenge=r2.json()["challenge"], code=new[0]).status_code == 200
    for x in (t, c, c2):
        x.__exit__(None, None, None)


@needs_db
def test_deleting_the_account_needs_a_code_too(engine):  # noqa: F811
    t = teacher("tfa11@school.example", org="TFA School 11")
    secret, _c, step = turn_on(t)
    body = {"password": PW, "delete_school": True}
    assert t.post("/api/v2/auth/teacher/delete-account", json=body, headers=H).status_code == 401
    assert t.post("/api/v2/auth/teacher/delete-account", json={**body, "code": "000000"}, headers=H).status_code == 401
    code, _ = next_code(secret, step)
    assert t.post("/api/v2/auth/teacher/delete-account", json={**body, "code": code}, headers=H).status_code == 200
    t.__exit__(None, None, None)


@needs_db
def test_a_password_reset_does_not_bypass_two_step(engine, monkeypatch):  # noqa: F811
    import mailer
    monkeypatch.setenv("EMAIL_PROVIDER", "memory")
    monkeypatch.setenv("APP_BASE_URL", "https://planet.example")
    t = teacher("tfa12@school.example", org="TFA School 12")
    turn_on(t)
    mailer.outbox.clear()
    with TestClient(backend.app) as anon:
        post(anon, "forgot", email="tfa12@school.example")
        import re
        tok = re.search(r"#token=([A-Za-z0-9_-]+)", mailer.outbox[0]["text"]).group(1)
        assert post(anon, "reset", token=tok, password="a brand new passphrase").status_code == 200
        r = post(anon, "login", email="tfa12@school.example", password="a brand new passphrase")
    assert r.json()["needs_2fa"] is True and me(anon) is None
    t.__exit__(None, None, None)


@needs_db
def test_without_the_server_key_setup_is_refused_and_sign_in_still_works(engine, monkeypatch):  # noqa: F811
    t = teacher("tfa13@school.example", org="TFA School 13")
    monkeypatch.delenv("TOTP_ENCRYPTION_KEY")
    r = post(t, "2fa/setup")
    assert r.status_code == 422 and "not switched on" in r.json()["detail"]
    c, login = login_first_step("tfa13@school.example")
    assert login.json()["needs_2fa"] is False
    for x in (t, c):
        x.__exit__(None, None, None)


@needs_db
def test_the_routes_need_a_teacher_and_the_csrf_header(engine):  # noqa: F811
    with TestClient(backend.app) as anon:
        for path in ("2fa/setup",):
            assert anon.post(f"/api/v2/auth/teacher/{path}", headers=H).status_code == 401
        assert post(anon, "2fa/enable", code="123456").status_code == 401
    t = teacher("tfa14@school.example", org="TFA School 14")
    assert t.post("/api/v2/auth/teacher/2fa/setup").status_code == 403
    t.__exit__(None, None, None)
