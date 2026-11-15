"""Security headers and the write rate limit (Phase 10)."""
from fastapi.testclient import TestClient

import app as backend
import security_mw
from tests.test_scan_queue import engine  # noqa: F401
from tests.test_v2 import needs_db


def test_security_headers_on_every_response():
    with TestClient(backend.app) as c:
        for path in ["/api/health", "/api/v2/health", "/api/v2/does-not-exist"]:
            h = c.get(path).headers
            assert h["strict-transport-security"].startswith("max-age=31536000"), path
            assert h["x-content-type-options"] == "nosniff" and h["x-frame-options"] == "DENY"
            assert h["referrer-policy"] == "no-referrer" and "camera=()" in h["permissions-policy"]


@needs_db
def test_every_write_is_rate_limited_per_caller(engine, monkeypatch):  # noqa: F811
    monkeypatch.setenv("WRITE_LIMIT_PER_MINUTE", "3")
    with TestClient(backend.app) as c:
        url = "/api/v2/lessons/transits/answers"
        body = {"question": "earth_ppm", "value": 84}
        codes = [c.post(url, json=body, headers={"X-Forwarded-For": "198.51.100.1"}).status_code for _ in range(4)]
        assert codes == [200, 200, 200, 429]
        # Another caller has its own count; reads are never limited.
        assert c.post(url, json=body, headers={"X-Forwarded-For": "198.51.100.2"}).status_code == 200
        assert c.get("/api/v2/lessons", headers={"X-Forwarded-For": "198.51.100.1"}).status_code == 200
        # The Stripe webhook is exempt (it is switched off here, so 503, not 429).
        assert c.post("/api/v2/billing/webhook", content=b"{}", headers={"X-Forwarded-For": "198.51.100.1"}).status_code == 503


def test_callers_are_keyed_by_session_before_ip():
    class R:
        def __init__(self, cookies, headers):
            self.cookies, self.headers, self.client = cookies, headers, None
    a = security_mw.caller(R({"ph_session": "tok"}, {"x-forwarded-for": "1.2.3.4"}))
    b = security_mw.caller(R({"ph_session": "tok"}, {"x-forwarded-for": "5.6.7.8"}))
    assert a == b and a.startswith("s:") and "tok" not in a
    assert security_mw.caller(R({}, {"x-forwarded-for": "1.2.3.4, 10.0.0.1"})).startswith("i:")
