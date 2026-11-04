import { expect, test } from "@playwright/test";

// A 3D view never starts as an empty dark box. While three.js loads, the flat map is on screen, with a
// "Loading the 3D view" note; once the scene has drawn its first frame the note goes away.
for (const [path, viewport] of [
  ["/solar-system", "solar-viewport"],
  ["/exoplanets/toi-700", "solar-viewport"],
] as const) {
  test(`${path}: the panel shows the map and a loading note, then the 3D scene`, async ({ page }) => {
    await page.goto(path, { waitUntil: "commit" });
    const box = page.locator(`.${viewport}`);
    await expect(box).toBeVisible();
    // The panel is never empty: the flat map is drawn straight away.
    await expect(box.locator("svg").first()).toBeVisible();
    const webglOk = await page.evaluate(() => {
      try { return !!document.createElement("canvas").getContext("webgl"); } catch { return false; }
    });
    test.skip(!webglOk, "this browser has no WebGL, so only the map is shown");
    // A 3D scene is on its way: the note is shown until the first frame, then it goes away.
    await expect(page.getByTestId(path === "/solar-system" ? "scene-3d" : "system-3d")).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
    await expect(box.getByRole("status")).toHaveCount(0);
  });
}

test("the TESS 3D model shows a loading note until it is ready", async ({ page }) => {
  await page.goto("/missions/tess", { waitUntil: "commit" });
  const webglOk = await page.evaluate(() => {
    try { return !!document.createElement("canvas").getContext("webgl"); } catch { return false; }
  });
  test.skip(!webglOk, "this browser has no WebGL");
  await expect(page.getByTestId("tess-model")).toHaveAttribute("data-model", /nasa|procedural/, { timeout: 30_000 });
  await expect(page.locator(".tess-model-wrap").getByRole("status")).toHaveCount(0);
});

// The flat map is the only view without WebGL, and the first thing seen while 3D loads: its bodies must be
// big enough to hit with a finger (24 px is the WCAG 2.2 AA minimum; planets sit close together, so no larger).
test("the flat exoplanet map has tap targets of at least 24 px", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "a phone-size check");
  await page.goto("/exoplanets/toi-700");
  const toggle = page.getByRole("radio", { name: "Flat map view" });
  if (await toggle.count()) await page.locator("label.toggle-option", { hasText: "Map" }).first().click();
  const map = page.getByTestId("system-map");
  await expect(map).toBeVisible();
  const sizes = await map.locator("g[role=button]").evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return `${e.getAttribute("aria-label")} ${Math.round(r.width)}x${Math.round(r.height)}`;
    }),
  );
  expect(sizes.length).toBeGreaterThanOrEqual(5);
  for (const s of sizes) {
    const [w, h] = s.split(" ").pop()!.split("x").map(Number);
    expect(Math.min(w, h), `tap target ${s}`).toBeGreaterThanOrEqual(23.5);
  }
});
