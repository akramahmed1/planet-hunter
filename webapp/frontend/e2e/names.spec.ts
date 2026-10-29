import { expect, test } from "@playwright/test";

// Accessible names: every body button says which body it is (not ".02"), and the segmented controls'
// radios have names that contain the words you see on them (WCAG 2.5.3 label in name).
test("planet buttons carry the full planet name, never a stripped fragment", async ({ page }) => {
  for (const [slug, names] of [
    ["toi-216", ["Star", "TOI-216.02", "TOI-216.01"]],
    ["toi-700", ["Star", "TOI-700 b", "TOI-700 c", "TOI-700 e", "TOI-700 d"]],
    ["toi-1338", ["Star", "TOI-1338 b", "TOI-1338 c"]],
  ] as const) {
    await page.goto(`/exoplanets/${slug}`);
    const buttons = page.getByRole("group", { name: "Choose a body" }).getByRole("button");
    await expect(buttons.first()).toBeVisible();
    const texts = (await buttons.allInnerTexts()).map((t) => t.trim());
    for (const t of texts) expect(t, `${slug}: button "${t}"`).not.toMatch(/^[.\d]/);
    if (names) {
      // The star and the confirmed planets, in order. Our own signal sits among them by orbit size.
      expect(texts.filter((t) => t !== "Our signal")).toEqual([...names]);
    }
  }
});

test("segmented controls: each radio's name contains its visible label", async ({ page }) => {
  for (const route of ["/exoplanets/toi-700", "/solar-system"]) {
    await page.goto(route);
    // The page's own controls (view, fit, mode). The units menu in the header is a different control.
    await page.locator("main .toggle-option").first().waitFor({ state: "attached" });
    const radios = await page.locator("main .toggle-option").evaluateAll((labels) =>
      labels.map((l) => ({
        shown: (l.querySelector("span")?.textContent ?? "").trim(),
        name: (l.querySelector("input")?.getAttribute("aria-label") ?? "").trim(),
      })),
    );
    expect(radios.length, `${route} has segmented controls`).toBeGreaterThan(1);
    for (const r of radios) {
      expect(r.name, `${route}: radio "${r.shown}" has an accessible name`).not.toBe("");
      expect(r.name.toLowerCase(), `${route}: name "${r.name}" contains "${r.shown}"`).toContain(r.shown.toLowerCase());
    }
  }
});
