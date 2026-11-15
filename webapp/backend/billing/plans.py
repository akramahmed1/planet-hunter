"""Plans and the limits the backend enforces (Phase 9).

Everyone can explore the site without an account, free. Classroom features have a free
plan and a paid classroom plan. The limits below are PLACEHOLDERS until Akram confirms
pricing and limits (docs/V2_BUILD_PLAN.md, Decisions still open). They are enforced only
while billing is switched on (BILLING_ENABLED=1); with billing off, classrooms are not
limited by plan.
"""
from __future__ import annotations

import os

from sqlalchemy import text
from sqlalchemy.engine import Connection

PLANS = {
    "free": {"name": "Free classroom", "classes": 1, "students_per_class": 40, "explainer_per_class_per_day": 50},
    "classroom": {"name": "Classroom plan", "classes": 30, "students_per_class": 200,
                  "explainer_per_class_per_day": 1000},
}


class OverLimit(Exception):
    pass


def enforced() -> bool:
    return os.environ.get("BILLING_ENABLED") == "1"


def plan_of(c: Connection, org_id: int) -> str:
    row = c.execute(text("select plan from org_plans where org_id = :o"), {"o": org_id}).scalar()
    return row if row in PLANS else "free"


def check_new_class(c: Connection, org_id: int) -> None:
    if not enforced():
        return
    p = PLANS[plan_of(c, org_id)]
    n = c.execute(text("select count(*) from classes where org_id = :o"), {"o": org_id}).scalar_one()
    if n >= p["classes"]:
        raise OverLimit(f"The {p['name']} allows {p['classes']} class{'es' if p['classes'] != 1 else ''}.")


def check_new_student(c: Connection, org_id: int, class_id: int) -> None:
    if not enforced():
        return
    p = PLANS[plan_of(c, org_id)]
    n = c.execute(text("select count(*) from class_members where org_id = :o and class_id = :k"),
                  {"o": org_id, "k": class_id}).scalar_one()
    if n >= p["students_per_class"]:
        raise OverLimit(f"This class is full ({p['students_per_class']} students on the {p['name']}).")


def explainer_class_limit(c: Connection, org_id: int) -> int | None:
    return PLANS[plan_of(c, org_id)]["explainer_per_class_per_day"] if enforced() else None
