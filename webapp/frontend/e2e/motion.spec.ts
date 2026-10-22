import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// T32: pages slide in, and headline numbers count up the first time they are seen. Both stop for reduced motion.

const pageAnimation = (page: import("@playwright/test").Page) =>
  page.locator(".page-enter").first().evaluate((el) => getComputedStyle(el).animationName);

test("a page you move to slides in, the first page of a visit does not, and nothing is left transformed", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".page-enter")).toHaveCount(0); // ready to use straight away
  await page.getByRole("link", { name: "How it works" }).first().click();
  await expect(page).toHaveURL(/\/method$/);
  expect(await pageAnimation(page)).toBe("page-enter");
  await page.waitForTimeout(600); // longer than the slide
  const transform = await page.locator(".page-enter").first().evaluate((el) => getComputedStyle(el).transform);
  expect(transform).toBe("none"); // a transformed parent would trap fixed panels inside it
});

test("with reduced motion the page does not slide and numbers are just numbers", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("link", { name: "How it works" }).first().click();
  await expect(page).toHaveURL(/\/method$/);
  const duration = await page.locator(".page-enter").first().evaluate((el) => getComputedStyle(el).animationDuration);
  expect(duration).toBe("0s");
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  const stat = page.getByRole("article", { name: "Confirmed exoplanets" }).locator(".countup");
  await stat.scrollIntoViewIfNeeded();
  await expect(stat).not.toHaveAttribute("data-counting", /./);
  const text = (await stat.innerText()).trim();
  await page.waitForTimeout(150);
  expect((await stat.innerText()).trim()).toBe(text); // nothing moved
  expect(text).toMatch(/^[\d,]+$/);
});

test("a headline number counts up when first seen, only ever upwards, ends on the real value, and the box never changes size", async ({ page }) => {
  // The real figure comes from the API, so the test does not depend on catching the page before the count starts.
  const api = await (await page.request.get("/api/v2/exoplanets/latest")).json();
  const real = (api.confirmed_count.value as number).toLocaleString("en-US");
  expect(api.confirmed_count.value).toBeGreaterThanOrEqual(10);
  // Record every value the number takes, from before the page script runs.
  await page.addInitScript(() => {
    (window as unknown as { __seen: string[] }).__seen = [];
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData" && (r.target.parentElement as HTMLElement | null)?.classList.contains("countup"))
          (window as unknown as { __seen: string[] }).__seen.push(String(r.target.nodeValue));
      }
    }).observe(document, { subtree: true, characterData: true });
  });
  // A page that is too busy to draw frames in time skips the count (it never shows a stale number), so the test steps
  // the page's clock itself, one frame at a time, instead of depending on how busy this machine is.
  await page.clock.install();
  await page.goto("/");
  await page.clock.runFor(50);
  const stat = page.getByRole("article", { name: "Confirmed exoplanets" }).locator(".countup");
  const before = await stat.boundingBox();
  await stat.scrollIntoViewIfNeeded();
  for (let i = 0; i < 80; i++) await page.clock.runFor(16);
  await expect(stat).not.toHaveAttribute("data-counting", /./);
  await expect(stat).toHaveText(real);
  const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
  const nums = seen.map((t) => Number(t.replace(/,/g, "")));
  expect(nums.length, `values seen: ${seen.join(" ")}`).toBeGreaterThan(5); // it really counted, in steps
  expect(nums[0]).toBeLessThan(api.confirmed_count.value / 2);
  expect(nums.at(-1)).toBe(api.confirmed_count.value);
  for (let i = 1; i < nums.length; i++) expect(nums[i], `step ${i}`).toBeGreaterThanOrEqual(nums[i - 1]);
  expect(nums).not.toContain(1);
  const after = await stat.boundingBox();
  expect(after!.width).toBe(before!.width);
  expect(after!.height).toBe(before!.height);
});

test("the figures are right for a screen reader from the start, and a page passes the accessibility scan mid-slide", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "How it works" }).first().click();
  await expect(page).toHaveURL(/\/method$/);
  expect(await pageAnimation(page)).toBe("page-enter");
  const axe = await new AxeBuilder({ page }).analyze(); // run straight away, while the page is still sliding in
  expect(axe.violations).toEqual([]);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  // The text is the real number in the page itself; there is no separate hidden copy to get out of step.
  const value = await page.getByRole("article", { name: "Confirmed exoplanets" }).locator(".countup").innerText();
  expect(value.trim()).toMatch(/^[\d,]+$/);
  await expect(page.locator(".countup[aria-hidden], [aria-hidden] .countup")).toHaveCount(0);
});
