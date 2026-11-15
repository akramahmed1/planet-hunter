import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// T25: a student's home shows progress, what to do next, hunts with their best points, and what is finished. The grouping
// and ordering rules are unit tested; here is what a student sees as work arrives and gets finished.

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const H = { "x-ph-csrf": "1" };
const LESSON = "distances-and-light-time";

test("a student sees progress, the next thing to do, their hunts and what is finished", async ({ browser }) => {
  test.setTimeout(120_000);
  const tctx = await browser.newContext({ locale: "en-US" });
  const t = tctx.request;
  await t.post("/api/v2/auth/teacher/signup", { headers: H, data: { email: `st${unique()}@school.example`, password: "correct horse battery",
    display_name: "Ms Quest", birth_month: 3, birth_year: 1985, org_name: `Quest High ${unique()}` } });
  const org = (await (await t.get("/api/v2/auth/me")).json()).me.orgs[0].org_id;
  const klass = await (await t.post(`/api/v2/orgs/${org}/classes`, { headers: H, data: { name: "Quest Physics" } })).json();
  const day = 86_400_000;
  const mk = (data: object) => t.post(`/api/v2/classes/${klass.id}/assignments`, { headers: H, data });
  await mk({ kind: "quiz", ref: LESSON, due_at: new Date(Date.now() + 5 * day).toISOString() });
  await mk({ kind: "lesson", ref: "transits", due_at: new Date(Date.now() + 9 * day).toISOString() });
  await mk({ kind: "hunt", ref: "toi-700" });

  const sctx = await browser.newContext({ locale: "en-US" });
  const page = await sctx.newPage();
  await page.goto("/classroom");
  await page.getByTestId("class-code").fill(klass.join_code);
  await page.getByTestId("nickname").fill("Quester");
  await page.getByTestId("pin").fill("4321");
  await page.getByTestId("birth-month").selectOption("3");
  await page.getByTestId("birth-year").selectOption("2010");
  await page.getByTestId("student-submit").click();
  await expect(page.getByTestId("student-home")).toContainText("Hi, Quester");
  await expect(page.getByTestId("progress")).toHaveText("0 of 3 done (0%)");
  await expect(page.getByTestId("progress-bar")).toHaveAttribute("value", "0");
  // The soonest due is next up (the hunt has no due date, so it goes last); the hunt is under My hunts.
  await expect(page.locator(".next-up")).toContainText("Quiz: Distances and light-time");
  await expect(page.getByTestId("next-up-go")).toHaveText("Start");
  await expect(page.getByTestId("next-up-go")).toHaveAccessibleName("Start: Quiz: Distances and light-time");
  await expect(page.getByTestId("my-hunts")).toContainText("Hunt challenge");
  await expect(page.getByTestId("my-hunts")).toContainText("Not started");
  await expect(page.getByTestId("finished")).toHaveCount(0);

  // Finish the quiz (first try wrong on one question, then right: score counts first tries).
  const answer = (data: object) => sctx.request.post(`/api/v2/lessons/${LESSON}/answers`, { headers: H, data });
  await answer({ question: "earth_minutes", value: 20 });
  await answer({ question: "earth_minutes", value: 8.3 });
  await answer({ question: "neptune_hours", value: 4.2 });
  await answer({ question: "sun_off", choice: 1 });
  await page.reload();
  await expect(page.getByTestId("progress")).toHaveText("1 of 3 done (33%)");
  await expect(page.getByTestId("finished")).toContainText("Done: 2 of 3");
  await expect(page.locator(".next-up")).toContainText("Lesson: "); // the next soonest due moves up
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  const width = page.viewportSize()?.width ?? 1280;
  expect(await page.evaluate((w) => [...document.querySelectorAll("main *")].filter((e) => e.getBoundingClientRect().right > w + 1).length, width)).toBe(0);
  await tctx.close();
  await sctx.close();
});

test("a student with nothing assigned is told so", async ({ browser }) => {
  const tctx = await browser.newContext({ locale: "en-US" });
  const t = tctx.request;
  await t.post("/api/v2/auth/teacher/signup", { headers: H, data: { email: `st${unique()}@school.example`, password: "correct horse battery",
    display_name: "Ms Empty", birth_month: 3, birth_year: 1985, org_name: `Empty High ${unique()}` } });
  const org = (await (await t.get("/api/v2/auth/me")).json()).me.orgs[0].org_id;
  const klass = await (await t.post(`/api/v2/orgs/${org}/classes`, { headers: H, data: { name: "Empty" } })).json();
  const sctx = await browser.newContext({ locale: "en-US" });
  const page = await sctx.newPage();
  await page.goto("/classroom");
  await page.getByTestId("class-code").fill(klass.join_code);
  await page.getByTestId("nickname").fill("Early");
  await page.getByTestId("pin").fill("4321");
  await page.getByTestId("birth-month").selectOption("3");
  await page.getByTestId("birth-year").selectOption("2010");
  await page.getByTestId("student-submit").click();
  await expect(page.getByTestId("student-home")).toContainText("Nothing assigned yet");
  await expect(page.getByTestId("progress")).toHaveCount(0);
  await tctx.close();
  await sctx.close();
});
