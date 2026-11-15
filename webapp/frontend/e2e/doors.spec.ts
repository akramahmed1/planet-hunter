import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// T22: three ways in. The remembered door is a display preference in this browser only; it never redirects anyone.

test("the welcome page shows three doors, each with a plain button", async ({ page }) => {
  await page.goto("/welcome");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Choose your way in");
  await expect(page.getByTestId("doors").getByRole("heading", { level: 2 })).toHaveText([
    "Explore as a guest", "I'm a teacher", "I'm a student",
  ]);
  await expect(page.getByTestId("door-guest")).toHaveAttribute("href", "/");
  await expect(page.getByTestId("door-teacher")).toHaveAttribute("href", "/classroom?as=teacher");
  await expect(page.getByTestId("door-student")).toHaveAttribute("href", "/classroom?as=student");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("the teacher door opens the Classroom on the teacher form and is remembered", async ({ page }) => {
  await page.goto("/welcome");
  await page.getByTestId("door-teacher").click();
  await expect(page).toHaveURL(/\/classroom\?as=teacher$/);
  await expect(page.getByRole("radio", { name: "I'm a teacher" })).toBeChecked();
  await expect(page.getByTestId("teacher-form")).toBeVisible();
  await page.goto("/welcome");
  await expect(page.getByTestId("door-last")).toHaveText("You chose this last time.");
  await page.goto("/");
  await expect(page.getByTestId("door-band")).toContainText("Last time you chose teacher");
  await expect(page.getByTestId("door-band-go")).toHaveAttribute("href", "/classroom?as=teacher");
  // With no ?as= the remembered door picks the starting form.
  await page.goto("/classroom");
  await expect(page.getByRole("radio", { name: "I'm a teacher" })).toBeChecked();
});

test("the student door opens the student form; choosing another way in forgets the remembered door", async ({ page }) => {
  await page.goto("/welcome");
  await page.getByTestId("door-student").click();
  await expect(page.getByRole("radio", { name: "I'm a student" })).toBeChecked();
  await expect(page.getByTestId("student-form")).toBeVisible();
  await page.goto("/");
  await page.getByTestId("door-band-change").click();
  await expect(page.getByTestId("door-band")).toContainText("Teacher or student?");
  await page.reload();
  await expect(page.getByTestId("door-band")).toContainText("Teacher or student?");
});

test("the guest door goes home and leaves the home page without a Welcome back line", async ({ page }) => {
  await page.goto("/welcome");
  await page.getByTestId("door-guest").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("door-band")).toContainText("Teacher or student?");
});

test("a remembered door never redirects: shared and deep links land where they point", async ({ page }) => {
  await page.goto("/welcome");
  await page.getByTestId("door-student").click();
  for (const path of ["/candidates", "/learn", "/method", "/"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/$" : path}$`));
  }
});

test("a made-up remembered value is ignored and the app still works", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.setItem("ph-door", "administrator"));
  await page.goto("/");
  await expect(page.getByTestId("door-band")).toContainText("Teacher or student?");
  await page.goto("/classroom");
  await expect(page.getByRole("radio", { name: "I'm a student" })).toBeChecked(); // the usual default
});

test("a bad ?as= value is ignored", async ({ page }) => {
  await page.goto("/classroom?as=superuser");
  await expect(page.getByRole("radio", { name: "I'm a student" })).toBeChecked();
});
