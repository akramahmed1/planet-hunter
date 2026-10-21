"""Phase 8: teacher and student accounts, organizations, classes, assignments, grades.

Every route below takes the caller from classroom.auth (Auth / TEACHER / STUDENT) and
reaches data only through classroom.data, which scopes every query to the caller's
orgs (ADR 0004). tests/test_classroom.py checks that every classroom route declares it.
"""
from __future__ import annotations

import csv
import datetime as dt
import io
import os
from contextlib import contextmanager
from dataclasses import replace

from fastapi import APIRouter, Depends, HTTPException, Path, Request, Response
from fastapi.responses import JSONResponse

from api_v2 import schemas as s
from classroom import auth, data, flags, security
from classroom.auth import STUDENT, TEACHER, Principal

router = APIRouter(prefix="/api/v2", tags=["v2"], dependencies=[Depends(flags.require_classroom)])


def ID():
    """A fresh Path parameter each time: FastAPI binds one Path object to one parameter name."""
    return Path(..., ge=1, le=2**62)


NO_STORE = {"Cache-Control": "no-store"}
# Sign-ups per IP per hour. The test environments raise it, since every browser test there
# comes from one address.
SIGNUPS_PER_HOUR = int(os.environ.get("AUTH_SIGNUPS_PER_HOUR", "10"))
AGE_MESSAGE = ("Planet Hunter accounts are for people aged 13 and up. You can still explore everything on the "
               "site without an account.")


@contextmanager
def _errors():
    try:
        yield
    except data.NotFound as exc:
        raise HTTPException(404, str(exc))
    except data.Forbidden as exc:
        raise HTTPException(403, str(exc))
    except data.Conflict as exc:
        raise HTTPException(409, str(exc))
    except data.Invalid as exc:
        raise HTTPException(422, str(exc))


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


def _check_age(request: Request, response: Response, body: s.BirthMonth) -> None:
    """Under 13 is blocked, and the same browser cannot simply retry with another answer (ADR 0005)."""
    if request.cookies.get(auth.AGE_BLOCK_COOKIE) or not security.is_13_or_older(body.birth_year, body.birth_month):
        raise HTTPException(403, AGE_MESSAGE, headers={
            "Set-Cookie": f"{auth.AGE_BLOCK_COOKIE}=1; Path=/; HttpOnly; SameSite=Lax"
                          f"{'; Secure' if auth._secure(request) else ''}"})


def _limit(eng, key: str, limit: int, minutes: int, message: str) -> None:
    if data.failures(eng, key, minutes) >= limit:
        raise HTTPException(429, message, headers={"Retry-After": str(minutes * 60)})


# ---------- sign in and out ----------

@router.post("/auth/teacher/signup", response_model=s.Ok, status_code=201)
def teacher_signup(body: s.TeacherSignup, request: Request, response: Response) -> s.Ok:
    """Create a teacher account and either a new organization or a place in an existing one."""
    auth.check_csrf(request)
    eng = auth.engine()
    _no_store(response)
    ip = security.requester_key(auth.client_ip(request))
    _limit(eng, f"signup:ip:{ip}", SIGNUPS_PER_HOUR, 60, "Too many sign-ups from here. Try again in an hour.")
    _check_age(request, response, body)
    email = security.normal_email(body.email)
    if email is None:
        raise HTTPException(422, "That does not look like an email address.")
    problem = security.password_problem(body.password)
    if problem:
        raise HTTPException(422, problem)
    if (body.org_name is None) == (body.org_code is None):
        raise HTTPException(422, "Either name a new school or group, or give the join code of an existing one.")
    data.record_failure(eng, f"signup:ip:{ip}")  # counts attempts, not only failures
    with _errors():
        uid = data.create_teacher(eng, email, body.password, body.display_name.strip(), body.org_name, body.org_code)
    auth.start_session(eng, request, response, user_id=uid)
    return s.Ok(ok=True)


