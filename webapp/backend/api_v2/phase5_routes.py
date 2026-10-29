"""Phase 5 endpoints: each target's light curve and BLS periodogram (exported by scripts/export_lightcurves.py)."""
from __future__ import annotations

import json
import os
from functools import lru_cache

from fastapi import APIRouter, HTTPException, Path, Response

from api_v2 import schemas as s
from api_v2.live_routes import _cache_header
from live import reference

router = APIRouter(prefix="/api/v2", tags=["v2"])
NOT_FOUND = {404: {"description": "No light curve exported for this target"}}
LIGHTCURVES = reference.DATA / "lightcurves"
SLUG = Path(..., pattern=r"^[a-z0-9-]{1,40}$")


@lru_cache(maxsize=16)
def _load(slug: str) -> dict:
    # The route already limits slug to [a-z0-9-]; this keeps _load safe for any caller too.
    base = os.path.realpath(LIGHTCURVES)
    path = os.path.realpath(os.path.join(base, f"{slug}.json"))
    if not path.startswith(base + os.sep) or not os.path.isfile(path):
        raise HTTPException(404, f"no light curve exported for '{slug}'")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _meta(d: dict) -> dict:
    return {
        "slug": d["slug"], "target": d["target"], "tic": d["tic"],
        "source": s.SourceRef(name=d["source"]["name"], url=d["source"]["url"]),
        "fetched_at": d["source"]["fetched_at"], "sectors": d["sectors"], "n_cadences": d["n_cadences"],
        "processing": d["processing"], "signal": s.PipelineSignal(**d["signal"]),
    }


@router.get("/lightcurves/{slug}", response_model=s.LightCurveResponse, responses=NOT_FOUND)
def lightcurve(response: Response, slug: str = SLUG) -> s.LightCurveResponse:
    """Flattened TESS light curve, median-binned to 10 minutes, flux in ppm from 1."""
    d = _load(slug)
    _cache_header(response, 86_400)
    return s.LightCurveResponse(**_meta(d), binning=s.Binning(**d["binning"]), time_btjd=d["time_btjd"],
                                flux_ppm=d["flux_ppm"])


@router.get("/periodogram/{slug}", response_model=s.PeriodogramResponse, responses=NOT_FOUND)
def periodogram(response: Response, slug: str = SLUG) -> s.PeriodogramResponse:
    """BLS periodogram (peak-preserving downsample) and the strongest signal."""
    d = _load(slug)
    _cache_header(response, 86_400)
    pg = d["periodogram"]
    return s.PeriodogramResponse(**_meta(d), method=pg["method"], period_d=pg["period_d"], power=pg["power"])
