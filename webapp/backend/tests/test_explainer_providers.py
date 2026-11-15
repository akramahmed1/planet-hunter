"""Explainer providers: anthropic (default), openai, openai_compatible (launch task T15)."""
from __future__ import annotations

from decimal import Decimal
import json

import httpx
import pytest
from fastapi.testclient import TestClient

import app as backend
from explain import evals, grounding, model, openai_compat, service, spend
from explain.openai_compat import OpenAIChatModel
from explain.spend import Usage
from tests.test_scan_queue import engine  # noqa: F401
from tests.test_v2 import needs_db

KEY = "-".join(["not", "a", "real", "key", "for", "tests"])  # built at run time so secret scanners see no literal
ENV = ["EXPLAINER_ENABLED", "EXPLAINER_FAKE", "EXPLAINER_PROVIDER", "EXPLAINER_MODEL", "EXPLAINER_BASE_URL",
       "EXPLAINER_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "EXPLAINER_APPROVED_MODEL",
       "EXPLAINER_ALLOW_UNAPPROVED", "EXPLAINER_RESPONSE_FORMAT", "EXPLAINER_PRICE_INPUT_PER_MTOK",
       "EXPLAINER_PRICE_OUTPUT_PER_MTOK"]


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    for k in ENV:
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("EXPLAINER_ENABLED", "1")


def reply_json(content: str, **extra):
    msg = {"role": "assistant", "content": content}
    return {"id": "x", "model": extra.pop("model", "gpt-test"), "choices": [{"index": 0, "message": msg,
            "finish_reason": extra.pop("finish_reason", "stop")}],
            "usage": extra.pop("usage", {"prompt_tokens": 1000, "completion_tokens": 50,
                                         "prompt_tokens_details": {"cached_tokens": 200}}), **extra}


GOOD = json.dumps({"known": True, "answer": "16 days", "citations": ["item.period_d"]})


def make(handler, **kw):
    kw.setdefault("provider", "openai")
    kw.setdefault("model", "gpt-test")
    kw.setdefault("base_url", "https://api.openai.com/v1")
    kw.setdefault("api_key", KEY)
    return OpenAIChatModel(client=httpx.Client(transport=httpx.MockTransport(handler)), **kw)


# ---------- the request ----------

def test_the_request_carries_only_page_data_and_the_key_only_in_the_header():
    seen = {}

    def handler(request: httpx.Request):
        seen["url"], seen["headers"], seen["body"] = str(request.url), request.headers, json.loads(request.content)
        return httpx.Response(200, json=reply_json(GOOD))

    m = make(handler)
    out = m.answer(service.SYSTEM, '{"item":{"period_d":16.05}}', "What is the period?")
    assert seen["url"] == "https://api.openai.com/v1/chat/completions"
    assert seen["headers"]["authorization"] == f"Bearer {KEY}"
    body = seen["body"]
    assert KEY not in json.dumps(body)
    assert body["model"] == "gpt-test" and body["max_completion_tokens"] == 2048 and "max_tokens" not in body
    assert body["response_format"]["type"] == "json_schema" and body["response_format"]["json_schema"]["strict"] is True
    assert body["messages"][0] == {"role": "system", "content": service.SYSTEM}
    assert body["messages"][1]["content"] == ('<grounding>\n{"item":{"period_d":16.05}}\n</grounding>\n\n'
                                              '<question>\nWhat is the period?\n</question>')
    assert set(body) == {"model", "messages", "max_completion_tokens", "response_format"}  # nothing else is sent
    assert out.known and out.answer == "16 days" and out.citations == ["item.period_d"] and out.model == "gpt-test"
    # prompt_tokens includes the cached ones, which are priced separately.
    assert out.usage == Usage(input_tokens=800, output_tokens=50, cache_read_tokens=200, cache_write_tokens=0)


