// Typed access to /api/v2. The types come from the generated OpenAPI file
// (ADR 0002), so a backend model change shows up here as a type error.
import { API_BASE } from "@/lib/api";
import type { components } from "@/lib/api-types.gen";

export type Schemas = components["schemas"];
export type V2Health = Schemas["V2HealthResponse"];

export type V2Result<T> = { ok: true; data: T } | { ok: false; status: number | null; error: string };

export async function apiV2Get<T>(path: `/api/v2/${string}`): Promise<V2Result<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    return { ok: true, data: (await res.json()) as T };
  } catch (e) {
    return { ok: false, status: null, error: e instanceof Error ? e.message : String(e) };
  }
}
