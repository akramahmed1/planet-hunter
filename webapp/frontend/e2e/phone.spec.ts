import { expect, test } from "@playwright/test";
import { ROUTES } from "./routes";

// The phone-width sweep: every route at the two common phone sizes. Run in the mobile project only.
const SIZES = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
];
const TAP = "button, [role=button], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea, .btn, nav a, .tabbar-item";

for (const size of SIZES) {
  test.describe(`${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    for (const route of ROUTES) {
      test(`${route} fits, clears the tab bar and has big enough tap targets`, async ({ page }, info) => {
        test.skip(info.project.name !== "mobile", "phone sizes only");
        await page.goto(route);
        // Not "networkidle": the home page's ISS tile polls, so the network is never idle there.
        await page.locator("h1").first().waitFor();
        await page.waitForTimeout(500);

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `horizontal overflow on ${route}`).toBeLessThanOrEqual(0);

        // The last thing on the page must be reachable above the bottom tab bar.
        await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
        const gap = await page.evaluate(() => {
          const tab = document.querySelector(".tabbar")?.getBoundingClientRect();
          const last = document.querySelector("main footer")?.getBoundingClientRect();
          return tab && last ? tab.top - last.bottom : 0;
        });
        expect(gap, `content is covered by the tab bar on ${route}`).toBeGreaterThanOrEqual(0);

        const small = await page.evaluate((sel) => {
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
            if (r.height < 43.5 || r.width < 43.5) out.push(`${el.tagName.toLowerCase()} "${(el.innerText || el.getAttribute("aria-label") || "").slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
          return out;
        }, TAP);
        expect(small, `tap targets under 44px on ${route}`).toEqual([]);
      });
    }
  });
}
