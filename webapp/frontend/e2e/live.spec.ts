import { expect, test } from "@playwright/test";

const TILES = ["ISS right now", "Picture of the day", "Confirmed exoplanets", "Space weather"];

test("Explore shows the four live tiles", async ({ page }) => {
  await page.goto("/");
  const live = page.getByRole("region", { name: "Live from space" });
  for (const t of TILES) await expect(live.getByRole("article", { name: t })).toBeVisible();
});

test("every live value opens its source on tap", async ({ page }) => {
  await page.goto("/");
  const live = page.getByRole("region", { name: "Live from space" });
  for (const t of TILES) {
    const tile = live.getByRole("article", { name: t });
    await expect(tile).toBeVisible(); // tiles stream in after the loading placeholders
    const button = tile.getByRole("button", { name: /show source/ });
    if ((await button.count()) === 0) {
      // A source that is down must say so explicitly instead of showing nothing.
      await expect(tile.getByText("Unavailable", { exact: true })).toBeVisible();
      continue;
    }
    await button.click();
    const sheet = page.getByRole("dialog", { name: /^Source:/ });
    await expect(sheet).toBeVisible();
    const link = sheet.getByRole("link").first();
    await expect(link).toHaveAttribute("href", /^https:\/\//);
    await expect(sheet.getByText(/^(measured|computed|estimate)$/)).toBeVisible();
    await expect(sheet.getByText(/UTC$/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(button).toBeFocused();
  }
});

test("the ISS tile follows the units setting", async ({ page }) => {
  await page.goto("/");
  const iss = page.getByRole("article", { name: "ISS right now" });
  await expect(iss).toBeVisible();
  test.skip((await iss.getByRole("button", { name: /show source/ }).count()) === 0, "ISS service down");
  await expect(iss.getByText(/ mi up, .* mph/)).toBeVisible();
  await page.getByTestId("units-button").click();
  await page.getByRole("dialog", { name: "Units" }).getByLabel("Kilometers").check();
  await page.keyboard.press("Escape");
  await expect(iss.getByText(/ km up, .* km\/h/)).toBeVisible();
});

test("the picture of the day never shows a non-APOD image", async ({ page }) => {
  await page.goto("/");
  const tile = page.getByRole("article", { name: "Picture of the day" });
  await expect(tile).toBeVisible();
  test.skip((await tile.getByRole("button", { name: /show source/ }).count()) === 0, "APOD down");
  for (const src of await tile.locator("img").evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).src)))
    expect(new URL(src).hostname).toBe("apod.nasa.gov");
});
