// How healthy each live source is, in plain words (launch task T26). Pure, so it can be unit tested.

export type SourceState = "live" | "stale" | "down";

export type SourceStatus = { name: string; state: SourceState; fetchedAt: string | null };

/** `ok` means the API answered with data; `stale` means that data is older than its source's freshness window. */
export function sourceState(r: { ok: boolean; stale?: boolean }): SourceState {
  if (!r.ok) return "down";
  return r.stale ? "stale" : "live";
}

export const STATE_WORDS: Record<SourceState, string> = {
  live: "Live",
  stale: "May be out of date",
  down: "Unavailable",
};

/** One sentence for the top of the panel. It never says "live" about a source that is not. */
export function headline(items: SourceStatus[]): string {
  const total = items.length;
  const live = items.filter((i) => i.state === "live").length;
  if (total === 0) return "";
  if (live === total) return total === 1 ? "The live source is up." : `All ${total} live sources are up.`;
  if (live === 0) return "No live source is answering right now. The rest of the site still works.";
  const bad = total - live;
  return `${live} of ${total} live sources are up. ${bad === 1 ? "One needs" : `${bad} need`} a moment; the rest of the site still works.`;
}
