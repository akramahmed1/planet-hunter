import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// T19. The data rules (what is deleted, what must survive) are covered by the backend tests. Here: the screen.

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

test("a teacher who is alone in a school must confirm before the school is deleted too", async ({ page }) => {
  const email = `del${unique()}@school.example`;
  await page.goto("/classroom");
  await page.getByRole("radio", { name: "I'm a teacher" }).check();
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByTestId("teacher-name").fill("Ms Gone");
  await page.getByTestId("teacher-email").fill(email);
  await page.getByTestId("teacher-password").fill("correct horse battery");
  await page.getByTestId("org-name").fill(`Leaving High ${unique()}`);
  await page.getByTestId("birth-month").selectOption("3");
  await page.getByTestId("birth-year").selectOption("1985");
  await page.getByTestId("teacher-submit").click();
  await expect(page.getByTestId("signed-in")).toContainText("Ms Gone");

  await page.locator("summary", { hasText: "Delete my account" }).click();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await page.getByTestId("delete-password").fill("not the password");
  await page.getByTestId("delete-submit").click();
  await expect(page.getByTestId("delete-error")).toContainText("not right");

  await page.getByTestId("delete-password").fill("correct horse battery");
  await page.getByTestId("delete-submit").click();
  await expect(page.getByTestId("delete-error")).toContainText("Confirm to continue");
  await expect(page.getByTestId("delete-submit")).toBeDisabled();
  await page.getByTestId("delete-school").check();
  await page.getByTestId("delete-submit").click();
  await expect(page.getByTestId("signed-in")).toHaveCount(0);

  // The account is really gone: signing in again fails.
  await page.getByRole("radio", { name: "I'm a teacher" }).check();
  await page.getByTestId("teacher-email").fill(email);
  await page.getByTestId("teacher-password").fill("correct horse battery");
  await page.getByTestId("teacher-submit").click();
  await expect(page.getByTestId("form-error")).toContainText("do not match an account");
});
