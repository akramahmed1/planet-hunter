"""Response models for /api/v2.

The frontend's types for these are generated from the OpenAPI schema into
webapp/frontend/lib/api-types.gen.ts (ADR 0002), so there is nothing to keep
in sync by hand.
"""
from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, ConfigDict


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DatabaseStatus(_Strict):
    status: Literal["connected", "not_configured", "unavailable"]
    latency_ms: float | None


class V2HealthResponse(_Strict):
    status: Literal["ok", "degraded"]
    service: str
    api_version: Literal["2"]
    version: str
    commit: str | None
    database: DatabaseStatus


# ---------- Phase 2: live data ----------
#
# Every scientific value names its source and a kind:
#   measured  taken directly from the cited source
#   computed  calculated here from source data by an exact method (e.g. unit
#             conversion, JPL's position formulas)
#   estimate  calculated here with simplifying assumptions, stated in `note`

Kind = Literal["measured", "computed", "estimate"]


class SourceRef(_Strict):
    name: str
    url: str


class Freshness(_Strict):
    fetched_at: dt.datetime
    stale: bool


class Quantity(_Strict):
    value: float
    unit: str
    kind: Kind
    source: SourceRef
    note: str | None = None


class Temperature(_Strict):
    kelvin: float
    celsius: float
    fahrenheit: float


class TemperatureStatement(_Strict):
    label: str
    quote: str
    approximate: bool
    value: Temperature | None
    low: Temperature | None
    high: Temperature | None
    kind: Kind
    source: SourceRef


class Body(_Strict):
    id: str
    name: str
    type: Literal["star", "planet", "moon", "dwarf_planet"]
    source: SourceRef
    source_fetched_at: dt.datetime
    # Served in the fact sheet's own units (e.g. 10^24 kg), so they stay `measured`.
    mass: Quantity | None
    mean_radius: Quantity | None
    semimajor_axis: Quantity | None
    orbit_period: Quantity | None
    day_length: Quantity | None
    blackbody_temperature: Temperature | None
    temperatures: list[TemperatureStatement]


class BodiesResponse(_Strict):
    dataset_version: int
    bodies: list[Body]


class Position(_Strict):
    id: str
    x_au: float
    y_au: float
    z_au: float
    distance_from_sun_au: float
    kind: Kind
    source: SourceRef
    fetched_at: dt.datetime | None
    stale: bool
    note: str | None = None


class PositionsResponse(_Strict):
    date: dt.date
    frame: str
    valid_from: dt.date
    valid_to: dt.date
    bodies: list[Position]
    notes: list[str]


class Distance(_Strict):
    km: float
    mi: float
    au: float


class DistanceResponse(_Strict):
    from_body: str
    to_body: str
    date: dt.date
    distance: Distance
    light_time_seconds: float
    kind: Kind
    inputs: list[Position]
    source: SourceRef


class IssResponse(Freshness):
    latitude: float
    longitude: float
    altitude_km: float
    velocity_kmh: float
    visibility: str
    timestamp: int
    kind: Kind
    source: SourceRef


class ApodResponse(Freshness):
    date: dt.date
    title: str
    explanation: str
    media_type: str
    url: str | None
    hdurl: str | None
    copyright: str | None
    source: SourceRef


class SpaceWeatherItem(_Strict):
    type: str
    issued: str
    url: str | None


class SpaceWeatherResponse(Freshness):
    notifications: list[SpaceWeatherItem]
    window_days: int
    source: SourceRef


class Unavailable(_Strict):
    status: Literal["unavailable"]
    message: str
    source: SourceRef


class ExoplanetSummary(_Strict):
    name: str
    host: str
    disc_year: int | None
    disc_pubdate: str | None
    orbit_au: Quantity | None
    equilibrium_temperature: Quantity | None


class ExoplanetsLatestResponse(Freshness):
    confirmed_count: Quantity
    since: str
    latest: list[ExoplanetSummary]
    source: SourceRef


class Star(_Strict):
    name: str
    effective_temperature: Quantity | None
    radius_rsun: Quantity | None
    mass_msun: Quantity | None
    luminosity_lsun: Quantity | None
    distance_pc: Quantity | None
    ra_deg: float | None
    dec_deg: float | None


class ExoPlanet(_Strict):
    name: str
    orbit_au: Quantity | None
    period_days: Quantity | None
    radius_earth: Quantity | None
    equilibrium_temperature: Quantity | None
    disc_year: int | None


class ExoplanetSystemResponse(Freshness):
    star: Star
    planets: list[ExoPlanet]
    source: SourceRef
