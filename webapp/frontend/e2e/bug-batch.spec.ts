import { expect, test } from "@playwright/test";
import { CANDIDATES } from "./routes";

// Fixes from the second browser audit: units that follow the setting, a candidates list whose filter lives in the
// address, search that forgives a missing space, a footer that names the right data, honest empty states, a lighter
// candidate page, and a score that says when it is only practice.

const isMobile = (name: string) => name.startsWith("mobile");

test("the units note and the TESS page follow the chosen distance unit", async ({ page }) => {
  await page.goto("/missions/tess");
  const orbit = page.getByText(/TESS swings between about/);
  await expect(orbit).toContainText(/about [\d,]+ mi and [\d,]+ mi from Earth/);
  await expect(orbit).not.toContainText("km");
  await page.getByTestId("units-button").click();
  const sheet = page.getByRole("dialog", { name: "Units" });
  await expect(sheet.getByTestId("au-note")).toContainText("93 million miles");
  await sheet.getByLabel("Kilometers").check();
  await expect(sheet.getByTestId("au-note")).toContainText("150 million kilometers");
  await expect(sheet.getByTestId("au-note")).not.toContainText("miles");
  await page.keyboard.press("Escape");
  await expect(orbit).toContainText("108,400 km and 376,300 km");
});

test("the candidates list keeps its filter in the address, and a bad address is ignored", async ({ page }) => {
  await page.goto("/candidates");
  await page.getByRole("button", { name: /^Ambiguous/i }).first().click();
  await expect(page).toHaveURL(/[?&]class=ambiguous/);
  await page.reload();
  await expect(page.getByRole("button", { name: /^Ambiguous/i }).first()).toHaveAttribute("aria-pressed", "true");
  await page.goto("/candidates?class=%3Cscript%3E&sort=evil");
  await expect(page.getByRole("button", { name: /^All/i }).first()).toHaveAttribute("aria-pressed", "true");
});

test("SNR sorts with the strongest first on the first click, and the table says which headers sort", async ({ page }, info) => {
  test.skip(isMobile(info.project.name), "the table is for wider screens");
  await page.goto("/candidates");
  await page.getByRole("button", { name: /^SNR/ }).click();
  await expect(page.locator('th[aria-sort]')).toHaveAttribute("aria-sort", "descending");
  await expect(page.locator("caption")).toContainText("Select Rank, Period, Depth or SNR to sort.");
  const snr = await page.locator("tbody tr td:nth-child(4)").allInnerTexts();
  const nums = snr.map(Number);
  expect([...nums].sort((a, b) => b - a)).toEqual(nums);
  await expect(page.getByTestId("rank-note")).toContainText("Rank is the batch scan");
});

test("the CSV button is not plural for one signal", async ({ page }) => {
  const counts = new Map<string, number>();
  for (const c of CANDIDATES) counts.set(c.classification, (counts.get(c.classification) ?? 0) + 1);
  const single = [...counts].find(([, n]) => n === 1)?.[0];
  test.skip(!single, "every classification has more than one candidate");
  await page.goto(`/candidates?class=${single}`);
  await expect(page.getByTestId("csv-button")).toHaveText("Download this signal (CSV)");
});

test("search finds TOI 700 without the space, and offers its planetary system page", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("cmd-open").click();
  await page.getByRole("combobox").fill("toi700");
  const list = page.getByTestId("cmd-list");
  await expect(list.getByRole("option", { name: /TOI 700/ })).toHaveCount(2);
  await expect(list).toContainText("planetary system");
});

test("the footer names the data the page is built on", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("footer-credit")).toContainText("MAST");
  await page.goto("/solar-system");
  await expect(page.getByTestId("footer-credit")).toContainText("JPL Horizons");
  await expect(page.getByTestId("footer-credit")).not.toContainText("MAST");
});

test("Missions says its date is a UTC date, and a spacecraft with no sourced status says so", async ({ page }) => {
  await page.goto("/missions");
  await expect(page.getByText(/\(UTC date\)/).first()).toBeVisible();
  await expect(page.getByTestId("craft-jwst").getByTestId("no-status")).toHaveText("No sourced status yet");
});

test("the status strip and the ISS board show the same position", async ({ page }, info) => {
  // The strip drops the coordinates below 560 px (globals.css .strip-coords); the board is the phone's one reading.
  test.skip(isMobile(info.project.name), "the strip shows no coordinates on a phone");
  await page.goto("/missions");
  const parse = (t: string) => {
    const m = [...t.matchAll(/([\d.]+)°\s*([NSEW])/g)].map(([, v, h]) => Number(v) * ("SW".includes(h) ? -1 : 1));
    return m;
  };
  await expect(page.getByTestId("strip-iss")).toBeVisible();
  await expect.poll(async () => {
    const board = parse(await page.getByTestId("iss-over").innerText());
    const strip = parse(await page.getByTestId("strip-iss").innerText());
    return board.length === 2 && strip.length === 2 && Math.abs(board[0] - strip[0]) <= 0.06 && Math.abs(board[1] - strip[1]) <= 0.06;
  }).toBe(true);
});

test("the candidate page no longer carries the chart data in its HTML", async ({ request }) => {
  const res = await request.get(`/candidates/${CANDIDATES[0].slug}`);
  const html = await res.text();
  expect(html).not.toContain("time_btjd");
  expect(html.length, `candidate page HTML is ${html.length} bytes`).toBeLessThan(120_000);
});

test("a score after looking at the answer is called practice", async ({ page }) => {
  await page.goto(`/candidates/${CANDIDATES[0].slug}`);
  const lab = page.getByTestId("challenge");
  await expect(lab).toBeVisible();
  await lab.getByRole("button", { name: "Show the answer" }).click();
  await lab.getByRole("button", { name: "Fold there" }).click();
  await lab.getByTestId("check-guess").click();
  await expect(lab.getByTestId("score")).toContainText("practice, not a score");
  await page.reload();
  const fresh = page.getByTestId("challenge");
  await expect(fresh).toBeVisible();
  await fresh.getByTestId("check-guess").click();
  await expect(fresh.getByTestId("score")).not.toContainText("practice");
});
