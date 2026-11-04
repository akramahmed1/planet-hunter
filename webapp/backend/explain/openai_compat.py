"""An OpenAI style chat model for the explainer (launch task T15).

Covers OpenAI itself and anything that speaks the same /chat/completions protocol: Google's Gemini
OpenAI-compatible endpoint, OpenRouter, Groq, Together, a local server. It uses `httpx`, which the backend
already depends on, so no new package is added.

What it sends: the fixed system prompt, then one user turn holding the page's data and the question, exactly the
same three strings the Claude model gets. Nothing else leaves the server: no names, nicknames, PINs, cookies or
session data (the service never passes them in). The key goes only in the Authorization header. Errors say what
went wrong in plain words and never include the key, the request or the provider's reply body.
"""
from __future__ import annotations

import json
import os
from urllib.parse import urlparse

import httpx

from explain.model import ANSWER_SCHEMA, ModelError, Reply
from explain.spend import Usage

OPENAI_BASE = "https://api.openai.com/v1"
MAX_OUTPUT_TOKENS = 2048
JSON_HINT = ('\n\nReply with one JSON object and nothing else, shaped like '
             '{"known": true or false, "answer": "text", "citations": ["item.path"]}.')


def validate_base_url(url: str) -> str:
    """https only, except a server on this machine. Returns the URL without a trailing slash."""
    u = urlparse(url.strip())
    local = (u.hostname or "") in ("localhost", "127.0.0.1", "::1")
    if u.scheme == "https" or (u.scheme == "http" and local):
        if u.hostname and not u.username and not u.password:
            return url.strip().rstrip("/")
    raise ValueError("EXPLAINER_BASE_URL must be an https address (http only for a server on this machine) "
                     "with no username or password in it")


class OpenAIChatModel:
    def __init__(self, *, provider: str, model: str, base_url: str, api_key: str | None,
                 response_format: str | None = None, client: httpx.Client | None = None):
        if not model:
            raise ValueError("set EXPLAINER_MODEL to the model to use")
        self.provider = provider
        self.name = model
        self._base = validate_base_url(base_url)
        self._key = api_key or None
        # "schema": strict JSON schema (OpenAI). "object": plain JSON mode (most compatible servers). "none".
        self._format = response_format or ("schema" if provider == "openai" else "object")
        if self._format not in ("schema", "object", "none"):
            raise ValueError("EXPLAINER_RESPONSE_FORMAT must be schema, object or none")
        self._client = client or httpx.Client(timeout=httpx.Timeout(30.0, connect=10.0))

    def request_body(self, system: str, grounding_json: str, question: str) -> dict:
        body: dict = {
            "model": self.name,
            "messages": [
                {"role": "system", "content": system + ("" if self._format == "schema" else JSON_HINT)},
                {"role": "user", "content": f"<grounding>\n{grounding_json}\n</grounding>\n\n<question>\n{question}\n</question>"},
            ],
        }
        # OpenAI's newer models want max_completion_tokens; other servers know max_tokens.
        body["max_completion_tokens" if self.provider == "openai" else "max_tokens"] = MAX_OUTPUT_TOKENS
        if self._format == "schema":
            body["response_format"] = {"type": "json_schema", "json_schema": {"name": "explainer_answer", "strict": True,
                                                                              "schema": ANSWER_SCHEMA}}
        elif self._format == "object":
            body["response_format"] = {"type": "json_object"}
        return body

    def answer(self, system: str, grounding_json: str, question: str) -> Reply:
        headers = {"content-type": "application/json"}
        if self._key:
            headers["authorization"] = f"Bearer {self._key}"
        try:
            r = self._client.post(f"{self._base}/chat/completions", headers=headers,
                                  content=json.dumps(self.request_body(system, grounding_json, question)))
        except httpx.TimeoutException as exc:
            raise ModelError("the explainer service took too long to answer") from exc
        except httpx.HTTPError as exc:
            raise ModelError("the explainer service could not be reached") from exc
        if r.status_code == 429:
            raise ModelError("the explainer is busy; try again in a minute")
        if r.status_code in (401, 403):
            raise ModelError("the explainer service refused this server's key")
        if r.status_code >= 400:
            raise ModelError(f"the explainer service returned {r.status_code}")
        try:
            data = r.json()
            choice = data["choices"][0]
            message = choice.get("message") or {}
        except (ValueError, KeyError, IndexError, TypeError, AttributeError) as exc:
            raise ModelError("the explainer returned an answer in the wrong shape") from exc
        usage = usage_of(data)
        served = str(data.get("model") or self.name)
        if message.get("refusal") or choice.get("finish_reason") == "content_filter":
            raise ModelError("the explainer declined to answer this question", usage, served)
        if choice.get("finish_reason") == "length":
            raise ModelError("the explainer's answer was cut off", usage, served)
        try:
            parsed = json.loads(message.get("content") or "")
            return Reply(known=bool(parsed["known"]), answer=str(parsed["answer"]),
                         citations=[str(c) for c in parsed["citations"]], model=served, usage=usage)
        except (ValueError, KeyError, TypeError) as exc:
            raise ModelError("the explainer returned an answer in the wrong shape", usage, served) from exc


def usage_of(data: dict) -> Usage:
    """OpenAI style usage: prompt_tokens includes cached tokens, which are reported separately."""
    u = data.get("usage") or {}
    prompt = int(u.get("prompt_tokens") or 0)
    cached = int(((u.get("prompt_tokens_details") or {}).get("cached_tokens")) or 0)
    return Usage(input_tokens=max(0, prompt - cached), output_tokens=int(u.get("completion_tokens") or 0),
                 cache_read_tokens=cached, cache_write_tokens=0)
