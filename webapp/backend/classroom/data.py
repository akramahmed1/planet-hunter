"""Classroom data access (ADR 0004). Every function takes the Principal and every
query is filtered to the orgs it belongs to; route code never writes classroom SQL.
A row in another org is reported as not found, never as forbidden.
"""
from __future__ import annotations

import datetime as dt
import json
import math

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import IntegrityError

import data_store
from billing import plans
from classroom import security
from classroom.auth import Principal, end_all_sessions


class NotFound(Exception):
    pass


class Forbidden(Exception):
    pass


class Conflict(Exception):
    pass


class Invalid(Exception):
    pass


def _plan_check(fn) -> None:
    """Plan limits apply only while billing is switched on (billing/plans.py)."""
    try:
        fn()
    except plans.OverLimit as exc:
        raise Conflict(str(exc)) from None


def _j(v) -> str:
    return json.dumps(v, separators=(",", ":"), default=str)


def audit(c: Connection, org_id: int, actor_user_id: int | None, action: str, target: str, detail: dict | None = None):
    c.execute(text("""insert into audit_log (org_id, actor_user_id, action, target, detail)
                      values (:o, :a, :act, :t, cast(:d as jsonb))"""),
              {"o": org_id, "a": actor_user_id, "act": action, "t": target, "d": _j(detail or {})})


# ---------- failure counting (sign-in rate limits) ----------

def failures(eng: Engine, key: str, minutes: int) -> int:
    with eng.connect() as c:
        return c.execute(text("select count(*) from auth_failures where key = :k "
                              "and at > now() - make_interval(mins => :m)"), {"k": key, "m": minutes}).scalar_one()


def record_failure(eng: Engine, *keys: str) -> None:
    with eng.begin() as c:
        for k in keys:
            c.execute(text("insert into auth_failures (key) values (:k)"), {"k": k})
        c.execute(text("delete from auth_failures where at < now() - interval '1 day'"))


def clear_failures(eng: Engine, key: str) -> None:
    with eng.begin() as c:
        c.execute(text("delete from auth_failures where key = :k"), {"k": key})


# ---------- teachers and organizations ----------

def _unique_code(c: Connection, table: str) -> str:
    for _ in range(20):
        code = security.new_code()
        if c.execute(text(f"select 1 from {table} where join_code = :c"), {"c": code}).first() is None:  # noqa: S608
            return code
    raise RuntimeError("could not find a free join code")


def create_teacher(eng: Engine, email: str, password: str, display_name: str, org_name: str | None,
                   org_code: str | None) -> int:
    pw_hash = security.hash_secret(password)
    try:
        with eng.begin() as c:
            if org_code is not None:
                org = c.execute(text("select id from organizations where join_code = :c"),
                                {"c": security.normal_code(org_code)}).scalar()
                if org is None:
                    raise Invalid("No school or group has that join code.")
            uid = c.execute(text("""insert into users (email, password_hash, display_name, age_confirmed_at)
                                    values (:e, :h, :n, now()) returning id"""),
                            {"e": email, "h": pw_hash, "n": display_name}).scalar_one()
            if org_code is None:
                org = c.execute(text("insert into organizations (name, join_code) values (:n, :c) returning id"),
                                {"n": org_name, "c": _unique_code(c, "organizations")}).scalar_one()
                role = "org_admin"
            else:
                role = "teacher"
            c.execute(text("insert into memberships (org_id, user_id, role) values (:o, :u, :r)"),
                      {"o": org, "u": uid, "r": role})
            audit(c, org, uid, "membership.create", f"user:{uid}", {"role": role})
            return uid
    except IntegrityError as exc:
        if "uq_users_email" in str(exc.orig):
            raise Conflict("An account with that email already exists. Sign in instead.") from None
        raise


def user_for_login(eng: Engine, email: str) -> tuple[int | None, str | None]:
    with eng.connect() as c:
        r = c.execute(text("select id, password_hash from users where lower(email) = :e"), {"e": email}).first()
    return (r[0], r[1]) if r else (None, None)


# ---------- forgotten passwords (T17) ----------

