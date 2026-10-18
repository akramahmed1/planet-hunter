#!/usr/bin/env python3
"""Fetch one real sample from every external data source v2 depends on.

Writes each response body plus a <name>.meta.json (URL, status, content type,
rate-limit headers, size, fetch time) under webapp/backend/tests/fixtures/external/.
Provider docs and terms pages go to docs/_source_snapshots/ as plain text so
they can be read when filling in docs/DATA_SOURCES.md.

Stdlib only, so it runs anywhere (CI included). Usage:
    python scripts/fetch_external_fixtures.py        # Phase 0 set
    python scripts/fetch_external_fixtures.py p2     # Phase 2 set only
    python scripts/fetch_external_fixtures.py p3     # Phase 3 set only
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

# Phase 3 set: JPL's own Earth-to-body distances and light times (geocentric
# vectors with LT and RG columns) plus heliocentric vectors for the same date, so
# the solar-system page's distance math can be checked against JPL. Also NASA's
# page for the cosmic microwave background temperature (deep-space card).
P3_BODIES = {"sun": "10", "venus": "299", "mars": "499", "jupiter": "599", "neptune": "899"}
P3_REQUESTS = (
    [(f"horizons_{b}_vectors_geo_p3",
      horizons(i, EPHEM_TYPE="VECTORS", CENTER="500@399", OUT_UNITS="KM-S", VEC_TABLE="3", CSV_FORMAT="YES"),
      "json") for b, i in P3_BODIES.items()]
    + [(f"horizons_{b}_vectors_helio_p3",
        horizons(i, EPHEM_TYPE="VECTORS", CENTER="500@10", OUT_UNITS="KM-S", VEC_TABLE="3", CSV_FORMAT="YES"),
        "json") for b, i in {"earth": "399", **P3_BODIES}.items() if b != "sun"]
    + [("nasa_wmap_cmb_tests", "https://map.gsfc.nasa.gov/universe/bb_tests_cmb.html", "html"),
       ("nasa_wmap_cmb_faq", "https://map.gsfc.nasa.gov/site/faq.html", "html")]
)

# Phase 4 set: target stars (MAST TIC), the confirmed planets of our 8 target
# systems, spacecraft positions and mission facts, the ISS ground track, and
# NASA TESS pages for the explainer.
P4_TICS = ["260128333", "259377017", "55652896", "307210830", "150428135", "52368076", "183985250", "251848941"]
P4_HOSTS = ["TOI-1338", "TOI-270", "TOI-216", "TOI-776", "TOI-700", "TOI-125", "TOI-849", "TOI-178"]
SPACECRAFT = {"tess": "-95", "jwst": "-170", "voyager1": "-31", "voyager2": "-32"}
MAST_TIC_P4 = {
    "service": "Mast.Catalogs.Filtered.Tic",
    "format": "json",
    "params": {"columns": "ID,ra,dec,Tmag,Teff,rad,mass,lum,d,logg",
               "filters": [{"paramName": "ID", "values": P4_TICS}]},
}
_NOW = int(datetime.now(timezone.utc).timestamp())
P4_REQUESTS = (
    [("mast_tic_targets_p4", "https://mast.stsci.edu/api/v0/invoke?" + q({"request": json.dumps(MAST_TIC_P4)}), "json"),
     ("exoplanet_archive_targets_p4",
      TAP + q({"query": f"select {EXO_COLUMNS},pl_orbeccen,st_spectype from pscomppars where hostname in ("
                        + ",".join(f"'{h}'" for h in P4_HOSTS) + ")", "format": "json"}), "json"),
     ("iss_ground_track_p4",
      "https://api.wheretheiss.at/v1/satellites/25544/positions?"
      + q({"timestamps": ",".join(str(_NOW + 600 * k) for k in range(10)), "units": "kilometers"}), "json")]
    + [(f"horizons_{n}_vectors_geo_p4",
        horizons(i, EPHEM_TYPE="VECTORS", CENTER="500@399", OUT_UNITS="KM-S", VEC_TABLE="3", CSV_FORMAT="YES",
                 OBJ_DATA="YES"), "json") for n, i in SPACECRAFT.items()]
    + [(f"horizons_{n}_vectors_helio_p4",
        horizons(i, EPHEM_TYPE="VECTORS", CENTER="500@10", OUT_UNITS="KM-S", VEC_TABLE="3", CSV_FORMAT="YES"),
        "json") for n, i in SPACECRAFT.items()]
    + [("nasa_tess_mission", "https://science.nasa.gov/mission/tess/", "html"),
       ("heasarc_tess_telescope", "https://heasarc.gsfc.nasa.gov/docs/tess/the-tess-space-telescope.html", "html"),
       ("heasarc_tess_observing", "https://heasarc.gsfc.nasa.gov/docs/tess/observing-technical.html", "html"),
       ("mit_tess_observations", "https://tess.mit.edu/observations/", "html"),
       ("nasa_webb_mission", "https://science.nasa.gov/mission/webb/", "html"),
       ("nasa_voyager1_mission", "https://science.nasa.gov/mission/voyager/voyager-1/", "html"),
       ("nasa_voyager2_mission", "https://science.nasa.gov/mission/voyager/voyager-2/", "html"),
       ("jpl_voyager_status", "https://science.nasa.gov/mission/voyager/where-are-voyager-1-and-voyager-2-now/", "html"),
       ("osm_tile_usage_policy", "https://operations.osmfoundation.org/policies/tiles/", "html"),
       ("nasa3d_tess_a_glb",
        "https://raw.githubusercontent.com/nasa/NASA-3D-Resources/11ebb4e/3D%20Models/"
        "Transiting%20Exoplanet%20Survey%20Satellite%20(TESS)%20(A)/"
        "Transiting%20Exoplanet%20Survey%20Satellite%20(TESS)%20(A).glb", "glb")]
)

# Phase 6 set: what the scan engine's cross-match and ID validation read.
VIZIER_TAP = "https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync?"
P6_TIC_LIST = ",".join(P4_TICS)


def vizier(query: str) -> str:
    return VIZIER_TAP + q({"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "json", "QUERY": query})


P6_REQUESTS = [
    ("exoplanet_archive_toi_targets_p6",
     TAP + q({"query": f"select tid,toi,toipfx,pl_orbper,pl_trandurh,pl_trandep,tfopwg_disp from toi where tid in ({P6_TIC_LIST})",
              "format": "json"}), "json"),
    ("exoplanet_archive_toi_columns_p6",
     TAP + q({"query": "select column_name,description from TAP_SCHEMA.columns where table_name like 'toi'",
              "format": "json"}), "json"),
    ("exoplanet_archive_pscomppars_by_tic_p6",
     TAP + q({"query": "select pl_name,hostname,tic_id,pl_orbper,cb_flag from pscomppars where tic_id in ("
                       + ",".join(f"'TIC {t}'" for t in P4_TICS) + ")", "format": "json"}), "json"),
    # Planets by TIC ID, so systems are keyed by the star actually scanned, never by a name.
    ("exoplanet_archive_systems_by_tic_p6",
     TAP + q({"query": f"select {EXO_COLUMNS},pl_orbeccen,tic_id,cb_flag from pscomppars where tic_id in ("
                       + ",".join(f"'TIC {t}'" for t in P4_TICS) + ")", "format": "json"}), "json"),
    ("exoplanet_archive_toi_lookup_700_p6",
     TAP + q({"query": "select tid,toi from toi where toipfx = 700", "format": "json"}), "json"),
    ("vizier_tess_ebs_columns_p6",
     vizier("SELECT column_name, description FROM TAP_SCHEMA.columns WHERE table_name = 'J/ApJS/258/16/tess-ebs'"),
     "json"),
    ("vizier_tess_ebs_targets_p6",
     vizier(f'SELECT * FROM "J/ApJS/258/16/tess-ebs" WHERE TIC IN ({P6_TIC_LIST})'), "json"),
    ("vizier_tess_ebs_readme_p6", "https://cdsarc.cds.unistra.fr/ftp/J/ApJS/258/16/ReadMe", "txt"),
    # The whole catalog file (VizieR's TAP service returned 503 on the first run).
    ("cds_tess_ebs_dat_p6", "https://cdsarc.cds.unistra.fr/ftp/J/ApJS/258/16/tess-ebs.dat", "txt"),
    ("cds_tess_ebs_dat_gz_p6", "https://cdsarc.cds.unistra.fr/ftp/J/ApJS/258/16/tess-ebs.dat.gz", "gz"),
    ("cds_tess_ebs_vizbin_p6", "https://cdsarc.cds.unistra.fr/viz-bin/nph-Cat/txt?J/ApJS/258/16/tess-ebs.dat", "txt"),
    ("mast_tess_ebs_hlsp_p6", "https://archive.stsci.edu/hlsp/tess-ebs", "html"),
]

# Phase 7 set: pages the lessons quote. Several candidates per fact; the lessons cite only
# the ones that answered and contain the quoted words (checked by tests/test_content.py).
P7_REQUESTS = [
    ("iau_resolution_b5_p7", "https://www.iau.org/static/resolutions/Resolution_GA26-5-6.pdf", "pdf"),
    ("iau_pluto_page_p7", "https://www.iau.org/public/themes/pluto/", "txt-from-html"),
    ("iau_news_0603_p7", "https://www.iau.org/news/pressreleases/detail/iau0603/", "txt-from-html"),
    ("nasa_what_is_a_planet_p7", "https://science.nasa.gov/solar-system/planets/what-is-a-planet/", "txt-from-html"),
    ("nasa_pluto_dwarf_p7", "https://science.nasa.gov/dwarf-planets/pluto/", "txt-from-html"),
    ("nasa_whats_a_transit_p7", "https://science.nasa.gov/exoplanets/whats-a-transit/", "txt-from-html"),
    ("nasa_exo_transit_faq_p7", "https://exoplanets.nasa.gov/faq/31/whats-a-transit/", "txt-from-html"),
    ("nasa_habitable_zone_p7", "https://science.nasa.gov/exoplanets/habitable-zone/", "txt-from-html"),
    ("nasa_exo_how_find_p7", "https://science.nasa.gov/exoplanets/how-we-find-and-characterize/", "txt-from-html"),
    ("arxiv_kopparapu2014_abs_p7", "https://arxiv.org/abs/1404.5292", "txt-from-html"),
    ("arxiv_winn2010_abs_p7", "https://arxiv.org/abs/1001.2010", "txt-from-html"),
    ("arxiv_prsa2022_abs_p7", "https://arxiv.org/abs/2110.13382", "txt-from-html"),
    ("exoplanet_archive_toi_doc_p7", "https://exoplanetarchive.ipac.caltech.edu/docs/API_TOI_columns.html", "txt-from-html"),
    ("exoplanet_archive_criteria_p7", "https://exoplanetarchive.ipac.caltech.edu/docs/exoplanet_criteria.html", "txt-from-html"),
    ("nist_kelvin_p7", "https://www.nist.gov/si-redefinition/kelvin", "txt-from-html"),
    ("nist_c_p7", "https://physics.nist.gov/cgi-bin/cuu/Value?c", "txt-from-html"),
    ("nasa_tess_toi_count_p7",
     TAP + q({"query": "select tfopwg_disp,count(*) as n from toi group by tfopwg_disp", "format": "json"}), "json"),
]

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


def redact_tokens(text: str) -> str:
    """Remove anything shaped like an access token (Mapbox pk./sk., JWTs, long hex keys)."""
    text = re.sub(r"\b[ps]k\.eyJ[\w.-]+", "REDACTED", text)
    text = re.sub(r"\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]+", "REDACTED", text)
    return re.sub(r"\b[0-9a-f]{32,}\b", "REDACTED", text)


def save_meta(path: Path, result: dict) -> None:
    meta = {k: v for k, v in result.items() if k != "body"}
    path.write_text(json.dumps(meta, indent=2) + "\n")


def main() -> int:
    # `p2`/`p3` fetch only that phase's set, so the reviewed Phase 0 samples stay as they are.
    phase = sys.argv[1] if len(sys.argv) > 1 else "p0"
    FIXTURES.mkdir(parents=True, exist_ok=True)
    SNAPSHOTS.mkdir(parents=True, exist_ok=True)
    summary = []
    requests = {"p2": P2_REQUESTS, "p3": P3_REQUESTS, "p4": P4_REQUESTS, "p6": P6_REQUESTS, "p7": P7_REQUESTS}.get(phase, FIXTURE_REQUESTS)

    for name, url, ext in requests:
        r = fetch(url, max_bytes=3_500_000 if "1800_2050" in name or name.endswith("_glb") or "tess_ebs" in name or name.endswith("_pdf_p7") or name.startswith("iau_resolution") else MAX_BYTES)
        body = r["body"].replace(NASA_KEY.encode(), b"REDACTED") if NASA_KEY != "DEMO_KEY" else r["body"]
        if ext == "txt-from-html":
            # Text only: no scripts or attributes, so embedded client tokens are not committed.
            ext = "txt"
            body = redact_tokens(html_to_text(body)).encode() if body else b""
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
