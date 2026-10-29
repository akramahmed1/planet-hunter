// The stylised globe on the home page (launch task T30). Pure maths, so it can be unit tested and shared by the still
// SVG globe (first paint, and the fallback) and the 3D one. Nothing here invents data: positions come from the ISS API
// and the sun's position is computed from the clock.

export type View = { lat: number; lon: number };

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Longitude folded into -180..180. */
export const wrapLon = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180;

/**
 * Orthographic projection of a place on the Earth onto the disc seen from `view`.
 * x is to the right and y up, both in -1..1 (the disc has radius 1); `visible` is false on the far side.
 */
export function project(lat: number, lon: number, view: View): { x: number; y: number; visible: boolean } {
  const φ = lat * RAD, φ0 = view.lat * RAD, dλ = (lon - view.lon) * RAD;
  const cosC = Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * Math.cos(φ) * Math.cos(dλ);
  return {
    x: Math.cos(φ) * Math.sin(dλ),
    y: Math.cos(φ0) * Math.sin(φ) - Math.sin(φ0) * Math.cos(φ) * Math.cos(dλ),
    visible: cosC >= 0,
  };
}

/** Where the sun is straight overhead (declination and longitude, degrees). Accurate to about 0.1 degree. */
export function subsolarPoint(date: Date): { lat: number; lon: number } {
  const jd = date.getTime() / 86_400_000 + 2_440_587.5;
  const n = jd - 2_451_545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) * DEG;
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  return { lat: dec * DEG, lon: wrapLon(ra - gmst) };
}

/** A unit vector in the globe's own frame: y is north, longitude 0 points along +z, east along +x. */
export function toVector(lat: number, lon: number): [number, number, number] {
  const φ = lat * RAD, λ = lon * RAD;
  return [Math.cos(φ) * Math.sin(λ), Math.sin(φ), Math.cos(φ) * Math.cos(λ)];
}

/** Grid lines every `step` degrees as lists of points, split wherever a line goes round the back of the globe. */
export function graticule(view: View, step = 30, sample = 5): { x: number; y: number }[][] {
  const lines: { x: number; y: number }[][] = [];
  const walk = (points: [number, number][]) => {
    let run: { x: number; y: number }[] = [];
    for (const [lat, lon] of points) {
      const p = project(lat, lon, view);
      if (p.visible) run.push({ x: p.x, y: p.y });
      else if (run.length) { lines.push(run); run = []; }
    }
    if (run.length) lines.push(run);
  };
  for (let lon = -180; lon < 180; lon += step) {
    const pts: [number, number][] = [];
    for (let lat = -90; lat <= 90; lat += sample) pts.push([lat, lon]);
    walk(pts);
  }
  for (let lat = -90 + step; lat < 90; lat += step) {
    const pts: [number, number][] = [];
    for (let lon = -180; lon <= 180; lon += sample) pts.push([lat, lon]);
    walk(pts);
  }
  return lines;
}

/** The sentence that describes the globe for people who cannot see it. Says plainly when there is no position. */
export function globeCaption(iss: { latitude: number; longitude: number; altitude_km: number } | null | undefined): string {
  const base = "A stylised globe with a grid line every 30 degrees";
  if (iss === undefined) return `${base}. Looking up where the ISS is.`;
  if (!iss) return `${base}. The ISS position is unavailable right now.`;
  const ns = iss.latitude >= 0 ? "N" : "S", ew = iss.longitude >= 0 ? "E" : "W";
  return `${base}. The ISS is now over ${Math.abs(iss.latitude).toFixed(1)}° ${ns}, ${Math.abs(iss.longitude).toFixed(1)}° ${ew}, ${Math.round(iss.altitude_km)} km up.`;
}

/**
 * The night side of the globe as seen from `view`: a closed outline in the same -1..1 disc coordinates as `project`
 * (y up), or null when the whole visible disc is lit. The night region is bounded by half of the limb and half of the
 * terminator, which seen from outside is an ellipse as wide as the disc and `|sz|` tall, where sz says how directly
 * the sun faces the viewer.
 */
export function nightShape(sun: View, view: View, steps = 48): { x: number; y: number }[] | null {
  const p = project(sun.lat, sun.lon, view);
  const flat = Math.hypot(p.x, p.y);
  const sz = (p.visible ? 1 : -1) * Math.sqrt(Math.max(0, 1 - flat * flat));
  if (sz > 0.9999) return null;
  // Unit vectors on screen: dir points toward the sun's side, perp is across it. With the sun dead centre, any pair will do.
  const dir = flat > 1e-9 ? { x: p.x / flat, y: p.y / flat } : { x: 0, y: 1 };
  const perp = { x: -dir.y, y: dir.x };
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI;
    pts.push({ x: perp.x * Math.cos(t) - dir.x * Math.sin(t), y: perp.y * Math.cos(t) - dir.y * Math.sin(t) });
  }
  for (let i = steps; i >= 0; i--) {
    const t = (i / steps) * Math.PI;
    pts.push({ x: perp.x * Math.cos(t) - dir.x * sz * Math.sin(t), y: perp.y * Math.cos(t) - dir.y * sz * Math.sin(t) });
  }
  return pts;
}
