"""Accounts and classrooms (Phase 8): tenant isolation, roles, age gate, sign-in limits, grades.

The plan's "Done when": a teacher in org A can't read, list or modify org B's data, and a
student can't use teacher endpoints (ADR 0004).
"""
import datetime as dt

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

import app as backend
from api_v2 import classroom_routes
from classroom import auth, security
from tests.test_scan_queue import engine  # noqa: F401
from tests.test_v2 import needs_db

H = {"X-PH-CSRF": "1"}
ADULT = {"birth_month": 1, "birth_year": 1990}
TEEN = {"birth_month": 1, "birth_year": 2008}


# ---------- pure checks ----------

def test_age_check_needs_13_full_years_before_this_month():
    today = dt.date(2026, 10, 18)
    assert security.is_13_or_older(2013, 9, today)
    assert not security.is_13_or_older(2013, 10, today)  # may turn 13 later this month: come back next month
    assert not security.is_13_or_older(2014, 1, today)
    assert not security.is_13_or_older(2013, 13, today) and not security.is_13_or_older(2030, 1, today)


def test_passwords_pins_nicknames_and_codes():
    assert security.password_problem("short") and security.password_problem(" padded password ")
    assert security.password_problem("a long enough one") is None
    h = security.hash_secret("1234")
    assert security.verify_secret(h, "1234") and not security.verify_secret(h, "1235")
    assert not security.verify_secret(None, "1234") and not security.verify_secret("not a hash", "1234")
    assert security.PIN_RE.match("1234") and not security.PIN_RE.match("12a4") and not security.PIN_RE.match("123")
    for ok in ["Nova", "star 7", "a", "x.y-z"]:
        assert security.NICKNAME_RE.match(ok), ok
    for bad in ["", " lead", "<b>", "a" * 25, "trail-"]:
        assert not security.NICKNAME_RE.match(bad), bad
    code = security.new_code()
    assert len(code) == 8 and not set(code) & set("01OI")
    assert security.normal_code(" abcd-efgh ") == "ABCDEFGH"
    assert security.token_hash("t") != "t" and len(security.token_hash("t")) == 64


def test_every_classroom_route_declares_the_shared_dependency():
    open_routes = {"/api/v2/auth/teacher/signup", "/api/v2/auth/teacher/login", "/api/v2/auth/teacher/forgot",
                   "/api/v2/auth/teacher/reset", "/api/v2/auth/teacher/verify", "/api/v2/auth/student/join",
                   "/api/v2/auth/student/login", "/api/v2/auth/logout", "/api/v2/auth/me"}
    routes = [r for r in classroom_routes.router.routes if isinstance(r, APIRoute)]
    assert len(routes) > 20
    for r in routes:
        deps = [d.call for d in r.dependant.dependencies]
        if r.path in open_routes:
            continue
        assert any(isinstance(d, auth.Auth) for d in deps), f"{r.path} does not use classroom.auth.Auth"


def test_spreadsheet_formulas_are_neutralised_in_csv():
    assert classroom_routes._safe_cell("=HYPERLINK(1)") == "'=HYPERLINK(1)"
    assert classroom_routes._safe_cell("@x") == "'@x" and classroom_routes._safe_cell("Nova") == "Nova"


# ---------- with the database ----------

def teacher(email: str, org: str | None = None, code: str | None = None) -> TestClient:
    c = TestClient(backend.app)
    c.__enter__()
    body = {"email": email, "password": "correct horse battery", "display_name": email.split("@")[0], **ADULT,
            **({"org_name": org} if org else {"org_code": code})}
    r = c.post("/api/v2/auth/teacher/signup", json=body, headers=H)
    assert r.status_code == 201, r.text
    return c


def student(code: str, nickname: str, pin: str = "4321") -> TestClient:
    c = TestClient(backend.app)
    c.__enter__()
    r = c.post("/api/v2/auth/student/join", json={"class_code": code, "nickname": nickname, "pin": pin, **TEEN},
               headers=H)
    assert r.status_code == 201, r.text
    return c


def org_of(c: TestClient) -> int:
    return c.get("/api/v2/auth/me").json()["me"]["orgs"][0]["org_id"]


