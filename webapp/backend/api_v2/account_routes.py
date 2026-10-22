"""Things a signed-in teacher or student keeps for themselves: saved scans (T40), later a watchlist (T41).

Every route here is for "any signed-in person" and only ever touches that person's own rows: the owner comes from the
session (api_v2/owner.py), never from the path or body. They are listed in the authorization matrix.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Path, Response

import db
from api_v2 import schemas as s
from api_v2.owner import owner
from classroom import auth as classroom_auth
from scans import saved

router = APIRouter(prefix="/api/v2", tags=["v2"])
NO_DB = {503: {"description": "Needs the database, which is not configured or not reachable"}}
UNAUTH = {401: {"description": "Not signed in"}}
JOB_ID = Path(..., ge=1, le=2**62)


def _engine():
    eng = db.engine()
    if eng is None:
        raise HTTPException(503, "this needs the database, which is not configured here")
    return eng


@router.get("/me/saved-scans", response_model=s.SavedScansResponse, responses={**NO_DB, **UNAUTH})
def my_saved_scans(response: Response, p=Depends(classroom_auth.ANYONE)) -> s.SavedScansResponse:
    """The signed-in person's saved scans, newest first."""
    response.headers["Cache-Control"] = "no-store"
    rows = saved.list_saved(_engine(), **owner(p))
    return s.SavedScansResponse(scans=[s.SavedScan(scan_id=r["job_id"], **{k: r[k] for k in (
        "label", "saved_at", "status", "tic_id", "toi", "period_d", "snr")}) for r in rows], limit=saved.MAX_SAVED)


@router.get("/me/saved-scans/{job_id}", response_model=s.SavedState, responses={**NO_DB, **UNAUTH})
def is_scan_saved(response: Response, job_id: int = JOB_ID, p=Depends(classroom_auth.ANYONE)) -> s.SavedState:
    """Whether this scan is in the signed-in person's list (so the scan page can show Save or Saved)."""
    response.headers["Cache-Control"] = "no-store"
    for r in saved.list_saved(_engine(), **owner(p)):
        if r["job_id"] == job_id:
            return s.SavedState(saved=True, label=r["label"])
    return s.SavedState(saved=False)


@router.put("/me/saved-scans/{job_id}", response_model=s.SavedState,
            responses={**NO_DB, **UNAUTH, 404: {"description": "No such scan"}, 409: {"description": "The list is full"}})
def save_scan(body: s.SaveScanRequest, response: Response, job_id: int = JOB_ID,
              p=Depends(classroom_auth.ANYONE)) -> s.SavedState:
    """Add a scan to the list (or change its label). Saving twice is fine."""
    try:
        saved.save(_engine(), job_id, body.label, **owner(p))
    except saved.NoSuchScan:
        raise HTTPException(404, "no such scan")
    except saved.LimitReached:
        raise HTTPException(409, f"Your list is full ({saved.MAX_SAVED} scans). Remove one to save another.")
    response.headers["Cache-Control"] = "no-store"
    return s.SavedState(saved=True, label=saved.clean_label(body.label))


@router.delete("/me/saved-scans/{job_id}", response_model=s.SavedState, responses={**NO_DB, **UNAUTH})
def unsave_scan(response: Response, job_id: int = JOB_ID, p=Depends(classroom_auth.ANYONE)) -> s.SavedState:
    """Take a scan off the list. Taking off one that is not there is fine."""
    saved.remove(_engine(), job_id, **owner(p))
    response.headers["Cache-Control"] = "no-store"
    return s.SavedState(saved=False)
