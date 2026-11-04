import { expect, test } from "@playwright/test";
import { CANDIDATES } from "./routes";

// WCAG 2.2 "Focus Not Obscured": a control that is scrolled or tabbed into view must not end up hidden behind the sticky
// top bar or the fixed tab bar. Found while testing T20: scrolling a control "into view" could park it under the tab bar.

const PAGES = ["/", "/learn", "/candidates", `/candidates/${CANDIDATES[0].slug}`, "/method", "/classroom"];

for (const path of PAGES) {
  test(`${path}: focusing any control in the page leaves it clear of the top and tab bars`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("domcontentloaded");
    await page.locator("main a[href], main button, main input, main select, main summary").first().waitFor();
    const hidden = await page.evaluate(async () => {
      const bars = ["header.topbar, .topbar", ".tabbar"].map((q) => document.querySelector(q)).filter((e): e is Element => !!e);
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
      };
      const bad: string[] = [];
      const controls = [...document.querySelectorAll<HTMLElement>("main a[href], main button, main input, main select, main summary")]
        .filter((e) => visible(e) && !e.closest("[hidden]"));
      for (const el of controls.slice(0, 60)) {
        // The minimal scroll, from the top of the page: what tabbing and "scroll into view" do. (A plain focus() centres
        // the control, which hides the problem.)
        window.scrollTo({ top: 0, behavior: "instant" });
        el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const r = el.getBoundingClientRect();
        for (const bar of bars) {
          if (getComputedStyle(bar).display === "none") continue;
          const b = bar.getBoundingClientRect();
          const overlap = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
          if (overlap > r.height * 0.5) bad.push(`${(el.textContent || el.tagName).trim().slice(0, 30)} under ${bar.className}`);
        }
      }
      return bad;
    });
    expect(hidden).toEqual([]);
  });
}