@router.post("/auth/teacher/login", response_model=s.Ok)
def teacher_login(body: s.TeacherLogin, request: Request, response: Response) -> s.Ok:
    auth.check_csrf(request)
    eng = auth.engine()
    _no_store(response)
    email = security.normal_email(body.email) or body.email.strip().lower()
    ip = security.requester_key(auth.client_ip(request))
    _limit(eng, f"login:email:{email}", 10, 15, "Too many tries for this account. Wait 15 minutes.")
    _limit(eng, f"login:ip:{ip}", 30, 15, "Too many sign-in tries from here. Wait 15 minutes.")
    uid, pw_hash = data.user_for_login(eng, email)
    if not security.verify_secret(pw_hash, body.password):
        data.record_failure(eng, f"login:email:{email}", f"login:ip:{ip}")
        raise HTTPException(401, "That email and password do not match an account.")
    data.clear_failures(eng, f"login:email:{email}")
    auth.start_session(eng, request, response, user_id=uid)
    return s.Ok(ok=True)


@router.post("/auth/student/join", response_model=s.Ok, status_code=201)
def student_join(body: s.StudentJoin, request: Request, response: Response) -> s.Ok:
    """Join a class with its code, a nickname and a PIN. No email and no real name."""
    auth.check_csrf(request)
    eng = auth.engine()
    _no_store(response)
    ip = security.requester_key(auth.client_ip(request))
    _limit(eng, f"join:ip:{ip}", 60, 60, "Too many tries from here. Try again in an hour.")
    _check_age(request, response, body)
    nickname = body.nickname.strip()
    if not security.NICKNAME_RE.match(nickname):
        raise HTTPException(422, "Use 1 to 24 letters or numbers for your nickname (spaces, dots and dashes are "
                                 "fine in the middle). Do not use your real name.")
    if not security.PIN_RE.match(body.pin):
        raise HTTPException(422, "Your PIN must be 4 to 8 digits.")
    data.record_failure(eng, f"join:ip:{ip}")
    with _errors():
        mid = data.student_join(eng, body.class_code, nickname, body.pin)
    auth.start_session(eng, request, response, member_id=mid)
    return s.Ok(ok=True)


@router.post("/auth/student/login", response_model=s.Ok)
def student_login(body: s.StudentLogin, request: Request, response: Response) -> s.Ok:
    auth.check_csrf(request)
    eng = auth.engine()
    _no_store(response)
    ip = security.requester_key(auth.client_ip(request))
    _limit(eng, f"pin:ip:{ip}", 30, 15, "Too many sign-in tries from here. Wait 15 minutes.")
    mid, pin_hash = data.student_for_login(eng, body.class_code, body.nickname.strip())
    if mid is not None:
        _limit(eng, f"pin:member:{mid}", 5, 15, "Too many wrong PINs. Wait 15 minutes, or ask your teacher to "
                                                 "reset your PIN.")
    if not security.verify_secret(pin_hash, body.pin):
        data.record_failure(eng, f"pin:ip:{ip}", *([f"pin:member:{mid}"] if mid else []))
        raise HTTPException(401, "That class code, nickname and PIN do not match.")
    data.clear_failures(eng, f"pin:member:{mid}")
    auth.start_session(eng, request, response, member_id=mid)
    return s.Ok(ok=True)


@router.post("/auth/logout", response_model=s.Ok)
def logout(request: Request, response: Response) -> s.Ok:
    auth.check_csrf(request)
    _no_store(response)
    auth.end_session(auth.engine(), request, response)
    return s.Ok(ok=True)


@router.get("/auth/me", response_model=s.Me)
def me(request: Request, response: Response) -> s.Me:
    """Who is signed in on this browser, or null."""
    _no_store(response)
    p = auth.optional_principal(request)
    if p is None:
        return s.Me(me=None)
    eng = auth.engine()
    if p.kind == "teacher":
        orgs = [s.OrgRole(org_id=o, name=data.org_detail(eng, p, o)["name"], role=r) for o, r in sorted(p.roles.items())]
        return s.Me(me=s.MeTeacher(kind="teacher", display_name=p.display_name, email=p.email, orgs=orgs))
    home = data.student_assignments(eng, p)
    return s.Me(me=s.MeStudent(kind="student", nickname=p.nickname, class_id=p.class_id,
                               class_name=home["class"]["name"]))


# ---------- organizations (teachers) ----------

@router.post("/orgs", response_model=s.OrgDetail, status_code=201)
def create_org(body: s.OrgCreate, response: Response, p: Principal = Depends(TEACHER)) -> s.OrgDetail:
    _no_store(response)
    eng = auth.engine()
    org = data.create_org(eng, p, body.name.strip())
    return s.OrgDetail(**data.org_detail(eng, _with_role(p, org, "org_admin"), org))