RESET_MINUTES = 60


def start_password_reset(eng: Engine, email: str) -> tuple[str, str] | None:
    """Make a single use token for this email's account. Returns (token, display_name), or None when there is no
    such account. Any earlier unused token for the account stops working, so only the newest link is live."""
    with eng.begin() as c:
        r = c.execute(text("select id, display_name from users where lower(email) = :e"), {"e": email}).first()
        if r is None:
            return None
        token = security.new_token()
        c.execute(text("delete from password_resets where user_id = :u and used_at is null"), {"u": r[0]})
        c.execute(text("""insert into password_resets (user_id, token_hash, expires_at)
                          values (:u, :h, now() + make_interval(mins => :m))"""),
                  {"u": r[0], "h": security.token_hash(token), "m": RESET_MINUTES})
        c.execute(text("delete from password_resets where expires_at < now() - interval '1 day'"))
        return token, r[1]


def finish_password_reset(eng: Engine, token: str, new_password: str) -> None:
    """Spend the token, set the new password and sign the teacher out everywhere. The token is claimed with one
    UPDATE ... RETURNING, so two requests with the same token cannot both succeed."""
    pw_hash = security.hash_secret(new_password)
    with eng.begin() as c:
        uid = c.execute(text("""update password_resets set used_at = now()
                                where token_hash = :h and used_at is null and expires_at > now()
                                returning user_id"""), {"h": security.token_hash(token)}).scalar()
        if uid is None:
            raise Invalid("That reset link is not valid any more. Ask for a new one.")
        c.execute(text("update users set password_hash = :h where id = :u"), {"h": pw_hash, "u": uid})
        c.execute(text("delete from password_resets where user_id = :u and used_at is null"), {"u": uid})
        end_all_sessions(c, user_id=uid)
        for (org,) in c.execute(text("select org_id from memberships where user_id = :u"), {"u": uid}):
            audit(c, org, uid, "password.reset", f"user:{uid}")


# ---------- email verification (T18) ----------

VERIFY_HOURS = 48


def email_verified(eng: Engine, user_id: int) -> bool:
    with eng.connect() as c:
        return c.execute(text("select email_verified_at is not null from users where id = :u"),
                         {"u": user_id}).scalar() is True


def start_email_verification(eng: Engine, user_id: int) -> tuple[str, str, str] | None:
    """Make a single use token proving this teacher's current address. Returns (token, email, display_name), or
    None if the address is already verified. Earlier unused tokens stop working."""
    with eng.begin() as c:
        r = c.execute(text("select email, display_name, email_verified_at from users where id = :u"),
                      {"u": user_id}).first()
        if r is None or r[2] is not None:
            return None
        token = security.new_token()
        c.execute(text("delete from email_verifications where user_id = :u and used_at is null"), {"u": user_id})
        c.execute(text("""insert into email_verifications (user_id, email, token_hash, expires_at)
                          values (:u, :e, :h, now() + make_interval(hours => :n))"""),
                  {"u": user_id, "e": r[0], "h": security.token_hash(token), "n": VERIFY_HOURS})
        c.execute(text("delete from email_verifications where expires_at < now() - interval '1 day'"))
        return token, r[0], r[1]


def finish_email_verification(eng: Engine, token: str) -> None:
    """Spend the token and mark the address verified, but only if it is still the account's address."""
    with eng.begin() as c:
        row = c.execute(text("""update email_verifications set used_at = now()
                                where token_hash = :h and used_at is null and expires_at > now()
                                returning user_id, email"""), {"h": security.token_hash(token)}).first()
        if row is None:
            raise Invalid("That verification link is not valid any more. Sign in and ask for a new one.")
        done = c.execute(text("""update users set email_verified_at = now()
                                 where id = :u and lower(email) = lower(:e)"""), {"u": row[0], "e": row[1]}).rowcount
        if not done:
            raise Invalid("That verification link is not valid any more. Sign in and ask for a new one.")
        for (org,) in c.execute(text("select org_id from memberships where user_id = :u"), {"u": row[0]}):
            audit(c, org, row[0], "email.verify", f"user:{row[0]}")


