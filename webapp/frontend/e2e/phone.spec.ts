import { expect, test } from "@playwright/test";
import { ROUTES } from "./routes";

// The size sweep: every route at the two common phone sizes, a short phone held sideways (400x370, little height
// left under the top bar and tab bar) and a Chromebook screen (1366x768, mouse or touch). Phones run in the
// mobile project; the Chromebook size runs in the desktop project. `tap` is the smallest control allowed:
// 44 px for a finger on a phone, 24 px (WCAG 2.2 AA) at laptop size.
const SIZES = [
  { width: 375, height: 812, project: "mobile", tap: 43.5 },
  { width: 390, height: 844, project: "mobile", tap: 43.5 },
  { width: 400, height: 370, project: "mobile", tap: 43.5 },
  { width: 1366, height: 768, project: "desktop", tap: 23.5 },
];
const TAP = "button, [role=button], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea, .btn, nav a, .tabbar-item";

for (const size of SIZES) {
  test.describe(`${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    for (const route of ROUTES) {
      test(`${route} fits, clears the tab bar and has big enough tap targets`, async ({ page }, info) => {
        test.skip(info.project.name !== size.project, `${size.width}x${size.height} runs in the ${size.project} project`);
        await page.goto(route);
        // Not "networkidle": the home page's ISS tile polls, so the network is never idle there.
        await page.locator("h1").first().waitFor();
        await page.waitForTimeout(500);

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `horizontal overflow on ${route}`).toBeLessThanOrEqual(0);

        // The last thing on the page must be reachable above the bottom tab bar.
        await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
        const gap = await page.evaluate(() => {
          const bar = document.querySelector(".tabbar");
          // The tab bar only exists on a phone; at laptop size it is not drawn, so nothing can be covered.
          if (!bar || getComputedStyle(bar).display === "none") return 0;
          const tab = bar.getBoundingClientRect();
          const last = document.querySelector("main footer")?.getBoundingClientRect();
          return last ? tab.top - last.bottom : 0;
        });
        expect(gap, `content is covered by the tab bar on ${route}`).toBeGreaterThanOrEqual(0);

        const small = await page.evaluate(([sel, tap]) => {
          const out: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>(sel)) {
            let r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            // A control may enlarge its tappable area with an absolutely positioned ::after (inline "i" buttons).
            const after = getComputedStyle(el, "::after");
            if (after.content !== "none" && after.position === "absolute") {
              r = { width: Math.max(r.width, parseFloat(after.width) || 0), height: Math.max(r.height, parseFloat(after.height) || 0) } as DOMRect;
            }
            if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || el.closest("[hidden]")) continue;
            if (el.matches(".skip-link, [tabindex='-1']")) continue;
            // Planets on the top-down maps sit close together, so their targets are 24 px (WCAG 2.2 AA minimum).
            const min = el.closest(".orbit-map") ? 23.5 : tap;
            if (r.height < min || r.width < min) out.push(`${el.tagName.toLowerCase()} "${(el.innerText || el.getAttribute("aria-label") || "").slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
          return out;
        }, [TAP, size.tap] as const);
        expect(small, `tap targets under 44px on ${route}`).toEqual([]);
      });
    }
  });
}

// A short screen (a phone held sideways) leaves little room: the More sheet and the units sheet must still fit,
// or scroll, so every option can be reached and the close button stays on screen.
test.describe("sheets on a short screen (400x370)", () => {
  test.use({ viewport: { width: 400, height: 370 } });

  async function inViewport(page: import("@playwright/test").Page, locator: import("@playwright/test").Locator, what: string) {
    const box = await locator.boundingBox();
    expect(box, `${what} has a box`).not.toBeNull();
    const vp = page.viewportSize()!;
    expect(box!.y, `${what} top is on screen`).toBeGreaterThanOrEqual(-0.5);
    expect(box!.y + box!.height, `${what} bottom is on screen`).toBeLessThanOrEqual(vp.height + 0.5);
  }

  for (const [name, open, dialog] of [
    ["More", async (p: import("@playwright/test").Page) => p.getByRole("button", { name: "More" }).click(), "More"],
    ["Units", async (p: import("@playwright/test").Page) => p.getByTestId("units-button").click(), "Units"],
  ] as const) {
    test(`the ${name} sheet fits, its close control is reachable and every option can be scrolled to`, async ({ page }, info) => {
      test.skip(info.project.name !== "mobile", "phone only");
      await page.goto("/");
      await page.locator("h1").first().waitFor();
      await open(page);
      const sheet = page.getByRole("dialog", { name: dialog });
      await expect(sheet).toBeVisible();
      // The sheet slides up (24 px); measure where it ends up, not where it starts.
      await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      await inViewport(page, sheet, `${name} sheet`);
      const close = sheet.getByRole("button", { name: /close/i }).first();
      await expect(close).toBeVisible();
      await inViewport(page, close, `${name} close button`);
      // Every control in the sheet can be brought into view by scrolling the sheet.
      const controls = sheet.locator("a, button, input, select");
      const n = await controls.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        await controls.nth(i).scrollIntoViewIfNeeded();
        await inViewport(page, controls.nth(i), `${name} control ${i}`);
      }
      // Nothing in the sheet runs off the side: its text wraps.
      const sideways = await sheet.locator(".sheet-inner").evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(sideways, `${name} sheet scrolls sideways`).toBeLessThanOrEqual(1);
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
    });
  }
});

// The same at Chromebook size, where the sheets are centred panels.
test("the Units sheet wraps its text at Chromebook size", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "laptop size");
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await page.getByTestId("units-button").click();
  const sheet = page.getByRole("dialog", { name: "Units" });
  await expect(sheet).toBeVisible();
  const sideways = await sheet.locator(".sheet-inner").evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(sideways).toBeLessThanOrEqual(1);
});
