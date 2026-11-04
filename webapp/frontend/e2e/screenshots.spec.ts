import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { CANDIDATES, ROUTES } from "./routes";

// Screenshot suite (launch task T01). Run only through the screenshots-phone and screenshots-laptop
// projects (SCREENSHOTS=1). Every route is captured full page; SHOT_LABEL names the run ("before" or
// "after" a change), so two runs can be compared side by side. This suite never asserts on the look,
// it makes the look reviewable: the files are uploaded as a CI artifact.
const label = process.env.SHOT_LABEL ?? "after";

// Routes that are not in the shared ROUTES list but matter visually: the signed-out classroom entry
// and a page that does not exist (the nav label "Hunt" has no /hunt route yet, see launch task T10).
const EXTRA = ["/hunt", "/candidates/not-a-real-candidate"];

const slugFor = (route: string) => (route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "__"));

test.describe("screenshots", () => {
  for (const route of [...new Set([...ROUTES, ...EXTRA])]) {
    test(route, async ({ page }, info) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(route, { waitUntil: "load" });
      // Live widgets keep polling, so "idle" may never come: wait a few seconds at most, then settle.
      await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => undefined);
      // Fonts and lazy panels settle; hover state and caret must not leak into the picture.
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(0, 0);
      const dir = join("screenshots", label, info.project.name);
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: join(dir, `${slugFor(route)}.png`), fullPage: true });
    });
  }
});

// Keep the candidate list import used so a missing results file fails loudly here too.
test("candidate list is available", () => {
  if (CANDIDATES.length === 0) throw new Error("no candidates in results.json");
});
