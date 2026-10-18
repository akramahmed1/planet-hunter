import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

// The plan's Phase 8 end-to-end test: a teacher creates a class, a student joins, completes an
// assignment, and the grade appears. Teacher and student use separate browser contexts (separate
// cookies), like two phones.

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

async function newPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ locale: "en-US" });
  return ctx.newPage();
}

async function signUpTeacher(page: Page, school: string) {
  await page.goto("/classroom");
  await page.getByRole("radio", { name: "I'm a teacher" }).check();
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByTestId("teacher-name").fill("Ms Rivera");
  await page.getByTestId("teacher-email").fill(`rivera${unique()}@school.example`);
  await page.getByTestId("teacher-password").fill("correct horse battery");
  await page.getByTestId("org-name").fill(school);
  await page.getByTestId("birth-month").selectOption("3");
  await page.getByTestId("birth-year").selectOption("1985");
  await page.getByTestId("teacher-submit").click();
  await expect(page.getByTestId("signed-in")).toContainText("Ms Rivera");
}

test("a teacher creates a class, a student joins and completes an assignment, and the grade appears", async ({ browser }) => {
  const teacher = await newPage(browser);
  await signUpTeacher(teacher, `Lincoln High ${unique()}`);

  await teacher.getByTestId("new-class-name").fill("Period 3 Physics");
  await teacher.getByTestId("create-class").click();
  await teacher.getByTestId("class-link").filter({ hasText: "Period 3 Physics" }).click();
  await expect(teacher.getByRole("heading", { level: 1 })).toHaveText("Period 3 Physics");
  const code = (await teacher.getByTestId("class-code-value").textContent())!.trim();
  expect(code).toMatch(/^[A-Z2-9]{8}$/);

  await teacher.getByTestId("assign-kind").selectOption("quiz");
  await teacher.getByTestId("assign-ref").selectOption("distances-and-light-time");
  await teacher.getByTestId("assign-submit").click();
  await expect(teacher.getByText("Quiz: Distances and light-time").first()).toBeVisible();

  // The student, on another phone.
  const student = await newPage(browser);
  await student.goto("/classroom");
  await student.getByTestId("class-code").fill(code.toLowerCase());
  await student.getByTestId("nickname").fill("Nova");
  await student.getByTestId("pin").fill("2468");
  await student.getByTestId("birth-month").selectOption("5");
  await student.getByTestId("birth-year").selectOption("2009");
  await student.getByTestId("student-submit").click();
  await expect(student.getByTestId("signed-in")).toContainText("Nova");
  const item = student.getByTestId("my-assignment");
  await expect(item).toContainText("Not started");
  await item.getByRole("link").click();
  await expect(student).toHaveURL(/\/learn\/distances-and-light-time\?quiz=1$/);
  await expect(student.getByRole("heading", { name: "Quiz", level: 2 })).toBeVisible();
  await student.getByTestId("quiz-earth_minutes-input").fill("20");
  await student.getByTestId("quiz-earth_minutes-check").click();
  await expect(student.getByTestId("quiz-earth_minutes-result")).toContainText("Not quite.");
  await student.getByTestId("quiz-earth_minutes-retry").click();
  await student.getByTestId("quiz-earth_minutes-input").fill("8.3");
  await student.getByTestId("quiz-earth_minutes-check").click();
  await student.getByTestId("quiz-neptune_hours-input").fill("4.2");
  await student.getByTestId("quiz-neptune_hours-check").click();
  await student.getByTestId("quiz-sun_off-choice-1").check();
  await student.getByTestId("quiz-sun_off-check").click();
  await expect(student.getByTestId("quiz-sun_off-result")).toContainText("Right.");

  await student.goto("/classroom");
  await expect(student.getByTestId("my-assignment")).toContainText("Done: 2 of 3");

  // The grade appears in the teacher's gradebook and its CSV.
  await teacher.reload();
  await expect(teacher.getByTestId("gradebook")).toContainText("Nova");
  await expect(teacher.getByTestId("gradebook")).toContainText("2 / 3");
  const csv = await teacher.request.get(await teacher.getByTestId("csv-link").getAttribute("href") as string);
  expect(await csv.text()).toContain("Nova,2");

  const { violations } = await new AxeBuilder({ page: teacher })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} on ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);

  // A PIN reset signs the student out.
  teacher.once("dialog", (d) => d.accept("1357"));
  await teacher.getByRole("button", { name: "Reset PIN" }).click();
  await expect(teacher.getByText("PIN reset for Nova")).toBeVisible();
  await student.reload();
  await expect(student.getByTestId("student-form")).toBeVisible();
});

test("someone under 13 is not given an account and cannot simply try again", async ({ page }) => {
  await page.goto("/classroom");
  await page.getByTestId("class-code").fill("ABCDEFGH");
  await page.getByTestId("nickname").fill("Kid");
  await page.getByTestId("pin").fill("1234");
  await page.getByTestId("birth-month").selectOption("1");
  await page.getByTestId("birth-year").selectOption(String(new Date().getFullYear() - 10));
  await page.getByTestId("student-submit").click();
  await expect(page.getByTestId("age-blocked")).toContainText("aged 13 and up");
  await page.reload();
  await expect(page.getByTestId("age-blocked")).toBeVisible();
  await expect(page.getByTestId("student-form")).toHaveCount(0);
});

test("a wrong PIN and an unknown class code are explained", async ({ page }) => {
  await page.goto("/classroom");
  await page.getByRole("button", { name: "I already joined" }).click();
  await page.getByTestId("class-code").fill("ZZZZZZZZ");
  await page.getByTestId("nickname").fill("Nova");
  await page.getByTestId("pin").fill("1234");
  await page.getByTestId("student-submit").click();
  await expect(page.getByTestId("form-error")).toContainText("do not match");
});

test("the privacy notice is marked as a draft", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByTestId("privacy-draft")).toContainText("has not been reviewed by an attorney");
});
