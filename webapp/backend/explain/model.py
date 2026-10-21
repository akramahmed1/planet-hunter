"""The language model behind the explainer, behind one small interface (Phase 9).

`AnthropicModel` calls Claude through the official SDK. `FakeModel` is deterministic and
needs no key: tests and the offline eval run against it. The explainer is switched off
unless EXPLAINER_ENABLED=1 and ANTHROPIC_API_KEY are both set (Akram, 2026-10-18).
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Protocol

from explain.spend import Usage

# The answer every model must return; the service checks it again before showing it.
ANSWER_SCHEMA = {
    "type": "object",
    "properties": {
        "known": {"type": "boolean"},
        "answer": {"type": "string"},
        "citations": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["known", "answer", "citations"],
    "additionalProperties": False,
}


@dataclass(frozen=True)
class Reply:
    known: bool
    answer: str
    citations: list[str]
    model: str
    usage: Usage | None = None  # what the provider billed, from its own response


class ModelError(Exception):
    """The model could not answer (refusal, bad output, API failure).

    `usage` and `model` are set when the provider did answer (so it billed tokens) but the answer was unusable:
    the spend ledger still counts that call.
    """

    def __init__(self, message: str, usage: Usage | None = None, model: str | None = None):
        super().__init__(message)
        self.usage = usage
        self.model = model


class Model(Protocol):
    name: str

    def answer(self, system: str, grounding_json: str, question: str) -> Reply: ...


class AnthropicModel:
    """Claude via the Messages API with structured output.

    The model ID comes from EXPLAINER_MODEL (default claude-opus-5-5). Effort is low:
    the task is short reading comprehension over one item. Server-side refusal
    fallbacks are on, so a declined request is retried on the fallback model.
    """

    def __init__(self, model: str | None = None):
        import anthropic

        self.name = model or os.environ.get("EXPLAINER_MODEL", "claude-opus-5-5")
        self._client = anthropic.Anthropic(timeout=30.0, max_retries=1)
        self._anthropic = anthropic

    def answer(self, system: str, grounding_json: str, question: str) -> Reply:
        a = self._anthropic
        try:
            response = self._client.beta.messages.create(
                model=self.name,
                max_tokens=2048,
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                output_config={"effort": "low", "format": {"type": "json_schema", "schema": ANSWER_SCHEMA}},
                # The lessons and item are data, sent in the user turn; the system prompt is fixed.
                system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": [
                    {"type": "text", "text": f"<grounding>\n{grounding_json}\n</grounding>"},
                    {"type": "text", "text": f"<question>\n{question}\n</question>"},
                ]}],
            )
        except a.RateLimitError as exc:
            raise ModelError("the explainer is busy; try again in a minute") from exc
        except a.APIStatusError as exc:
            raise ModelError(f"the explainer service returned {exc.status_code}") from exc
        except a.APIConnectionError as exc:
            raise ModelError("the explainer service could not be reached") from exc
        usage = _usage_of(response)
        if response.stop_reason == "refusal":
            raise ModelError("the explainer declined to answer this question", usage, response.model)
        if response.stop_reason == "max_tokens":
            raise ModelError("the explainer's answer was cut off", usage, response.model)
        text = next((b.text for b in response.content if b.type == "text"), "")
        try:
            data = json.loads(text)
            return Reply(known=bool(data["known"]), answer=str(data["answer"]),
                         citations=[str(c) for c in data["citations"]], model=response.model, usage=usage)
        except (ValueError, KeyError, TypeError) as exc:
            raise ModelError("the explainer returned an answer in the wrong shape", usage, response.model) from exc


def _usage_of(response) -> Usage:
    """Token counts as the provider reported them. Missing fields count as zero."""
    u = getattr(response, "usage", None)
    return Usage(
        input_tokens=int(getattr(u, "input_tokens", 0) or 0),
        output_tokens=int(getattr(u, "output_tokens", 0) or 0),
        cache_read_tokens=int(getattr(u, "cache_read_input_tokens", 0) or 0),
        cache_write_tokens=int(getattr(u, "cache_creation_input_tokens", 0) or 0),
    )


class FakeModel:
    """Deterministic stand-in: answers from field names that appear in the question.

    It follows the same contract as the real model (cite paths, say "not known"), so the
    service's checks, rate limits and the eval harness can be tested without a key.
    """

    name = "fake"
    WORDS = {
        "period": ["item.period_d", "item.signal.period_d", "item.planets[0].pl_orbper"],
        "depth": ["item.depth_ppm", "item.signal.depth_ppm"],
        "deep": ["item.depth_ppm", "item.signal.depth_ppm"],
        "snr": ["item.snr", "item.signal.snr"],
        "signal-to-noise": ["item.snr", "item.signal.snr"],
        "classif": ["item.classification_label"],
        "binary": ["item.classification_label", "item.proposed_label"],
        "label": ["item.classification_label", "item.proposed_label", "item.label_status"],
        "habitable": ["item.habitable_zone"],
        "star": ["item.star"],
    }

    def answer(self, system: str, grounding_json: str, question: str) -> Reply:
        g = json.loads(grounding_json)
        q = question.lower()
        from explain.grounding import resolve

        for word, paths in self.WORDS.items():
            if word in q:
                for path in paths:
                    try:
                        value = resolve(g, path)
                    except KeyError:
                        continue
                    shown = json.dumps(value) if not isinstance(value, str) else value
                    shown = re.sub(r"\s+", " ", shown)[:200]
                    answer = f"From this page's data: {shown}."
                    return Reply(known=True, answer=answer, citations=[path], model=self.name,
                                 usage=self._usage(system, grounding_json, question, answer))
        answer = "Not known from this page's data."
        return Reply(known=False, answer=answer, citations=[], model=self.name,
                     usage=self._usage(system, grounding_json, question, answer))

    @staticmethod
    def _usage(system: str, grounding_json: str, question: str, answer: str) -> Usage:
        """A made-up but proportional count (4 characters a token), so the ledger is exercised without a key."""
        return Usage(input_tokens=(len(system) + len(grounding_json) + len(question)) // 4,
                     output_tokens=max(1, len(answer) // 4))


def configured() -> tuple[bool, str]:
    """Whether the explainer is switched on, and why not if it is off."""
    if os.environ.get("EXPLAINER_ENABLED") != "1":
        return False, "The explainer is switched off on this server."
    if os.environ.get("EXPLAINER_FAKE") == "1":
        return True, ""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return False, "The explainer is switched off: no model key is set on this server."
    return True, ""


def current() -> Model:
    return FakeModel() if os.environ.get("EXPLAINER_FAKE") == "1" else AnthropicModel()
