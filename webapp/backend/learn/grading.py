"""Quiz engine: grade one answer to one question (Phase 7).

Grading happens on the server so the answers are not shipped to the browser and
Phase 8 assignments can reuse it. Retries are always allowed; the explanation is
returned whether the answer is right or wrong.
"""
from __future__ import annotations

import math
from dataclasses import dataclass


class BadAnswer(ValueError):
    """The answer is not the right shape for the question (not a wrong answer)."""


@dataclass(frozen=True)
class Graded:
    correct: bool
    explanation: str
    # Choice questions: the correct choice and the explanation for the one picked.
    correct_choice: int | None = None
    choice_explanation: str | None = None
    # Numeric questions: the accepted answer and range.
    answer: float | None = None
    tolerance: float | None = None
    unit: str | None = None


def grade(question: dict, choice: int | None = None, value: float | None = None) -> Graded:
    """`question` is a stored question row: kind, explanation, and choices or answer/tolerance/unit."""
    if question["kind"] == "choice":
        if choice is None or value is not None:
            raise BadAnswer("this question takes a choice")
        choices = question["choices"]
        if not 0 <= choice < len(choices):
            raise BadAnswer(f"choice must be between 0 and {len(choices) - 1}")
        right = next(i for i, c in enumerate(choices) if c["correct"])
        return Graded(correct=choice == right, explanation=question["explanation"], correct_choice=right,
                      choice_explanation=choices[choice]["explanation"])
    if value is None or choice is not None:
        raise BadAnswer("this question takes a number")
    if not math.isfinite(value):
        raise BadAnswer("the answer must be a finite number")
    answer, tol = question["answer"], question["tolerance"]
    # A tiny allowance so an answer exactly on the edge of the range is not lost to rounding.
    ok = abs(value - answer) <= tol * (1 + 1e-9)
    return Graded(correct=ok, explanation=question["explanation"], answer=answer, tolerance=tol,
                  unit=question["unit"])
