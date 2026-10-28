import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pageEntries, search, systemEntries, targetEntries } from "./command.ts";

const targets = [
  { slug: "toi-700", target: "TOI 700", classification_label: "Clean recovery" },
  { slug: "toi-216", target: "TOI 216", classification_label: "Ambiguous" },
];
const all = [...pageEntries(true), ...targetEntries(targets), ...systemEntries(targets)];

describe("search is forgiving about spaces and finds the system page too", () => {
  it("toi700, toi 700 and toi-700 all find TOI 700", () => {
    for (const q of ["toi700", "toi 700", "toi-700", "TOI700"]) {
      const hrefs = search(all, q).map((e) => e.href);
      assert.ok(hrefs.includes("/candidates/toi-700"), q);
    }
  });

  it("a TOI search offers both the candidate page and the planetary system page, candidate first", () => {
    const hrefs = search(all, "toi 700").map((e) => e.href);
    assert.deepEqual(hrefs.filter((h) => h.endsWith("toi-700")), ["/candidates/toi-700", "/exoplanets/toi-700"]);
  });

  it("does not match other stars", () => {
    const hrefs = search(all, "toi700").map((e) => e.href);
    assert.ok(!hrefs.some((h) => h.endsWith("toi-216")));
  });
});
