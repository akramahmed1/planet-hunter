"""Bundled reference data built by scripts/build_reference_data.py from saved source samples."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"


@lru_cache(maxsize=None)
def load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


def bodies() -> dict:
    return load("bodies.v1.json")


def kepler() -> dict:
    return load("kepler_elements.v1.json")


def pluto() -> dict:
    return load("pluto_horizons.v1.json")


def stars() -> dict:
    return load("stars.v1.json")


def systems() -> dict:
    return load("systems.v1.json")


def missions() -> dict:
    return load("missions.v1.json")


def tess() -> dict:
    return load("tess.v1.json")