@pytest.fixture
def two_orgs(engine):  # noqa: F811
    a = teacher("ada@school-a.example", org="School A")
    b = teacher("bo@school-b.example", org="School B")
    org_a = org_of(a)
    k = a.post(f"/api/v2/orgs/{org_a}/classes", json={"name": "Physics 1"}, headers=H).json()
    asg = a.post(f"/api/v2/classes/{k['id']}/assignments",
                 json={"kind": "quiz", "ref": "distances-and-light-time"}, headers=H).json()
    s1 = student(k["join_code"], "Nova")
    member = a.get(f"/api/v2/classes/{k['id']}").json()["students"][0]["id"]
    yield {"a": a, "b": b, "org_a": org_a, "class": k, "assignment": asg, "student": s1, "member": member}
    for c in (a, b, s1):
        c.__exit__(None, None, None)


@needs_db
def test_org_b_cannot_read_list_or_modify_org_a(two_orgs, engine):  # noqa: F811
    b, k, org_a = two_orgs["b"], two_orgs["class"], two_orgs["org_a"]
    kid, mid, aid = k["id"], two_orgs["member"], two_orgs["assignment"]["id"]
    reads = [f"/api/v2/orgs/{org_a}", f"/api/v2/orgs/{org_a}/classes", f"/api/v2/classes/{kid}",
             f"/api/v2/classes/{kid}/gradebook", f"/api/v2/classes/{kid}/gradebook.csv",
             f"/api/v2/classes/{kid}/export"]
    for path in reads:
        assert b.get(path).status_code == 404, path
    writes = [("post", f"/api/v2/orgs/{org_a}/classes", {"name": "x"}),
              ("post", f"/api/v2/orgs/{org_a}/join-code", None),
              ("put", f"/api/v2/orgs/{org_a}/teachers/1/role", {"role": "teacher"}),
              ("post", f"/api/v2/classes/{kid}/join-code", None),
              ("post", f"/api/v2/classes/{kid}/assignments", {"kind": "quiz", "ref": "transits"}),
              ("put", f"/api/v2/classes/{kid}/students/{mid}/pin", {"pin": "1111"}),
              ("delete", f"/api/v2/classes/{kid}/students/{mid}", None),
              ("delete", f"/api/v2/assignments/{aid}", None),
              ("delete", f"/api/v2/classes/{kid}", None)]
    for method, path, body in writes:
        r = getattr(b, method)(path, headers=H, **({"json": body} if body is not None else {}))
        assert r.status_code == 404, (method, path, r.status_code)
    # Nothing changed for org A.
    with engine.connect() as c:
        assert c.execute(text("select count(*) from classes")).scalar_one() == 1
        assert c.execute(text("select count(*) from class_members")).scalar_one() == 1
        assert c.execute(text("select count(*) from assignments")).scalar_one() == 1
    assert b.get(f"/api/v2/orgs/{org_of(b)}/classes").json()["classes"] == []


@needs_db
def test_a_student_cannot_use_teacher_endpoints(two_orgs):
    s1, kid, org_a = two_orgs["student"], two_orgs["class"]["id"], two_orgs["org_a"]
    for path in [f"/api/v2/orgs/{org_a}", f"/api/v2/orgs/{org_a}/classes", f"/api/v2/classes/{kid}",
                 f"/api/v2/classes/{kid}/gradebook", f"/api/v2/classes/{kid}/export"]:
        assert s1.get(path).status_code == 403, path
    assert s1.post(f"/api/v2/classes/{kid}/assignments", json={"kind": "quiz", "ref": "transits"},
                   headers=H).status_code == 403
    assert s1.post("/api/v2/orgs", json={"name": "Mine"}, headers=H).status_code == 403
    # And a teacher cannot use student endpoints.
    assert two_orgs["a"].get("/api/v2/me/assignments").status_code == 403
    # Nobody signed in gets 401.
    with TestClient(backend.app) as anon:
        assert anon.get(f"/api/v2/classes/{kid}").status_code == 401
        assert anon.get("/api/v2/auth/me").json() == {"me": None}


@needs_db
def test_students_see_only_their_own_class_and_no_other_student(two_orgs):
    s1 = two_orgs["student"]
    home = s1.get("/api/v2/me/assignments").json()
    assert home["nickname"] == "Nova" and home["class"]["name"] == "Physics 1"
    assert [a["title"] for a in home["assignments"]] == ["Quiz: Distances and light-time"]
    assert "students" not in home and "Nova" not in str(home["assignments"])