def test_compatible_servers_get_json_mode_and_max_tokens():
    seen = {}

    def handler(request):
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json=reply_json(GOOD))

    make(handler, provider="openai_compatible", base_url="https://generativelanguage.googleapis.com/v1beta/openai/").answer(
        service.SYSTEM, "{}", "q")
    b = seen["body"]
    assert b["response_format"] == {"type": "json_object"} and b["max_tokens"] == 2048 and "max_completion_tokens" not in b
    assert b["messages"][0]["content"].startswith(service.SYSTEM) and "JSON object" in b["messages"][0]["content"]
    # The trailing slash on the base address is handled.
    make(lambda r: (seen.update(url=str(r.url)) or httpx.Response(200, json=reply_json(GOOD))),
         provider="openai_compatible", base_url="https://api.groq.com/openai/v1/").answer(service.SYSTEM, "{}", "q")
    assert seen["url"] == "https://api.groq.com/openai/v1/chat/completions"


def test_a_server_on_this_machine_needs_no_key_and_sends_no_authorization():
    seen = {}

    def handler(request):
        seen["headers"] = request.headers
        return httpx.Response(200, json=reply_json(GOOD))

    make(handler, provider="openai_compatible", base_url="http://localhost:11434/v1", api_key=None).answer(service.SYSTEM, "{}", "q")
    assert "authorization" not in seen["headers"]


@pytest.mark.parametrize("url", ["http://api.example.com/v1", "ftp://x.example.com", "https://user:pw@x.example.com/v1",
                                 "not a url", "", "https://"])
def test_the_base_address_must_be_https_without_credentials(url):
    with pytest.raises(ValueError):
        openai_compat.validate_base_url(url)


# ---------- the reply ----------

@pytest.mark.parametrize("resp,match", [
    (httpx.Response(429), "busy"),
    (httpx.Response(401, text=KEY), "refused this server's key"),
    (httpx.Response(403), "refused this server's key"),
    (httpx.Response(500, text="boom " + KEY), "returned 500"),
    (httpx.Response(200, text="<html>not json</html>"), "wrong shape"),
    (httpx.Response(200, json={"choices": []}), "wrong shape"),
    (httpx.Response(200, json=reply_json("not json")), "wrong shape"),
    (httpx.Response(200, json=reply_json(json.dumps({"known": True}))), "wrong shape"),
    (httpx.Response(200, json=reply_json(GOOD, finish_reason="length")), "cut off"),
    (httpx.Response(200, json=reply_json("", finish_reason="content_filter")), "declined"),
])
def test_failures_are_plain_words_and_never_leak_the_key_or_the_reply(resp, match):
    with pytest.raises(model.ModelError, match=match) as err:
        make(lambda r: resp).answer(service.SYSTEM, "{}", "q")
    assert KEY not in str(err.value) and "boom" not in str(err.value)


def test_a_refusal_field_is_a_decline_and_carries_the_billed_usage():
    data = reply_json(None)
    data["choices"][0]["message"]["refusal"] = "I cannot help with that"
    with pytest.raises(model.ModelError, match="declined") as err:
        make(lambda r: httpx.Response(200, json=data)).answer(service.SYSTEM, "{}", "q")
    assert err.value.usage is not None and err.value.usage.output_tokens == 50 and err.value.model == "gpt-test"


def test_timeouts_and_connection_errors_are_reported_quietly():
    def timeout(request):
        raise httpx.ReadTimeout("slow", request=request)

    def down(request):
        raise httpx.ConnectError("no route", request=request)

    with pytest.raises(model.ModelError, match="took too long"):
        make(timeout).answer(service.SYSTEM, "{}", "q")
    with pytest.raises(model.ModelError, match="could not be reached"):
        make(down).answer(service.SYSTEM, "{}", "q")


