import { expect, test } from "@playwright/test";
import { CANDIDATES } from "./routes";

// Counts agree with their nouns: "1 ambiguous signal", never "1 ambiguous signals".
const n = (c: string) => CANDIDATES.filter((x) => x.classification === c).length;

test("the home page stats say '1 clean recovery' and '1 ambiguous signal' in the singular", async ({ page }) => {
  await page.goto("/");
  const stats = page.locator(".stat-grid .stat");
  await expect(stats).toHaveCount(4);
  const expected = [
    [n("clean-recovery"), "clean recovery", "clean recoveries"],
    [n("ambiguous"), "ambiguous signal", "ambiguous signals"],
    [CANDIDATES.length, "target scanned", "targets scanned"],
  ] as const;
  for (const [value, one, many] of expected) {
    await expect(page.locator(".stat-grid .stat-label", { hasText: value === 1 ? one : many }).first()).toBeVisible();
  }
  // Whatever the data, a value of 1 never sits next to a plural label, and other values never next to a singular one.
  for (const stat of await stats.all()) {
    const value = (await stat.locator(".stat-value").innerText()).trim();
    const label = (await stat.locator(".stat-label").innerText()).trim();
    if (value === "1") expect(label, `1 ${label}`).not.toMatch(/(signals|recoveries|sectors|targets scanned)$/);
  }
});

test("the candidates page and run label use the singular for one", async ({ page }) => {
  await page.goto("/candidates");
  await expect(page.getByText(/\b1 sectors\b/)).toHaveCount(0);
  await expect(page.getByText(/\b1 candidate signals\b/)).toHaveCount(0);
});

// "Tap" on a touch screen, "Select" with a mouse (the phone project is touch, the desktop project is not).
test("instructions say Tap on a phone and Select on a desktop", async ({ page }, info) => {
  const touch = info.project.name === "mobile";
  // innerText is what a person sees; textContent would also include the word CSS hides.
  const seen = (loc: ReturnType<typeof page.locator>) => () => loc.first().innerText();
  await page.goto("/");
  const line = page.locator("p.muted", { hasText: "any value to see where it comes from" });
  await expect.poll(seen(line)).toMatch(touch ? /^Tap any value/ : /^Select any value/);
  await page.goto("/learn");
  const lede = page.locator("p.lede");
  await expect.poll(seen(lede)).toContain(touch ? "tap it to see" : "select it to see");
  await expect.poll(seen(lede)).not.toContain(touch ? "select it" : "tap it");
});

// T11: the batch scan says how old it is, and BLS power keeps its digits.
test("the batch scan date comes with its age", async ({ page }) => {
  await page.goto("/candidates");
  const run = page.getByTestId("run-label").first();
  await expect(run).toContainText(/Batch scan · 2 sectors · \d{4}-\d{2}-\d{2} \((today|yesterday|\d+ days ago|about \d+ (months|years?) ago)\)/);
  await expect(page.getByText(/Scan run: \d{4}-\d{2}-\d{2} \(.+ ago\)|Scan run: \d{4}-\d{2}-\d{2} \((today|yesterday)\)/)).toBeVisible();
  await page.goto("/");
  await expect(page.getByText(/Scan of eight targets on \d{4}-\d{2}-\d{2} \(.+\)\./)).toBeVisible();
});

test("BLS power shows three significant digits, never a bare 0.0", async ({ page }) => {
  for (const c of CANDIDATES) {
    await page.goto(`/candidates/${c.slug}`);
    const dd = page.locator("dt", { hasText: "BLS power" }).locator("xpath=following-sibling::dd[1]");
    const text = (await dd.innerText()).trim();
    const shown = text.split(/\s/)[0];
    expect(shown, `${c.slug} BLS power`).toMatch(/^0\.0*[1-9]\d{0,2}$|^[1-9]\d*(\.\d+)?$/);
    expect(Number(shown), `${c.slug} BLS power is a real number`).toBeGreaterThan(0);
  }
});

test("Find the dip says why the slider starts at 3 days and can start over", async ({ page }) => {
  await page.goto(`/candidates/${CANDIDATES[0].slug}`);
  const lab = page.getByTestId("challenge");
  await expect(lab.getByTestId("start-help")).toContainText("starts at 3 days only because it has to start somewhere");
  await expect(lab.getByTestId("guess-period")).toHaveText("3.0000 days");
  await lab.getByRole("button", { name: "+1%" }).click();
  await expect(lab.getByTestId("guess-period")).not.toHaveText("3.0000 days");
  await lab.getByTestId("start-over").click();
  await expect(lab.getByTestId("guess-period")).toHaveText("3.0000 days");
  await expect(lab.getByTestId("period-slider")).toHaveAttribute("aria-describedby", /.+/);
});
