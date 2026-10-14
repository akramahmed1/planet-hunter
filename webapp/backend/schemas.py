"""API contract for the planet-hunter backend.

These Pydantic models are the single definition of every response shape.
FastAPI uses them as response_model (so the OpenAPI schema is exact), the
data loader validates the JSON files against them at startup, and
tests/test_contract.py checks the frontend's TypeScript types against them.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

Classification = Literal[
    "clean-recovery",
    "eclipsing-binary",
    "ambiguous",
    "marginal",
    "likely-noise",
    "unreviewed",
]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Candidate(_Strict):
    rank: int
    target: str
    slug: str
    tic: str
    period_d: float
    duration_d: float
    depth_ppm: int
    snr: float
    bls_power: float
    n_cadences: int
    classification: Classification
    classification_label: str
    readout: str
    plot_url: str | None


class RunInfo(_Strict):
    run_date: str
    sectors_per_target: int
    search_period_min_d: float
    search_period_max_d: float
    method: str
    source_csv: str


class Validation(_Strict):
    target: str
    tic: str
    planet: str
    recovered_period_d: float
    published_period_d: float
    period_error_pct: float
    sectors: int
    n_cadences: int
    depth_ppm: int
    search_period_min_d: float
    search_period_max_d: float
    data: str
    archive: str
    plot_url: str


class Summary(_Strict):
    count: int
    by_classification: dict[Classification, int]


class Results(_Strict):
    """The whole data file. Not served directly; endpoints serve slices of it."""

    schema_version: int
    run: RunInfo
    honesty: str
    validation: Validation
    summary: Summary
    candidates: list[Candidate]


class CandidatesResponse(_Strict):
    run: RunInfo
    honesty: str
    summary: Summary
    candidates: list[Candidate]


class OverviewResponse(_Strict):
    run: RunInfo
    honesty: str
    summary: Summary
    validation: Validation


class MethodStep(_Strict):
    title: str
    body: str


class MethodResponse(_Strict):
    data_source: dict[str, str]
    steps: list[MethodStep]
    limitations: list[str]
    roadmap: list[str]
    exominer_note: str


class HealthResponse(_Strict):
    status: Literal["ok"]
    service: str
    version: str
    schema_version: int
    run_date: str
    candidate_count: int
