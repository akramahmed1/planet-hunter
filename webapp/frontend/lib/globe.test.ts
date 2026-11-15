import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { globeCaption, graticule, nightShape, project, subsolarPoint, toVector, wrapLon } from "./globe.ts";

const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

describe("globe maths", () => {
  it("puts the centre of the view in the middle of the disc and the far side out of sight", () => {
    const here = project(20, 40, { lat: 20, lon: 40 });
    near(here.x, 0, 1e-9, "x"); near(here.y, 0, 1e-9, "y"); assert.ok(here.visible);
    assert.equal(project(-20, -140, { lat: 20, lon: 40 }).visible, false); // the antipode
    const east = project(0, 90, { lat: 0, lon: 0 });
    near(east.x, 1, 1e-9, "east limb"); near(east.y, 0, 1e-9, "east limb y");
    const north = project(90, 0, { lat: 0, lon: 0 });
    near(north.y, 1, 1e-9, "north pole"); assert.ok(north.visible);
    assert.ok(project(10, 0, { lat: 0, lon: 0 }).y > 0 && project(-10, 0, { lat: 0, lon: 0 }).y < 0);
  });

  it("matches an independent reference (astropy) for the sun's position within 0.2 degrees", () => {
    // Reference values from astropy get_sun transformed to ITRS (the Earth-fixed frame), taken once and written here.
    const cases: [string, number, number][] = [
      ["2026-03-20T14:46:00Z", 0.0, -39.65], ["2026-06-21T08:24:00Z", 23.438, 54.446],
      ["2026-10-21T12:00:00Z", -10.801, -3.842], ["2026-12-21T20:50:00Z", -23.437, -132.938],
      ["2026-10-21T00:00:00Z", -10.623, 176.179], ["2027-01-15T06:30:00Z", -21.154, 84.811],
    ];
    for (const [iso, lat, lon] of cases) {
      const s = subsolarPoint(new Date(iso));
      near(s.lat, lat, 0.2, `${iso} latitude`);
      near(wrapLon(s.lon - lon), 0, 0.2, `${iso} longitude`);
    }
  });

  it("makes unit vectors with north up, longitude 0 along +z and east along +x", () => {
    assert.deepEqual(toVector(0, 0).map((v) => Math.round(v * 1e6) / 1e6), [0, 0, 1]);
    assert.deepEqual(toVector(90, 0).map((v) => Math.round(v * 1e6) / 1e6), [0, 1, 0]);
    assert.deepEqual(toVector(0, 90).map((v) => Math.round(v * 1e6) / 1e6), [1, 0, 0]);
    near(Math.hypot(...toVector(33, -77)), 1, 1e-12, "unit length");
  });

  it("draws a grid that stays on the near side of the globe", () => {
    const lines = graticule({ lat: 20, lon: 0 });
    assert.ok(lines.length >= 12);
    for (const line of lines) for (const p of line) assert.ok(Math.hypot(p.x, p.y) <= 1 + 1e-9);
  });

  it("describes the globe in words, and says so when the ISS position is missing", () => {
    assert.equal(globeCaption({ latitude: 34.76, longitude: -57.96, altitude_km: 421.4 }),
      "A stylised globe with a grid line every 30 degrees. The ISS is now over 34.8° N, 58.0° W, 421 km up.");
    assert.equal(globeCaption({ latitude: -3.04, longitude: 10, altitude_km: 420 }).includes("3.0° S, 10.0° E"), true);
    assert.equal(globeCaption(null), "A stylised globe with a grid line every 30 degrees. The ISS position is unavailable right now.");
    assert.ok(!/[–—]/.test(globeCaption(null)));
  });

  it("says the ISS is still being looked up before the first answer", () => {
    assert.equal(globeCaption(undefined), "A stylised globe with a grid line every 30 degrees. Looking up where the ISS is.");
  });

  it("shapes the night side so that it agrees with a direct light-and-normal check", () => {
    const area = (poly: { x: number; y: number }[]) => {
      let a = 0;
      for (let i = 0; i < poly.length; i++) {
        const q = poly[(i + 1) % poly.length];
        a += poly[i].x * q.y - q.x * poly[i].y;
      }
      return Math.abs(a) / 2;
    };
    const inside = (poly: { x: number; y: number }[], x: number, y: number) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
      }
      return c;
    };
    const view = { lat: 20, lon: 10 };
    assert.equal(nightShape(view, view), null); // sun straight at the viewer: all lit
    near(area(nightShape({ lat: 0, lon: 100 }, { lat: 0, lon: 10 })!), Math.PI / 2, 0.02, "half the disc is dark"); // sun at the limb
    assert.ok(area(nightShape({ lat: 0, lon: -170 }, { lat: 0, lon: 10 })!) > Math.PI * 0.99); // sun behind: almost all dark
    // Every point on the visible disc: dark exactly when its surface normal faces away from the sun.
    for (const sun of [{ lat: -10, lon: 150 }, { lat: 23, lon: -60 }, { lat: 5, lon: 40 }]) {
      const shape = nightShape(sun, view)!;
      const sv = toVector(sun.lat, sun.lon);
      let checked = 0;
      for (let lat = -80; lat <= 80; lat += 10) {
        for (let lon = -170; lon <= 170; lon += 10) {
          const p = project(lat, lon, view);
          if (!p.visible || Math.hypot(p.x, p.y) > 0.97) continue; // skip the very edge, where the outline and the limb coincide
          const v = toVector(lat, lon);
          const lit = v[0] * sv[0] + v[1] * sv[1] + v[2] * sv[2];
          if (Math.abs(lit) < 0.05) continue; // too close to the terminator for a polygon check
          assert.equal(inside(shape, p.x, p.y), lit < 0, `${lat},${lon} sun ${sun.lat},${sun.lon}`);
          checked++;
        }
      }
      assert.ok(checked > 100);
    }
  });
});
