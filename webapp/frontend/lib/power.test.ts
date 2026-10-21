import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPower } from "./power.ts";

describe("formatPower", () => {
  it("keeps three significant digits at any size", () => {
    assert.equal(formatPower(0.00024695932234925107), "0.000247");
    assert.equal(formatPower(0.0022790523752259212), "0.00228");
    assert.equal(formatPower(0.0013642534145247855), "0.00136");
    assert.equal(formatPower(9.973748547141629e-5), "0.0000997");
    assert.equal(formatPower(0.0136), "0.0136");
    assert.equal(formatPower(0.5), "0.500");
    assert.equal(formatPower(12.3456), "12.3");
  });
  it("says n/a when there is no usable number", () => {
    for (const v of [0, -1, NaN, Infinity, null, undefined]) assert.equal(formatPower(v), "n/a");
  });
});
