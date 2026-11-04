import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// T26: the guest home shows whether each live source is answering, honestly, and three clear places to start.

test("the home page shows the state of each live source and a plain summary", async ({ page }) => {
  await page.goto("/");
  const items = page.getByTestId("mission-item");
  await expect(items).toHaveCount(4);
  await expect(items.locator(".mission-name")).toHaveText(["Space station position", "Picture of the day", "Exoplanet archive", "Space weather"]);
  for (const state of await page.getByTestId("mission-state").allTextContents()) {
    expect(["Live", "May be out of date", "Unavailable"]).toContain(state);
  }
  await expect(page.getByTestId("mission-headline")).toHaveText(/live sources? (is|are) up|need a moment|No live source/);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});

test("the headline agrees with the items it summarises", async ({ page }) => {
  await page.goto("/");
  const states = await page.getByTestId("mission-state").allTextContents();
  const live = states.filter((s) => s === "Live").length;
  const text = (await page.getByTestId("mission-headline").textContent())!;
  if (live === states.length) expect(text).toBe(`All ${states.length} live sources are up.`);
  else if (live === 0) expect(text).toContain("No live source is answering");
  else expect(text).toContain(`${live} of ${states.length} live sources are up.`);
});

test("three places to start lead where they say", async ({ page }) => {
  await page.goto("/");
  const cards = page.getByTestId("start-here").getByRole("link");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toHaveAttribute("href", "/candidates");
  await expect(cards.nth(1)).toHaveAttribute("href", "/solar-system");
  await expect(cards.nth(2)).toHaveAttribute("href", "/learn");
  const width = page.viewportSize()!.width;
  const over = await page.evaluate((w) => [...document.querySelectorAll("main *")].filter((e) => e.getBoundingClientRect().right > w + 1).length, width);
  expect(over).toBe(0);
});
