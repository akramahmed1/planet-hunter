"""The explainer's spend ledger and monthly cap (launch task T14).

Akram's rule: at most $20 a month (EXPLAINER_MONTHLY_CAP_USD). The mechanism:

1. BEFORE a model call, `reserve` adds a row for the call's worst-case cost, inside a transaction that holds
   a database lock. The sum of the month's rows (settled calls at their real cost, open reservations at
   their reserved cost) plus the new reservation must stay within the cap, otherwise `CapReached` is raised
   and no call is made. Because the check and the insert are one locked step, concurrent calls cannot
   overshoot the cap, on one server or several.
2. AFTER the call, `settle` replaces the reservation with the real cost from the provider's token usage.
   `release` drops a reservation when the call failed before the provider billed anything.
3. At 80 percent of the cap a warning is logged once; when the cap is first hit that is logged once too.
4. The month is the UTC calendar month; the next month starts from zero by itself.

A model with no known price is refused (UnknownPrice) rather than guessed at.
"""
from __future__ import annotations

import logging
import math
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.engine import Engine

from explain.prices import PRICES, Price

log = logging.getLogger("planet-hunter.explainer-spend")

DEFAULT_CAP_USD = Decimal("20")
WARN_AT = Decimal("0.8")
LOCK_KEY = 726019  # advisory lock for the ledger (726018 is the rate limits)
MTOK = Decimal(1_000_000)
PAUSED_MESSAGE = "The explainer is paused until next month to keep its running cost in check. Everything else works."


class CapReached(Exception):
    """This month's explainer budget is used up."""


class UnknownPrice(Exception):
    """No price is known for this model, so its cost cannot be limited."""


@dataclass(frozen=True)
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0


@dataclass(frozen=True)
class SpendStatus:
    month: str
    spent_usd: Decimal
    cap_usd: Decimal
    paused: bool
    reason: str | None


def month_of(now: datetime | None = None) -> str:
    return (now or datetime.now(timezone.utc)).astimezone(timezone.utc).strftime("%Y-%m")


def cap_usd() -> Decimal:
    """The monthly cap. An unreadable or non-positive setting means no spending at all, never "no limit"."""
    raw = os.environ.get("EXPLAINER_MONTHLY_CAP_USD")
    if raw is None or raw.strip() == "":
        return DEFAULT_CAP_USD
    try:
        value = Decimal(raw.strip())
    except Exception:  # noqa: BLE001 - any unparsable value
        log.error("EXPLAINER_MONTHLY_CAP_USD=%r is not a number; the explainer is paused", raw)
        return Decimal(0)
    return value if value.is_finite() and value > 0 else Decimal(0)


# ---------- prices ----------

def _override_price() -> Price | None:
    """EXPLAINER_PRICE_INPUT_PER_MTOK and EXPLAINER_PRICE_OUTPUT_PER_MTOK: for a model not in the table (another
    provider, a local server). Cache prices default to a conservative multiple of the input price."""
    i, o = os.environ.get("EXPLAINER_PRICE_INPUT_PER_MTOK"), os.environ.get("EXPLAINER_PRICE_OUTPUT_PER_MTOK")
    if not i or not o:
        return None
    try:
        inp, out = float(i), float(o)
    except ValueError:
        return None
    if inp < 0 or out < 0:
        return None
    return Price(inp, inp * 1.25, inp, out)  # cache reads at the full input price: never under-counts


def worst_price(model: str) -> Price:
    entry = PRICES.get(model)
    if entry:
        return entry.worst()
    override = _override_price()
    if override:
        return override
    raise UnknownPrice(f"No price is known for the model {model!r}, so the explainer will not call it. "
                       "Add it to explain/prices.py, or set EXPLAINER_PRICE_INPUT_PER_MTOK and EXPLAINER_PRICE_OUTPUT_PER_MTOK.")


def _price_for_usage(model: str, usage: Usage) -> Price:
    entry = PRICES.get(model)
    if entry:
        prompt = usage.input_tokens + usage.cache_read_tokens + usage.cache_write_tokens
        return entry.for_prompt(prompt)
    override = _override_price()
    if override:
        return override
    # Served by a model the table does not know (for example a fallback): count it at the dearest known rate.
    log.error("settling a call from the unpriced model %r at the dearest known rate", model)
    return max((p.worst() for k, p in PRICES.items() if k != "fake"), key=lambda p: p.output)


def cost_usd(model: str, usage: Usage) -> Decimal:
    p = _price_for_usage(model, usage)
    total = (Decimal(usage.input_tokens) * Decimal(str(p.input))
             + Decimal(usage.cache_write_tokens) * Decimal(str(p.cache_write))
             + Decimal(usage.cache_read_tokens) * Decimal(str(p.cache_read))
             + Decimal(usage.output_tokens) * Decimal(str(p.output)))
    return (total / MTOK).quantize(Decimal("0.000001"))


