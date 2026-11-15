from __future__ import annotations

import os

from fastapi import APIRouter, Response

import db
from classroom import flags
from api_v2.schemas import DatabaseStatus, Features, V2HealthResponse

VERSION = "2.0.0-dev"

router = APIRouter(prefix="/api/v2", tags=["v2"])


@router.get("/features", response_model=Features)
def features(response: Response) -> Features:
    """Switches the frontend needs to know about. Short cache: a flip shows up within a minute."""
    response.headers["Cache-Control"] = "public, max-age=30"
    return Features(classroom=flags.classroom_enabled())


@router.get("/health", response_model=V2HealthResponse)
def health(response: Response) -> V2HealthResponse:
    """Service health including database connectivity.

    Always 200 so the body can say what is wrong; `status` is "ok" only
    when the database is connected.
    """
    state, latency = db.ping()
    response.headers["Cache-Control"] = "no-store"
    return V2HealthResponse(
        status="ok" if state == "connected" else "degraded",
        service="planet-hunter-api",
        api_version="2",
        version=VERSION,
        # Set by Railway on GitHub-triggered deploys; lets checks confirm which build is live.
        commit=os.environ.get("RAILWAY_GIT_COMMIT_SHA") or None,
        database=DatabaseStatus(status=state, latency_ms=latency),
    )
