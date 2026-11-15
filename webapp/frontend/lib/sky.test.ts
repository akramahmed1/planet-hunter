import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SKY_FOV, formatDec, formatRa, parsecsToLightYears, RING_DIAMETER_ARCSEC, RING_RADIUS_DEG, SKY_FOVS, starDisplayColor,
  TESS_PIXEL_ARCSEC, tessPixelsAcross,
} from "./sky.ts";

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

describe("sky atlas", () => {
  it("offers four fields of view from 1 arcminute to 2 degrees, starting at 30 arcminutes", () => {
    assert.deepEqual(SKY_FOVS.map((f) => f.deg), [1 / 60, 5 / 60, 0.5, 2]);
    assert.equal(DEFAULT_SKY_FOV.deg, 0.5); // the same field the viewer has always opened with
    assert.ok(SKY_FOVS.every((f, i, a) => i === 0 || f.deg > a[i - 1].deg));
    assert.ok(SKY_FOVS.every((f) => !/[–—]/.test(f.title + f.label)));
  });

  it("the ring is 1 arcminute across and covers about three TESS pixels", () => {
    assert.equal(TESS_PIXEL_ARCSEC, 21);
    assert.equal(RING_DIAMETER_ARCSEC, 60);
    assert.ok(Math.abs(RING_RADIUS_DEG * 3600 - 30) < 1e-9); // radius is 30 arcseconds
    assert.ok(Math.abs(tessPixelsAcross(RING_DIAMETER_ARCSEC) - 2.857) < 0.001);
  });
});

