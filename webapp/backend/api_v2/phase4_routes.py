"""Phase 4 endpoints: our 8 target systems, spacecraft distances, the ISS track and TESS facts."""
from __future__ import annotations

import json
import math
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Path, Response

from api_v2 import schemas as s
from api_v2.live_routes import KM_PER_AU, KM_PER_MILE, UNAVAILABLE, _cache_header, _unavailable
from live import cache, clock, habitable, physics, reference, sources

router = APIRouter(prefix="/api/v2", tags=["v2"])
NOT_A_TARGET = {404: {"description": "Not one of the Planet Hunter targets"}}

RESULTS = reference.DATA / "results.json"
KEPLER3 = s.SourceRef(name="Kepler's third law, computed here from the period and the TIC star mass",
                      url="https://mast.stsci.edu/api/v0/")


def _results() -> list[dict]:
    return json.loads(RESULTS.read_text())["candidates"]


def _host(target: str) -> str:
    # "TOI 700" in results.json is "TOI-700" in the Exoplanet Archive.
    return target.replace(" ", "-")


def _src(d: dict) -> s.SourceRef:
    return s.SourceRef(name=d["name"], url=d["url"])


def _q(value, unit: str, source: s.SourceRef, kind: s.Kind = "measured", note: str | None = None):
    return None if value is None else s.Quantity(value=float(value), unit=unit, kind=kind, source=source, note=note)


@router.get("/targets", response_model=s.TargetsResponse)
def targets(response: Response) -> s.TargetsResponse:
    """The 8 Planet Hunter targets with their star's sky position (MAST TIC) and confirmed planet count."""
    stars, systems = reference.stars(), reference.systems()
    out = []
    for c in _results():
        st = stars["stars"][c["tic"]]
        out.append(s.TargetSummary(
            slug=c["slug"], target=c["target"], tic=c["tic"], host=_host(c["target"]),
            classification=c["classification"], classification_label=c["classification_label"],
            ra_deg=st["ra_deg"], dec_deg=st["dec_deg"], distance_pc=st["distance_pc"], teff_k=st["teff_k"],
            confirmed_planets=len(systems["systems"].get(_host(c["target"]), [])),
        ))
    _cache_header(response, 86_400)
    return s.TargetsResponse(targets=out, star_source=_src(stars["source"]), planet_source=_src(systems["source"]))


@router.get("/targets/{slug}/system", response_model=s.TargetSystemResponse, responses=NOT_A_TARGET)
def target_system(response: Response, slug: str = Path(..., pattern=r"^[a-z0-9-]{1,40}$")) -> s.TargetSystemResponse:
    """A target's star, its confirmed planets, our pipeline's signal and the habitable zone."""
    cand = next((c for c in _results() if c["slug"] == slug), None)
    if cand is None:
        raise HTTPException(404, f"'{slug}' is not a Planet Hunter target")
    stars, systems = reference.stars(), reference.systems()
    st = stars["stars"][cand["tic"]]
    star_src, planet_src = _src(stars["source"]), _src(systems["source"])
    host = _host(cand["target"])

    planets = []
    for r in systems["systems"].get(host, []):
        eq = _q(r["pl_eqt"], "K", planet_src)
        if eq is None and None not in (r["st_teff"], r["st_rad"], r["pl_orbsmax"]):
            eq = _q(round(physics.equilibrium_temperature_k(r["st_teff"], r["st_rad"], r["pl_orbsmax"]), 1), "K",
                    s.SourceRef(**physics.EQ_TEMP_SOURCE), "estimate",
                    "Estimated: assumes no reflected light and heat spread evenly around the planet.")
        planets.append(s.SystemPlanet(
            name=r["pl_name"], status="confirmed", orbit_au=_q(r["pl_orbsmax"], "au", planet_src),
            period_days=_q(r["pl_orbper"], "days", planet_src), radius_earth=_q(r["pl_rade"], "Earth radii", planet_src),
            eccentricity=r["pl_orbeccen"], equilibrium_temperature=eq, disc_year=r["disc_year"],
        ))

    # Our pipeline's strongest signal, drawn as an orbit only for display. It is a candidate signal, not a planet.
    a = habitable.kepler_semimajor_axis_au(cand["period_d"], st["mass_msun"]) if st["mass_msun"] else None
    ours = s.SourceRef(name="Planet Hunter pipeline (this site)", url="/method")
    planets.append(s.SystemPlanet(
        name=f"{cand['target']} pipeline signal", status="pipeline_signal",
        orbit_au=_q(a, "au", KEPLER3, "computed", "Where an object with this period would orbit. "
                    "The signal may not be a planet: see its classification."),
        period_days=_q(cand["period_d"], "days", ours), radius_earth=None, eccentricity=None,
        equilibrium_temperature=None if a is None else _q(
            round(physics.equilibrium_temperature_k(st["teff_k"], st["radius_rsun"], a), 1), "K",
            s.SourceRef(**physics.EQ_TEMP_SOURCE), "estimate",
            "Estimated: assumes no reflected light and heat spread evenly around the planet."),
        disc_year=None,
        note=f"Classification: {cand['classification_label']}. A candidate signal, never a discovery.",
    ))
    planets.sort(key=lambda p: p.orbit_au.value if p.orbit_au else math.inf)

    hz = None
    if st["teff_k"] and st["luminosity_lsun"]:
        z = habitable.zone(st["teff_k"], st["luminosity_lsun"])
        hz = s.HabitableZone(**z, kind="computed", source=s.SourceRef(**habitable.SOURCE),
                             note="Computed from the star's temperature and luminosity (TIC). Conservative: "
                                  "runaway to maximum greenhouse. Optimistic: recent Venus to early Mars. "
                                  "Being in this zone does not mean a planet has water."
                                  + ("" if z["in_valid_range"] else " This star is outside the formula's "
                                     "2600 to 7200 K range, so treat the zone as a rough guide."))
    _cache_header(response, 86_400)
    return s.TargetSystemResponse(
        slug=slug, target=cand["target"], tic=cand["tic"], host=host,
        star=s.Star(name=cand["target"], effective_temperature=_q(st["teff_k"], "K", star_src),
                    radius_rsun=_q(st["radius_rsun"], "solar radii", star_src),
                    mass_msun=_q(st["mass_msun"], "solar masses", star_src),
                    luminosity_lsun=_q(st["luminosity_lsun"], "solar luminosities", star_src),
                    distance_pc=_q(st["distance_pc"], "pc", star_src), ra_deg=st["ra_deg"], dec_deg=st["dec_deg"]),
        planets=planets, habitable_zone=hz,
        star_source=star_src, star_fetched_at=stars["source"]["fetched_at"],
        planet_source=planet_src, planets_fetched_at=systems["source"]["fetched_at"],
    )


