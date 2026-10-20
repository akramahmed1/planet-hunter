import { expect, test } from "@playwright/test";

// CI seeds one finished scan (TOI 1338, built offline from saved data: seed_demo_scans.py) as scan 1.
// Against staging, the staging check first runs a real scan of the same star and passes its id in PW_SCAN_ID.
// No worker runs in CI, so new scans stay queued there.
import { SCAN_ID } from "./routes";

test("a finished scan shows its signal, vetting, cross-match and charts", async ({ page }) => {
  await page.goto(`/scan/${SCAN_ID}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Scan of (TOI 1338|TIC 260128333)$/);
  await expect(page.getByTestId("scan-signal")).toContainText(/\d+\.\d{4} days/);
  await expect(page.getByTestId("scan-signal")).toContainText("Matches a known eclipsing binary");
  await expect(page.getByTestId("label-status")).toHaveText("(proposed, not reviewed)");
  // The known eclipsing binary is flagged by the vetting checks.
  await expect(page.getByTestId("vet-known_eb")).toContainText("Fail");
  await expect(page.getByTestId("vet-known_eb")).toContainText("TESS Eclipsing Binary catalog");
  for (const id of ["odd_even", "secondary", "shape", "size", "tls"]) {
    await expect(page.getByTestId(`vet-${id}`)).toBeVisible();
  }
  await expect(page.getByTestId("crossmatch")).toContainText("TESS EB catalog entry");
  await expect(page.getByTestId("lc-chart").locator("canvas")).toBeVisible();
  await expect(page.getByTestId("pg-chart").locator("canvas")).toBeVisible();
});

test("scanning a star queues it and shows its progress", async ({ page }) => {
  await page.goto("/scan");
  await page.getByTestId("scan-target").fill("TIC 150428135");
  await page.getByTestId("scan-submit").click();
  await expect(page).toHaveURL(/\/scan\/\d+$/);
  // In CI the scan stays queued. On staging a real worker may already have finished it (the
  // other browser project asks for the same star), so the result counts too; a failure does not.
  await expect
    .poll(async () => {
      const status = (await page.getByTestId("scan-status").textContent()) ?? "";
      return /Waiting in the queue|Scanning/.test(status) || (await page.getByTestId("scan-signal").count()) > 0;
    })
    .toBe(true);
  await expect(page.getByTestId("scan-status")).not.toContainText("This scan failed");
  // Asking again returns the same scan instead of queuing new work.
  const url = page.url();
  await page.goto("/scan");
  await page.getByTestId("scan-target").fill("150428135");
  await page.getByTestId("scan-submit").click();
  await expect(page).toHaveURL(url);
});

test("a bad star name is explained, not queued", async ({ page }) => {
  await page.goto("/scan");
  await page.getByTestId("scan-target").fill("Proxima Centauri");
  await page.getByTestId("scan-submit").click();
  await expect(page.getByTestId("scan-error")).toContainText("Enter a TIC ID");
  await expect(page).toHaveURL(/\/scan$/);
});

test("an unknown scan is a 404", async ({ page }) => {
  const res = await page.goto("/scan/999999");
  expect(res?.status()).toBe(404);
});

test("submitting nothing asks for a star", async ({ page }) => {
  await page.goto("/scan");
  await page.getByTestId("scan-submit").click();
  await expect(page.getByTestId("scan-error")).toHaveText("Enter a star to scan.");
  await expect(page).toHaveURL(/\/scan$/);
});
