import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ageLabel, ageLabelLocal } from "./time.ts";

describe("age counted in the viewer's own day", () => {
  // 2026-10-27 01:10 UTC is still the evening of 2026-10-26 in Chicago (CDT, UTC-5).
  const now = new Date("2026-10-27T01:10:00Z");

  it("the UTC count and the Chicago count differ across midnight, as they did on the staging site", () => {
    assert.equal(ageLabel("2026-10-09", now), "18 days ago");
    assert.equal(ageLabelLocal("2026-10-09", now, "America/Chicago"), "17 days ago");
  });

  it("they agree when it is the same calendar day in both", () => {
    const noon = new Date("2026-10-26T17:00:00Z");
    assert.equal(ageLabel("2026-10-09", noon), ageLabelLocal("2026-10-09", noon, "America/Chicago"));
  });

  it("keeps the wording: today, yesterday, months", () => {
    assert.equal(ageLabelLocal("2026-10-26", now, "America/Chicago"), "today");
    assert.equal(ageLabelLocal("2026-10-25", now, "America/Chicago"), "yesterday");
    assert.equal(ageLabelLocal("2026-06-01", now, "America/Chicago"), "about 5 months ago");
    assert.equal(ageLabelLocal("not a date", now, "America/Chicago"), "");
  });
});
