"""One HTTP client for every external fetch: timeouts, retries, a clear User-Agent.

Tests and the offline e2e run swap the transport for one that serves the saved
source samples (live/fixture_transport.py), so no test touches the network.
"""
from __future__ import annotations

import logging
import os
import time

import httpx

log = logging.getLogger("planet-hunter.live")

USER_AGENT = "planet-hunter/2.0 (+https://github.com/akramahmed1/planet-hunter)"
TIMEOUT = httpx.Timeout(15.0, connect=5.0)
RETRIES = 2  # extra attempts after the first, for network errors and 5xx

_transport: httpx.BaseTransport | None = None


class FetchError(Exception):
    """An upstream request failed after retries. The message is safe to log."""


def set_transport(transport: httpx.BaseTransport | None) -> None:
    global _transport
    _transport = transport


def _client() -> httpx.Client:
    transport = _transport
    if transport is None and os.environ.get("PH_OFFLINE_FIXTURES"):
        from live.fixture_transport import FixtureTransport, OfflineTransport

        # "down" answers every upstream call as a failure, for the end-to-end run of the unavailable states.
        transport = OfflineTransport() if os.environ["PH_OFFLINE_FIXTURES"] == "down" else FixtureTransport()
    return httpx.Client(timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}, follow_redirects=True,
                        transport=transport)


def get(url: str, params: dict | None = None) -> httpx.Response:
    last = "unknown error"
    with _client() as client:
        for attempt in range(RETRIES + 1):
            try:
                r = client.get(url, params=params)
                if r.status_code < 500:
                    if r.status_code >= 400:
                        raise FetchError(f"{httpx.URL(url).host} returned HTTP {r.status_code}")
                    return r
                last = f"{httpx.URL(url).host} returned HTTP {r.status_code}"
            except httpx.HTTPError as exc:
                last = f"{httpx.URL(url).host}: {type(exc).__name__}"
            if attempt < RETRIES:
                time.sleep(0.4 * 2**attempt)
    log.warning("fetch failed: %s", last)
    raise FetchError(last)


def get_json(url: str, params: dict | None = None):
    r = get(url, params)
    try:
        return r.json()
    except ValueError as exc:
        raise FetchError(f"{httpx.URL(url).host} returned invalid JSON") from exc
