import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Product audit 2026-11-14 (P0-2, P0-4): the teacher sign-up form answers at the field, never with a native browser
// tooltip, lets the person see their password, shows the rules as they type, keeps Create account reachable with the
// keyboard open, and swaps the whole school field when the radio changes.

async function openSignup(page: import("@playwright/test").Page) {
  await page.goto("/classroom");
  await page.getByRole("radio", { name: "I'm a teacher" }).check();
  await page.getByRole("button", { name: "Create an account" }).click();
}

test("an empty form lists every problem at the top and under each field, with no browser tooltip", async ({ page }) => {
  await openSignup(page);
  await page.getByTestId("teacher-submit").click();
  const summary = page.getByTestId("error-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("these 5 things");
  await expect(page.getByTestId("field-error")).toHaveCount(4); // name, email, password, school; birth has its own line
  await expect(page.getByTestId("teacher-name")).toHaveAttribute("aria-invalid", "true");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("the password can be shown and its rules tick off as the person types", async ({ page }) => {
  await openSignup(page);
  const pw = page.getByTestId("teacher-password");
  const rules = page.getByTestId("password-rules");
  await expect(rules).toContainText("10 or more characters (not yet)");
  await pw.fill("short");
  await expect(rules).toContainText("10 or more characters (not yet)");
  await pw.fill("correct horse battery");
  await expect(rules).toContainText("10 or more characters (done)");
  await expect(pw).toHaveAttribute("type", "password");
  await page.getByTestId("password-toggle").click();
  await expect(pw).toHaveAttribute("type", "text");
  await expect(page.getByTestId("password-toggle")).toHaveAttribute("aria-pressed", "true");
});

test("choosing an age under 13 is answered at once, before the form is sent", async ({ page }) => {
  await openSignup(page);
  await page.getByTestId("birth-month").selectOption("5");
  await page.getByTestId("birth-year").selectOption(String(new Date().getFullYear() - 2));
  await expect(page.getByTestId("birth-error")).toContainText("ages 13 and up");
  await page.getByTestId("birth-year").selectOption("1985");
  await expect(page.getByTestId("birth-error")).toHaveCount(0);
});

test("switching between starting a school and joining one swaps the field and clears what was typed", async ({ page }) => {
  await openSignup(page);
  await page.getByTestId("org-name").fill("Trine University");
  await page.getByRole("radio", { name: "Join one with a code" }).check();
  await expect(page.getByRole("radio", { name: "Start a new one" })).not.toBeChecked();
  await expect(page.getByLabel("Join code from your school's admin")).toHaveValue("");
  await expect(page.getByTestId("org-name")).toHaveCount(0);
  await page.getByRole("radio", { name: "Start a new one" }).check();
  await expect(page.getByTestId("org-name")).toHaveValue("");
});

test("with the keyboard-sized viewport the Create account button stays on screen above the tab bar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 420 }); // about what is left of an iPhone with the keyboard open
  await openSignup(page);
  await page.getByTestId("teacher-name").focus();
  const submit = page.getByTestId("teacher-submit");
  await expect(submit).toBeInViewport({ ratio: 1 });
  const box = await submit.boundingBox();
  const tabbar = await page.locator("nav").last().boundingBox();
  if (box && tabbar) expect(box.y + box.height).toBeLessThanOrEqual(tabbar.y + 1);
});

test("a school name typed with extra spaces is saved tidy", async ({ page }) => {
  await openSignup(page);
  const stamp = Date.now();
  await page.getByTestId("teacher-name").fill("  Dr   Patel ");
  await page.getByTestId("teacher-email").fill(`tidy${stamp}@school.example`);
  await page.getByTestId("teacher-password").fill("correct horse battery");
  await page.getByTestId("org-name").fill(`  Tidy   High ${stamp} `);
  await page.getByTestId("birth-month").selectOption("3");
  await page.getByTestId("birth-year").selectOption("1985");
  await page.getByTestId("teacher-submit").click();
  await expect(page.getByTestId("signed-in")).toContainText("Dr Patel");
  await expect(page.getByText(`Tidy High ${stamp}`).first()).toBeVisible();
});
