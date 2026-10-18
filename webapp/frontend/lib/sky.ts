// Sky coordinates, distances to stars and star display colors.
import { KM_PER_AU } from "./units.ts";

/** Parsec in au: 648000 / pi (IAU 2015 Resolution B2). */
export const AU_PER_PARSEC = 648_000 / Math.PI;
/** Light year in km: c x 365.25 days (Julian year, IAU). */
export const KM_PER_LIGHT_YEAR = 299_792.458 * 86_400 * 365.25;

export function parsecsToLightYears(pc: number): number {
  return (pc * AU_PER_PARSEC * KM_PER_AU) / KM_PER_LIGHT_YEAR;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** Right ascension in degrees to "06h 28m 23.2s". */
export function formatRa(deg: number): string {
  const totalSec = Math.round(((((deg % 360) + 360) % 360) / 15) * 3600 * 10) / 10;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec - h * 3600) / 60);
  const s = totalSec - h * 3600 - m * 60;
  return `${pad(h)}h ${pad(m)}m ${s.toFixed(1).padStart(4, "0")}s`;
}

/** Declination in degrees to "-65° 34′ 46″" (hyphen-minus, never a dash). */
export function formatDec(deg: number): string {
  const sign = deg < 0 ? "-" : "+";
  const totalSec = Math.round(Math.abs(deg) * 3600);
  const d = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec - d * 3600) / 60);
  const s = totalSec - d * 3600 - m * 60;
  return `${sign}${pad(d)}° ${pad(m)}′ ${pad(s)}″`;
}

/**
 * A display color for a star of this temperature: cool stars orange-red, hot
 * stars blue-white. An approximation for drawing only, not a measured color.
 */
const COLOR_STOPS: [number, [number, number, number]][] = [
  [2500, [255, 140, 70]],
  [3500, [255, 178, 110]],
  [4500, [255, 210, 160]],
  [5800, [255, 244, 232]],
  [7500, [228, 236, 255]],
  [10000, [196, 212, 255]],
];

export function starDisplayColor(teffK: number): string {
  const t = Math.min(Math.max(teffK, COLOR_STOPS[0][0]), COLOR_STOPS[COLOR_STOPS.length - 1][0]);
  let i = 0;
  while (i < COLOR_STOPS.length - 2 && t > COLOR_STOPS[i + 1][0]) i++;
  const [t0, c0] = COLOR_STOPS[i];
  const [t1, c1] = COLOR_STOPS[i + 1];
  const f = (t - t0) / (t1 - t0);
  const c = c0.map((v, k) => Math.round(v + f * (c1[k] - v)));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
