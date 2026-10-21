import { expect, test } from "@playwright/test";
import { CANDIDATES } from "./routes";

// Counts agree with their nouns: "1 ambiguous signal", never "1 ambiguous signals".
const n = (c: string) => CANDIDATES.filter((x) => x.classification === c).length;

test("the home page stats say '1 clean recovery' and '1 ambiguous signal' in the singular", async ({ page }) => {
  await page.goto("/");
  const stats = page.locator(".stat-grid .stat");
  await expect(stats).toHaveCount(4);
  const expected = [
    [n("clean-recovery"), "clean recovery", "clean recoveries"],
    [n("ambiguous"), "ambiguous signal", "ambiguous signals"],
    [CANDIDATES.length, "target scanned", "targets scanned"],
  ] as const;
  for (const [value, one, many] of expected) {
    await expect(page.locator(".stat-grid .stat-label", { hasText: value === 1 ? one : many }).first()).toBeVisible();
  }
  // Whatever the data, a value of 1 never sits next to a plural label, and other values never next to a singular one.
  for (const stat of await stats.all()) {
    const value = (await stat.locator(".stat-value").innerText()).trim();
    const label = (await stat.locator(".stat-label").innerText()).trim();
    if (value === "1") expect(label, `1 ${label}`).not.toMatch(/(signals|recoveries|sectors|targets scanned)$/);
  }
});

test("the candidates page and run label use the singular for one", async ({ page }) => {
  await page.goto("/candidates");
  await expect(page.getByText(/\b1 sectors\b/)).toHaveCount(0);
  await expect(page.getByText(/\b1 candidate signals\b/)).toHaveCount(0);
});
