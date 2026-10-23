import { expect, test } from "@playwright/test";

// Runs in the "upstream-down" project: the backend behind these pages cannot reach any upstream
// (NASA, JPL, the ISS service) and has nothing cached. Each live widget must fall back to a quiet
// "unavailable" state, never a raw error or a broken box.
for (const path of ["/", "/solar-system", "/missions"]) {
  test(`${path} shows no error boxes when every live source is down`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".error-box")).toHaveCount(0);
    // (Next's own route announcer is an empty role=alert; only alerts with text count.)
    const alerts = await page.evaluate(() =>
      [...document.querySelectorAll('[role="alert"]')].filter((a) => (a.textContent ?? "").trim() !== "").length,
    );
    expect(alerts).toBe(0);
    const text = await page.locator("main").innerText();
    for (const bad of ["not an APOD picture", "Failed to fetch", "[object Object]", "undefined", "NaN"])
      expect(text).not.toContain(bad);
  });
}

test("the home page says what is unavailable instead of leaving gaps", async ({ page }) => {
  await page.goto("/");
  const live = page.getByRole("region", { name: "Live from space" });
  for (const t of ["ISS right now", "Picture of the day", "Confirmed exoplanets"])
    await expect(live.getByRole("article", { name: t }).getByText("Unavailable", { exact: true })).toBeVisible();
  await expect(live.getByTestId("weather-quiet")).toBeVisible();
});

test("mission control says plainly that no live source is answering, and the rest of the home page still works", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("mission-state")).toHaveText(["Unavailable", "Unavailable", "Unavailable", "Unavailable"]);
  await expect(page.getByTestId("mission-headline")).toHaveText("No live source is answering right now. The rest of the site still works.");
  await expect(page.getByTestId("start-here").getByRole("link")).toHaveCount(3);
  await expect(page.getByRole("link", { name: /See all|See the candidates/ })).toBeVisible();
});

test("the status strip keeps its clock and says plainly that the ISS position is unavailable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("strip-clock")).toHaveText(/^\d\d:\d\d:\d\d$/);
  await expect(page.getByTestId("strip-fresh")).toHaveText("ISS position unavailable right now");
  await expect(page.getByTestId("strip-iss")).toHaveCount(0);
  expect(await page.getByTestId("status-strip").evaluate((e) => e.getBoundingClientRect().height)).toBe(28);
});
