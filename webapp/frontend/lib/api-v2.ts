// Typed access to /api/v2. The types come from the generated OpenAPI file
// (ADR 0002), so a backend model change shows up here as a type error.
import { serverApiBase } from "@/lib/api";
import type { components } from "@/lib/api-types.gen";

export type Schemas = components["schemas"];
export type V2Health = Schemas["V2HealthResponse"];
export type Features = Schemas["Features"];
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
    const res = await fetch(`${serverApiBase()}${path}`, { cache: "no-store", ...init });
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
export type LessonsResponse = Schemas["LessonsResponse"];
export type LessonSummary = Schemas["LessonSummary"];
export type LessonResponse = Schemas["LessonResponse"];
export type LessonQuestion = Schemas["LessonQuestion"];
export type AnswerResult = Schemas["AnswerResult"];
export type Me = Schemas["Me"];
export type OrgDetail = Schemas["OrgDetail"];
export type ClassSummary = Schemas["ClassSummary"];
export type ClassDetail = Schemas["ClassDetail"];
export type Gradebook = Schemas["Gradebook"];
export type StudentHome = Schemas["StudentHome"];
export type HuntResult = Schemas["HuntResult"];
export type ExplainStatus = Schemas["ExplainStatus"];
export type ExplainResponse = Schemas["ExplainResponse"];
export type OrgBilling = Schemas["OrgBilling"];

/**
 * Send JSON to /api/v2 and read the reply. In the browser this goes to the frontend's own
 * /api/v2 (rewritten to the backend in next.config.ts), so the session cookie is first-party,
 * and it carries the X-PH-CSRF header the API requires on changes. Errors carry the API's
 * `detail` message when there is one.
 */
export async function apiV2Send<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: `/api/v2/${string}`,
  body?: unknown,
): Promise<V2Result<T>> {
  const base = typeof window === "undefined" ? serverApiBase() : "";
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      cache: "no-store",
      credentials: "same-origin",
      headers: { "X-PH-CSRF": "1", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: await errorDetail(res) };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (e) {
    return { ok: false, status: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** POST JSON to /api/v2. */
export function apiV2Post<T>(path: `/api/v2/${string}`, body: unknown): Promise<V2Result<T>> {
  return apiV2Send<T>("POST", path, body);
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { detail?: unknown };
    if (typeof j.detail === "string") return j.detail;
    // FastAPI validation errors: a list of {loc, msg}.
    if (Array.isArray(j.detail) && j.detail.length > 0) {
      const d = j.detail[0] as { loc?: unknown[]; msg?: string };
      const field = Array.isArray(d.loc) ? String(d.loc[d.loc.length - 1]).replace(/_/g, " ") : "";
      return `${field ? `${field}: ` : ""}${d.msg ?? "not valid"}`;
    }
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}`;
}