def test_the_services_checks_stay_in_charge_of_every_provider():
    """A model that cites a field that does not exist, or claims a discovery, still gets 'not known'."""
    g = grounding.grounding_for(grounding.candidate_item("toi-700"))
    lie = json.dumps({"known": True, "answer": "This site discovered a new planet.", "citations": ["item.period_d"]})
    bad_cite = json.dumps({"known": True, "answer": "It is 5 days.", "citations": ["item.invented"]})
    for content in (lie, bad_cite):
        out = service.explain(make(lambda r, c=content: httpx.Response(200, json=reply_json(c))), g, "What is the period?")
        assert out.known is False and out.answer == service.NOT_KNOWN


# ---------- choosing and approving a provider ----------

def test_anthropic_is_the_default_and_needs_its_key(monkeypatch):
    assert model.provider() == "anthropic" and model.model_name() == "claude-opus-5-5"
    assert model.configured() == (False, "The explainer is switched off: no model key is set on this server.")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    assert model.configured() == (True, "")
    assert model.current().name == "claude-opus-5-5"


@pytest.mark.parametrize("env,reason", [
    ({"EXPLAINER_PROVIDER": "openai"}, "not fully set up"),                                            # no model
    ({"EXPLAINER_PROVIDER": "openai", "EXPLAINER_MODEL": "gpt-test"}, "no model key"),                  # no key
    ({"EXPLAINER_PROVIDER": "openai_compatible", "EXPLAINER_MODEL": "m"}, "not fully set up"),         # no base address
    ({"EXPLAINER_PROVIDER": "openai_compatible", "EXPLAINER_MODEL": "m", "EXPLAINER_BASE_URL": "http://x.example.com"},
     "not fully set up"),                                                                              # not https
    ({"EXPLAINER_PROVIDER": "openai_compatible", "EXPLAINER_MODEL": "m", "EXPLAINER_BASE_URL": "https://x.example.com/v1"},
     "no model key"),                                                                                  # no key
    ({"EXPLAINER_PROVIDER": "gemini"}, "not fully set up"),                                            # unknown provider
])
def test_an_incomplete_provider_setup_leaves_the_explainer_off(monkeypatch, env, reason):
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    ok, why = model.configured()
    assert ok is False and reason in why


def test_a_new_provider_must_be_approved_after_the_eval(monkeypatch):
    for k, v in {"EXPLAINER_PROVIDER": "openai", "EXPLAINER_MODEL": "gpt-test", "OPENAI_API_KEY": KEY}.items():
        monkeypatch.setenv(k, v)
    assert model.configured() == (False, "The explainer is switched off: this model has not passed its checks yet.")
    monkeypatch.setenv("EXPLAINER_APPROVED_MODEL", "openai:another-model")      # approval is for one provider and model
    assert model.configured()[0] is False
    monkeypatch.setenv("EXPLAINER_APPROVED_MODEL", "anthropic:gpt-test")
    assert model.configured()[0] is False
    monkeypatch.setenv("EXPLAINER_APPROVED_MODEL", "openai:gpt-test")
    assert model.configured() == (True, "")
    m = model.current()
    assert isinstance(m, OpenAIChatModel) and m.name == "gpt-test"
    # Staging can run the eval itself before approval.
    monkeypatch.delenv("EXPLAINER_APPROVED_MODEL")
    monkeypatch.setenv("EXPLAINER_ALLOW_UNAPPROVED", "1")
    assert model.configured() == (True, "")


