import { expect, test } from "@playwright/test";
import { CANDIDATES } from "./routes";

const maxPeriod = Math.max(...CANDIDATES.map((c) => c.period_d)).toFixed(4);

test("phone shows candidate cards and hides the table", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "phone layout");
  await page.goto("/candidates");
  const cards = page.getByRole("list", { name: "Candidate signals" }).getByRole("listitem");
  await expect(cards).toHaveCount(CANDIDATES.length);
  await expect(page.getByRole("table")).toBeHidden();
  for (const c of CANDIDATES) await expect(page.getByRole("link", { name: new RegExp(c.target) })).toBeVisible();
});

test("phone sort control orders cards by period", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "phone layout");
  await page.goto("/candidates");
  await page.getByLabel("Sort by").selectOption("period_d:desc");
  const first = page.getByRole("list", { name: "Candidate signals" }).getByRole("listitem").first();
  await expect(first).toContainText(`${maxPeriod} d`);
});

test("desktop shows a sortable table and hides the cards", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop layout");
  await page.goto("/candidates");
  await expect(page.getByRole("list", { name: "Candidate signals" })).toBeHidden();
  const table = page.getByRole("table");
  await expect(table.locator("tbody tr")).toHaveCount(CANDIDATES.length);
  const header = table.getByRole("columnheader", { name: /Period/ });
  await header.getByRole("button").click();
  await header.getByRole("button").click();
  await expect(header).toHaveAttribute("aria-sort", "descending");
  await expect(table.locator("tbody tr").first().locator("td").nth(1)).toHaveText(maxPeriod);
});

test("filtering by classification narrows the list", async ({ page }) => {
  await page.goto("/candidates");
  const filters = page.getByRole("group", { name: "Filter by classification" });
  const counts = new Map<string, number>();
  for (const c of CANDIDATES) counts.set(c.slug, 1);
  const ambiguous = filters.getByRole("button", { name: "Ambiguous" });
  await ambiguous.click();
  await expect(ambiguous).toHaveAttribute("aria-pressed", "true");
  const status = page.getByText(/of \d+ candidate signals shown\./).first();
  await expect(status).not.toHaveText(`${CANDIDATES.length} of ${CANDIDATES.length} candidate signals shown.`);
  await filters.getByRole("button", { name: "All" }).click();
  await expect(status).toHaveText(`${CANDIDATES.length} of ${CANDIDATES.length} candidate signals shown.`);
});

test("a candidate opens its detail page", async ({ page }) => {
  const c = CANDIDATES[0];
  await page.goto("/candidates");
  await page.getByRole("link", { name: new RegExp(c.target) }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/candidates/${c.slug}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(c.target);
  await expect(page.getByText("What this is NOT.")).toBeVisible();
});
