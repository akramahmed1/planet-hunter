// Distance and light-time maths checked against JPL Horizons.
//
// The Phase 3 fixtures hold, for one date, heliocentric vectors (Sun-centred)
// and geocentric vectors with JPL's own range (RG) and one-way light time (LT)
// columns, all in km and seconds. Our Earth-to-body distance is the difference
// of the two heliocentric vectors, so it must match JPL's range.
//
// Tolerance: 1 part in 10^9. Both are geometric states in the same frame at the
// same instant, so the only difference is JPL's 16-digit printing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  addDays,
  clampDate,
  CMB_KELVIN,
  daysBetween,
  formatDuration,
  formatPeriodDays,
  neighbours,
  orbitGapKm,
  scalePoint,
  scaledRadius,
  separation,
  SCENE_BODIES,
  type Vec3,
} from "./solar.ts";
import { KM_PER_AU, formatTemp } from "./units.ts";

const FIXTURES = join(import.meta.dirname, "..", "..", "backend", "tests", "fixtures", "external");
const TOLERANCE = 1e-9;

type Row = { xyz: Vec3; lt: number; rg: number };

function horizonsRow(name: string): Row {
  const result: string = JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8")).result;
  const block = result.slice(result.indexOf("$$SOE") + 5, result.indexOf("$$EOE")).trim();
  const p = block.split("\n")[0].split(",").map((s) => s.trim());
  // JDTDB, date, X, Y, Z, VX, VY, VZ, LT, RG, RR
  return { xyz: [Number(p[2]), Number(p[3]), Number(p[4])], lt: Number(p[8]), rg: Number(p[9]) };
}

const toAu = (v: Vec3): Vec3 => [v[0] / KM_PER_AU, v[1] / KM_PER_AU, v[2] / KM_PER_AU];
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe("distances match JPL Horizons", () => {
  const earth = toAu(horizonsRow("horizons_earth_vectors_helio_p3").xyz);

  for (const body of ["venus", "mars", "jupiter", "neptune"]) {
    it(`Earth to ${body}: range and light time`, () => {
      const helio = toAu(horizonsRow(`horizons_${body}_vectors_helio_p3`).xyz);
      const jpl = horizonsRow(`horizons_${body}_vectors_geo_p3`);
      const ours = separation(earth, helio);
      assert.ok(rel(ours.km, jpl.rg) < TOLERANCE, `${ours.km} km vs JPL ${jpl.rg} km`);
      assert.ok(rel(ours.lightSeconds, jpl.lt) < TOLERANCE, `${ours.lightSeconds} s vs JPL ${jpl.lt} s`);
    });
  }

  it("Earth to Sun is the length of Earth's heliocentric vector", () => {
    const jpl = horizonsRow("horizons_sun_vectors_geo_p3");
    const ours = separation(earth, [0, 0, 0]);
    assert.ok(rel(ours.km, jpl.rg) < TOLERANCE);
    assert.ok(rel(ours.lightSeconds, jpl.lt) < TOLERANCE);
  });
});

describe("scene helpers", () => {
  it("neighbours run outward from Mercury and stop at the ends", () => {
    assert.deepEqual(neighbours("mercury"), { inner: null, outer: "venus" });
    assert.deepEqual(neighbours("earth"), { inner: "venus", outer: "mars" });
    assert.deepEqual(neighbours("pluto"), { inner: "neptune", outer: null });
    assert.deepEqual(neighbours("sun"), { inner: null, outer: null });
    assert.equal(SCENE_BODIES.length, 10);
  });

  it("orbit gap is the difference of average distances", () => {
    // NSSDCA semimajor axes, 10^6 km: Earth 149.598, Mars 227.956.
    assert.equal(Math.round(orbitGapKm(149.598e6, 227.956e6)), 78_358_000);
    assert.equal(orbitGapKm(1, 3), orbitGapKm(3, 1));
  });

  it("true scale is linear; easy view keeps order and direction", () => {
    assert.equal(scaledRadius(30, "true"), 30);
    const radii = [0.39, 0.72, 1, 1.52, 5.2, 9.5, 19.2, 30.1, 39.5].map((r) => scaledRadius(r, "easy"));
    assert.deepEqual([...radii].sort((a, b) => a - b), radii);
    const p: Vec3 = [3, 4, 0];
    const q = scalePoint(p, "easy");
    assert.ok(Math.abs(Math.hypot(...q) - scaledRadius(5, "easy")) < 1e-12);
    assert.ok(Math.abs(q[0] / q[1] - 0.75) < 1e-12);
    assert.deepEqual(scalePoint([0, 0, 0], "easy"), [0, 0, 0]);
  });

  it("durations read naturally", () => {
    assert.equal(formatDuration(24), "24.0 hours");
    assert.equal(formatDuration(9.9259), "9.93 hours");
    assert.equal(formatDuration(4222.6), "175.9 Earth days");
    assert.equal(formatPeriodDays(87.969), "88.0 Earth days");
    assert.equal(formatPeriodDays(60189.018), "164.8 Earth years");
  });

  it("date arithmetic stays in UTC", () => {
    assert.equal(daysBetween("1800-01-04", "1800-01-05"), 1);
    assert.equal(addDays("2026-10-17", 1), "2026-10-18");
    assert.equal(addDays("2024-02-28", 1), "2024-02-29");
    assert.equal(clampDate("1700-01-01", "1800-01-04", "2050-12-09"), "1800-01-04");
    assert.equal(clampDate("2026-10-17", "1800-01-04", "2050-12-09"), "2026-10-17");
  });
});

describe("deep space", () => {
  it("uses Fixsen 2009 and agrees with NASA's WMAP page", () => {
    const page = readFileSync(join(FIXTURES, "nasa_wmap_cmb_tests.html"), "utf8");
    assert.match(page, /temperature of 2\.7251° Kelvin/);
    assert.match(page, /temperature of 2\.7249° Kelvin/);
    assert.ok(Math.abs(CMB_KELVIN - 2.725) < 0.001);
    // The card's "about -455 °F (-270 °C)".
    assert.equal(formatTemp(CMB_KELVIN, "F"), "-455 °F");
    assert.equal(formatTemp(CMB_KELVIN, "C"), "-270 °C");
  });
});
