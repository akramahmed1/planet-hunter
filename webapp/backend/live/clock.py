"""The current time, in one place so tests can freeze it."""
from __future__ import annotations

from datetime import date, datetime, timezone


def now() -> datetime:
    return datetime.now(timezone.utc)


def today() -> date:
    return now().date()
