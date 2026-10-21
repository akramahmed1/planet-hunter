"""Response models for /api/v2.

The frontend's types for these are generated from the OpenAPI schema into
webapp/frontend/lib/api-types.gen.ts (ADR 0002), so there is nothing to keep
in sync by hand.
"""
from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DatabaseStatus(_Strict):
    status: Literal["connected", "not_configured", "unavailable"]
    latency_ms: float | None


class Features(_Strict):
    """Which optional parts of the site are switched on, so the frontend shows only what works."""
    classroom: bool


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


class Orbit(_Strict):
    id: str
    period_days: float
    # [x, y, z] in au, heliocentric ecliptic of J2000, evenly spaced in time over one period.
    points: list[list[float]]
    kind: Kind
    source: SourceRef
    note: str


class OrbitsResponse(_Strict):
    frame: str
    period_source: SourceRef
    orbits: list[Orbit]


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


# ---------- Phase 4: target systems, missions, TESS ----------

class SourcedFact(_Strict):
    quote: str
    display: str | None = None
    source: SourceRef
    fetched_at: dt.datetime


class HabitableZone(_Strict):
    conservative_inner_au: float
    conservative_outer_au: float
    optimistic_inner_au: float
    optimistic_outer_au: float
    in_valid_range: bool
    kind: Kind
    source: SourceRef
    note: str


class SystemPlanet(_Strict):
    name: str
    status: Literal["confirmed", "pipeline_signal"]
    orbit_au: Quantity | None
    period_days: Quantity | None
    radius_earth: Quantity | None
    eccentricity: float | None
    equilibrium_temperature: Quantity | None
    disc_year: int | None
    note: str | None = None


class TargetSummary(_Strict):
    slug: str
    target: str
    tic: str
    host: str
    classification: str
    classification_label: str
    ra_deg: float
    dec_deg: float
    distance_pc: float | None
    teff_k: float | None
    confirmed_planets: int


class TargetsResponse(_Strict):
    targets: list[TargetSummary]
    star_source: SourceRef
    planet_source: SourceRef


class TargetSystemResponse(_Strict):
    slug: str
    target: str
    tic: str
    host: str
    circumbinary: bool
    star: Star
    planets: list[SystemPlanet]
    habitable_zone: HabitableZone | None
    star_source: SourceRef
    star_fetched_at: dt.datetime
    planet_source: SourceRef
    planets_fetched_at: dt.datetime


class SpacecraftDistance(_Strict):
    distance: Distance
    light_time_seconds: float
    kind: Kind
    source: SourceRef
    fetched_at: dt.datetime
    stale: bool


class Spacecraft(_Strict):
    id: str
    name: str
    from_earth: SpacecraftDistance | None
    from_sun: SpacecraftDistance | None
    launch: SourcedFact | None
    status: SourcedFact | None
    note: str | None = None


class MissionsResponse(_Strict):
    date: dt.date
    spacecraft: list[Spacecraft]


class TrackPoint(_Strict):
    latitude: float
    longitude: float
    timestamp: int


class IssTrackResponse(Freshness):
    points: list[TrackPoint]
    kind: Kind
    source: SourceRef
    note: str


class TessFactsResponse(_Strict):
    facts: dict[str, SourcedFact]


# ---------- Phase 5: light curves ----------

class PipelineSignal(_Strict):
    period_d: float
    t0_btjd: float
    duration_d: float
    depth_ppm: float
    snr: float
    power: float


class Binning(_Strict):
    method: str
    bin_minutes: float
    n_bins: int


class LightCurveResponse(_Strict):
    slug: str
    target: str
    tic: str
    source: SourceRef
    fetched_at: dt.datetime
    sectors: list[int]
    n_cadences: int
    processing: str
    signal: PipelineSignal
    binning: Binning
    time_btjd: list[float]
    flux_ppm: list[int]


class PeriodogramResponse(_Strict):
    slug: str
    target: str
    tic: str
    source: SourceRef
    fetched_at: dt.datetime
    sectors: list[int]
    n_cadences: int
    processing: str
    signal: PipelineSignal
    method: str
    period_d: list[float]
    power: list[float]


# ---------- Phase 6: scans ----------

class ScanRequest(_Strict):
    target: str
    preset: Literal["standard", "validation"] = "standard"


class ScanCreated(_Strict):
    id: int
    status: Literal["queued", "running", "succeeded", "failed"]
    created: bool
    tic_id: int


class VettingRow(_Strict):
    id: str
    name: str
    status: Literal["pass", "warn", "fail", "unknown"]
    value: dict | None
    explanation: str


class CrossMatchHit(BaseModel):
    kind: str
    name: str
    period_d: float
    ratio: float
    relation: str
    disposition: str | None = None
    source: SourceRef


class CrossMatch(_Strict):
    matches: list[CrossMatchHit]
    proposed_label: str
    label_text: str
    note: str | None
    tolerance: float
    reviewed: bool


