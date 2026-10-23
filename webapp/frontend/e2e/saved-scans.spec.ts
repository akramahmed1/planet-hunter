import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

// T40: saved scans for signed-in teachers and students.

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const CSRF = { "X-PH-CSRF": "1" };

async function signedIn(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ locale: "en-US" });
  const r = await ctx.request.post("/api/v2/auth/teacher/signup", {
    data: { email: `scans${unique()}@school.example`, password: "correct horse battery", display_name: "Scan Saver", birth_month: 1,
      birth_year: 1990, org_name: `Scan School ${unique()}` },
    headers: CSRF,
  });
  expect(r.status(), await r.text()).toBeLessThan(300);
  return { ctx, page: await ctx.newPage() };
}

test("signed out there is no save box on a scan, and My saved scans says to sign in", async ({ page }) => {
  await page.goto("/scan/1");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Scan of");
  await page.waitForTimeout(500); // long enough for the box to have appeared if it were going to
  await expect(page.getByTestId("save-scan")).toHaveCount(0);
  await page.goto("/my-scans");
  await expect(page.getByText("Sign in to keep a list of your scans")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to sign in" })).toHaveAttribute("href", "/classroom");
});

test("a signed-in person saves a scan with a label, sees it on their list, and removes it", async ({ browser }) => {
  const { ctx, page } = await signedIn(browser);
  await page.goto("/scan/1");
  const box = page.getByTestId("save-scan");
  await expect(box).toBeVisible();
  await expect(page.getByTestId("save-button")).toHaveText("Save this scan");
  await expect(page.getByTestId("unsave-button")).toHaveCount(0);
  await page.getByTestId("save-label").fill("Eclipsing pair <b>to show</b>");
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-note")).toHaveText("Saved to your list.");
  await expect(page.getByTestId("save-button")).toHaveText("Change the label");

  await page.reload(); // it is remembered
  await expect(page.getByTestId("save-label")).toHaveValue("Eclipsing pair <b>to show</b>");
  await page.getByTestId("save-label").fill("renamed");
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-note")).toHaveText("Label changed.");

  await page.getByRole("link", { name: "My saved scans" }).click();
  await expect(page).toHaveURL(/\/my-scans$/);
  const list = page.getByTestId("my-scans");
  await expect(list.getByRole("link", { name: "renamed" })).toHaveAttribute("href", "/scan/1");
  await expect(page.getByTestId("my-scans-count")).toContainText("1 of 50 saved");
  await list.getByRole("button", { name: /^Remove renamed/ }).click();
  await expect(page.getByText("Nothing saved yet")).toBeVisible();
  await ctx.close();
});

test("a label is shown as plain text, never as markup", async ({ browser }) => {
  const { ctx, page } = await signedIn(browser);
  await page.goto("/scan/1");
  await page.getByTestId("save-label").fill("<img src=x onerror=window.__pwned=1>");
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-note")).toHaveText("Saved to your list.");
  await page.goto("/my-scans");
  await expect(page.getByTestId("my-scans").getByRole("link", { name: "<img src=x onerror=window.__pwned=1>" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  expect(await page.getByTestId("my-scans").locator("img").count()).toBe(0);
  await ctx.close();
});

test("one person's list is not another's", async ({ browser }) => {
  const a = await signedIn(browser);
  const b = await signedIn(browser);
  await a.page.goto("/scan/1");
  await a.page.getByTestId("save-button").click();
  await expect(a.page.getByTestId("save-note")).toHaveText("Saved to your list.");
  await b.page.goto("/my-scans");
  await expect(b.page.getByText("Nothing saved yet")).toBeVisible();
  await a.ctx.close();
  await b.ctx.close();
});

test("the box and the list pass the accessibility scan and never overflow a phone", async ({ browser }) => {
  const { ctx, page } = await signedIn(browser);
  for (const path of ["/scan/1", "/my-scans"]) {
    await page.goto(path);
    await expect(page.getByTestId(path === "/scan/1" ? "save-scan" : "my-scans-count").or(page.getByText("Nothing saved yet"))).toBeVisible();
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations, path).toEqual([]);
    const w = page.viewportSize()!.width;
    expect(await page.evaluate((x) => document.documentElement.scrollWidth > x, w), path).toBe(false);
  }
  await ctx.close();
});
