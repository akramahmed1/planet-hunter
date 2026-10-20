import { expect, test, type Page } from "@playwright/test";

// External map tiles and the Aladin Lite script are stubbed so these tests never depend on third-party servers.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function stubExternals(page: Page, seen: { aladin?: Record<string, unknown> } = {}) {
  await page.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.route(/aladin\.cds\.unistra\.fr\/AladinLite\/api\/v3\/[^/]+\/aladin\.js/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `window.A = { init: Promise.resolve(), aladin: (el, opts) => { window.__aladin = opts;
        el.setAttribute("data-aladin", "ready"); } };`,
    }),
  );
  return seen;
}

function collectCspViolations(page: Page): string[] {
  const out: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/.test(m.text())) out.push(m.text());
  });
  return out;
}

test("the exoplanets page lists our 8 target systems", async ({ page }) => {
  await page.goto("/exoplanets");
  const list = page.getByTestId("target-list");
  await expect(list.getByRole("listitem")).toHaveCount(8);
  await expect(list.getByRole("link", { name: "TOI 700" })).toBeVisible();
  await expect(list).toContainText("4 confirmed planets");
  await expect(list).toContainText("1 confirmed planet ·");
});

test("a system view shows the habitable zone and opens planet and star cards", async ({ page }) => {
  await stubExternals(page);
  await page.goto("/exoplanets/toi-700");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("TOI 700 system");
  // Switch to the map for stable, labelled tap targets.
  await page.getByRole("radio", { name: "Flat map view" }).check();
  await expect(page.getByTestId("habitable-zone")).toBeAttached();
  await expect(page.getByTestId("system-note")).toContainText("to scale");

  await page.getByTestId("pick-star").click();
  const star = page.getByRole("dialog", { name: "TOI 700 (the star)" });
  await expect(star.getByTestId("star-distance")).toHaveText(/light years$/);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "d", exact: true }).click();
  const d = page.getByRole("dialog", { name: "TOI-700 d" });
  await expect(d.getByText("Confirmed planet")).toBeVisible();
  await expect(d.getByText("Average distance is inside the conservative zone")).toBeVisible();
  await expect(d.getByTestId("planet-temp")).toHaveText(/°F$/);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Our signal" }).click();
  const ours = page.getByRole("dialog", { name: "TOI 700 pipeline signal" });
  await expect(ours.getByText("Pipeline signal, not a planet")).toBeVisible();
  await expect(ours).toContainText("never a discovery");
});

test("candidate pages link to the system and show where the star is in the sky", async ({ page }) => {
  await stubExternals(page);
  await page.goto("/candidates/toi-700");
  await expect(page.getByTestId("sky-coords")).toHaveText("RA 06h 28m 23.2s · Dec -65° 34′ 46″");
  await page.getByTestId("sky-show").click();
  await expect(page.getByTestId("sky-view")).toHaveAttribute("data-aladin", "ready");
  const opts = await page.evaluate(() => (window as unknown as { __aladin: Record<string, unknown> }).__aladin);
  expect(opts.target).toBe("97.0967865903209 -65.5793115481931");
  expect(opts.survey).toBe("P/DSS2/color");
  await page.getByTestId("system-link").click();
  await expect(page).toHaveURL(/\/exoplanets\/toi-700$/);
});

test("the missions page shows the live ISS map and four spacecraft", async ({ page }) => {
  await stubExternals(page);
  const csp = collectCspViolations(page);
  await page.goto("/missions");
  await expect(page.getByTestId("iss-map").locator(".leaflet-tile-pane")).toBeAttached();
  await expect(page.getByTestId("iss-readout")).toContainText("mi up");
  await expect(page.getByTestId("iss-map").locator("path.leaflet-interactive").first()).toBeAttached();
  for (const id of ["tess", "jwst", "voyager1", "voyager2"]) {
    const card = page.getByTestId(`craft-${id}`);
    await expect(card.getByTestId("from-earth")).toHaveText(/ mi$/);
    await expect(card.getByTestId("light-time")).not.toBeEmpty();
  }
  await expect(page.getByTestId("craft-voyager1")).toContainText("September 5, 1977");
  // A fact the source does not list is left out, not shown as a gap.
  await expect(page.getByTestId("craft-jwst")).not.toContainText("Not listed");
  await expect(page.getByText("OpenStreetMap")).toBeVisible();
  expect(csp).toEqual([]);
});

test("the TESS explainer cites its facts and draws a transit", async ({ page }) => {
  const csp = collectCspViolations(page);
  await page.goto("/missions/tess");
  for (const h of ["1. A long, looping orbit", "2. Four cameras, one strip of sky", "3. Staring for 27 days",
    "4. From a shadow to a light curve"]) {
    await expect(page.getByRole("heading", { name: h })).toBeVisible();
  }
  await expect(page.getByTestId("tess-model")).toHaveAttribute("data-model", "nasa", { timeout: 20_000 });
  await expect(page.getByTestId("model-credit")).toContainText("NASA 3D Resources");
  const slider = page.getByTestId("transit-slider");
  await slider.fill("500");
  await expect(page.getByTestId("transit-readout")).toContainText("99.764%");
  await slider.fill("0");
  await expect(page.getByTestId("transit-readout")).toContainText("100.000%");
  // Scrolling after using the slider must not move the planet again.
  await page.getByTestId("transit-slider").evaluate((el) => el.closest(".transit-demo")!.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(300);
  await expect(page.getByTestId("transit-readout")).toContainText("100.000%");
  await page.getByRole("button", { name: "TESS sector size: show source" }).click();
  await expect(page.getByRole("dialog", { name: "Source: TESS sector size" }).getByRole("link"))
    .toHaveAttribute("href", "https://tess.mit.edu/observations/");
  expect(csp).toEqual([]);
});

test("every page sends a Content Security Policy that names only the needed hosts", async ({ request }) => {
  const res = await request.get("/missions");
  const csp = res.headers()["content-security-policy"];
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("https://tile.openstreetmap.org");
  expect(csp).toContain("https://aladin.cds.unistra.fr");
  expect(csp).not.toContain("*;");
  expect(csp).not.toMatch(/(^|\s)\*(\s|;|$)/);
});

// Aladin Lite fetches its own data: URLs; connect-src must allow them (a violation left the viewer blank).
for (const path of ["/exoplanets/toi-700", "/exoplanets/toi-270", "/candidates/toi-270"]) {
  test(`${path} allows data: fetches for the sky viewer and logs no CSP violation`, async ({ page }) => {
    await stubExternals(page);
    const violations = collectCspViolations(page);
    const res = await page.goto(path);
    expect(res?.headers()["content-security-policy"]).toMatch(/connect-src [^;]*\bdata:/);
    const ok = await page.evaluate(async () => (await fetch("data:text/plain;base64,aGk=")).text());
    expect(ok).toBe("hi");
    const sky = page.getByTestId("sky-show");
    if (await sky.count()) await sky.click();
    await page.waitForTimeout(300);
    expect(violations).toEqual([]);
  });
}
