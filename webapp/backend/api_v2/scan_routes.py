"""Phase 6: queue a scan of any TESS star and read its result (ADR 0003)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Path, Request, Response

import db
from api_v2 import schemas as s
from live import http
from scans import catalogs, queue
from scans.presets import PRESETS

router = APIRouter(prefix="/api/v2", tags=["v2"])
NO_DB = {503: {"description": "Scans need the database, which is not configured or not reachable"}}
NOT_FOUND = {404: {"description": "No such scan, or it has no result yet"}}
LIMITED = {429: {"description": "Rate limited or the queue is full"}}
BAD = {422: {"description": "Not a TIC ID or TOI number"}}
JOB_ID = Path(..., ge=1, le=2**62)


def _engine():
    eng = db.engine()
    if eng is None:
        raise HTTPException(503, "scans need the database, which is not configured here")
    return eng


def _client(request: Request) -> str:
    # Railway's proxy puts the original client first in X-Forwarded-For.
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() or (request.client.host if request.client else "unknown")


@router.post("/scans", response_model=s.ScanCreated, status_code=202, responses={**NO_DB, **LIMITED, **BAD})
def create_scan(body: s.ScanRequest, request: Request, response: Response) -> s.ScanCreated:
    """Queue a scan of a TESS star by TIC ID or TOI number. A repeat request returns the earlier job."""
    try:
        tic, toi = catalogs.resolve(body.target)
    except catalogs.BadTarget as exc:
        raise HTTPException(422, str(exc))
    except http.FetchError as exc:
        raise HTTPException(503, str(exc))
    eng = _engine()
    params = {"preset": body.preset, **PRESETS[body.preset]}
    try:
        job_id, created = queue.enqueue(eng, tic, params, queue.requester_hash(_client(request)), toi)
    except queue.RateLimited as exc:
        raise HTTPException(429, f"Too many scans: {exc}. Try again later.", headers={"Retry-After": "3600"})
    except queue.QueueFull as exc:
        raise HTTPException(429, f"The scan queue is full ({exc}). Try again in a few minutes.",
                            headers={"Retry-After": "300"})
    job = queue.get(eng, job_id)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Location"] = f"/api/v2/scans/{job_id}"
    return s.ScanCreated(id=job_id, status=job["status"], created=created, tic_id=tic)


@router.get("/scans/{job_id}", response_model=s.ScanStatus, responses={**NO_DB, **NOT_FOUND})
def get_scan(response: Response, job_id: int = JOB_ID) -> s.ScanStatus:
    """A scan's status and, once finished, its signal, vetting and cross-match."""
    job = queue.get(_engine(), job_id)
    if job is None:
        raise HTTPException(404, "no such scan")
    sig = job.get("signal")
    reviews = job.get("reviews") or []
    response.headers["Cache-Control"] = "no-store" if job["status"] in ("queued", "running") else "public, max-age=300"
    return s.ScanStatus(
        id=job["id"], status=job["status"], progress=job["progress"], error=job["error"], tic_id=job["tic_id"],
        toi=job["toi"], preset=job["params"].get("preset", "standard"), attempts=job["attempts"],
        created_at=job["created_at"], started_at=job["started_at"], finished_at=job["finished_at"],
        pipeline_version=job["pipeline_version"], sectors=job["sectors"], n_cadences=job["n_cadences"],
        signal=None if sig is None else s.ScanSignal(
            period_d=sig["period_d"], t0_btjd=sig["t0_btjd"], duration_d=sig["duration_d"], depth_ppm=sig["depth_ppm"],
            snr=sig["snr"], power=sig["power"], vetting=sig["vetting"], crossmatch=sig["crossmatch"],
            proposed_label=sig["proposed_label"],
            label_status="reviewed" if reviews else "proposed, not reviewed"),
        reviews=[s.ScanReview(**r) for r in reviews],
    )


def _payload_meta(job: dict) -> dict:
    sig = job["signal"]
    lc = job["_lc"]
    return {"slug": f"scan-{job['id']}", "target": job["toi"] or f"TIC {job['tic_id']}", "tic": f"TIC {job['tic_id']}",
            "source": s.SourceRef(name=lc["source"]["name"], url=lc["source"]["url"]),
            "fetched_at": lc["source"]["fetched_at"], "sectors": job["sectors"], "n_cadences": job["n_cadences"],
            "processing": lc["processing"],
            "signal": s.PipelineSignal(period_d=sig["period_d"], t0_btjd=sig["t0_btjd"], duration_d=sig["duration_d"],
                                       depth_ppm=sig["depth_ppm"], snr=sig["snr"], power=sig["power"])}


def _finished(job_id: int) -> tuple[dict, object]:
    eng = _engine()
    job = queue.get(eng, job_id)
    if job is None or job["status"] != "succeeded" or not job.get("signal"):
        raise HTTPException(404, "this scan has no result yet")
    job["_lc"] = queue.run_payload(eng, job_id, "lightcurve")
    return job, eng


@router.get("/scans/{job_id}/lightcurve", response_model=s.LightCurveResponse, responses={**NO_DB, **NOT_FOUND})
def scan_lightcurve(response: Response, job_id: int = JOB_ID) -> s.LightCurveResponse:
    """The scan's light curve, in the same shape as /api/v2/lightcurves/{slug}."""
    job, _ = _finished(job_id)
    lc = job["_lc"]
    response.headers["Cache-Control"] = "public, max-age=3600"
    return s.LightCurveResponse(**_payload_meta(job), binning=s.Binning(**lc["binning"]), time_btjd=lc["time_btjd"],
                                flux_ppm=lc["flux_ppm"])


@router.get("/scans/{job_id}/periodogram", response_model=s.PeriodogramResponse, responses={**NO_DB, **NOT_FOUND})
def scan_periodogram(response: Response, job_id: int = JOB_ID) -> s.PeriodogramResponse:
    job, eng = _finished(job_id)
    pg = queue.run_payload(eng, job_id, "periodogram")
    response.headers["Cache-Control"] = "public, max-age=3600"
    return s.PeriodogramResponse(**_payload_meta(job), method=pg["method"], period_d=pg["period_d"], power=pg["power"])
