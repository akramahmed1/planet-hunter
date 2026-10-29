import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { creditFor, HORIZONS_CREDIT, TESS_CREDIT } from "./credit.ts";
import { auNote, formatDistance, KM_PER_AU } from "./units.ts";

describe("the AU note follows the chosen unit", () => {
  it("miles, kilometers and AU each get their own wording", () => {
    assert.match(auNote("mi"), /93 million miles/);
    assert.match(auNote("km"), /150 million kilometers/);
    assert.ok(!auNote("km").includes("miles"));
    assert.match(auNote("au"), /1 AU by definition/);
  });

  it("the words agree with the numbers the site prints", () => {
    assert.equal(formatDistance(KM_PER_AU, "km"), "149.6 million km");
    assert.equal(formatDistance(KM_PER_AU, "mi"), "93.0 million mi");
  });
});

describe("the footer credit follows the page's data", () => {
  it("Solar System and Missions credit JPL Horizons; the rest credit TESS and MAST", () => {
    assert.equal(creditFor("/solar-system"), HORIZONS_CREDIT);
    assert.equal(creditFor("/missions"), HORIZONS_CREDIT);
    assert.equal(creditFor("/missions/tess"), HORIZONS_CREDIT);
    for (const p of ["/", "/candidates", "/candidates/toi-700", "/learn"]) assert.equal(creditFor(p), TESS_CREDIT);
    assert.match(HORIZONS_CREDIT, /JPL Horizons/);
    assert.match(TESS_CREDIT, /TESS/);
  });
});
