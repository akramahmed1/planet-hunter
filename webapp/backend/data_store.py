"""Loads and validates the published results once, at startup.

If the data files are missing or do not match the contract in schemas.py,
the app fails to start instead of serving a half-broken site.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from schemas import MethodResponse, Results

HERE = Path(__file__).resolve().parent
DATA_DIR = HERE / "data"
PLOT_DIR = HERE / "plots"


@lru_cache(maxsize=1)
def results() -> Results:
    return Results.model_validate(json.loads((DATA_DIR / "results.json").read_text()))


@lru_cache(maxsize=1)
def method() -> MethodResponse:
    return MethodResponse.model_validate(json.loads((DATA_DIR / "method.json").read_text()))


@lru_cache(maxsize=1)
def plot_files() -> frozenset[str]:
    """Only plots referenced by the published results may be served."""
    r = results()
    urls = [c.plot_url for c in r.candidates if c.plot_url] + [r.validation.plot_url]
    return frozenset(u.rsplit("/", 1)[1] for u in urls)


def plot_path(filename: str) -> Path | None:
    if filename not in plot_files():
        return None
    p = PLOT_DIR / filename
    return p if p.is_file() else None


def check_integrity() -> None:
    """Called at startup: every referenced plot must exist on disk."""
    missing = [f for f in plot_files() if not (PLOT_DIR / f).is_file()]
    if missing:
        raise RuntimeError(f"plots referenced by results.json are missing: {sorted(missing)}")
    method()
