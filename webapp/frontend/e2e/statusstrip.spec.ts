import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ROUTES } from "./routes";

// T29: the strip under the top bar shows the UTC clock, the ISS position and how fresh that data is, on every page.

test("the clock shows the real UTC time and keeps ticking", async ({ page }) => {
  await page.goto("/");
  const clock = page.getByTestId("strip-clock");
  await expect(clock).toHaveText(/^\d\d:\d\d:\d\d$/);
  const read = async () => (await clock.textContent())!;
  const toS = (t: string) => t.split(":").reduce((a, v) => a * 60 + Number(v), 0);
  const utcNow = () => { const d = new Date(); return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds(); };
  const first = toS(await read());
  const delta = Math.abs(((first - utcNow() + 43200 + 86400) % 86400) - 43200);
  expect(delta).toBeLessThanOrEqual(3);
  await expect.poll(async () => toS(await read()) !== first, { timeout: 4000 }).toBe(true);
});

test("the ISS position and its freshness are shown, with a plain age", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("strip-fresh")).toContainText(/data (just now|\d+ min ago|\d+ h ago|a day or more ago)/);
  if ((page.viewportSize()?.width ?? 0) >= 560) {
    await expect(page.getByTestId("strip-iss")).toContainText(/\d+\.\d° [NS] \d+\.\d° [EW]/);
  } else {
    await expect(page.getByTestId("strip-iss")).toBeHidden(); // the phone strip keeps to the clock and the freshness
  }
});

test("the strip has a fixed height and nothing moves when it fills in", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const measure = () => page.evaluate(() => ({
    strip: document.querySelector('[data-testid="status-strip"]')!.getBoundingClientRect().height,
    mainTop: Math.round(document.getElementById("main")!.getBoundingClientRect().top + window.scrollY),
  }));
  const early = await measure();
  await expect(page.getByTestId("strip-fresh")).toContainText(/data /);
  await expect(page.getByTestId("strip-clock")).toHaveText(/^\d\d:/);
  const late = await measure();
  expect(early.strip).toBe(28);
  expect(late).toEqual(early);
});

test("the ticking clock is not announced: no live region, and the strip is a labelled region", async ({ page }) => {
  await page.goto("/");
  const strip = page.getByTestId("status-strip");
  await expect(page.getByRole("region", { name: "Live status" })).toBeVisible();
  expect(await strip.locator("[aria-live], [role=status], [role=alert], [role=timer]").count()).toBe(0);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});

test("the strip is on every page and never makes the page wider than the screen", async ({ page }) => {
  for (const path of ROUTES) {
    await page.goto(path);
    await expect(page.getByTestId("status-strip"), path).toBeVisible();
    const w = page.viewportSize()!.width;
    const over = await page.evaluate((x) => document.documentElement.scrollWidth > x, w);
    expect(over, path).toBe(false);
  }
});
