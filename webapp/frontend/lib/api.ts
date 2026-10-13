// Shared types and fetch helpers for the planet-hunter backend API.
// The backend is expected at NEXT_PUBLIC_API_BASE, default http://127.0.0.1:8000.

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

export type Classification =
  | "clean-recovery"
  | "eclipsing-binary"
  | "ambiguous"
  | "marginal"
  | "likely-noise";

export interface Candidate {
  rank: number;
  target: string;
  slug: string;
  tic: string;
  period_d: number;
  duration_d: number;
  depth_ppm: number;
  snr: number;
  bls_power: number;
  n_cadences: number;
  classification: Classification;
  classification_label?: string;
  readout: string;
  plot_url: string | null;
}

export interface CandidatesResponse {
  count: number;
  run_date: string;
  sectors_per_target: number;
  candidates: Candidate[];
}

export interface ValidationResponse {
  target: string;
  tic: string;
  planet: string;
  recovered_period_d: number;
  published_period_d: number;
  period_error_pct: number;
  sectors: number;
  n_cadences: number;
  depth_ppm: number;
  search_period_min_d: number;
  search_period_max_d: number;
  data: string;
  archive: string;
  plot_url: string;
}

export interface MethodStep {
  title: string;
  body: string;
}

export interface MethodResponse {
  data_source: Record<string, string>;
  steps: MethodStep[];
  limitations: string[];
  roadmap: string[];
  exominer_note: string;
}

export async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function plotImageUrl(plotUrl: string | null): string | null {
  if (!plotUrl) return null;
  return `${API_BASE}${plotUrl}`;
}

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  "clean-recovery": "Clean recovery",
  "eclipsing-binary": "Eclipsing binary",
  ambiguous: "Ambiguous",
  marginal: "Marginal",
  "likely-noise": "Likely noise",
};

export function labelFor(c: Candidate): string {
  return c.classification_label || CLASSIFICATION_LABELS[c.classification];
}
