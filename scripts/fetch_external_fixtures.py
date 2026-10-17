#!/usr/bin/env python3
"""Fetch one real sample from every external data source v2 depends on.

Writes each response body plus a <name>.meta.json (URL, status, content type,
rate-limit headers, size, fetch time) under webapp/backend/tests/fixtures/external/.
Provider docs and terms pages go to docs/_source_snapshots/ as plain text so
they can be read when filling in docs/DATA_SOURCES.md.

Stdlib only, so it runs anywhere (CI included). Usage:
    python scripts/fetch_external_fixtures.py        # Phase 0 set
    python scripts/fetch_external_fixtures.py p2     # Phase 2 set only
API keys are never written to disk: the api.nasa.gov key comes from the
NASA_API_KEY env var (DEMO_KEY if unset) and is redacted from saved URLs.
"""
from __future__ import annotations

import html
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FIXTURES = REPO / "webapp" / "backend" / "tests" / "fixtures" / "external"
SNAPSHOTS = REPO / "docs" / "_source_snapshots"
MAX_BYTES = 300_000
UA = "planet-hunter-fixture-fetch/1.0 (+https://github.com/akramahmed1/planet-hunter)"
NASA_KEY = os.environ.get("NASA_API_KEY") or "DEMO_KEY"

TODAY = date.today()
TOMORROW = TODAY + timedelta(days=1)
WEEK_AGO = TODAY - timedelta(days=7)


def q(params: dict) -> str:
    return urllib.parse.urlencode(params, quote_via=urllib.parse.quote)


def horizons(command: str, start: date = TODAY, stop: date = TOMORROW, step: str = "1 d", **extra: str) -> str:
    params = {
        "format": "json",
        "COMMAND": f"'{command}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "START_TIME": f"'{start}'",
        "STOP_TIME": f"'{stop}'",
        "STEP_SIZE": f"'{step}'",
    }
    params.update({k: f"'{v}'" for k, v in extra.items()})
    return "https://ssd.jpl.nasa.gov/api/horizons.api?" + q(params)


TAP = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync?"
MAST_TIC = {
    "service": "Mast.Catalogs.Filtered.Tic",
    "format": "json",
    "params": {
        "columns": "ID,ra,dec,Tmag,Teff",
        "filters": [{"paramName": "ID", "values": ["260128333", "150428135"]}],
    },
}

# (name, url, extension). Fixtures are real response bodies.
FIXTURE_REQUESTS = [
    ("nssdca_factsheet", "https://nssdc.gsfc.nasa.gov/planetary/factsheet/", "html"),
    ("horizons_mars_vectors_helio",
     horizons("499", EPHEM_TYPE="VECTORS", CENTER="500@10", OUT_UNITS="AU-D"), "json"),
    ("horizons_voyager1_observer_earth",
     horizons("-31", EPHEM_TYPE="OBSERVER", CENTER="500@399", QUANTITIES="19,20"), "json"),
    ("jpl_approx_pos_elements", "https://ssd.jpl.nasa.gov/planets/approx_pos.html", "html"),
    ("exoplanet_archive_latest",
     TAP + q({"query": "select pl_name,hostname,st_teff,st_lum,pl_orbsmax,pl_eqt,"
                       f"disc_year,disc_pubdate from pscomppars where disc_pubdate >= '{(TODAY - timedelta(days=60)):%Y-%m}' order by disc_pubdate desc",
              "format": "json"}), "json"),
    ("exoplanet_archive_pscomppars_columns",
     TAP + q({"query": "select column_name,description,unit from TAP_SCHEMA.columns "
                       "where table_name like 'pscomppars'", "format": "json"}), "json"),
    ("exoplanet_archive_count",
     TAP + q({"query": "select count(*) as n from pscomppars", "format": "json"}), "json"),
    ("mast_tic_coords",
     "https://mast.stsci.edu/api/v0/invoke?" + q({"request": json.dumps(MAST_TIC)}), "json"),
    ("iss_wheretheiss", "https://api.wheretheiss.at/v1/satellites/25544", "json"),
    ("iss_open_notify_https", "https://api.open-notify.org/iss-now.json", "json"),
    ("nasa_apod", f"https://api.nasa.gov/planetary/apod?api_key={NASA_KEY}", "json"),
    ("nasa_donki_notifications",
     "https://api.nasa.gov/DONKI/notifications?"
     + q({"startDate": str(WEEK_AGO), "endDate": str(TODAY), "type": "all", "api_key": NASA_KEY}),
     "json"),
    ("donki_ccmc_notifications",
     "https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/notifications?"
     + q({"startDate": str(WEEK_AGO), "endDate": str(TODAY), "type": "all"}), "json"),
    ("hips_dss_color_properties", "https://alasky.cds.unistra.fr/DSS/DSSColor/properties", "txt"),
]

