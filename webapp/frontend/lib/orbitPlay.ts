// Orbit play on /solar-system (launch task T31). While a play is running, each planet moves along its own drawn orbit
// path by elapsed time. The path from /api/v2/orbits is sampled evenly in time over one period, so the position after
// `days` days is the point `days / period` of the way round. Nothing here asks the server; when play stops, the exact
// positions for the stopped date load as usual and replace these.
import type { Vec3 } from "./solar.ts";

export type PlayOrbit = { id: string; period_days: number; points: readonly (readonly number[])[] };

/** Speeds offered. The top one stays slow enough that Mercury (88 days) is not a blur: about a third of a lap a second. */
export const PLAY_SPEEDS = [
  { id: "day", label: "1 day a second", short: "1 day", days: 1 },
  { id: "week", label: "1 week a second", short: "1 week", days: 7 },
  { id: "month", label: "1 month a second", short: "1 month", days: 30.4375 },
] as const;
export type PlaySpeedId = (typeof PLAY_SPEEDS)[number]["id"];

const sub = (a: readonly number[], b: readonly number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * How far round the closed path a position is, as a sample index with a fraction (0 up to the number of samples):
 * the nearest point on any segment between neighbouring samples.
 */
export function phaseOnPath(points: readonly (readonly number[])[], p: readonly number[]): number {
  const n = points.length;
  let best = Infinity;
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const ab = sub(b, a);
    const len2 = dot(ab, ab);
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2)); // repeated points: stay on the first
    const d = Math.hypot(a[0] + t * ab[0] - p[0], a[1] + t * ab[1] - p[1], a[2] + t * ab[2] - p[2]);
    if (d < best) {
      best = d;
      phase = i + t;
    }
  }
  return phase;
}

/** The point at a (fractional, wrapping) sample index of a closed path. */
export function pointAtPhase(points: readonly (readonly number[])[], phase: number): Vec3 {
  const n = points.length;
  const ph = ((phase % n) + n) % n;
  const i = Math.floor(ph);
  const t = ph - i;
  const a = points[i];
  const b = points[(i + 1) % n];
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
}

export type PlayStart = { id: string; points: readonly (readonly number[])[]; period_days: number; phase: number }[];

/** Where each planet is on its path at the moment play starts, from the server's positions for that date. */
export function startPlay(
  orbits: readonly PlayOrbit[],
  positions: Record<string, readonly number[]>,
): PlayStart {
  return orbits
    .filter((o) => positions[o.id])
    .map((o) => ({ id: o.id, points: o.points, period_days: o.period_days, phase: phaseOnPath(o.points, positions[o.id]) }));
}

/** Positions of the planets `days` days after play started. */
export function positionsAfter(start: PlayStart, days: number): { id: string; p: Vec3 }[] {
  return start.map((s) => ({ id: s.id, p: pointAtPhase(s.points, s.phase + (s.points.length * days) / s.period_days) }));
}