@needs_db
def test_teacher_creates_class_student_joins_completes_and_the_grade_appears(two_orgs):
    a, s1, kid = two_orgs["a"], two_orgs["student"], two_orgs["class"]["id"]
    url = "/api/v2/lessons/distances-and-light-time/answers"
    # First try wrong, then right: completion counts retries, the score counts first tries.
    assert not s1.post(url, json={"question": "earth_minutes", "value": 20}, headers=H).json()["correct"]
    assert s1.post(url, json={"question": "earth_minutes", "value": 8.3}, headers=H).json()["correct"]
    assert s1.post(url, json={"question": "neptune_hours", "value": 4.2}, headers=H).json()["correct"]
    g = a.get(f"/api/v2/classes/{kid}/gradebook").json()
    cell = g["rows"][0]["cells"][0]
    assert cell["score"] == 1 and cell["max_score"] == 3 and cell["completed_at"] is None
    assert s1.post(url, json={"question": "sun_off", "choice": 1}, headers=H).json()["correct"]
    cell = a.get(f"/api/v2/classes/{kid}/gradebook").json()["rows"][0]["cells"][0]
    assert cell["score"] == 2 and cell["completed_at"] is not None and cell["late"] is False
    mine = s1.get("/api/v2/me/assignments").json()["assignments"][0]["result"]
    assert mine["score"] == 2 and mine["max_score"] == 3
    csv_text = a.get(f"/api/v2/classes/{kid}/gradebook.csv").text
    assert csv_text.splitlines() == ["Nickname,Quiz: Distances and light-time (out of 3)", "Nova,2"]


@needs_db
def test_hunt_challenge_is_scored_like_the_hunt_lab(two_orgs):
    a, s1, kid = two_orgs["a"], two_orgs["student"], two_orgs["class"]["id"]
    from data_store import results
    cand = next(c for c in results().candidates if c.slug == "toi-700")
    asg = a.post(f"/api/v2/classes/{kid}/assignments", json={"kind": "hunt", "ref": "toi-700"}, headers=H).json()
    assert asg["title"].startswith("Hunt challenge")
    url = f"/api/v2/me/assignments/{asg['id']}/hunt"
    far = s1.post(url, json={"period_d": cand.period_d * 1.5}, headers=H).json()
    assert far["verdict"] == "off" and far["points"] == 0
    exact = s1.post(url, json={"period_d": cand.period_d}, headers=H).json()
    assert exact == {"points": 100, "verdict": "exact", "harmonic": None, "best": 100}
    double = s1.post(url, json={"period_d": cand.period_d * 2}, headers=H).json()
    assert double["verdict"] == "harmonic" and double["best"] == 100  # the best try counts
    assert a.post(f"/api/v2/classes/{kid}/assignments", json={"kind": "hunt", "ref": "no-such"},
                  headers=H).status_code == 422


@needs_db
def test_pin_reset_and_removal_sign_the_student_out_and_are_audited(two_orgs, engine):  # noqa: F811
    a, s1, kid, mid = two_orgs["a"], two_orgs["student"], two_orgs["class"]["id"], two_orgs["member"]
    code = two_orgs["class"]["join_code"]
    assert a.put(f"/api/v2/classes/{kid}/students/{mid}/pin", json={"pin": "9999"}, headers=H).json() == {"ok": True}
    assert s1.get("/api/v2/me/assignments").status_code == 401
    with TestClient(backend.app) as again:
        login = {"class_code": code, "nickname": "nova", "pin": "4321"}
        assert again.post("/api/v2/auth/student/login", json=login, headers=H).status_code == 401
        assert again.post("/api/v2/auth/student/login", json={**login, "pin": "9999"}, headers=H).status_code == 200
        assert a.delete(f"/api/v2/classes/{kid}/students/{mid}", headers=H).json() == {"ok": True}
        assert again.get("/api/v2/me/assignments").status_code == 401
    a.get(f"/api/v2/classes/{kid}/export")
    a.get(f"/api/v2/classes/{kid}/gradebook.csv")
    with engine.connect() as c:
        actions = [r[0] for r in c.execute(text("select action from audit_log order by id"))]
    for act in ["member.pin_reset", "member.delete", "class.export", "gradebook.export"]:
        assert act in actions, act


@needs_db
def test_roles_change_only_by_an_admin_and_an_org_keeps_one_admin(two_orgs, engine):  # noqa: F811
    a, org_a = two_orgs["a"], two_orgs["org_a"]
    code = a.get(f"/api/v2/orgs/{org_a}").json()["join_code"]
    t2 = teacher("cy@school-a.example", code=code)
    try:
        detail = t2.get(f"/api/v2/orgs/{org_a}").json()
        assert detail["role"] == "teacher" and detail["join_code"] is None
        admin_id = next(t["user_id"] for t in detail["teachers"] if t["role"] == "org_admin")
        cy_id = next(t["user_id"] for t in detail["teachers"] if t["role"] == "teacher")
        assert t2.put(f"/api/v2/orgs/{org_a}/teachers/{admin_id}/role", json={"role": "teacher"},
                      headers=H).status_code == 403
        assert a.put(f"/api/v2/orgs/{org_a}/teachers/{admin_id}/role", json={"role": "teacher"},
                     headers=H).status_code == 409
        assert a.put(f"/api/v2/orgs/{org_a}/teachers/{cy_id}/role", json={"role": "org_admin"},
                     headers=H).status_code == 200
        # Teachers in the same org share its classes.
        assert t2.get(f"/api/v2/classes/{two_orgs['class']['id']}").status_code == 200
    finally:
        t2.__exit__(None, None, None)
    with engine.connect() as c:
        assert c.execute(text("select count(*) from audit_log where action = 'membership.role_change'")).scalar_one() == 1