class ScanSignal(_Strict):
    period_d: float
    t0_btjd: float
    duration_d: float
    depth_ppm: float
    snr: float
    power: float
    vetting: list[VettingRow]
    crossmatch: CrossMatch
    proposed_label: str
    label_status: Literal["proposed, not reviewed", "reviewed"]


class ScanReview(_Strict):
    label: str
    reviewer: str
    note: str | None
    created_at: dt.datetime


class ScanStatus(_Strict):
    id: int
    status: Literal["queued", "running", "succeeded", "failed"]
    progress: str | None
    error: str | None
    tic_id: int
    toi: str | None
    preset: str
    attempts: int
    created_at: dt.datetime
    started_at: dt.datetime | None
    finished_at: dt.datetime | None
    pipeline_version: str | None
    sectors: list[int] | None
    n_cadences: int | None
    signal: ScanSignal | None
    reviews: list[ScanReview]


# Phase 7: lessons and quizzes.
class LessonBadge(_Strict):
    name: str
    text: str


class LessonLink(_Strict):
    href: str
    label: str


class LessonFact(_Strict):
    text: str
    kind: Literal["measured", "computed", "definition"]
    source: SourceRef


class LessonStep(_Strict):
    heading: str
    body: list[str]
    facts: list[LessonFact]


class LessonQuestion(_Strict):
    key: str
    kind: Literal["choice", "numeric"]
    prompt: str
    choices: list[str] | None
    unit: str | None
    tolerance: float | None


class LessonSummary(_Strict):
    slug: str
    title: str
    summary: str
    minutes: int
    badge: LessonBadge
    digest: str
    steps: int
    questions: int


class LessonsResponse(_Strict):
    lessons: list[LessonSummary]


class LessonResponse(_Strict):
    slug: str
    title: str
    summary: str
    minutes: int
    badge: LessonBadge
    links: list[LessonLink]
    digest: str
    steps: list[LessonStep]
    questions: list[LessonQuestion]


class AnswerRequest(_Strict):
    question: str = Field(pattern=r"^[a-z0-9_]{1,64}$")
    choice: int | None = Field(default=None, ge=0, le=20)
    value: float | None = None


class AnswerResult(_Strict):
    question: str
    correct: bool
    explanation: str
    source: SourceRef
    correct_choice: int | None
    choice_explanation: str | None
    answer: float | None
    tolerance: float | None
    unit: str | None


# Phase 8: accounts and classrooms.
class BirthMonth(_Strict):
    """Asked in a neutral way (month and year from lists); only the 13+ outcome is stored (ADR 0005)."""
    birth_month: int = Field(ge=1, le=12)
    birth_year: int = Field(ge=1900, le=2100)


class TeacherSignup(BirthMonth):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)
    display_name: str = Field(min_length=1, max_length=80)
    org_name: str | None = Field(default=None, min_length=2, max_length=120)
    org_code: str | None = Field(default=None, min_length=4, max_length=20)


class TeacherLogin(_Strict):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)


class ForgotPassword(_Strict):
    email: str = Field(min_length=3, max_length=254)


class ResetPassword(_Strict):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class DeleteAccount(_Strict):
    password: str = Field(min_length=1, max_length=200)
    code: str | None = Field(default=None, max_length=32)  # required when two-step sign-in is on
    delete_school: bool = False


class AccountDeleted(_Strict):
    ok: bool
    schools_deleted: int
    classes_deleted: int
    students_deleted: int


class LoginResult(_Strict):
    """`needs_2fa` means the password was right but the teacher has two-step sign-in on: no session exists yet, and
    `challenge` must be sent back with a code to /auth/teacher/login/2fa."""
    ok: bool
    needs_2fa: bool = False
    challenge: str | None = None


class LoginTwoFactor(_Strict):
    challenge: str = Field(min_length=20, max_length=200)
    code: str = Field(min_length=6, max_length=32)


class TwoFactorSetup(_Strict):
    secret: str
    otpauth_uri: str


class TwoFactorCode(_Strict):
    code: str = Field(min_length=6, max_length=32)


class TwoFactorProof(_Strict):
    password: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=6, max_length=32)


class RecoveryCodes(_Strict):
    ok: bool
    recovery_codes: list[str]


class VerifyEmail(_Strict):
    token: str = Field(min_length=20, max_length=200)


class StudentJoin(BirthMonth):
    class_code: str = Field(min_length=4, max_length=20)
    nickname: str = Field(min_length=1, max_length=24)
    pin: str = Field(min_length=4, max_length=8)


class StudentLogin(_Strict):
    class_code: str = Field(min_length=4, max_length=20)
    nickname: str = Field(min_length=1, max_length=24)
    pin: str = Field(min_length=4, max_length=8)


class OrgRole(_Strict):
    org_id: int
    name: str
    role: Literal["org_admin", "teacher"]


