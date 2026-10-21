import { expect, test } from "@playwright/test";

// Runs in the "upstream-down" project, whose backend has CLASSROOM_ENABLED=0 (playwright.config.ts): the
// state production launches in. Classroom must be absent everywhere a visitor could meet it.
test("the navigation has no Classroom link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "More" })).toBeVisible();
  await expect(page.locator('a[href="/classroom"]')).toHaveCount(0);
  await page.getByRole("button", { name: "More" }).click();
  const sheet = page.getByRole("dialog", { name: "More" });
  await expect(sheet.getByRole("link")).toHaveText([/Missions/, /Learn/, /Method/]);
});

for (const path of ["/classroom", "/classroom/class/1", "/classroom/hunt/1"]) {
  test(`${path} is a 404`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Classroom");
    await expect(page).toHaveTitle(/Page not found - Planet Hunter/);
  });
}
