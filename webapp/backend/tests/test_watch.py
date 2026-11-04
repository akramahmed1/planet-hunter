"""Watchlist and candidate change alerts (launch task T41)."""
from __future__ import annotations

import copy
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

import app as backend
import data_store
import mailer
from tests.test_classroom import H, org_of, student, teacher
from tests.test_scan_queue import engine  # noqa: F401
from tests.test_v2 import needs_db
from watch import digest, runner, store

SLUG = data_store.results().candidates[0].slug  # a real published candidate


def cands(**over):
    """The published candidates as simple objects, with some fields changed: cands(**{"toi-700": {"classification": "x"}})."""
    out = []
    for c in data_store.results().candidates:
        d = SimpleNamespace(slug=c.slug, target=c.target, classification=str(c.classification),
                            classification_label=c.classification_label, period_d=c.period_d)
        for k, v in over.get(c.slug, {}).items():
            setattr(d, k, v)
        out.append(d)
    return out


# ---------- pure: what changed and what the email says ----------

def test_a_snapshot_has_the_same_digest_however_it_is_built():
    a = digest.snapshot(cands())
    b = digest.snapshot(list(reversed(cands())))
    assert digest.digest(a) == digest.digest(b)
    assert digest.digest(a) != digest.digest(digest.snapshot(cands(**{SLUG: {"period_d": 99.0}})))


def test_diff_finds_new_candidates_and_changed_labels_and_periods_and_ignores_noise():
    old = digest.snapshot(cands())
    fewer = {k: v for k, v in old.items() if k != SLUG}
    assert digest.diff(fewer, old) == {"new": [SLUG], "changed": []}
    assert digest.diff(old, old) == {"new": [], "changed": []}
    c = digest.diff(old, digest.snapshot(cands(**{SLUG: {"classification": "ambiguous", "classification_label": "Ambiguous"}})))
    assert c["new"] == [] and [x["what"] for x in c["changed"]] == (["label"] if old[SLUG]["classification"] != "ambiguous" else [])
    p = digest.diff(old, digest.snapshot(cands(**{SLUG: {"period_d": old[SLUG]["period_d"] + 0.00001}})))
    assert p == {"new": [], "changed": []}  # below the 4 places the page shows: not a change
    p2 = digest.diff(old, digest.snapshot(cands(**{SLUG: {"period_d": old[SLUG]["period_d"] + 0.5}})))
    assert p2["changed"][0]["what"] == "period" and p2["changed"][0]["after"].endswith(" days")
    gone = digest.diff(old, fewer)
    assert gone == {"new": [], "changed": []}  # removals are not announced


def test_the_email_tells_each_person_only_what_is_theirs_and_is_honest_and_plain():
    old = digest.snapshot(cands())
    fewer = {k: v for k, v in old.items() if k != SLUG}
    d = digest.diff(fewer, old)
    subject, body = digest.compose("Ms Rivera", "https://x.example", "https://x.example/alerts/unsubscribe#token=T", d, old, set())
    assert "New candidate signals" in subject and old[SLUG]["target"] in body and f"/candidates/{SLUG}" in body
    assert "never a discovery" in body and "https://x.example/alerts/unsubscribe#token=T" in body
    assert body.startswith("Hello Ms Rivera,")
    for t in (subject, body):
        assert not any(ch in t for ch in "–—"), "no dashes in site wording"
    # A change to a candidate nobody here watches says nothing to them; to a watcher it says what changed.
    change = {"new": [], "changed": [{"slug": SLUG, "what": "period", "before": "1.0000 days", "after": "2.0000 days"}]}
    assert digest.compose("A", "https://x", "https://x/u", change, old, set()) is None
    s2, b2 = digest.compose("A", "https://x", "https://x/u", change, old, {SLUG})
    assert "has changed" in s2 and "1.0000 days" in b2 and "2.0000 days" in b2
    assert digest.compose("A", "https://x", "https://x/u", {"new": [], "changed": []}, old, {SLUG}) is None


