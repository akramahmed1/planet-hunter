import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EARTH_RADIUS_KM, lapMinutes, pushTrail, speedValue, splitAtDateLine, sunlightText } from "./iss.ts";

describe("ISS board", () => {
  it("one lap from the live numbers comes out near the station's real 92 to 93 minutes", () => {
    // A typical reading: about 420 km up at about 27,600 km/h.
    const m = lapMinutes(420, 27_600)!;
    assert.ok(m > 91 && m < 94, `got ${m}`);
    assert.equal(lapMinutes(0, 100), null);
    assert.equal(lapMinutes(400, 0), null);
    assert.equal(lapMinutes(400, NaN), null);
    // Geometry check: a path of radius R + h at speed v takes 2 pi (R + h) / v hours.
    assert.ok(Math.abs(lapMinutes(1000, 2 * Math.PI * (EARTH_RADIUS_KM + 1000))! - 60) < 1e-9);
  });

  it("splits a track where it crosses the date line", () => {
    const parts = splitAtDateLine([[0, 170], [1, 179], [2, -179], [3, -170]]);
    assert.equal(parts.length, 2);
    assert.deepEqual(parts[0], [[0, 170], [1, 179]]);
    assert.deepEqual(parts[1], [[2, -179], [3, -170]]);
    assert.equal(splitAtDateLine([[0, 1], [0, 2]]).length, 1);
    assert.deepEqual(splitAtDateLine([]), [[]]);
  });

  it("the trail ignores repeats and keeps only the newest points", () => {
    let t: [number, number][] = [];
    t = pushTrail(t, [1, 1]);
    t = pushTrail(t, [1, 1]);
    assert.equal(t.length, 1);
    for (let i = 2; i < 10; i++) t = pushTrail(t, [i, i], 5);
    assert.equal(t.length, 5);
    assert.deepEqual(t[0], [5, 5]);
    assert.deepEqual(t.at(-1), [9, 9]);
  });

  it("says sunlight in plain words and never hides an unknown word", () => {
    assert.equal(sunlightText("daylight"), "In sunlight");
    assert.equal(sunlightText("eclipsed"), "In Earth's shadow");
    assert.match(sunlightText("visible"), /twilight/);
    assert.equal(sunlightText(" Penumbra "), "penumbra");
    assert.equal(sunlightText(""), "not reported");
    assert.ok(![sunlightText("daylight"), sunlightText("eclipsed"), sunlightText("visible")].some((s) => /[–—]/.test(s)));
  });

  it("shows speed in kilometres an hour or miles an hour", () => {
    assert.deepEqual(speedValue(27_600, "km"), { value: 27_600, unit: "km/h" });
    assert.deepEqual(speedValue(27_600, "mi"), { value: Math.round(27_600 / 1.609344), unit: "mph" });
  });
});
