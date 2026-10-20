import { expect, test } from "@playwright/test";
import { CANDIDATES } from "./routes";

test("every candidate page has an interactive light curve and periodogram", async ({ page }) => {
  for (const c of CANDIDATES) {
    await page.goto(`/candidates/${c.slug}`);
    await expect(page.getByTestId("lc-chart").locator("canvas")).toBeVisible();
    await expect(page.getByTestId("pg-chart").locator("canvas")).toBeVisible();
    await expect(page.getByTestId("fold-chart").locator("canvas")).toBeVisible();
    // The static plot stays as a fallback below the interactive charts.
    await expect(page.getByRole("heading", { name: "The pipeline's folded plot" })).toBeVisible();
  }
});

test("find the dip: a far guess scores low, the pipeline's period scores 100", async ({ page }) => {
  const c = CANDIDATES.find((x) => x.slug === "toi-700")!;
  await page.goto(`/candidates/${c.slug}`);
  const lab = page.getByTestId("challenge");
  await lab.getByTestId("check-guess").click();
  await expect(lab.getByTestId("score")).toContainText("0 points");
  await lab.getByRole("button", { name: "Show the answer" }).click();
  await expect(lab.getByTestId("answer")).toContainText(`${c.period_d.toFixed(4)} days`);
  await lab.getByRole("button", { name: "Fold there" }).click();
  // The readout is the exact pipeline period, not the nearest slider step.
  await expect(lab.getByTestId("guess-period")).toHaveText(`${c.period_d.toFixed(4)} days`);
  await lab.getByTestId("check-guess").click();
  await expect(lab.getByTestId("score")).toContainText("100 points");
  // Nudging by +1% moves the guess off the answer.
  await lab.getByRole("button", { name: "+1%" }).click();
  await lab.getByTestId("check-guess").click();
  await expect(lab.getByTestId("score")).not.toContainText("100 points");
});

test("the light-curve zoom controls work", async ({ page }) => {
  await page.goto("/candidates/toi-270");
  const chart = page.getByTestId("lc-chart").locator("canvas");
  await expect(chart).toBeVisible();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Pan right" }).click();
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(chart).toBeVisible();
});

test("the eclipsing binary target explains why it is not a planet", async ({ page }) => {
  await page.goto("/candidates/toi-1338");
  await expect(page.getByText(/classified TOI 1338 as an eclipsing binary/)).toBeVisible();
});
