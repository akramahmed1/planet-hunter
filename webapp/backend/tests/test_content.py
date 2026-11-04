"""Content lint for content/lessons/ (Phase 7).

Every fact and quiz answer must name a source and pass its checks: quoted words must
appear in the saved copy of the source, and computed values must come out of
learn/checks.py exactly as the text states them. Every number in a step's body must
appear in one of that step's facts. Links must point to pages that exist.
"""
import html
import json
import re
from functools import lru_cache
from pathlib import Path

import pytest

from learn import checks
from learn.content import ChoiceQuestion, ComputedCheck, Lesson, NumericQuestion, QuoteCheck, lessons

BACKEND = Path(__file__).resolve().parent.parent
REPO = BACKEND.parent.parent
FIXTURES = BACKEND / "tests" / "fixtures" / "external"
FRONTEND_APP = REPO / "webapp" / "frontend" / "app"
LESSONS = lessons()
DASHES = re.compile("[–—]")
NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")


@lru_cache(maxsize=None)
def source_text(fixture: str) -> str:
    """The saved source as plain text with whitespace collapsed, so quotes match across line breaks."""
    path = REPO / fixture[len("repo:"):] if fixture.startswith("repo:") else FIXTURES / fixture
    raw = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix == ".json":
        try:
            data = json.loads(raw)
            raw = data["result"] if isinstance(data, dict) and isinstance(data.get("result"), str) else raw
        except json.JSONDecodeError:
            pass
    if path.suffix == ".html":
        raw = re.sub(r"(?is)<(script|style|noscript|svg).*?</\1>", " ", raw)
        raw = html.unescape(re.sub(r"(?s)<[^>]+>", " ", raw))
    raw = re.sub(r"\[link: [^\]]*\]", " ", raw)
    return re.sub(r"\s+", " ", raw)


def collapse(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def assert_check(check, text: str, where: str, numeric_answer: float | None = None) -> None:
    if isinstance(check, QuoteCheck):
        assert collapse(check.quote) in source_text(check.fixture), f"{where}: quote not found in {check.fixture}: {check.quote!r}"
        if numeric_answer is not None:
            assert f"{numeric_answer:g}" in check.quote, f"{where}: answer {numeric_answer:g} is not in the quote"
    else:
        assert isinstance(check, ComputedCheck)
        fn = checks.COMPUTED.get(check.computed)
        assert fn is not None, f"{where}: no computation named {check.computed}"
        value = fn()
        if numeric_answer is not None and isinstance(value, float):
            assert value == pytest.approx(numeric_answer), f"{where}: answer {numeric_answer} but computed {value}"
        else:
            assert isinstance(value, str) and value in text, f"{where}: {value!r} is not in {text!r}"


def all_text(lesson: Lesson) -> list[str]:
    out = [lesson.title, lesson.summary, lesson.badge.name, lesson.badge.text, *(k.label for k in lesson.links)]
    for st in lesson.steps:
        out += [st.heading, *st.body, *(f.text for f in st.facts)]
    for q in lesson.questions:
        out += [q.prompt, q.explanation]
        if isinstance(q, ChoiceQuestion):
            out += [x for ch in q.choices for x in (ch.text, ch.explanation)]
    return out


def site_paths() -> set[str]:
    """Static pages from the Next.js app folder, plus each candidate and system page."""
    paths = set()
    for page in FRONTEND_APP.rglob("page.tsx"):
        rel = page.parent.relative_to(FRONTEND_APP).as_posix()
        if "[" not in rel:
            paths.add("/" if rel == "." else f"/{rel}")
    slugs = [c["slug"] for c in json.loads((BACKEND / "data" / "results.json").read_text())["candidates"]]
    paths |= {f"/candidates/{s}" for s in slugs} | {f"/exoplanets/{s}" for s in slugs}
    return paths


def test_there_are_six_to_eight_lessons_with_unique_slugs():
    assert 6 <= len(LESSONS) <= 8
    assert len({l.slug for l in LESSONS}) == len(LESSONS)


@pytest.mark.parametrize("lesson", LESSONS, ids=lambda l: l.slug)
def test_every_fact_is_sourced_and_checks_out(lesson):
    for i, st in enumerate(lesson.steps):
        for f in st.facts:
            for ch in f.checks:
                assert_check(ch, f.text, f"{lesson.slug} step {i + 1}")


@pytest.mark.parametrize("lesson", LESSONS, ids=lambda l: l.slug)
def test_numbers_in_the_text_come_from_facts(lesson):
    for i, st in enumerate(lesson.steps):
        facts = " ".join(f.text for f in st.facts)
        for para in st.body:
            for n in NUMBER.findall(para):
                assert n.rstrip(",") in facts, f"{lesson.slug} step {i + 1}: {n} in the text but in no fact"


@pytest.mark.parametrize("lesson", LESSONS, ids=lambda l: l.slug)
def test_quiz_answers_are_sourced_and_check_out(lesson):
    for q in lesson.questions:
        where = f"{lesson.slug} question {q.key}"
        for ch in q.checks:
            if isinstance(q, NumericQuestion):
                assert_check(ch, q.explanation, where, numeric_answer=q.answer)
            else:
                assert_check(ch, q.explanation, where)


@pytest.mark.parametrize("lesson", LESSONS, ids=lambda l: l.slug)
def test_copy_rules(lesson):
    for text in all_text(lesson):
        assert not DASHES.search(text), f"{lesson.slug}: em or en dash in {text!r}"
        assert "discovered a planet" not in text.lower() and "we discovered" not in text.lower(), text


@pytest.mark.skipif(not FRONTEND_APP.exists(), reason="frontend not checked out")
@pytest.mark.parametrize("lesson", LESSONS, ids=lambda l: l.slug)
def test_links_point_to_real_pages(lesson):
    paths = site_paths()
    for link in lesson.links:
        assert link.href in paths, f"{lesson.slug}: no page at {link.href}"
    for st in lesson.steps:
        for f in st.facts:
            if f.source.url.startswith("/"):
                assert f.source.url in paths, f"{lesson.slug}: no page at {f.source.url}"


def test_lint_catches_a_missing_quote_and_a_wrong_number():
    with pytest.raises(AssertionError, match="quote not found"):
        assert_check(QuoteCheck(fixture="nist_c_p7.txt", quote="299 792 459 m s -1"), "", "probe")
    with pytest.raises(AssertionError, match="is not in"):
        assert_check(ComputedCheck(computed="sunlight_earth"), "Sunlight takes 9 minutes.", "probe")
    with pytest.raises(AssertionError, match="computed"):
        assert_check(ComputedCheck(computed="sunlight_earth_minutes"), "", "probe", numeric_answer=9.0)


def test_lesson_files_reject_bad_shapes():
    good = json.loads(next((BACKEND / "content" / "lessons").glob("*.json")).read_text())
    two_right = json.loads(json.dumps(good))
    q = next(q for q in two_right["questions"] if q["kind"] == "choice")
    for ch in q["choices"]:
        ch["correct"] = True
    with pytest.raises(ValueError, match="exactly one correct"):
        Lesson.model_validate(two_right)
    unsourced = json.loads(json.dumps(good))
    unsourced["steps"][0]["facts"][0]["checks"] = []
    with pytest.raises(ValueError):
        Lesson.model_validate(unsourced)
    http = json.loads(json.dumps(good))
    http["steps"][0]["facts"][0]["source"]["url"] = "http://example.com/"
    with pytest.raises(ValueError):
        Lesson.model_validate(http)