# ---------- deleting a teacher account (T19) ----------

def delete_teacher_account(eng: Engine, user_id: int, *, delete_school: bool) -> dict:
    """Erase a teacher. Where they are the only teacher of a school or group, the school, its classes, students,
    assignments and results go too, but only with `delete_school=True` (otherwise Conflict says what would be lost).
    A school with other teachers needs another admin first, and a school with a paid plan must cancel it first.
    Returns counts only. Everything happens in one transaction: it all goes or none of it does."""
    with eng.begin() as c:
        mine = c.execute(text("select org_id, role from memberships where user_id = :u order by org_id for update"),
                         {"u": user_id}).all()
        email = c.execute(text("select email from users where id = :u"), {"u": user_id}).scalar()
        if email is None:
            raise NotFound("no such account")
        sole, summary = [], {"schools_deleted": 0, "students_deleted": 0, "classes_deleted": 0}
        for org, role in mine:
            c.execute(text("select 1 from memberships where org_id = :o for update"), {"o": org})
            others = c.execute(text("select count(*) from memberships where org_id = :o and user_id <> :u"),
                               {"o": org, "u": user_id}).scalar_one()
            if others == 0:
                sole.append(org)
            elif role == "org_admin" and c.execute(text(
                    "select count(*) from memberships where org_id = :o and role = 'org_admin' and user_id <> :u"),
                    {"o": org, "u": user_id}).scalar_one() == 0:
                name = c.execute(text("select name from organizations where id = :o"), {"o": org}).scalar()
                raise Conflict(f"You are the only admin of {name}. Make another teacher an admin first, then delete "
                               "your account.")
        counts = {}
        for org in sole:
            name = c.execute(text("select name from organizations where id = :o"), {"o": org}).scalar()
            paid = c.execute(text("""select 1 from org_plans where org_id = :o and plan <> 'free'
                                     and stripe_subscription is not null and status not in ('canceled', 'incomplete_expired')"""),
                             {"o": org}).first()
            if paid:
                raise Conflict(f"{name} has a paid plan. Cancel the plan first, then delete your account.")
            counts[org] = (name,
                           c.execute(text("select count(*) from class_members where org_id = :o"), {"o": org}).scalar_one(),
                           c.execute(text("select count(*) from classes where org_id = :o"), {"o": org}).scalar_one())
        if counts and not delete_school:
            def many(n: int, one: str, more: str) -> str:
                return f"{n} {one if n == 1 else more}"
            lines = "; ".join(f"{n} ({many(k, 'class', 'classes')}, {many(m, 'student', 'students')})"
                              for n, m, k in counts.values())
            raise Conflict(f"You are the only teacher in {lines}. Deleting your account also deletes that school or "
                           "group with all its classes, students and results. Confirm to continue.")
        for org, (_, students, classes) in counts.items():
            c.execute(text("delete from sessions where member_id in (select id from class_members where org_id = :o)"),
                      {"o": org})
            c.execute(text("delete from organizations where id = :o"), {"o": org})  # cascades to everything in it
            # Nothing about the school's people stays behind: the audit rows (they hold nicknames) go too, leaving
            # one plain record that a deletion happened, with counts only.
            c.execute(text("delete from audit_log where org_id = :o"), {"o": org})
            audit(c, org, None, "org.delete", f"org:{org}", {"students": students, "classes": classes})
            summary["schools_deleted"] += 1
            summary["students_deleted"] += students
            summary["classes_deleted"] += classes
        for org, _role in mine:
            if org not in counts:
                audit(c, org, None, "teacher.delete", f"user:{user_id}")
        # sign-in counters and rate-limit rows that mention this address or account
        c.execute(text("delete from auth_failures where key in (:a, :b, :c)"),
                  {"a": f"login:email:{email.lower()}", "b": f"forgot:email:{email.lower()}",
                   "c": f"verify-resend:user:{user_id}"})
        end_all_sessions(c, user_id=user_id)
        c.execute(text("delete from users where id = :u"), {"u": user_id})  # cascades: memberships, resets, verifications
    return summary


