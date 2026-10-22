"""Who may call what (launch task T21).

Two kinds of check, both driven by the real route table so a new route cannot slip past:

1. INVENTORY: every route that changes data, and every route that needs a sign-in, must be listed in POLICY below with
   the access rule it is meant to have, and the rule must match what the route actually declares. Add a route and forget
   this file, or lose a route's sign-in check, and this test fails.
2. ATTACKS: every protected route is called as a guest, as the wrong kind of account, as a teacher from another school,
   as a plain teacher on admin-only routes, and without the CSRF header, and the database is compared before and after
   to prove that nothing changed.
"""
from __future__ import annotations

import importlib

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy import text

import app as backend
from classroom import auth
from tests.test_classroom import H, student, teacher, org_of, two_orgs  # noqa: F401
from tests.test_scan_queue import engine  # noqa: F401
from tests.test_v2 import needs_db

ROUTER_MODULES = ["routes", "live_routes", "phase4_routes", "phase5_routes", "scan_routes", "learn_routes",
                  "classroom_routes", "phase9_routes", "account_routes"]

# policy: "public" anyone may call (rate limited or harmless), "teacher" / "student" need that kind of sign-in,
# "any" needs a sign-in of either kind (each person only ever reaches their own row),
# "stripe" is called by Stripe and proved by its signature. scope says which resource the URL names: "org", "class",
# "assignment" (a teacher outside that school gets 404, as if it did not exist), or None. admin: organization admins only.
# csrf: whether the route must refuse a request without the X-PH-CSRF header.
POLICY: dict[tuple[str, str], dict] = {
    ("POST", "/api/v2/scans"): {"policy": "public", "csrf": False, "why": "queues a public scan; rate limited per caller, no account effect"},
    ("POST", "/api/v2/explain"): {"policy": "public", "csrf": False, "why": "public explainer; rate limited and spend capped, no account effect"},
    ("POST", "/api/v2/lessons/{slug}/answers"): {"policy": "public", "csrf": "when_signed_in", "why": "anyone may answer; a signed-in student's answer counts, so the CSRF header is then required"},
    ("GET", "/api/v2/me/learn-progress"): {"policy": "any", "scope": None},
    ("PUT", "/api/v2/me/learn-progress"): {"policy": "any", "scope": None},
    ("GET", "/api/v2/me/saved-scans"): {"policy": "any", "scope": None},
    ("GET", "/api/v2/me/saved-scans/{job_id}"): {"policy": "any", "scope": None},
    ("PUT", "/api/v2/me/saved-scans/{job_id}"): {"policy": "any", "scope": None},
    ("DELETE", "/api/v2/me/saved-scans/{job_id}"): {"policy": "any", "scope": None},
    ("POST", "/api/v2/billing/webhook"): {"policy": "stripe", "csrf": False, "why": "Stripe's signature is the proof"},
    ("POST", "/api/v2/auth/teacher/signup"): {"policy": "public", "csrf": True},
    ("POST", "/api/v2/auth/teacher/login"): {"policy": "public", "csrf": True},
    ("POST", "/api/v2/auth/teacher/login/2fa"): {"policy": "public", "csrf": True},
    ("POST", "/api/v2/auth/teacher/verify"): {"policy": "public", "csrf": True},
    ("POST", "/api/v2/auth/teacher/forgot"): {"policy": "public", "csrf": True},
    ("POST", "/api/v2/auth/teacher/reset"): {"policy": "public", "csrf": True},
    ("POST", "/api/v2/auth/student/join"): {"policy": "public", "csrf": True},
    ("POST", "/api/v2/auth/student/login"): {"policy": "public", "csrf": True},
    ("POST", "/api/v2/auth/logout"): {"policy": "public", "csrf": True},
    ("POST", "/api/v2/auth/teacher/2fa/setup"): {"policy": "teacher", "scope": None},
    ("POST", "/api/v2/auth/teacher/2fa/enable"): {"policy": "teacher", "scope": None},
    ("POST", "/api/v2/auth/teacher/2fa/disable"): {"policy": "teacher", "scope": None},
    ("POST", "/api/v2/auth/teacher/2fa/recovery-codes"): {"policy": "teacher", "scope": None},
    ("POST", "/api/v2/auth/teacher/verify/resend"): {"policy": "teacher", "scope": None},
    ("POST", "/api/v2/auth/teacher/delete-account"): {"policy": "teacher", "scope": None},
    ("POST", "/api/v2/orgs"): {"policy": "teacher", "scope": None},
    ("POST", "/api/v2/orgs/join"): {"policy": "teacher", "scope": None},
    ("GET", "/api/v2/orgs/{org_id}"): {"policy": "teacher", "scope": "org"},
    ("POST", "/api/v2/orgs/{org_id}/join-code"): {"policy": "teacher", "scope": "org", "admin": True},
    ("PUT", "/api/v2/orgs/{org_id}/teachers/{user_id}/role"): {"policy": "teacher", "scope": "org", "admin": True},
    ("GET", "/api/v2/orgs/{org_id}/overview"): {"policy": "teacher", "scope": "org", "admin": True},
    ("GET", "/api/v2/orgs/{org_id}/classes"): {"policy": "teacher", "scope": "org"},
    ("POST", "/api/v2/orgs/{org_id}/classes"): {"policy": "teacher", "scope": "org"},
    ("GET", "/api/v2/classes/{class_id}"): {"policy": "teacher", "scope": "class"},
    ("POST", "/api/v2/classes/{class_id}/join-code"): {"policy": "teacher", "scope": "class"},
    ("DELETE", "/api/v2/classes/{class_id}"): {"policy": "teacher", "scope": "class"},
    ("GET", "/api/v2/classes/{class_id}/export"): {"policy": "teacher", "scope": "class"},
    ("PUT", "/api/v2/classes/{class_id}/students/{member_id}/pin"): {"policy": "teacher", "scope": "class"},
    ("DELETE", "/api/v2/classes/{class_id}/students/{member_id}"): {"policy": "teacher", "scope": "class"},
    ("POST", "/api/v2/classes/{class_id}/assignments"): {"policy": "teacher", "scope": "class"},
    ("DELETE", "/api/v2/assignments/{assignment_id}"): {"policy": "teacher", "scope": "assignment"},
    ("GET", "/api/v2/classes/{class_id}/gradebook"): {"policy": "teacher", "scope": "class"},
    ("GET", "/api/v2/classes/{class_id}/gradebook.csv"): {"policy": "teacher", "scope": "class"},
    ("GET", "/api/v2/me/assignments"): {"policy": "student", "scope": None},
    ("POST", "/api/v2/me/assignments/{assignment_id}/hunt"): {"policy": "student", "scope": "assignment"},
    ("GET", "/api/v2/orgs/{org_id}/billing"): {"policy": "teacher", "scope": "org"},
    ("POST", "/api/v2/orgs/{org_id}/billing/checkout"): {"policy": "teacher", "scope": "org", "admin": True},
}

