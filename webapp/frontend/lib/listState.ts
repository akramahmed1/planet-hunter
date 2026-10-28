// The candidates list's filter and sort, kept in the page address so a filtered view can be shared or reloaded.
// Pure and strict: anything unknown in the address is ignored, never trusted.
export type SortKey = "rank" | "period_d" | "depth_ppm" | "snr";
export type SortDir = "asc" | "desc";
export type ListState = { filter: string; sortKey: SortKey; sortDir: SortDir };

export const DEFAULT_STATE: ListState = { filter: "all", sortKey: "rank", sortDir: "asc" };

const KEYS: readonly SortKey[] = ["rank", "period_d", "depth_ppm", "snr"];

/** The direction a column starts in the first time it is chosen: rank and period count up, depth and SNR show the biggest first. */
export function firstDir(key: SortKey): SortDir {
  return key === "depth_ppm" || key === "snr" ? "desc" : "asc";
}

/** Read the state from a query string. `allowed` are the filter values that exist in this run. */
export function parseListState(search: string, allowed: readonly string[]): ListState {
  const q = new URLSearchParams(search);
  const f = q.get("class") ?? "all";
  const filter = f === "all" || allowed.includes(f) ? f : "all";
  const [k, d] = (q.get("sort") ?? "").split(":");
  const sortKey = (KEYS as readonly string[]).includes(k) ? (k as SortKey) : DEFAULT_STATE.sortKey;
  const sortDir: SortDir = d === "asc" || d === "desc" ? d : sortKey === DEFAULT_STATE.sortKey ? DEFAULT_STATE.sortDir : firstDir(sortKey);
  return { filter, sortKey, sortDir };
}

/** The query string for a state ("" when it is the default, so the plain address stays plain). */
export function listStateQuery(s: ListState): string {
  const q = new URLSearchParams();
  if (s.filter !== "all") q.set("class", s.filter);
  if (s.sortKey !== DEFAULT_STATE.sortKey || s.sortDir !== DEFAULT_STATE.sortDir) q.set("sort", `${s.sortKey}:${s.sortDir}`);
  const out = q.toString();
  return out ? `?${out}` : "";
}