def create_org(eng: Engine, p: Principal, name: str) -> int:
    with eng.begin() as c:
        org = c.execute(text("insert into organizations (name, join_code) values (:n, :c) returning id"),
                        {"n": name, "c": _unique_code(c, "organizations")}).scalar_one()
        c.execute(text("insert into memberships (org_id, user_id, role) values (:o, :u, 'org_admin')"),
                  {"o": org, "u": p.user_id})
        audit(c, org, p.user_id, "membership.create", f"user:{p.user_id}", {"role": "org_admin"})
    return org


def join_org(eng: Engine, p: Principal, code: str) -> int:
    with eng.begin() as c:
        org = c.execute(text("select id from organizations where join_code = :c"),
                        {"c": security.normal_code(code)}).scalar()
        if org is None:
            raise Invalid("No school or group has that join code.")
        if org in p.roles:
            return org
        c.execute(text("insert into memberships (org_id, user_id, role) values (:o, :u, 'teacher')"),
                  {"o": org, "u": p.user_id})
        audit(c, org, p.user_id, "membership.create", f"user:{p.user_id}", {"role": "teacher"})
    return org


def _role(p: Principal, org_id: int) -> str:
    role = p.roles.get(org_id)
    if role is None:
        raise NotFound("no such organization")
    return role


def _admin(p: Principal, org_id: int) -> None:
    if _role(p, org_id) != "org_admin":
        raise Forbidden("only an organization admin can do this")


def org_detail(eng: Engine, p: Principal, org_id: int) -> dict:
    role = _role(p, org_id)
    with eng.connect() as c:
        o = c.execute(text("select id, name, join_code from organizations where id = :o"), {"o": org_id}).mappings().one()
        members = c.execute(text("""select u.id as user_id, u.display_name, m.role from memberships m
                                    join users u on u.id = m.user_id where m.org_id = :o order by u.display_name"""),
                            {"o": org_id}).mappings().all()
    return {"id": o["id"], "name": o["name"], "role": role,
            "join_code": o["join_code"] if role == "org_admin" else None,
            "teachers": [dict(m) for m in members]}


def rotate_org_code(eng: Engine, p: Principal, org_id: int) -> str:
    _admin(p, org_id)
    with eng.begin() as c:
        code = _unique_code(c, "organizations")
        c.execute(text("update organizations set join_code = :c where id = :o"), {"c": code, "o": org_id})
        audit(c, org_id, p.user_id, "org.rotate_code", f"org:{org_id}")
    return code


def set_role(eng: Engine, p: Principal, org_id: int, user_id: int, role: str) -> None:
    _admin(p, org_id)
    with eng.begin() as c:
        c.execute(text("select 1 from memberships where org_id = :o for update"), {"o": org_id})
        cur = c.execute(text("select role from memberships where org_id = :o and user_id = :u"),
                        {"o": org_id, "u": user_id}).scalar()
        if cur is None:
            raise NotFound("no such teacher in this organization")
        if cur == "org_admin" and role != "org_admin":
            admins = c.execute(text("select count(*) from memberships where org_id = :o and role = 'org_admin'"),
                               {"o": org_id}).scalar_one()
            if admins <= 1:
                raise Conflict("An organization needs at least one admin.")
        c.execute(text("update memberships set role = :r where org_id = :o and user_id = :u"),
                  {"r": role, "o": org_id, "u": user_id})
        audit(c, org_id, p.user_id, "membership.role_change", f"user:{user_id}", {"from": cur, "to": role})


# ---------- classes ----------

def list_classes(eng: Engine, p: Principal, org_id: int) -> list[dict]:
    _role(p, org_id)
    with eng.connect() as c:
        rows = c.execute(text("""select k.id, k.org_id, k.name, k.join_code, k.created_at,
                                   (select count(*) from class_members m where m.org_id = k.org_id and m.class_id = k.id)
                                     as students
                                 from classes k where k.org_id = :o order by k.created_at"""),
                         {"o": org_id}).mappings().all()
    return [dict(r) for r in rows]