@router.post("/orgs/join", response_model=s.OrgDetail)
def join_org(body: s.OrgJoin, response: Response, p: Principal = Depends(TEACHER)) -> s.OrgDetail:
    _no_store(response)
    eng = auth.engine()
    with _errors():
        org = data.join_org(eng, p, body.code)
    return s.OrgDetail(**data.org_detail(eng, _with_role(p, org, p.roles.get(org, "teacher")), org))


@router.get("/orgs/{org_id}", response_model=s.OrgDetail)
def get_org(response: Response, org_id: int = ID(), p: Principal = Depends(TEACHER)) -> s.OrgDetail:
    _no_store(response)
    with _errors():
        return s.OrgDetail(**data.org_detail(auth.engine(), p, org_id))


@router.post("/orgs/{org_id}/join-code", response_model=s.JoinCode)
def rotate_org_code(response: Response, org_id: int = ID(), p: Principal = Depends(TEACHER)) -> s.JoinCode:
    _no_store(response)
    with _errors():
        return s.JoinCode(join_code=data.rotate_org_code(auth.engine(), p, org_id))


@router.put("/orgs/{org_id}/teachers/{user_id}/role", response_model=s.Ok)
def change_role(body: s.RoleChange, response: Response, org_id: int = ID(), user_id: int = ID(),
                p: Principal = Depends(TEACHER)) -> s.Ok:
    _no_store(response)
    with _errors():
        data.set_role(auth.engine(), p, org_id, user_id, body.role)
    return s.Ok(ok=True)


# ---------- classes (teachers) ----------

@router.get("/orgs/{org_id}/classes", response_model=s.ClassList)
def list_classes(response: Response, org_id: int = ID(), p: Principal = Depends(TEACHER)) -> s.ClassList:
    _no_store(response)
    with _errors():
        return s.ClassList(classes=data.list_classes(auth.engine(), p, org_id))


@router.post("/orgs/{org_id}/classes", response_model=s.ClassSummary, status_code=201)
def create_class(body: s.ClassCreate, response: Response, org_id: int = ID(),
                 p: Principal = Depends(TEACHER)) -> s.ClassSummary:
    _no_store(response)
    with _errors():
        return s.ClassSummary(**data.create_class(auth.engine(), p, org_id, body.name.strip()))


@router.get("/classes/{class_id}", response_model=s.ClassDetail)
def get_class(response: Response, class_id: int = ID(), p: Principal = Depends(TEACHER)) -> s.ClassDetail:
    _no_store(response)
    with _errors():
        return s.ClassDetail(**data.class_detail(auth.engine(), p, class_id))


@router.post("/classes/{class_id}/join-code", response_model=s.JoinCode)
def rotate_class_code(response: Response, class_id: int = ID(), p: Principal = Depends(TEACHER)) -> s.JoinCode:
    _no_store(response)
    with _errors():
        return s.JoinCode(join_code=data.rotate_class_code(auth.engine(), p, class_id))


@router.delete("/classes/{class_id}", response_model=s.Ok)
def delete_class(response: Response, class_id: int = ID(), p: Principal = Depends(TEACHER)) -> s.Ok:
    """Delete a class and everything stored about its students."""
    _no_store(response)
    with _errors():
        data.delete_class(auth.engine(), p, class_id)
    return s.Ok(ok=True)


@router.get("/classes/{class_id}/export")
def export_class(class_id: int = ID(), p: Principal = Depends(TEACHER)) -> JSONResponse:
    """Everything stored about a class and its students, as JSON."""
    with _errors():
        out = data.export_class(auth.engine(), p, class_id)
    return JSONResponse(json_safe(out), headers={**NO_STORE,
                        "Content-Disposition": f'attachment; filename="class-{class_id}-export.json"'})


@router.put("/classes/{class_id}/students/{member_id}/pin", response_model=s.Ok)
def reset_pin(body: s.PinReset, response: Response, class_id: int = ID(), member_id: int = ID(),
              p: Principal = Depends(TEACHER)) -> s.Ok:
    _no_store(response)
    if not security.PIN_RE.match(body.pin):
        raise HTTPException(422, "A PIN must be 4 to 8 digits.")
    with _errors():
        data.reset_pin(auth.engine(), p, class_id, member_id, body.pin)
    return s.Ok(ok=True)


