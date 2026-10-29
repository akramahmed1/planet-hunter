import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  C_KM_PER_S,
  KM_PER_AU,
  convertDistance,
  convertTemp,
  formatDistance,
  formatLightTime,
  formatTemp,
  kelvinTo,
  kmTo,
  lightTimeSeconds,
  toKelvin,
  toKm,
  type DistanceUnit,
  type TempUnit,
} from "./units.ts";

const FIXTURES = join(import.meta.dirname, "..", "..", "backend", "tests", "fixtures", "external");

/** Same rule as Jest/Vitest toBeCloseTo: |a - b| < 10^-digits / 2. */
function close(actual: number, expected: number, digits = 2) {
  const tol = 10 ** -digits / 2;
  assert.ok(Math.abs(actual - expected) < tol, `${actual} is not within ${tol} of ${expected}`);
}

describe("temperature", () => {
  it("matches the defining fixed points", () => {
    assert.equal(kelvinTo(273.15, "C"), 0);
    close(kelvinTo(273.15, "F"), 32, 10);
    close(kelvinTo(373.15, "F"), 212, 10);
    close(kelvinTo(0, "F"), -459.67, 10);
    close(convertTemp(-40, "C", "F"), -40, 10);
  });

  it("round-trips every unit pair", () => {
    const units: TempUnit[] = ["F", "C", "K"];
    for (const from of units)
      for (const to of units)
        close(convertTemp(convertTemp(123.456, from, to), to, from), 123.456, 9);
    close(toKelvin(kelvinTo(5772, "F"), "F"), 5772, 9);
  });

  it("formats with a plain minus sign and the unit label", () => {
    assert.equal(formatTemp(2.725, "F", 1), "-454.8 °F");
    assert.equal(formatTemp(2.725, "C", 1), "-270.4 °C");
    assert.equal(formatTemp(2.725, "K", 1), "2.7 K");
    assert.equal(formatTemp(5772, "F"), "9,930 °F");
  });
});

describe("distance", () => {
  it("uses the defined au and mile", () => {
    assert.equal(kmTo(KM_PER_AU, "au"), 1);
    close(kmTo(1.609344, "mi"), 1, 12);
    close(kmTo(KM_PER_AU, "mi"), 92_955_807.27, 2);
  });

  it("round-trips every unit pair", () => {
    const units: DistanceUnit[] = ["mi", "km", "au"];
    for (const from of units)
      for (const to of units)
        close(convertDistance(convertDistance(42.5, from, to), to, from), 42.5, 9);
    assert.equal(toKm(1, "au"), KM_PER_AU);
  });

  it("formats large values in words", () => {
    assert.equal(formatDistance(KM_PER_AU, "mi"), "93.0 million mi");
    assert.equal(formatDistance(KM_PER_AU, "km"), "149.6 million km");
    assert.equal(formatDistance(KM_PER_AU, "au"), "1.000 AU");
    assert.equal(formatDistance(6_371, "mi"), "3,959 mi");
    assert.equal(formatDistance(4.5e9, "km"), "4.50 billion km");
  });
});

describe("light time", () => {
  it("is about 499 s for 1 au", () => {
    close(lightTimeSeconds(KM_PER_AU), 499.004784, 5);
    assert.equal(formatLightTime(lightTimeSeconds(KM_PER_AU)), "8 min 19 s");
  });

  it("formats each range", () => {
    assert.equal(formatLightTime(1.282), "1.28 s");
    assert.equal(formatLightTime(45), "45 s");
    assert.equal(formatLightTime(23 * 3600 + 55 * 60 + 9), "23 h 55 min");
    assert.equal(formatLightTime(4.2 * 86_400), "4.2 days");
    assert.equal(formatLightTime(-1), "unknown");
  });

  it("matches JPL Horizons light time for Mars (fixture from Phase 0)", () => {
    // VECTORS output gives RG (range, au) and LT (one-way light time, days) per row.
    const body = JSON.parse(
      readFileSync(join(FIXTURES, "horizons_mars_vectors_helio.json"), "utf8"),
    ) as { result: string };
    const rows = [...body.result.matchAll(/LT=\s*([\d.E+-]+)\s+RG=\s*([\d.E+-]+)/g)];
    assert.ok(rows.length > 0);
    for (const [, lt, rg] of rows) {
      const ours = lightTimeSeconds(toKm(Number(rg), "au"));
      const jpl = Number(lt) * 86_400;
      assert.ok(Math.abs(ours - jpl) / jpl < 1e-9, `light time ${ours} s vs JPL ${jpl} s`);
    }
    assert.equal(C_KM_PER_S, 299_792.458);
  });
});
