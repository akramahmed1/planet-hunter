"""At server start: say what changed in the published candidates, and email the teachers who asked to hear (T41).

The first run only records a baseline (no email), so turning this on never sends a blast about candidates that were
already there. After that, a start with a different snapshot saves it and sends each opted-in teacher with a confirmed
address at most one email about that change (the (snapshot, teacher) row is written first, so a restart in the middle
cannot send twice; the price is that a failed send is not retried, and the reason is kept).
"""
from __future__ import annotations

import logging
import os
from typing import Callable

from sqlalchemy.engine import Engine

import mailer
from watch import digest, store

log = logging.getLogger("planethunter.alerts")
MAX_PER_RUN = 500  # a safety cap on one change's emails; the rest are logged, never silently dropped


def base_url() -> str | None:
    base = os.environ.get("APP_BASE_URL", "").strip().rstrip("/")
    return base if base.startswith(("https://", "http://localhost", "http://127.0.0.1")) else None


def run(eng: Engine, candidates, send: Callable[[str, str, str], mailer.Result] = mailer.send) -> dict:
    """Compare the published candidates with the last snapshot and email the people who asked. Returns counts."""
    snap = digest.snapshot(candidates)
    d = digest.digest(snap)
    last = store.latest_snapshot(eng)
    if last is None:
        store.save_snapshot(eng, d, snap)
        return {"baseline": True, "sent": 0, "skipped": 0, "failed": 0, "changes": 0}
    _, last_digest, old = last
    if last_digest == d:
        return {"baseline": False, "sent": 0, "skipped": 0, "failed": 0, "changes": 0}
    change = digest.diff(old, snap)
    sid = store.save_snapshot(eng, d, snap)
    out = {"baseline": False, "sent": 0, "skipped": 0, "failed": 0, "changes": len(change["new"]) + len(change["changed"])}
    if not digest.has_changes(change):
        return out
    base = base_url()
    if base is None:
        log.warning("candidate change emails not sent: APP_BASE_URL is not set")
        return out
    for i, r in enumerate(store.recipients(eng)):
        if i >= MAX_PER_RUN:
            log.warning("candidate change emails stopped at %d recipients", MAX_PER_RUN)
            break
        msg = digest.compose(r["display_name"], base, f"{base}/alerts/unsubscribe#token={r['unsubscribe_token']}", change, snap, set(r["slugs"]))
        if msg is None:
            out["skipped"] += 1
            continue
        if not store.claim_send(eng, sid, r["id"]):
            out["skipped"] += 1
            continue
        res = send(r["email"], msg[0], msg[1])
        store.finish_send(eng, sid, r["id"], res.sent, res.reason)
        out["sent" if res.sent else "failed"] += 1
    log.info("candidate change emails: %s", out)
    return out