# ---------- watchlist and settings through the API ----------

URL = "/api/v2/me/watchlist"


@needs_db
def test_watch_list_and_unwatch(engine):  # noqa: F811
    t = teacher("w1@school.example", org="W School 1")
    assert t.get(URL).json() == {"watched": [], "limit": 20}
    assert t.get(f"{URL}/{SLUG}").json() == {"watching": False}
    assert t.put(f"{URL}/{SLUG}", headers=H).json() == {"watching": True}
    assert t.put(f"{URL}/{SLUG}", headers=H).status_code == 200  # twice is fine
    got = t.get(URL).json()["watched"]
    assert [w["slug"] for w in got] == [SLUG] and got[0]["target"] and got[0]["label"] and got[0]["period_d"] > 0
    assert t.get(f"{URL}/{SLUG}").json() == {"watching": True}
    assert t.delete(f"{URL}/{SLUG}", headers=H).json() == {"watching": False}
    assert t.delete(f"{URL}/{SLUG}", headers=H).status_code == 200
    assert t.get(URL).json()["watched"] == []
    t.__exit__(None, None, None)


@needs_db
def test_only_published_candidates_can_be_watched_and_the_wrong_requests_change_nothing(engine):  # noqa: F811
    t = teacher("w2@school.example", org="W School 2")
    assert t.put(f"{URL}/not-a-candidate", headers=H).status_code == 404
    assert t.put(f"{URL}/Bad_Slug", headers=H).status_code == 422
    assert t.put(f"{URL}/{SLUG}", headers={}).status_code == 403
    assert t.get(URL).json()["watched"] == []
    with TestClient(backend.app) as anon:
        assert anon.get(URL).status_code == 401
        assert anon.put(f"{URL}/{SLUG}", headers=H).status_code == 401
    t.__exit__(None, None, None)


@needs_db
def test_the_list_stops_at_twenty(engine):  # noqa: F811
    t = teacher("w3@school.example", org="W School 3")
    with engine.connect() as cx:
        uid = cx.execute(text("select id from users where lower(email) = 'w3@school.example'")).scalar_one()
    for i in range(store.MAX_WATCHED):
        store.watch(engine, f"cand-{i}", user_id=uid, member_id=None)
    with pytest.raises(store.LimitReached):
        store.watch(engine, "one-too-many", user_id=uid, member_id=None)
    store.watch(engine, "cand-3", user_id=uid, member_id=None)  # one already on the list is fine
    store.unwatch(engine, "cand-0", user_id=uid, member_id=None)
    store.watch(engine, "one-too-many", user_id=uid, member_id=None)
    t.__exit__(None, None, None)


@needs_db
def test_students_have_a_watchlist_but_no_email_and_nobody_sees_anyone_elses(engine):  # noqa: F811
    t = teacher("w4@school.example", org="W School 4")
    k = t.post(f"/api/v2/orgs/{org_of(t)}/classes", json={"name": "Physics"}, headers=H).json()
    s1, s2 = student(k["join_code"], "Nova"), student(k["join_code"], "Quark")
    s1.put(f"{URL}/{SLUG}", headers=H)
    assert [w["slug"] for w in s1.get(URL).json()["watched"]] == [SLUG]
    assert s2.get(URL).json()["watched"] == [] and t.get(URL).json()["watched"] == []
    assert s1.get("/api/v2/me/alerts").status_code == 403  # a student has no email address to alert
    assert s1.put("/api/v2/me/alerts", json={"email_alerts": True}, headers=H).status_code == 403
    with engine.connect() as cx:
        assert cx.execute(text("select count(*) from alert_prefs")).scalar_one() == 0
    for c in (t, s1, s2):
        c.__exit__(None, None, None)


