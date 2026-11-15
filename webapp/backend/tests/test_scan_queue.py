"""Scan job queue (ADR 0003): concurrency, leases, caps and caching, against a real Postgres."""
import threading
from datetime import timedelta

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from scans import queue
from tests.test_v2 import BACKEND, TEST_DB, needs_db

RUN = {"pipeline_version": "test", "sectors": [1], "n_cadences": 10, "lightcurve": {}, "periodogram": {}}
SIGNAL = {"period_d": 1.0, "t0_btjd": 0.0, "duration_d": 0.1, "depth_ppm": 100.0, "snr": 5.0, "power": 0.1,
          "vetting": {}, "crossmatch": {}, "proposed_label": "no_match"}


@pytest.fixture
def engine():
    assert TEST_DB, "REQUIRE_DB is set but TEST_DATABASE_URL is empty"
    from db import database_url
    import os
    os.environ["DATABASE_URL"] = TEST_DB
    url = database_url()
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "migrations"))
    cfg.attributes["database_url"] = url
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    eng = create_engine(url, pool_size=20, max_overflow=0)
    yield eng
    eng.dispose()
    command.downgrade(cfg, "base")
    del os.environ["DATABASE_URL"]


def P(n=1):
    return {"period_min": 0.5, "period_max": 30.0, "n": n}


