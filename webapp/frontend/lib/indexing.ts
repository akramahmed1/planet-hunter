// What search engines may crawl. Closed by default (staging, previews, local), open only when ALLOW_INDEXING=1 is set,
// which is a deliberate production switch. Pages that need a sign-in or belong to one person are never listed.
type Env = Record<string, string | undefined>;

export const PUBLIC_PATHS = ["/", "/solar-system", "/exoplanets", "/candidates", "/missions", "/learn", "/method", "/privacy"];
export const PRIVATE_PREFIXES = ["/api/", "/classroom", "/welcome", "/my-scans", "/my-watchlist", "/alerts", "/scan/"];

export function indexingOpen(env: Env = process.env): boolean {
  return env.ALLOW_INDEXING === "1";
}

export function robotsRules(origin: string, env: Env = process.env) {
  if (!indexingOpen(env)) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE_PREFIXES }],
    sitemap: new URL("/sitemap.xml", origin).toString(),
  };
}

export function sitemapEntries(origin: string, env: Env = process.env): { url: string }[] {
  if (!indexingOpen(env)) return [];
  return PUBLIC_PATHS.map((p) => ({ url: new URL(p, origin).toString() }));
}
