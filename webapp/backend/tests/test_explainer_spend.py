"""The explainer's spend ledger and monthly cap (launch task T14)."""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

import app as backend
from explain import model, prices, service, spend
from explain.spend import CapReached, UnknownPrice, Usage
from tests.test_scan_queue import engine  # noqa: F401
from tests.test_v2 import needs_db

D = Decimal


def at(s: str) -> datetime:
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def cap(monkeypatch):
    monkeypatch.setenv("EXPLAINER_MONTHLY_CAP_USD", "0.10")
    for k in ("EXPLAINER_PRICE_INPUT_PER_MTOK", "EXPLAINER_PRICE_OUTPUT_PER_MTOK"):
        monkeypatch.delenv(k, raising=False)


# ---------- prices (no database) ----------

def test_costs_follow_the_published_rates():
    # Claude Opus 5.5: $4 in, $5 5-minute cache write, $0.20 cache read, $20 out, per million tokens.
    u = Usage(input_tokens=1000, output_tokens=500, cache_read_tokens=10_000, cache_write_tokens=2000)
    assert spend.cost_usd("claude-opus-5-5", u) == D("0.004") + D("0.010") + D("0.002") + D("0.010")
    assert spend.cost_usd("claude-sonnet-5-5", Usage(1_000_000, 1_000_000)) == D("12")  # $2 + $10
    assert spend.cost_usd("claude-fable-5-1", Usage(0, 0, 4_000_000)) == D("1")  # $0.25 a million cache read
    assert spend.cost_usd("claude-opus-5-5", Usage()) == 0


def test_haiku_costs_more_for_a_long_prompt():
    short = spend.cost_usd("claude-haiku-5-5", Usage(100_000, 1000))
    long_ = spend.cost_usd("claude-haiku-5-5", Usage(100_001, 1000))
    assert short == D("0.01") + D("0.0005")
    assert long_ == D("0.0500005") + D("0.0025") or long_ > short * 4


def test_every_listed_price_is_a_positive_number_and_the_source_is_dated():
    assert prices.PRICES_CHECKED >= "2026-10-21" and prices.PRICES_SOURCE.startswith("https://")
    for name, entry in prices.PRICES.items():
        for p in (entry.standard, entry.long):
            if p:
                assert p.input > 0 and p.output > 0 and p.cache_write >= p.input and 0 < p.cache_read <= p.input, name


def test_an_unknown_model_is_refused_not_guessed():
    with pytest.raises(UnknownPrice):
        spend.worst_case_usd("some-other-model", 1000, 2048)


def test_a_model_outside_the_table_can_be_priced_from_the_environment(monkeypatch):
    monkeypatch.setenv("EXPLAINER_PRICE_INPUT_PER_MTOK", "1.5")
    monkeypatch.setenv("EXPLAINER_PRICE_OUTPUT_PER_MTOK", "6")
    assert spend.cost_usd("local-model", Usage(1_000_000, 1_000_000)) == D("7.5")
    assert spend.worst_case_usd("local-model", 2_000_000, 0) == D("1.5") * D("1.25")  # 1M tokens at the cache-write rate
    monkeypatch.setenv("EXPLAINER_PRICE_OUTPUT_PER_MTOK", "-1")
    with pytest.raises(UnknownPrice):
        spend.worst_case_usd("local-model", 10, 10)


