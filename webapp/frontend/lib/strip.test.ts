import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLOCK_PLACEHOLDER, coordText, freshness, utcClock } from "./strip.ts";

describe("status strip helpers", () => {
  it("shows the UTC time with leading zeros, whatever the local zone", () => {
    assert.equal(utcClock(new Date("2026-10-21T03:04:05Z")), "03:04:05");
    assert.equal(utcClock(new Date("2026-10-21T23:59:59Z")), "23:59:59");
    assert.equal(utcClock(new Date("2026-10-21T00:00:00Z")), "00:00:00");
    assert.equal(CLOCK_PLACEHOLDER.length, utcClock(new Date()).length); // same width, so nothing shifts
  });

  it("writes coordinates with the hemisphere as a letter", () => {
    assert.equal(coordText(34.76, "N", "S"), "34.8° N");
    assert.equal(coordText(-34.76, "N", "S"), "34.8° S");
    assert.equal(coordText(57.96, "E", "W"), "58.0° E");
    assert.equal(coordText(-122.4, "E", "W"), "122.4° W");
    assert.equal(coordText(0, "N", "S"), "0.0° N");
    assert.equal(coordText(Number.NaN, "N", "S"), "");
  });

  it("says how old the data is in plain words", () => {
    const now = new Date("2026-10-21T12:00:00Z");
    const ago = (s: number) => new Date(now.getTime() - s * 1000).toISOString();
    assert.equal(freshness(ago(0), now), "just now");
    assert.equal(freshness(ago(44), now), "just now");
    assert.equal(freshness(ago(60), now), "1 min ago");
    assert.equal(freshness(ago(150), now), "3 min ago");
    assert.equal(freshness(ago(3000), now), "50 min ago");
    assert.equal(freshness(ago(3 * 3600), now), "3 h ago");
    assert.equal(freshness(ago(30 * 3600), now), "a day or more ago");
    assert.equal(freshness(new Date(now.getTime() + 60_000).toISOString(), now), "just now"); // a slightly fast clock
    assert.equal(freshness("not a date", now), "");
  });

  it("uses no dashes in the words", () => {
    const text = ["just now", "min ago", "h ago", "a day or more ago"].join(" ");
    assert.ok(!/[–—]/.test(text));
  });
});