BODIES = {
    "/api/v2/me/learn-progress": {"version": 1, "lessons": {}},
    "/api/v2/me/saved-scans/{job_id}": {"label": "x"},
    "/api/v2/auth/teacher/2fa/enable": {"code": "123456"},
    "/api/v2/auth/teacher/2fa/disable": {"password": "x", "code": "123456"},
    "/api/v2/auth/teacher/2fa/recovery-codes": {"password": "x", "code": "123456"},
    "/api/v2/auth/teacher/delete-account": {"password": "wrong password!"},
    "/api/v2/orgs": {"name": "Intruder School"},
    "/api/v2/orgs/join": {"code": "ZZZZZZZZ"},
    "/api/v2/orgs/{org_id}/teachers/{user_id}/role": {"role": "teacher"},
    "/api/v2/orgs/{org_id}/classes": {"name": "Intruder class"},
    "/api/v2/classes/{class_id}/students/{member_id}/pin": {"pin": "9999"},
    "/api/v2/classes/{class_id}/assignments": {"kind": "quiz", "ref": "transits"},
    "/api/v2/me/assignments/{assignment_id}/hunt": {"period_d": 3.0},
    "/api/v2/orgs/{org_id}/billing/checkout": {},
}


# Well-formed bodies for the public writes, so the CSRF check (not body validation) is what answers.
PUBLIC_BODIES = {
    "/api/v2/auth/teacher/signup": {"email": "csrf@example.com", "password": "correct horse battery", "display_name": "C",
                                    "birth_month": 3, "birth_year": 1985, "org_name": "Csrf School"},
    "/api/v2/auth/teacher/login": {"email": "csrf@example.com", "password": "correct horse battery"},
    "/api/v2/auth/teacher/login/2fa": {"challenge": "c" * 30, "code": "123456"},
    "/api/v2/auth/teacher/verify": {"token": "t" * 30},
    "/api/v2/auth/teacher/forgot": {"email": "csrf@example.com"},
    "/api/v2/auth/teacher/reset": {"token": "t" * 30, "password": "correct horse battery"},
    "/api/v2/auth/student/join": {"class_code": "ABCD2345", "nickname": "Csrf", "pin": "1234", "birth_month": 3, "birth_year": 2010},
    "/api/v2/auth/student/login": {"class_code": "ABCD2345", "nickname": "Csrf", "pin": "1234"},
    "/api/v2/auth/logout": {},
}


