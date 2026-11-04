import assert from "node:assert/strict";
import { test } from "node:test";
import { moodFor } from "./cosmos.ts";

test("Hunt is warmer, Learn is greener, Classroom is neutral", () => {
  const [hr, , hb] = moodFor("/candidates/toi-700");
  assert.ok(hr > 0 && hb < 0);
  const [, lg] = moodFor("/learn/transits");
  assert.ok(lg > 0.04);
  assert.deepEqual(moodFor("/classroom/class/1"), [0, 0, 0]);
  assert.deepEqual(moodFor("/scan/5"), moodFor("/candidates"));
  assert.deepEqual(moodFor(null), moodFor("/"));
});