# Phase 2 set: inputs for /api/v2/bodies, /positions and /exoplanets.
NSSDCA = "https://nssdc.gsfc.nasa.gov/planetary/factsheet/"
FACT_SHEETS = ["sun", "mercury", "venus", "earth", "moon", "mars", "jupiter",
               "saturn", "uranus", "neptune", "pluto"]
# Horizons major-body IDs: Sun 10, planet bodies x99, Moon 301.
HORIZONS_IDS = {"mercury": "199", "venus": "299", "earth": "399", "moon": "301", "mars": "499",
                "jupiter": "599", "saturn": "699", "uranus": "799", "neptune": "899", "pluto": "999"}
EXO_COLUMNS = ("pl_name,hostname,st_teff,st_rad,st_mass,st_lum,pl_orbsmax,pl_orbper,pl_eqt,"
               "pl_rade,disc_year,disc_pubdate,ra,dec,sy_dist")

P2_REQUESTS = (
    [(f"nssdca_{b}fact", f"{NSSDCA}{b}fact.html", "html") for b in FACT_SHEETS]
    + [(f"horizons_{b}_vectors_helio_today",
        horizons(i, EPHEM_TYPE="VECTORS", CENTER="500@10", OUT_UNITS="AU-D", VEC_TABLE="1", CSV_FORMAT="YES"),
        "json") for b, i in HORIZONS_IDS.items()]
    + [("horizons_pluto_vectors_helio_1800_2050",
        horizons("999", start=date(1800, 1, 4), stop=date(2050, 12, 31), step="30 d",
                 EPHEM_TYPE="VECTORS", CENTER="500@10", OUT_UNITS="AU-D", VEC_TABLE="1", CSV_FORMAT="YES"),
        "json"),
       ("exoplanet_archive_system_toi700",
        TAP + q({"query": f"select {EXO_COLUMNS} from pscomppars where hostname = 'TOI-700'",
                 "format": "json"}), "json"),
       ("nasa_apod_p2", f"https://api.nasa.gov/planetary/apod?api_key={NASA_KEY}", "json"),
       ("nasa_donki_notifications_p2",
        "https://api.nasa.gov/DONKI/notifications?"
        + q({"startDate": str(WEEK_AGO), "endDate": str(TODAY), "type": "all", "api_key": NASA_KEY}),
        "json")]
)

# Only status and size are recorded for these (large client-side assets).
PROBE_REQUESTS = [
    ("aladin_lite_v3_js", "https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js"),
]

# Docs and terms pages, saved as plain text for reading.
SNAPSHOT_REQUESTS = [
    ("horizons_api_doc", "https://ssd-api.jpl.nasa.gov/doc/horizons.html"),
    ("jpl_approx_pos", "https://ssd.jpl.nasa.gov/planets/approx_pos.html"),
    ("exoplanet_archive_tap_doc", "https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html"),
    ("exoplanet_archive_acknowledge", "https://exoplanetarchive.ipac.caltech.edu/docs/acknowledge.html"),
    ("mast_api_doc", "https://mast.stsci.edu/api/v0/"),
    ("wheretheiss_developer", "https://wheretheiss.at/w/developer"),
    ("api_nasa_gov", "https://api.nasa.gov/"),
    ("aladin_lite_doc", "https://aladin.cds.unistra.fr/AladinLite/doc/"),
    ("cds_terms", "https://cds.unistra.fr/vizier-org/licences_vizier.html"),
    ("nasa_3d_resources", "https://science.nasa.gov/3d-resources/"),
    ("nasa_3d_tess_search", "https://science.nasa.gov/?search=TESS+3D+model"),
    ("nasa_media_guidelines", "https://www.nasa.gov/nasa-brand-center/images-and-media/"),
]

