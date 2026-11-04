import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DIP_QUESTION, fieldLabel, hasDip } from "./explain.ts";

describe("explain helpers", () => {
  it("keeps the fixed question inside the server's limit and free of dashes", () => {
    assert.ok(DIP_QUESTION.length <= 300);
    assert.ok(!/[–—]/.test(DIP_QUESTION));
  });
  it("names the fields an answer can cite, and says nothing for ones it does not know", () => {
    assert.equal(fieldLabel("item.depth_ppm"), "Depth (ppm)");
    assert.equal(fieldLabel("item.signal.snr"), "Signal to noise");
    assert.equal(fieldLabel("item.vetting[2]"), "Vetting checks");
    assert.equal(fieldLabel("lessons.transits.steps[1].facts[0]"), "Lesson text");
    assert.equal(fieldLabel("item.something_new"), null);
  });
  it("offers the dip button for candidates and scans only", () => {
    assert.equal(hasDip("candidate"), true);
    assert.equal(hasDip("scan"), true);
    assert.equal(hasDip("planet"), false);
  });
});
