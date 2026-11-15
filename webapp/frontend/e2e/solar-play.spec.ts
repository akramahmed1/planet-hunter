import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// T31: play the orbits (planets move along their drawn paths by elapsed time) and zoom to a planet.

async function openMap(page: Page) {
  await page.goto("/solar-system");
  await page.getByRole("radio", { name: "Flat map view" }).check();
  await expect(page.getByTestId("orbit-map")).toBeVisible();
}

const earthAt = (page: Page) =>
  page.getByTestId("map-body-earth").locator("circle").last().evaluate((c) => [Number(c.getAttribute("cx")), -Number(c.getAttribute("cy"))]);
const dateShown = (page: Page) => page.getByTestId("date-input").inputValue();

test("play moves the date forward and the planets along their orbits, then pause loads the exact positions", async ({ page }) => {
  await openMap(page);
  // Start from a computed date: today's positions come from Horizons (a saved sample in these tests), and the date is
  // checked against the server's computed positions below.
  await page.getByTestId("date-input").fill("2026-03-01");
  await expect(page.getByText("(loading)")).toHaveCount(0);
  await expect.poll(async () => (await earthAt(page))[0], { timeout: 8000 }).toBeCloseTo(-0.9312, 2);
  const date0 = await dateShown(page);
  const before = await earthAt(page);
  await page.getByTestId("play-toggle").click();
  await expect(page.getByTestId("play-toggle")).toHaveText("Pause");
  await expect.poll(async () => dateShown(page), { timeout: 8000 }).not.toBe(date0);
  await page.waitForTimeout(1500);

  // While it plays, what is drawn for the date shown is within a day's travel of where the server puts Earth.
  // Read the date and the position in one go, so a slow machine cannot let the picture move on between the two reads.
  const { shown, at } = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="map-body-earth"]')!.querySelectorAll("circle");
    const last = c[c.length - 1];
    return {
      shown: (document.querySelector('[data-testid="date-input"]') as HTMLInputElement).value,
      at: [Number(last.getAttribute("cx")), -Number(last.getAttribute("cy"))],
    };
  });
  const api = await (await page.request.get(`/api/v2/positions?date=${shown}`)).json();
  const earth = api.bodies.find((b: { id: string }) => b.id === "earth");
  const r = Math.hypot(earth.x_au, earth.y_au);
  expect(Math.hypot(at[0] - earth.x_au, at[1] - earth.y_au) / r, "Earth while playing").toBeLessThan(0.025);
  expect(Math.hypot(at[0] - before[0], at[1] - before[1])).toBeGreaterThan(0.01); // and it did move

  await page.getByTestId("play-toggle").click();
  await expect(page.getByTestId("play-toggle")).toHaveText("Play the orbits");
  const stopped = await dateShown(page);
  // Once stopped, the exact positions for that date replace the played ones.
  await expect.poll(async () => {
    const e = await earthAt(page);
    const exact = await (await page.request.get(`/api/v2/positions?date=${stopped}`)).json();
    const ee = exact.bodies.find((b: { id: string }) => b.id === "earth");
    return Math.hypot(e[0] - ee.x_au, e[1] - ee.y_au);
  }, { timeout: 8000 }).toBeLessThan(1e-4);
});

test("changing the date by hand, or choosing Measure, stops the play", async ({ page }) => {
  await openMap(page);
  const today = await dateShown(page);
  await page.getByTestId("play-toggle").click();
  await expect(page.getByTestId("play-toggle")).toHaveText("Pause");
  await expect.poll(() => dateShown(page), { timeout: 8000 }).not.toBe(today); // the Today button is off until the date moves
  await page.getByRole("button", { name: "Today" }).click();
  await expect(page.getByTestId("play-toggle")).toHaveText("Play the orbits");

  await page.getByTestId("play-toggle").click();
  await expect(page.getByTestId("play-toggle")).toHaveText("Pause");
  await page.getByRole("radio", { name: /^Measure/ }).check();
  await expect(page.getByTestId("play-toggle")).toHaveText("Play the orbits");
  await expect(page.getByTestId("play-toggle")).toBeDisabled();
  await expect(page.getByTestId("play-note")).toContainText("Play is off while you measure");
});

