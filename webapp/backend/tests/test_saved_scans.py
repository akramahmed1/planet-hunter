"""Saved scans for signed-in teachers and students (launch task T40)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

import app as backend
from scans import queue, saved
from tests.test_classroom import H, org_of, student, teacher
from tests.test_scan_queue import RUN, SIGNAL, P, engine  # noqa: F401
from tests.test_v2 import needs_db

URL = "/api/v2/me/saved-scans"


def job(engine, n=1):
    return queue.enqueue(engine, 5000 + n, P(n), f"req{n}")[0]


def many_jobs(engine, count):
    """Scan rows made directly: the queue itself refuses more than 20 waiting at once."""
    ids = []
    with engine.begin() as cx:
        for n in range(count):
            tid = cx.execute(text("insert into targets (tic_id) values (:t) returning id"), {"t": 9_000_000 + n}).scalar_one()
            ids.append(cx.execute(text("insert into scan_jobs (target_id, params, cache_key, status, requester) "
                                       "values (:t, '{}'::jsonb, :k, 'queued', 'x') returning id"), {"t": tid, "k": f"k{n}"}).scalar_one())
    return ids


def finished(engine, n=1):
    jid = job(engine, n)
    j = queue.claim(engine, "w")
    assert j.id == jid and queue.complete(engine, j, "w", RUN, SIGNAL)
    return jid


# ---------- labels: plain text ----------

def test_a_label_is_plain_short_text_or_nothing():
    assert saved.clean_label(None) is None
    assert saved.clean_label("   ") is None
    assert saved.clean_label("  my   first\tscan \n") == "my first scan"
    assert saved.clean_label("a\x00b\x1bc") == "abc"
    assert len(saved.clean_label("x" * 500)) == saved.MAX_LABEL
    assert saved.clean_label("<script>alert(1)</script>") == "<script>alert(1)</script>"  # stored as text, shown as text


# ---------- the API ----------

@needs_db
def test_save_list_relabel_and_remove(engine):  # noqa: F811
    t = teacher("ss1@school.example", org="SS School 1")
    a, b = finished(engine, 1), job(engine, 2)
    assert t.get(URL).json() == {"scans": [], "limit": 50}
    assert t.get(f"{URL}/{a}").json() == {"saved": False, "label": None}
    assert t.put(f"{URL}/{a}", json={"label": "TOI 700 check"}, headers=H).json() == {"saved": True, "label": "TOI 700 check"}
    assert t.put(f"{URL}/{b}", json={}, headers=H).status_code == 200
    got = t.get(URL).json()["scans"]
    assert [x["scan_id"] for x in got] == [b, a]  # newest first
    mine = next(x for x in got if x["scan_id"] == a)
    assert mine["label"] == "TOI 700 check" and mine["status"] == "succeeded" and mine["period_d"] == 1.0 and mine["snr"] == 5.0
    queued = next(x for x in got if x["scan_id"] == b)
    assert queued["status"] == "queued" and queued["period_d"] is None and queued["label"] is None
    # Saving again changes only the label and does not add a second row.
    assert t.put(f"{URL}/{a}", json={"label": "renamed"}, headers=H).json()["label"] == "renamed"
    assert len(t.get(URL).json()["scans"]) == 2
    assert t.get(f"{URL}/{a}").json() == {"saved": True, "label": "renamed"}
    assert t.delete(f"{URL}/{a}", headers=H).json() == {"saved": False, "label": None}
    assert t.delete(f"{URL}/{a}", headers=H).status_code == 200  # taking off one that is not there is fine
    assert [x["scan_id"] for x in t.get(URL).json()["scans"]] == [b]
    t.__exit__(None, None, None)


@needs_db
def test_it_refuses_the_wrong_things_and_changes_nothing(engine):  # noqa: F811
    t = teacher("ss2@school.example", org="SS School 2")
    a = job(engine)
    assert t.put(f"{URL}/999999", json={}, headers=H).status_code == 404  # no such scan
    assert t.put(f"{URL}/{a}", json={"label": "x" * 201}, headers=H).status_code == 422
    assert t.put(f"{URL}/{a}", json={"label": "ok", "extra": 1}, headers=H).status_code == 422
    assert t.put(f"{URL}/{a}", json={}, headers={}).status_code == 403  # no CSRF header
    assert t.delete(f"{URL}/{a}", headers={}).status_code == 403
    assert t.get(URL).json()["scans"] == []
    with TestClient(backend.app) as anon:
        assert anon.get(URL).status_code == 401
        assert anon.put(f"{URL}/{a}", json={}, headers=H).status_code == 401
        assert anon.delete(f"{URL}/{a}", headers=H).status_code == 401
    t.__exit__(None, None, None)


@needs_db
def test_the_list_stops_at_fifty_and_removing_one_makes_room(engine):  # noqa: F811
    t = teacher("ss3@school.example", org="SS School 3")
    ids = many_jobs(engine, saved.MAX_SAVED + 1)
    for jid in ids[:saved.MAX_SAVED]:
        assert t.put(f"{URL}/{jid}", json={}, headers=H).status_code == 200
    r = t.put(f"{URL}/{ids[-1]}", json={}, headers=H)
    assert r.status_code == 409 and "full" in r.json()["detail"]
    assert t.put(f"{URL}/{ids[0]}", json={"label": "relabel is fine when full"}, headers=H).status_code == 200
    assert t.delete(f"{URL}/{ids[0]}", headers=H).status_code == 200
    assert t.put(f"{URL}/{ids[-1]}", json={}, headers=H).status_code == 200
    t.__exit__(None, None, None)


@needs_db
def test_everyone_has_their_own_list_and_a_teacher_cannot_read_a_students(engine):  # noqa: F811
    t = teacher("ss4@school.example", org="SS School 4")
    org = org_of(t)
    k = t.post(f"/api/v2/orgs/{org}/classes", json={"name": "Physics"}, headers=H).json()
    s1, s2 = student(k["join_code"], "Nova"), student(k["join_code"], "Quark")
    a = job(engine)
    s1.put(f"{URL}/{a}", json={"label": "Nova's"}, headers=H)
    assert s2.get(URL).json()["scans"] == [] and t.get(URL).json()["scans"] == []
    assert s2.get(f"{URL}/{a}").json()["saved"] is False
    assert s2.delete(f"{URL}/{a}", headers=H).status_code == 200  # a no-op for them...
    assert [x["label"] for x in s1.get(URL).json()["scans"]] == ["Nova's"]  # ...and Nova's is untouched
    for c in (t, s1, s2):
        c.__exit__(None, None, None)


def rows(engine, where="true"):
    with engine.connect() as cx:
        return cx.execute(text(f"select count(*) from saved_scans where {where}")).scalar_one()


@needs_db
def test_saved_scans_go_with_the_student_the_class_the_teacher_and_the_scan(engine):  # noqa: F811
    t = teacher("ss5@school.example", org="SS School 5")
    org = org_of(t)
    k = t.post(f"/api/v2/orgs/{org}/classes", json={"name": "Physics"}, headers=H).json()
    s1, s2 = student(k["join_code"], "Nova"), student(k["join_code"], "Quark")
    a, b = job(engine, 1), job(engine, 2)
    for c in (s1, s2, t):
        c.put(f"{URL}/{a}", json={}, headers=H)
    t.put(f"{URL}/{b}", json={}, headers=H)
    assert rows(engine) == 4
    with engine.begin() as cx:  # the scan itself goes (an operator clean-up): the saved rows follow
        cx.execute(text("delete from scan_jobs where id = :j"), {"j": b})
    assert rows(engine, f"job_id = {b}") == 0
    members = {m["nickname"]: m["id"] for m in t.get(f"/api/v2/classes/{k['id']}").json()["students"]}
    assert t.delete(f"/api/v2/classes/{k['id']}/students/{members['Nova']}", headers=H).status_code == 200
    assert rows(engine, f"member_id = {members['Nova']}") == 0
    assert t.delete(f"/api/v2/classes/{k['id']}", headers=H).status_code == 200
    assert rows(engine, f"member_id = {members['Quark']}") == 0
    r = t.post("/api/v2/auth/teacher/delete-account", json={"password": "correct horse battery", "delete_school": True}, headers=H)
    assert r.status_code == 200 and rows(engine) == 0
    for c in (t, s1, s2):
        c.__exit__(None, None, None)


@needs_db
def test_the_table_cannot_hold_a_row_for_nobody(engine):  # noqa: F811
    from sqlalchemy.exc import IntegrityError
    a = job(engine)
    with pytest.raises(IntegrityError):
        with engine.begin() as cx:
            cx.execute(text("insert into saved_scans (job_id) values (:j)"), {"j": a})
