// Types and fetch helpers for the planet-hunter backend API.
//
// These interfaces mirror webapp/backend/schemas.py exactly. CI enforces it:
// webapp/backend/tests/test_contract.py fails if a field, its optionality, or
// a classification value differs between the two.
//
// The backend is expected at NEXT_PUBLIC_API_BASE, default http://127.0.0.1:8000.

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

export type Classification =
  | "clean-recovery"
  | "eclipsing-binary"
  | "ambiguous"
  | "marginal"
  | "likely-noise"
  | "unreviewed";

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
  classification_label: string;
  readout: string;
  plot_url: string | null;
}

export interface RunInfo {
  run_date: string;
  sectors_per_target: number;
  search_period_min_d: number;
  search_period_max_d: number;
  method: string;
  source_csv: string;
}

export interface Validation {
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

export interface Summary {
  count: number;
  by_classification: Record<Classification, number>;
}

export interface CandidatesResponse {
  run: RunInfo;
  honesty: string;
  summary: Summary;
  candidates: Candidate[];
}

export interface OverviewResponse {
  run: RunInfo;
  honesty: string;
  summary: Summary;
  validation: Validation;
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

export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
  schema_version: number;
  run_date: string;
  candidate_count: number;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null; error: string };

// Never returns silent placeholder content: callers must render the error.
export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `API returned ${res.status} for ${path}` };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: null, error: `API unreachable for ${path}: ${msg}` };
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
  unreviewed: "Unreviewed",
};

export function labelFor(c: Candidate): string {
  return c.classification_label || CLASSIFICATION_LABELS[c.classification];
}

const SMALL_NUMBERS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

// "three" for 3, "12" for 12. Used to keep page copy driven by the data.
export function numberWord(n: number, capitalize = false): string {
  const w = n >= 0 && n < SMALL_NUMBERS.length ? SMALL_NUMBERS[n] : String(n);
  return capitalize ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}

// One sentence summarising a scan, built from the counts so it can never drift.
export function scanSummarySentence(s: Summary): string {
  const b = s.by_classification;
  const parts: string[] = [];
  if (b["clean-recovery"]) parts.push(`${numberWord(b["clean-recovery"], true)} matched known planets cleanly.`);
  if (b["eclipsing-binary"]) {
    parts.push(
      b["eclipsing-binary"] === 1
        ? "One is an eclipsing binary, not a planet."
        : `${numberWord(b["eclipsing-binary"], true)} are eclipsing binaries, not planets.`
    );
  }
  if (b.ambiguous) parts.push(`${numberWord(b.ambiguous, true)} ${b.ambiguous === 1 ? "is" : "are"} ambiguous and stay${b.ambiguous === 1 ? "s" : ""} unexplained on purpose.`);
  const weak = (b.marginal ?? 0) + (b["likely-noise"] ?? 0);
  if (weak) parts.push(`${numberWord(weak, true)} ${weak === 1 ? "was" : "were"} weak or likely noise.`);
  if (b.unreviewed) parts.push(`${numberWord(b.unreviewed, true)} ${b.unreviewed === 1 ? "has" : "have"} not been reviewed by a human yet.`);
  return parts.join(" ");
}
