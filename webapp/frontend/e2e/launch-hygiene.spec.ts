import { expect, test, type Page } from "@playwright/test";

// Things a careful visitor (or a crawler) can see: what robots.txt says, what a guest's page loads ask the server, and
// that the under-13 block is not just one tab deep.

async function firstSlug(page: Page): Promise<string> {
  await page.goto("/candidates");
  const href = await page.locator('a[href^="/candidates/"]').first().getAttribute("href");
  return href!.replace("/candidates/", "");
}

test("robots.txt keeps crawlers out unless indexing is switched on, and the sitemap is empty then", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const text = await robots.text();
  expect(text).toMatch(/User-Agent: \*/i);
  expect(text).toMatch(/Disallow: \//);
  const map = await request.get("/sitemap.xml");
  expect(map.status()).toBe(200);
  expect(await map.text()).not.toContain("<loc>");
});

test("a guest's page loads make no request that is bound to fail, and ask who is signed in at most once per page load", async ({ page }) => {
  const calls: { url: string; status: number; load: number }[] = [];
  // Each full page load starts with an empty in-memory cache, so the rule is "once per page load", not once per visit.
  let load = 0;
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) load += 1;
  });
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/")) calls.push({ url: u.pathname, status: r.status(), load });
  });
  const slug = await firstSlug(page);
  await page.goto(`/candidates/${slug}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);
  await page.goto("/learn");
  await page.waitForTimeout(1500);
  const guestOnly = calls.filter((c) => c.url.startsWith("/api/v2/me/") || c.url.startsWith("/api/v2/auth/teacher"));
  expect(guestOnly, "account-only endpoints called by a guest").toEqual([]);
  const perLoad = new Map<number, number>();
  for (const c of calls) if (c.url === "/api/v2/auth/me") perLoad.set(c.load, (perLoad.get(c.load) ?? 0) + 1);
  expect(Math.max(0, ...perLoad.values()), "who-is-signed-in asked more than once in one page load").toBeLessThanOrEqual(1);
});

test("the under-13 block holds in a new tab", async ({ page, context }) => {
  await page.goto("/classroom");
  await page.getByTestId("class-code").fill("ABCDEFGH");
  await page.getByTestId("nickname").fill("Kid");
  await page.getByTestId("pin").fill("1234");
  await page.getByTestId("birth-month").selectOption("1");
  await page.getByTestId("birth-year").selectOption(String(new Date().getFullYear() - 10));
  await page.getByTestId("student-submit").click();
  await expect(page.getByTestId("age-blocked")).toBeVisible();
  const other = await context.newPage();
  await other.goto("/classroom");
  await expect(other.getByTestId("age-blocked")).toBeVisible();
  await expect(other.getByTestId("student-form")).toHaveCount(0);
});