class MeTeacher(_Strict):
    kind: Literal["teacher"]
    display_name: str
    email: str
    email_verified: bool
    two_factor: bool
    orgs: list[OrgRole]


class MeStudent(_Strict):
    kind: Literal["student"]
    nickname: str
    class_id: int
    class_name: str


class Me(_Strict):
    me: MeTeacher | MeStudent | None


class OrgCreate(_Strict):
    name: str = Field(min_length=2, max_length=120)


class OrgJoin(_Strict):
    code: str = Field(min_length=4, max_length=20)


class OrgTeacher(_Strict):
    user_id: int
    display_name: str
    role: Literal["org_admin", "teacher"]


class OrgDetail(_Strict):
    id: int
    name: str
    role: Literal["org_admin", "teacher"]
    join_code: str | None
    teachers: list[OrgTeacher]


class OverviewTeacher(_Strict):
    user_id: int
    display_name: str
    role: Literal["org_admin", "teacher"]
    classes: int
    students: int


class OverviewClass(_Strict):
    id: int
    name: str
    created_at: dt.datetime
    teacher: str | None
    students: int
    assignments: int


class OverviewTotals(_Strict):
    teachers: int
    admins: int
    classes: int
    students: int
    assignments: int
    unassigned_classes: int


class OrgOverview(_Strict):
    id: int
    name: str
    totals: OverviewTotals
    teachers: list[OverviewTeacher]
    classes: list[OverviewClass]


class RoleChange(_Strict):
    role: Literal["org_admin", "teacher"]


class JoinCode(_Strict):
    join_code: str


class ClassCreate(_Strict):
    name: str = Field(min_length=1, max_length=80)


class ClassSummary(_Strict):
    id: int
    org_id: int
    name: str
    join_code: str
    created_at: dt.datetime
    students: int
    assignments: int
    expected: int
    completed: int
    average_percent: int | None
    next_due: dt.datetime | None


class ClassList(_Strict):
    classes: list[ClassSummary]


class Student(_Strict):
    id: int
    nickname: str
    created_at: dt.datetime


class Assignment(_Strict):
    id: int
    kind: Literal["lesson", "quiz", "hunt"]
    ref: str
    title: str
    due_at: dt.datetime | None
    created_at: dt.datetime


class ClassDetail(_Strict):
    id: int
    org_id: int
    name: str
    join_code: str
    created_at: dt.datetime
    students: list[Student]
    assignments: list[Assignment]


class AssignmentCreate(_Strict):
    kind: Literal["lesson", "quiz", "hunt"]
    ref: str = Field(pattern=r"^[a-z0-9-]{1,64}$")
    due_at: dt.datetime | None = None


class PinReset(_Strict):
    pin: str = Field(min_length=4, max_length=8)


class GradeCell(_Strict):
    score: float
    max_score: float
    completed_at: dt.datetime | None
    late: bool


class GradeRow(_Strict):
    member_id: int
    nickname: str
    cells: list[GradeCell | None]


class ClassRef(_Strict):
    id: int
    name: str


class Gradebook(_Strict):
    class_: ClassRef = Field(alias="class")
    assignments: list[Assignment]
    rows: list[GradeRow]

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class AssignmentResult(_Strict):
    score: float
    max_score: float
    completed_at: dt.datetime | None


class StudentAssignment(Assignment):
    result: AssignmentResult | None


class StudentHome(_Strict):
    class_: ClassRef = Field(alias="class")
    nickname: str
    assignments: list[StudentAssignment]

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class HuntSubmit(_Strict):
    period_d: float = Field(gt=0, lt=1000)


class HuntResult(_Strict):
    points: int
    verdict: Literal["exact", "close", "harmonic", "off"]
    harmonic: str | None = None
    best: float


class Ok(_Strict):
    ok: bool


# Phase 9: explainer and billing.
class ExplainStatus(_Strict):
    enabled: bool
    reason: str | None
    model: str | None
    # True when the explainer is on but has used its monthly budget (it returns by itself next month).
    paused: bool = False


class ExplainRequest(_Strict):
    kind: Literal["candidate", "scan", "planet"]
    ref: str = Field(pattern=r"^[a-z0-9-]{1,40}$")
    question: str = Field(min_length=1, max_length=600)


class ExplainCitation(_Strict):
    path: str
    value: str | int | float | bool | None


class ExplainResponse(_Strict):
    known: bool
    answer: str
    citations: list[ExplainCitation]
    model: str
    note: str


class Plan(_Strict):
    id: Literal["free", "classroom"]
    name: str
    classes: int
    students_per_class: int
    explainer_per_class_per_day: int


class PlansResponse(_Strict):
    enabled: bool
    reason: str | None
    limits_placeholder: bool
    plans: list[Plan]


class OrgBilling(_Strict):
    org_id: int
    plan: Literal["free", "classroom"]
    status: str
    billing_enabled: bool


class CheckoutResponse(_Strict):
    url: str
