# Database connection for /api/v2.
# DATABASE_URL comes from Railway (staging only until Phase 10). The v1 API
# never touches the database, so a missing or broken DATABASE_URL can only
# affect v2 endpoints, which report it instead of failing.
from __future__ import annotations

import logging
import os
import time
from functools import lru_cache
from typing import Literal

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase

log = logging.getLogger("planet-hunter.db")

DatabaseState = Literal["connected", "not_configured", "unavailable"]


class Base(DeclarativeBase):
    """Declarative base for every v2 table. Alembic autogenerates from its metadata."""


def database_url() -> str | None:
    """DATABASE_URL with the driver set to psycopg 3, or None when unset.

    Railway hands out postgresql:// (or legacy postgres://) URLs, which
    SQLAlchemy would map to psycopg2; we ship psycopg 3.
    """
    raw = os.environ.get("DATABASE_URL", "").strip()
    if not raw:
        return None
    for prefix in ("postgres://", "postgresql://"):
        if raw.startswith(prefix):
            return "postgresql+psycopg://" + raw[len(prefix):]
    return raw


@lru_cache(maxsize=4)
def _engine_for(url: str) -> Engine:
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        connect_args={"connect_timeout": 5},
    )


def engine() -> Engine | None:
    url = database_url()
    return _engine_for(url) if url else None


def ping() -> tuple[DatabaseState, float | None]:
    """Check connectivity with `select 1`. Returns (state, latency in ms)."""
    eng = engine()
    if eng is None:
        return "not_configured", None
    started = time.perf_counter()
    try:
        with eng.connect() as conn:
            conn.execute(text("select 1"))
    except Exception as exc:  # any driver or network error means unavailable
        # Log the error class only: driver messages can echo host details.
        log.warning("database ping failed: %s", type(exc).__name__)
        return "unavailable", None
    return "connected", round((time.perf_counter() - started) * 1000, 1)
