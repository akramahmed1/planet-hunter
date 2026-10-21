import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// T17. The full flow (token made, emailed, spent once, other sessions ended) is covered by the backend tests,
// because a browser cannot read the test mailbox. Here: the screens, the same answer for any address, and the
// reset page's handling of a missing and of a wrong token.

test("forgot password: the same answer for any address, with no way to tell if an account exists", async ({ page }) => {
  await page.goto("/classroom");
  await page.getByRole("radio", { name: "I'm a teacher" }).check();
  await page.getByTestId("forgot-link").click();
  await expect(page.getByRole("heading", { name: "Forgot your password?" })).toBeVisible();
  await page.getByTestId("forgot-email").fill(`nobody${Date.now()}@school.example`);
  await page.getByTestId("forgot-submit").click();
  await expect(page.getByTestId("forgot-sent")).toContainText("If that address has a teacher account");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await expect(page.getByTestId("teacher-form")).toBeVisible();
});

test("reset page without a link explains what to do", async ({ page }) => {
  await page.goto("/classroom/reset");
  await expect(page.getByTestId("reset-missing")).toBeVisible();
  await expect(page).toHaveTitle(/Choose a new password/);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("reset page with a wrong token says so, and the token leaves the address bar", async ({ page }) => {
  await page.goto(`/classroom/reset#token=${"a".repeat(43)}`);
  await expect(page.getByTestId("reset-form")).toBeVisible();
  expect(page.url()).not.toContain("token");
  await page.getByTestId("reset-password").fill("a brand new passphrase");
  await page.getByTestId("reset-submit").click();
  await expect(page.getByTestId("form-error")).toContainText("not valid any more");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
