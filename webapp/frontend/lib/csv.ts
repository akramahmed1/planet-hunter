// CSV downloads (launch task T38). Everything is built in the browser from the numbers already on the page, so a
// download is always exactly what the page shows and needs no extra server route.

export type Cell = string | number | boolean | null | undefined;

/**
 * One text cell, made safe: quoted when it holds a comma, quote, line break or edge spaces, and defanged when a
 * spreadsheet would read it as a formula (a leading = + - @ tab or return gets a single quote in front, the usual defence).
 * Numbers are never defanged: a negative number is a number.
 */
export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "true" : "false";
  let t = v;
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[",\r\n]|^\s|\s$/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** Rows to CSV text: comma separated, CRLF line ends (RFC 4180), no trailing blank line. */
export function toCsv(rows: Cell[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** A file name safe on every system: lower case words joined by dashes, ending in the date. */
export function csvFileName(parts: string[], date: Date): string {
  const slug = parts.join(" ").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "data";
  return `planet-hunter-${slug}-${date.toISOString().slice(0, 10)}.csv`;
}

/** The share link for a page: the site's own address and the path, with no tracking and no personal state. */
export function shareUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
