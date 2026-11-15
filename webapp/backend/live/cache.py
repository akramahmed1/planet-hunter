"""The external_cache: last good copy of every upstream response.

`cached(key, ttl, fetch)` returns a fresh copy when one exists, otherwise calls
`fetch`. If the fetch fails it serves the last good copy with stale=True; only
when there has never been a good copy does it raise Unavailable.

Storage is the Postgres table when DATABASE_URL is set, else an in-process
dict (local runs and tests). A database error falls back to the dict too, so
the cache can never take an endpoint down.
"""
from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Callable

from sqlalchemy import Column, DateTime, MetaData, String, Table, select
from sqlalchemy.dialects.postgresql import JSONB, insert

import db
from live import clock
from live.http import FetchError

log = logging.getLogger("planet-hunter.cache")

metadata = MetaData()
external_cache = Table(
    "external_cache",
    metadata,
    Column("key", String(255), primary_key=True),
    Column("payload", JSONB, nullable=False),
    Column("source", JSONB, nullable=False),
    Column("fetched_at", DateTime(timezone=True), nullable=False),
    Column("expires_at", DateTime(timezone=True), nullable=False),
)


class Unavailable(Exception):
    """No fresh data and no previous good copy to fall back on."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


@dataclass
class Cached:
    payload: Any
    fetched_at: datetime
    stale: bool


@dataclass
class _Row:
    payload: Any
    source: dict
    fetched_at: datetime
    expires_at: datetime


_memory: dict[str, _Row] = {}
_lock = threading.Lock()

# After a failed fetch with nothing to fall back on, answer "unavailable" from
# memory for a short while instead of retrying upstream on every request: a
# down service (DONKI in Phase 0) must not slow every page view or get hammered.
FAILURE_BACKOFF = timedelta(minutes=2)
_failed_until: dict[str, tuple[datetime, str]] = {}


def _read(key: str) -> _Row | None:
    eng = db.engine()
    if eng is not None:
        try:
            with eng.connect() as conn:
                r = conn.execute(select(external_cache).where(external_cache.c.key == key)).first()
            return _Row(r.payload, r.source, r.fetched_at, r.expires_at) if r else None
        except Exception as exc:  # database trouble must not break the endpoint
            log.warning("cache read failed, using memory: %s", type(exc).__name__)
    with _lock:
        return _memory.get(key)


def _write(key: str, row: _Row) -> None:
    with _lock:
        _memory[key] = row
    eng = db.engine()
    if eng is None:
        return
    try:
        values = dict(key=key, payload=row.payload, source=row.source,
                      fetched_at=row.fetched_at, expires_at=row.expires_at)
        stmt = insert(external_cache).values(**values)
        stmt = stmt.on_conflict_do_update(index_elements=["key"], set_={k: v for k, v in values.items() if k != "key"})
        with eng.begin() as conn:
            conn.execute(stmt)
    except Exception as exc:
        log.warning("cache write failed, kept in memory: %s", type(exc).__name__)


LAST_GOOD_TTL = timedelta(days=30)
_flights: dict[str, threading.Lock] = {}


def _flight(key: str) -> threading.Lock:
    with _lock:
        return _flights.setdefault(key, threading.Lock())


def cached(key: str, ttl: timedelta, fetch: Callable[[], Any], source: dict, fallback_key: str | None = None) -> Cached:
    """Fresh copy, else fetch (one caller per key at a time), else the last good copy as stale.

    `fallback_key` names a stable key that every success also writes, for data whose own key
    changes each day (APOD, DONKI): when today's key is empty and the fetch fails, the last good
    copy under `fallback_key` is served as stale instead of nothing.
    """
    now = clock.now()
    row = _read(key)
    if row and row.expires_at > now:
        return Cached(row.payload, row.fetched_at, stale=False)
    # Concurrent misses for one key wait for the first caller's fetch and read its result.
    with _flight(key):
        now = clock.now()
        row = _read(key)
        if row and row.expires_at > now:
            return Cached(row.payload, row.fetched_at, stale=False)
        if row is None and fallback_key:
            row = _read(fallback_key)
        with _lock:
            failed = _failed_until.get(key)
        if failed and failed[0] > now:
            if row:
                return Cached(row.payload, row.fetched_at, stale=True)
            raise Unavailable(failed[1])
        try:
            payload = _fetch_within_budget(key, ttl, fetch, source, now, fallback_key)
        except FetchError as exc:
            with _lock:
                _failed_until[key] = (now + FAILURE_BACKOFF, str(exc))
            if row:
                return Cached(row.payload, row.fetched_at, stale=True)
            raise Unavailable(str(exc)) from exc
        return Cached(payload, now, stale=False)


# A visitor waits at most this long for an upstream source. A slow one (NASA retrying for 30 to 45 s was seen on staging)
# no longer holds the page: the last good copy is served at once, and the fetch finishes in the background and updates
# the cache for the next visitor. The daily refresh calls `refresh`, which has no such limit.
REQUEST_BUDGET_S = 6.0


def _fetch_within_budget(key: str, ttl: timedelta, fetch: Callable[[], Any], source: dict, now: datetime,
                         fallback_key: str | None) -> Any:
    box: dict[str, Any] = {}
    done = threading.Event()

    def run() -> None:
        try:
            payload = fetch()
        except BaseException as exc:  # handed to the waiting caller, or dropped if it gave up
            box["error"] = exc
            done.set()
            return
        # Stored here, not by the caller, so a fetch that finishes after the caller gave up still fills the cache.
        with _lock:
            _failed_until.pop(key, None)
        _store(key, ttl, payload, source, now, fallback_key)
        box["payload"] = payload
        done.set()

    threading.Thread(target=run, name=f"cache-fetch:{key}", daemon=True).start()
    if not done.wait(REQUEST_BUDGET_S):
        # The key can carry a name from the address (an exoplanet), so line breaks are removed before it is logged.
        safe_key = key.replace("\r", "").replace("\n", "")
        log.warning("fetch for %s still running after %.0f s; serving the last good copy if there is one", safe_key,
                    REQUEST_BUDGET_S)
        raise FetchError(f"no answer within {REQUEST_BUDGET_S:.0f} s")
    if "error" in box:
        raise box["error"]
    return box["payload"]


def _store(key: str, ttl: timedelta, payload: Any, source: dict, now: datetime, fallback_key: str | None) -> None:
    _write(key, _Row(payload, source, now, now + ttl))
    if fallback_key:
        _write(fallback_key, _Row(payload, source, now, now + LAST_GOOD_TTL))


def clear_memory() -> None:
    """Tests only."""
    with _lock:
        _memory.clear()
        _failed_until.clear()
        _flights.clear()


def refresh(key: str, ttl: timedelta, fetch: Callable[[], Any], source: dict, fallback_key: str | None = None) -> bool:
    """Fetch now and store, whatever the current copy (the daily cron). False if the fetch failed."""
    try:
        payload = fetch()
    except FetchError:
        return False
    _store(key, ttl, payload, source, clock.now(), fallback_key)
    return True
