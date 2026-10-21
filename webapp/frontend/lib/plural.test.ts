import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { count, noun } from "./plural.ts";

describe("plural", () => {
  it("uses the singular for exactly one and the plural for everything else, zero included", () => {
    assert.equal(count(1, "sector"), "1 sector");
    assert.equal(count(0, "sector"), "0 sectors");
    assert.equal(count(2, "sector"), "2 sectors");
  });
  it("takes an irregular plural", () => {
    assert.equal(count(1, "clean recovery", "clean recoveries"), "1 clean recovery");
    assert.equal(count(3, "clean recovery", "clean recoveries"), "3 clean recoveries");
    assert.equal(noun(1, "ambiguous signal"), "ambiguous signal");
    assert.equal(noun(8, "ambiguous signal"), "ambiguous signals");
  });
});