@needs_db
def test_email_alerts_need_a_confirmed_address_and_can_be_switched_off_by_link(engine):  # noqa: F811
    t = teacher("w5@school.example", org="W School 5")
    assert t.get("/api/v2/me/alerts").json() == {"email_alerts": False, "can_email": False, "email_ready": t.get("/api/v2/me/alerts").json()["email_ready"]}
    r = t.put("/api/v2/me/alerts", json={"email_alerts": True}, headers=H)
    assert r.status_code == 409 and "Confirm your email" in r.json()["detail"]
    with engine.begin() as cx:
        cx.execute(text("update users set email_verified_at = now() where lower(email) = 'w5@school.example'"))
    on = t.put("/api/v2/me/alerts", json={"email_alerts": True}, headers=H).json()
    assert on["email_alerts"] is True and on["can_email"] is True
    with engine.connect() as cx:
        token = cx.execute(text("select unsubscribe_token from alert_prefs")).scalar_one()
    assert len(token) >= 40
    # The link in an email: no sign-in, but a wrong token is refused and a right one turns it off (twice is fine).
    with TestClient(backend.app) as anon:
        assert anon.post("/api/v2/auth/alerts/unsubscribe", json={"token": "x" * 40}, headers=H).status_code == 400
        assert anon.post("/api/v2/auth/alerts/unsubscribe", json={"token": token}, headers={}).status_code == 403
        assert anon.post("/api/v2/auth/alerts/unsubscribe", json={"token": token}, headers=H).status_code == 200
        assert anon.post("/api/v2/auth/alerts/unsubscribe", json={"token": token}, headers=H).status_code == 200
    assert t.get("/api/v2/me/alerts").json()["email_alerts"] is False
    assert t.put("/api/v2/me/alerts", json={"email_alerts": True}, headers=H).json()["email_alerts"] is True
    with engine.connect() as cx:
        assert cx.execute(text("select unsubscribe_token from alert_prefs")).scalar_one() == token  # kept: old links still work
    t.__exit__(None, None, None)


# ---------- the change check at server start ----------

@pytest.fixture
def outbox(monkeypatch):
    monkeypatch.setenv("APP_BASE_URL", "https://planet.example")
    sent: list[dict] = []

    def send(to, subject, text_):
        sent.append({"to": to, "subject": subject, "text": text_})
        return mailer.Result(True)
    return sent, send


def clear_runs(engine):
    # Starting a client runs the app's startup sync, which stores a baseline; tests want a clean slate.
    with engine.begin() as cx:
        cx.execute(text("delete from alert_sends"))
        cx.execute(text("delete from candidate_snapshots"))


def opted_in(engine, email, org, watch=()):
    t = teacher(email, org=org)
    with engine.begin() as cx:
        cx.execute(text("update users set email_verified_at = now() where lower(email) = :e"), {"e": email})
    assert t.put("/api/v2/me/alerts", json={"email_alerts": True}, headers=H).status_code == 200
    for slug in watch:
        assert t.put(f"{URL}/{slug}", headers=H).status_code == 200
    clear_runs(engine)
    return t


@needs_db
def test_the_first_run_is_a_quiet_baseline_and_an_unchanged_run_sends_nothing(engine, outbox):  # noqa: F811
    sent, send = outbox
    t = opted_in(engine, "r1@school.example", "R School 1")
    assert runner.run(engine, cands(), send)["baseline"] is True
    assert runner.run(engine, cands(), send) == {"baseline": False, "sent": 0, "skipped": 0, "failed": 0, "changes": 0}
    assert sent == []
    t.__exit__(None, None, None)


