// Drawing helpers for a planetary system seen from above, star at the origin.
//
// Orbit sizes and shapes are to scale (semimajor axis a, eccentricity e). The
// orientation of each orbit and where each planet is along it are not known
// from these catalogs, so orbits are drawn with their closest point to the
// right and planets are spread out so each can be tapped. The page says so.

export type Point = readonly [number, number];

/** Distance from the star at true anomaly theta (radians) on an ellipse with the star at a focus. */
export function orbitRadius(a: number, e: number, theta: number): number {
  return (a * (1 - e * e)) / (1 + e * Math.cos(theta));
}

export function orbitPoints(a: number, e: number, n = 120): Point[] {
  return Array.from({ length: n }, (_, k) => {
    const t = (2 * Math.PI * k) / n;
    const r = orbitRadius(a, e, t);
    return [r * Math.cos(t), r * Math.sin(t)] as const;
  });
}

/** Spread planets around their orbits with the golden angle so neighbours do not overlap. */
export function displayAngle(index: number): number {
  return (index * 2.399963229728653) % (2 * Math.PI);
}

export type ViewFit = "planets" | "zone";

/** Half-width of the view in au: fits the outermost orbit, or the habitable zone too. */
export function viewExtent(orbits: { a: number; e: number }[], zoneOuterAu: number | null, fit: ViewFit): number {
  const far = Math.max(0, ...orbits.map((o) => o.a * (1 + o.e)));
  const zone = fit === "zone" && zoneOuterAu ? zoneOuterAu : 0;
  return Math.max(far, zone, 1e-3) * 1.15;
}
