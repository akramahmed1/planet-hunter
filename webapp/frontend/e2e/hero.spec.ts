import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// T30: the home globe. A still SVG globe is the first paint and the fallback; the 3D version replaces it when it can.

async function hasWebGL(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    try { return !!document.createElement("canvas").getContext("webgl"); } catch { return false; }
  });
}

test("the still globe is there first, says where the ISS is, and the layout does not move when 3D arrives", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const hero = page.getByTestId("earth-hero");
  await expect(hero).toBeVisible();
  const before = await hero.boundingBox();
  const svg = page.getByTestId("earth-svg");
  await expect(svg).toHaveAttribute("aria-label", /A stylised globe with a grid line every 30 degrees\. The ISS is now over \d+\.\d° [NS], \d+\.\d° [EW], \d+ km up\./);
  if (await hasWebGL(page)) await expect(hero).toHaveAttribute("data-mode", "3d", { timeout: 20_000 });
  const after = await hero.boundingBox();
  expect(after).toEqual(before);
  const w = page.viewportSize()!.width;
  expect(await page.evaluate((x) => document.documentElement.scrollWidth > x, w)).toBe(false);
});

test("a pause button stops the motion and turns it back on", async ({ page }) => {
  await page.goto("/");
  test.skip(!(await hasWebGL(page)), "this browser has no WebGL");
  const hero = page.getByTestId("earth-hero");
  await expect(hero).toHaveAttribute("data-mode", "3d", { timeout: 20_000 });
  const pause = page.getByTestId("earth-pause");
  await expect(pause).toHaveText("Pause motion");
  await pause.click();
  await expect(pause).toHaveAttribute("aria-pressed", "true");
  await expect(pause).toHaveText("Play motion");
  await pause.click();
  await expect(pause).toHaveAttribute("aria-pressed", "false");
});

test("with reduced motion the globe stays a still picture and three.js is never fetched", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const scripts: string[] = [];
  page.on("request", (r) => { if (r.resourceType() === "script") scripts.push(r.url()); });
  await page.goto("/");
  await expect(page.getByTestId("earth-svg")).toBeVisible();
  await page.waitForTimeout(3500); // longer than the idle wait before 3D would start
  await expect(page.getByTestId("earth-hero")).toHaveAttribute("data-mode", "svg");
  await expect(page.getByTestId("earth-pause")).toBeHidden();
  expect(await page.locator(".earth-hero canvas").count()).toBe(0);
  // The 3D scene is its own chunk (it carries this class name); the page would have asked for it by now if it were going to.
  const bodies = await Promise.all(scripts.map((u) => page.request.get(u).then((r) => r.text()).catch(() => "")));
  expect(bodies.some((b) => b.includes("earth-scene-3d"))).toBe(false);
});

test("without WebGL the still globe stays and the page has no errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/.test(type)) return null;
      return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest) as never;
    } as never;
  });
  await page.goto("/");
  await expect(page.getByTestId("earth-svg")).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(page.getByTestId("earth-hero")).toHaveAttribute("data-mode", "svg");
  expect(errors).toEqual([]);
});

test("if the 3D chunk fails to load the still globe stays", async ({ page }) => {
  // Break exactly the chunk that holds the 3D scene (the one that carries its class name) and leave the rest alone.
  await page.route("**/_next/static/**/*.js", async (route) => {
    const res = await route.fetch();
    if ((await res.text()).includes("earth-scene-3d")) return route.abort();
    return route.fulfill({ response: res });
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByTestId("earth-svg")).toBeVisible();
  await page.waitForTimeout(3500);
  await expect(page.getByTestId("earth-hero")).toHaveAttribute("data-mode", "svg");
  await expect(page.getByTestId("earth-svg")).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("the globe passes the accessibility scan and its words are plain", async ({ page }) => {
  await page.goto("/");
  // Once 3D takes over, the still globe is hidden (and so out of the scan); either way its words stay in the page.
  await expect(page.getByTestId("earth-svg")).toHaveAttribute("aria-label", /^A stylised globe/);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  const label = await page.getByTestId("earth-svg").getAttribute("aria-label");
  expect(label).not.toMatch(/[–—]/);
});
