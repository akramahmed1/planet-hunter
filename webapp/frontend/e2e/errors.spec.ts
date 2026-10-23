import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("/hunt lands on the candidates page", async ({ page }) => {
  await page.goto("/hunt");
  await expect(page).toHaveURL(/\/candidates$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("an unknown address gets a branded 404 with ways forward", async ({ page }) => {
  for (const path of [
    "/no-such-page",
    "/candidates/not-a-real-candidate",
    "/exoplanets/not-a-real-system",
    "/classroom/class/not-a-number",
    "/learn/not-a-lesson",
    "/scan/999999",
  ]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { level: 1 }), path).toHaveText("We could not find that page");
    // Inside the normal shell, with a way home and to the main sections.
    await expect(page.getByRole("main").getByRole("link", { name: "Go to the home page" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "See the candidates" })).toBeVisible();
    await expect(page).toHaveTitle(/Page not found - Planet Hunter/);
    const text = await page.locator("body").innerText();
    expect(text, path).not.toMatch(/[–—]/); // no en or em dashes in copy
  }
});

test("the 404 page keeps the dark site style and has no serious accessibility problems", async ({ page }) => {
  await page.goto("/no-such-page");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).not.toBe("rgb(255, 255, 255)"); // the dark site background, not the stock white page
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
});

// The error page needs a page that throws; /error-check does that only when the run sets PH_ERROR_TEST=1.
test("a page that crashes shows the friendly error page, not a stack trace", async ({ page }) => {
  const res = await page.goto("/error-check");
  test.skip(res?.status() === 404, "PH_ERROR_TEST is not set on this server");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page hit a problem");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to the home page" })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  const text = await page.locator("body").innerText();
  expect(text).not.toContain("deliberate error");
  expect(text).not.toMatch(/\bat \w+.*\(.*:\d+:\d+\)/); // no stack trace
});
