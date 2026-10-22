import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// T42: Cmd/Ctrl+K search, and the Search button for phones.

test("the Search button opens the box, typing finds a page, Enter goes there and the box closes", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("cmd-open").click();
  const input = page.getByTestId("cmd-input");
  await expect(input).toBeFocused();
  await input.fill("solar");
  await expect(page.getByRole("option").first()).toContainText("Solar System");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/solar-system$/);
  await expect(page.getByTestId("cmd")).toBeHidden();
});

test("a candidate is found by its name once the list has loaded", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("cmd-open").click();
  await page.getByTestId("cmd-input").fill("toi 700");
  await expect(page.getByRole("option").first()).toContainText("TOI 700");
  await page.getByRole("option").first().click();
  await expect(page).toHaveURL(/\/candidates\/toi-700$/);
});

test("arrow keys move the choice, Escape closes and focus goes back to the button", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("cmd-open").click();
  const input = page.getByTestId("cmd-input");
  await expect(page.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowDown");
  await expect(page.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowUp");
  await expect(page.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await input.press("Escape");
  await expect(page.getByTestId("cmd")).toBeHidden();
  await expect(page.getByTestId("cmd-open")).toBeFocused();
});

test("a query with no match says so, and the box passes axe", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("cmd-open").click();
  await page.getByTestId("cmd-input").fill("zzzzqq");
  await expect(page.getByTestId("cmd-status")).toContainText("Nothing matches that");
  await expect(page.getByRole("option")).toHaveCount(0);
  await page.getByTestId("cmd-input").fill("earth");
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});

test("Ctrl+K opens and closes it from the keyboard", async ({ page, isMobile }) => {
  test.skip(!!isMobile, "phones have no keyboard shortcut; the button is tested above");
  await page.goto("/");
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("cmd")).toBeVisible();
  await expect(page.getByTestId("cmd-input")).toBeFocused();
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("cmd")).toBeHidden();
});

test("the top bar does not overflow with the Search button on a phone width", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(wide).toBe(false);
});
