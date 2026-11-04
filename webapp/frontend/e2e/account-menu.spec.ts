import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

// The way in and out lives in the top bar while Classroom is on: "Sign in" when signed out, a small menu with
// "Sign out" when signed in. (Classroom is on in CI; with it off there is no account control at all.)

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const CSRF = { "X-PH-CSRF": "1" };

async function signedIn(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ locale: "en-US" });
  const r = await ctx.request.post("/api/v2/auth/teacher/signup", {
    data: { email: `acct${unique()}@school.example`, password: "correct horse battery", display_name: "Menu Tester", birth_month: 1,
      birth_year: 1990, org_name: `Menu School ${unique()}` },
    headers: CSRF,
  });
  expect(r.status(), await r.text()).toBeLessThan(300);
  return { ctx, page: await ctx.newPage() };
}

test("signed out, the top bar offers a way in to the three-door page", async ({ page }) => {
  await page.goto("/");
  const link = page.getByTestId("account-signin");
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/welcome");
  await expect(link).toHaveAccessibleName("Sign in");
  await link.click();
  await expect(page).toHaveURL(/\/welcome$/);
});

test("signed in, the menu shows who is signed in and signs out", async ({ browser }) => {
  const { ctx, page } = await signedIn(browser);
  await page.goto("/");
  const button = page.getByTestId("account-button");
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByTestId("account-menu");
  await expect(menu).toContainText("Signed in as a teacher");
  await expect(page.getByTestId("account-classroom")).toHaveAttribute("href", "/classroom");
  const axe = await new AxeBuilder({ page }).include('[data-testid="account-menu"]').analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);

  await page.keyboard.press("Escape"); // closes and gives the focus back
  await expect(menu).toHaveCount(0);
  await expect(button).toBeFocused();

  await button.click();
  await page.getByTestId("account-signout").click();
  await expect(page.getByTestId("account-signin")).toBeVisible();
  await expect(page.getByTestId("account-button")).toHaveCount(0);
  // The server really ended the session: a reload is still signed out.
  await page.reload();
  await expect(page.getByTestId("account-signin")).toBeVisible();
  await ctx.close();
});

test("the sign in button is a full size tap target and the top bar does not overflow", async ({ page }) => {
  await page.goto("/");
  const box = await page.getByTestId("account-signin").boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(24);
  expect(box!.height).toBeGreaterThanOrEqual(24);
  const bar = await page.locator(".topbar-inner").evaluate((e) => [e.scrollWidth, e.clientWidth]);
  expect(bar[0]).toBeLessThanOrEqual(bar[1]);
});

test("the status strip no longer shows through the top bar", async ({ page }) => {
  await page.goto("/");
  const alpha = await page.locator(".topbar").evaluate((e) => {
    const m = getComputedStyle(e).backgroundColor.match(/rgba?\(([^)]+)\)/);
    const parts = m![1].split(",").map((x) => parseFloat(x));
    return parts.length === 4 ? parts[3] : 1;
  });
  expect(alpha).toBeGreaterThanOrEqual(0.9);
});
