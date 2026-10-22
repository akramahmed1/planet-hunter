// Learn progress and number parsing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  badges,
  correctCount,
  EMPTY,
  hasBadge,
  markStep,
  mergeProgress,
  parse,
  parseNumber,
  recordAnswer,
  sameProgress,
  status,
  toleranceText,
} from "./learn.ts";

const KEYS = ["a", "b"];
const NOW = () => "2026-10-18T00:00:00.000Z";

describe("progress", () => {
  it("earns the badge only when every question has been right once", () => {
    let p = recordAnswer(EMPTY, "transits", "a", false, KEYS, NOW);
    p = recordAnswer(p, "transits", "a", true, KEYS, NOW);
    assert.equal(hasBadge(p, "transits"), false);
    assert.equal(status(p, "transits"), "in-progress");
    p = recordAnswer(p, "transits", "b", true, KEYS, NOW);
    assert.equal(hasBadge(p, "transits"), true);
    assert.equal(status(p, "transits"), "complete");
    assert.deepEqual(p.lessons.transits.questions.a, { correct: true, tries: 2 });
    assert.equal(correctCount(p, "transits", KEYS), 2);
  });

  it("a later wrong answer does not undo a right one or the badge", () => {
    let p = recordAnswer(EMPTY, "x", "a", true, ["a"], NOW);
    p = recordAnswer(p, "x", "a", false, ["a"], () => "later");
    assert.deepEqual(p.lessons.x.questions.a, { correct: true, tries: 1 });
    assert.equal(p.lessons.x.badgeAt, NOW());
  });

  it("steps only move forward and other lessons are untouched", () => {
    let p = markStep(EMPTY, "x", 2);
    p = markStep(p, "x", 0);
    assert.equal(p.lessons.x.stepsSeen, 3);
    assert.equal(status(p, "y"), "not-started");
    assert.deepEqual(badges(recordAnswer(p, "y", "a", true, ["a"], NOW), ["x", "y"]), ["y"]);
  });

  it("stored data with the wrong shape is dropped, not trusted", () => {
    assert.deepEqual(parse(null), EMPTY);
    assert.deepEqual(parse("not json"), EMPTY);
    assert.deepEqual(parse(JSON.stringify({ version: 2, lessons: {} })), EMPTY);
    const p = parse(JSON.stringify({
      version: 1,
      lessons: {
        ok: { stepsSeen: 2, questions: { a: { correct: true, tries: 1 }, "B!": { correct: true, tries: 1 } } },
        "<script>": { stepsSeen: 1, questions: {} },
        bad: { stepsSeen: -4, questions: { a: { correct: "yes", tries: 1 } } },
      },
    }));
    assert.deepEqual(Object.keys(p.lessons).sort(), ["bad", "ok"]);
    assert.deepEqual(p.lessons.ok.questions, { a: { correct: true, tries: 1 } });
    assert.deepEqual(p.lessons.bad, { stepsSeen: 0, questions: {} });
  });
});

describe("numbers", () => {
  it("reads plain numbers, with a comma as the decimal point", () => {
    assert.equal(parseNumber("8.3"), 8.3);
    assert.equal(parseNumber(" 8,3 "), 8.3);
    assert.equal(parseNumber("84"), 84);
    assert.equal(parseNumber(".95"), 0.95);
    assert.equal(parseNumber("-2"), -2);
    for (const bad of ["", "abc", "8.3.1", "1,2,3", "8.3 minutes", "1e400", "Infinity", "NaN"]) {
      assert.equal(parseNumber(bad), null, bad);
    }
  });

  it("states the tolerance plainly", () => {
    assert.equal(toleranceText(0.2, "minutes"), "Answers within 0.2 minutes count as right.");
    assert.equal(toleranceText(3, "ppm"), "Answers within 3 ppm count as right.");
  });
});

describe("syncing progress between devices", () => {
  const cases = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "backend", "tests", "fixtures", "learn_merge_cases.json"), "utf8"));

  it("joins progress exactly as the server does (60 cases made by the server's own code)", () => {
    assert.equal(cases.length, 60);
    for (const c of cases) assert.deepEqual(mergeProgress(c.a, c.b), c.merged);
  });

  it("is commutative, associative and idempotent, and never loses progress", () => {
    for (let i = 0; i < cases.length - 2; i++) {
      const [a, b, c] = [cases[i].a, cases[i + 1].b, cases[i + 2].a];
      assert.deepEqual(mergeProgress(a, b), mergeProgress(b, a));
      assert.deepEqual(mergeProgress(mergeProgress(a, b), c), mergeProgress(a, mergeProgress(b, c)));
      assert.deepEqual(mergeProgress(a, a), mergeProgress(a, a));
      assert.ok(sameProgress(mergeProgress(a, EMPTY), a));
      const m = mergeProgress(a, b);
      for (const [slug, l] of Object.entries(a.lessons) as [string, { stepsSeen: number }][]) {
        assert.ok(m.lessons[slug].stepsSeen >= l.stepsSeen);
      }
    }
  });

  it("an old copy cannot take away a badge or a correct answer", () => {
    const newer = recordAnswer(recordAnswer(EMPTY, "x", "a", true, KEYS, NOW), "x", "b", true, KEYS, NOW);
    const older = markStep(EMPTY, "x", 0);
    const m = mergeProgress(older, newer);
    assert.ok(hasBadge(m, "x"));
    assert.equal(correctCount(m, "x", KEYS), 2);
    assert.ok(sameProgress(m, mergeProgress(newer, older)));
  });

  it("tells copies apart only by what they hold", () => {
    assert.ok(sameProgress(EMPTY, { version: 1, lessons: {} }));
    assert.ok(!sameProgress(EMPTY, markStep(EMPTY, "x", 2)));
  });
});

