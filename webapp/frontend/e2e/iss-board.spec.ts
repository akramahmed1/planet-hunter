import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// T37: the ISS telemetry board and the ground track on /missions. Map tiles are stubbed so nothing needs the network.

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
const stubTiles = (page: Page) => page.route(/^https:\/\/tile\.openstreetmap\.org\//, (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));

type Iss = { latitude: number; longitude: number; altitude_km: number; velocity_kmh: number; visibility: string };
const fetchIss = async (page: Page) => (await (await page.request.get("/api/v2/iss")).json()) as Iss;

test("the board shows where, how high, how fast and whether the sun is on the station, from the live numbers", async ({ page }) => {
  await stubTiles(page);
  const iss = await fetchIss(page);
  await page.goto("/missions");
  const board = page.getByTestId("iss-board");
  await expect(board).toBeVisible();
  const lat = `${Math.abs(iss.latitude).toFixed(2)}° ${iss.latitude >= 0 ? "N" : "S"}`;
  const lon = `${Math.abs(iss.longitude).toFixed(2)}° ${iss.longitude >= 0 ? "E" : "W"}`;
  await expect(page.getByTestId("iss-over")).toHaveText(`${lat}, ${lon}`);
  // Default units are miles; the same numbers come out in kilometres when the unit is switched.
  await expect(page.getByTestId("iss-height")).toHaveText(`${Math.round(iss.altitude_km / 1.609344).toLocaleString("en-US")} mi`);
  await expect(page.getByTestId("iss-speed")).toHaveText(`${Math.round(iss.velocity_kmh / 1.609344).toLocaleString("en-US")} mph`);
  await expect(page.getByTestId("iss-sunlight")).not.toBeEmpty();
  await expect(page.getByTestId("iss-sunlight")).not.toHaveText(iss.visibility === "daylight" ? "daylight" : "\u0000");
  await page.getByTestId("units-button").click();
  await page.getByRole("dialog", { name: "Units" }).getByLabel(/Kilometers|km/i).first().check();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("iss-height")).toHaveText(`${Math.round(iss.altitude_km).toLocaleString("en-US")} km`);
  await expect(page.getByTestId("iss-speed")).toHaveText(`${Math.round(iss.velocity_kmh).toLocaleString("en-US")} km/h`);
});

test("one lap is worked out from the speed and height and lands near the station's real period", async ({ page }) => {
  await stubTiles(page);
  await page.goto("/missions");
  const text = await page.getByTestId("iss-lap").innerText();
  const minutes = Number(/about (\d+) minutes/.exec(text)![1]);
  expect(minutes).toBeGreaterThan(88);
  expect(minutes).toBeLessThan(96);
  expect(text).toContain("worked out here");
});

test("every value on the board opens its source", async ({ page }) => {
  await stubTiles(page);
  await page.goto("/missions");
  const board = page.getByTestId("iss-board");
  for (const name of ["ISS position", "ISS height", "ISS speed", "ISS sunlight"]) {
    await board.getByRole("button", { name: new RegExp(`^${name}`) }).click();
    await expect(page.getByRole("dialog", { name: new RegExp(`Source: ${name}`) })).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

test("a trail builds up behind the station, and Follow toggles", async ({ page }) => {
  await stubTiles(page);
  // Two readings a little apart, so the trail has a line to draw.
  let n = 0;
  await page.route("**/api/v2/iss", async (route) => {
    const r = await route.fetch();
    const body = await r.json();
    body.latitude = 10 + n * 0.5;
    body.longitude = 20 + n * 0.8;
    n++;
    await route.fulfill({ response: r, json: body });
  });
  await page.clock.install();
  await page.goto("/missions");
  await page.clock.runFor(100);
  const follow = page.getByTestId("iss-follow");
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect(follow).toHaveText("Following the station");
  for (let i = 0; i < 3; i++) await page.clock.runFor(5100);
  // Dashed line (ahead) and a solid trail (behind) are both drawn.
  await expect(page.getByTestId("iss-map").locator("path.leaflet-interactive[stroke-dasharray]").first()).toBeAttached();
  await expect(page.getByTestId("iss-map").locator("path.leaflet-interactive:not([stroke-dasharray])")).not.toHaveCount(0);
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await expect(follow).toHaveText("Follow the station");
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
});

test("the board and map pass the accessibility scan and say plainly when the position is unavailable", async ({ page }) => {
  await stubTiles(page);
  await page.goto("/missions");
  await expect(page.getByTestId("iss-board")).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  expect(await page.getByTestId("iss-board").innerText()).not.toMatch(/[–—]/);
  const w = page.viewportSize()!.width;
  expect(await page.evaluate((x) => document.documentElement.scrollWidth > x, w)).toBe(false);
});
