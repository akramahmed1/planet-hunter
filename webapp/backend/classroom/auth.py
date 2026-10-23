"""Who is calling: the one dependency every classroom endpoint uses (ADR 0004).

`Auth("org_admin", "teacher")` resolves the session cookie into a Principal and checks
its kind. Org and class scoping then happen in classroom/data.py, which takes the
Principal and adds the org filter to every query.

Sessions are a random token in an HttpOnly cookie, stored server-side as a hash. The
browser reaches the API through the frontend's same-origin /api/v2 rewrite, so the
cookie is first-party. Requests that change something must also carry the
X-PH-CSRF header, which a cross-site form cannot send.
"""
from __future__ import annotations

import datetime as dt
import os
from dataclasses import dataclass, field

from fastapi import HTTPException, Request, Response
from sqlalchemy import text
from sqlalchemy.engine import Engine

import db
from classroom import flags, security

COOKIE = "ph_session"
AGE_BLOCK_COOKIE = "ph_age_block"
CSRF_HEADER = "x-ph-csrf"
UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


@dataclass(frozen=True)
class Principal:
    kind: str  # "teacher" or "student"
    session_id: int
    user_id: int | None = None
    display_name: str | None = None
    email: str | None = None
    # teacher: org_id -> role ("org_admin" or "teacher")
    roles: dict[int, str] = field(default_factory=dict)
    # student
    member_id: int | None = None
    org_id: int | None = None
    class_id: int | None = None
    nickname: str | None = None

    def orgs(self, *roles: str) -> list[int]:
        """Orgs where this teacher holds one of `roles` (any role when none given)."""
        return [o for o, r in self.roles.items() if not roles or r in roles]


def engine() -> Engine:
    eng = db.engine()
    if eng is None:
        raise HTTPException(503, "accounts need the database, which is not configured here")
    return eng


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() or (request.client.host if request.client else "unknown")


def check_csrf(request: Request) -> None:
    if request.method in UNSAFE and request.headers.get(CSRF_HEADER) != "1":
        raise HTTPException(403, "missing the X-PH-CSRF header")


def _secure(request: Request) -> bool:
    setting = os.environ.get("SESSION_COOKIE_SECURE", "auto")
    if setting in ("0", "1"):
        return setting == "1"
    return request.headers.get("x-forwarded-proto", request.url.scheme) == "https"


def start_session(eng: Engine, request: Request, response: Response, *, user_id: int | None = None,
                  member_id: int | None = None) -> None:
    token = security.new_token()
    with eng.begin() as c:
        c.execute(text("""insert into sessions (token_hash, user_id, member_id, expires_at)
                          values (:h, :u, :m, now() + make_interval(days => :d))"""),
                  {"h": security.token_hash(token), "u": user_id, "m": member_id, "d": security.SESSION_DAYS})
    response.set_cookie(COOKIE, token, max_age=security.SESSION_DAYS * 86400, httponly=True,
                        secure=_secure(request), samesite="lax", path="/")


def end_session(eng: Engine, request: Request, response: Response) -> None:
    token = request.cookies.get(COOKIE)
    if token:
        with eng.begin() as c:
            c.execute(text("delete from sessions where token_hash = :h"), {"h": security.token_hash(token)})
    response.delete_cookie(COOKIE, path="/")


def end_all_sessions(c, *, user_id: int | None = None, member_id: int | None = None) -> None:
    """Sign a person out everywhere (after a PIN reset or removal). `c` is an open transaction."""
    c.execute(text("delete from sessions where user_id = :u or member_id = :m"), {"u": user_id, "m": member_id})


def load(eng: Engine, token: str) -> Principal | None:
    with eng.connect() as c:
        s = c.execute(text("""select id, user_id, member_id from sessions
                              where token_hash = :h and expires_at > now()"""),
                      {"h": security.token_hash(token)}).mappings().first()
        if s is None:
            return None
        if s["user_id"] is not None:
            u = c.execute(text("select id, email, display_name from users where id = :u"),
                          {"u": s["user_id"]}).mappings().first()
            if u is None:
                return None
            roles = dict(c.execute(text("select org_id, role from memberships where user_id = :u"),
                                   {"u": u["id"]}).all())
            return Principal(kind="teacher", session_id=s["id"], user_id=u["id"], email=u["email"],
                             display_name=u["display_name"], roles=roles)
        m = c.execute(text("select id, org_id, class_id, nickname from class_members where id = :m"),
                      {"m": s["member_id"]}).mappings().first()
        if m is None:
            return None
        return Principal(kind="student", session_id=s["id"], member_id=m["id"], org_id=m["org_id"],
                         class_id=m["class_id"], nickname=m["nickname"])


def optional_principal(request: Request) -> Principal | None:
    """The caller if signed in, else None. For public endpoints that do more for students."""
    token = request.cookies.get(COOKIE)
    eng = db.engine()
    if not token or eng is None or not flags.classroom_enabled():
        return None
    p = load(eng, token)
    if p is not None:
        check_csrf(request)
    return p


class Auth:
    """Dependency: the signed-in caller, limited to the given kinds ("teacher", "student")."""

    def __init__(self, *kinds: str):
        assert kinds and set(kinds) <= {"teacher", "student"}
        self.kinds = kinds

    def __call__(self, request: Request) -> Principal:
        flags.require_classroom()
        token = request.cookies.get(COOKIE)
        if not token:
            raise HTTPException(401, "sign in first")
        p = load(engine(), token)
        if p is None:
            raise HTTPException(401, "your session has ended; sign in again")
        check_csrf(request)
        if p.kind not in self.kinds:
            raise HTTPException(403, f"this needs a {' or '.join(self.kinds)} account")
        return p


TEACHER = Auth("teacher")
STUDENT = Auth("student")
ANYONE = Auth("teacher", "student")


def now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)
