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


TEST_ADDRESS_DOMAIN = "school.example"  # reserved by RFC 2606: no real person can ever own an address here


def auto_confirm_test_email(email: str) -> bool:
    """Staging and CI only (AUTO_CONFIRM_TEST_EMAILS=1): a teacher whose address is on the reserved test domain
    counts as confirmed at sign-up, so browser tests can run on a site where nobody can click an emailed link.
    Real addresses always need the link. Never set this in production; off by default."""
    on = os.environ.get("AUTO_CONFIRM_TEST_EMAILS", "").strip().lower() in {"1", "true", "yes", "on"}
    return on and email.lower().endswith("@" + TEST_ADDRESS_DOMAIN)
