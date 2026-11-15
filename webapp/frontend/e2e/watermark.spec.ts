import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ROUTES } from "./routes";

// T33: a very faint brand mark in the corner. Decoration only: never read out, never in the way, off for less motion.

test("it is there, faint, behind the page, and takes no taps", async ({ page }) => {
  await page.goto("/");
  const mark = page.getByTestId("watermark");
  await expect(mark).toBeAttached();
  const css = await mark.evaluate((el) => {
    const s = getComputedStyle(el);
    return { opacity: Number(s.opacity), pointer: s.pointerEvents, z: s.zIndex, position: s.position, display: s.display };
  });
  expect(css.display).not.toBe("none");
  expect(css.opacity).toBeGreaterThan(0.01);
  expect(css.opacity).toBeLessThanOrEqual(0.08); // subtle
  expect(css.pointer).toBe("none");
  expect(Number(css.z)).toBeLessThan(0);
  expect(css.position).toBe("fixed");
  // It tilts slowly: movement is the only thing it does.
  const animation = await mark.locator(".watermark-tilt").evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe("watermark-tilt");
});

test("screen readers never meet it, and a tap in its corner lands on the page, not on it", async ({ page }) => {
  await page.goto("/");
  const mark = page.getByTestId("watermark");
  await expect(mark).toHaveAttribute("aria-hidden", "true");
  expect(await mark.locator("[tabindex], a, button, title, desc").count()).toBe(0);
  // Whatever is under the middle of the mark, it is not the mark.
  const box = await mark.boundingBox();
  const vp = page.viewportSize()!;
  const x = Math.min(vp.width - 5, Math.max(5, box!.x + box!.width / 2));
  const y = Math.min(vp.height - 5, Math.max(5, box!.y + box!.height / 2));
  const hit = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('[data-testid="watermark"]') !== null, [x, y]);
  expect(hit).toBe(false);
});

test("with reduced motion it is switched off, not just still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByTestId("watermark")).toBeHidden();
  expect(await page.getByTestId("watermark").evaluate((el) => getComputedStyle(el).display)).toBe("none");
});

test("it never makes a page wider than the screen and never fails the accessibility scan", async ({ page }) => {
  const w = page.viewportSize()!.width;
  for (const path of ["/", "/candidates", "/solar-system", "/method"]) {
    await page.goto(path);
    expect(await page.evaluate((x) => document.documentElement.scrollWidth > x, w), path).toBe(false);
  }
  await page.goto("/");
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  expect(ROUTES.length).toBeGreaterThan(5); // the shared accessibility spec scans every route with the mark in place
});
