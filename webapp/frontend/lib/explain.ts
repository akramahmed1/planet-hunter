// "Explain this dip" (T43): the fixed question, and plain names for the fields an answer cites.

/** Sent as the question when the person presses the button. Under the 300 character limit. */
export const DIP_QUESTION =
  "Explain this dip: what is dipping, how deep and how often, how sure is the pipeline, and what does it not tell us?";

const NAMES: Record<string, string> = {
  period_d: "Period (days)",
  duration_d: "Transit duration (days)",
  depth_ppm: "Depth (ppm)",
  snr: "Signal to noise",
  bls_power: "BLS power",
  n_cadences: "Cadences",
  classification: "Classification",
  classification_label: "Label",
  rank: "Rank",
  target: "Target",
  tic: "TIC",
  tic_id: "TIC",
  toi: "TOI",
  sectors: "Sectors",
  t0_btjd: "First transit (BTJD)",
  vetting: "Vetting checks",
  crossmatch: "Catalog cross-match",
  proposed_label: "Proposed label",
  label_status: "Label status",
};

/** A short plain name for a cited path such as `item.depth_ppm` or `item.signal.snr`, or null when it has none. */
export function fieldLabel(path: string): string | null {
  const last = path.split(".").pop()?.replace(/\[\d+\]$/, "") ?? "";
  if (path.startsWith("lessons.")) return "Lesson text";
  return NAMES[last] ?? null;
}

/** Pages where the one-tap button makes sense: something that dips. */
export function hasDip(kind: string): boolean {
  return kind === "candidate" || kind === "scan";
}
