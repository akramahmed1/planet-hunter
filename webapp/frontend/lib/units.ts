// Unit conversions for temperature, distance and light travel time.
//
// The API serves temperatures in kelvin and distances in km. The UI converts
// to the viewer's chosen unit (default miles and °F).

/** 1 au in km. IAU 2012 definition, as printed in JPL Horizons output (docs/DATA_SOURCES.md). */
export const KM_PER_AU = 149_597_870.7;
/** Speed of light in km/s, as printed in JPL Horizons output. */
export const C_KM_PER_S = 299_792.458;
/** International mile in km (exact by definition). */
export const KM_PER_MILE = 1.609344;

export type TempUnit = "F" | "C" | "K";
export type DistanceUnit = "mi" | "km" | "au";

export const TEMP_UNITS: readonly TempUnit[] = ["F", "C", "K"];
export const DISTANCE_UNITS: readonly DistanceUnit[] = ["mi", "km", "au"];

export const TEMP_LABELS: Record<TempUnit, string> = { F: "°F", C: "°C", K: "K" };
export const DISTANCE_LABELS: Record<DistanceUnit, string> = { mi: "mi", km: "km", au: "AU" };

export function kelvinTo(kelvin: number, unit: TempUnit): number {
  switch (unit) {
    case "K":
      return kelvin;
    case "C":
      return kelvin - 273.15;
    case "F":
      return ((kelvin - 273.15) * 9) / 5 + 32;
  }
}

export function toKelvin(value: number, unit: TempUnit): number {
  switch (unit) {
    case "K":
      return value;
    case "C":
      return value + 273.15;
    case "F":
      return ((value - 32) * 5) / 9 + 273.15;
  }
}

export function convertTemp(value: number, from: TempUnit, to: TempUnit): number {
  return kelvinTo(toKelvin(value, from), to);
}

export function kmTo(km: number, unit: DistanceUnit): number {
  switch (unit) {
    case "km":
      return km;
    case "mi":
      return km / KM_PER_MILE;
    case "au":
      return km / KM_PER_AU;
  }
}

export function toKm(value: number, unit: DistanceUnit): number {
  switch (unit) {
    case "km":
      return value;
    case "mi":
      return value * KM_PER_MILE;
    case "au":
      return value * KM_PER_AU;
  }
}

export function convertDistance(value: number, from: DistanceUnit, to: DistanceUnit): number {
  return kmTo(toKm(value, from), to);
}

/** One-way light travel time in seconds over a distance in km. */
export function lightTimeSeconds(km: number): number {
  return km / C_KM_PER_S;
}

/** "499 s", "8 min 19 s", "23 h 55 min", "4.2 days". Whole units only; no rounding up past the next unit. */
export function formatLightTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "unknown";
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(2) : Math.round(seconds)} s`;
  const totalMin = Math.floor(seconds / 60);
  if (totalMin < 60) return `${totalMin} min ${Math.floor(seconds - totalMin * 60)} s`;
  const hours = Math.floor(totalMin / 60);
  if (hours < 72) return `${hours} h ${totalMin - hours * 60} min`;
  return `${(seconds / 86_400).toFixed(1)} days`;
}

/** Temperature from kelvin, formatted in the given unit, e.g. "-454.8 °F". */
export function formatTemp(kelvin: number, unit: TempUnit, digits = 0): string {
  const v = kelvinTo(kelvin, unit);
  return `${formatNumber(v, digits)} ${TEMP_LABELS[unit]}`;
}

/**
 * Distance from km, formatted in the given unit. Large values use words
 * ("93.0 million mi") so they stay readable on a phone.
 */
export function formatDistance(km: number, unit: DistanceUnit): string {
  const v = kmTo(km, unit);
  const label = DISTANCE_LABELS[unit];
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${formatNumber(v / 1e9, 2)} billion ${label}`;
  if (abs >= 1e6) return `${formatNumber(v / 1e6, 1)} million ${label}`;
  if (unit === "au") return `${formatNumber(v, abs < 10 ? 3 : 2)} ${label}`;
  return `${formatNumber(v, 0)} ${label}`;
}

function formatNumber(v: number, digits: number): string {
  // Plain hyphen-minus, never a typographic dash (site copy rule).
  return v.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
