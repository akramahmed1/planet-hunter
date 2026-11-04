// Which optional parts of the site the server has switched on (GET /api/v2/features).
import { serverApiBase } from "@/lib/api";
import type { Features } from "@/lib/api-v2";

const OFF: Features = { classroom: false };

/**
 * Server side. Cached for 30 seconds so every page does not call the API, and cut off after 2 seconds so a
 * slow API cannot slow the site. If the API cannot be reached, everything optional is treated as off.
 */
export async function getFeatures(): Promise<Features> {
  try {
    const res = await fetch(`${serverApiBase()}/api/v2/features`, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return OFF;
    const body = (await res.json()) as Partial<Features>;
    return { classroom: body.classroom === true };
  } catch {
    return OFF;
  }
}
