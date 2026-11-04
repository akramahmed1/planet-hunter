import assert from "node:assert/strict";
import { test } from "node:test";
import { ageLabel, formatLocal, formatUtc, localDate } from "./time.ts";

test("a UTC instant is shown in the viewer's zone, with the zone named", () => {
  assert.equal(formatLocal("2026-10-20T00:17:00Z", "America/Chicago"), "Oct 19, 7:17 pm CDT");
  assert.equal(formatLocal("2026-10-20T00:17:00Z", "UTC"), "Oct 20, 12:17 am UTC");
});

test("the local date can be a day behind UTC", () => {
  assert.equal(localDate(new Date("2026-10-20T00:17:00Z"), "America/Chicago"), "2026-10-19");
  assert.equal(localDate(new Date("2026-10-20T00:17:00Z"), "Asia/Tokyo"), "2026-10-20");
});

test("formatUtc stays the same on server and client", () => {
  assert.equal(formatUtc("2026-10-20T00:17:00Z"), "2026-10-20 00:17 UTC");
});

test("a date is described by its age in whole days, then months, then years", () => {
  const now = new Date("2026-10-21T03:00:00Z");
  assert.equal(ageLabel("2026-10-21", now), "today");
  assert.equal(ageLabel("2026-10-20", now), "yesterday");
  assert.equal(ageLabel("2026-10-09", now), "12 days ago");
  assert.equal(ageLabel("2026-08-23", now), "59 days ago");
  assert.equal(ageLabel("2026-08-22", now), "about 2 months ago");
  assert.equal(ageLabel("2026-01-21", now), "about 9 months ago");
  assert.equal(ageLabel("2025-10-21", now), "about 1 year ago");
  assert.equal(ageLabel("2023-10-21", now), "about 3 years ago");
});

test("the age ignores the time of day and bad input gives nothing", () => {
  assert.equal(ageLabel("2026-10-20", new Date("2026-10-20T23:59:59Z")), "today");
  assert.equal(ageLabel("2026-10-20T10:00:00Z", new Date("2026-10-21T00:00:01Z")), "yesterday");
  assert.equal(ageLabel("not a date"), "");
  assert.equal(ageLabel("2099-01-01", new Date("2026-10-21T00:00:00Z")), "");
});