def create_class(eng: Engine, p: Principal, org_id: int, name: str) -> dict:
    _role(p, org_id)
    with eng.begin() as c:
        _plan_check(lambda: plans.check_new_class(c, org_id))
        row = c.execute(text("""insert into classes (org_id, name, join_code, created_by)
                                values (:o, :n, :c, :u) returning id, org_id, name, join_code, created_at"""),
                        {"o": org_id, "n": name, "c": _unique_code(c, "classes"), "u": p.user_id}).mappings().one()
    return {**dict(row), "students": 0}


def _class(c: Connection, p: Principal, class_id: int) -> dict:
    """The class, if it is in one of the teacher's orgs. The only way route code reaches a class."""
    row = c.execute(text("select id, org_id, name, join_code, created_at from classes "
                         "where id = :k and org_id = any(:orgs)"), {"k": class_id, "orgs": p.orgs()}).mappings().first()
    if row is None:
        raise NotFound("no such class")
    return dict(row)


def class_detail(eng: Engine, p: Principal, class_id: int) -> dict:
    with eng.connect() as c:
        k = _class(c, p, class_id)
        members = c.execute(text("""select id, nickname, created_at from class_members
                                    where org_id = :o and class_id = :k order by lower(nickname)"""),
                            {"o": k["org_id"], "k": class_id}).mappings().all()
        assignments = _assignments(c, k["org_id"], class_id)
    return {**k, "students": [dict(m) for m in members], "assignments": assignments}


def rotate_class_code(eng: Engine, p: Principal, class_id: int) -> str:
    with eng.begin() as c:
        k = _class(c, p, class_id)
        code = _unique_code(c, "classes")
        c.execute(text("update classes set join_code = :c where id = :k and org_id = :o"),
                  {"c": code, "k": class_id, "o": k["org_id"]})
        audit(c, k["org_id"], p.user_id, "class.rotate_code", f"class:{class_id}")
    return code


def delete_class(eng: Engine, p: Principal, class_id: int) -> None:
    with eng.begin() as c:
        k = _class(c, p, class_id)
        n = c.execute(text("select count(*) from class_members where org_id = :o and class_id = :k"),
                      {"o": k["org_id"], "k": class_id}).scalar_one()
        c.execute(text("delete from sessions where member_id in (select id from class_members "
                       "where org_id = :o and class_id = :k)"), {"o": k["org_id"], "k": class_id})
        c.execute(text("delete from classes where id = :k and org_id = :o"), {"k": class_id, "o": k["org_id"]})
        audit(c, k["org_id"], p.user_id, "class.delete", f"class:{class_id}", {"name": k["name"], "students": n})


def export_class(eng: Engine, p: Principal, class_id: int) -> dict:
    """Everything stored about a class and its students."""
    with eng.begin() as c:
        k = _class(c, p, class_id)
        members = c.execute(text("""select id, nickname, created_at, age_confirmed_at from class_members
                                    where org_id = :o and class_id = :k order by id"""),
                            {"o": k["org_id"], "k": class_id}).mappings().all()
        subs = c.execute(text("""select s.assignment_id, s.member_id, s.score, s.max_score, s.detail, s.completed_at,
                                        s.updated_at
                                 from submissions s join assignments a on a.org_id = s.org_id and a.id = s.assignment_id
                                 where s.org_id = :o and a.class_id = :k order by s.id"""),
                         {"o": k["org_id"], "k": class_id}).mappings().all()
        out = {"class": {kk: k[kk] for kk in ("id", "name", "created_at")},
               "students": [dict(m) for m in members],
               "assignments": _assignments(c, k["org_id"], class_id),
               "submissions": [dict(s) for s in subs],
               "stored_about_students": "nickname, PIN hash (not exported), when they joined, when they "
                                        "confirmed being 13 or older, and their assignment results"}
        audit(c, k["org_id"], p.user_id, "class.export", f"class:{class_id}")
    return out


# ---------- students ----------

def class_by_code(c: Connection, code: str) -> dict | None:
    r = c.execute(text("select id, org_id, name from classes where join_code = :c"),
                  {"c": security.normal_code(code)}).mappings().first()
    return dict(r) if r else None