def all_routes():
    for name in ROUTER_MODULES:
        mod = importlib.import_module(f"api_v2.{name}")
        for r in mod.router.routes:
            if isinstance(r, APIRoute):
                for m in sorted(r.methods - {"HEAD", "OPTIONS"}):
                    yield m, r.path, r


def declared_kind(route: APIRoute) -> str | None:
    for d in route.dependant.dependencies:
        if isinstance(d.call, auth.Auth):
            return "+".join(d.call.kinds)
    return None


# ---------- 1. inventory ----------

def test_every_route_that_writes_or_needs_sign_in_has_a_stated_access_rule():
    seen = set()
    for method, path, route in all_routes():
        kind = declared_kind(route)
        if method == "GET" and kind is None:
            continue  # public read-only data
        key = (method, path)
        seen.add(key)
        assert key in POLICY, f"{method} {path} changes data or needs sign-in but has no access rule in POLICY"
        rule = POLICY[key]["policy"]
        if rule in ("teacher", "student"):
            assert kind == rule, f"{method} {path} is meant for {rule} but declares {kind}"
        elif rule == "any":
            assert kind == "teacher+student", f"{method} {path} is meant for any signed-in person but declares {kind}"
        else:
            assert kind is None, f"{method} {path} is listed as {rule} but declares a sign-in check ({kind})"
    stale = set(POLICY) - seen
    assert not stale, f"POLICY lists routes that no longer exist: {sorted(stale)}"


def test_every_public_write_says_why_or_requires_the_csrf_header():
    for (method, path), rule in POLICY.items():
        if rule["policy"] in ("public", "stripe"):
            assert rule["csrf"] is True or rule.get("why"), f"{method} {path} needs a reason for skipping CSRF"


# ---------- 2. attacks ----------

def fingerprint(engine) -> dict:
    """Everything an attacker might try to change, in one comparable snapshot."""
    q = {
        "orgs": "select id, name, join_code from organizations order by id",
        "memberships": "select org_id, user_id, role from memberships order by org_id, user_id",
        "classes": "select id, org_id, name, join_code from classes order by id",
        "learn_progress": "select user_id, member_id, doc from learn_progress order by id",
        "saved_scans": "select user_id, member_id, job_id, label from saved_scans order by id",
        "members": "select id, class_id, nickname, pin_hash from class_members order by id",
        "assignments": "select id, class_id, kind, ref from assignments order by id",
        "submissions": "select * from submissions order by 1, 2",
        "users": "select id, email, password_hash, display_name, totp_enabled_at, email_verified_at from users order by id",
        "plans": "select org_id, plan, status from org_plans order by org_id",
    }
    out = {}
    with engine.connect() as cx:
        for k, sql in q.items():
            out[k] = [tuple(r) for r in cx.execute(text(sql)).all()]
    return out


