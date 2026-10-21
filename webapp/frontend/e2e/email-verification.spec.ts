import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// T18. The token itself is covered by the backend tests (a browser cannot read the test mailbox). Here: a new
// teacher sees the banner and can ask for another email, and the verify page handles a missing and a wrong link.

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

test("a new teacher is asked to confirm their email and can ask for it again", async ({ page }) => {
  await page.goto("/classroom");
  await page.getByRole("radio", { name: "I'm a teacher" }).check();
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByTestId("teacher-name").fill("Mr Okafor");
  await page.getByTestId("teacher-email").fill(`okafor${unique()}@school.example`);
  await page.getByTestId("teacher-password").fill("correct horse battery");
  await page.getByTestId("org-name").fill(`Verify High ${unique()}`);
  await page.getByTestId("birth-month").selectOption("3");
  await page.getByTestId("birth-year").selectOption("1985");
  await page.getByTestId("teacher-submit").click();
  await expect(page.getByTestId("signed-in")).toContainText("Mr Okafor");
  await expect(page.getByTestId("verify-banner")).toContainText("Please confirm your email address");
  await page.getByTestId("verify-resend").click();
  await expect(page.getByTestId("verify-resent")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("verify page without a link explains what to do", async ({ page }) => {
  await page.goto("/classroom/verify");
  await expect(page.getByTestId("verify-failed")).toContainText("needs the link from your email");
  await expect(page).toHaveTitle(/Confirm your email/);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("verify page with a wrong link says so and removes the token from the address bar", async ({ page }) => {
  await page.goto(`/classroom/verify#token=${"b".repeat(43)}`);
  await expect(page.getByTestId("verify-failed")).toContainText("not valid any more");
  expect(page.url()).not.toContain("token");
});

test("a long school email address does not stretch the page sideways", async ({ page }) => {
  // Real addresses such as firstname.lastname@district.k12.state.us are long and have no spaces to wrap at.
  const email = `firstname.lastname.of.a.long.name${unique()}@a-district-with-a-long-name.k12.example.org`;
  await page.goto("/classroom");
  await page.getByRole("radio", { name: "I'm a teacher" }).check();
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByTestId("teacher-name").fill("Ms Longname");
  await page.getByTestId("teacher-email").fill(email);
  await page.getByTestId("teacher-password").fill("correct horse battery");
  await page.getByTestId("org-name").fill(`Long Address High ${unique()}`);
  await page.getByTestId("birth-month").selectOption("3");
  await page.getByTestId("birth-year").selectOption("1985");
  await page.getByTestId("teacher-submit").click();
  await expect(page.getByTestId("verify-banner")).toContainText(email);
  // Compare with the screen's real width: on a phone the browser widens window.innerWidth to fit overflowing content.
  const width = page.viewportSize()!.width;
  const over = await page.evaluate((w) => ({
    scroll: document.documentElement.scrollWidth,
    wide: [...document.querySelectorAll("main *")].filter((e) => e.getBoundingClientRect().right > w + 1)
      .map((e) => `${e.tagName}.${e.className}`),
  }), width);
  expect(over.wide).toEqual([]);
  expect(over.scroll).toBeLessThanOrEqual(width);
});
