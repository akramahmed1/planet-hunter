import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { headline, sourceState, STATE_WORDS, type SourceStatus } from "./status.ts";

const S = (state: "live" | "stale" | "down"): SourceStatus => ({ name: "x", state, fetchedAt: null });

describe("live source status", () => {
  it("reads the state from the API answer", () => {
    assert.equal(sourceState({ ok: true, stale: false }), "live");
    assert.equal(sourceState({ ok: true }), "live");
    assert.equal(sourceState({ ok: true, stale: true }), "stale");
    assert.equal(sourceState({ ok: false }), "down");
    assert.equal(sourceState({ ok: false, stale: false }), "down");
  });

  it("has plain words for each state", () => {
    assert.deepEqual(STATE_WORDS, { live: "Live", stale: "May be out of date", down: "Unavailable" });
  });

  it("never claims more than is true", () => {
    assert.equal(headline([]), "");
    assert.equal(headline([S("live"), S("live"), S("live"), S("live")]), "All 4 live sources are up.");
    assert.equal(headline([S("live")]), "The live source is up.");
    assert.equal(headline([S("live"), S("stale"), S("live"), S("live")]), "3 of 4 live sources are up. One needs a moment; the rest of the site still works.");
    assert.equal(headline([S("live"), S("stale"), S("down"), S("live")]), "2 of 4 live sources are up. 2 need a moment; the rest of the site still works.");
    assert.equal(headline([S("down"), S("stale")]), "No live source is answering right now. The rest of the site still works.");
  });

  it("uses no dashes in the copy", () => {
    const text = [...Object.values(STATE_WORDS), headline([S("down")]), headline([S("live"), S("down")])].join(" ");
    assert.ok(!/[–—]/.test(text));
  });
});
