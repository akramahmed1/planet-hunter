import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// T28: glass panels, depth and glow edges are in use, degrade to real borders in forced colors, and the design system
// page documents them. Contrast of text on every page is checked by the axe tests on every route.

test("a card is a glass panel with a hairline glow edge and a blur", async ({ page }) => {
  await page.goto("/design-system");
  const style = await page.getByTestId("glass-sample").evaluate((el) => {
    const c = getComputedStyle(el);
    return { border: c.borderTopColor, blur: c.backdropFilter || (c as unknown as Record<string, string>).webkitBackdropFilter, shadow: c.boxShadow };
  });
  expect(style.border).toMatch(/rgba\(124, 196, 255, 0\.\d+\)/);
  expect(style.blur).toContain("blur");
  expect(style.shadow).not.toBe("none");
});

test("the design system page shows the three depth steps and passes the accessibility check", async ({ page }) => {
  await page.goto("/design-system");
  await expect(page.getByTestId("depth-row").locator(".depth-sample")).toHaveText([/Resting/, /Raised/, /Floating/]);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});

test("in forced colors the panels get real system colour borders and no glow", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/design-system");
  const s = await page.getByTestId("glass-sample").evaluate((el) => {
    const c = getComputedStyle(el);
    return { border: c.borderTopColor, shadow: c.boxShadow };
  });
  expect(s.border).not.toMatch(/rgba\(124, 196, 255/); // not the glow colour: the browser's own system colour
  expect(s.shadow).toBe("none");
});

test("the home page tiles and cards use the glass tokens and nothing overflows the screen", async ({ page }) => {
  await page.goto("/");
  const fills = await page.evaluate(() =>
    [...document.querySelectorAll(".tile, .card, .mission")].slice(0, 6).map((e) => getComputedStyle(e).borderTopColor));
  expect(fills.length).toBeGreaterThan(0);
  for (const f of fills) expect(f).toMatch(/rgba\(124, 196, 255, 0\.\d+\)/);
  const w = page.viewportSize()!.width;
  expect(await page.evaluate((x) => [...document.querySelectorAll("main *")].filter((e) => e.getBoundingClientRect().right > x + 1).length, w)).toBe(0);
});