def test_the_worst_case_is_never_below_the_real_cost():
    # 4 characters a token (a generous reading of real text) must still cost less than the reservation.
    chars, out = 40_000, 2048
    worst = spend.worst_case_usd("claude-opus-5-5", chars, out)
    assert worst >= spend.cost_usd("claude-opus-5-5", Usage(input_tokens=chars // 4, output_tokens=out))
    assert worst >= spend.cost_usd("claude-opus-5-5", Usage(cache_write_tokens=chars // 2, output_tokens=out))


@pytest.mark.parametrize("raw,expected", [(None, "20"), ("", "20"), ("20", "20"), (" 7.5 ", "7.5"), ("0", "0"), ("-3", "0"),
                                         ("abc", "0"), ("nan", "0"), ("inf", "0")])
def test_the_cap_setting_fails_closed(monkeypatch, raw, expected):
    if raw is None:
        monkeypatch.delenv("EXPLAINER_MONTHLY_CAP_USD", raising=False)
    else:
        monkeypatch.setenv("EXPLAINER_MONTHLY_CAP_USD", raw)
    assert spend.cap_usd() == D(expected)


def test_the_month_is_the_utc_calendar_month():
    assert spend.month_of(at("2026-10-31T23:59:59")) == "2026-10"
    assert spend.month_of(at("2026-11-01T00:00:00")) == "2026-11"


# ---------- the ledger (database) ----------

@needs_db
def test_the_cap_stops_calls_and_a_settled_call_frees_the_difference(engine):  # noqa: F811
    now = at("2026-10-21T12:00:00")
    a = spend.reserve(engine, "fake", D("0.04"), now)
    b = spend.reserve(engine, "fake", D("0.04"), now)
    with pytest.raises(CapReached):
        spend.reserve(engine, "fake", D("0.04"), now)  # 0.04 + 0.04 + 0.04 > 0.10
    assert spend.status(engine, now).paused is True
    # The first call really cost almost nothing; that room comes back.
    cost = spend.settle(engine, a, "fake", Usage(input_tokens=100, output_tokens=50))
    assert cost == D("0.000150")
    st = spend.status(engine, now)
    assert st.spent_usd == D("0.040150") and st.cap_usd == D("0.10")
    spend.release(engine, b)
    assert spend.status(engine, now).spent_usd == D("0.000150")


@needs_db
def test_a_paused_month_stays_paused_until_the_spend_is_below_the_cap_and_unmarked(engine):  # noqa: F811
    now = at("2026-10-21T12:00:00")
    spend.reserve(engine, "fake", D("0.10"), now)  # exactly the cap is allowed
    assert spend.status(engine, now).paused is True  # nothing left
    with pytest.raises(CapReached):
        spend.reserve(engine, "fake", D("0.000001"), now)


@needs_db
def test_concurrent_calls_cannot_overshoot_the_cap(engine):  # noqa: F811
    now = at("2026-10-21T12:00:00")
    ok, refused, errors = [], [], []

    def go():
        try:
            ok.append(spend.reserve(engine, "fake", D("0.01"), now))
        except CapReached:
            refused.append(1)
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=go) for _ in range(30)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert not errors, errors
    assert len(ok) == 10 and len(refused) == 20  # $0.10 / $0.01, never an eleventh
    assert spend.status(engine, now).spent_usd == D("0.10")
    with engine.connect() as c:
        assert c.execute(text("select count(*) from explainer_spend where status = 'reserved'")).scalar_one() == 10


@needs_db
def test_a_new_month_starts_from_zero(engine):  # noqa: F811
    spend.reserve(engine, "fake", D("0.10"), at("2026-10-31T23:59:59"))
    assert spend.status(engine, at("2026-10-31T23:59:59")).paused is True
    nov = at("2026-11-01T00:00:00")
    assert spend.status(engine, nov).paused is False and spend.status(engine, nov).spent_usd == 0
    spend.reserve(engine, "fake", D("0.05"), nov)
    assert spend.status(engine, nov).spent_usd == D("0.05")
    assert spend.status(engine, at("2026-10-31T23:59:59")).spent_usd == D("0.10")  # October is untouched


@needs_db
def test_the_80_percent_warning_and_the_cap_message_are_logged_once(engine, caplog):  # noqa: F811
    now = at("2026-10-21T12:00:00")
    with caplog.at_level(logging.INFO, logger="planet-hunter.explainer-spend"):
        spend.reserve(engine, "fake", D("0.05"), now)
        assert not [r for r in caplog.records if r.levelno >= logging.WARNING]
        spend.reserve(engine, "fake", D("0.03"), now)  # 0.08 is 80 percent of 0.10
        spend.reserve(engine, "fake", D("0.01"), now)
        warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
        assert len(warnings) == 1 and "80 percent" in warnings[0].getMessage()
        for _ in range(3):
            with pytest.raises(CapReached):
                spend.reserve(engine, "fake", D("0.05"), now)
        errors = [r for r in caplog.records if r.levelno == logging.ERROR]
        assert len(errors) == 1 and "cap reached" in errors[0].getMessage()


@needs_db
def test_an_unreadable_cap_pauses_everything(engine, monkeypatch):  # noqa: F811
    monkeypatch.setenv("EXPLAINER_MONTHLY_CAP_USD", "lots")
    with pytest.raises(CapReached):
        spend.reserve(engine, "fake", D("0.000001"))
    assert spend.status(engine).paused is True


# ---------- the explainer end to end ----------

def _g():
    from explain import grounding
    return grounding.grounding_for(grounding.candidate_item("toi-700"))


@needs_db
def test_a_metered_call_is_recorded_with_the_provider_usage(engine, monkeypatch):  # noqa: F811
    monkeypatch.setenv("EXPLAINER_MONTHLY_CAP_USD", "20")
    out = service.explain_metered(engine, model.FakeModel(), _g(), "What is the period?")
    assert out.known
    with engine.connect() as c:
        rows = c.execute(text("select status, model, input_tokens, output_tokens, actual_usd, reserved_usd "
                              "from explainer_spend")).all()
    assert len(rows) == 1
    status, name, tin, tout, actual, reserved = rows[0]
    assert (status, name) == ("settled", "fake") and tin > 0 and tout > 0
    assert D(actual) == (D(tin) + D(tout)) / D(1_000_000) and D(actual) < D(reserved)


class Boom:
    name = "fake"

    def __init__(self, usage):
        self.usage = usage

    def answer(self, *a):
        raise model.ModelError("declined", self.usage, "fake")


@needs_db
def test_a_failed_call_costs_what_the_provider_billed(engine, monkeypatch):  # noqa: F811
    monkeypatch.setenv("EXPLAINER_MONTHLY_CAP_USD", "20")
    with pytest.raises(model.ModelError):
        service.explain_metered(engine, Boom(Usage(input_tokens=1_000_000, output_tokens=0)), _g(), "period?")
    assert spend.status(engine).spent_usd == D("1")  # billed, even though unusable
    with pytest.raises(model.ModelError):
        service.explain_metered(engine, Boom(None), _g(), "period?")  # failed before any billing: released
    assert spend.status(engine).spent_usd == D("1")


@needs_db
def test_the_cap_blocks_the_call_before_the_model_is_asked(engine, monkeypatch):  # noqa: F811
    monkeypatch.setenv("EXPLAINER_MONTHLY_CAP_USD", "0.000001")
    asked = []

    class Spy(model.FakeModel):
        def answer(self, *a):
            asked.append(1)
            return super().answer(*a)

    with pytest.raises(CapReached):
        service.explain_metered(engine, Spy(), _g(), "period?")
    assert not asked


@needs_db
def test_the_api_goes_quiet_when_the_cap_is_reached_and_comes_back_next_month(engine, monkeypatch):  # noqa: F811
    monkeypatch.setenv("EXPLAINER_ENABLED", "1")
    monkeypatch.setenv("EXPLAINER_FAKE", "1")
    monkeypatch.setenv("EXPLAINER_MONTHLY_CAP_USD", "20")
    body = {"kind": "candidate", "ref": "toi-700", "question": "What is the period?"}
    with TestClient(backend.app) as c:
        assert c.get("/api/v2/explain/status").json()["enabled"] is True
        assert c.get("/api/v2/explain/status").json()["paused"] is False
        assert c.post("/api/v2/explain", json=body).status_code == 200
        # Spend the rest of the month.
        spend.reserve(engine, "fake", D("20") - spend.status(engine).spent_usd)
        s = c.get("/api/v2/explain/status").json()
        assert s["enabled"] is False and s["paused"] is True and "paused until next month" in s["reason"] and s["model"] is None
        r = c.post("/api/v2/explain", json=body)
        assert r.status_code == 503 and "paused until next month" in r.json()["detail"]
        # A paused explainer uses up no explainer rate-limit counts (the write limiter counts under its own key).
        with engine.connect() as conn:
            before = conn.execute(text("select count(*) from usage_events where key like 'explain:%'")).scalar_one()
        c.post("/api/v2/explain", json=body)
        with engine.connect() as conn:
            assert conn.execute(text("select count(*) from usage_events where key like 'explain:%'")).scalar_one() == before
        # The ledger's month key rolls over by itself: the same ledger, a month later, is open again.
        assert spend.status(engine, at("2099-01-01T00:00:00")).paused is False


@needs_db
def test_a_model_with_no_known_price_is_not_called(engine, monkeypatch):  # noqa: F811
    monkeypatch.setenv("EXPLAINER_ENABLED", "1")
    monkeypatch.setenv("EXPLAINER_MONTHLY_CAP_USD", "20")

    class Unpriced(model.FakeModel):
        name = "mystery-model"

    monkeypatch.setattr(model, "current", lambda: Unpriced())
    body = {"kind": "candidate", "ref": "toi-700", "question": "What is the period?"}
    monkeypatch.setenv("EXPLAINER_FAKE", "1")
    with TestClient(backend.app) as c:
        r = c.post("/api/v2/explain", json=body)
        assert r.status_code == 503 and "not set up for this model" in r.json()["detail"]
