"""Phase 7: lessons and quiz answers. Lessons are synced from content/lessons/ into Postgres."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Path, Request, Response

import db
from api_v2 import schemas as s
from api_v2.owner import owner
from classroom import auth as classroom_auth
from classroom import data as classroom_data
from learn import grading, progress, store

router = APIRouter(prefix="/api/v2", tags=["v2"])
NO_DB = {503: {"description": "Lessons need the database, which is not configured or not reachable"}}
NOT_FOUND = {404: {"description": "No such lesson or question"}}
SLUG = Path(..., pattern=r"^[a-z0-9-]{1,64}$")
CACHE = "public, max-age=300"


def _engine():
    eng = db.engine()
    if eng is None:
        raise HTTPException(503, "lessons need the database, which is not configured here")
    return eng


@router.get("/lessons", response_model=s.LessonsResponse, responses=NO_DB)
def lessons(response: Response) -> s.LessonsResponse:
    """Every lesson in order, with its badge and how many steps and questions it has."""
    response.headers["Cache-Control"] = CACHE
    return s.LessonsResponse(lessons=[s.LessonSummary(**l) for l in store.list_lessons(_engine())])


@router.get("/lessons/{slug}", response_model=s.LessonResponse, responses={**NO_DB, **NOT_FOUND})
def lesson(response: Response, slug: str = SLUG) -> s.LessonResponse:
    """One lesson: steps with their sourced facts, and the quiz questions without their answers."""
    l = store.get_lesson(_engine(), slug)
    if l is None:
        raise HTTPException(404, "no such lesson")
    response.headers["Cache-Control"] = CACHE
    return s.LessonResponse(**l)


@router.post("/lessons/{slug}/answers", response_model=s.AnswerResult, responses={**NO_DB, **NOT_FOUND})
def answer(body: s.AnswerRequest, request: Request, response: Response, slug: str = SLUG) -> s.AnswerResult:
    """Check one answer. Retries are allowed; the explanation comes back either way.

    Anyone can answer. For a signed-in student the answer also counts toward their
    class's assignments for this lesson (Phase 8).
    """
    eng = _engine()
    q = store.get_question(eng, slug, body.question)
    if q is None:
        raise HTTPException(404, "no such question in this lesson")
    try:
        g = grading.grade(q, choice=body.choice, value=body.value)
    except grading.BadAnswer as exc:
        raise HTTPException(422, str(exc))
    p = classroom_auth.optional_principal(request)
    if p is not None and p.kind == "student":
        classroom_data.record_lesson_answer(eng, p, slug, body.question, g.correct)
    response.headers["Cache-Control"] = "no-store"
    return s.AnswerResult(question=body.question, correct=g.correct, explanation=g.explanation,
                          source=s.SourceRef(**q["source"]), correct_choice=g.correct_choice,
                          choice_explanation=g.choice_explanation, answer=g.answer, tolerance=g.tolerance, unit=g.unit)


PROGRESS_CACHE = "no-store"


@router.get("/me/learn-progress", response_model=s.LearnProgress, response_model_exclude_none=True, responses={**NO_DB, 401: {"description": "Not signed in"}})
def my_learn_progress(response: Response, p=Depends(classroom_auth.ANYONE)) -> s.LearnProgress:
    """The signed-in person's Learn progress, so a second device can pick up where the first left off."""
    response.headers["Cache-Control"] = PROGRESS_CACHE
    return s.LearnProgress(**store.get_progress(_engine(), **owner(p)))


@router.put("/me/learn-progress", response_model=s.LearnProgress, response_model_exclude_none=True, responses={**NO_DB, 401: {"description": "Not signed in"},
            422: {"description": "Not valid progress"}})
def put_my_learn_progress(body: s.LearnProgress, response: Response, p=Depends(classroom_auth.ANYONE)) -> s.LearnProgress:
    """Merge this device's progress into the account's and return the combined result.

    Nothing is ever overwritten: the stored copy and the sent copy are joined (the most progress of either wins),
    so an old device cannot erase newer work.
    """
    try:
        doc = progress.validate(body.model_dump(exclude_none=True))
    except progress.BadProgress as exc:
        raise HTTPException(422, str(exc))
    response.headers["Cache-Control"] = PROGRESS_CACHE
    return s.LearnProgress(**store.merge_progress(_engine(), doc, **owner(p)))
