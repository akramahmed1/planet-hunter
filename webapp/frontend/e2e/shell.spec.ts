import { expect, test } from "@playwright/test";
import { CANDIDATES, ROUTES } from "./routes";

const isMobile = (name: string) => name.startsWith("mobile");

test("every page fits the screen width without sideways scrolling", async ({ page }) => {
  for (const route of ROUTES) {
    await page.goto(route);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow on ${route}`).toBeLessThanOrEqual(0);
  }
});

test("phone shows the bottom tab bar; desktop shows the top nav", async ({ page }, info) => {
  await page.goto("/");
  const tabbar = page.getByRole("navigation", { name: "Sections" });
  const topnav = page.getByRole("navigation", { name: "Primary" });
  if (isMobile(info.project.name)) {
    await expect(tabbar).toBeVisible();
    await expect(topnav).toBeHidden();
    await expect(tabbar.getByRole("link")).toHaveText(["Explore", "Solar System", "Exoplanets", "Hunt"]);
    await expect(tabbar.getByRole("button", { name: "More" })).toBeVisible();
  } else {
    await expect(topnav).toBeVisible();
    await expect(tabbar).toBeHidden();
    await expect(topnav.getByRole("link")).toHaveCount(8);
  }
});

test("the current section is marked in the navigation", async ({ page }, info) => {
  await page.goto(`/candidates/${CANDIDATES[0].slug}`);
  const nav = page.getByRole("navigation", { name: isMobile(info.project.name) ? "Sections" : "Primary" });
  await expect(nav.getByRole("link", { name: "Hunt" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Explore" })).not.toHaveAttribute("aria-current", "page");
});

test("More sheet opens, closes with Escape and returns focus", async ({ page }, info) => {
  test.skip(!isMobile(info.project.name), "the More tab exists on phones only");
  await page.goto("/");
  const more = page.getByRole("button", { name: "More" });
  await more.click();
  const sheet = page.getByRole("dialog", { name: "More" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link")).toHaveText([/Missions/, /Learn/, /Method/, /Classroom/]);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(more).toBeFocused();
});

test("navigating from the More sheet closes it and marks More active", async ({ page }, info) => {
  test.skip(!isMobile(info.project.name), "the More tab exists on phones only");
  await page.goto("/");
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("dialog", { name: "More" }).getByRole("link", { name: "Method" }).click();
  await expect(page).toHaveURL(/\/method$/);
  await expect(page.getByRole("dialog", { name: "More" })).toBeHidden();
  await expect(page.getByRole("button", { name: "More" })).toHaveAttribute("aria-current", "page");
});

test("every section is built: no coming-soon tags or placeholders are left", async ({ page }) => {
  for (const [route, title] of [["/learn", "Learn"], ["/classroom", "Classroom"]]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.getByRole("main").getByText("Coming soon", { exact: true })).toHaveCount(0);
  }
  await expect(page.getByText("Soon", { exact: true })).toHaveCount(0);
  await expect(page.getByText("(coming soon)")).toHaveCount(0);
});

test("skip link moves focus to the main content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await skip.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();
});

test("reduced motion turns animation off", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/design-system");
  const durations = await page.evaluate(() => [
    getComputedStyle(document.body, "::after").animationDuration,
    getComputedStyle(document.querySelector(".skeleton")!).animationDuration,
  ]);
  expect(durations).toEqual(["0s", "0s"]);
});

test("the build identifier is published in a meta tag", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="ph-build"]')).toHaveAttribute("content", /.+/);
});

test("top bar links stay on one line down to 1024 px", async ({ page }, info) => {
  test.skip(isMobile(info.project.name), "desktop top bar");
  for (const width of [1024, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    const heights = await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link")
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(Math.max(...heights), `a nav link wrapped at ${width}px`).toBeLessThan(40);
    const bar = await page.locator(".topbar-inner").evaluate((e) => [e.scrollWidth, e.clientWidth]);
    expect(bar[0], `top bar overflows at ${width}px`).toBeLessThanOrEqual(bar[1]);
    const units = await page.getByTestId("units-button").evaluate((e) => e.getBoundingClientRect().height);
    expect(units).toBeLessThan(44);
  }
});
