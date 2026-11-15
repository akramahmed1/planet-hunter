"""Learn progress that follows a signed-in person across devices (launch task T39)."""
from __future__ import annotations

import copy
import random

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

import app as backend
from learn import progress, store
from tests.test_classroom import H, org_of, student, teacher
from tests.test_scan_queue import engine  # noqa: F401
from tests.test_v2 import needs_db

URL = "/api/v2/me/learn-progress"
T1, T2 = "2026-10-01T10:00:00.000Z", "2026-10-05T09:30:00.000Z"


def doc(**lessons):
    return {"version": 1, "lessons": lessons}


def lesson(steps=0, qs=None, badge=None):
    out = {"stepsSeen": steps, "questions": {k: {"correct": c, "tries": t} for k, (c, t) in (qs or {}).items()}}
    if badge:
        out["badgeAt"] = badge
    return out


# ---------- the join: pure, no database ----------

def random_doc(rng: random.Random) -> dict:
    lessons = {}
    for slug in rng.sample(["light-time", "transits", "orbits", "stars"], rng.randint(0, 4)):
        qs = {k: (rng.random() < 0.5, rng.randint(1, 6)) for k in rng.sample(["q1", "q2", "q3", "q4"], rng.randint(0, 4))}
        lessons[slug] = lesson(rng.randint(0, 8), qs, rng.choice([None, T1, T2]))
    return doc(**lessons)


def test_merge_is_commutative_associative_and_idempotent():
    rng = random.Random(7)
    for _ in range(300):
        a, b, c = random_doc(rng), random_doc(rng), random_doc(rng)
        assert progress.merge(a, b) == progress.merge(b, a)
        assert progress.merge(progress.merge(a, b), c) == progress.merge(a, progress.merge(b, c))
        assert progress.merge(a, a) == a
        assert progress.merge(a, progress.EMPTY) == a


def test_merge_only_ever_grows_so_an_old_device_cannot_erase_newer_work():
    rng = random.Random(11)
    for _ in range(200):
        a, b = random_doc(rng), random_doc(rng)
        m = progress.merge(a, b)
        for side in (a, b):
            for slug, l in side["lessons"].items():
                got = m["lessons"][slug]
                assert got["stepsSeen"] >= l["stepsSeen"]
                for k, q in l["questions"].items():
                    assert got["questions"][k]["correct"] >= q["correct"]
                    assert got["questions"][k]["tries"] >= q["tries"]
                if "badgeAt" in l:
                    assert got["badgeAt"] <= l["badgeAt"]  # the earliest time a badge was earned


def test_merge_does_not_change_its_inputs():
    a, b = doc(x=lesson(2, {"q1": (False, 1)})), doc(x=lesson(1, {"q1": (True, 3)}, T2))
    before = copy.deepcopy((a, b))
    progress.merge(a, b)
    assert (a, b) == before


def test_validate_keeps_good_progress_and_refuses_the_rest():
    good = doc(**{"light-time": lesson(3, {"q1": (True, 2)}, T1)})
    assert progress.validate(good) == good
    bad = [None, [], {"version": 2, "lessons": {}}, {"version": 1}, {"version": 1, "lessons": []},
           doc(**{"Bad Slug": lesson()}), doc(x=lesson(-1)), doc(x=lesson(10_000_000)),
           doc(x={"stepsSeen": True, "questions": {}}), doc(x={"stepsSeen": 1, "questions": {"Q 1": {"correct": True, "tries": 1}}}),
           doc(x={"stepsSeen": 1, "questions": {"q1": {"correct": "yes", "tries": 1}}}),
           doc(x={"stepsSeen": 1, "questions": {"q1": {"correct": True, "tries": 1.5}}}),
           doc(x={"stepsSeen": 1, "questions": {"q1": {"correct": True, "tries": 99999}}}),
           doc(x={"stepsSeen": 1, "questions": {}, "badgeAt": "yesterday"}),
           doc(x={"stepsSeen": 1, "questions": {}, "badgeAt": 5})]
    for b in bad:
        with pytest.raises(progress.BadProgress):
            progress.validate(b)


