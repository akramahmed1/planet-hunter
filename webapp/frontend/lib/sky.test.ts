import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDec, formatRa, parsecsToLightYears, starDisplayColor } from "./sky.ts";

describe("sky", () => {
  it("formats TOI-700's TIC position (RA 97.0967866, Dec -65.5793115)", () => {
    // 97.0967866 / 15 = 6.473119 h = 6h 28m 23.2s; 65.5793115 deg = 65 deg 34' 46".
    assert.equal(formatRa(97.0967865903209), "06h 28m 23.2s");
    assert.equal(formatDec(-65.5793115481931), "-65° 34′ 46″");
    assert.equal(formatDec(12.5), "+12° 30′ 00″");
    assert.equal(formatRa(0), "00h 00m 00.0s");
  });

  it("converts parsecs to light years (1 pc = 3.2616 ly)", () => {
    assert.ok(Math.abs(parsecsToLightYears(1) - 3.26156) < 1e-4);
  });

  it("gives cooler stars a redder display color and clamps the ends", () => {
    const red = (hex: string) => parseInt(hex.slice(1, 3), 16);
    const blue = (hex: string) => parseInt(hex.slice(5, 7), 16);
    assert.ok(blue(starDisplayColor(3500)) < blue(starDisplayColor(5800)));
    assert.ok(red(starDisplayColor(3500)) >= red(starDisplayColor(9000)));
    assert.equal(starDisplayColor(1000), starDisplayColor(2500));
    assert.match(starDisplayColor(5772), /^#[0-9a-f]{6}$/);
  });
});
