// Solar system maths for /solar-system: distances, light time, orbit gaps and
// the two drawing scales. Pure functions, unit-tested against JPL Horizons.
//
// Inputs are the API's heliocentric positions (ecliptic of J2000, au).
import { KM_PER_AU, lightTimeSeconds } from "./units.ts";

export type Vec3 = readonly [number, number, number];

export type SceneBodyId =
  | "sun"
  | "mercury"
  | "venus"
  | "earth"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune"
  | "pluto";

/** Sun outward. The Moon is left out of the scene: it would sit on top of Earth at any useful zoom. */
export const SCENE_BODIES: readonly SceneBodyId[] = [
  "sun",
  "mercury",
  "venus",
  "earth",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];

export const BODY_NAMES: Record<SceneBodyId, string> = {
  sun: "Sun",
  mercury: "Mercury",
  venus: "Venus",
  earth: "Earth",
  mars: "Mars",
  jupiter: "Jupiter",
  saturn: "Saturn",
  uranus: "Uranus",
  neptune: "Neptune",
  pluto: "Pluto",
};

/** Marker colours, chosen for contrast on the dark background (not true colour). */
export const BODY_COLORS: Record<SceneBodyId, string> = {
  sun: "#ffc56b",
  mercury: "#b9b4ad",
  venus: "#e8cf8f",
  earth: "#6fb6ff",
  mars: "#ff7a59",
  jupiter: "#e0b38a",
  saturn: "#f1d79a",
  uranus: "#8fe3e8",
  neptune: "#6f8bff",
  pluto: "#d9c2b0",
};

export function isSceneBody(id: string): id is SceneBodyId {
  return (SCENE_BODIES as readonly string[]).includes(id);
}

export function distanceAu(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function distanceKm(a: Vec3, b: Vec3): number {
  return distanceAu(a, b) * KM_PER_AU;
}

/** Straight-line distance between two positions, with one-way light travel time. */
export function separation(a: Vec3, b: Vec3): { km: number; au: number; lightSeconds: number } {
  const au = distanceAu(a, b);
  const km = au * KM_PER_AU;
  return { km, au, lightSeconds: lightTimeSeconds(km) };
}

/** The bodies on either side of this one, in order from the Sun (planets and Pluto only). */
export function neighbours(id: SceneBodyId): { inner: SceneBodyId | null; outer: SceneBodyId | null } {
  if (id === "sun") return { inner: null, outer: null };
  const i = SCENE_BODIES.indexOf(id);
  return {
    inner: i > 1 ? SCENE_BODIES[i - 1] : null,
    outer: i < SCENE_BODIES.length - 1 ? SCENE_BODIES[i + 1] : null,
  };
}

/** Gap between two average orbital distances (semimajor axes), in km. */
export function orbitGapKm(aKm: number, bKm: number): number {
  return Math.abs(aKm - bKm);
}

export type Scale = "true" | "easy";

/**
 * Distance from the Sun as drawn, in scene units (1 unit = 1 au at true scale).
 *  true: linear, so the emptiness is real.
 *  easy: square root, so the outer planets fit on a phone. Order is kept, spacing is not.
 */
export function scaledRadius(rAu: number, scale: Scale): number {
  if (scale === "true") return rAu;
  return 5 * Math.sqrt(rAu);
}

/** A position moved along its own direction from the Sun to its drawn radius. */
export function scalePoint(p: Vec3, scale: Scale): Vec3 {
  if (scale === "true") return p;
  const r = Math.hypot(p[0], p[1], p[2]);
  if (r === 0) return p;
  const k = scaledRadius(r, scale) / r;
  return [p[0] * k, p[1] * k, p[2] * k];
}

/** Hours to a short label: "24 hours", "9.9 hours", "175.9 Earth days". */
export function formatDuration(hours: number): string {
  if (hours < 72) return `${round(hours, hours < 10 ? 2 : 1)} hours`;
  const days = hours / 24;
  if (days < 1000) return `${round(days, 1)} Earth days`;
  return `${round(days / 365.25, 1)} Earth years`;
}

/** Days to a short label: "88.0 Earth days", "11.9 Earth years". */
export function formatPeriodDays(days: number): string {
  if (days < 1000) return `${round(days, 1)} Earth days`;
  return `${round(days / 365.25, 1)} Earth years`;
}

function round(v: number, digits: number): string {
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Whole days between two ISO dates (UTC). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The ISO date `days` after `from` (UTC). */
export function addDays(from: string, days: number): string {
  return new Date(Date.parse(`${from}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function clampDate(d: string, lo: string, hi: string): string {
  return d < lo ? lo : d > hi ? hi : d;
}

/**
 * Deep space: the cosmic microwave background temperature, Fixsen (2009),
 * 2.72548 ± 0.00057 K. Shown rounded as "about 2.7 K".
 */
export const CMB_KELVIN = 2.72548;
export const CMB_SOURCE = {
  name: "Fixsen (2009), The Temperature of the Cosmic Microwave Background, ApJ 707, 916",
  url: "https://arxiv.org/abs/0911.1955",
};
