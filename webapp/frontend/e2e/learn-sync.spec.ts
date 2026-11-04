import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

// T39: Learn progress follows a signed-in person to their other devices. Each "device" is its own browser context
// (its own cookies and its own local storage), like two phones.

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const CSRF = { "X-PH-CSRF": "1" };
const KEY = "ph-learn-v1";
const SLUG = "distances-and-light-time";

async function signedInDevice(browser: Browser, email: string, signup: boolean): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ locale: "en-US" });
  const body = { email, password: "correct horse battery" };
  const r = signup
    ? await ctx.request.post("/api/v2/auth/teacher/signup", { data: { ...body, display_name: "Sync Test", birth_month: 1, birth_year: 1990, org_name: `Sync School ${unique()}` }, headers: CSRF })
    : await ctx.request.post("/api/v2/auth/teacher/login", { data: body, headers: CSRF });
  expect(r.status(), await r.text()).toBeLessThan(300);
  return { ctx, page: await ctx.newPage() };
}

async function completeLesson(page: Page): Promise<string> {
  // Every question of the lesson answered right, at the time below: the badge condition.
  const lesson = await (await page.request.get(`/api/v2/lessons/${SLUG}`)).json();
  const keys: string[] = lesson.questions.map((q: { key: string }) => q.key);
  const done = {
    version: 1,
    lessons: { [SLUG]: { stepsSeen: lesson.steps.length, questions: Object.fromEntries(keys.map((k) => [k, { correct: true, tries: 1 }])), badgeAt: "2026-10-20T10:00:00.000Z" } },
  };
  await page.addInitScript(([k, v]) => localStorage.setItem(k as string, v as string), [KEY, JSON.stringify(done)]);
  return JSON.stringify(done);
}

const badgesLine = (page: Page) => page.getByTestId("learn-badges").locator("p").first();
const mine = (ctx: BrowserContext) => ctx.request.get("/api/v2/me/learn-progress").then((r) => r.json());

test("not signed in: progress stays on this device and the page says so", async ({ page }) => {
  await page.goto("/learn");
  await expect(page.getByTestId("progress-where")).toContainText("kept on this device only");
  await expect(page.getByTestId("sync-note")).toHaveCount(0);
  const r = await page.request.get("/api/v2/me/learn-progress");
  expect(r.status()).toBe(401);
});

test("a badge earned on one device is there on another, after signing in", async ({ browser }) => {
  const email = `sync${unique()}@school.example`;
  const a = await signedInDevice(browser, email, true);
  await completeLesson(a.page);
  await a.page.goto("/learn");
  await expect(badgesLine(a.page)).toContainText("1 of");
  await expect(a.page.getByTestId("progress-where")).toContainText("in your account");
  await expect.poll(async () => Object.keys((await mine(a.ctx)).lessons)).toContain(SLUG); // it reached the account

  const b = await signedInDevice(browser, email, false); // a second phone: empty storage, same person
  await b.page.goto("/learn");
  await expect(badgesLine(b.page)).toContainText("1 of");
  expect(await b.page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).lessons["distances-and-light-time"].badgeAt, KEY)).toBe("2026-10-20T10:00:00.000Z");
  await a.ctx.close();
  await b.ctx.close();
});

test("an old device that knows less cannot take the badge away", async ({ browser }) => {
  const email = `sync${unique()}@school.example`;
  const a = await signedInDevice(browser, email, true);
  await completeLesson(a.page);
  await a.page.goto("/learn");
  await expect.poll(async () => Object.keys((await mine(a.ctx)).lessons)).toContain(SLUG);

  const old = await signedInDevice(browser, email, false);
  await old.page.addInitScript(([k, v]) => localStorage.setItem(k as string, v as string),
    [KEY, JSON.stringify({ version: 1, lessons: { [SLUG]: { stepsSeen: 1, questions: {} } } })]);
  await old.page.goto("/learn");
  await expect(badgesLine(old.page)).toContainText("1 of"); // it picked up what the other device did
  const after = await mine(a.ctx);
  expect(after.lessons[SLUG].badgeAt).toBe("2026-10-20T10:00:00.000Z"); // and the account kept it
  await a.ctx.close();
  await old.ctx.close();
});

test("if the account cannot be reached, progress is kept on the device and sent later", async ({ browser }) => {
  const email = `sync${unique()}@school.example`;
  const a = await signedInDevice(browser, email, true);
  await a.page.clock.install();
  let failing = true;
  await a.page.route("**/api/v2/me/learn-progress", async (route) => {
    if (failing && route.request().method() === "PUT") return route.fulfill({ status: 503, json: { detail: "down" } });
    return route.continue();
  });
  await completeLesson(a.page);
  await a.page.goto("/learn");
  await a.page.clock.runFor(1000);
  await expect(a.page.getByTestId("progress-where")).toContainText("in your account"); // signed in, so syncing is on
  expect(await a.page.evaluate((k) => localStorage.getItem(k) !== null, KEY)).toBe(true); // still on the device
  failing = false;
  await a.page.clock.fastForward(25_000); // jump past the retry wait
  await expect.poll(async () => Object.keys((await mine(a.ctx)).lessons)).toContain(SLUG);
  await a.ctx.close();
});

test("the sync note passes the accessibility scan on a lesson", async ({ browser }) => {
  const a = await signedInDevice(browser, `sync${unique()}@school.example`, true);
  await a.page.goto(`/learn/${SLUG}`);
  await expect(a.page.getByTestId("sync-note")).toBeVisible();
  const axe = await new AxeBuilder({ page: a.page }).analyze();
  expect(axe.violations).toEqual([]);
  await a.ctx.close();
});
