import type { HabitableZone, SystemPlanet, TargetSystem } from "@/lib/api-v2";
import { displayAngle, orbitPoints, orbitRadius, viewExtent, type Point, type ViewFit } from "@/lib/system";

export type DrawnPlanet = {
  index: number;
  planet: SystemPlanet;
  a: number;
  e: number;
  orbit: Point[];
  at: Point;
  signal: boolean;
};

export type SystemModel = {
  extent: number;
  planets: DrawnPlanet[];
  zone: HabitableZone | null;
  starRadius: number;
};

export function buildSystemModel(system: TargetSystem, fit: ViewFit): SystemModel {
  const planets: DrawnPlanet[] = [];
  system.planets.forEach((p, index) => {
    const a = p.orbit_au?.value;
    if (!a) return;
    const e = p.eccentricity ?? 0;
    const theta = displayAngle(index);
    const r = orbitRadius(a, e, theta);
    planets.push({
      index,
      planet: p,
      a,
      e,
      orbit: orbitPoints(a, e),
      at: [r * Math.cos(theta), r * Math.sin(theta)],
      signal: p.status === "pipeline_signal",
    });
  });
  const extent = viewExtent(planets, system.habitable_zone?.optimistic_outer_au ?? null, fit);
  return { extent, planets, zone: system.habitable_zone ?? null, starRadius: extent * 0.04 };
}

/** Whether a planet's average distance (semimajor axis) lies inside the conservative zone. */
export function inConservativeZone(p: { a: number }, zone: HabitableZone | null): boolean | null {
  if (!zone) return null;
  return p.a >= zone.conservative_inner_au && p.a <= zone.conservative_outer_au;
}
