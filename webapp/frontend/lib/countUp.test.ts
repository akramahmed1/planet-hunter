import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COUNT_UP_FROM, COUNT_UP_MS, countUpValue } from "./countUp.ts";

describe("count up", () => {
  it("starts at 0, ends on the real value, and never goes past it", () => {
    for (const target of [10, 12, 365, 4096]) {
      assert.equal(countUpValue(target, 0), 0);
      assert.equal(countUpValue(target, COUNT_UP_MS), target);
      assert.equal(countUpValue(target, COUNT_UP_MS * 5), target);
      for (let ms = 0; ms <= COUNT_UP_MS; ms += 4) {
        const v = countUpValue(target, ms);
        assert.ok(Number.isInteger(v) && v >= 0 && v <= target, `${target} at ${ms} ms gave ${v}`);
      }
    }
  });

  it("does not count small numbers, and never passes through 1 on the way up", () => {
    for (const target of [0, 1, 2, 8, 9]) {
      for (const ms of [0, 100, 400, 800]) assert.equal(countUpValue(target, ms), target, `${target} at ${ms} ms`);
    }
    assert.equal(COUNT_UP_FROM, 10);
    for (const target of [10, 12, 40, 365]) {
      for (let ms = 0; ms < COUNT_UP_MS; ms += 1) assert.notEqual(countUpValue(target, ms), 1, `${target} at ${ms} ms`);
    }
  });

  it("only ever goes up, and eases out (most of the climb happens early)", () => {
    let last = -1;
    for (let ms = 0; ms <= COUNT_UP_MS; ms += 8) {
      const v = countUpValue(1000, ms);
      assert.ok(v >= last, `went down at ${ms} ms`);
      last = v;
    }
    assert.ok(countUpValue(1000, COUNT_UP_MS / 2) > 800);
  });

  it("leaves negatives and odd input alone", () => {
    assert.equal(countUpValue(-5, 100), -5);
    assert.ok(Number.isNaN(countUpValue(NaN, 100)));
    assert.equal(countUpValue(20, -50), 0);
  });
});
