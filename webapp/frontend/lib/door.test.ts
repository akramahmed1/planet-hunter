import assert from "node:assert/strict";
import test from "node:test";
import { DOORS, doorFor, parseDoor } from "./door.ts";

test("only the three known doors are accepted", () => {
  for (const d of ["guest", "teacher", "student"]) assert.equal(parseDoor(d), d);
  for (const bad of ["", "admin", "Teacher", " teacher", null, undefined, 3, {}, ["teacher"], "teacher\n"]) {
    assert.equal(parseDoor(bad), null);
  }
});

test("each door has a title, a sentence, a link and a button, and no dashes in the copy", () => {
  assert.deepEqual(DOORS.map((d) => d.door), ["guest", "teacher", "student"]);
  for (const d of DOORS) {
    assert.ok(d.title && d.text && d.cta && d.href.startsWith("/"));
    assert.ok(!/[–—]/.test(d.title + d.text + d.cta));
  }
});

test("the teacher and student doors open the Classroom with the matching choice", () => {
  assert.equal(doorFor("teacher").href, "/classroom?as=teacher");
  assert.equal(doorFor("student").href, "/classroom?as=student");
  assert.equal(doorFor("guest").href, "/");
});
