"""An httpx transport that answers with the saved real source samples.

Used by the tests and by the offline end-to-end run (PH_OFFLINE_FIXTURES=1),
so neither touches the network. Each request is matched to a fixture under
tests/fixtures/external/ and answered with that fixture's real status code
and body (DONKI's saved 503 included).
"""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import unquote_plus

import httpx

FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "external"
HORIZONS_IDS = {"199": "mercury", "299": "venus", "399": "earth", "301": "moon", "499": "mars", "599": "jupiter",
                "699": "saturn", "799": "uranus", "899": "neptune", "999": "pluto"}


def fixture_for(request: httpx.Request) -> str | None:
    host, url = request.url.host, unquote_plus(str(request.url))
    if host == "ssd.jpl.nasa.gov" and "horizons.api" in url:
        body = next((name for code, name in HORIZONS_IDS.items() if f"COMMAND='{code}'" in url), None)
        return f"horizons_{body}_vectors_helio_today" if body else None
    if host == "api.wheretheiss.at":
        return "iss_wheretheiss"
    if host == "api.nasa.gov" and "/planetary/apod" in url:
        return "nasa_apod"
    if host == "api.nasa.gov" and "/DONKI/" in url:
        return "nasa_donki_notifications"
    if host == "exoplanetarchive.ipac.caltech.edu":
        if "count(*)" in url:
            return "exoplanet_archive_count"
        if "disc_pubdate >=" in url:
            return "exoplanet_archive_latest"
        if "hostname = 'TOI-700'" in url:
            return "exoplanet_archive_system_toi700"
        if "hostname = " in url:
            return "__empty_list__"
    return None


class FixtureTransport(httpx.BaseTransport):
    def handle_request(self, request: httpx.Request) -> httpx.Response:
        name = fixture_for(request)
        if name == "__empty_list__":
            return httpx.Response(200, json=[], request=request)
        if name is None:
            return httpx.Response(404, text="no fixture for this request", request=request)
        meta = json.loads((FIXTURES / f"{name}.meta.json").read_text())
        status = meta.get("status") or 503
        body_file = None
        for ext in ("json", "html", "txt"):
            if (FIXTURES / f"{name}.{ext}").exists():
                body_file = FIXTURES / f"{name}.{ext}"
                break
        content = body_file.read_bytes() if body_file and status < 400 else b""
        ctype = meta.get("headers", {}).get("content-type", "application/json")
        return httpx.Response(status, content=content, headers={"content-type": ctype}, request=request)


class OfflineTransport(httpx.BaseTransport):
    """Every request fails as if the network were down."""

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("network disabled for this test", request=request)
