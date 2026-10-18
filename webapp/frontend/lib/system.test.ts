import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayAngle, orbitPoints, orbitRadius, viewExtent } from "./system.ts";

describe("system drawing", () => {
  it("puts the star at a focus: closest a(1-e), farthest a(1+e)", () => {
    assert.ok(Math.abs(orbitRadius(1, 0.2, 0) - 0.8) < 1e-12);
    assert.ok(Math.abs(orbitRadius(1, 0.2, Math.PI) - 1.2) < 1e-12);
    // Sum of distances to both foci (star at 0, other focus at -2ae) is 2a everywhere.
    for (const [x, y] of orbitPoints(0.1642, 0.042, 36)) {
      const d = Math.hypot(x, y) + Math.hypot(x + 2 * 0.1642 * 0.042, y);
      assert.ok(Math.abs(d - 2 * 0.1642) < 1e-12);
    }
  });

  it("circles stay circles", () => {
    for (const [x, y] of orbitPoints(0.5, 0, 12)) assert.ok(Math.abs(Math.hypot(x, y) - 0.5) < 1e-12);
  });

  it("fits the outermost orbit, or the zone when asked", () => {
    const orbits = [{ a: 0.0155, e: 0 }];
    assert.ok(Math.abs(viewExtent(orbits, 1.2, "planets") - 0.0155 * 1.15) < 1e-12);
    assert.ok(Math.abs(viewExtent(orbits, 1.2, "zone") - 1.2 * 1.15) < 1e-12);
    assert.ok(displayAngle(0) === 0 && displayAngle(1) > 0);
  });
});
