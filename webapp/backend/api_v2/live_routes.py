"""Phase 2 endpoints: bodies, positions, distances, ISS, APOD, space weather, exoplanets."""
from __future__ import annotations

import math
from functools import lru_cache
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Path, Query, Response
from fastapi.responses import JSONResponse

from api_v2 import schemas as s
from live import cache, clock, physics, positions, reference, sources

router = APIRouter(prefix="/api/v2", tags=["v2"])

# Explicit descriptions: FastAPI's defaults come from Python's HTTP status phrases, which
# changed between versions (422 "Unprocessable Entity" became "Unprocessable Content"), and
# the generated frontend types must be identical on every Python version.
UNAVAILABLE = {503: {"model": s.Unavailable, "description": "The upstream source is down and nothing is cached"}}
NOT_FOUND = {404: {"description": "No confirmed planets for this host"}}
BAD_NAME = {422: {"description": "Invalid host name"}}

KM_PER_AU = 149_597_870.7
KM_PER_MILE = 1.609344
C_KM_S = 299_792.458
POSITION_BODIES = ["sun", "mercury", "venus", "earth", "moon", "mars", "jupiter", "saturn", "uranus",
                   "neptune", "pluto"]

KEPLER_SOURCE = s.SourceRef(name="JPL approximate planet positions, Table 1 (computed here)",
                            url="https://ssd.jpl.nasa.gov/planets/approx_pos.html")
PLUTO_SOURCE = s.SourceRef(name="JPL Horizons Pluto positions every 30 days, interpolated here",
                           url="https://ssd.jpl.nasa.gov/horizons/")
FRAME_SOURCE = s.SourceRef(name="Heliocentric frame: the Sun is the origin",
                           url="https://ssd.jpl.nasa.gov/horizons/")


def _unavailable(message: str, source: dict) -> JSONResponse:
    body = s.Unavailable(status="unavailable", message=message, source=s.SourceRef(**source))
    return JSONResponse(body.model_dump(), status_code=503, headers={"Cache-Control": "no-store", "Retry-After": "300"})


def _cache_header(response: Response, seconds: int) -> None:
    response.headers["Cache-Control"] = f"public, max-age={seconds}"


def _temp(k: float | None) -> s.Temperature | None:
    if k is None:
        return None
    c = k - 273.15
    return s.Temperature(kelvin=k, celsius=round(c, 2), fahrenheit=round(c * 9 / 5 + 32, 2))


# ---------- bodies ----------

@router.get("/bodies", response_model=s.BodiesResponse)
def bodies(response: Response) -> s.BodiesResponse:
    """Sun, planets, Moon and Pluto from the NASA NSSDCA fact sheets (bundled, versioned)."""
    data = reference.bodies()
    out = []
    for b in data["bodies"]:
        src = s.SourceRef(name=b["source"]["name"], url=b["source"]["url"])
        f = b["facts"]

        def q(key: str, unit: str) -> s.Quantity | None:
            v = f.get(key)
            return None if v is None else s.Quantity(value=v, unit=unit, kind="measured", source=src)

        out.append(s.Body(
            id=b["id"], name=b["name"], type=b["type"], source=src,
            source_fetched_at=b["source"]["fetched_at"],
            mass=q("mass_1e24_kg", "1e24 kg"),
            mean_radius=q("mean_radius_km", "km"),
            semimajor_axis=q("semimajor_axis_1e6_km", "1e6 km"),
            orbit_period=q("orbit_period_days", "days"),
            day_length=q("day_length_hours", "hours"),
            blackbody_temperature=_temp(f.get("blackbody_temperature_k")),
            temperatures=[
                s.TemperatureStatement(
                    label=t["label"], quote=t["quote"], approximate=t["approximate"],
                    value=_temp(t.get("kelvin")), low=_temp(t.get("low_k")), high=_temp(t.get("high_k")),
                    kind="measured", source=src,
                )
                for t in b["temperatures"]
            ],
        ))
    _cache_header(response, 86_400)
    return s.BodiesResponse(dataset_version=data["version"], bodies=out)


# ---------- positions and distances ----------

def _computed(body_id: str, d: date, note: str | None = None) -> s.Position:
    x, y, z = positions.computed_position(body_id, d)
    source = FRAME_SOURCE if body_id == "sun" else PLUTO_SOURCE if body_id == "pluto" else KEPLER_SOURCE
    return s.Position(id=body_id, x_au=x, y_au=y, z_au=z, distance_from_sun_au=math.hypot(x, y, z),
                      kind="computed", source=source, fetched_at=None, stale=False, note=note)


