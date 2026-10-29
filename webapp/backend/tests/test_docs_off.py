"""The API docs and the OpenAPI file are off unless API_DOCS=1; callers are identified by Railway's X-Real-IP."""
from starlette.requests import Request

import app as backend
from clientip import client_ip


def test_docs_are_off_by_default_and_on_when_asked(monkeypatch):
    monkeypatch.delenv("API_DOCS", raising=False)
    assert backend.docs_kwargs() == {"docs_url": None, "redoc_url": None, "openapi_url": None}
    monkeypatch.setenv("API_DOCS", "0")
    assert backend.docs_kwargs()["openapi_url"] is None
    monkeypatch.setenv("API_DOCS", "1")
    assert backend.docs_kwargs() == {}


def _req(headers: dict[str, str], host: str = "10.0.0.9") -> Request:
    return Request({"type": "http", "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
                    "client": (host, 1234), "method": "GET", "path": "/", "query_string": b""})


def test_client_ip_trusts_x_real_ip_over_a_made_up_forwarded_for():
    r = _req({"X-Real-IP": "198.51.100.7", "X-Forwarded-For": "1.1.1.1, 198.51.100.7"})
    assert client_ip(r) == "198.51.100.7"


def test_client_ip_falls_back_without_x_real_ip():
    assert client_ip(_req({"X-Forwarded-For": "203.0.113.5, 10.0.0.1"})) == "203.0.113.5"
    assert client_ip(_req({}, host="192.0.2.8")) == "192.0.2.8"