@needs_db
def test_concurrent_claims_never_hand_out_a_job_twice(engine):
    ids = {queue.enqueue(engine, 1000 + i, P(), f"r{i}")[0] for i in range(12)}
    claimed: list[int] = []
    lock = threading.Lock()

    def worker(name):
        while True:
            job = queue.claim(engine, name)
            if job is None:
                return
            with lock:
                claimed.append(job.id)
            assert queue.complete(engine, job, name, RUN, SIGNAL)

    threads = [threading.Thread(target=worker, args=(f"w{k}",)) for k in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(claimed) == sorted(ids)  # every job exactly once
    with engine.connect() as c:
        assert c.execute(text("select count(*) from scan_runs")).scalar() == 12
        assert c.execute(text("select count(*) from scan_jobs where status = 'succeeded'")).scalar() == 12


@needs_db
def test_expired_lease_is_reclaimed_and_the_old_worker_cannot_finish(engine):
    job_id, _ = queue.enqueue(engine, 2000, P(), "r")
    a = queue.claim(engine, "a", lease=timedelta(seconds=-1))  # lease already expired: "a" crashed
    assert a.id == job_id
    b = queue.claim(engine, "b")
    assert b.id == job_id and b.attempts == 2
    assert queue.heartbeat(engine, job_id, "a", "still here?") is False
    assert queue.complete(engine, a, "a", RUN, SIGNAL) is False
    assert queue.complete(engine, b, "b", RUN, SIGNAL) is True
    assert queue.complete(engine, b, "b", RUN, SIGNAL) is False  # never completed twice
    with engine.connect() as c:
        assert c.execute(text("select count(*) from scan_runs")).scalar() == 1


@needs_db
def test_job_fails_after_max_attempts(engine):
    job_id, _ = queue.enqueue(engine, 3000, P(), "r")
    for _ in range(queue.MAX_ATTEMPTS):
        assert queue.claim(engine, "w", lease=timedelta(seconds=-1)).id == job_id
    assert queue.claim(engine, "w") is None
    assert queue.get(engine, job_id)["status"] == "failed"


@needs_db
def test_retryable_failure_requeues_then_gives_up(engine):
    job_id, _ = queue.enqueue(engine, 3500, P(), "r")
    for k in range(queue.MAX_ATTEMPTS):
        job = queue.claim(engine, "w")
        queue.fail(engine, job, "w", "MAST timed out", retry=True)
        expected = "queued" if k < queue.MAX_ATTEMPTS - 1 else "failed"
        assert queue.get(engine, job_id)["status"] == expected


@needs_db
def test_repeat_scan_returns_the_same_job(engine):
    a, created = queue.enqueue(engine, 4000, P(), "r1")
    assert created
    b, created = queue.enqueue(engine, 4000, P(), "r2")
    assert (b, created) == (a, False)
    job = queue.claim(engine, "w")
    queue.complete(engine, job, "w", RUN, SIGNAL)
    c, created = queue.enqueue(engine, 4000, P(), "r3")  # cached result, still no new work
    assert (c, created) == (a, False)
    d, created = queue.enqueue(engine, 4000, P(2), "r3")  # different parameters: new job
    assert created and d != a


@needs_db
def test_rate_limit_and_queue_cap(engine):
    for i in range(queue.MAX_PER_REQUESTER_PER_HOUR):
        queue.enqueue(engine, 5000 + i, P(), "same")
    with pytest.raises(queue.RateLimited):
        queue.enqueue(engine, 5999, P(), "same")
    for i in range(queue.MAX_QUEUED - queue.MAX_PER_REQUESTER_PER_HOUR):
        queue.enqueue(engine, 6000 + i, P(), f"other{i}")
    with pytest.raises(queue.QueueFull):
        queue.enqueue(engine, 6999, P(), "new")


@needs_db
def test_concurrent_enqueues_respect_the_cap(engine):
    errors = []

    def go(i):
        try:
            queue.enqueue(engine, 7000 + i, P(), f"c{i}")
        except queue.QueueFull:
            errors.append(i)

    threads = [threading.Thread(target=go, args=(i,)) for i in range(queue.MAX_QUEUED + 5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    with engine.connect() as c:
        assert c.execute(text("select count(*) from scan_jobs")).scalar() == queue.MAX_QUEUED
    assert len(errors) == 5


# ---------- the worker ----------

from scans import worker  # noqa: E402


def _run_one(engine, monkeypatch, runner, tic):
    monkeypatch.setenv("SCAN_RUNNER", f"tests.fake_scans:{runner}")
    job_id, _ = queue.enqueue(engine, tic, P(), "w")
    job = queue.claim(engine, "w1")
    worker.run_job(engine, job, "w1")
    return queue.get(engine, job_id)


@needs_db
def test_worker_records_a_successful_scan(engine, monkeypatch):
    got = _run_one(engine, monkeypatch, "ok", 8001)
    assert got["status"] == "succeeded" and got["signal"]["period_d"] == 3.0


@needs_db
def test_worker_runs_scans_with_one_maths_thread(engine, monkeypatch):
    # Many-core hosts otherwise make OpenBLAS fail to allocate under the memory cap.
    for k in worker.SINGLE_THREAD_ENV:
        monkeypatch.delenv(k, raising=False)
    got = _run_one(engine, monkeypatch, "threads", 8006)
    assert got["status"] == "succeeded"
    assert got["signal"]["crossmatch"]["env"] == {"OPENBLAS_NUM_THREADS": "1", "OMP_NUM_THREADS": "1"}


@needs_db
def test_worker_fails_permanently_without_data(engine, monkeypatch):
    got = _run_one(engine, monkeypatch, "nodata", 8002)
    assert got["status"] == "failed" and "no TESS SPOC light curves" in got["error"]


@needs_db
def test_worker_requeues_transient_errors(engine, monkeypatch):
    got = _run_one(engine, monkeypatch, "flaky", 8003)
    assert got["status"] == "queued" and "MAST timed out" in got["error"]


@needs_db
def test_worker_enforces_the_time_limit(engine, monkeypatch):
    monkeypatch.setattr(worker, "TIME_LIMIT_S", 2)
    got = _run_one(engine, monkeypatch, "slow", 8004)
    assert got["status"] == "failed" and "longer than" in got["error"]


@needs_db
def test_worker_enforces_the_memory_cap(engine, monkeypatch):
    monkeypatch.setenv("SCAN_MEMORY_LIMIT_MB", "600")
    import importlib
    importlib.reload(worker)
    got = _run_one(engine, monkeypatch, "hog", 8005)
    assert got["status"] == "failed" and "memory" in got["error"]