def student_join(eng: Engine, code: str, nickname: str, pin: str) -> int:
    pin_hash = security.hash_secret(pin)
    try:
        with eng.begin() as c:
            k = class_by_code(c, code)
            if k is None:
                raise Invalid("No class has that code. Check it with your teacher.")
            _plan_check(lambda: plans.check_new_student(c, k["org_id"], k["id"]))
            return c.execute(text("""insert into class_members (org_id, class_id, nickname, pin_hash, age_confirmed_at)
                                     values (:o, :k, :n, :h, now()) returning id"""),
                             {"o": k["org_id"], "k": k["id"], "n": nickname, "h": pin_hash}).scalar_one()
    except IntegrityError as exc:
        if "uq_class_members_nickname" in str(exc.orig):
            raise Conflict("That nickname is taken in this class. If it is yours, sign in instead.") from None
        raise


def student_for_login(eng: Engine, code: str, nickname: str) -> tuple[int | None, str | None]:
    with eng.connect() as c:
        k = class_by_code(c, code)
        if k is None:
            return None, None
        r = c.execute(text("select id, pin_hash from class_members where org_id = :o and class_id = :k "
                           "and lower(nickname) = lower(:n)"), {"o": k["org_id"], "k": k["id"], "n": nickname}).first()
    return (r[0], r[1]) if r else (None, None)


def _member(c: Connection, k: dict, member_id: int) -> dict:
    m = c.execute(text("select id, nickname from class_members where id = :m and org_id = :o and class_id = :k"),
                  {"m": member_id, "o": k["org_id"], "k": k["id"]}).mappings().first()
    if m is None:
        raise NotFound("no such student in this class")
    return dict(m)


def reset_pin(eng: Engine, p: Principal, class_id: int, member_id: int, pin: str) -> None:
    pin_hash = security.hash_secret(pin)
    with eng.begin() as c:
        k = _class(c, p, class_id)
        m = _member(c, k, member_id)
        c.execute(text("update class_members set pin_hash = :h where id = :m and org_id = :o"),
                  {"h": pin_hash, "m": member_id, "o": k["org_id"]})
        end_all_sessions(c, member_id=member_id)
        c.execute(text("delete from auth_failures where key = :k"), {"k": f"pin:member:{member_id}"})
        audit(c, k["org_id"], p.user_id, "member.pin_reset", f"member:{member_id}", {"nickname": m["nickname"]})


def remove_member(eng: Engine, p: Principal, class_id: int, member_id: int) -> None:
    with eng.begin() as c:
        k = _class(c, p, class_id)
        m = _member(c, k, member_id)
        end_all_sessions(c, member_id=member_id)
        c.execute(text("delete from class_members where id = :m and org_id = :o"), {"m": member_id, "o": k["org_id"]})
        audit(c, k["org_id"], p.user_id, "member.delete", f"member:{member_id}", {"nickname": m["nickname"]})


# ---------- assignments and grades ----------

def _lesson_info(c: Connection, slug: str) -> dict | None:
    r = c.execute(text("""select l.title, (select count(*) from questions q join quizzes z on z.id = q.quiz_id
                                           where z.lesson_id = l.id and q.active) as questions
                          from lessons l where l.slug = :s and l.active"""), {"s": slug}).mappings().first()
    return dict(r) if r else None


def _candidate(slug: str):
    return next((x for x in data_store.results().candidates if x.slug == slug), None)


def _assignments(c: Connection, org_id: int, class_id: int) -> list[dict]:
    rows = c.execute(text("""select id, kind, ref, title, due_at, created_at from assignments
                             where org_id = :o and class_id = :k order by coalesce(due_at, created_at), id"""),
                     {"o": org_id, "k": class_id}).mappings().all()
    return [dict(r) for r in rows]


