// Typed access to /api/v2. The types come from the generated OpenAPI file
// (ADR 0002), so a backend model change shows up here as a type error.
import { API_BASE } from "@/lib/api";
import type { components } from "@/lib/api-types.gen";

export type Schemas = components["schemas"];
export type V2Health = Schemas["V2HealthResponse"];
export type Quantity = Schemas["Quantity"];
export type SourceRef = Schemas["SourceRef"];
export type Iss = Schemas["IssResponse"];
export type Apod = Schemas["ApodResponse"];
export type SpaceWeather = Schemas["SpaceWeatherResponse"];
export type ExoplanetsLatest = Schemas["ExoplanetsLatestResponse"];
export type Unavailable = Schemas["Unavailable"];

export type V2Result<T> =
  | { ok: true; data: T }
  // `unavailable` is set when the API explains a 503 (an upstream source is down
  // and nothing is cached yet); otherwise `error` describes the failure.
  | { ok: false; status: number | null; error: string; unavailable?: Unavailable };

export async function apiV2Get<T>(path: `/api/v2/${string}`, init?: RequestInit): Promise<V2Result<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init });
    if (!res.ok) {
      let unavailable: Unavailable | undefined;
      if (res.status === 503) {
        try {
          const body = (await res.json()) as Unavailable;
          if (body?.status === "unavailable") unavailable = body;
        } catch {
          // not the API's JSON; fall through to the generic error
        }
      }
      return { ok: false, status: res.status, error: `HTTP ${res.status}`, unavailable };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (e) {
    return { ok: false, status: null, error: e instanceof Error ? e.message : String(e) };
  }
}
export type Body = Schemas["Body"];
export type BodiesResponse = Schemas["BodiesResponse"];
export type Position = Schemas["Position"];
export type PositionsResponse = Schemas["PositionsResponse"];
export type OrbitsResponse = Schemas["OrbitsResponse"];
export type TemperatureStatement = Schemas["TemperatureStatement"];
export type TargetsResponse = Schemas["TargetsResponse"];
export type TargetSummary = Schemas["TargetSummary"];
export type TargetSystem = Schemas["TargetSystemResponse"];
export type SystemPlanet = Schemas["SystemPlanet"];
export type HabitableZone = Schemas["HabitableZone"];
export type MissionsResponse = Schemas["MissionsResponse"];
export type Spacecraft = Schemas["Spacecraft"];
export type SourcedFact = Schemas["SourcedFact"];
export type IssTrack = Schemas["IssTrackResponse"];
export type TessFacts = Schemas["TessFactsResponse"];
export type LightCurveResponse = Schemas["LightCurveResponse"];
export type PeriodogramResponse = Schemas["PeriodogramResponse"];
export type ScanCreated = Schemas["ScanCreated"];
export type ScanStatus = Schemas["ScanStatus"];
export type VettingRow = Schemas["VettingRow"];

/** POST JSON to /api/v2. Errors carry the API's `detail` message when there is one. */
export async function apiV2Post<T>(path: `/api/v2/${string}`, body: unknown): Promise<V2Result<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { detail?: unknown };
        if (typeof j.detail === "string") detail = j.detail;
      } catch {
        // not JSON
      }
      return { ok: false, status: res.status, error: detail };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (e) {
    return { ok: false, status: null, error: e instanceof Error ? e.message : String(e) };
  }
}
