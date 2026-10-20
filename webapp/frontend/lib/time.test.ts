import assert from "node:assert/strict";
import { test } from "node:test";
import { formatLocal, formatUtc, localDate } from "./time.ts";

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
