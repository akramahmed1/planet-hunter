import { expect, test } from "@playwright/test";

// The living-cosmos background (components/shell/CosmosBackground.tsx).

test("it draws behind the page and never blocks a tap", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-cosmos", /running|paused/, { timeout: 15_000 });
  const canvas = page.getByTestId("cosmos");
  await expect(canvas).toBeAttached();
  const style = await canvas.evaluate((c) => {
    const s = getComputedStyle(c);
    return { position: s.position, z: s.zIndex, pe: s.pointerEvents };
  });
  expect(style).toEqual({ position: "fixed", z: "-1", pe: "none" });
  await page.getByRole("link", { name: "Hunt", exact: true }).click();
  await expect(page).toHaveURL(/\/candidates$/);
});

test("with reduced motion it draws one still frame and runs no animation loop", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const w = window as unknown as { __raf: number };
    w.__raf = 0;
    const orig = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => {
      w.__raf += 1;
      return orig(cb);
    };
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-cosmos", "still", { timeout: 15_000 });
  const before = await page.evaluate(() => (window as unknown as { __raf: number }).__raf);
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => (window as unknown as { __raf: number }).__raf);
  expect(after).toBe(before);
});

test("without WebGL the CSS gradient and stars stay", async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/.test(type)) return null;
      return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest) as never;
    } as typeof orig;
  });
  await page.goto("/");
  await page.waitForTimeout(2500);
  await expect(page.getByTestId("cosmos")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveClass(/cosmos-on/);
  const stars = await page.evaluate(() => getComputedStyle(document.body, "::before").display);
  expect(stars).not.toBe("none");
});

test("it pauses while a heavy WebGL view is on screen", async ({ page }) => {
  await page.goto("/solar-system");
  await expect(page.locator("[data-heavy-gl]")).toBeAttached({ timeout: 15_000 });
  await expect(page.locator("html")).toHaveAttribute("data-cosmos", "paused", { timeout: 15_000 });
});
