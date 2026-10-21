import { expect, test } from "@playwright/test";
import { CANDIDATES } from "./routes";

// WCAG 1.4.11: the edge of a form field needs 3:1 against what is around it, because the edge is what
// tells a person where to tap or click. This measures the real computed colours on the real pages: the
// field's border against the nearest opaque background behind it (the card, or the page itself).
// Each page and the least number of visible fields it is known to show. Forms are drawn in the browser,
// so the test waits for that many to appear (a slow runner would otherwise look too early).
const ROUTES: { path: string; fields: number }[] = [
  { path: "/scan", fields: 1 },
  { path: "/classroom", fields: 5 }, // the student join form: code, nickname, PIN, birth month and year
  { path: `/candidates/${CANDIDATES[0].slug}`, fields: 1 }, // the explainer question box
  { path: "/solar-system", fields: 1 }, // the date control
  { path: "/exoplanets/toi-700", fields: 1 },
];
const MIN = 3;

test("every text field, select and textarea has a border of at least 3:1", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "colours do not depend on the screen size; one pass is enough");
  let checked = 0;
  for (const { path: route, fields: least } of ROUTES) {
    await page.goto(route);
    const measure = () => page.evaluate(() => {
      const parse = (c: string) => {
        const m = c.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
        return { r, g, b, a };
      };
      const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
        const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const ratio = (x: any, y: any) => {
        const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p);
        return (hi + 0.05) / (lo + 0.05);
      };
      const out: { what: string; ratio: number }[] = [];
      const fields = document.querySelectorAll(
        'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]), select, textarea',
      );
      for (const el of fields) {
        const box = (el as HTMLElement).getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue; // not shown (for example the other layout)
        const cs = getComputedStyle(el);
        const border = parse(cs.borderTopColor);
        if (!border || cs.borderTopWidth === "0px" || cs.borderTopStyle === "none") {
          out.push({ what: `${el.tagName.toLowerCase()}#${el.id} has no border`, ratio: 0 });
          continue;
        }
        let behind = { r: 4, g: 6, b: 13, a: 1 }; // the page colour (--space-950) if nothing else is opaque
        for (let n = el.parentElement; n; n = n.parentElement) {
          const bg = parse(getComputedStyle(n).backgroundColor);
          if (bg && bg.a >= 0.95) {
            behind = bg;
            break;
          }
        }
        out.push({ what: `${el.tagName.toLowerCase()}#${el.id || el.className}`, ratio: ratio(border, behind) });
      }
      return out;
    });
    await expect.poll(async () => (await measure()).length, { message: `${route} shows its form fields`, timeout: 20_000 }).toBeGreaterThanOrEqual(least);
    const found = await measure();
    for (const f of found) {
      checked++;
      expect.soft(f.ratio, `${route}: ${f.what} border contrast`).toBeGreaterThanOrEqual(MIN);
    }
  }
  expect(checked, "the test found form fields to check").toBeGreaterThanOrEqual(9);
});
