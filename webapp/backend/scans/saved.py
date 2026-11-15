"""Saved scans (launch task T40): a short list of scans a signed-in person wants to come back to."""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine

MAX_SAVED = 50
MAX_LABEL = 80


class LimitReached(Exception):
    """The person already has MAX_SAVED saved scans."""


class NoSuchScan(Exception):
    """There is no scan with that id."""


def clean_label(label: str | None) -> str | None:
    """A label is plain text: control characters and runs of spaces are dropped; empty means no label."""
    if label is None:
        return None
    spaced = "".join(" " if ch.isspace() else ch for ch in label)  # tabs and line breaks become spaces first
    t = " ".join("".join(ch for ch in spaced if ch.isprintable()).split())
    return t[:MAX_LABEL] or None


_WHO = "user_id is not distinct from :u and member_id is not distinct from :m"


def save(eng: Engine, job_id: int, label: str | None, *, user_id: int | None, member_id: int | None) -> None:
    """Save (or relabel) a scan. Saving the same scan twice is fine and changes nothing but the label."""
    with eng.begin() as c:
        if c.execute(text("select 1 from scan_jobs where id = :j"), {"j": job_id}).first() is None:
            raise NoSuchScan(job_id)
        # One writer per person at a time, so the cap below cannot be raced past.
        key = (user_id if user_id is not None else -(member_id or 0)) % (2**31)
        c.execute(text("select pg_advisory_xact_lock(726017, cast(:k as integer))"), {"k": key})
        have = c.execute(text(f"select 1 from saved_scans where job_id = :j and {_WHO}"),
                         {"j": job_id, "u": user_id, "m": member_id}).first()
        if have is None:
            n = c.execute(text(f"select count(*) from saved_scans where {_WHO}"), {"u": user_id, "m": member_id}).scalar_one()
            if n >= MAX_SAVED:
                raise LimitReached(MAX_SAVED)
            c.execute(text("insert into saved_scans (user_id, member_id, job_id, label) values (:u, :m, :j, :l)"),
                      {"u": user_id, "m": member_id, "j": job_id, "l": clean_label(label)})
        else:
            c.execute(text(f"update saved_scans set label = :l where job_id = :j and {_WHO}"),
                      {"u": user_id, "m": member_id, "j": job_id, "l": clean_label(label)})


def remove(eng: Engine, job_id: int, *, user_id: int | None, member_id: int | None) -> bool:
    with eng.begin() as c:
        return c.execute(text(f"delete from saved_scans where job_id = :j and {_WHO}"),
                         {"j": job_id, "u": user_id, "m": member_id}).rowcount > 0


def is_saved(eng: Engine, job_id: int, *, user_id: int | None, member_id: int | None) -> bool:
    with eng.connect() as c:
        return c.execute(text(f"select 1 from saved_scans where job_id = :j and {_WHO}"),
                         {"j": job_id, "u": user_id, "m": member_id}).first() is not None


def list_saved(eng: Engine, *, user_id: int | None, member_id: int | None) -> list[dict]:
    """The person's saved scans, newest first, each with where the scan is now."""
    with eng.connect() as c:
        rows = c.execute(text(f"""
            select s.job_id, s.label, s.saved_at, j.status, t.tic_id, t.toi,
                   (select g.period_d from scan_runs r join signals g on g.run_id = r.id where r.job_id = j.id
                     order by g.id limit 1) as period_d,
                   (select g.snr from scan_runs r join signals g on g.run_id = r.id where r.job_id = j.id
                     order by g.id limit 1) as snr
              from saved_scans s join scan_jobs j on j.id = s.job_id join targets t on t.id = j.target_id
             where {_WHO.replace('user_id', 's.user_id').replace('member_id', 's.member_id')}
             order by s.saved_at desc, s.id desc"""), {"u": user_id, "m": member_id}).mappings()
        return [dict(r) for r in rows]
