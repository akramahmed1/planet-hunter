import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classroomLabel, roleFromMe, visibleNav } from "../components/shell/nav.ts";

describe("role words in the navigation", () => {
  it("reads the role from the server's reply and treats anything odd as signed out", () => {
    assert.equal(roleFromMe({ me: { kind: "teacher", email: "t@x.example" } }), "teacher");
    assert.equal(roleFromMe({ me: { kind: "student", nickname: "Nova" } }), "student");
    for (const bad of [null, undefined, {}, { me: null }, { me: {} }, { me: { kind: "admin" } }, { me: { kind: "Teacher" } }, "teacher", 3]) {
      assert.equal(roleFromMe(bad), null);
    }
  });

  it("names the Classroom link for each role", () => {
    assert.equal(classroomLabel(null), "Classroom");
    assert.equal(classroomLabel("teacher"), "My classes");
    assert.equal(classroomLabel("student"), "My assignments");
  });

  it("changes only that one label, and only when Classroom is on", () => {
    const labels = (c: boolean, r: "teacher" | "student" | null) => visibleNav(c, r).map((n) => n.label);
    const guest = labels(true, null);
    assert.deepEqual(guest, ["Explore", "Solar System", "Exoplanets", "Hunt", "Missions", "Learn", "Method", "Classroom"]);
    assert.deepEqual(labels(true, "teacher").slice(0, 7), guest.slice(0, 7));
    assert.equal(labels(true, "teacher")[7], "My classes");
    assert.equal(labels(true, "student")[7], "My assignments");
    // Off means gone for everyone, whatever role the browser thinks it has.
    for (const r of [null, "teacher", "student"] as const) assert.ok(!labels(false, r).some((l) => /Classroom|My classes|My assignments/.test(l)));
  });

  it("keeps the 3D exoplanet systems a main section for everyone", () => {
    for (const c of [true, false]) {
      const item = visibleNav(c, null).find((n) => n.href === "/exoplanets");
      assert.equal(item?.label, "Exoplanets");
    }
  });
});
