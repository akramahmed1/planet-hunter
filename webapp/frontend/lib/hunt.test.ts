import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { foldBinned, foldWindow, phaseOf, scoreGuess } from "./hunt.ts";

describe("find the dip", () => {
  it("phases match the pipeline's formula and wrap", () => {
    assert.equal(phaseOf(10, 4, 2), 0);
    assert.equal(phaseOf(11, 4, 2), 1);
    assert.equal(phaseOf(13.5, 4, 2), -0.5);
    assert.ok(phaseOf(0, 4, 2) >= -2 && phaseOf(0, 4, 2) < 2);
  });

  it("folding at the true period stacks the dips; a wrong period smears them", () => {
    const P = 3.7, t0 = 1.2;
    const time: number[] = [], flux: number[] = [];
    for (let t = 0; t < 60; t += 0.01) {
      time.push(t);
      flux.push(Math.abs(phaseOf(t, P, t0)) < 0.05 ? -1000 : 0);
    }
    const right = foldBinned(time, flux, P, t0, 50).filter((v): v is number => v !== null);
    const wrong = foldBinned(time, flux, P * 1.07, t0, 50).filter((v): v is number => v !== null);
    assert.equal(Math.min(...right), -1000);
    assert.ok(Math.min(...wrong) > -1000);
  });

  it("scores exact, close, harmonic and far guesses", () => {
    const P = 16.0503;
    assert.equal(scoreGuess(P, P).points, 100);
    assert.equal(scoreGuess(P * 1.0009, P).verdict, "exact");
    const close = scoreGuess(P * 1.01, P);
    assert.equal(close.verdict, "close");
    assert.equal(close.points, 50);
    assert.equal(scoreGuess(P / 2, P).harmonic, "half");
    assert.equal(scoreGuess(P * 2, P).harmonic, "double");
    const far = scoreGuess(P * 1.3, P);
    assert.equal(far.verdict, "off");
    assert.equal(far.points, 0);
    // Points never go up as the guess gets worse.
    let last = 101;
    for (const e of [0, 0.0005, 0.002, 0.005, 0.01, 0.03, 0.05, 0.1, 0.2]) {
      const p = scoreGuess(P * (1 + e), P).points;
      assert.ok(p <= last, `${e}`);
      last = p;
    }
  });

  it("the fold window keeps only points near the transit, sorted, with a median per point", () => {
    const P = 10, t0 = 0;
    const time = Array.from({ length: 1000 }, (_, i) => i * 0.1);
    const flux = time.map((t) => (Math.abs(phaseOf(t, P, t0)) < 0.2 ? -500 : 0));
    const w = foldWindow(time, flux, P, t0, 0.05, 20);
    assert.ok(w.x.every((x) => Math.abs(x) <= 0.05));
    assert.deepEqual([...w.x].sort((a, b) => a - b), w.x);
    assert.equal(w.x.length, w.median.length);
    assert.equal(Math.min(...w.y), -500);
  });
});
