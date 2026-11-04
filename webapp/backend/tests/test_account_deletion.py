"""Deleting a teacher account, and with it a school only they belong to (launch task T19)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

import app as backend
from tests.test_classroom import H, org_of, student, teacher
from tests.test_scan_queue import engine  # noqa: F401
from tests.test_v2 import needs_db

PW = "correct horse battery"


def delete(c, password=PW, school=False):
    return c.post("/api/v2/auth/teacher/delete-account", json={"password": password, "delete_school": school}, headers=H)


def count(engine, sql, **kw):
    with engine.connect() as cx:
        return cx.execute(text(sql), kw).scalar_one()


def org_with_class(t, student_nick="Nova"):
    org = org_of(t)
    k = t.post(f"/api/v2/orgs/{org}/classes", json={"name": "Physics"}, headers=H).json()
    t.post(f"/api/v2/classes/{k['id']}/assignments", json={"kind": "quiz", "ref": "distances-and-light-time"}, headers=H)
    s = student(k["join_code"], student_nick)
    return org, k, s


@needs_db
def test_needs_the_right_password_and_a_signed_in_teacher(engine):  # noqa: F811
    t = teacher("del1@school.example", org="Del School 1")
    assert delete(t, "wrong password!").status_code == 401
    assert t.get("/api/v2/auth/me").json()["me"] is not None  # still there
    with TestClient(backend.app) as anon:
        assert anon.post("/api/v2/auth/teacher/delete-account", json={"password": PW}, headers=H).status_code == 401
    assert t.post("/api/v2/auth/teacher/delete-account", json={"password": PW}).status_code == 403  # CSRF header
    t.__exit__(None, None, None)


@needs_db
def test_the_only_teacher_must_confirm_that_the_school_goes_too(engine):  # noqa: F811
    t = teacher("del2@school.example", org="Del School 2")
    org, k, s = org_with_class(t)
    r = delete(t)
    assert r.status_code == 409 and "Confirm to continue" in r.json()["detail"] and "(1 class, 1 student)" in r.json()["detail"]
    assert count(engine, "select count(*) from class_members where org_id = :o", o=org) == 1  # nothing deleted yet
    r = delete(t, school=True)
    assert r.status_code == 200
    assert r.json() == {"ok": True, "schools_deleted": 1, "classes_deleted": 1, "students_deleted": 1}
    for table in ("organizations where id", "classes where org_id", "class_members where org_id",
                  "assignments where org_id", "memberships where org_id"):
        assert count(engine, f"select count(*) from {table} = :o", o=org) == 0, table
    assert count(engine, "select count(*) from users where lower(email) = 'del2@school.example'") == 0
    assert t.get("/api/v2/auth/me").json()["me"] is None  # signed out
    assert s.get("/api/v2/auth/me").json()["me"] is None  # the student's session is gone too
    t.__exit__(None, None, None)
    s.__exit__(None, None, None)


@needs_db
def test_nothing_about_the_students_survives_in_the_audit_log(engine):  # noqa: F811
    t = teacher("del3@school.example", org="Del School 3")
    org, k, s = org_with_class(t, "Quasar")
    member = t.get(f"/api/v2/classes/{k['id']}").json()["students"][0]["id"]
    assert t.delete(f"/api/v2/classes/{k['id']}/students/{member}", headers=H).status_code == 200
    with engine.connect() as cx:  # before deleting the school, the removal is recorded with the nickname
        assert "Quasar" in cx.execute(text("select string_agg(detail::text, ' ') from audit_log where org_id = :o"), {"o": org}).scalar_one()
    assert delete(t, school=True).status_code == 200
    with engine.connect() as cx:
        rows = cx.execute(text("select action, detail::text from audit_log where org_id = :o"), {"o": org}).all()
    assert [r[0] for r in rows] == ["org.delete"]
    assert "Quasar" not in rows[0][1] and "del3" not in rows[0][1]
    t.__exit__(None, None, None)
    s.__exit__(None, None, None)


@needs_db
def test_a_school_with_other_teachers_survives_and_keeps_its_classes(engine):  # noqa: F811
    a = teacher("del4a@school.example", org="Del School 4")
    org, k, s = org_with_class(a)
    code = a.get(f"/api/v2/orgs/{org}").json()["join_code"]
    b = teacher("del4b@school.example", code=code)
    r = delete(a)  # a is the only admin: must hand over first
    assert r.status_code == 409 and "only admin" in r.json()["detail"]
    b_id = next(x["user_id"] for x in a.get(f"/api/v2/orgs/{org}").json()["teachers"] if x["display_name"] == "del4b")
    assert a.put(f"/api/v2/orgs/{org}/teachers/{b_id}/role", json={"role": "org_admin"}, headers=H).status_code == 200
    r = delete(a)
    assert r.status_code == 200 and r.json()["schools_deleted"] == 0
    assert count(engine, "select count(*) from classes where org_id = :o", o=org) == 1
    assert count(engine, "select count(*) from class_members where org_id = :o", o=org) == 1
    assert count(engine, "select count(*) from classes where org_id = :o and created_by is null", o=org) == 1
    # the class keeps working for the other teacher
    assert b.get(f"/api/v2/classes/{k['id']}").status_code == 200
    for c in (a, b, s):
        c.__exit__(None, None, None)


@needs_db
def test_a_school_with_a_paid_plan_cannot_be_deleted(engine):  # noqa: F811
    t = teacher("del5@school.example", org="Del School 5")
    org = org_of(t)
    with engine.begin() as cx:
        cx.execute(text("""insert into org_plans (org_id, plan, status, stripe_customer, stripe_subscription)
                           values (:o, 'classroom', 'active', 'cus_test', 'sub_test')
                           on conflict (org_id) do update set plan = 'classroom', status = 'active',
                           stripe_subscription = 'sub_test'"""), {"o": org})
    r = delete(t, school=True)
    assert r.status_code == 409 and "paid plan" in r.json()["detail"]
    assert count(engine, "select count(*) from organizations where id = :o", o=org) == 1
    t.__exit__(None, None, None)


@needs_db
def test_reset_and_verification_tokens_and_counters_go_with_the_account(engine):  # noqa: F811
    t = teacher("del6@school.example", org="Del School 6")
    uid = count(engine, "select id from users where lower(email) = 'del6@school.example'")
    with engine.begin() as cx:
        cx.execute(text("insert into password_resets (user_id, token_hash, expires_at) values (:u, 'h1', now() + interval '1 hour')"), {"u": uid})
        cx.execute(text("insert into auth_failures (key) values ('login:email:del6@school.example'), ('forgot:email:del6@school.example')"))
    assert delete(t, school=True).status_code == 200
    assert count(engine, "select count(*) from password_resets where user_id = :u", u=uid) == 0
    assert count(engine, "select count(*) from email_verifications where user_id = :u", u=uid) == 0
    assert count(engine, "select count(*) from auth_failures where key like '%del6@school.example'") == 0
    t.__exit__(None, None, None)


@needs_db
def test_the_address_can_be_used_again_afterwards(engine):  # noqa: F811
    t = teacher("del7@school.example", org="Del School 7")
    assert delete(t, school=True).status_code == 200
    t2 = teacher("del7@school.example", org="Del School 7b")
    assert t2.get("/api/v2/auth/me").json()["me"]["email"] == "del7@school.example"
    t.__exit__(None, None, None)
    t2.__exit__(None, None, None)
