"""Learn progress that follows a signed-in person across devices (launch task T39).

The document has the same shape the browser keeps on its own (frontend/lib/learn.ts, version 1):
per lesson, how many steps were seen, per question whether it was ever answered correctly and how many tries it took,
and when the badge was earned. Nothing in it names a person: slugs, question keys, counts and one timestamp.

Two copies of the same person's progress are combined with `merge`, a join: it takes the most progress either has, so
the result does not depend on which device wrote last, on the order, or on how often it is applied. Progress only ever
grows, so a device that was offline for a week cannot wipe out what another device did.
"""
from __future__ import annotations

import re

SLUG = re.compile(r"^[a-z0-9-]{1,64}$")
KEY = re.compile(r"^[a-z0-9_]{1,64}$")
MAX_LESSONS = 64
MAX_QUESTIONS = 64
MAX_STEPS = 1000
MAX_TRIES = 10_000
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$")

EMPTY: dict = {"version": 1, "lessons": {}}


class BadProgress(ValueError):
    """The document is not progress in the shape this app writes."""


def _int(v, hi: int) -> int:
    if isinstance(v, bool) or not isinstance(v, int) or v < 0 or v > hi:
        raise BadProgress("a count is out of range")
    return v


def validate(doc) -> dict:
    """Return a clean copy, or raise BadProgress. Strict: unknown fields are dropped, wrong types are refused."""
    if not isinstance(doc, dict) or doc.get("version") != 1 or not isinstance(doc.get("lessons"), dict):
        raise BadProgress("not learn progress")
    if len(doc["lessons"]) > MAX_LESSONS:
        raise BadProgress("too many lessons")
    lessons: dict = {}
    for slug, l in doc["lessons"].items():
        if not isinstance(slug, str) or not SLUG.match(slug) or not isinstance(l, dict):
            raise BadProgress("a lesson is not valid")
        qs = l.get("questions", {})
        if not isinstance(qs, dict) or len(qs) > MAX_QUESTIONS:
            raise BadProgress("a lesson has too many questions")
        questions = {}
        for k, q in qs.items():
            if not isinstance(k, str) or not KEY.match(k) or not isinstance(q, dict) or not isinstance(q.get("correct"), bool):
                raise BadProgress("a question is not valid")
            questions[k] = {"correct": q["correct"], "tries": _int(q.get("tries"), MAX_TRIES)}
        out = {"stepsSeen": _int(l.get("stepsSeen", 0), MAX_STEPS), "questions": questions}
        badge = l.get("badgeAt")
        if badge is not None:
            if not isinstance(badge, str) or not ISO.match(badge):
                raise BadProgress("a badge time is not valid")
            out["badgeAt"] = badge
        lessons[slug] = out
    return {"version": 1, "lessons": lessons}


def _earliest(a: str | None, b: str | None) -> str | None:
    if a and b:
        return min(a, b)  # ISO times in one zone sort as text; the earliest is when the badge was first earned
    return a or b


def merge(a: dict, b: dict) -> dict:
    """The most progress either copy has. Commutative, associative and idempotent (tested)."""
    lessons: dict = {}
    for slug in sorted(set(a["lessons"]) | set(b["lessons"])):
        la = a["lessons"].get(slug, {"stepsSeen": 0, "questions": {}})
        lb = b["lessons"].get(slug, {"stepsSeen": 0, "questions": {}})
        questions = {}
        for k in sorted(set(la["questions"]) | set(lb["questions"])):
            qa = la["questions"].get(k)
            qb = lb["questions"].get(k)
            if qa and qb:
                questions[k] = {"correct": qa["correct"] or qb["correct"], "tries": max(qa["tries"], qb["tries"])}
            else:
                questions[k] = dict(qa or qb)
        out = {"stepsSeen": max(la["stepsSeen"], lb["stepsSeen"]), "questions": questions}
        badge = _earliest(la.get("badgeAt"), lb.get("badgeAt"))
        if badge:
            out["badgeAt"] = badge
        lessons[slug] = out
    return {"version": 1, "lessons": lessons}
