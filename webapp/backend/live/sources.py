"""One fetcher per external source (verified in Phase 0, docs/DATA_SOURCES.md).

Each returns plain JSON-able data for the cache; endpoints shape it with the
Pydantic models. Every fetch goes through live.http (timeouts, retries).
"""
from __future__ import annotations

import os
import re
from urllib.parse import urlparse
from datetime import date, timedelta

from live import http
from live.positions import parse_horizons_vectors

HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api"
HORIZONS_IDS = {"mercury": "199", "venus": "299", "earth": "399", "moon": "301", "mars": "499",
                "jupiter": "599", "saturn": "699", "uranus": "799", "neptune": "899", "pluto": "999"}
ISS = "https://api.wheretheiss.at/v1/satellites/25544"
APOD = "https://api.nasa.gov/planetary/apod"
DONKI = "https://api.nasa.gov/DONKI/notifications"
TAP = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"

SRC_HORIZONS = {"name": "NASA JPL Horizons", "url": "https://ssd.jpl.nasa.gov/horizons/"}
SRC_ISS = {"name": "Where the ISS at? (wheretheiss.at)", "url": "https://wheretheiss.at/w/developer"}
SRC_APOD = {"name": "NASA Astronomy Picture of the Day (api.nasa.gov)", "url": "https://apod.nasa.gov/apod/"}
SRC_DONKI = {"name": "NASA DONKI space weather notifications (api.nasa.gov)",
             "url": "https://kauai.ccmc.gsfc.nasa.gov/DONKI/"}
SRC_EXO = {"name": "NASA Exoplanet Archive, Planetary Systems Composite Parameters",
           "url": "https://exoplanetarchive.ipac.caltech.edu/"}

EXO_COLUMNS = ("pl_name,hostname,st_teff,st_rad,st_mass,st_lum,pl_orbsmax,pl_orbper,pl_eqt,"
               "pl_rade,disc_year,disc_pubdate,ra,dec,sy_dist")
HOST_NAME = re.compile(r"^[A-Za-z0-9 .+_-]{1,64}$")


def _nasa_key() -> str:
    return os.environ.get("NASA_API_KEY") or "DEMO_KEY"


def horizons_today(body_id: str, d: date) -> dict:
    params = {
        "format": "json", "COMMAND": f"'{HORIZONS_IDS[body_id]}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'VECTORS'", "CENTER": "'500@10'", "OUT_UNITS": "'AU-D'", "VEC_TABLE": "'1'",
        "CSV_FORMAT": "'YES'", "START_TIME": f"'{d}'", "STOP_TIME": f"'{d + timedelta(days=1)}'",
        "STEP_SIZE": "'1 d'",
    }
    body = http.get_json(HORIZONS, params)
    try:
        x, y, z = parse_horizons_vectors(body["result"])
    except (KeyError, ValueError) as exc:
        raise http.FetchError("Horizons returned no vectors") from exc
    return {"x_au": x, "y_au": y, "z_au": z, "api_version": body.get("signature", {}).get("version")}


def iss() -> dict:
    b = http.get_json(ISS)
    try:
        return {k: b[k] for k in ("latitude", "longitude", "altitude", "velocity", "visibility", "timestamp", "units")}
    except KeyError as exc:
        raise http.FetchError("ISS response missing fields") from exc


def apod() -> dict:
    b = http.get_json(APOD, {"api_key": _nasa_key()})
    if not isinstance(b, dict) or "title" not in b:
        raise http.FetchError("APOD response missing fields")
    out = {k: b.get(k) for k in ("date", "title", "explanation", "media_type", "url", "hdurl", "copyright")}
    # An image must come from apod.nasa.gov (Phase 2 saw a NASA logo link instead). Treat anything
    # else as a failed fetch so the last good picture is served; a video is kept and shown as a link.
    if out["media_type"] == "image" and urlparse(out["url"] or "").hostname != "apod.nasa.gov":
        http.log.warning("fetch failed: APOD image is not hosted on apod.nasa.gov: %.200s", out["url"])
        raise http.FetchError("APOD image link is not an APOD picture")
    return out