@needs_db
def test_a_new_candidate_is_emailed_once_to_each_opted_in_teacher_and_only_them(engine, outbox):  # noqa: F811
    sent, send = outbox
    yes = opted_in(engine, "r2a@school.example", "R School 2a")
    off = teacher("r2b@school.example", org="R School 2b")  # never opted in
    unverified = teacher("r2c@school.example", org="R School 2c")
    unverified.__enter__
    k = yes.post(f"/api/v2/orgs/{org_of(yes)}/classes", json={"name": "Physics"}, headers=H).json()
    kid = student(k["join_code"], "Nova")  # students are never emailed
    all_c = cands()
    clear_runs(engine)
    runner.run(engine, all_c[1:], send)  # the baseline: one candidate is not there yet
    out = runner.run(engine, all_c, send)
    assert out["sent"] == 1 and out["failed"] == 0 and out["changes"] == 1
    assert [m["to"] for m in sent] == ["r2a@school.example"]
    assert all_c[0].target in sent[0]["text"] and "https://planet.example/alerts/unsubscribe#token=" in sent[0]["text"]
    assert runner.run(engine, all_c, send)["sent"] == 0  # the same data again: nothing more
    assert len(sent) == 1
    for c in (yes, off, unverified, kid):
        c.__exit__(None, None, None)


@needs_db
def test_a_change_to_a_watched_candidate_goes_only_to_the_people_who_watch_it(engine, outbox):  # noqa: F811
    sent, send = outbox
    w = opted_in(engine, "r3a@school.example", "R School 3a", watch=[SLUG])
    n = opted_in(engine, "r3b@school.example", "R School 3b")  # opted in, watches nothing
    runner.run(engine, cands(), send)
    out = runner.run(engine, cands(**{SLUG: {"period_d": 77.5}}), send)
    assert out["sent"] == 1 and out["skipped"] == 1
    assert [m["to"] for m in sent] == ["r3a@school.example"]
    assert "period was" in sent[0]["text"] and "77.5000 days" in sent[0]["text"]
    for c in (w, n):
        c.__exit__(None, None, None)


@needs_db
def test_a_person_is_never_emailed_twice_for_one_change_even_if_the_run_repeats(engine, outbox):  # noqa: F811
    sent, send = outbox
    t = opted_in(engine, "r4@school.example", "R School 4")
    runner.run(engine, cands()[1:], send)
    runner.run(engine, cands(), send)
    assert len(sent) == 1
    with engine.connect() as cx:
        sid = cx.execute(text("select max(id) from candidate_snapshots")).scalar_one()
        uid = cx.execute(text("select id from users where lower(email) = 'r4@school.example'")).scalar_one()
    assert store.claim_send(engine, sid, uid) is False  # already recorded
    t.__exit__(None, None, None)


@needs_db
def test_no_email_without_a_public_address_and_a_failed_send_is_recorded_not_retried(engine, outbox, monkeypatch):  # noqa: F811
    sent, send = outbox
    t = opted_in(engine, "r5@school.example", "R School 5")
    runner.run(engine, cands()[1:], send)
    monkeypatch.delenv("APP_BASE_URL")
    assert runner.run(engine, cands(), send)["sent"] == 0 and sent == []  # links need a public address
    monkeypatch.setenv("APP_BASE_URL", "https://planet.example")
    runner.run(engine, cands()[1:], send)  # snapshot moves on
    out = runner.run(engine, cands(), lambda *a: mailer.Result(False, "unreachable"))
    assert out["failed"] == 1 and out["sent"] == 0
    with engine.connect() as cx:
        assert cx.execute(text("select sent, reason from alert_sends order by at desc limit 1")).one() == (False, "unreachable")
    t.__exit__(None, None, None)


@needs_db
def test_alert_settings_watchlist_and_sends_go_with_the_account(engine, outbox):  # noqa: F811
    sent, send = outbox
    t = opted_in(engine, "r6@school.example", "R School 6", watch=[SLUG])
    runner.run(engine, cands()[1:], send)
    runner.run(engine, cands(), send)
    r = t.post("/api/v2/auth/teacher/delete-account", json={"password": "correct horse battery", "delete_school": True}, headers=H)
    assert r.status_code == 200
    with engine.connect() as cx:
        for table in ("watchlist", "alert_prefs", "alert_sends"):
            assert cx.execute(text(f"select count(*) from {table}")).scalar_one() == 0, table
    t.__exit__(None, None, None)
