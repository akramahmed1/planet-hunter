import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isThirteenOrOlder, passwordChecks, tidyName } from "./age.ts";

const today = new Date(Date.UTC(2026, 10, 14)); // November 2026

describe("age", () => {
  it("matches the server rule: old enough only after the 13th birthday month has passed", () => {
    assert.equal(isThirteenOrOlder(5, 2024, today), false); // the 2 year old in the audit recording
    assert.equal(isThirteenOrOlder(11, 2013, today), false); // turns 13 this month: asked to come back next month
    assert.equal(isThirteenOrOlder(10, 2013, today), true); // 13th birthday was last month
    assert.equal(isThirteenOrOlder(9, 2013, today), true);
    assert.equal(isThirteenOrOlder(1, 1985, today), true);
  });
  it("refuses impossible dates", () => {
    assert.equal(isThirteenOrOlder(0, 1990, today), false);
    assert.equal(isThirteenOrOlder(13, 1990, today), false);
    assert.equal(isThirteenOrOlder(5, 1899, today), false);
    assert.equal(isThirteenOrOlder(5, 2027, today), false);
    assert.equal(isThirteenOrOlder(Number.NaN, 1990, today), false);
  });
});

describe("password checks", () => {
  it("ticks the rules off as the password grows", () => {
    assert.deepEqual(passwordChecks("short").map((c) => c.ok), [false, true, true]);
    assert.deepEqual(passwordChecks("correct horse battery").map((c) => c.ok), [true, true, true]);
    assert.deepEqual(passwordChecks(" correct horse battery").map((c) => c.ok), [true, false, true]);
    assert.deepEqual(passwordChecks("").map((c) => c.ok), [false, false, true]);
  });
});

describe("tidyName", () => {
  it("trims and collapses spaces but keeps the letters as typed", () => {
    assert.equal(tidyName("  Trine   university "), "Trine university");
  });
});