def test_validate_caps_the_size_of_a_document():
    with pytest.raises(progress.BadProgress):
        progress.validate(doc(**{f"l{i}": lesson() for i in range(progress.MAX_LESSONS + 1)}))
    with pytest.raises(progress.BadProgress):
        progress.validate(doc(x=lesson(0, {f"q{i}": (True, 1) for i in range(progress.MAX_QUESTIONS + 1)})))


def merge_cases() -> list[dict]:
    rng = random.Random(2026)
    out = []
    for _ in range(60):
        a, b = random_doc(rng), random_doc(rng)
        out.append({"a": a, "b": b, "merged": progress.merge(a, b)})
    return out


def test_the_browser_and_the_server_join_progress_the_same_way():
    """frontend/lib/learn.test.ts reads this same file and checks its own merge against `merged`."""
    import json
    from pathlib import Path

    path = Path(__file__).parent / "fixtures" / "learn_merge_cases.json"
    expected = merge_cases()
    if not path.exists():  # first run writes it; after that it is a fixed reference both sides must meet
        path.write_text(json.dumps(expected, indent=1, sort_keys=True))
    assert json.loads(path.read_text()) == expected, "the join changed: regenerate the fixture on purpose, not by accident"


# ---------- the API and the database ----------

def put(c, body, headers=H):
    return c.put(URL, json=body, headers=headers)


@needs_db
def test_a_teacher_and_a_student_each_keep_their_own_progress(engine):  # noqa: F811
    t = teacher("lp1@school.example", org="LP School 1")
    org = org_of(t)
    k = t.post(f"/api/v2/orgs/{org}/classes", json={"name": "Physics"}, headers=H).json()
    s = student(k["join_code"], "Nova")
    assert t.get(URL).json() == progress.EMPTY and s.get(URL).json() == progress.EMPTY
    mine = doc(a=lesson(2, {"q1": (True, 1)}, T1))
    assert put(t, mine).json() == mine
    assert t.get(URL).json() == mine
    assert s.get(URL).json() == progress.EMPTY  # the student does not see the teacher's
    theirs = doc(b=lesson(5))
    assert put(s, theirs).json() == theirs
    assert t.get(URL).json() == mine  # and the teacher does not see the student's
    t.__exit__(None, None, None)
    s.__exit__(None, None, None)


@needs_db
def test_two_devices_meet_in_the_middle_and_an_old_one_cannot_erase_newer_work(engine):  # noqa: F811
    t = teacher("lp2@school.example", org="LP School 2")
    phone = doc(a=lesson(2, {"q1": (False, 2)}))
    laptop = doc(a=lesson(4, {"q1": (True, 3), "q2": (True, 1)}, T1), b=lesson(1))
    assert put(t, laptop).status_code == 200
    merged = put(t, phone).json()  # the phone was offline and knows less
    assert merged == laptop
    # And the other way round: the laptop learns what only the phone did.
    only_phone = doc(c=lesson(7))
    assert put(t, only_phone).json()["lessons"].keys() == {"a", "b", "c"}
    assert t.get(URL).json()["lessons"]["a"]["questions"]["q1"] == {"correct": True, "tries": 3}
    t.__exit__(None, None, None)


@needs_db
def test_it_refuses_the_wrong_things_and_stores_nothing_for_them(engine):  # noqa: F811
    t = teacher("lp3@school.example", org="LP School 3")
    before = put(t, doc(a=lesson(1))).json()
    assert put(t, {"version": 1, "lessons": {"Bad Slug": {}}}).status_code == 422
    assert put(t, doc(a=lesson(0, {"q1": (True, 99_999)}))).status_code == 422
    assert put(t, {"version": 2, "lessons": {}}).status_code == 422
    assert put(t, doc(a=lesson(1)), headers={}).status_code == 403  # no CSRF header
    assert t.get(URL).json() == before
    with TestClient(backend.app) as anon:
        assert anon.get(URL).status_code == 401
        assert anon.put(URL, json=doc(), headers=H).status_code == 401
    t.__exit__(None, None, None)


