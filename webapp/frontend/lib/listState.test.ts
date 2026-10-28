import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_STATE, firstDir, listStateQuery, parseListState } from "./listState.ts";

const FILTERS = ["clean-recovery", "ambiguous", "unreviewed"];

describe("list state in the address", () => {
  it("an empty address is the default view, and the default view has an empty address", () => {
    assert.deepEqual(parseListState("", FILTERS), DEFAULT_STATE);
    assert.equal(listStateQuery(DEFAULT_STATE), "");
  });

  it("round-trips a filter and a sort", () => {
    const s = { filter: "ambiguous", sortKey: "snr" as const, sortDir: "desc" as const };
    assert.equal(listStateQuery(s), "?class=ambiguous&sort=snr%3Adesc");
    assert.deepEqual(parseListState(listStateQuery(s), FILTERS), s);
  });

  it("ignores anything it does not know, instead of trusting it", () => {
    assert.deepEqual(parseListState("?class=<script>&sort=evil:up", FILTERS), DEFAULT_STATE);
    assert.equal(parseListState("?class=marginal", FILTERS).filter, "all"); // not present in this run
    assert.equal(parseListState("?sort=snr", FILTERS).sortDir, "desc"); // direction missing: the column's own first direction
    assert.equal(parseListState("?sort=period_d:sideways", FILTERS).sortDir, "asc");
  });

  it("depth and SNR start with the biggest first; rank and period count up", () => {
    assert.equal(firstDir("snr"), "desc");
    assert.equal(firstDir("depth_ppm"), "desc");
    assert.equal(firstDir("rank"), "asc");
    assert.equal(firstDir("period_d"), "asc");
  });
});
