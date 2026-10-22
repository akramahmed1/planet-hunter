import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

// T41: a watchlist and alert emails for signed-in people, and the unsubscribe page.

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const CSRF = { "X-PH-CSRF": "1" };

async function signedIn(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ locale: "en-US" });
  const r = await ctx.request.post("/api/v2/auth/teacher/signup", {
    data: { email: `watch${unique()}@school.example`, password: "correct horse battery", display_name: "Watcher", birth_month: 1,
      birth_year: 1990, org_name: `Watch School ${unique()}` },
    headers: CSRF,
  });
  expect(r.status(), await r.text()).toBeLessThan(300);
  return { ctx, page: await ctx.newPage() };
}

async function firstSlug(page: Page): Promise<string> {
  await page.goto("/candidates");
  const href = await page.locator('a[href^="/candidates/"]').first().getAttribute("href");
  return href!.replace("/candidates/", "");
}

test("signed out there is no watch button, and My watchlist says to sign in", async ({ page }) => {
  const slug = await firstSlug(page);
  await page.goto(`/candidates/${slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(500); // long enough for the button to have appeared if it were going to
  await expect(page.getByTestId("watch-box")).toHaveCount(0);
  await page.goto("/my-watchlist");
  await expect(page.getByText("Sign in to keep a watchlist")).toBeVisible();
});

test("a signed-in person watches a candidate, sees it listed, and stops watching", async ({ browser }) => {
  const { ctx, page } = await signedIn(browser);
  const slug = await firstSlug(page);
  await page.goto(`/candidates/${slug}`);
  const button = page.getByTestId("watch-button");
  await expect(button).toHaveText("Watch this candidate");
  await button.click();
  await expect(page.getByTestId("watch-note")).toContainText("Watching");
  await expect(button).toHaveText("Stop watching");

  await page.reload(); // it is remembered
  await expect(page.getByTestId("watch-button")).toHaveText("Stop watching");

  await page.getByRole("link", { name: "My watchlist" }).click();
  await expect(page).toHaveURL(/\/my-watchlist$/);
  const list = page.getByTestId("watchlist");
  await expect(list.getByRole("link").first()).toHaveAttribute("href", `/candidates/${slug}`);
  await expect(page.getByTestId("watch-count")).toContainText("1 of 20 watched");
  await list.getByRole("button", { name: /^Stop watching/ }).click();
  await expect(page.getByText("You are not watching anything yet")).toBeVisible();
  await ctx.close();
});

test("email alerts need a confirmed address, and say so instead of failing quietly", async ({ browser }) => {
  const { ctx, page } = await signedIn(browser);
  await page.goto("/my-watchlist");
  const box = page.getByTestId("alert-settings");
  await expect(box).toContainText("Confirm your email address first");
  await page.getByTestId("alerts-toggle").click();
  await expect(page.getByTestId("alerts-note")).not.toBeEmpty();
  await expect(page.getByTestId("alerts-toggle")).toHaveText("Turn email alerts on");
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  await ctx.close();
});

test("the unsubscribe page without a link explains what to do", async ({ page }) => {
  await page.goto("/alerts/unsubscribe");
  await expect(page.getByTestId("unsub-missing")).toContainText("needs the link from an alert email");
});

test("the unsubscribe page changes nothing until the button is pressed, hides the token, and reports a wrong link", async ({ page }) => {
  let posted = 0;
  page.on("request", (r) => { if (r.url().includes("/alerts/unsubscribe") && r.method() === "POST") posted += 1; });
  await page.goto(`/alerts/unsubscribe#token=${"c".repeat(43)}`);
  await expect(page.getByTestId("unsub-confirm")).toBeVisible();
  expect(page.url()).not.toContain("token");
  expect(posted).toBe(0);
  await page.getByTestId("unsub-confirm").click();
  await expect(page.getByTestId("unsub-failed")).toBeVisible();
  expect(posted).toBe(1);
});
