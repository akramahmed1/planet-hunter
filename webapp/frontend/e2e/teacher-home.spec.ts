import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// T24: the teacher's home shows, per class and for the whole school, numbers the server counted. The exact arithmetic is
// tested in the backend; here: what a teacher sees, from nothing to finished work, on phone and laptop.

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const H = { "x-ph-csrf": "1" };
const LESSON = "distances-and-light-time";

test("the glance starts empty and follows the work students hand in", async ({ browser }) => {
  test.setTimeout(120_000);
  const tctx = await browser.newContext({ locale: "en-US" });
  const page = await tctx.newPage();
  await page.goto("/classroom");
  await page.getByRole("radio", { name: "I'm a teacher" }).check();
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByTestId("teacher-name").fill("Ms Glance");
  await page.getByTestId("teacher-email").fill(`glance${unique()}@school.example`);
  await page.getByTestId("teacher-password").fill("correct horse battery");
  await page.getByTestId("org-name").fill(`Glance High ${unique()}`);
  await page.getByTestId("birth-month").selectOption("3");
  await page.getByTestId("birth-year").selectOption("1985");
  await page.getByTestId("teacher-submit").click();
  await expect(page.getByTestId("new-class-name")).toBeVisible();
  await expect(page.getByTestId("school-glance")).toHaveCount(0); // nothing to summarise yet

  await page.getByTestId("new-class-name").fill("Glance Physics");
  await page.getByTestId("create-class").click();
  await expect(page.getByTestId("glance-classes")).toHaveText("1");
  await expect(page.getByTestId("glance-students")).toHaveText("0");
  await expect(page.getByTestId("glance-done")).toHaveText("Nothing assigned yet");
  await expect(page.getByTestId("glance-due")).toHaveText("Nothing due");
  await expect(page.getByTestId("class-glance")).toContainText("0 students · no assignments yet");

  // One quiz due in three days, set up through the API as the signed-in teacher.
  const org = (await (await page.request.get("/api/v2/auth/me")).json()).me.orgs[0].org_id;
  const klass = (await (await page.request.get(`/api/v2/orgs/${org}/classes`)).json()).classes[0];
  const due = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const made = await page.request.post(`/api/v2/classes/${klass.id}/assignments`, { headers: H, data: { kind: "quiz", ref: LESSON, due_at: due } });
  expect(made.status()).toBe(201);

  const sctx = await browser.newContext({ locale: "en-US" });
  const joined = await sctx.request.post("/api/v2/auth/student/join", { headers: H, data: {
    class_code: klass.join_code, nickname: "Quasar", pin: "4321", birth_month: 3, birth_year: 2010 } });
  expect(joined.status()).toBe(201);

  await page.reload();
  await expect(page.getByTestId("glance-students")).toHaveText("1");
  await expect(page.getByTestId("glance-done")).toHaveText("0 of 1 (0%)");
  await expect(page.getByTestId("glance-due")).not.toHaveText("Nothing due");
  await expect(page.getByTestId("class-glance")).toContainText("1 student · 1 assignment · 0 of 1 done · next due");
  await expect(page.getByTestId("class-glance")).not.toContainText("average");

  // The student finishes the quiz: two right first time, one wrong first time then right (score counts first tries).
  const answer = (data: object) => sctx.request.post(`/api/v2/lessons/${LESSON}/answers`, { headers: H, data });
  await answer({ question: "earth_minutes", value: 20 });
  await answer({ question: "earth_minutes", value: 8.3 });
  await answer({ question: "neptune_hours", value: 4.2 });
  await answer({ question: "sun_off", choice: 1 });
  await page.reload();
  await expect(page.getByTestId("glance-done")).toHaveText("1 of 1 (100%)");
  await expect(page.getByTestId("class-glance")).toContainText("1 of 1 done · average 67%");

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  const width = page.viewportSize()?.width ?? 1280;
  const over = await page.evaluate((w) => [...document.querySelectorAll("main *")].filter((e) => e.getBoundingClientRect().right > w + 1).length, width);
  expect(over).toBe(0);
  await tctx.close();
  await sctx.close();
});