@pytest.fixture
def world(two_orgs, engine):  # noqa: F811
    """School A (admin ada, class with a student and a quiz), school B (bo), plus a plain teacher in A and a second
    class in A with a hunt assignment that the first class's student must not reach."""
    a, b = two_orgs["a"], two_orgs["b"]
    org_a, k1 = two_orgs["org_a"], two_orgs["class"]
    code = a.get(f"/api/v2/orgs/{org_a}").json()["join_code"]
    plain = teacher("plain@school-a.example", code=code)
    k2 = a.post(f"/api/v2/orgs/{org_a}/classes", json={"name": "Chemistry"}, headers=H).json()
    hunt2 = a.post(f"/api/v2/classes/{k2['id']}/assignments", json={"kind": "hunt", "ref": "toi-700"}, headers=H).json()
    s2 = student(k2["join_code"], "Quark")
    admin_id = next(t["user_id"] for t in a.get(f"/api/v2/orgs/{org_a}").json()["teachers"] if t["display_name"] == "ada")
    ids = {"org_id": org_a, "class_id": k1["id"], "member_id": two_orgs["member"], "assignment_id": two_orgs["assignment"]["id"],
           "user_id": admin_id, "slug": "distances-and-light-time", "job_id": 1}
    yield {**two_orgs, "plain": plain, "k2": k2, "hunt2": hunt2, "s2": s2, "ids": ids}
    for c in (plain, s2):
        c.__exit__(None, None, None)


def url(path: str, ids: dict) -> str:
    return path.format(**ids)


def call(client, method, path, ids, headers=H):
    body = BODIES.get(path)
    kw = {"headers": headers}
    if method in ("POST", "PUT", "DELETE") and body is not None:
        kw["json"] = body
    return client.request(method, url(path, ids), **kw)


def protected():
    return [(m, p, POLICY[(m, p)]) for (m, p) in sorted(POLICY) if POLICY[(m, p)]["policy"] in ("teacher", "student", "any")]


@needs_db
def test_nobody_signed_in_is_refused_everywhere_that_needs_sign_in(world, engine):  # noqa: F811
    before = fingerprint(engine)
    with TestClient(backend.app) as anon:
        for m, p, rule in protected():
            r = call(anon, m, p, world["ids"])
            assert r.status_code == 401, (m, p, r.status_code)
    assert fingerprint(engine) == before


@needs_db
def test_the_wrong_kind_of_account_is_refused(world, engine):  # noqa: F811
    before = fingerprint(engine)
    for m, p, rule in protected():
        if rule["policy"] == "any":
            continue  # both kinds are allowed in; the anonymous test above covers the refusal
        wrong = world["student"] if rule["policy"] == "teacher" else world["a"]
        r = call(wrong, m, p, world["ids"])
        assert r.status_code == 403, (m, p, rule["policy"], r.status_code)
    assert fingerprint(engine) == before


@needs_db
def test_a_teacher_from_another_school_cannot_see_or_touch_school_a(world, engine):  # noqa: F811
    before = fingerprint(engine)
    b = world["b"]
    for m, p, rule in protected():
        if rule["policy"] != "teacher" or rule["scope"] is None:
            continue
        r = call(b, m, p, world["ids"])
        assert r.status_code == 404, (m, p, r.status_code, "must look like it does not exist")
    assert fingerprint(engine) == before


@needs_db
def test_a_plain_teacher_cannot_use_admin_only_routes_but_can_work_with_classes(world, engine):  # noqa: F811
    before = fingerprint(engine)
    plain = world["plain"]
    for m, p, rule in protected():
        if rule.get("admin"):
            r = call(plain, m, p, world["ids"])
            assert r.status_code == 403, (m, p, r.status_code)
    assert fingerprint(engine) == before
    # Teachers in the same school do share its classes (ADR 0004): that is the allowed side of the line.
    assert plain.get(f"/api/v2/classes/{world['ids']['class_id']}").status_code == 200
    assert plain.get(f"/api/v2/orgs/{world['ids']['org_id']}/classes").status_code == 200
    # ...but a plain teacher still cannot take the join code, which only shows to admins.
    assert plain.get(f"/api/v2/orgs/{world['ids']['org_id']}").json()["join_code"] is None


@needs_db
def test_every_protected_write_refuses_a_request_without_the_csrf_header(world, engine):  # noqa: F811
    before = fingerprint(engine)
    for m, p, rule in protected():
        if m == "GET":
            continue
        who = world["student"] if rule["policy"] == "student" else world["a"]
        r = call(who, m, p, world["ids"], headers={})
        assert r.status_code == 403 and "CSRF" in r.json()["detail"], (m, p, r.status_code)
    assert fingerprint(engine) == before