def donki(today: date) -> list[dict]:
    # Phase 0 never got a successful DONKI response (503 every run), so the
    # item shape is unverified; items without the expected keys are dropped.
    b = http.get_json(DONKI, {"startDate": str(today - timedelta(days=7)), "endDate": str(today),
                              "type": "all", "api_key": _nasa_key()})
    if not isinstance(b, list):
        raise http.FetchError("DONKI response was not a list")
    out = []
    for item in b:
        if isinstance(item, dict) and item.get("messageType") and item.get("messageIssueTime"):
            out.append({"type": item["messageType"], "issued": item["messageIssueTime"],
                        "url": item.get("messageURL")})
    return out


def _tap(query: str) -> list[dict]:
    rows = http.get_json(TAP, {"query": query, "format": "json"})
    if not isinstance(rows, list):
        # Logged like http.get_json's own failures, so Railway's logs say what the archive sent.
        http.log.warning("fetch failed: Exoplanet Archive returned an error: %.200s", rows)
        raise http.FetchError("Exoplanet Archive returned an error")
    return rows


def exoplanet_count() -> int:
    rows = _tap("select count(*) as n from pscomppars")
    try:
        return int(rows[0]["n"])
    except (IndexError, KeyError, TypeError, ValueError) as exc:
        http.log.warning("fetch failed: Exoplanet Archive count missing: %.200s", rows)
        raise http.FetchError("Exoplanet Archive count missing") from exc


def exoplanets_latest(today: date, days: int = 60) -> list[dict]:
    since = (today - timedelta(days=days)).strftime("%Y-%m")
    # The archive returned rows out of order with TOP + ORDER BY (docs/DATA_SOURCES.md),
    # so filter by date and sort here.
    rows = _tap(f"select {EXO_COLUMNS} from pscomppars where disc_pubdate >= '{since}'")
    return sorted(rows, key=lambda r: (r.get("disc_pubdate") or "", r.get("pl_name") or ""), reverse=True)


def exoplanet_system(host: str) -> list[dict]:
    if not HOST_NAME.match(host):
        raise ValueError("invalid host name")
    safe = host.replace("'", "''")
    return _tap(f"select {EXO_COLUMNS} from pscomppars where hostname = '{safe}'")


SPACECRAFT_IDS = {"tess": "-95", "jwst": "-170", "voyager1": "-31", "voyager2": "-32"}


def parse_horizons_range(result: str) -> tuple[float, float]:
    """(range km, one-way light time s) from the first row of a VEC_TABLE=3 CSV table in KM-S."""
    try:
        block = result[result.index("$$SOE") + 5 : result.index("$$EOE")].strip()
        parts = [p.strip() for p in block.splitlines()[0].split(",")]
        return float(parts[9]), float(parts[8])
    except (ValueError, IndexError) as exc:
        raise ValueError("unexpected Horizons output") from exc


def spacecraft_range(craft: str, d: date, center: str) -> dict:
    """Distance of a spacecraft from Earth (center 500@399) or the Sun (500@10) on a date."""
    params = {
        "format": "json", "COMMAND": f"'{SPACECRAFT_IDS[craft]}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'VECTORS'", "CENTER": f"'{center}'", "OUT_UNITS": "'KM-S'", "VEC_TABLE": "'3'",
        "CSV_FORMAT": "'YES'", "START_TIME": f"'{d}'", "STOP_TIME": f"'{d + timedelta(days=1)}'",
        "STEP_SIZE": "'1 d'",
    }
    body = http.get_json(HORIZONS, params)
    try:
        km, lt = parse_horizons_range(body["result"])
    except (KeyError, ValueError) as exc:
        raise http.FetchError("Horizons returned no vectors") from exc
    return {"km": km, "light_time_s": lt}


def iss_track(start_ts: int, step_s: int = 600, n: int = 10) -> list[dict]:
    """ISS positions at n future times (the provider accepts up to 10 timestamps per request)."""
    stamps = ",".join(str(start_ts + step_s * k) for k in range(n))
    rows = http.get_json(f"{ISS}/positions", {"timestamps": stamps, "units": "kilometers"})
    if not isinstance(rows, list) or not rows:
        raise http.FetchError("ISS track response was not a list")
    try:
        return [{"latitude": r["latitude"], "longitude": r["longitude"], "timestamp": r["timestamp"]} for r in rows]
    except (KeyError, TypeError) as exc:
        raise http.FetchError("ISS track rows missing fields") from exc
