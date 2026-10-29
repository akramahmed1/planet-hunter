"""Quiz engine, lesson sync and the lessons API (Phase 7)."""
import math

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

import app as backend
from learn import grading, store
from learn.content import lessons
from tests.test_scan_queue import engine  # noqa: F401
from tests.test_v2 import needs_db

CHOICE = {"kind": "choice", "explanation": "because",
          "choices": [{"text": "a", "correct": False, "explanation": "not a"},
                      {"text": "b", "correct": True, "explanation": "yes b"}]}
NUMERIC = {"kind": "numeric", "explanation": "because", "answer": 8.3, "tolerance": 0.2, "unit": "minutes"}


def test_choice_grading_reports_the_right_choice_and_why():
    g = grading.grade(CHOICE, choice=0)
    assert not g.correct and g.correct_choice == 1 and g.choice_explanation == "not a" and g.explanation == "because"
    assert grading.grade(CHOICE, choice=1).correct


def test_numeric_grading_uses_the_tolerance_inclusively():
    assert grading.grade(NUMERIC, value=8.3).correct
    assert grading.grade(NUMERIC, value=8.1).correct and grading.grade(NUMERIC, value=8.5).correct
    assert not grading.grade(NUMERIC, value=8.0).correct and not grading.grade(NUMERIC, value=8.6).correct
    g = grading.grade(NUMERIC, value=1)
    assert (g.answer, g.tolerance, g.unit) == (8.3, 0.2, "minutes")


@pytest.mark.parametrize("q,kw", [(CHOICE, {"choice": 2}), (CHOICE, {"choice": -1}), (CHOICE, {}),
                                  (CHOICE, {"value": 1.0}), (NUMERIC, {}), (NUMERIC, {"choice": 1}),
                                  (NUMERIC, {"value": math.nan}), (NUMERIC, {"value": math.inf})])
def test_badly_shaped_answers_are_rejected_not_graded(q, kw):
    with pytest.raises(grading.BadAnswer):
        grading.grade(q, **kw)


def test_lessons_without_a_database_say_so(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with TestClient(backend.app) as c:
        r = c.get("/api/v2/lessons")
        assert r.status_code == 503 and "database" in r.json()["detail"]


@needs_db
def test_sync_is_idempotent_and_keeps_question_ids(engine):  # noqa: F811
    assert store.sync(engine) == len(lessons())
    with engine.connect() as c:
        before = dict(c.execute(text("select key, id from questions")).all())
    assert store.sync(engine) == 0
    # A lesson whose question is removed keeps the row, marked inactive.
    first = lessons()[0]
    trimmed = first.model_copy(update={"questions": first.questions[1:]})
    assert store.sync(engine, (trimmed, *lessons()[1:])) == 1
    with engine.connect() as c:
        after = dict(c.execute(text("select key, id from questions")).all())
        gone = c.execute(text("select active from questions where key = :k"), {"k": first.questions[0].key}).scalar()
    assert after == before and gone is False
    assert store.sync(engine) == 1
    assert [l["slug"] for l in store.list_lessons(engine)] == [l.slug for l in lessons()]


@needs_db
def test_lessons_api(engine):  # noqa: F811
    with TestClient(backend.app) as c:  # startup syncs the lessons
        listing = c.get("/api/v2/lessons").json()["lessons"]
        assert [l["slug"] for l in listing] == [l.slug for l in lessons()]
        assert all(l["steps"] >= 2 and l["questions"] >= 2 for l in listing)

        body = c.get("/api/v2/lessons/distances-and-light-time").json()
        assert body["steps"][0]["facts"][0]["source"]["url"].startswith("https://")
        assert "correct" not in str(body["questions"]) and "answer" not in body["questions"][0]
        numeric = next(q for q in body["questions"] if q["kind"] == "numeric")
        assert numeric["choices"] is None and numeric["unit"] and numeric["tolerance"] > 0

        url = "/api/v2/lessons/distances-and-light-time/answers"
        right = c.post(url, json={"question": "earth_minutes", "value": 8.3}).json()
        assert right["correct"] and right["answer"] == 8.3 and right["explanation"]
        assert not c.post(url, json={"question": "earth_minutes", "value": 20}).json()["correct"]
        pick = c.post(url, json={"question": "sun_off", "choice": 0}).json()
        assert not pick["correct"] and pick["correct_choice"] == 1 and pick["choice_explanation"]

        assert c.post(url, json={"question": "earth_minutes", "choice": 1}).status_code == 422
        assert c.post(url, json={"question": "nope", "value": 1}).status_code == 404
        assert c.post(url, json={"question": "Bad Key", "value": 1}).status_code == 422
        assert c.get("/api/v2/lessons/no-such-lesson").status_code == 404
        assert c.get("/api/v2/lessons/BAD_slug").status_code == 422
