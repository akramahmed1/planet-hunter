import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";

// T20. The code maths and every attack (replay, burnt tickets, wrong accounts) are covered by the backend tests. Here:
// the whole journey a teacher takes, with a real code computed the way an authenticator app does.

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

function base32(s: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of s.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function code(secret: string, stepOffset = 0): string {
  const step = Math.floor(Date.now() / 30000) + stepOffset;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32(secret)).update(msg).digest();
  const off = mac[mac.length - 1] & 0xf;
  const n = (mac.readUInt32BE(off) & 0x7fffffff) % 1_000_000;
  return String(n).padStart(6, "0");
}

test("a teacher turns on two-step sign-in, signs out, and needs the code to come back", async ({ page }) => {
  const email = `tfa${unique()}@school.example`;
  await page.goto("/classroom");
  await page.getByRole("radio", { name: "I'm a teacher" }).check();
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByTestId("teacher-name").fill("Dr Patel");
  await page.getByTestId("teacher-email").fill(email);
  await page.getByTestId("teacher-password").fill("correct horse battery");
  await page.getByTestId("org-name").fill(`Two Step High ${unique()}`);
  await page.getByTestId("birth-month").selectOption("3");
  await page.getByTestId("birth-year").selectOption("1985");
  await page.getByTestId("teacher-submit").click();
  await expect(page.getByTestId("signed-in")).toContainText("Dr Patel");
  await expect(page.getByTestId("new-class-name")).toBeVisible(); // the teacher page has finished loading and stopped moving

  await page.locator("summary", { hasText: "Two-step sign-in" }).click();
  await page.getByTestId("two-factor-start").click();
  const secret = (await page.getByTestId("two-factor-secret").textContent())!.trim();
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await page.getByTestId("two-factor-code").fill("000000");
  await page.getByTestId("two-factor-enable").click();
  await expect(page.getByTestId("two-factor-error")).toContainText("not right");
  await page.getByTestId("two-factor-code").fill(code(secret));
  await page.getByTestId("two-factor-enable").click();
  await expect(page.getByTestId("recovery-codes")).toBeVisible();
  const first = (await page.getByTestId("recovery-codes").locator("code").first().textContent())!.trim();
  expect(first).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
  await expect(page.getByTestId("codes-done")).toBeDisabled();
  await page.getByTestId("codes-saved").check();
  await page.getByTestId("codes-done").click();
  await expect(page.locator("summary", { hasText: "Two-step sign-in (on)" })).toBeVisible();

  // Sign out, then sign in: the password alone is not enough.
  await page.getByTestId("logout").click();
  await page.getByRole("radio", { name: "I'm a teacher" }).check();
  await page.getByTestId("teacher-email").fill(email);
  await page.getByTestId("teacher-password").fill("correct horse battery");
  await page.getByTestId("teacher-submit").click();
  await expect(page.getByTestId("second-step-form")).toBeVisible();
  await expect(page.getByTestId("signed-in")).toHaveCount(0);
  const again = await new AxeBuilder({ page }).analyze();
  expect(again.violations).toEqual([]);
  await page.getByTestId("second-step-code").fill("000000");
  await page.getByTestId("second-step-submit").click();
  await expect(page.getByTestId("form-error")).toContainText("did not work");
  await page.getByTestId("second-step-code").fill(code(secret, 1)); // the next code, newer than the one used to turn it on
  await page.getByTestId("second-step-submit").click();
  await expect(page.getByTestId("signed-in")).toContainText("Dr Patel");
});
