"""What each model costs, in US dollars per million tokens (launch task T14).

These are the provider's published rates, copied from https://platform.claude.com/docs/en/about-claude/pricing
and checked on 2026-10-21. They are config, not logic: when the provider changes a price or a model is added,
change the row and PRICES_CHECKED. A model with no row here is never called (see spend.price_for), so a wrong
or missing price cannot silently under-count spend. Cache reads on Claude Opus 5.5 and Sonnet 5.5 are 0.05x
the base input price; on Fable 5.1 0.025x; on every other listed model 0.1x.
"""
from __future__ import annotations

from dataclasses import dataclass

PRICES_CHECKED = "2026-10-21"
PRICES_SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing"


@dataclass(frozen=True)
class Price:
    input: float          # base input tokens
    cache_write: float    # 5 minute cache write
    cache_read: float     # cache hit
    output: float


@dataclass(frozen=True)
class ModelPrice:
    standard: Price
    # Claude Haiku 5.5 costs more when the prompt is over 100,000 tokens.
    long_over_tokens: int | None = None
    long: Price | None = None

    def for_prompt(self, prompt_tokens: int) -> Price:
        if self.long and self.long_over_tokens is not None and prompt_tokens > self.long_over_tokens:
            return self.long
        return self.standard

    def worst(self) -> Price:
        """The dearest rate that could apply, for reserving before the call."""
        return self.long or self.standard


PRICES: dict[str, ModelPrice] = {
    "claude-fable-5-1": ModelPrice(Price(10.0, 12.5, 0.25, 50.0)),
    "claude-opus-5-5": ModelPrice(Price(4.0, 5.0, 0.20, 20.0)),
    "claude-opus-5": ModelPrice(Price(5.0, 6.25, 0.50, 25.0)),
    "claude-opus-4-8": ModelPrice(Price(5.0, 6.25, 0.50, 25.0)),
    "claude-sonnet-5-5": ModelPrice(Price(2.0, 2.5, 0.10, 10.0)),
    "claude-sonnet-5": ModelPrice(Price(2.0, 2.5, 0.20, 10.0)),
    "claude-haiku-5-5": ModelPrice(Price(0.10, 0.125, 0.01, 0.50), 100_000, Price(0.50, 0.625, 0.05, 2.50)),
    # The deterministic stand-in used by tests and CI. Not a real price: a round number so tests can count.
    "fake": ModelPrice(Price(1.0, 1.0, 1.0, 1.0)),
}