@router.delete("/classes/{class_id}/students/{member_id}", response_model=s.Ok)
def remove_student(response: Response, class_id: int = ID(), member_id: int = ID(),
                   p: Principal = Depends(TEACHER)) -> s.Ok:
    _no_store(response)
    with _errors():
        data.remove_member(auth.engine(), p, class_id, member_id)
    return s.Ok(ok=True)


@router.post("/classes/{class_id}/assignments", response_model=s.Assignment, status_code=201)
def create_assignment(body: s.AssignmentCreate, response: Response, class_id: int = ID(),
                      p: Principal = Depends(TEACHER)) -> s.Assignment:
    _no_store(response)
    with _errors():
        return s.Assignment(**data.create_assignment(auth.engine(), p, class_id, body.kind, body.ref, body.due_at))


@router.delete("/assignments/{assignment_id}", response_model=s.Ok)
def delete_assignment(response: Response, assignment_id: int = ID(), p: Principal = Depends(TEACHER)) -> s.Ok:
    _no_store(response)
    with _errors():
        data.delete_assignment(auth.engine(), p, assignment_id)
    return s.Ok(ok=True)


@router.get("/classes/{class_id}/gradebook", response_model=s.Gradebook, response_model_by_alias=True)
def gradebook(response: Response, class_id: int = ID(), p: Principal = Depends(TEACHER)) -> s.Gradebook:
    _no_store(response)
    with _errors():
        return s.Gradebook.model_validate(data.gradebook(auth.engine(), p, class_id))


@router.get("/classes/{class_id}/gradebook.csv")
def gradebook_csv(class_id: int = ID(), p: Principal = Depends(TEACHER)) -> Response:
    with _errors():
        g = data.gradebook(auth.engine(), p, class_id, export=True)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Nickname", *(f"{a['title']} (out of {_max(g, i)})" for i, a in enumerate(g["assignments"]))])
    for r in g["rows"]:
        w.writerow([_safe_cell(r["nickname"]), *("" if c is None else _num(c["score"]) for c in r["cells"])])
    return Response(buf.getvalue(), media_type="text/csv", headers={
        **NO_STORE, "Content-Disposition": f'attachment; filename="gradebook-class-{class_id}.csv"'})


# ---------- students ----------

@router.get("/me/assignments", response_model=s.StudentHome, response_model_by_alias=True)
def my_assignments(response: Response, p: Principal = Depends(STUDENT)) -> s.StudentHome:
    _no_store(response)
    return s.StudentHome.model_validate(data.student_assignments(auth.engine(), p))


@router.post("/me/assignments/{assignment_id}/hunt", response_model=s.HuntResult)
def submit_hunt(body: s.HuntSubmit, response: Response, assignment_id: int = ID(),
                p: Principal = Depends(STUDENT)) -> s.HuntResult:
    """Submit a period for a hunt challenge. Scored like the hunt lab; the best try counts."""
    _no_store(response)
    with _errors():
        return s.HuntResult(**data.submit_hunt(auth.engine(), p, assignment_id, body.period_d))


# ---------- helpers ----------

def _with_role(p: Principal, org_id: int, role: str) -> Principal:
    """The caller as of just now, after creating or joining an org in this request."""
    return replace(p, roles={**p.roles, org_id: role})


def _max(g: dict, i: int) -> str:
    maxes = {c["max_score"] for r in g["rows"] if (c := r["cells"][i]) is not None}
    return _num(maxes.pop()) if len(maxes) == 1 else "varies"


def _num(v: float) -> str:
    return str(int(v)) if float(v).is_integer() else f"{v:g}"


def _safe_cell(v: str) -> str:
    """Spreadsheet apps run cells starting with = + - @ as formulas; prefix those with a quote."""
    return f"'{v}" if v[:1] in ("=", "+", "-", "@", "\t", "\r") else v


def json_safe(v):
    if isinstance(v, dict):
        return {k: json_safe(x) for k, x in v.items()}
    if isinstance(v, list):
        return [json_safe(x) for x in v]
    if isinstance(v, dt.datetime):
        return v.isoformat()
    return v