@needs_db
def test_public_writes_that_must_have_csrf_refuse_without_it(world, engine):  # noqa: F811
    before = fingerprint(engine)
    with TestClient(backend.app) as anon:
        for (m, p), rule in POLICY.items():
            if rule["policy"] == "public" and rule["csrf"] is True:
                r = anon.request(m, p, json=PUBLIC_BODIES[p], headers={})
                assert r.status_code == 403 and "CSRF" in r.json()["detail"], (m, p, r.status_code, r.text[:80])
    assert fingerprint(engine) == before


@needs_db
def test_a_signed_in_student_cannot_record_lesson_answers_without_the_csrf_header(world, engine):  # noqa: F811
    s1 = world["student"]
    url_ = "/api/v2/lessons/distances-and-light-time/answers"
    assert s1.post(url_, json={"question": "earth_minutes", "value": 8.3}).status_code == 403
    assert s1.post(url_, json={"question": "earth_minutes", "value": 8.3}, headers=H).status_code == 200
    with TestClient(backend.app) as anon:  # a guest may answer: it counts for nobody
        assert anon.post(url_, json={"question": "earth_minutes", "value": 8.3}).status_code == 200


@needs_db
def test_a_student_cannot_reach_an_assignment_of_another_class_in_the_same_school(world, engine):  # noqa: F811
    s1, hunt2 = world["student"], world["hunt2"]
    before = fingerprint(engine)
    r = s1.post(f"/api/v2/me/assignments/{hunt2['id']}/hunt", json={"period_d": 3.0}, headers=H)
    assert r.status_code == 404
    assert fingerprint(engine) == before
    assert hunt2["id"] not in [a["id"] for a in s1.get("/api/v2/me/assignments").json()["assignments"]]
    # and the other class's student does not see class 1's work either
    assert world["assignment"]["id"] not in [a["id"] for a in world["s2"].get("/api/v2/me/assignments").json()["assignments"]]


@needs_db
def test_a_student_of_one_class_sees_nothing_of_a_classmate_or_other_class(world):
    home = world["student"].get("/api/v2/me/assignments").json()
    blob = str(home)
    for other in ("Quark", "Chemistry", "plain@school-a.example", "bo@school-b.example"):
        assert other not in blob


@needs_db
def test_a_class_code_cannot_be_used_to_become_a_teacher_or_reach_the_teacher_side(world):
    s1 = world["student"]
    me = s1.get("/api/v2/auth/me").json()["me"]
    assert me["kind"] == "student" and "orgs" not in me and "email" not in me


@needs_db
def test_a_deleted_or_ended_session_stops_working_at_once(world):
    a = world["a"]
    assert a.get(f"/api/v2/orgs/{world['ids']['org_id']}").status_code == 200
    assert a.post("/api/v2/auth/logout", headers=H).status_code == 200
    assert a.get(f"/api/v2/orgs/{world['ids']['org_id']}").status_code == 401


@needs_db
def test_a_made_up_session_cookie_is_refused(world):
    with TestClient(backend.app) as anon:
        anon.cookies.set(auth.COOKIE, "x" * 43)
        assert anon.get(f"/api/v2/orgs/{world['ids']['org_id']}").status_code == 401
        assert anon.get("/api/v2/auth/me").json() == {"me": None}


@needs_db
def test_ids_that_do_not_exist_look_the_same_as_ids_in_another_school(world):
    """A teacher cannot tell 'not yours' from 'not there', so ids cannot be probed."""
    b, ids = world["b"], world["ids"]
    other = {**ids, "class_id": 999_999, "assignment_id": 999_999, "org_id": 999_999, "member_id": 999_999}
    for m, p, rule in protected():
        if rule["policy"] == "teacher" and rule["scope"] in ("org", "class", "assignment") and not rule.get("admin_skip"):
            real = call(b, m, p, ids)
            fake = call(b, m, p, other)
            assert real.status_code == fake.status_code == 404, (m, p, real.status_code, fake.status_code)
