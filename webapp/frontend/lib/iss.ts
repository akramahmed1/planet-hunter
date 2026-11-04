// The ISS board and ground track on /missions (launch task T37). Pure helpers, so they can be tested.
import { KM_PER_MILE } from "./units.ts";

/** Mean Earth radius in km (IAU nominal volumetric radius is 6371.0 km). */
export const EARTH_RADIUS_KM = 6371;

/** Split a track where it crosses the 180° meridian, so the line does not jump across the map. */
export function splitAtDateLine(points: [number, number][]): [number, number][][] {
  const parts: [number, number][][] = [[]];
  points.forEach((p, i) => {
    if (i > 0 && Math.abs(p[1] - points[i - 1][1]) > 180) parts.push([]);
    parts[parts.length - 1].push(p);
  });
  return parts;
}

/**
 * Minutes for one lap of the Earth, worked out from height and speed (circumference of the path over the speed). The
 * station's own published period is about 92 to 93 minutes; this is the same figure from the live numbers.
 */
export function lapMinutes(altitudeKm: number, speedKmh: number): number | null {
  if (!(speedKmh > 0) || !(altitudeKm > 0)) return null;
  return (2 * Math.PI * (EARTH_RADIUS_KM + altitudeKm)) / speedKmh * 60;
}

/** The trail behind the station: add a position, ignore a repeat, keep only the newest `max`. */
export function pushTrail(trail: [number, number][], point: [number, number], max = 180): [number, number][] {
  const last = trail[trail.length - 1];
  if (last && last[0] === point[0] && last[1] === point[1]) return trail;
  const next = [...trail, point];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** wheretheiss.at's "visibility" word in plain language. Unknown words are shown as they come, in lower case. */
export function sunlightText(visibility: string): string {
  switch (visibility.trim().toLowerCase()) {
    case "daylight": return "In sunlight";
    case "eclipsed": return "In Earth's shadow";
    case "visible": return "In twilight, so it can be seen from the ground";
    default: return visibility.trim().toLowerCase() || "not reported";
  }
}

/** Speed in the viewer's unit. */
export function speedValue(kmh: number, unit: "km" | "mi"): { value: number; unit: string } {
  return unit === "km" ? { value: Math.round(kmh), unit: "km/h" } : { value: Math.round(kmh / KM_PER_MILE), unit: "mph" };
}