def create_assignment(eng: Engine, p: Principal, class_id: int, kind: str, ref: str,
                      due_at: dt.datetime | None) -> dict:
    with eng.begin() as c:
        k = _class(c, p, class_id)
        if kind in ("lesson", "quiz"):
            info = _lesson_info(c, ref)
            if info is None:
                raise Invalid(f"No lesson called {ref}.")
            title = f"{'Lesson' if kind == 'lesson' else 'Quiz'}: {info['title']}"
        else:
            cand = _candidate(ref)
            if cand is None:
                raise Invalid(f"No candidate called {ref}.")
            title = f"Hunt challenge: find the period of {cand.target}"
        row = c.execute(text("""insert into assignments (org_id, class_id, kind, ref, title, due_at, created_by)
                                values (:o, :k, :kind, :ref, :t, :due, :u)
                                returning id, kind, ref, title, due_at, created_at"""),
                        {"o": k["org_id"], "k": class_id, "kind": kind, "ref": ref, "t": title, "due": due_at,
                         "u": p.user_id}).mappings().one()
    return dict(row)


def delete_assignment(eng: Engine, p: Principal, assignment_id: int) -> None:
    with eng.begin() as c:
        a = c.execute(text("select id, org_id, class_id, title from assignments where id = :a and org_id = any(:orgs)"),
                      {"a": assignment_id, "orgs": p.orgs()}).mappings().first()
        if a is None:
            raise NotFound("no such assignment")
        c.execute(text("delete from assignments where id = :a and org_id = :o"), {"a": assignment_id, "o": a["org_id"]})
        audit(c, a["org_id"], p.user_id, "assignment.delete", f"assignment:{assignment_id}", {"title": a["title"]})


def gradebook(eng: Engine, p: Principal, class_id: int, *, export: bool = False) -> dict:
    with eng.begin() as c:
        k = _class(c, p, class_id)
        assignments = _assignments(c, k["org_id"], class_id)
        members = c.execute(text("select id, nickname from class_members where org_id = :o and class_id = :k "
                                 "order by lower(nickname)"), {"o": k["org_id"], "k": class_id}).mappings().all()
        subs = c.execute(text("""select s.assignment_id, s.member_id, s.score, s.max_score, s.completed_at
                                 from submissions s join assignments a on a.org_id = s.org_id and a.id = s.assignment_id
                                 where s.org_id = :o and a.class_id = :k"""),
                         {"o": k["org_id"], "k": class_id}).mappings().all()
        if export:
            audit(c, k["org_id"], p.user_id, "gradebook.export", f"class:{class_id}")
    by = {(s["assignment_id"], s["member_id"]): s for s in subs}
    due = {a["id"]: a["due_at"] for a in assignments}
    rows = []
    for m in members:
        cells = []
        for a in assignments:
            s = by.get((a["id"], m["id"]))
            late = bool(s and s["completed_at"] and due[a["id"]] and s["completed_at"] > due[a["id"]])
            cells.append(None if s is None else {"score": s["score"], "max_score": s["max_score"],
                                                 "completed_at": s["completed_at"], "late": late})
        rows.append({"member_id": m["id"], "nickname": m["nickname"], "cells": cells})
    return {"class": {"id": k["id"], "name": k["name"]}, "assignments": assignments, "rows": rows}


def student_assignments(eng: Engine, p: Principal) -> dict:
    with eng.connect() as c:
        k = c.execute(text("select id, name from classes where id = :k and org_id = :o"),
                      {"k": p.class_id, "o": p.org_id}).mappings().one()
        assignments = _assignments(c, p.org_id, p.class_id)
        subs = {r["assignment_id"]: {k: r[k] for k in ("score", "max_score", "completed_at")}
                for r in c.execute(text("select assignment_id, score, max_score, completed_at from submissions "
                                        "where org_id = :o and member_id = :m"),
                                   {"o": p.org_id, "m": p.member_id}).mappings()}
    return {"class": dict(k), "nickname": p.nickname,
            "assignments": [{**a, "result": subs.get(a["id"])} for a in assignments]}


