// The status strip under the top bar (launch task T29): UTC clock, ISS position and how fresh its data is.
// Pure helpers, so they are unit tested; the component only wires them to the clock and the API.

const pad = (n: number) => String(n).padStart(2, "0");

/** "23:58:07", always in UTC, whatever the viewer's time zone. */
export function utcClock(d: Date): string {
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** The text shown before the first tick: the same width as a real time, so the strip does not move when it fills in. */
export const CLOCK_PLACEHOLDER = "--:--:--";

/** "34.8° N" or "57.9° W": one decimal, with the hemisphere in words rather than a minus sign. */
export function coordText(value: number, positive: string, negative: string): string {
  if (!Number.isFinite(value)) return "";
  return `${Math.abs(value).toFixed(1)}° ${value >= 0 ? positive : negative}`;
}

/** How long ago the data was fetched, in plain words. Empty if the time is not valid. A future time counts as just now. */
export function freshness(iso: string, now: Date): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return "a day or more ago";
}
