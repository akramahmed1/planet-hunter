/** "2026-10-17 08:12 UTC". Same output on server and client, so no hydration mismatch. */
export function formatUtc(iso: string): string {
  const s = new Date(iso).toISOString();
  return `${s.slice(0, 10)} ${s.slice(11, 16)} UTC`;
}

/** "Oct 19, 7:17 pm CDT": the instant in the viewer's time zone, with the zone named. */
export function formatLocal(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  const part = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone, ...opts }).format(d);
  const date = part({ month: "short", day: "numeric" });
  const time = part({ hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s?([AP]M)$/i, (_, m) => ` ${m.toLowerCase()}`);
  const zone = part({ timeZoneName: "short" }).split(", ").pop() ?? "";
  return `${date}, ${time} ${zone}`.trim();
}

/** The viewer's calendar date as YYYY-MM-DD (en-CA prints it in that order). */
export function localDate(now: Date = new Date(), timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * How old a calendar date is, in words: "today", "yesterday", "12 days ago", "about 2 months ago".
 * Both dates are read as UTC calendar days, so the answer does not depend on the reader's time zone.
 */
export function ageLabel(date: string, now: Date = new Date()): string {
  const then = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(then)) return "";
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((today - then) / 86_400_000);
  if (days < 0) return "";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days} days ago`;
  if (days < 365) return `about ${Math.round(days / 30)} months ago`;
  const years = Math.round(days / 365);
  return `about ${years} ${years === 1 ? "year" : "years"} ago`;
}
