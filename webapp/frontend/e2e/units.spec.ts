import { expect, test } from "@playwright/test";

test("units default to °F and miles", async ({ page }) => {
  await page.goto("/design-system");
  await expect(page.getByTestId("units-button")).toContainText("°F · mi");
  await expect(page.getByText("93.0 million mi")).toBeVisible();
  await expect(page.getByText("32 °F")).toBeVisible();
});

test("changing units updates values and persists after reload", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("units-button").click();
  const sheet = page.getByRole("dialog", { name: "Units" });
  await sheet.getByLabel("Celsius").check();
  await sheet.getByLabel("Kilometers").check();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("units-button")).toContainText("°C · km");

  await page.goto("/design-system");
  await expect(page.getByTestId("units-button")).toContainText("°C · km");
  await expect(page.getByText("149.6 million km")).toBeVisible();
  await expect(page.getByText("100 °C")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("units-button")).toContainText("°C · km");
});

test("units still work when storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("storage blocked");
      },
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/design-system");
  await expect(page.getByTestId("units-button")).toContainText("°F · mi");
  await page.getByRole("radio", { name: "Kelvin" }).first().check();
  await expect(page.getByTestId("units-button")).toContainText("K · mi");
  expect(errors).toEqual([]);
});

test("tabs follow the keyboard pattern", async ({ page }) => {
  await page.goto("/design-system");
  const tablist = page.getByRole("tablist", { name: "Demo tabs" });
  const first = tablist.getByRole("tab", { name: "Overview" });
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(tablist.getByRole("tab", { name: "Data" })).toBeFocused();
  await expect(tablist.getByRole("tab", { name: "Data" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(tablist.getByRole("tab", { name: "Sources" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Home and End jump to the ends.")).toBeVisible();
});
