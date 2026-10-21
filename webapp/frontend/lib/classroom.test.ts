// Classroom helpers.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { visibleNav } from "../components/shell/nav.ts";
import { assignmentHref, endOfDay, formatDue, glanceParts, gradeText, needsSignIn, schoolTotals } from "./classroom.ts";

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

  it("recognises the errors that mean 'sign in first'", () => {
    assert.equal(needsSignIn("Sign in as a teacher first."), true);
    assert.equal(needsSignIn("Sign in as a student first."), true);
    assert.equal(needsSignIn("this needs a teacher account"), true);
    assert.equal(needsSignIn("this needs a student account"), true);
    assert.equal(needsSignIn("no such class"), false);
    assert.equal(needsSignIn("Failed to fetch"), false);
  });
});

describe("navigation", () => {
  it("shows Classroom only when the server has it switched on", () => {
    assert.equal(visibleNav(true).some((n) => n.href === "/classroom"), true);
    assert.equal(visibleNav(false).some((n) => n.href === "/classroom"), false);
    // Everything else stays, in the same order.
    assert.deepEqual(visibleNav(false).map((n) => n.href), visibleNav(true).map((n) => n.href).filter((h) => h !== "/classroom"));
  });
});

const K = { students: 12, assignments: 4, expected: 48, completed: 30, average_percent: 83, next_due: "2026-10-24T22:00:00Z" };

describe("class and school glance", () => {
  it("lists only facts the server counted, in order, with plain plurals", () => {
    assert.deepEqual(glanceParts(K, "UTC"), ["12 students", "4 assignments", "30 of 48 done", "average 83%", "next due Oct 24, 10:00 PM"]);
    assert.deepEqual(glanceParts({ ...K, students: 1, assignments: 1, expected: 1, completed: 0, average_percent: null, next_due: null }),
      ["1 student", "1 assignment", "0 of 1 done"]);
  });

  it("says plainly when nothing is assigned or nobody has joined", () => {
    assert.deepEqual(glanceParts({ ...K, assignments: 0, expected: 0, completed: 0, average_percent: null, next_due: null }),
      ["12 students", "no assignments yet"]);
    assert.deepEqual(glanceParts({ ...K, students: 0, expected: 0, completed: 0, average_percent: null, next_due: null }),
      ["0 students", "4 assignments"]);
  });

  it("adds up a school and picks the soonest due date; no work expected means no percentage", () => {
    const t = schoolTotals([K, { ...K, students: 3, assignments: 1, expected: 3, completed: 3, next_due: "2026-10-22T10:00:00Z" },
      { ...K, students: 0, assignments: 0, expected: 0, completed: 0, average_percent: null, next_due: null }]);
    assert.deepEqual(t, { classes: 3, students: 15, assignments: 5, expected: 51, completed: 33, percentDone: 65,
      nextDue: "2026-10-22T10:00:00Z" });
    assert.deepEqual(schoolTotals([]), { classes: 0, students: 0, assignments: 0, expected: 0, completed: 0, percentDone: null, nextDue: null });
  });
});
