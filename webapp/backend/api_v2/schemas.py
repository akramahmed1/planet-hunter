"""Response models for /api/v2.

The frontend's types for these are generated from the OpenAPI schema into
webapp/frontend/lib/api-types.gen.ts (ADR 0002), so there is nothing to keep
in sync by hand.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DatabaseStatus(_Strict):
    status: Literal["connected", "not_configured", "unavailable"]
    latency_ms: float | None


class V2HealthResponse(_Strict):
    status: Literal["ok", "degraded"]
    service: str
    api_version: Literal["2"]
    version: str
    commit: str | None
    database: DatabaseStatus
