import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ROUTES } from "./routes";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.impact}: ${v.id} (${v.help}) on ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

for (const route of ROUTES) {
  test(`no serious or critical axe violations on ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("h1")).toHaveCount(1);
    expect(await seriousViolations(page)).toEqual([]);
  });
}

test("no serious axe violations with the units sheet open", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("units-button").click();
  await expect(page.getByRole("dialog", { name: "Units" })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("no serious axe violations with the More sheet open", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "the More tab exists on phones only");
  await page.goto("/");
  await page.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("dialog", { name: "More" })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});
