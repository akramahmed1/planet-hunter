#!/usr/bin/env python3
"""Build the bundled reference data that /api/v2 serves, from real source samples.

Inputs are the responses saved under webapp/backend/tests/fixtures/external/
by scripts/fetch_external_fixtures.py (see docs/DATA_SOURCES.md). Outputs go to
webapp/backend/data/:

  bodies.v1.json           NASA NSSDCA fact sheets: sizes, orbits, temperatures
  kepler_elements.v1.json  JPL "approximate positions" Table 1 (1800-2050)
  pluto_horizons.v1.json   JPL Horizons Pluto positions, every 30 days, 1800-2050

Nothing is typed in by hand: every number is parsed from a saved response, and
temperature statements keep NASA's own wording in `quote`.

    python scripts/build_reference_data.py          # write the files
    python scripts/build_reference_data.py --check  # fail if they are stale (CI)
"""
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FIXTURES = REPO / "webapp" / "backend" / "tests" / "fixtures" / "external"
OUT = REPO / "webapp" / "backend" / "data"

NSSDCA = "https://nssdc.gsfc.nasa.gov/planetary/factsheet/"

# id, display name, type. Order is the order the API returns.
BODIES = [
    ("sun", "Sun", "star"),
    ("mercury", "Mercury", "planet"),
    ("venus", "Venus", "planet"),
    ("earth", "Earth", "planet"),
    ("moon", "Moon", "moon"),
    ("mars", "Mars", "planet"),
    ("jupiter", "Jupiter", "planet"),
    ("saturn", "Saturn", "planet"),
    ("uranus", "Uranus", "planet"),
    ("neptune", "Neptune", "planet"),
    ("pluto", "Pluto", "dwarf_planet"),
]

# Output field -> fact sheet row label (matched at the start of the label).
FACTS = {
    "mass_1e24_kg": "Mass (10 24 kg)",
    "mean_radius_km": "Volumetric mean radius (km)",
    "semimajor_axis_1e6_km": "Semimajor axis (10 6 km)",
    "orbit_period_days": "Sidereal orbit period (days)",
    "day_length_hours": "Length of day (hrs)",
    "blackbody_temperature_k": "Black-body temperature (K)",
}

ROW = re.compile(r"<tr>\s*<th[^>]*>(.*?)</th>\s*<td[^>]*>(.*?)</td>", re.S | re.I)
NUMBER = re.compile(r"^[~+-]?[\d,]*\.?\d+")


def clean(fragment: str) -> str:
    text = re.sub(r"<[^>]+>", " ", fragment)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def page_lines(raw: str) -> list[str]:
    raw = re.sub(r"(?is)<(script|style).*?</\1>", " ", raw)
    text = html.unescape(re.sub(r"<[^>]+>", " ", raw))
    return [re.sub(r"\s+", " ", line).strip() for line in text.splitlines() if line.strip()]


def to_number(text: str) -> float | None:
    m = NUMBER.match(text.replace("~", ""))
    return float(m.group(0).replace(",", "")) if m else None


def fact_value(raw: str, lines: list[str], label: str) -> float | None:
    """First table row with this label; falls back to a text line (Earth's page has no table)."""
    for head, cell in ROW.findall(raw):
        if clean(head).startswith(label):
            return to_number(clean(cell))
    for line in lines:
        if line.startswith(label):
            return to_number(line[len(label):].strip())
    return None


K_RANGE = re.compile(r"([\d.]+)\s*K?\s*(?:to|-)\s*([\d.]+)\s*K\b")
K_SCI = re.compile(r"([\d.]+)\s*x\s*10\s*(\d+)\s*K\b")
K_SINGLE = re.compile(r"~?\s*([\d,.]+)\s*K\b")


def temperature_statements(lines: list[str]) -> list[dict]:
    """Every '...temperature...: value K' line, kept verbatim with its parsed kelvin values."""
    out = []
    for line in lines:
        if ":" not in line or "temperature" not in line.split(":", 1)[0].lower():
            continue
        label, rest = (s.strip() for s in line.split(":", 1))
        # The first kelvin value in the line is the statement's value; later
        # ones are side notes (Mercury: "440 K (167 C) (590-725 K, sunward side)").
        found = [(m.start(), kind, m) for kind, rx in (("range", K_RANGE), ("sci", K_SCI), ("single", K_SINGLE))
                 if (m := rx.search(rest))]
        if not found:
            continue
        start, kind, m = min(found, key=lambda f: (f[0], f[1] != "range"))
        entry: dict = {"label": label, "quote": line, "approximate": rest[:start + 1].rstrip().endswith("~")
                       or rest[start:m.end()].lstrip().startswith("~")}
        if kind == "range":
            entry["low_k"], entry["high_k"] = float(m.group(1)), float(m.group(2))
        elif kind == "sci":
            entry["kelvin"] = float(m.group(1)) * 10 ** int(m.group(2))
        else:
            entry["kelvin"] = float(m.group(1).replace(",", ""))
        out.append(entry)
    return out


