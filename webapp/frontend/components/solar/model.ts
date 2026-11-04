// What the 3D scene and the 2D map both draw: scaled positions, orbits and the
// visible extent. Kept free of React and three.js so both views share it.
import type { OrbitsResponse, PositionsResponse } from "@/lib/api-v2";
import { isSceneBody, scalePoint, scaledRadius, type Scale, type SceneBodyId, type Vec3 } from "@/lib/solar";

export type Zoom = "all" | "inner";
export type Mode = "explore" | "measure" | "tour";

export type SceneModel = {
  scale: Scale;
  extent: number;
  bodies: { id: SceneBodyId; p: Vec3 }[];
  orbits: { id: SceneBodyId; points: Vec3[] }[];
};

/** Inner planets view: a little past Mars's farthest point from the Sun (1.67 au). */
const INNER_AU = 1.8;

export function buildModel(
  positions: PositionsResponse,
  orbits: OrbitsResponse,
  scale: Scale,
  zoom: Zoom,
): SceneModel {
  const bodies = positions.bodies
    .filter((b) => isSceneBody(b.id))
    .map((b) => ({ id: b.id as SceneBodyId, p: scalePoint([b.x_au, b.y_au, b.z_au], scale) }));
  const orbitPaths = orbits.orbits
    .filter((o) => isSceneBody(o.id))
    .map((o) => ({
      id: o.id as SceneBodyId,
      points: o.points.map((p) => scalePoint([p[0], p[1], p[2]], scale)),
    }));
  let extent: number;
  if (zoom === "inner") {
    extent = scaledRadius(INNER_AU, scale);
  } else {
    // Fit every orbit, so the view does not jump when the date changes.
    extent = Math.max(...orbitPaths.flatMap((o) => o.points.map((p) => Math.hypot(p[0], p[1]))), 1);
    extent *= 1.04;
  }
  return { scale, extent, bodies, orbits: orbitPaths };
}

/** Marker radius in scene units: a fixed share of the view, since true sizes would be invisible. */
export function markerRadius(id: SceneBodyId, extent: number): number {
  const share = id === "sun" ? 0.035 : id === "jupiter" || id === "saturn" ? 0.022 : 0.016;
  return extent * share;
}