@needs_db
def test_under_13_is_blocked_and_cannot_simply_retry(engine):  # noqa: F811
    with TestClient(backend.app) as c:
        young = {"email": "kid@example.com", "password": "correct horse battery", "display_name": "k",
                 "org_name": "Club X", "birth_month": 1, "birth_year": dt.date.today().year - 10}
        r = c.post("/api/v2/auth/teacher/signup", json=young, headers=H)
        assert r.status_code == 403 and "13 and up" in r.json()["detail"]
        assert c.cookies.get(auth.AGE_BLOCK_COOKIE) == "1"
        r = c.post("/api/v2/auth/teacher/signup", json={**young, **ADULT}, headers=H)
        assert r.status_code == 403
    with engine.connect() as conn:
        assert conn.execute(text("select count(*) from users")).scalar_one() == 0


@needs_db
def test_sign_in_failures_are_rate_limited(two_orgs):
    code = two_orgs["class"]["join_code"]
    with TestClient(backend.app) as c:
        bad = {"email": "ada@school-a.example", "password": "wrong password!"}
        codes = [c.post("/api/v2/auth/teacher/login", json=bad, headers=H).status_code for _ in range(11)]
        assert codes[:10] == [401] * 10 and codes[10] == 429
        good = {"email": "ADA@school-a.example", "password": "correct horse battery"}
        assert c.post("/api/v2/auth/teacher/login", json=good, headers=H).status_code == 429
        pin = {"class_code": code, "nickname": "Nova", "pin": "0000"}
        codes = [c.post("/api/v2/auth/student/login", json=pin, headers=H).status_code for _ in range(6)]
        assert codes[:5] == [401] * 5 and codes[5] == 429


@needs_db
def test_changes_need_the_csrf_header_and_emails_are_unique(two_orgs):
    a, org_a = two_orgs["a"], two_orgs["org_a"]
    assert a.post(f"/api/v2/orgs/{org_a}/classes", json={"name": "No header"}).status_code == 403
    with TestClient(backend.app) as c:
        dup = {"email": "Ada@School-A.example", "password": "another good one", "display_name": "x", "org_name": "Club Y",
               **ADULT}
        assert c.post("/api/v2/auth/teacher/signup", json=dup, headers=H).status_code == 409
        taken = {"class_code": two_orgs["class"]["join_code"], "nickname": "NOVA", "pin": "1234", **TEEN}
        assert c.post("/api/v2/auth/student/join", json=taken, headers=H).status_code == 409


@needs_db
def test_the_database_rejects_rows_that_point_into_another_org(two_orgs, engine):  # noqa: F811
    kid = two_orgs["class"]["id"]
    other = org_of(two_orgs["b"])
    with pytest.raises(IntegrityError):
        with engine.begin() as c:
            c.execute(text("""insert into class_members (org_id, class_id, nickname, pin_hash, age_confirmed_at)
                              values (:o, :k, 'Sneaky', 'x', now())"""), {"o": other, "k": kid})


@needs_db
def test_deleting_a_class_removes_its_students_and_results(two_orgs, engine):  # noqa: F811
    a, kid = two_orgs["a"], two_orgs["class"]["id"]
    s1 = two_orgs["student"]
    s1.post("/api/v2/lessons/distances-and-light-time/answers", json={"question": "sun_off", "choice": 1}, headers=H)
    export = a.get(f"/api/v2/classes/{kid}/export").json()
    assert export["students"][0]["nickname"] == "Nova" and "pin_hash" not in str(export)
    assert a.delete(f"/api/v2/classes/{kid}", headers=H).json() == {"ok": True}
    with engine.connect() as c:
        for t in ("classes", "class_members", "assignments", "submissions"):
            assert c.execute(text(f"select count(*) from {t}")).scalar_one() == 0, t  # noqa: S608
    assert s1.get("/api/v2/me/assignments").status_code == 401
