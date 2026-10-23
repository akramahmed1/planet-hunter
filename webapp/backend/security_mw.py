"""Security headers on every API response, and a rate limit on every write (Phase 10).

Writes (POST, PUT, PATCH, DELETE under /api/v2) are counted per caller: the session when
signed in, else a hash of the client IP. The Stripe webhook is exempt (Stripe signs it
and retries on failure). The limit is generous and set by WRITE_LIMIT_PER_MINUTE; the
endpoints with their own tighter limits (sign-in, scans, the explainer) keep them.

Known limit: the client IP comes from the first X-Forwarded-For entry, which a caller
talking to the backend directly can set. Signed-in callers are keyed by session instead.
"""
from __future__ import annotations

import hashlib
import os

from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

import db

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
EXEMPT = {"/api/v2/billing/webhook"}
HEADERS = {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
}


def write_limit() -> int:
    return int(os.environ.get("WRITE_LIMIT_PER_MINUTE", "120"))


def caller(request: Request) -> str:
    token = request.cookies.get("ph_session")
    if token:
        return "s:" + hashlib.sha256(token.encode()).hexdigest()[:24]
    fwd = request.headers.get("x-forwarded-for", "")
    ip = fwd.split(",")[0].strip() or (request.client.host if request.client else "unknown")
    return "i:" + hashlib.sha256(f"ph-ip:{ip}".encode()).hexdigest()[:24]


def over_limit(request: Request) -> bool:
    eng = db.engine()
    if eng is None:
        return False
    key = f"write:{caller(request)}"
    try:
        with eng.begin() as c:
            n = c.execute(text("select count(*) from usage_events where key = :k and at > now() - interval '1 minute'"),
                          {"k": key}).scalar_one()
            if n >= write_limit():
                return True
            c.execute(text("insert into usage_events (key) values (:k)"), {"k": key})
    except Exception:  # noqa: BLE001 - before the migration runs, or with the database down, do not block writes
        return False
    return False


class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if (request.method in WRITE_METHODS and request.url.path.startswith("/api/v2/")
                and request.url.path not in EXEMPT and over_limit(request)):
            response: Response = JSONResponse({"detail": "Too many changes in a minute. Slow down a little."},
                                              status_code=429, headers={"Retry-After": "60"})
        else:
            response = await call_next(request)
        for k, v in HEADERS.items():
            response.headers.setdefault(k, v)
        return response
