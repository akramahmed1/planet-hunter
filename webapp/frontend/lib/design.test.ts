import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// T28: the design tokens exist and keep their promises. The fill of a glass panel is translucent, so the worst case for
// text contrast is the brightest thing that could sit behind it (white). The test composites the real fill over white
// and checks the real text colours against WCAG AA.

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const token = (name: string) => css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = ([r, g, b]: number[]) => {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: number[], b: number[]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("design tokens", () => {
  it("defines the surface, depth and type role tokens", () => {
    for (const t of ["--glass-bg", "--glass-solid", "--glass-blur", "--hairline", "--hairline-strong", "--depth-1", "--depth-2",
      "--depth-3", "--glow-edge", "--glow-edge-strong", "--lh-display", "--lh-heading", "--lh-body", "--tracking-display",
      "--tracking-heading", "--tracking-eyebrow", "--measure"]) {
      assert.ok(token(t), `${t} is not defined`);
    }
  });

  it("never lets a glass fill get more transparent than 0.82", () => {
    const fill = token("--glass-bg")!;
    const alphas = [...fill.matchAll(/rgba\([^)]*,\s*([0-9.]+)\)/g)].map((m) => Number(m[1]));
    assert.ok(alphas.length >= 2);
    for (const a of alphas) assert.ok(a >= 0.82, `alpha ${a} is below 0.82`);
  });

  it("keeps body and dim text at 4.5:1 even over a white backdrop (worst case)", () => {
    const fill = token("--glass-bg")!;
    const stops = [...fill.matchAll(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/g)].map((m) => ({ c: [+m[1], +m[2], +m[3]], a: +m[4] }));
    for (const { c, a } of stops) {
      const overWhite = c.map((v) => Math.round(a * v + (1 - a) * 255));
      for (const ink of ["--ink", "--ink-dim"]) {
        const r = ratio(hex(token(ink)!), overWhite);
        assert.ok(r >= 4.5, `${ink} on the glass fill over white is only ${r.toFixed(2)}:1`);
      }
    }
  });

  it("has the fallbacks: no blur support, reduced transparency, forced colors", () => {
    assert.match(css, /@supports not \(\(backdrop-filter: blur\(1px\)\)/);
    assert.match(css, /@media \(prefers-reduced-transparency: reduce\)/);
    assert.match(css, /@media \(forced-colors: active\)/);
    assert.equal(token("--glass-solid"), "#0e162b");
  });

  it("uses the roles for headings and the eyebrow rather than their own numbers", () => {
    assert.match(css, /letter-spacing: var\(--tracking-heading\)/);
    assert.match(css, /line-height: var\(--lh-heading\)/);
    assert.match(css, /letter-spacing: var\(--tracking-eyebrow\)/);
  });
});
