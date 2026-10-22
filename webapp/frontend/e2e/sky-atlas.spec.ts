import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { CANDIDATES } from "./routes";

// T36: the sky atlas on every candidate: choose the field of view, see the target marker and a one-arcminute ring.
// The Aladin Lite script is replaced by a recording stand-in, so these tests never depend on the CDS servers.

type Calls = { fov: number[]; markers: unknown[][]; circles: unknown[][]; catalogs: number; overlays: number; opts: Record<string, unknown> };

async function stubAladin(page: Page, variant: "full" | "bare" | "throws" = "full") {
  await page.route(/aladin\.cds\.unistra\.fr\/AladinLite\/api\/v3\/[^/]+\/aladin\.js/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
      const calls = { fov: [], markers: [], circles: [], catalogs: 0, overlays: 0, opts: {} };
      window.__calls = calls;
      const variant = ${JSON.stringify(variant)};
      window.A = {
        init: Promise.resolve(),
        aladin: (el, opts) => {
          calls.opts = opts; el.setAttribute("data-aladin", "ready");
          if (variant === "bare") return undefined;
          return {
            setFoV: (d) => { calls.fov.push(d); },
            addCatalog: () => { if (variant === "throws") throw new Error("no catalogs"); calls.catalogs++; },
            addOverlay: () => { if (variant === "throws") throw new Error("no overlays"); calls.overlays++; },
          };
        },
        marker: (...a) => { calls.markers.push(a); return {}; },
        catalog: () => ({ addSources: () => {} }),
        graphicOverlay: () => ({ add: () => {} }),
        circle: (...a) => { calls.circles.push(a); return {}; },
      };`,
    }),
  );
}
// A tap before the page has finished starting up is lost, so tap again until the viewer is there.
async function openSky(page: Page) {
  await expect(async () => {
    if (await page.getByTestId("sky-show").isVisible()) await page.getByTestId("sky-show").click();
    await expect(page.getByTestId("sky-view")).toHaveAttribute("data-aladin", "ready", { timeout: 2000 });
  }).toPass({ timeout: 15_000 });
}
const calls = (page: Page) => page.evaluate(() => (window as unknown as { __calls: Calls }).__calls);

test("every candidate page has the sky atlas, with its own coordinates", async ({ page }) => {
  await stubAladin(page);
  for (const c of CANDIDATES) {
    await page.goto(`/candidates/${c.slug}`);
    await expect(page.getByTestId("sky-panel"), c.slug).toBeVisible();
    await expect(page.getByTestId("sky-coords"), c.slug).toHaveText(/^RA \d\dh \d\dm \d\d\.\ds · Dec [-+]\d\d° \d\d′ \d\d″$/);
    await expect(page.getByTestId("sky-show"), c.slug).toBeVisible();
  }
});

test("the marker is on the star, the ring is one arcminute across, and the field starts at 30 arcminutes", async ({ page }) => {
  await stubAladin(page);
  await page.goto("/candidates/toi-700");
  await openSky(page);
  const c = await calls(page);
  expect(c.opts.fov).toBe(0.5);
  expect(c.opts.target).toBe("97.0967865903209 -65.5793115481931");
  expect(c.markers).toHaveLength(1);
  expect(c.markers[0][0]).toBeCloseTo(97.0967865903209, 9);
  expect(c.markers[0][1]).toBeCloseTo(-65.5793115481931, 9);
  expect(c.circles).toHaveLength(1);
  expect(c.circles[0][2]).toBeCloseTo(30 / 3600, 9); // radius 30 arcseconds: 1 arcminute across
  expect(c.catalogs).toBe(1);
  expect(c.overlays).toBe(1);
  await expect(page.getByTestId("sky-note")).toContainText("about 21 arcseconds");
});

test("the field of view buttons set the field and stay in step with it", async ({ page }) => {
  await stubAladin(page);
  await page.goto("/candidates/toi-700");
  await openSky(page);
  await expect(page.getByRole("group", { name: "Field of view" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "30 arcminutes across" })).toBeChecked();
  for (const [name, deg] of [["1 arcminute across", 1 / 60], ["2 degrees across", 2], ["5 arcminutes across", 5 / 60]] as const) {
    await page.getByRole("radio", { name }).check();
    await expect(page.getByRole("radio", { name })).toBeChecked();
    expect((await calls(page)).fov.at(-1)).toBeCloseTo(deg, 9);
  }
});

test("if the viewer has no overlay calls, or they fail, the sky picture and the buttons still work", async ({ page }) => {
  for (const variant of ["bare", "throws"] as const) {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await stubAladin(page, variant);
    await page.goto("/candidates/toi-700");
    await openSky(page);
    await expect(page.getByTestId("sky-panel").getByRole("alert")).toHaveCount(0); // no "could not be loaded" box
    await page.getByRole("radio", { name: "5 arcminutes across" }).check();
    await expect(page.getByRole("radio", { name: "5 arcminutes across" })).toBeChecked();
    expect(errors, variant).toEqual([]);
    await page.unroute(/aladin\.cds\.unistra\.fr\/AladinLite\/api\/v3\/[^/]+\/aladin\.js/);
  }
});

test("the exoplanet system pages get the same atlas, and the whole thing passes the accessibility scan", async ({ page }) => {
  await stubAladin(page);
  await page.goto("/exoplanets/toi-700");
  await openSky(page);
  await expect(page.getByRole("group", { name: "Field of view" })).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  expect(await page.getByTestId("sky-panel").innerText()).not.toMatch(/[–—]/);
});