test("opening a planet's card pauses the play", async ({ page }) => {
  await openMap(page);
  await page.getByTestId("play-toggle").click();
  await expect(page.getByTestId("play-toggle")).toHaveText("Pause");
  await page.getByTestId("pick-mars").click();
  await expect(page.getByRole("dialog", { name: "Mars" })).toBeVisible();
  await expect(page.getByTestId("play-toggle")).toHaveText("Play the orbits");
});

test("play stops by itself at the last date the page can show", async ({ page }) => {
  await openMap(page);
  const last = (await page.getByTestId("date-input").getAttribute("max"))!;
  const near = new Date(Date.parse(`${last}T00:00:00Z`) - 3 * 86_400_000).toISOString().slice(0, 10);
  await page.getByTestId("date-input").fill(near);
  await expect.poll(() => dateShown(page)).toBe(near);
  await page.getByRole("radio", { name: "1 month a second" }).check();
  await page.getByTestId("play-toggle").click();
  await expect(page.getByTestId("play-toggle")).toHaveText("Play the orbits", { timeout: 8000 });
  expect(await dateShown(page)).toBe(last);
});

test("zoom to a planet works in the map, and Zoom out brings the whole view back", async ({ page }) => {
  await openMap(page);
  const width = () => page.getByTestId("orbit-map").evaluate((s) => (s as SVGSVGElement).viewBox.baseVal.width);
  const whole = await width();
  await page.getByTestId("pick-mars").click();
  await page.getByTestId("zoom-to").click();
  await expect(page.getByRole("dialog", { name: "Mars" })).toBeHidden();
  await expect(page.getByTestId("zoom-out")).toBeVisible();
  expect(await width()).toBeLessThan(whole / 3);
  await expect(page.getByTestId("play-note")).toContainText("Zoomed to Mars");
  await page.getByTestId("zoom-out").click();
  await expect(page.getByTestId("zoom-out")).toHaveCount(0);
  expect(await width()).toBeCloseTo(whole, 3);
});

test("zoom to a planet in 3D flies the camera in, and Zoom out frames everything again", async ({ page }) => {
  await page.goto("/solar-system");
  test.skip(!(await page.evaluate(() => { try { return !!document.createElement("canvas").getContext("webgl"); } catch { return false; } })), "no WebGL");
  const canvas = page.locator('[data-testid="scene-3d"][data-ready="true"] canvas');
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  const dist = async () => Number(await canvas.getAttribute("data-view-distance"));
  await expect.poll(dist).toBeGreaterThan(1.5);
  await page.getByTestId("pick-mars").click();
  await page.getByTestId("zoom-to").click();
  await expect.poll(dist, { timeout: 8000 }).toBeLessThan(0.2);
  await page.getByTestId("zoom-out").click();
  await expect.poll(dist, { timeout: 8000 }).toBeGreaterThan(1.5);
});

test("with reduced motion, zoom to a planet jumps straight in", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/solar-system");
  test.skip(!(await page.evaluate(() => { try { return !!document.createElement("canvas").getContext("webgl"); } catch { return false; } })), "no WebGL");
  const canvas = page.locator('[data-testid="scene-3d"][data-ready="true"] canvas');
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("pick-mars").click();
  await page.getByTestId("zoom-to").click();
  await expect.poll(async () => Number(await canvas.getAttribute("data-view-distance")), { timeout: 3000 }).toBeLessThan(0.2);
});

test("the play controls pass the accessibility scan and say what they do", async ({ page }) => {
  await openMap(page);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  await expect(page.getByTestId("play-controls")).toHaveAccessibleName("Orbit play");
  await expect(page.getByRole("group", { name: "Speed (time a second)" })).toBeVisible();
  expect(await page.getByTestId("play-controls").innerText()).not.toMatch(/[–—]/);
});
