"""The Classroom on/off switch (CLASSROOM_ENABLED).

Classroom stores accounts for teachers and students aged 13 and up, so it stays off in production until
the attorney-reviewed privacy notice exists. Off is the default: only an explicit "1", "true", "yes" or
"on" turns it on (staging and CI set it). Read on every call so tests and operators can flip it.
"""
from __future__ import annotations

import os

from fastapi import HTTPException


def classroom_enabled() -> bool:
    return os.environ.get("CLASSROOM_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}


def require_classroom() -> None:
    """Router dependency: with the switch off every classroom route answers 404, as if it did not exist."""
    if not classroom_enabled():
        raise HTTPException(404, "Not Found")