def _horizons(body_id: str, d: date) -> s.Position:
    hit = cache.cached(f"horizons:vectors:{body_id}:{d}", timedelta(days=30),
                       lambda: sources.horizons_today(body_id, d), sources.SRC_HORIZONS)
    p = hit.payload
    x, y, z = p["x_au"], p["y_au"], p["z_au"]
    return s.Position(id=body_id, x_au=x, y_au=y, z_au=z, distance_from_sun_au=math.hypot(x, y, z),
                      kind="measured", source=s.SourceRef(**sources.SRC_HORIZONS),
                      fetched_at=hit.fetched_at, stale=hit.stale)


def positions_for(d: date) -> tuple[list[s.Position], list[str]]:
    notes: list[str] = []
    if d != clock.today():
        notes.append("Positions for dates other than today are computed from JPL's approximate "
                     "formulas (Pluto: interpolated Horizons positions). The Moon is only shown for today.")
        return [_computed(b, d) for b in POSITION_BODIES if b != "moon"], notes

    def one(body_id: str) -> s.Position | None:
        if body_id == "sun":
            return _computed("sun", d)
        try:
            return _horizons(body_id, d)
        except cache.Unavailable:
            if body_id == "moon":
                return None
            return _computed(body_id, d, note="JPL Horizons was unavailable, so this is computed instead.")

    # One body at a time: on staging, JPL Horizons answered 503 to some of six parallel
    # requests from the same client. The daily refresh fills the cache, so pages rarely wait.
    result = [p for p in map(one, POSITION_BODIES) if p is not None]
    if not any(p.id == "moon" for p in result):
        notes.append("The Moon's position is unavailable right now.")
    return result, notes


def _parse_date(value: str | None) -> date:
    if value is None:
        return clock.today()
    try:
        d = date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "date must be YYYY-MM-DD")
    lo, hi = positions.valid_range()
    if not lo <= d <= hi:
        raise HTTPException(422, f"date must be between {lo} and {hi}, the range JPL's data covers")
    return d


@router.get("/positions", response_model=s.PositionsResponse)
def get_positions(response: Response, date: str | None = Query(None, description="YYYY-MM-DD, default today (UTC)")):
    """Heliocentric positions (ecliptic of J2000, au): Horizons for today, computed for other dates."""
    d = _parse_date(date)
    bodies_out, notes = positions_for(d)
    lo, hi = positions.valid_range()
    _cache_header(response, 3600 if d == clock.today() else 86_400)
    return s.PositionsResponse(date=d, frame="heliocentric, ecliptic of J2000, au", valid_from=lo, valid_to=hi,
                               bodies=bodies_out, notes=notes)


ORBIT_BODIES = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]


@lru_cache(maxsize=1)
def _orbits() -> s.OrbitsResponse:
    facts = {b["id"]: b for b in reference.bodies()["bodies"]}
    out = []
    for body_id in ORBIT_BODIES:
        period = facts[body_id]["facts"]["orbit_period_days"]
        pts = positions.orbit_path(body_id, period)
        out.append(s.Orbit(
            id=body_id, period_days=period,
            points=[[round(c, 5) for c in p] for p in pts],
            kind="computed", source=PLUTO_SOURCE if body_id == "pluto" else KEPLER_SOURCE,
            note="One orbit, sampled at 180 evenly spaced times. The orbit shape changes very slowly, "
                 "so one path is used for every date.",
        ))
    return s.OrbitsResponse(frame="heliocentric, ecliptic of J2000, au",
                            period_source=s.SourceRef(name="Orbital periods: NASA NSSDCA planetary fact sheets",
                                                      url="https://nssdc.gsfc.nasa.gov/planetary/factsheet/"),
                            orbits=out)


@router.get("/orbits", response_model=s.OrbitsResponse)
def get_orbits(response: Response) -> s.OrbitsResponse:
    """Orbit paths for the planets and Pluto, for drawing (computed from the same data as /positions)."""
    _cache_header(response, 86_400)
    return _orbits()


