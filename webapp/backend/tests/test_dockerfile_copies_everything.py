"""Every package and module the backend imports must be copied into the image.

A missing COPY line passes every test here (the source tree is complete) and only fails on Railway, where the
healthcheck never passes. This happened to the watch package on 2026-10-22: the staging backend stayed on an old commit.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCKERFILE = (ROOT / "Dockerfile").read_text()
COPIED = set(re.findall(r"^COPY\s+(.+)$", DOCKERFILE, flags=re.M))
COPIED_NAMES = {n.rstrip("/") for line in COPIED for n in line.split()[:-1]}


def test_every_top_level_package_is_copied():
    packages = {p.name for p in ROOT.iterdir() if p.is_dir() and any(p.glob("*.py"))}
    packages -= {"tests", "__pycache__"}
    missing = sorted(packages - COPIED_NAMES)
    assert not missing, f"not copied into the Docker image (Railway will fail at startup): {missing}"


def test_every_top_level_module_is_copied():
    modules = {p.name for p in ROOT.glob("*.py")}
    missing = sorted(m for m in modules if m not in COPIED_NAMES)
    assert not missing, f"not copied into the Docker image: {missing}"
