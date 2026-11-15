"""Who is calling, for rate limits and audit logs.

On Railway the edge proxy sets `X-Real-IP` to the client's address (docs.railway.com, networking, specs and limits).
`X-Forwarded-For` is whatever the client sent plus whatever proxies added, so its first entry can be made up by the
caller. We therefore trust `X-Real-IP` first. Without it (local runs, tests) we fall back to the first
`X-Forwarded-For` entry, then to the socket address.
"""
from __future__ import annotations

from starlette.requests import Request


def client_ip(request: Request) -> str:
    real = request.headers.get("x-real-ip", "").strip()
    if real:
        return real
    fwd = request.headers.get("x-forwarded-for", "")
    first = fwd.split(",")[0].strip()
    if first:
        return first
    return request.client.host if request.client else "unknown"