@router.get("/distances", response_model=s.DistanceResponse)
def get_distance(
    response: Response,
    from_: str = Query(..., alias="from", description="body id, e.g. earth"),
    to: str = Query(..., description="body id, e.g. mars"),
    date: str | None = Query(None, description="YYYY-MM-DD, default today (UTC)"),
):
    """Straight-line distance between two bodies on a date, and the one-way light travel time."""
    a, b = from_.lower(), to.lower()
    for name in (a, b):
        if name not in POSITION_BODIES:
            raise HTTPException(422, f"unknown body '{name}'; use one of {', '.join(POSITION_BODIES)}")
    if a == b:
        raise HTTPException(422, "from and to must be different bodies")
    d = _parse_date(date)
    found = {p.id: p for p in positions_for(d)[0]}
    if a not in found or b not in found:
        raise HTTPException(422, "the Moon's position is only available for today")
    pa, pb = found[a], found[b]
    au = math.dist((pa.x_au, pa.y_au, pa.z_au), (pb.x_au, pb.y_au, pb.z_au))
    km = au * KM_PER_AU
    _cache_header(response, 3600)
    return s.DistanceResponse(
        from_body=a, to_body=b, date=d,
        distance=s.Distance(km=km, mi=km / KM_PER_MILE, au=au),
        light_time_seconds=km / C_KM_S, kind="computed", inputs=[pa, pb],
        source=s.SourceRef(name="Computed here from the two positions (1 au = 149,597,870.7 km, "
                                "c = 299,792.458 km/s, as printed by JPL Horizons)",
                           url="https://ssd-api.jpl.nasa.gov/doc/horizons.html"),
    )


# ---------- ISS, APOD, space weather ----------

@router.get("/iss", response_model=s.IssResponse, responses=UNAVAILABLE)
def get_iss(response: Response):
    """Current ISS position, cached 5 seconds (the provider allows about one request per second)."""
    try:
        hit = cache.cached("iss:now", timedelta(seconds=5), sources.iss, sources.SRC_ISS)
    except cache.Unavailable:
        return _unavailable("The ISS position service is unavailable right now.", sources.SRC_ISS)
    p = hit.payload
    _cache_header(response, 5)
    return s.IssResponse(latitude=p["latitude"], longitude=p["longitude"], altitude_km=p["altitude"],
                         velocity_kmh=p["velocity"], visibility=p["visibility"], timestamp=p["timestamp"],
                         kind="measured", source=s.SourceRef(**sources.SRC_ISS),
                         fetched_at=hit.fetched_at, stale=hit.stale)


@router.get("/apod", response_model=s.ApodResponse, responses=UNAVAILABLE)
def get_apod(response: Response):
    """NASA's Astronomy Picture of the Day. `copyright` names the owner when the image isn't NASA's."""
    try:
        hit = cache.cached(f"apod:{clock.today()}", timedelta(hours=3), sources.apod, sources.SRC_APOD,
                           fallback_key="apod:last")
    except cache.Unavailable:
        return _unavailable("NASA's picture of the day is unavailable right now.", sources.SRC_APOD)
    p = hit.payload
    _cache_header(response, 900)
    return s.ApodResponse(date=p["date"], title=p["title"], explanation=p.get("explanation") or "",
                          media_type=p.get("media_type") or "image", url=p.get("url"), hdurl=p.get("hdurl"),
                          copyright=(p.get("copyright") or "").strip() or None,
                          source=s.SourceRef(**sources.SRC_APOD), fetched_at=hit.fetched_at, stale=hit.stale)


@router.get("/space-weather", response_model=s.SpaceWeatherResponse, responses=UNAVAILABLE)
def get_space_weather(response: Response):
    """Space weather notifications from NASA DONKI for the last 7 days."""
    today = clock.today()
    try:
        hit = cache.cached(f"donki:{today}", timedelta(hours=3), lambda: sources.donki(today), sources.SRC_DONKI,
                           fallback_key="donki:last")
    except cache.Unavailable:
        return _unavailable("NASA's space weather service (DONKI) is temporarily unavailable.", sources.SRC_DONKI)
    _cache_header(response, 900)
    return s.SpaceWeatherResponse(notifications=[s.SpaceWeatherItem(**n) for n in hit.payload], window_days=7,
                                  source=s.SourceRef(**sources.SRC_DONKI), fetched_at=hit.fetched_at,
                                  stale=hit.stale)


# ---------- exoplanets ----------

EXO_SRC = s.SourceRef(**sources.SRC_EXO)
EQ_SRC = s.SourceRef(**physics.EQ_TEMP_SOURCE)


def _qx(row: dict, key: str, unit: str) -> s.Quantity | None:
    v = row.get(key)
    return None if v is None else s.Quantity(value=float(v), unit=unit, kind="measured", source=EXO_SRC)


