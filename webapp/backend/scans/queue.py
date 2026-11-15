"""Postgres job queue for scans (ADR 0003).

Claiming uses FOR UPDATE SKIP LOCKED, so concurrent workers never take the same
row. A claim takes a lease (locked_by, locked_until); a job whose lease expires
goes back to the queue, up to MAX_ATTEMPTS. Finishing only works while holding
the lease, so a job can never be completed twice.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import text
from sqlalchemy.engine import Engine

MAX_ATTEMPTS = 3
LEASE = timedelta(minutes=10)
MAX_QUEUED = 20  # across everyone
MAX_PER_REQUESTER_PER_HOUR = 5
CACHE_FOR = timedelta(days=30)  # a repeat scan within this window returns the earlier result


class QueueFull(Exception):
    pass


class RateLimited(Exception):
    pass


@dataclass
class Job:
    id: int
    target_id: int
    tic_id: int
    params: dict
    status: str
    attempts: int
    locked_by: str | None
    cache_key: str


def cache_key(tic_id: int, params: dict) -> str:
    raw = json.dumps({"tic": tic_id, **params}, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def requester_hash(client: str) -> str:
    """Store a hash, not the client address."""
    return hashlib.sha256(f"planet-hunter:{client}".encode()).hexdigest()[:32]


def _target_id(conn, tic_id: int, toi: str | None) -> int:
    row = conn.execute(
        text("insert into targets (tic_id, toi) values (:tic, :toi) "
             "on conflict (tic_id) do update set toi = coalesce(targets.toi, excluded.toi) returning id"),
        {"tic": tic_id, "toi": toi},
    ).first()
    return row[0]


def enqueue(engine: Engine, tic_id: int, params: dict, requester: str, toi: str | None = None) -> tuple[int, bool]:
    """Queue a scan, or return the existing job for the same target and parameters.

    Returns (job id, created). Raises RateLimited or QueueFull.
    """
    key = cache_key(tic_id, params)
    with engine.begin() as conn:
        # Serialize enqueues so the caps below cannot be raced past.
        conn.execute(text("select pg_advisory_xact_lock(726016)"))
        existing = conn.execute(
            text("select id from scan_jobs where cache_key = :k and (status in ('queued', 'running') or "
                 "(status = 'succeeded' and finished_at > now() - make_interval(secs => :ttl))) "
                 "order by created_at desc limit 1"),
            {"k": key, "ttl": CACHE_FOR.total_seconds()},
        ).first()
        if existing:
            return existing[0], False
        recent = conn.execute(
            text("select count(*) from scan_jobs where requester = :r and created_at > now() - interval '1 hour'"),
            {"r": requester},
        ).scalar()
        if recent >= MAX_PER_REQUESTER_PER_HOUR:
            raise RateLimited(f"at most {MAX_PER_REQUESTER_PER_HOUR} new scans per hour")
        queued = conn.execute(text("select count(*) from scan_jobs where status = 'queued'")).scalar()
        if queued >= MAX_QUEUED:
            raise QueueFull(f"{queued} scans are already waiting")
        target = _target_id(conn, tic_id, toi)
        job_id = conn.execute(
            text("insert into scan_jobs (target_id, params, cache_key, requester) "
                 "values (:t, cast(:p as jsonb), :k, :r) returning id"),
            {"t": target, "p": json.dumps(params), "k": key, "r": requester},
        ).scalar()
    return job_id, True


def claim(engine: Engine, worker: str, lease: timedelta = LEASE) -> Job | None:
    """Take the oldest available job: queued, or running with an expired lease and attempts left."""
    with engine.begin() as conn:
        row = conn.execute(
            text("""
                update scan_jobs j set status = 'running', locked_by = :w,
                       locked_until = now() + make_interval(secs => :lease),
                       attempts = j.attempts + 1, started_at = coalesce(j.started_at, now()), progress = 'starting'
                where j.id = (
                    select id from scan_jobs
                    where (status = 'queued' or (status = 'running' and locked_until < now()))
                      and attempts < :max
                    order by created_at
                    for update skip locked
                    limit 1)
                returning j.id, j.target_id, j.params, j.status, j.attempts, j.locked_by, j.cache_key"""),
            {"w": worker, "lease": lease.total_seconds(), "max": MAX_ATTEMPTS},
        ).first()
        if row is None:
            # Jobs that ran out of attempts while their lease expired are failed, not left hanging.
            conn.execute(text("update scan_jobs set status = 'failed', error = 'gave up after repeated failures', "
                              "finished_at = now() where status = 'running' and locked_until < now() "
                              "and attempts >= :max"), {"max": MAX_ATTEMPTS})
            return None
        tic = conn.execute(text("select tic_id from targets where id = :t"), {"t": row.target_id}).scalar()
    return Job(id=row.id, target_id=row.target_id, tic_id=tic, params=row.params, status=row.status,
               attempts=row.attempts, locked_by=row.locked_by, cache_key=row.cache_key)


def heartbeat(engine: Engine, job_id: int, worker: str, progress: str, lease: timedelta = LEASE) -> bool:
    """Renew the lease and record progress. False means the lease was lost: stop working on this job."""
    with engine.begin() as conn:
        n = conn.execute(
            text("update scan_jobs set locked_until = now() + make_interval(secs => :lease), progress = :p "
                 "where id = :id and locked_by = :w and status = 'running'"),
            {"lease": lease.total_seconds(), "p": progress[:200], "id": job_id, "w": worker},
        ).rowcount
    return n == 1


def complete(engine: Engine, job: Job, worker: str, run: dict, signal: dict) -> bool:
    """Store the result and mark the job succeeded, only if this worker still holds the lease."""
    with engine.begin() as conn:
        n = conn.execute(
            text("update scan_jobs set status = 'succeeded', finished_at = now(), locked_until = null, "
                 "progress = 'done', error = null where id = :id and locked_by = :w and status = 'running'"),
            {"id": job.id, "w": worker},
        ).rowcount
        if n != 1:
            return False
        run_id = conn.execute(
            text("insert into scan_runs (job_id, target_id, pipeline_version, sectors, n_cadences, lightcurve, "
                 "periodogram) values (:j, :t, :v, cast(:s as jsonb), :n, cast(:lc as jsonb), cast(:pg as jsonb)) "
                 "returning id"),
            {"j": job.id, "t": job.target_id, "v": run["pipeline_version"], "s": json.dumps(run["sectors"]),
             "n": run["n_cadences"], "lc": json.dumps(run["lightcurve"]), "pg": json.dumps(run["periodogram"])},
        ).scalar()
        conn.execute(
            text("insert into signals (run_id, period_d, t0_btjd, duration_d, depth_ppm, snr, power, vetting, "
                 "crossmatch, proposed_label) values (:r, :p, :t0, :d, :dep, :snr, :pw, cast(:v as jsonb), "
                 "cast(:x as jsonb), :lab)"),
            {"r": run_id, "p": signal["period_d"], "t0": signal["t0_btjd"], "d": signal["duration_d"],
             "dep": signal["depth_ppm"], "snr": signal["snr"], "pw": signal["power"],
             "v": json.dumps(signal["vetting"]), "x": json.dumps(signal["crossmatch"]),
             "lab": signal["proposed_label"]},
        )
    return True


def fail(engine: Engine, job: Job, worker: str, error: str, retry: bool) -> None:
    """Record a failure. Retryable failures go back to the queue while attempts remain."""
    with engine.begin() as conn:
        conn.execute(
            text("update scan_jobs set status = case when :retry and attempts < :max then 'queued' else 'failed' end, "
                 "error = :e, locked_by = null, locked_until = null, "
                 "finished_at = case when :retry and attempts < :max then null else now() end "
                 "where id = :id and locked_by = :w and status = 'running'"),
            {"retry": retry, "max": MAX_ATTEMPTS, "e": error[:2000], "id": job.id, "w": worker},
        )


def get(engine: Engine, job_id: int) -> dict | None:
    with engine.connect() as conn:
        row = conn.execute(
            text("select j.id, j.status, j.progress, j.error, j.params, j.attempts, j.created_at, j.started_at, "
                 "j.finished_at, t.tic_id, t.toi, r.id as run_id, r.pipeline_version, r.sectors, r.n_cadences "
                 "from scan_jobs j join targets t on t.id = j.target_id left join scan_runs r on r.job_id = j.id "
                 "where j.id = :id"),
            {"id": job_id},
        ).mappings().first()
        if row is None:
            return None
        out = dict(row)
        if out["run_id"]:
            sig = conn.execute(
                text("select id, period_d, t0_btjd, duration_d, depth_ppm, snr, power, vetting, crossmatch, "
                     "proposed_label from signals where run_id = :r order by id limit 1"), {"r": out["run_id"]},
            ).mappings().first()
            out["signal"] = dict(sig) if sig else None
            if sig:
                out["reviews"] = [dict(x) for x in conn.execute(
                    text("select label, reviewer, note, created_at from reviews where signal_id = :s order by id"),
                    {"s": sig["id"]}).mappings()]
        return out


def run_payload(engine: Engine, job_id: int, column: str) -> dict | None:
    if column not in ("lightcurve", "periodogram"):
        raise ValueError(column)
    with engine.connect() as conn:
        return conn.execute(text(f"select {column} from scan_runs where job_id = :id"), {"id": job_id}).scalar()
