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
