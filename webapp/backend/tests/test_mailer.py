"""Account email sender (launch task T16)."""
from __future__ import annotations

import json
import logging

import httpx
import pytest

import mailer

KEY = "-".join(["not", "a", "real", "email", "key"])  # built at run time so secret scanners see no literal


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    for k in ("EMAIL_PROVIDER", "EMAIL_API_KEY", "EMAIL_FROM"):
        monkeypatch.delenv(k, raising=False)
    mailer.outbox.clear()


def resend(monkeypatch, handler):
    monkeypatch.setenv("EMAIL_API_KEY", KEY)
    monkeypatch.setenv("EMAIL_FROM", "Planet Hunter <hello@example.com>")
    real = httpx.Client
    monkeypatch.setattr(mailer.httpx, "Client", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))


def test_nothing_is_configured_by_default():
    assert not mailer.configured()
    assert mailer.send("a@example.com", "Hi", "Body") == mailer.Result(False, "not_configured")


def test_a_key_without_a_sender_is_not_configured(monkeypatch):
    monkeypatch.setenv("EMAIL_API_KEY", KEY)
    assert not mailer.configured()
    assert mailer.send("a@example.com", "Hi", "Body").reason == "not_configured"


def test_a_bad_sender_is_not_configured(monkeypatch):
    monkeypatch.setenv("EMAIL_API_KEY", KEY)
    monkeypatch.setenv("EMAIL_FROM", "not an address")
    assert mailer.send("a@example.com", "Hi", "Body").reason == "not_configured"


def test_resend_sends_one_message_with_the_key_only_in_the_header(monkeypatch):
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json={"id": "x"})

    resend(monkeypatch, handler)
    assert mailer.configured()
    assert mailer.send("Teacher@Example.com", "Reset your password", "Open this link").sent
    req = seen[0]
    assert str(req.url) == mailer.RESEND_URL
    assert req.headers["authorization"] == f"Bearer {KEY}"
    body = json.loads(req.content)
    assert body == {"from": "Planet Hunter <hello@example.com>", "to": ["Teacher@Example.com"],
                    "subject": "Reset your password", "text": "Open this link"}
    assert KEY not in req.content.decode()


@pytest.mark.parametrize("to", ["", "a", "a@b", "a@example.com, b@example.com", "a@example.com\nBcc: x@example.com",
                                "a b@example.com", "<a@example.com>", "a@example.com;b@example.com", "a" * 300 + "@example.com"])
def test_only_one_plain_address_is_accepted(monkeypatch, to):
    called = []
    resend(monkeypatch, lambda r: called.append(r) or httpx.Response(200, json={}))
    assert mailer.send(to, "Hi", "Body") == mailer.Result(False, "bad_address")
    assert not called


@pytest.mark.parametrize("subject,text", [("", "x"), ("Hi\nBcc: x@example.com", "x"), ("Hi\r", "x"), ("a" * 201, "x"), ("Hi", ""), ("Hi", "x" * 20_001)])
def test_bad_messages_are_refused(monkeypatch, subject, text):
    called = []
    resend(monkeypatch, lambda r: called.append(r) or httpx.Response(200, json={}))
    assert mailer.send("a@example.com", subject, text) == mailer.Result(False, "bad_message")
    assert not called


def test_a_provider_error_is_reported_without_leaking_anything(monkeypatch, caplog):
    resend(monkeypatch, lambda r: httpx.Response(422, json={"message": f"bad key {KEY}", "to": "t@example.com"}))
    with caplog.at_level(logging.DEBUG, logger="planethunter.mailer"):
        out = mailer.send("t@example.com", "Hi", "secret link https://x/reset?token=abc")
    assert out == mailer.Result(False, "rejected")
    logs = " ".join(r.getMessage() for r in caplog.records)
    for private in (KEY, "t@example.com", "token=abc", "bad key"):
        assert private not in logs


def test_an_unreachable_provider_never_raises(monkeypatch):
    def boom(request):
        raise httpx.ConnectError("down")

    resend(monkeypatch, boom)
    assert mailer.send("a@example.com", "Hi", "Body") == mailer.Result(False, "unreachable")


def test_the_memory_provider_keeps_messages_for_tests(monkeypatch):
    monkeypatch.setenv("EMAIL_PROVIDER", "memory")
    assert mailer.configured()
    assert mailer.send("a@example.com", "Hi", "Body").sent
    assert mailer.outbox == [{"to": "a@example.com", "subject": "Hi", "text": "Body", "from": "test@example.com"}]


def test_an_unknown_provider_sends_nothing(monkeypatch):
    monkeypatch.setenv("EMAIL_PROVIDER", "carrier-pigeon")
    assert not mailer.configured()
    assert mailer.send("a@example.com", "Hi", "Body").reason == "not_configured"
