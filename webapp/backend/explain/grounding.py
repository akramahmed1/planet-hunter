"""What the explainer may use: one item's JSON plus the lesson content (Phase 9).

The model sees nothing else. Every citation it returns is a dotted path into this
grounding (for example `item.period_d` or `lessons.transits.steps[1].facts[0]`), and
`resolve` checks that the path exists before the answer is shown.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from typing import Any

import data_store
from learn.content import lessons

PATH_RE = re.compile(r"^[a-z_][a-z0-9_-]*(\.[a-z0-9_-]+|\[\d+\])*$", re.I)
TOKEN_RE = re.compile(r"\.?([A-Za-z0-9_-]+)|\[(\d+)\]")


class NotFound(Exception):
    pass


@lru_cache(maxsize=1)
def lesson_grounding() -> dict:
    """The lessons as plain data: titles, step text and fact text (no checks, no answers)."""
    return {l.slug: {"title": l.title,
                     "steps": [{"heading": s.heading, "body": list(s.body), "facts": [f.text for f in s.facts]}
                               for s in l.steps]}
            for l in lessons()}


def candidate_item(slug: str) -> dict:
    c = next((x for x in data_store.results().candidates if x.slug == slug), None)
    if c is None:
        raise NotFound("no such candidate")
    return json.loads(c.model_dump_json())


def scan_item(eng, job_id: int) -> dict:
    from scans import queue
    job = queue.get(eng, job_id) if eng is not None else None
    if job is None or job.get("signal") is None:
        raise NotFound("no finished scan with that id")
    sig = job["signal"]
    return {"tic_id": job["tic_id"], "toi": job["toi"], "sectors": job["sectors"],
            "pipeline_version": job["pipeline_version"],
            "signal": {k: sig[k] for k in ("period_d", "t0_btjd", "duration_d", "depth_ppm", "snr")},
            "vetting": sig["vetting"], "crossmatch": sig["crossmatch"], "proposed_label": sig["proposed_label"],
            "label_status": "reviewed" if job.get("reviews") else "proposed, not reviewed"}


def planet_item(slug: str) -> dict:
    from api_v2 import phase4_routes
    try:
        from fastapi import Response
        system = phase4_routes.target_system(Response(), slug=slug)
    except Exception as exc:  # noqa: BLE001 - the route raises HTTPException for unknown slugs
        raise NotFound("no such system") from exc
    return json.loads(system.model_dump_json())


def grounding_for(item: dict) -> dict:
    return {"item": item, "lessons": lesson_grounding()}


def resolve(grounding: dict, path: str) -> Any:
    """The value at a dotted path, or raise KeyError. Paths are short and checked before use."""
    if len(path) > 160 or not PATH_RE.match(path):
        raise KeyError(path)
    cur: Any = grounding
    for name, index in TOKEN_RE.findall(path):
        if name:
            if not isinstance(cur, dict) or name not in cur:
                raise KeyError(path)
            cur = cur[name]
        else:
            i = int(index)
            if not isinstance(cur, list) or i >= len(cur):
                raise KeyError(path)
            cur = cur[i]
    return cur