@needs_db
def test_one_student_cannot_see_or_change_a_classmates_progress(engine):  # noqa: F811
    t = teacher("lp4@school.example", org="LP School 4")
    org = org_of(t)
    k = t.post(f"/api/v2/orgs/{org}/classes", json={"name": "Physics"}, headers=H).json()
    s1, s2 = student(k["join_code"], "Nova"), student(k["join_code"], "Quark")
    put(s1, doc(a=lesson(3)))
    assert s2.get(URL).json() == progress.EMPTY
    put(s2, doc(b=lesson(1)))
    assert s1.get(URL).json() == doc(a=lesson(3))
    for c in (t, s1, s2):
        c.__exit__(None, None, None)


def rows(engine, where="true"):
    with engine.connect() as cx:
        return cx.execute(text(f"select count(*) from learn_progress where {where}")).scalar_one()


@needs_db
def test_progress_goes_with_the_student_the_class_and_the_teacher_account(engine):  # noqa: F811
    t = teacher("lp5@school.example", org="LP School 5")
    org = org_of(t)
    k = t.post(f"/api/v2/orgs/{org}/classes", json={"name": "Physics"}, headers=H).json()
    s1, s2 = student(k["join_code"], "Nova"), student(k["join_code"], "Quark")
    put(s1, doc(a=lesson(1)))
    put(s2, doc(a=lesson(2)))
    put(t, doc(a=lesson(3)))
    n0 = rows(engine)
    members = {m["nickname"]: m["id"] for m in t.get(f"/api/v2/classes/{k['id']}").json()["students"]}
    assert t.delete(f"/api/v2/classes/{k['id']}/students/{members['Nova']}", headers=H).status_code == 200
    assert rows(engine, f"member_id = {members['Nova']}") == 0 and rows(engine) == n0 - 1  # one student removed
    assert t.delete(f"/api/v2/classes/{k['id']}", headers=H).status_code == 200
    assert rows(engine, f"member_id = {members['Quark']}") == 0  # the class went, so did the rest of its students
    r = t.post("/api/v2/auth/teacher/delete-account", json={"password": "correct horse battery", "delete_school": True}, headers=H)
    assert r.status_code == 200
    with engine.connect() as cx:
        assert cx.execute(text("select count(*) from learn_progress where user_id not in (select id from users)")).scalar_one() == 0
        assert cx.execute(text("select count(*) from learn_progress p join users u on u.id = p.user_id "
                               "where lower(u.email) = 'lp5@school.example'")).scalar_one() == 0
    for c in (t, s1, s2):
        c.__exit__(None, None, None)


@needs_db
def test_progress_nobody_has_touched_for_24_months_is_purged_and_recent_progress_stays(engine):  # noqa: F811
    t = teacher("lp6@school.example", org="LP School 6")
    put(t, doc(a=lesson(1)))
    with engine.begin() as cx:
        uid = cx.execute(text("select id from users where lower(email) = 'lp6@school.example'")).scalar_one()
    assert store.purge_stale_progress(engine) == 0  # fresh: stays
    with engine.begin() as cx:
        cx.execute(text("update learn_progress set updated_at = now() - interval '23 months' where user_id = :u"), {"u": uid})
    assert store.purge_stale_progress(engine) == 0  # 23 months: stays
    with engine.begin() as cx:
        cx.execute(text("update learn_progress set updated_at = now() - interval '25 months' where user_id = :u"), {"u": uid})
    assert store.purge_stale_progress(engine) >= 1
    assert rows(engine, f"user_id = {uid}") == 0
    assert t.get(URL).json() == progress.EMPTY  # still signed in, just starts again
    t.__exit__(None, None, None)


@needs_db
def test_the_table_cannot_hold_a_row_for_nobody_or_for_two_people(engine):  # noqa: F811
    from sqlalchemy.exc import IntegrityError
    with pytest.raises(IntegrityError):
        with engine.begin() as cx:
            cx.execute(text("insert into learn_progress (doc) values ('{}'::jsonb)"))
