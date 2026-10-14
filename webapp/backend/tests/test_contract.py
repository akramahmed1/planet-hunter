"""Contract tests: data files vs. schemas, and schemas vs. frontend types.

These run with only pydantic installed (no FastAPI), so they are fast and
cannot be skipped by a missing server.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import typing
from pathlib import Path

import data_store
import schemas

BACKEND = Path(__file__).resolve().parent.parent
REPO = BACKEND.parent.parent
API_TS = REPO / "webapp" / "frontend" / "lib" / "api.ts"

# Pydantic model -> TypeScript interface it must match.
MODEL_TO_TS = {
    schemas.Candidate: "Candidate",
    schemas.RunInfo: "RunInfo",
    schemas.Validation: "Validation",
    schemas.Summary: "Summary",
    schemas.CandidatesResponse: "CandidatesResponse",
    schemas.OverviewResponse: "OverviewResponse",
    schemas.MethodStep: "MethodStep",
    schemas.MethodResponse: "MethodResponse",
    schemas.HealthResponse: "HealthResponse",
}


def _ts_interfaces(src: str) -> dict[str, dict[str, tuple[bool, str]]]:
    """{interface: {field: (optional, type_text)}} parsed from api.ts."""
    out: dict[str, dict[str, tuple[bool, str]]] = {}
    for m in re.finditer(r"export interface (\w+) \{(.*?)\n\}", src, re.S):
        fields = {}
        for line in m.group(2).splitlines():
            fm = re.match(r"\s*(\w+)(\??):\s*(.+?);\s*$", line)
            if fm:
                fields[fm.group(1)] = (fm.group(2) == "?", fm.group(3))
        out[m.group(1)] = fields
    return out


def _ts_union(src: str, name: str) -> set[str]:
    m = re.search(rf"export type {name} =(.*?);", src, re.S)
    assert m, f"type {name} not found in api.ts"
    return set(re.findall(r'"([^"]+)"', m.group(1)))


def test_data_files_validate_against_schemas():
    r = data_store.results()
    data_store.method()
    data_store.check_integrity()
    assert r.summary.count == len(r.candidates)
    assert sum(r.summary.by_classification.values()) == r.summary.count


def test_summary_counts_match_candidates():
    r = data_store.results()
    for cls, n in r.summary.by_classification.items():
        assert n == sum(1 for c in r.candidates if c.classification == cls), cls


def test_build_results_is_up_to_date():
    proc = subprocess.run(
        [sys.executable, str(REPO / "scripts" / "build_results.py"), "--check"],
        capture_output=True, text=True,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr


def test_frontend_interfaces_match_backend_models():
    src = API_TS.read_text()
    ts = _ts_interfaces(src)
    problems = []
    for model, iface in MODEL_TO_TS.items():
        if iface not in ts:
            problems.append(f"api.ts is missing interface {iface}")
            continue
        ts_fields = ts[iface]
        py_fields = model.model_fields
        for name in py_fields.keys() - ts_fields.keys():
            problems.append(f"{iface}.{name} exists in the backend but not in api.ts")
        for name in ts_fields.keys() - py_fields.keys():
            problems.append(f"{iface}.{name} exists in api.ts but the backend never sends it")
        for name in py_fields.keys() & ts_fields.keys():
            py_nullable = type(None) in typing.get_args(py_fields[name].annotation)
            ts_optional, ts_type = ts_fields[name]
            ts_nullable = "null" in ts_type
            if ts_optional:
                problems.append(f"{iface}.{name} is optional in api.ts; the backend always sends it")
            if py_nullable != ts_nullable:
                problems.append(f"{iface}.{name} nullability differs (backend {py_nullable}, api.ts {ts_nullable})")
    assert not problems, "\n".join(problems)


def test_classification_values_match():
    ts_values = _ts_union(API_TS.read_text(), "Classification")
    py_values = set(typing.get_args(schemas.Classification))
    assert ts_values == py_values


def test_no_dashes_in_served_copy():
    """House style carried over from the original QA: no em or en dashes."""
    for name in ("results.json", "method.json"):
        text = (data_store.DATA_DIR / name).read_text()
        assert "—" not in text and "–" not in text, name


def test_ambiguous_signals_are_never_called_discoveries():
    for c in data_store.results().candidates:
        if c.classification in ("ambiguous", "unreviewed"):
            assert "discovery" in c.readout.lower() or c.classification == "unreviewed"
            assert "not a discovery" in c.readout.lower() or "never a discovery" in c.readout.lower()