def _fact(d: dict | None) -> s.SourcedFact | None:
    if d is None:
        return None
    return s.SourcedFact(quote=d["quote"], display=d.get("display"), source=_src(d["source"]),
                         fetched_at=d["source"]["fetched_at"])


def _craft_distance(craft: str, center: str) -> s.SpacecraftDistance | None:
    d = clock.today()
    try:
        hit = cache.cached(f"horizons:craft:{craft}:{center}:{d}", timedelta(hours=12),
                           lambda: sources.spacecraft_range(craft, d, center), sources.SRC_HORIZONS)
    except cache.Unavailable:
        return None
    km = hit.payload["km"]
    return s.SpacecraftDistance(distance=s.Distance(km=km, mi=km / KM_PER_MILE, au=km / KM_PER_AU),
                                light_time_seconds=hit.payload["light_time_s"], kind="measured",
                                source=s.SourceRef(**sources.SRC_HORIZONS), fetched_at=hit.fetched_at, stale=hit.stale)


@router.get("/missions", response_model=s.MissionsResponse)
def missions(response: Response) -> s.MissionsResponse:
    """TESS, JWST, Voyager 1 and Voyager 2: distance from Earth and the Sun today (JPL Horizons), launch and status."""
    out = []
    for key, m in reference.missions()["missions"].items():
        earth, sun = _craft_distance(key, "500@399"), _craft_distance(key, "500@10")
        out.append(s.Spacecraft(
            id=key, name=m["name"], from_earth=earth, from_sun=sun, launch=_fact(m["launch"]), status=_fact(m["status"]),
            note=None if earth and sun else "JPL Horizons is unavailable right now, so a distance is missing.",
        ))
    _cache_header(response, 3600)
    return s.MissionsResponse(date=clock.today(), spacecraft=out)


@router.get("/iss/track", response_model=s.IssTrackResponse, responses=UNAVAILABLE)
def iss_track(response: Response):
    """The ISS ground track for the next 90 minutes (10 points, 10 minutes apart), cached 10 minutes."""
    start = int(clock.now().timestamp())
    try:
        hit = cache.cached("iss:track", timedelta(minutes=10), lambda: sources.iss_track(start), sources.SRC_ISS)
    except cache.Unavailable:
        return _unavailable("The ISS track service is unavailable right now.", sources.SRC_ISS)
    _cache_header(response, 600)
    return s.IssTrackResponse(points=[s.TrackPoint(**p) for p in hit.payload], kind="computed",
                              source=s.SourceRef(**sources.SRC_ISS), fetched_at=hit.fetched_at, stale=hit.stale,
                              note="Predicted positions, worked out by the provider from the station's orbit.")


@router.get("/tess", response_model=s.TessFactsResponse)
def tess(response: Response) -> s.TessFactsResponse:
    """Facts for the TESS explainer, each with the source's exact words."""
    _cache_header(response, 86_400)
    return s.TessFactsResponse(facts={k: _fact(v) for k, v in reference.tess()["facts"].items()})
