import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { CANDIDATES } from "./routes";

// T38: CSV downloads (candidates, a scan result, a light curve) and per-candidate share links.

async function download(page: Page, click: () => Promise<void>) {
  const [d] = await Promise.all([page.waitForEvent("download"), click()]);
  const path = await d.path();
  const text = (await import("node:fs")).readFileSync(path!, "utf8");
  return { name: d.suggestedFilename(), text };
}
// A small reader for the files these buttons make (quotes, doubled quotes, CRLF).
function parse(text: string): string[][] {
  const body = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (q) {
      if (ch === '"' && body[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\r") { /* the \n follows */ }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  return rows;
}

test("the candidates file has one row for each candidate shown, with the page's own numbers", async ({ page }) => {
  await page.goto("/candidates");
  const { name, text } = await download(page, () => page.getByTestId("csv-button").click());
  expect(name).toMatch(/^planet-hunter-candidates-\d{4}-\d\d-\d\d\.csv$/);
  expect(text.charCodeAt(0)).toBe(0xfeff); // a spreadsheet reads the symbols correctly
  expect(text).toContain("\r\n");
  const rows = parse(text);
  expect(rows[0]).toEqual(["rank", "target", "tic", "classification", "label", "period_d", "duration_d", "depth_ppm", "snr", "bls_power", "n_cadences"]);
  expect(rows.length - 1).toBe(CANDIDATES.length);
  const toi700 = rows.find((r) => r[1] === "TOI 700")!;
  const c = CANDIDATES.find((x) => x.slug === "toi-700")!;
  expect(Number(toi700[5])).toBeCloseTo(c.period_d, 3);
  await expect(page.getByTestId("csv-saved")).toContainText(`${CANDIDATES.length} rows`);
});

test("the file follows the filter on the page", async ({ page }) => {
  await page.goto("/candidates");
  const wanted = CANDIDATES.filter((c) => c.classification === "ambiguous").length;
  await page.getByRole("button", { name: /^Ambiguous/i }).first().click();
  await expect(page.getByTestId("csv-button")).toContainText(`Download these ${wanted}`);
  const { text } = await download(page, () => page.getByTestId("csv-button").click());
  const rows = parse(text);
  expect(rows.length - 1).toBe(wanted);
  expect(rows.slice(1).every((r) => r[3] === "ambiguous")).toBe(true);
});

test("a candidate's light curve downloads with every point", async ({ page }) => {
  const lc = (await (await page.request.get("/api/v2/lightcurves/toi-700")).json()) as { time_btjd: number[]; flux_ppm: number[] };
  await page.goto("/candidates/toi-700");
  const { name, text } = await download(page, () => page.getByRole("button", { name: "Download the light curve (CSV)" }).click());
  expect(name).toMatch(/^planet-hunter-toi-700-light-curve-/);
  const rows = parse(text);
  expect(rows[0]).toEqual(["time_btjd", "flux_ppm"]);
  expect(rows.length - 1).toBe(lc.time_btjd.length);
  expect(Number(rows[1][0])).toBe(lc.time_btjd[0]);
  expect(Number(rows[rows.length - 1][1])).toBe(lc.flux_ppm[lc.flux_ppm.length - 1]);
});

test("a finished scan downloads as one row with every vetting check", async ({ page }) => {
  await page.goto("/scan/1");
  await expect(page.getByTestId("scan-signal")).toBeVisible();
  const { text } = await download(page, () => page.getByRole("button", { name: "Download this result (CSV)" }).click());
  const rows = parse(text);
  expect(rows).toHaveLength(2);
  expect(rows[0].slice(0, 6)).toEqual(["tic_id", "target", "period_d", "depth_ppm", "duration_d", "snr"]);
  expect(rows[0].length).toBe(rows[1].length);
  expect(rows[0].some((h) => h.startsWith("vetting_"))).toBe(true);
  expect(Number(rows[1][2])).toBeGreaterThan(0);
});

test("copying the link puts this page's address on the clipboard, and says so", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/candidates/toi-270");
  await page.getByTestId("share-copy").click();
  await expect(page.getByTestId("share-status")).toHaveText("Link copied.");
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toBe(new URL("/candidates/toi-270", page.url()).toString());
  expect(clip).not.toContain("?");
});

test("where copying is refused the link is shown, selected, to copy by hand", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("no")) } });
  });
  await page.goto("/candidates/toi-270");
  await page.getByTestId("share-copy").click();
  await expect(page.getByTestId("share-status")).toHaveText("Copy this link:");
  const field = page.getByTestId("share-field");
  await expect(field).toHaveValue(new URL("/candidates/toi-270", page.url()).toString());
  await expect(field).toBeFocused();
});

test("the native share sheet is used where the phone has one", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __shared: unknown[] }).__shared = [];
    Object.defineProperty(navigator, "share", { value: (d: unknown) => { (window as unknown as { __shared: unknown[] }).__shared.push(d); return Promise.resolve(); } });
  });
  await page.goto("/candidates/toi-270");
  await page.getByTestId("share-native").click();
  const shared = (await page.evaluate(() => (window as unknown as { __shared: { url: string; title: string }[] }).__shared))[0];
  expect(shared.url).toBe(new URL("/candidates/toi-270", page.url()).toString());
  expect(shared.title).toContain("not a discovery");
});

test("the new buttons pass the accessibility scan and never overflow a phone", async ({ page }) => {
  for (const path of ["/candidates", "/candidates/toi-700"]) {
    await page.goto(path);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations, path).toEqual([]);
    const w = page.viewportSize()!.width;
    expect(await page.evaluate((x) => document.documentElement.scrollWidth > x, w), path).toBe(false);
  }
});
