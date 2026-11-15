"""The numbers on the teacher's home page (launch task T24)."""
from __future__ import annotations

import datetime as dt

from tests.test_classroom import H, student, teacher, two_orgs  # noqa: F401
from tests.test_scan_queue import engine  # noqa: F401
from tests.test_v2 import needs_db

LESSON = "distances-and-light-time"
ANSWERS = f"/api/v2/lessons/{LESSON}/answers"


def classes(c, org):
    return c.get(f"/api/v2/orgs/{org}/classes").json()["classes"]


@needs_db
def test_a_new_class_has_zero_everything_and_no_average(engine):  # noqa: F811
    t = teacher("glance1@school.example", org="Glance School 1")
    org = t.get("/api/v2/auth/me").json()["me"]["orgs"][0]["org_id"]
    made = t.post(f"/api/v2/orgs/{org}/classes", json={"name": "Empty"}, headers=H).json()
    expected = {"students": 0, "assignments": 0, "expected": 0, "completed": 0, "average_percent": None, "next_due": None}
    assert {k: made[k] for k in expected} == expected
    assert {k: classes(t, org)[0][k] for k in expected} == expected
    t.__exit__(None, None, None)


@needs_db
def test_the_numbers_follow_the_work_students_hand_in(engine):  # noqa: F811
    t = teacher("glance2@school.example", org="Glance School 2")
    org = t.get("/api/v2/auth/me").json()["me"]["orgs"][0]["org_id"]
    k = t.post(f"/api/v2/orgs/{org}/classes", json={"name": "Physics"}, headers=H).json()
    soon = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=3)).replace(microsecond=0)
    later = soon + dt.timedelta(days=10)
    past = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=2)
    for ref, due in (("quiz", later), ("quiz", soon), ("quiz", past), ("quiz", None)):
        r = t.post(f"/api/v2/classes/{k['id']}/assignments", json={"kind": "quiz", "ref": LESSON,
                   **({"due_at": due.isoformat()} if due else {})}, headers=H)
        assert r.status_code == 201, r.text
    nova, orbit = student(k["join_code"], "Nova"), student(k["join_code"], "Orbit")
    row = classes(t, org)[0]
    assert (row["students"], row["assignments"], row["expected"], row["completed"], row["average_percent"]) == (2, 4, 8, 0, None)
    # Only the soonest FUTURE due date counts: not the past one, not the later one.
    assert dt.datetime.fromisoformat(row["next_due"]) == soon
    # Nova finishes the quiz assignments with 2 of 3 right (first tries), as in the existing gradebook test. All four
    # quiz assignments are for the same lesson, so each of Nova's answers counts toward every one of them.
    assert not nova.post(ANSWERS, json={"question": "earth_minutes", "value": 20}, headers=H).json()["correct"]
    assert nova.post(ANSWERS, json={"question": "earth_minutes", "value": 8.3}, headers=H).json()["correct"]
    assert nova.post(ANSWERS, json={"question": "neptune_hours", "value": 4.2}, headers=H).json()["correct"]
    assert nova.post(ANSWERS, json={"question": "sun_off", "choice": 1}, headers=H).json()["correct"]
    row = classes(t, org)[0]
    assert row["completed"] == 4 and row["expected"] == 8  # Nova did all four, Orbit none
    assert row["average_percent"] == 67  # 2 of 3 on every finished hand-in
    # Orbit's perfect run on one more try lifts the mean: both students' finished hand-ins are averaged together.
    for q, kw in (("earth_minutes", {"value": 8.3}), ("neptune_hours", {"value": 4.2}), ("sun_off", {"choice": 1})):
        assert orbit.post(ANSWERS, json={"question": q, **kw}, headers=H).json()["correct"]
    row = classes(t, org)[0]
    assert row["completed"] == 8 and row["completed"] == row["expected"]
    assert row["average_percent"] == 83  # (4 x 67 + 4 x 100) / 8 = 83.3
    for c in (t, nova, orbit):
        c.__exit__(None, None, None)


@needs_db
def test_removing_a_student_removes_their_work_from_the_numbers(engine):  # noqa: F811
    t = teacher("glance3@school.example", org="Glance School 3")
    org = t.get("/api/v2/auth/me").json()["me"]["orgs"][0]["org_id"]
    k = t.post(f"/api/v2/orgs/{org}/classes", json={"name": "Chem"}, headers=H).json()
    t.post(f"/api/v2/classes/{k['id']}/assignments", json={"kind": "quiz", "ref": LESSON}, headers=H)
    s1 = student(k["join_code"], "Quark")
    for q, kw in (("earth_minutes", {"value": 8.3}), ("neptune_hours", {"value": 4.2}), ("sun_off", {"choice": 1})):
        s1.post(ANSWERS, json={"question": q, **kw}, headers=H)
    assert classes(t, org)[0]["completed"] == 1
    member = t.get(f"/api/v2/classes/{k['id']}").json()["students"][0]["id"]
    t.delete(f"/api/v2/classes/{k['id']}/students/{member}", headers=H)
    row = classes(t, org)[0]
    assert (row["students"], row["expected"], row["completed"], row["average_percent"]) == (0, 0, 0, None)
    for c in (t, s1):
        c.__exit__(None, None, None)


@needs_db
def test_one_schools_work_never_shows_in_anothers_numbers(two_orgs, engine):  # noqa: F811
    a, b, org_a = two_orgs["a"], two_orgs["b"], two_orgs["org_a"]
    for kid in classes(a, org_a):
        assert kid["students"] == 1 and kid["assignments"] == 1
    org_b = b.get("/api/v2/auth/me").json()["me"]["orgs"][0]["org_id"]
    assert classes(b, org_b) == []
    assert b.get(f"/api/v2/orgs/{org_a}/classes").status_code == 404


@needs_db
def test_work_in_progress_is_not_counted_as_completed_or_averaged(engine):  # noqa: F811
    t = teacher("glance5@school.example", org="Glance School 5")
    org = t.get("/api/v2/auth/me").json()["me"]["orgs"][0]["org_id"]
    k = t.post(f"/api/v2/orgs/{org}/classes", json={"name": "Bio"}, headers=H).json()
    t.post(f"/api/v2/classes/{k['id']}/assignments", json={"kind": "quiz", "ref": LESSON}, headers=H)
    s1 = student(k["join_code"], "Half")
    assert s1.post(ANSWERS, json={"question": "earth_minutes", "value": 8.3}, headers=H).json()["correct"]
    cell = t.get(f"/api/v2/classes/{k['id']}/gradebook").json()["rows"][0]["cells"][0]
    assert cell["completed_at"] is None and cell["score"] == 1  # started, not finished
    row = classes(t, org)[0]
    assert (row["completed"], row["average_percent"], row["expected"]) == (0, None, 1)
    for c in (t, s1):
        c.__exit__(None, None, None)
