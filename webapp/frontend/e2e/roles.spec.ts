import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// T23: the Classroom link says what it means for whoever is signed in. It changes words only: the link always goes to
// /classroom and the server decides what anyone may do. Exoplanets (the 3D systems) stays a main section for everyone.

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

/** The Classroom link's words, from the top bar on a laptop or from the More sheet on a phone. */
async function classroomLink(page: Page, isPhone: boolean) {
  if (isPhone) {
    await page.getByRole("button", { name: "More" }).click();
    return page.getByRole("dialog", { name: "More" }).locator('a[href="/classroom"]');
  }
  return page.getByRole("navigation", { name: "Primary" }).locator('a[href="/classroom"]');
}

async function closeMore(page: Page, isPhone: boolean) {
  if (isPhone) await page.keyboard.press("Escape");
}

test("the link is 'Classroom' for a guest, 'My classes' for a teacher and 'My assignments' for a student", async ({ browser }, info) => {
  test.setTimeout(120_000);
  const phone = info.project.name === "mobile";
  const tctx = await browser.newContext({ locale: "en-US", ...(phone ? info.project.use : {}) });
  const teacher = await tctx.newPage();

  await teacher.goto("/classroom");
  await expect(await classroomLink(teacher, phone)).toHaveText("Classroom");
  await closeMore(teacher, phone);

  await teacher.getByRole("radio", { name: "I'm a teacher" }).check();
  await teacher.getByRole("button", { name: "Create an account" }).click();
  await teacher.getByTestId("teacher-name").fill("Ms Navigator");
  await teacher.getByTestId("teacher-email").fill(`nav${unique()}@school.example`);
  await teacher.getByTestId("teacher-password").fill("correct horse battery");
  await teacher.getByTestId("org-name").fill(`Nav High ${unique()}`);
  await teacher.getByTestId("birth-month").selectOption("3");
  await teacher.getByTestId("birth-year").selectOption("1985");
  await teacher.getByTestId("teacher-submit").click();
  await expect(teacher.getByTestId("signed-in")).toContainText("Ms Navigator");
  const teacherLink = await classroomLink(teacher, phone);
  await expect(teacherLink).toHaveText("My classes");
  await expect(teacherLink).toHaveAttribute("href", "/classroom");
  const axe = await new AxeBuilder({ page: teacher }).analyze();
  expect(axe.violations).toEqual([]);
  await closeMore(teacher, phone);

  // A student joins that teacher's class from another browser.
  await teacher.getByTestId("new-class-name").fill("Nav Physics");
  await teacher.getByTestId("create-class").click();
  await teacher.getByTestId("class-link").filter({ hasText: "Nav Physics" }).click();
  const code = (await teacher.getByTestId("class-code-value").textContent())!.trim();
  const sctx = await browser.newContext({ locale: "en-US", ...(phone ? info.project.use : {}) });
  const student = await sctx.newPage();
  await student.goto("/classroom");
  await student.getByTestId("class-code").fill(code);
  await student.getByTestId("nickname").fill("Orbit");
  await student.getByTestId("pin").fill("4321");
  await student.getByTestId("birth-month").selectOption("3");
  await student.getByTestId("birth-year").selectOption("2010");
  await student.getByTestId("student-submit").click();
  await expect(student.getByTestId("signed-in")).toContainText("Orbit");
  await expect(await classroomLink(student, phone)).toHaveText("My assignments");
  await closeMore(student, phone);

  // Signing out puts the words back.
  await student.getByTestId("logout").click();
  await expect(await classroomLink(student, phone)).toHaveText("Classroom");
  await closeMore(student, phone);
  await teacher.goto("/classroom"); // the sign-out button lives on the Classroom home, not on a class page
  await teacher.getByTestId("logout").click();
  await expect(await classroomLink(teacher, phone)).toHaveText("Classroom");
  await tctx.close();
  await sctx.close();
});

test("a made-up role in the browser changes nothing: the words come from the server", async ({ page }, info) => {
  const phone = info.project.name === "mobile";
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.setItem("ph-door", "teacher");
    window.localStorage.setItem("ph-role", "teacher");
  });
  await page.reload();
  await expect(await classroomLink(page, phone)).toHaveText("Classroom");
});

test("Exoplanets, the 3D systems, is a main section for guests", async ({ page }, info) => {
  await page.goto("/");
  if (info.project.name === "mobile") {
    await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Exoplanets" })).toBeVisible();
  } else {
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Exoplanets" })).toBeVisible();
  }
});