def meta(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.meta.json").read_text())


def build_bodies() -> dict:
    bodies = []
    for body_id, name, kind in BODIES:
        fixture = f"nssdca_{body_id}fact"
        raw = (FIXTURES / f"{fixture}.html").read_text(encoding="utf-8", errors="replace")
        lines = page_lines(raw)
        m = meta(fixture)
        bodies.append({
            "id": body_id,
            "name": name,
            "type": kind,
            "source": {
                "name": f"NASA NSSDCA {name} Fact Sheet",
                "url": f"{NSSDCA}{body_id}fact.html",
                "fetched_at": m["fetched_at"],
            },
            "facts": {k: fact_value(raw, lines, label) for k, label in FACTS.items()},
            "temperatures": temperature_statements(lines),
        })
    return {"dataset": "bodies", "version": 1, "bodies": bodies}


def build_kepler() -> dict:
    fixture = "jpl_approx_pos_elements"
    lines = page_lines((FIXTURES / f"{fixture}.html").read_text(encoding="utf-8", errors="replace"))
    start = next(i for i, l in enumerate(lines) if l.startswith("Table 1"))
    end = next(i for i, l in enumerate(lines) if i > start and l.startswith("Table 2"))
    num = r"(-?[\d.]+)"
    elem = re.compile(rf"^(Mercury|Venus|EM Bary|Mars|Jupiter|Saturn|Uranus|Neptune) {' '.join([num] * 6)}$")
    rate = re.compile(rf"^{' '.join([num] * 6)}$")
    keys = ["a_au", "e", "i_deg", "L_deg", "long_peri_deg", "long_node_deg"]
    bodies = {}
    block = lines[start:end]
    for i, line in enumerate(block):
        if m := elem.match(line):
            r = rate.match(block[i + 1])
            if not r:
                raise SystemExit(f"no rates line after {m.group(1)}")
            bodies[m.group(1)] = {
                "elements": dict(zip(keys, map(float, m.groups()[1:]))),
                "rates_per_century": dict(zip(keys, map(float, r.groups()))),
            }
    if len(bodies) != 8:
        raise SystemExit(f"expected 8 bodies in Table 1, got {sorted(bodies)}")
    return {
        "dataset": "kepler_elements",
        "version": 1,
        "source": {
            "name": "JPL Solar System Dynamics: Approximate Positions of the Planets, Table 1",
            "url": "https://ssd.jpl.nasa.gov/planets/approx_pos.html",
            "fetched_at": meta(fixture)["fetched_at"],
        },
        "frame": "mean ecliptic and equinox of J2000",
        "valid_from": "1800-01-01",
        "valid_to": "2050-12-31",
        "epoch_jd": 2451545.0,
        "bodies": bodies,
    }


def build_pluto() -> dict:
    fixture = "horizons_pluto_vectors_helio_1800_2050"
    body = json.loads((FIXTURES / f"{fixture}.json").read_text())
    result = body["result"]
    rows = []
    for line in result[result.index("$$SOE") + 5 : result.index("$$EOE")].strip().splitlines():
        parts = [p.strip() for p in line.split(",")]
        jd, x, y, z = float(parts[0]), float(parts[2]), float(parts[3]), float(parts[4])
        rows.append([jd, round(x, 7), round(y, 7), round(z, 7)])
    return {
        "dataset": "pluto_horizons",
        "version": 1,
        "source": {
            "name": "NASA JPL Horizons API (Pluto, 999)",
            "url": "https://ssd.jpl.nasa.gov/api/horizons.api",
            "fetched_at": meta(fixture)["fetched_at"],
            "api_version": body["signature"]["version"],
        },
        "frame": "heliocentric, ecliptic of J2000, au",
        "step_days": 30,
        "rows": rows,
    }


# ---------- Phase 4: target stars, their planets, missions ----------

TARGET_TICS = ["260128333", "259377017", "55652896", "307210830", "150428135", "52368076", "183985250", "251848941"]
TIC_COLUMNS = {"ra": "ra_deg", "dec": "dec_deg", "Teff": "teff_k", "rad": "radius_rsun", "mass": "mass_msun",
               "lum": "luminosity_lsun", "d": "distance_pc", "Tmag": "tess_mag"}
MAST_SOURCE = {"name": "MAST TESS Input Catalog v8 (Mast.Catalogs.Filtered.Tic)", "url": "https://mast.stsci.edu/api/v0/"}
ARCHIVE_SOURCE = {"name": "NASA Exoplanet Archive, Planetary Systems Composite Parameters (pscomppars)",
                  "url": "https://exoplanetarchive.ipac.caltech.edu/"}


def build_stars() -> dict:
    data = json.loads((FIXTURES / "mast_tic_targets_p4.json").read_text())
    if data.get("status") != "COMPLETE":
        raise SystemExit("MAST sample is not COMPLETE")
    rows = {str(r["ID"]): r for r in data["data"]}
    missing = sorted(set(TARGET_TICS) - set(rows))
    if missing:
        raise SystemExit(f"MAST sample is missing TIC {missing}")
    stars = {}
    for tic in TARGET_TICS:
        r = rows[tic]
        stars[f"TIC {tic}"] = {new: r[old] for old, new in TIC_COLUMNS.items()}
    return {"dataset": "stars", "version": 1,
            "source": {**MAST_SOURCE, "fetched_at": meta("mast_tic_targets_p4")["fetched_at"]}, "stars": stars}


ARCHIVE_COLUMNS = ["pl_name", "hostname", "pl_orbper", "pl_orbsmax", "pl_orbeccen", "pl_rade", "pl_eqt", "disc_year",
                   "st_teff", "st_rad", "st_mass", "st_lum"]


def build_systems() -> dict:
    """Confirmed planets per target star, keyed by TIC ID (never by name: names caused a mix-up, see
    docs/DATA_SOURCES.md Phase 6)."""
    rows = json.loads((FIXTURES / "exoplanet_archive_systems_by_tic_p6.json").read_text())
    systems: dict[str, dict] = {}
    for r in sorted(rows, key=lambda r: (r["tic_id"], r["pl_orbper"] or 0)):
        s = systems.setdefault(r["tic_id"], {"hostname": r["hostname"], "circumbinary": False, "planets": []})
        s["circumbinary"] = s["circumbinary"] or bool(r.get("cb_flag"))
        s["planets"].append({k: r.get(k) for k in ARCHIVE_COLUMNS})
    return {"dataset": "systems", "version": 2,
            "source": {**ARCHIVE_SOURCE, "fetched_at": meta("exoplanet_archive_systems_by_tic_p6")["fetched_at"]},
            "systems": systems}


def page_text(name: str) -> str:
    raw = (FIXTURES / f"{name}.html").read_text(encoding="utf-8", errors="replace")
    raw = re.sub(r"(?is)<(script|style).*?</\1>", " ", raw)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", raw)))


def horizons_header(name: str) -> str:
    return json.loads((FIXTURES / f"{name}.json").read_text())["result"]


# Each fact keeps the source's exact words (quote) and a plain rewording for the page (display); the build
# fails if a quote is not on the saved page.
MISSION_FACTS = {
    "tess": {"name": "TESS", "horizons_id": "-95",
             "launch": ("nasa_tess_mission", "https://science.nasa.gov/mission/tess/", "Launch April 18, 2018",
                        "April 18, 2018"),
             "status": ("nasa_tess_mission", "https://science.nasa.gov/mission/tess/", "Status Extended mission",
                        "Extended mission")},
    "jwst": {"name": "James Webb Space Telescope", "horizons_id": "-170",
             "launch": ("horizons_jwst_vectors_geo_p4", "https://ssd.jpl.nasa.gov/horizons/",
                        "Launched by Ariane 5 booster on 2021-Dec-25 @ 12:20 UTC", "December 25, 2021"),
             "status": None},
    "voyager1": {"name": "Voyager 1", "horizons_id": "-31",
                 "launch": ("nasa_voyager1_mission", "https://science.nasa.gov/mission/voyager/voyager-1/",
                            "launch Sept. 5, 1977", "September 5, 1977"),
                 "status": ("nasa_voyager1_mission", "https://science.nasa.gov/mission/voyager/voyager-1/",
                            "Status Extended Mission", "Extended mission")},
    "voyager2": {"name": "Voyager 2", "horizons_id": "-32",
                 "launch": ("nasa_voyager2_mission", "https://science.nasa.gov/mission/voyager/voyager-2/",
                            "launch Aug. 20, 1977", "August 20, 1977"),
                 "status": ("nasa_voyager2_mission", "https://science.nasa.gov/mission/voyager/voyager-2/",
                            "Status Extended Mission", "Extended mission")},
}
SOURCE_NAMES = {"nasa_tess_mission": "NASA Science: TESS", "horizons_jwst_vectors_geo_p4": "JPL Horizons object data: JWST (-170)",
                "nasa_voyager1_mission": "NASA Science: Voyager 1", "nasa_voyager2_mission": "NASA Science: Voyager 2"}


def build_missions() -> dict:
    out = {}
    for key, m in MISSION_FACTS.items():
        entry = {"name": m["name"], "horizons_id": m["horizons_id"]}
        for field in ("launch", "status"):
            spec = m[field]
            if spec is None:
                entry[field] = None
                continue
            fixture, url, quote, display = spec
            text = horizons_header(fixture) if fixture.startswith("horizons") else page_text(fixture)
            if quote not in re.sub(r"\s+", " ", text):
                raise SystemExit(f"{key} {field}: quote not found on the saved page: {quote!r}")
            entry[field] = {"quote": quote, "display": display, "source": {"name": SOURCE_NAMES[fixture], "url": url,
                                                      "fetched_at": meta(fixture)["fetched_at"]}}
        out[key] = entry
    return {"dataset": "missions", "version": 1, "missions": out}


# TESS explainer facts, with the source's exact words (checked like the mission facts).
TESS_FACTS = [
    ("orbit", "horizons_tess_vectors_geo_p4", "https://ssd.jpl.nasa.gov/horizons/",
     "The operational orbit chosen for TESS is a highly eccentric, 2:1 lunar resonance orbit of 108,400 by "
     "376,300 kilometers at an inclination of 37 degrees"),
    ("sector", "mit_tess_observations", "https://tess.mit.edu/observations/",
     "TESS observes the sky in sectors measuring 24° x 96°. Each sector is observed for two orbits of the "
     "satellite around the Earth, or about 27 days on average."),
    ("cameras", "mit_tess_observations", "https://tess.mit.edu/observations/",
     "then (RA, dec, roll) in degrees (J2000) of the spacecraft and four camera boresights"),
    ("pole", "mit_tess_observations", "https://tess.mit.edu/observations/",
     "a 24° diameter region centered on the ecliptic pole can be observed for nearly a full year"),
    ("stars", "horizons_tess_vectors_geo_p4", "https://ssd.jpl.nasa.gov/horizons/",
     "Monitor 200,000 nearby stars for planets"),
    ("launch", "horizons_tess_vectors_geo_p4", "https://ssd.jpl.nasa.gov/horizons/",
     "Launched : 2018-Apr-18 22:51 UTC"),
]
TESS_SOURCE_NAMES = {"horizons_tess_vectors_geo_p4": "JPL Horizons object data: TESS (-95)",
                     "mit_tess_observations": "MIT TESS Science Office: TESS Observations"}


def build_tess() -> dict:
    facts = {}
    for key, fixture, url, quote in TESS_FACTS:
        text = horizons_header(fixture) if fixture.startswith("horizons") else page_text(fixture)
        if quote not in re.sub(r"\s+", " ", text):
            raise SystemExit(f"TESS {key}: quote not found on the saved page: {quote!r}")
        facts[key] = {"quote": quote, "source": {"name": TESS_SOURCE_NAMES[fixture], "url": url,
                                                 "fetched_at": meta(fixture)["fetched_at"]}}
    return {"dataset": "tess", "version": 1, "facts": facts}


def main() -> int:
    check = "--check" in sys.argv
    outputs = {
        "bodies.v1.json": build_bodies(),
        "kepler_elements.v1.json": build_kepler(),
        "pluto_horizons.v1.json": build_pluto(),
        "stars.v1.json": build_stars(),
        "systems.v1.json": build_systems(),
        "missions.v1.json": build_missions(),
        "tess.v1.json": build_tess(),
    }
    stale = []
    for name, data in outputs.items():
        text = json.dumps(data, indent=1, ensure_ascii=False) + "\n"
        path = OUT / name
        if check:
            if not path.exists() or path.read_text() != text:
                stale.append(name)
        else:
            path.write_text(text)
    if stale:
        print(f"stale reference data: {', '.join(stale)}. Run scripts/build_reference_data.py")
        return 1
    print("reference data up to date" if check else f"wrote {len(outputs)} files to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
