import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// T34: the Method page's pipeline diagram, built from the same steps as the written list.

// The steps as the API gives them. Against a deployed site the API is a different host, so there the written list on
// the page is the reference instead (the diagram must still agree with it).
const API = process.env.PW_API_BASE ?? (process.env.PW_BASE_URL ? null : "http://127.0.0.1:8000");

async function steps(page: import("@playwright/test").Page) {
  if (API) return ((await (await page.request.get(`${API}/api/method`)).json()).steps) as { title: string; body: string }[];
  await page.goto("/method");
  return page.locator("ol.steps li").evaluateAll((els) =>
    els.map((li) => ({ title: li.querySelector("h3")!.textContent!, body: li.querySelector("p")!.textContent! })));
}

test("one stage for every step, in order, and choosing one shows exactly that step's text", async ({ page }) => {
  const all = await steps(page);
  await page.goto("/method");
  const stages = page.getByRole("tab");
  await expect(stages).toHaveCount(all.length);
  for (let i = 0; i < all.length; i++) await expect(stages.nth(i)).toContainText(all[i].title);
  const panel = page.getByTestId("stage-panel");
  await expect(panel).toContainText(all[0].body); // the first stage is open to begin with
  for (const i of [2, all.length - 1, 1]) {
    await stages.nth(i).click();
    await expect(stages.nth(i)).toHaveAttribute("aria-selected", "true");
    await expect(panel.getByRole("heading")).toHaveText(all[i].title);
    await expect(panel).toContainText(all[i].body);
    await expect(panel).toContainText(`Stage ${i + 1} of ${all.length}`);
  }
});

test("the keyboard works: arrows move between stages and wrap, Home and End jump", async ({ page }) => {
  const all = await steps(page);
  await page.goto("/method");
  const stages = page.getByRole("tab");
  await stages.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(stages.nth(1)).toBeFocused();
  await expect(stages.nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(stages.nth(all.length - 1)).toBeFocused();
  await page.keyboard.press("ArrowRight"); // wraps to the first
  await expect(stages.first()).toBeFocused();
  await page.keyboard.press("ArrowLeft"); // and back to the last
  await expect(stages.nth(all.length - 1)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(stages.first()).toHaveAttribute("aria-selected", "true");
  // Only the chosen stage is in the tab order, so Tab moves on past the diagram.
  expect(await stages.evaluateAll((els) => els.filter((e) => (e as HTMLElement).tabIndex === 0).length)).toBe(1);
});

test("the written steps stay on the page, in full, as the text version", async ({ page }) => {
  const all = await steps(page);
  await page.goto("/method");
  const written = page.locator("ol.steps li");
  await expect(written).toHaveCount(all.length);
  for (let i = 0; i < all.length; i++) {
    await expect(written.nth(i)).toContainText(all[i].title);
    await expect(written.nth(i)).toContainText(all[i].body);
  }
});

test("the stages are big enough to tap, nothing overflows, and the page passes the accessibility scan", async ({ page }) => {
  await page.goto("/method");
  for (const box of await page.getByRole("tab").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) {
    expect(box).toBeGreaterThanOrEqual(44);
  }
  const w = page.viewportSize()!.width;
  expect(await page.evaluate((x) => document.documentElement.scrollWidth > x, w)).toBe(false);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});

test("without JavaScript the page still shows every stage name and the full written steps", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  const all = await steps(page);
  await page.goto(`${process.env.PW_BASE_URL ?? "http://127.0.0.1:3000"}/method`);
  for (const s of all) await expect(page.locator("ol.steps")).toContainText(s.title);
  await expect(page.getByRole("tab")).toHaveCount(all.length);
  await ctx.close();
});
