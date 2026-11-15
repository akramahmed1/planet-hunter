"""Whose row a signed-in request is about: the owner columns, chosen from the session and never from the request."""
from __future__ import annotations

from classroom.auth import Principal


def owner(p: Principal) -> dict:
    """{"user_id", "member_id"} for a teacher or a student: exactly one is set."""
    return {"user_id": p.user_id, "member_id": None} if p.kind == "teacher" else {"user_id": None, "member_id": p.member_id}
