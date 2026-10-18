"""Scan worker: claims jobs from Postgres and runs each in a child process.

    python -m scans.worker

The child has a memory cap (RLIMIT_AS) and a time limit; the parent renews the
job's lease while the child works, and records the result only while it still
holds the lease (ADR 0003).
"""
from __future__ import annotations

import multiprocessing as mp
import os
import signal
import socket
import sys
import time
import traceback

import db
from scans import queue

TIME_LIMIT_S = int(os.environ.get("SCAN_TIME_LIMIT_S", "900"))
MEMORY_LIMIT_MB = int(os.environ.get("SCAN_MEMORY_LIMIT_MB", "3000"))
POLL_S = 5
HEARTBEAT_S = 30


def _child(conn, tic_id: int, params: dict) -> None:
    try:
        import resource

        cap = MEMORY_LIMIT_MB * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (cap, cap))
    except (ImportError, ValueError, OSError):
        pass
    import importlib

    from scans import catalogs, run

    def progress(msg: str) -> None:
        conn.send(("progress", msg))

    # Tests swap in a fake scan with SCAN_RUNNER="module:function" (the child cannot see monkeypatches).
    runner = os.environ.get("SCAN_RUNNER")
    scan_fn = run.scan
    if runner:
        mod, fn = runner.split(":")
        scan_fn = getattr(importlib.import_module(mod), fn)
    try:
        result = scan_fn(tic_id, params, progress, catalogs.LiveCatalogs())
        conn.send(("ok", result))
    except run.NoData as exc:
        conn.send(("nodata", str(exc)))
    except MemoryError:
        conn.send(("error", f"the scan ran out of memory ({MEMORY_LIMIT_MB} MB limit)"))
    except Exception as exc:  # network and archive failures are retried
        conn.send(("transient", f"{type(exc).__name__}: {exc}"))


def run_job(engine, job: queue.Job, worker: str) -> None:
    ctx = mp.get_context("spawn")
    parent, child = ctx.Pipe(duplex=False)
    proc = ctx.Process(target=_child, args=(child, job.tic_id, job.params), daemon=True)
    proc.start()
    deadline = time.monotonic() + TIME_LIMIT_S
    last_beat = 0.0
    progress = "starting"
    outcome = None
    while outcome is None:
        if parent.poll(1):
            try:
                kind, payload = parent.recv()
            except EOFError:
                outcome = ("error", "the scan process stopped unexpectedly")
                break
            if kind == "progress":
                progress = payload
                last_beat = 0.0  # report progress right away
            else:
                outcome = (kind, payload)
        elif not proc.is_alive():
            outcome = ("error", f"the scan process exited (code {proc.exitcode}); it may have run out of memory")
        if time.monotonic() > deadline:
            proc.kill()
            outcome = ("error", f"the scan took longer than {TIME_LIMIT_S // 60} minutes")
        if outcome is None and time.monotonic() - last_beat > HEARTBEAT_S:
            if not queue.heartbeat(engine, job.id, worker, progress):
                proc.kill()  # someone else owns the job now
                return
            last_beat = time.monotonic()
    proc.join(5)
    kind, payload = outcome
    if kind == "ok":
        run, sig = payload
        queue.complete(engine, job, worker, run, sig)
    else:
        queue.fail(engine, job, worker, payload, retry=(kind == "transient"))


def main() -> int:
    engine = db.engine()
    if engine is None:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 1
    worker = f"{socket.gethostname()}:{os.getpid()}"
    stopping = False

    def stop(*_):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    print(f"scan worker {worker} started", flush=True)
    while not stopping:
        try:
            job = queue.claim(engine, worker)
        except Exception:
            traceback.print_exc()
            time.sleep(POLL_S)
            continue
        if job is None:
            time.sleep(POLL_S)
            continue
        print(f"job {job.id}: TIC {job.tic_id} (attempt {job.attempts})", flush=True)
        run_job(engine, job, worker)
    return 0


if __name__ == "__main__":
    sys.exit(main())
