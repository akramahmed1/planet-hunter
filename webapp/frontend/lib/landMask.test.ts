import assert from "node:assert/strict";
import { test } from "node:test";
import { isLand, landDots, LAND_MASK_B64 } from "./landMask.ts";

test("the mask is 360 x 180 one-bit cells", () => {
  assert.equal(Buffer.from(LAND_MASK_B64, "base64").length, (360 * 180) / 8);
});

test("well known places are land and well known oceans are not", () => {
  const land: [string, number, number][] = [
    ["Kansas", 38.5, -98], ["the Sahara", 25, 15], ["Australia", -25, 135], ["Brazil", -10, -55],
    ["India", 22, 78], ["Antarctica", -80, 0], ["Siberia", 62, 100],
  ];
  const sea: [string, number, number][] = [
    ["mid Atlantic", 0, -30], ["mid Pacific", 0, -150], ["Indian Ocean", -30, 80], ["North Atlantic", 45, -40],
    ["Southern Ocean", -60, -120],
  ];
  for (const [name, lat, lon] of land) assert.equal(isLand(lat, lon), true, name);
  for (const [name, lat, lon] of sea) assert.equal(isLand(lat, lon), false, name);
});

test("longitudes wrap around the date line", () => {
  assert.equal(isLand(38.5, -98), isLand(38.5, 262));
});

test("the dots cover the land only, thinly and evenly", () => {
  const dots = landDots(2);
  assert.ok(dots.length > 2000 && dots.length < 5000, `${dots.length} dots`);
  assert.ok(dots.every(([lat, lon]) => isLand(lat, lon)));
  assert.ok(dots.every(([lat, lon]) => lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180));
  // Both hemispheres are drawn.
  assert.ok(dots.some(([lat]) => lat > 30) && dots.some(([lat]) => lat < -30));
});
