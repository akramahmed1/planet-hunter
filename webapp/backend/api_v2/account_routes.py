"""Things a signed-in teacher or student keeps for themselves: saved scans (T40), later a watchlist (T41).

Every route here is for "any signed-in person" and only ever touches that person's own rows: the owner comes from the
session (api_v2/owner.py), never from the path or body. They are listed in the authorization matrix.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Path, Response

import data_store
import db
import mailer
from api_v2 import schemas as s
from api_v2.owner import owner
from classroom import auth as classroom_auth
from classroom import data as classroom_data
from scans import saved
from watch import runner as watch_runner
from watch import store as watch_store

router = APIRouter(prefix="/api/v2", tags=["v2"])
NO_DB = {503: {"description": "Needs the database, which is not configured or not reachable"}}
UNAUTH = {401: {"description": "Not signed in"}}
JOB_ID = Path(..., ge=1, le=2**62)
SLUG = Path(..., pattern=r"^[a-z0-9-]{1,64}$")


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


# ---------- watchlist and alerts (launch task T41) ----------

def _published() -> dict:
    return {c.slug: c for c in data_store.results().candidates}


@router.get("/me/watchlist", response_model=s.WatchlistResponse, responses={**NO_DB, **UNAUTH})
def my_watchlist(response: Response, p=Depends(classroom_auth.ANYONE)) -> s.WatchlistResponse:
    """The candidates this person watches, with how each looks in the latest published results."""
    response.headers["Cache-Control"] = "no-store"
    pub = _published()
    rows = [pub[slug] for slug in watch_store.watched(_engine(), **owner(p)) if slug in pub]
    return s.WatchlistResponse(limit=watch_store.MAX_WATCHED, watched=[s.WatchedCandidate(
        slug=c.slug, target=c.target, classification=str(c.classification), label=c.classification_label,
        period_d=c.period_d) for c in rows])


@router.get("/me/watchlist/{slug}", response_model=s.WatchState, responses={**NO_DB, **UNAUTH})
def am_i_watching(response: Response, slug: str = SLUG, p=Depends(classroom_auth.ANYONE)) -> s.WatchState:
    response.headers["Cache-Control"] = "no-store"
    return s.WatchState(watching=slug in watch_store.watched(_engine(), **owner(p)))


@router.put("/me/watchlist/{slug}", response_model=s.WatchState,
            responses={**NO_DB, **UNAUTH, 404: {"description": "No such candidate"}, 409: {"description": "The list is full"}})
def watch_candidate(response: Response, slug: str = SLUG, p=Depends(classroom_auth.ANYONE)) -> s.WatchState:
    """Watch a published candidate. Watching twice is fine."""
    if slug not in _published():
        raise HTTPException(404, "no such candidate")
    try:
        watch_store.watch(_engine(), slug, **owner(p))
    except watch_store.LimitReached:
        raise HTTPException(409, f"Your watchlist is full ({watch_store.MAX_WATCHED}). Stop watching one to add another.")
    response.headers["Cache-Control"] = "no-store"
    return s.WatchState(watching=True)


@router.delete("/me/watchlist/{slug}", response_model=s.WatchState, responses={**NO_DB, **UNAUTH})
def unwatch_candidate(response: Response, slug: str = SLUG, p=Depends(classroom_auth.ANYONE)) -> s.WatchState:
    watch_store.unwatch(_engine(), slug, **owner(p))
    response.headers["Cache-Control"] = "no-store"
    return s.WatchState(watching=False)


def _alert_state(eng, p) -> s.AlertSettings:
    return s.AlertSettings(email_alerts=watch_store.get_prefs(eng, p.user_id), can_email=classroom_data.email_verified(eng, p.user_id),
                           email_ready=mailer.configured() and watch_runner.base_url() is not None)


@router.get("/me/alerts", response_model=s.AlertSettings, responses={**NO_DB, **UNAUTH})
def my_alerts(response: Response, p=Depends(classroom_auth.TEACHER)) -> s.AlertSettings:
    """A teacher's email alert setting. Students have no email address, so they have none."""
    response.headers["Cache-Control"] = "no-store"
    return _alert_state(_engine(), p)


@router.put("/me/alerts", response_model=s.AlertSettings,
            responses={**NO_DB, **UNAUTH, 409: {"description": "Confirm your email address first"}})
def set_my_alerts(body: s.AlertSettingsUpdate, response: Response, p=Depends(classroom_auth.TEACHER)) -> s.AlertSettings:
    """Turn the email about new or changed candidates on or off. On needs a confirmed address."""
    eng = _engine()
    if body.email_alerts and not classroom_data.email_verified(eng, p.user_id):
        raise HTTPException(409, "Confirm your email address first (the link we emailed you), then turn this on.")
    watch_store.set_prefs(eng, p.user_id, body.email_alerts)
    response.headers["Cache-Control"] = "no-store"
    return _alert_state(eng, p)
