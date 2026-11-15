"""Lesson content (Phase 7): the versioned files in content/lessons/, read and validated.

Each file is one lesson: steps of plain text, each step with the facts it states,
and a short quiz. Every fact and every quiz answer names a source and how it is
checked: a quote that must appear in a saved copy of the source, or a named
computation in learn/checks.py whose result must appear in the text (for a
numeric question, must equal the answer).
tests/test_content.py runs those checks (the content lint).
"""
from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

CONTENT = Path(__file__).resolve().parent.parent / "content" / "lessons"
SLUG = r"^[a-z0-9]+(-[a-z0-9]+)*$"
KEY = r"^[a-z0-9_]+$"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Source(_Strict):
    name: str = Field(min_length=3)
    # An outside page, or a page on this site (for facts about this project's own results).
    url: str = Field(pattern=r"^(https://|/)")


class QuoteCheck(_Strict):
    """The quoted words appear in the saved source: tests/fixtures/external/<fixture>, or
    repo:<path> for a file in this repository (this project's own results)."""
    fixture: str
    quote: str = Field(min_length=8)


class ComputedCheck(_Strict):
    """learn/checks.py computes `computed`; its result must appear in the text."""
    computed: str = Field(pattern=KEY)


Check = Union[QuoteCheck, ComputedCheck]


class Fact(_Strict):
    text: str = Field(min_length=10)
    kind: Literal["measured", "computed", "definition"]
    source: Source
    checks: list[Check] = Field(min_length=1)


class Step(_Strict):
    heading: str = Field(min_length=3)
    body: list[str] = Field(min_length=1)
    facts: list[Fact] = Field(min_length=1)


class Choice(_Strict):
    text: str = Field(min_length=1)
    correct: bool = False
    explanation: str = Field(min_length=3)


class ChoiceQuestion(_Strict):
    key: str = Field(pattern=KEY)
    kind: Literal["choice"]
    prompt: str = Field(min_length=5)
    choices: list[Choice] = Field(min_length=2, max_length=5)
    explanation: str = Field(min_length=10)
    source: Source
    checks: list[Check] = Field(min_length=1)

    @field_validator("choices")
    @classmethod
    def one_correct(cls, v: list[Choice]) -> list[Choice]:
        if sum(c.correct for c in v) != 1:
            raise ValueError("a choice question needs exactly one correct choice")
        if len({c.text for c in v}) != len(v):
            raise ValueError("choices must differ")
        return v


class NumericQuestion(_Strict):
    key: str = Field(pattern=KEY)
    kind: Literal["numeric"]
    prompt: str = Field(min_length=5)
    answer: float
    tolerance: float = Field(gt=0)
    unit: str
    explanation: str = Field(min_length=10)
    source: Source
    checks: list[Check] = Field(min_length=1)


Question = Annotated[Union[ChoiceQuestion, NumericQuestion], Field(discriminator="kind")]


class Badge(_Strict):
    name: str = Field(min_length=3)
    text: str = Field(min_length=10)


class Link(_Strict):
    href: str = Field(pattern=r"^/")
    label: str = Field(min_length=3)


class Lesson(_Strict):
    slug: str = Field(pattern=SLUG)
    title: str = Field(min_length=3)
    summary: str = Field(min_length=10)
    minutes: int = Field(ge=1, le=30)
    badge: Badge
    links: list[Link] = Field(min_length=1)
    steps: list[Step] = Field(min_length=2)
    questions: list[Question] = Field(min_length=2)

    @model_validator(mode="after")
    def unique_keys(self) -> "Lesson":
        keys = [q.key for q in self.questions]
        if len(set(keys)) != len(keys):
            raise ValueError(f"{self.slug}: question keys must be unique")
        return self

    def digest(self) -> str:
        return hashlib.sha256(self.model_dump_json().encode()).hexdigest()[:16]


@lru_cache(maxsize=1)
def lessons() -> tuple[Lesson, ...]:
    """All lessons in file order (files are named NN-slug.json)."""
    out = []
    for path in sorted(CONTENT.glob("*.json")):
        lesson = Lesson.model_validate(json.loads(path.read_text()))
        if not path.stem.endswith(lesson.slug):
            raise ValueError(f"{path.name}: file name must end with the slug {lesson.slug}")
        out.append(lesson)
    if len({l.slug for l in out}) != len(out):
        raise ValueError("lesson slugs must be unique")
    return tuple(out)