def worst_case_usd(model: str, prompt_chars: int, max_output_tokens: int) -> Decimal:
    """The most one call can cost: every input token billed at the cache-write rate (dearest input rate), at
    2 characters per token (real text is nearer 3 to 4), plus the full output allowance."""
    p = worst_price(model)
    input_tokens = math.ceil(prompt_chars / 2)
    total = (Decimal(input_tokens) * Decimal(str(max(p.input, p.cache_write)))
             + Decimal(max_output_tokens) * Decimal(str(p.output)))
    return (total / MTOK).quantize(Decimal("0.000001"), rounding="ROUND_UP")


# ---------- the ledger ----------

_SPENT = """select coalesce(sum(case when status = 'settled' then actual_usd else reserved_usd end), 0)
            from explainer_spend where month = :m and status <> 'released'"""


def status(eng: Engine, now: datetime | None = None) -> SpendStatus:
    """A cheap read for the status endpoint and the early check. Paused once the month's spend reaches the cap."""
    m, cap = month_of(now), cap_usd()
    with eng.connect() as c:
        spent = Decimal(c.execute(text(_SPENT), {"m": m}).scalar_one())
        capped = c.execute(text("select capped_at from explainer_spend_state where month = :m"), {"m": m}).scalar()
    if cap <= 0:
        return SpendStatus(m, spent, cap, True, PAUSED_MESSAGE)
    paused = spent >= cap or capped is not None
    return SpendStatus(m, spent, cap, paused, PAUSED_MESSAGE if paused else None)


def reserve(eng: Engine, model: str, worst_case: Decimal, now: datetime | None = None) -> int:
    """Hold back `worst_case` dollars for one call, or raise CapReached. Returns the ledger row id."""
    m, cap = month_of(now), cap_usd()
    over = False
    first_cap = False
    first_warn = False
    row = None
    after = Decimal(0)
    with eng.begin() as c:
        c.execute(text("select pg_advisory_xact_lock(:k)"), {"k": LOCK_KEY})
        spent = Decimal(c.execute(text(_SPENT), {"m": m}).scalar_one())
        if cap <= 0 or spent + worst_case > cap:
            over = True
            # now() is the start of this transaction, so capped_at = now() only when this very call set it.
            first_cap = c.execute(text("""insert into explainer_spend_state (month, capped_at) values (:m, now())
                                          on conflict (month) do update
                                            set capped_at = coalesce(explainer_spend_state.capped_at, now())
                                          returning (capped_at = now())"""), {"m": m}).scalar_one()
        else:
            row = c.execute(text("""insert into explainer_spend (month, model, status, reserved_usd)
                                    values (:m, :model, 'reserved', :r) returning id"""),
                            {"m": m, "model": model[:80], "r": worst_case}).scalar_one()
            after = spent + worst_case
            if after >= cap * WARN_AT:
                first_warn = c.execute(text("""insert into explainer_spend_state (month, warned_80_at) values (:m, now())
                                               on conflict (month) do update
                                                 set warned_80_at = coalesce(explainer_spend_state.warned_80_at, now())
                                               returning (warned_80_at = now())"""), {"m": m}).scalar_one()
    # Logged after the transaction has committed, and raised outside it so the cap marker is kept.
    if first_warn:
        log.warning("explainer spend is at 80 percent or more of its monthly cap: month=%s reserved+spent=%s cap=%s", m, after, cap)
    if over:
        if first_cap:
            log.error("explainer monthly cap reached: month=%s spent=%s cap=%s; the explainer is paused", m, spent, cap)
        raise CapReached(PAUSED_MESSAGE)
    return int(row)


def settle(eng: Engine, row_id: int, model: str, usage: Usage) -> Decimal:
    """Replace the reservation with the real cost. Returns the cost."""
    actual = cost_usd(model, usage)
    with eng.begin() as c:
        reserved = c.execute(text("""update explainer_spend set status = 'settled', actual_usd = :a, settled_at = now(),
                                            input_tokens = :i, output_tokens = :o, cache_read_tokens = :cr, cache_write_tokens = :cw,
                                            model = :model
                                     where id = :id and status = 'reserved' returning reserved_usd"""),
                             {"a": actual, "i": usage.input_tokens, "o": usage.output_tokens, "cr": usage.cache_read_tokens,
                              "cw": usage.cache_write_tokens, "model": model[:80], "id": row_id}).scalar()
    if reserved is not None and actual > Decimal(reserved):
        log.error("explainer call cost more than its reservation: %s > %s (model %s); raise the allowance", actual, reserved, model)
    return actual


def release(eng: Engine, row_id: int) -> None:
    """The call failed before the provider billed anything: give the reservation back."""
    with eng.begin() as c:
        c.execute(text("update explainer_spend set status = 'released', settled_at = now() where id = :id and status = 'reserved'"),
                  {"id": row_id})
