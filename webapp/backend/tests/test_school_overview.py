"""The school admin view: what an organization admin sees of the whole school (launch task T27)."""
from __future__ import annotations

from sqlalchemy import text

from tests.test_classroom import H, student, teacher, two_orgs  # noqa: F401
from tests.test_scan_queue import engine  # noqa: F401
from tests.test_v2 import needs_db


def overview(c, org):
    return c.get(f"/api/v2/orgs/{org}/overview")


@needs_db
def test_an_admin_sees_every_teacher_class_and_total_in_the_school(engine):  # noqa: F811
    a = teacher("ov1a@school.example", org="Overview School")
    org = a.get("/api/v2/auth/me").json()["me"]["orgs"][0]["org_id"]
    code = a.get(f"/api/v2/orgs/{org}").json()["join_code"]
    b = teacher("ov1b@school.example", code=code)
    k1 = a.post(f"/api/v2/orgs/{org}/classes", json={"name": "Physics"}, headers=H).json()
    b.post(f"/api/v2/orgs/{org}/classes", json={"name": "Chemistry"}, headers=H)
    b.post(f"/api/v2/orgs/{org}/classes", json={"name": "Biology"}, headers=H)
    a.post(f"/api/v2/classes/{k1['id']}/assignments", json={"kind": "quiz", "ref": "distances-and-light-time"}, headers=H)
    s1, s2 = student(k1["join_code"], "Nova"), student(k1["join_code"], "Orbit")
    r = overview(a, org)
    assert r.status_code == 200 and r.headers["cache-control"] == "no-store"
    o = r.json()
    assert o["name"] == "Overview School"
    assert o["totals"] == {"teachers": 2, "admins": 1, "classes": 3, "students": 2, "assignments": 1, "unassigned_classes": 0}
    # Admins first, then by name; each teacher's own classes and the students in them.
    assert [(t["display_name"], t["role"], t["classes"], t["students"]) for t in o["teachers"]] == [
        ("ov1a", "org_admin", 1, 2), ("ov1b", "teacher", 2, 0)]
    assert [(k["name"], k["teacher"], k["students"], k["assignments"]) for k in o["classes"]] == [
        ("Physics", "ov1a", 2, 1), ("Chemistry", "ov1b", 0, 0), ("Biology", "ov1b", 0, 0)]
    for c in (a, b, s1, s2):
        c.__exit__(None, None, None)


@needs_db
def test_only_admins_see_it_and_other_schools_cannot_probe_it(two_orgs, engine):  # noqa: F811
    a, b, org_a = two_orgs["a"], two_orgs["b"], two_orgs["org_a"]
    code = a.get(f"/api/v2/orgs/{org_a}").json()["join_code"]
    plain = teacher("ov2plain@school-a.example", code=code)
    assert overview(plain, org_a).status_code == 403  # a teacher of the school, but not an admin
    assert overview(b, org_a).status_code == 404  # another school: looks like it does not exist
    assert overview(b, 999_999).status_code == 404
    assert overview(two_orgs["student"], org_a).status_code == 403
    assert overview(a, org_a).status_code == 200
    plain.__exit__(None, None, None)


@needs_db
def test_it_shows_names_and_counts_only_never_emails_codes_or_hashes(two_orgs):  # noqa: F811
    a, org_a = two_orgs["a"], two_orgs["org_a"]
    blob = overview(a, org_a).text.lower()
    for private in ("@school-a.example", "@school-b.example", "password", "pin_hash", "join_code", "token", "nova"):
        assert private not in blob, private


@needs_db
def test_a_class_whose_creator_left_is_shown_as_unassigned(engine):  # noqa: F811
    a = teacher("ov3a@school.example", org="Leaver School")
    org = a.get("/api/v2/auth/me").json()["me"]["orgs"][0]["org_id"]
    code = a.get(f"/api/v2/orgs/{org}").json()["join_code"]
    b = teacher("ov3b@school.example", code=code)
    b.post(f"/api/v2/orgs/{org}/classes", json={"name": "Orphan"}, headers=H)
    b_id = next(t["user_id"] for t in a.get(f"/api/v2/orgs/{org}").json()["teachers"] if t["display_name"] == "ov3b")
    with engine.begin() as cx:  # the creator's account is gone, as after a deletion
        cx.execute(text("delete from users where id = :u"), {"u": b_id})
    o = overview(a, org).json()
    assert o["classes"][0]["teacher"] is None and o["totals"]["unassigned_classes"] == 1
    assert [t["display_name"] for t in o["teachers"]] == ["ov3a"]
    for c in (a, b):
        c.__exit__(None, None, None)