def _eq_temp(row: dict) -> s.Quantity | None:
    if row.get("pl_eqt") is not None:
        return _qx(row, "pl_eqt", "K")
    teff, rad, a = row.get("st_teff"), row.get("st_rad"), row.get("pl_orbsmax")
    if None in (teff, rad, a) or a <= 0:
        return None
    return s.Quantity(value=round(physics.equilibrium_temperature_k(teff, rad, a), 1), unit="K", kind="estimate",
                      source=EQ_SRC,
                      note="Estimated: assumes no reflected light and heat spread evenly around the planet.")


@router.get("/exoplanets/latest", response_model=s.ExoplanetsLatestResponse,
            responses=UNAVAILABLE)
def exoplanets_latest(response: Response):
    """Confirmed planet count and planets published in the last 60 days."""
    today = clock.today()
    try:
        count = cache.cached("exo:count", timedelta(hours=12), sources.exoplanet_count, sources.SRC_EXO)
        latest = cache.cached(f"exo:latest:{today}", timedelta(hours=12), lambda: sources.exoplanets_latest(today),
                              sources.SRC_EXO, fallback_key="exo:latest:last")
    except cache.Unavailable:
        return _unavailable("The NASA Exoplanet Archive is unavailable right now.", sources.SRC_EXO)
    since = (today - timedelta(days=60)).strftime("%Y-%m")
    _cache_header(response, 3600)
    return s.ExoplanetsLatestResponse(
        confirmed_count=s.Quantity(value=count.payload, unit="planets", kind="measured", source=EXO_SRC,
                                   note="Rows in the archive's Planetary Systems Composite Parameters table."),
        since=since,
        latest=[s.ExoplanetSummary(name=r["pl_name"], host=r["hostname"], disc_year=r.get("disc_year"),
                                   disc_pubdate=r.get("disc_pubdate"), orbit_au=_qx(r, "pl_orbsmax", "au"),
                                   equilibrium_temperature=_eq_temp(r))
                for r in latest.payload[:12]],
        source=EXO_SRC, fetched_at=min(count.fetched_at, latest.fetched_at), stale=count.stale or latest.stale,
    )


@router.get("/exoplanets/{name}", response_model=s.ExoplanetSystemResponse,
            responses={**NOT_FOUND, **BAD_NAME, **UNAVAILABLE})
def exoplanet_system(response: Response, name: str = Path(..., description="host star name, e.g. TOI-700")):
    """One planetary system: the host star and its planets."""
    if not sources.HOST_NAME.match(name):
        raise HTTPException(422, "name may contain letters, digits, spaces and . + _ - only")
    try:
        hit = cache.cached(f"exo:system:{name.lower()}", timedelta(hours=24), lambda: sources.exoplanet_system(name),
                           sources.SRC_EXO)
    except cache.Unavailable:
        return _unavailable("The NASA Exoplanet Archive is unavailable right now.", sources.SRC_EXO)
    rows = hit.payload
    if not rows:
        raise HTTPException(404, f"no confirmed planets found for host '{name}'")
    star = rows[0]
    lum = star.get("st_lum")
    _cache_header(response, 3600)
    return s.ExoplanetSystemResponse(
        star=s.Star(
            name=star["hostname"],
            effective_temperature=_qx(star, "st_teff", "K"),
            radius_rsun=_qx(star, "st_rad", "solar radii"),
            mass_msun=_qx(star, "st_mass", "solar masses"),
            luminosity_lsun=None if lum is None else s.Quantity(
                value=round(10 ** lum, 6), unit="solar luminosities", kind="computed", source=EXO_SRC,
                note="10^st_lum: the archive gives luminosity as log10(L / L_sun)."),
            distance_pc=_qx(star, "sy_dist", "pc"),
            ra_deg=star.get("ra"), dec_deg=star.get("dec"),
        ),
        planets=[s.ExoPlanet(name=r["pl_name"], orbit_au=_qx(r, "pl_orbsmax", "au"),
                             period_days=_qx(r, "pl_orbper", "days"), radius_earth=_qx(r, "pl_rade", "Earth radii"),
                             equilibrium_temperature=_eq_temp(r), disc_year=r.get("disc_year"))
                 for r in sorted(rows, key=lambda r: r.get("pl_orbsmax") or math.inf)],
        source=EXO_SRC, fetched_at=hit.fetched_at, stale=hit.stale,
    )