KEEP_HEADERS = re.compile(r"^(x-ratelimit-.*|retry-after|cache-control|content-type|"
                          r"access-control-allow-origin|strict-transport-security|"
                          r"last-modified|etag|server)$", re.I)


def redact(url: str) -> str:
    return re.sub(r"(api_key=)[^&]+", r"\1REDACTED", url)


def fetch(url: str, max_bytes: int = MAX_BYTES) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    started = datetime.now(timezone.utc)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read(max_bytes + 1)
            status, headers, final = r.status, r.headers, r.geturl()
    except urllib.error.HTTPError as e:
        body = e.read(max_bytes + 1)
        status, headers, final = e.code, e.headers, url
    except Exception as e:  # network, TLS, DNS
        return {"url": redact(url), "error": f"{type(e).__name__}: {e}",
                "fetched_at": started.isoformat(timespec="seconds"), "body": b""}
    return {
        "url": redact(url),
        "final_url": redact(final),
        "status": status,
        "https": final.startswith("https://"),
        "headers": {k.lower(): v for k, v in headers.items() if KEEP_HEADERS.match(k)},
        "bytes": len(body),
        "truncated": len(body) > max_bytes,
        "fetched_at": started.isoformat(timespec="seconds"),
        "body": body[:max_bytes],
    }


def html_to_text(raw: bytes) -> str:
    text = raw.decode("utf-8", "replace")
    text = re.sub(r"(?is)<(script|style|noscript|svg).*?</\1>", " ", text)
    text = re.sub(r"(?i)<a\s[^>]*href=\"([^\"]+)\"[^>]*>", r" [link: \1] ", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"[ \t]+", " ", re.sub(r"\n\s*\n+", "\n\n", text)).strip()


def save_meta(path: Path, result: dict) -> None:
    meta = {k: v for k, v in result.items() if k != "body"}
    path.write_text(json.dumps(meta, indent=2) + "\n")


def main() -> int:
    # `p2` fetches only the Phase 2 set, so the reviewed Phase 0 samples stay as they are.
    phase = sys.argv[1] if len(sys.argv) > 1 else "p0"
    FIXTURES.mkdir(parents=True, exist_ok=True)
    SNAPSHOTS.mkdir(parents=True, exist_ok=True)
    summary = []
    requests = P2_REQUESTS if phase == "p2" else FIXTURE_REQUESTS

    for name, url, ext in requests:
        r = fetch(url, max_bytes=3_000_000 if "1800_2050" in name else MAX_BYTES)
        body = r["body"].replace(NASA_KEY.encode(), b"REDACTED") if NASA_KEY != "DEMO_KEY" else r["body"]
        if body:
            (FIXTURES / f"{name}.{ext}").write_bytes(body)
        save_meta(FIXTURES / f"{name}.meta.json", r)
        summary.append((name, r.get("status"), r.get("error", "")))

    for name, url in PROBE_REQUESTS if phase == "p0" else []:
        r = fetch(url)
        save_meta(FIXTURES / f"{name}.meta.json", r)
        summary.append((name, r.get("status"), r.get("error", "")))

    for name, url in SNAPSHOT_REQUESTS if phase == "p0" else []:
        r = fetch(url)
        meta = {k: v for k, v in r.items() if k != "body"}
        text = html_to_text(r["body"]) if r["body"] else ""
        (SNAPSHOTS / f"{name}.txt").write_text(json.dumps(meta, indent=2) + "\n\n" + text + "\n")
        summary.append((f"doc:{name}", r.get("status"), r.get("error", "")))

    width = max(len(n) for n, _, _ in summary)
    for name, status, err in summary:
        print(f"{name:<{width}}  {status if status is not None else '---'}  {err}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
