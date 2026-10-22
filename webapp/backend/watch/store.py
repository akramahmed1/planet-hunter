"""Database side of the watchlist and the alerts (launch task T41)."""
from __future__ import annotations

import json

from sqlalchemy import text
from sqlalchemy.engine import Engine

from classroom import security

MAX_WATCHED = 20
_WHO = "user_id is not distinct from :u and member_id is not distinct from :m"


class LimitReached(Exception):
    pass


# ---------- watchlist ----------

def watched(eng: Engine, *, user_id: int | None, member_id: int | None) -> list[str]:
    with eng.connect() as c:
        return [r[0] for r in c.execute(text(f"select slug from watchlist where {_WHO} order by created_at, id"),
                                        {"u": user_id, "m": member_id})]


def watch(eng: Engine, slug: str, *, user_id: int | None, member_id: int | None) -> None:
    with eng.begin() as c:
        key = (user_id if user_id is not None else -(member_id or 0)) % (2**31)
        c.execute(text("select pg_advisory_xact_lock(726018, cast(:k as integer))"), {"k": key})
        if c.execute(text(f"select 1 from watchlist where slug = :s and {_WHO}"), {"s": slug, "u": user_id, "m": member_id}).first():
            return
        n = c.execute(text(f"select count(*) from watchlist where {_WHO}"), {"u": user_id, "m": member_id}).scalar_one()
        if n >= MAX_WATCHED:
            raise LimitReached(MAX_WATCHED)
        c.execute(text("insert into watchlist (user_id, member_id, slug) values (:u, :m, :s)"), {"u": user_id, "m": member_id, "s": slug})


def unwatch(eng: Engine, slug: str, *, user_id: int | None, member_id: int | None) -> None:
    with eng.begin() as c:
        c.execute(text(f"delete from watchlist where slug = :s and {_WHO}"), {"s": slug, "u": user_id, "m": member_id})


# ---------- email opt-in (teachers) ----------

def get_prefs(eng: Engine, user_id: int) -> bool:
    with eng.connect() as c:
        row = c.execute(text("select email_alerts from alert_prefs where user_id = :u"), {"u": user_id}).first()
    return bool(row and row[0])


def set_prefs(eng: Engine, user_id: int, on: bool) -> None:
    """Turn the email alerts on or off. The unsubscribe token is made once and kept, so an old email's link keeps working."""
    with eng.begin() as c:
        c.execute(text("""insert into alert_prefs (user_id, email_alerts, unsubscribe_token) values (:u, :on, :t)
                          on conflict (user_id) do update set email_alerts = :on, updated_at = now()"""),
                  {"u": user_id, "on": on, "t": security.new_token()})


def unsubscribe(eng: Engine, token: str) -> bool:
    """Turn alerts off for whoever holds this token. A second click is harmless."""
    with eng.begin() as c:
        return c.execute(text("update alert_prefs set email_alerts = false, updated_at = now() where unsubscribe_token = :t"),
                         {"t": token}).rowcount > 0


# ---------- snapshots and sends ----------

def latest_snapshot(eng: Engine) -> tuple[int, str, dict] | None:
    with eng.connect() as c:
        row = c.execute(text("select id, digest, data from candidate_snapshots order by id desc limit 1")).first()
    return (row[0], row[1], row[2]) if row else None


def save_snapshot(eng: Engine, digest: str, data: dict) -> int:
    with eng.begin() as c:
        return c.execute(text("insert into candidate_snapshots (digest, data) values (:d, cast(:j as jsonb)) returning id"),
                         {"d": digest, "j": json.dumps(data)}).scalar_one()


def recipients(eng: Engine) -> list[dict]:
    """Teachers who opted in and have a confirmed address, with their watched slugs."""
    with eng.connect() as c:
        rows = c.execute(text("""select u.id, u.email, u.display_name, p.unsubscribe_token,
                                        coalesce((select array_agg(w.slug) from watchlist w where w.user_id = u.id), '{}') as slugs
                                   from alert_prefs p join users u on u.id = p.user_id
                                  where p.email_alerts and u.email_verified_at is not null order by u.id""")).mappings()
        return [dict(r) for r in rows]


def claim_send(eng: Engine, snapshot_id: int, user_id: int) -> bool:
    """Record that this person is being sent this change. False if it was already recorded (never email twice)."""
    with eng.begin() as c:
        return c.execute(text("insert into alert_sends (snapshot_id, user_id) values (:s, :u) on conflict do nothing"),
                         {"s": snapshot_id, "u": user_id}).rowcount == 1


def finish_send(eng: Engine, snapshot_id: int, user_id: int, sent: bool, reason: str) -> None:
    with eng.begin() as c:
        c.execute(text("update alert_sends set sent = :x, reason = :r where snapshot_id = :s and user_id = :u"),
                  {"x": sent, "r": reason[:32], "s": snapshot_id, "u": user_id})