def test_a_different_claude_model_also_needs_approval(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    monkeypatch.setenv("EXPLAINER_MODEL", "claude-sonnet-5-5")
    assert model.configured()[0] is False
    monkeypatch.setenv("EXPLAINER_APPROVED_MODEL", "anthropic:claude-sonnet-5-5")
    assert model.configured()[0] is True


def test_there_is_no_silent_fallback_to_another_provider(monkeypatch):
    """The openai provider with no OpenAI key stays off even when an Anthropic key is present, and vice versa."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    monkeypatch.setenv("EXPLAINER_PROVIDER", "openai")
    monkeypatch.setenv("EXPLAINER_MODEL", "gpt-test")
    monkeypatch.setenv("EXPLAINER_ALLOW_UNAPPROVED", "1")
    assert model.configured()[0] is False
    monkeypatch.delenv("EXPLAINER_PROVIDER")
    monkeypatch.setenv("OPENAI_API_KEY", KEY)
    monkeypatch.delenv("EXPLAINER_MODEL")
    assert isinstance(model.current(), model.AnthropicModel)


def test_the_eval_reports_the_provider_it_ran_against(monkeypatch, capsys):
    monkeypatch.setenv("EXPLAINER_FAKE", "1")
    monkeypatch.setattr("sys.argv", ["evals"])
    with pytest.raises(SystemExit):
        import runpy
        runpy.run_module("explain.evals", run_name="__main__")
    assert "provider fake, model fake" in capsys.readouterr().out


# ---------- spend: another provider's model is priced or refused ----------

@needs_db
def test_an_unpriced_openai_model_is_refused_until_priced_then_metered(engine, monkeypatch):  # noqa: F811
    monkeypatch.setenv("EXPLAINER_MONTHLY_CAP_USD", "20")
    g = grounding.grounding_for(grounding.candidate_item("toi-700"))
    m = make(lambda r: httpx.Response(200, json=reply_json(GOOD)))
    with pytest.raises(spend.UnknownPrice):
        service.explain_metered(engine, m, g, "What is the period?")
    monkeypatch.setenv("EXPLAINER_PRICE_INPUT_PER_MTOK", "1")
    monkeypatch.setenv("EXPLAINER_PRICE_OUTPUT_PER_MTOK", "4")
    out = service.explain_metered(engine, m, g, "What is the period?")
    assert out.known
    # 800 input at $1, 200 cached read at the full input price ($1), 50 output at $4, per million tokens.
    assert spend.status(engine).spent_usd == Decimal("0.0012")


@needs_db
def test_the_api_works_end_to_end_with_an_openai_compatible_model(engine, monkeypatch):  # noqa: F811
    for k, v in {"EXPLAINER_PROVIDER": "openai_compatible", "EXPLAINER_MODEL": "gpt-test", "EXPLAINER_API_KEY": KEY,
                 "EXPLAINER_BASE_URL": "https://llm.example.com/v1", "EXPLAINER_APPROVED_MODEL": "openai_compatible:gpt-test",
                 "EXPLAINER_PRICE_INPUT_PER_MTOK": "1", "EXPLAINER_PRICE_OUTPUT_PER_MTOK": "4",
                 "EXPLAINER_MONTHLY_CAP_USD": "20"}.items():
        monkeypatch.setenv(k, v)
    sent = []

    def handler(request):
        sent.append(json.loads(request.content))
        return httpx.Response(200, json=reply_json(GOOD))

    real = httpx.Client
    monkeypatch.setattr(openai_compat.httpx, "Client", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    with TestClient(backend.app) as c:
        assert c.get("/api/v2/explain/status").json()["model"] == "gpt-test"
        r = c.post("/api/v2/explain", json={"kind": "candidate", "ref": "toi-700", "question": "What is the period?"})
    assert r.status_code == 200, r.text
    assert r.json()["known"] is True and r.json()["citations"][0]["path"] == "item.period_d"
    assert len(sent) == 1
    msgs = sent[0]["messages"]
    assert [m["role"] for m in msgs] == ["system", "user"]
    g = grounding.grounding_for(grounding.candidate_item("toi-700"))
    # The model sees the page's public grounding and the question, and nothing about who is asking.
    assert msgs[1]["content"].startswith("<grounding>\n")
    assert msgs[1]["content"].endswith("<question>\nWhat is the period?\n</question>")
    assert json.loads(msgs[1]["content"].split("<grounding>\n")[1].split("\n</grounding>")[0]) == json.loads(json.dumps(g))
    assert KEY not in json.dumps(sent[0])
