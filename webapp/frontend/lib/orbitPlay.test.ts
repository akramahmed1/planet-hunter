import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { phaseOnPath, PLAY_SPEEDS, pointAtPhase, positionsAfter, startPlay, type PlayOrbit } from "./orbitPlay.ts";

// Made by running the backend (see the note inside the file): the /api/v2/orbits paths, and the server's own computed
// positions for a start date and for later dates. Play must land close to the server's answer for the later date.
const FIX = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "backend", "tests", "fixtures", "orbit_play.json"), "utf8")) as {
  start: string;
  offsets_days: number[];
  orbits: Record<string, { period_days: number; points: number[][] }>;
  positions: Record<string, Record<string, number[]>>;
};

const circle = (n: number): number[][] => Array.from({ length: n }, (_, k) => [Math.cos((2 * Math.PI * k) / n), Math.sin((2 * Math.PI * k) / n), 0]);
const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

describe("orbit play", () => {
  it("finds how far round a path a position is, and wraps", () => {
    const pts = circle(180);
    near(phaseOnPath(pts, pts[0]), 0, 1e-9, "start");
    near(phaseOnPath(pts, pts[45]), 45, 1e-9, "quarter");
    near(phaseOnPath(pts, [Math.cos(0.5 * Math.PI / 180), Math.sin(0.5 * Math.PI / 180), 0]), 0.25, 0.02, "between samples");
    const p = pointAtPhase(pts, 180 + 45);
    near(p[0], pts[45][0], 1e-9, "wraps x");
    near(p[1], pts[45][1], 1e-9, "wraps y");
    const half = pointAtPhase(pts, 0.5);
    near(Math.atan2(half[1], half[0]) * 180 / Math.PI, 1, 0.01, "half a step is 1 degree on a 180 sample circle");
  });

  it("does not trip over repeated points on a path", () => {
    const pts = [[1, 0, 0], [1, 0, 0], [0, 1, 0], [-1, 0, 0]];
    assert.ok(Number.isFinite(phaseOnPath(pts, [0.9, 0.1, 0])));
  });

  it("moves a body a quarter of the way round in a quarter of its period", () => {
    const orbit: PlayOrbit = { id: "x", period_days: 400, points: circle(180) };
    const start = startPlay([orbit], { x: [Math.cos(0.6), Math.sin(0.6), 0] });
    const [{ p }] = positionsAfter(start, 100);
    near(Math.atan2(p[1], p[0]), 0.6 + Math.PI / 2, 0.01, "angle");
    const [{ p: whole }] = positionsAfter(start, 400);
    near(whole[0], Math.cos(0.6), 0.01, "a full period brings it back x");
  });

  it("skips orbits with no starting position and keeps the others", () => {
    const start = startPlay(
      [{ id: "a", period_days: 10, points: circle(8) }, { id: "b", period_days: 10, points: circle(8) }],
      { a: [1, 0, 0] },
    );
    assert.deepEqual(start.map((s) => s.id), ["a"]);
  });

  it("agrees with the server's own positions for later dates, to within a tenth of a percent of the orbit size", () => {
    const orbits: PlayOrbit[] = Object.entries(FIX.orbits).map(([id, o]) => ({ id, ...o }));
    const start = startPlay(orbits, Object.fromEntries(Object.entries(FIX.positions).map(([id, r]) => [id, r["0"]])));
    assert.equal(start.length, 9);
    for (const days of FIX.offsets_days) {
      for (const { id, p } of positionsAfter(start, days)) {
        const want = FIX.positions[id][String(days)];
        const r = Math.hypot(...FIX.positions[id]["0"]);
        const err = Math.hypot(p[0] - want[0], p[1] - want[1], p[2] - want[2]) / r;
        assert.ok(err < 0.001, `${id} after ${days} days is ${(err * 100).toFixed(3)}% of its orbit radius off`);
      }
    }
  });

  it("offers three speeds, the top one a month a second", () => {
    assert.deepEqual(PLAY_SPEEDS.map((s) => s.id), ["day", "week", "month"]);
    assert.ok(PLAY_SPEEDS.every((s, i, a) => i === 0 || s.days > a[i - 1].days));
    assert.ok(PLAY_SPEEDS.every((s) => !/[–—]/.test(s.label)));
  });
});