def record_lesson_answer(eng: Engine, p: Principal, slug: str, key: str, correct: bool) -> None:
    """Count a student's quiz answer toward their lesson and quiz assignments for that lesson.

    The score is the number of questions right on the first try; the assignment is complete
    once every question has been answered right (retries count for completion, not score).
    """
    with eng.begin() as c:
        info = _lesson_info(c, slug)
        if info is None:
            return
        ids = [r[0] for r in c.execute(text("""select id from assignments where org_id = :o and class_id = :k
                                              and ref = :s and kind in ('lesson', 'quiz')"""),
                                      {"o": p.org_id, "k": p.class_id, "s": slug})]
        for aid in ids:
            row = c.execute(text("""select detail from submissions where org_id = :o and assignment_id = :a
                                    and member_id = :m for update"""),
                            {"o": p.org_id, "a": aid, "m": p.member_id}).first()
            detail = dict(row[0]) if row else {}
            qs = dict(detail.get("questions", {}))
            prev = qs.get(key)
            if prev is None:
                qs[key] = {"first": correct, "correct": correct, "tries": 1}
            elif not prev["correct"]:
                qs[key] = {**prev, "correct": correct, "tries": prev["tries"] + 1}
            else:
                continue
            score = sum(1 for q in qs.values() if q["first"])
            done = sum(1 for q in qs.values() if q["correct"]) >= info["questions"]
            c.execute(text("""
                insert into submissions (org_id, assignment_id, member_id, score, max_score, detail, completed_at,
                                         updated_at)
                values (:o, :a, :m, :sc, :mx, cast(:d as jsonb), case when :done then now() end, now())
                on conflict (assignment_id, member_id) do update set score = excluded.score,
                  max_score = excluded.max_score, detail = excluded.detail, updated_at = now(),
                  completed_at = coalesce(submissions.completed_at, excluded.completed_at)"""),
                {"o": p.org_id, "a": aid, "m": p.member_id, "sc": score, "mx": info["questions"],
                 "d": _j({"questions": qs}), "done": done})


HARMONICS = ((2.0, "twice"), (0.5, "half"), (3.0, "three times"), (1 / 3, "a third of"))


def score_guess(guess: float, answer: float) -> dict:
    """Same scoring as the hunt lab (frontend lib/hunt.ts scoreGuess), so a grade matches what the student saw."""
    rel = abs(guess - answer) / answer
    points = 100 if rel <= 0.001 else 0 if rel >= 0.1 else round(100 * math.log10(0.1 / rel) / 2)
    if rel <= 0.001:
        return {"points": points, "verdict": "exact"}
    if rel <= 0.02:
        return {"points": points, "verdict": "close"}
    for k, name in HARMONICS:
        if abs(guess - answer * k) / (answer * k) <= 0.01:
            return {"points": 0, "verdict": "harmonic", "harmonic": name}
    return {"points": points, "verdict": "off"}


def submit_hunt(eng: Engine, p: Principal, assignment_id: int, period_d: float) -> dict:
    with eng.begin() as c:
        a = c.execute(text("""select id, ref from assignments where id = :a and org_id = :o and class_id = :k
                              and kind = 'hunt'"""), {"a": assignment_id, "o": p.org_id, "k": p.class_id}).mappings().first()
        if a is None:
            raise NotFound("no such hunt challenge in your class")
        cand = _candidate(a["ref"])
        if cand is None:
            raise NotFound("this challenge's candidate is no longer listed")
        result = score_guess(period_d, cand.period_d)
        prev = c.execute(text("select score, detail from submissions where org_id = :o and assignment_id = :a "
                              "and member_id = :m for update"),
                         {"o": p.org_id, "a": assignment_id, "m": p.member_id}).first()
        best = max(result["points"], prev[0] if prev else 0)
        tries = (prev[1].get("tries", 0) if prev else 0) + 1
        c.execute(text("""
            insert into submissions (org_id, assignment_id, member_id, score, max_score, detail, completed_at, updated_at)
            values (:o, :a, :m, :s, 100, cast(:d as jsonb), now(), now())
            on conflict (assignment_id, member_id) do update set score = excluded.score, detail = excluded.detail,
              updated_at = now()"""),
            {"o": p.org_id, "a": assignment_id, "m": p.member_id, "s": best,
             "d": _j({"tries": tries, "last_guess_d": period_d, "last_verdict": result["verdict"]})})
    return {**result, "best": best}
