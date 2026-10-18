// Classroom helpers.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assignmentHref, endOfDay, formatDue, gradeText } from "./classroom.ts";

describe("classroom helpers", () => {
  it("sends each assignment kind to the right page", () => {
    assert.equal(assignmentHref({ id: 3, kind: "lesson", ref: "transits" }), "/learn/transits");
    assert.equal(assignmentHref({ id: 3, kind: "quiz", ref: "transits" }), "/learn/transits?quiz=1");
    assert.equal(assignmentHref({ id: 3, kind: "hunt", ref: "toi-700" }), "/classroom/hunt/3");
  });

  it("turns a due date into the end of that local day", () => {
    const iso = endOfDay("2026-10-20");
    assert.ok(iso);
    const d = new Date(iso);
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 9);
    assert.equal(d.getDate(), 20);
    assert.equal(d.getHours(), 23);
    assert.equal(endOfDay("20/10/2026"), null);
    assert.equal(endOfDay(""), null);
  });

  it("formats due dates and grades plainly", () => {
    assert.equal(formatDue("2026-10-20T15:00:00Z", "UTC"), "Oct 20, 3:00 PM");
    assert.equal(gradeText(null), "-");
    assert.equal(gradeText({ score: 2, max_score: 3, completed_at: null, late: false }), "2 / 3 (in progress)");
    assert.equal(gradeText({ score: 3, max_score: 3, completed_at: "x", late: false }), "3 / 3");
    assert.equal(gradeText({ score: 1, max_score: 3, completed_at: "x", late: true }), "1 / 3 (late)");
  });
});
