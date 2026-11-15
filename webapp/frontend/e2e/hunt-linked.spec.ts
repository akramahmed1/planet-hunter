import { expect, test } from "@playwright/test";

// T35: the light curve and the periodogram are linked to the period chosen in "Find the dip".

type Lc = { time_btjd: number[]; flux_ppm: number[]; signal: { t0_btjd: number; period_d: number; duration_d: number } };
type Pg = { period_d: number[]; power: number[] };

async function load(page: import("@playwright/test").Page, slug: string) {
  const lc = (await (await page.request.get(`/api/v2/lightcurves/${slug}`)).json()) as Lc;
  const pg = (await (await page.request.get(`/api/v2/periodogram/${slug}`)).json()) as Pg;
  await page.goto(`/candidates/${slug}`);
  await expect(page.getByTestId("pg-chart").locator("canvas")).toBeVisible();
  return { lc, pg };
}

// Where a period sits on the periodogram's x axis, in screen pixels (the whole range is showing).
async function pixelFor(page: import("@playwright/test").Page, pg: Pg, period: number) {
  const over = page.getByTestId("pg-chart").locator(".u-over");
  await over.scrollIntoViewIfNeeded(); // a mouse click only lands on what is inside the window
  const box = (await over.boundingBox())!;
  const lo = pg.period_d[0], hi = pg.period_d[pg.period_d.length - 1];
  return { x: box.x + ((period - lo) / (hi - lo)) * box.width, y: box.y + box.height / 2 };
}

const expectedBands = (lc: Lc, period: number) => {
  const tMin = lc.time_btjd[0], tMax = lc.time_btjd[lc.time_btjd.length - 1];
  const d = lc.signal.duration_d, t0 = lc.signal.t0_btjd;
  let n = 0;
  for (let k = Math.ceil((tMin - d / 2 - t0) / period); t0 + k * period - d / 2 <= tMax; k++) n++;
  return n;
};

test("tapping the periodogram beside the pipeline's peak folds the light curve at that peak", async ({ page }) => {
  const { lc, pg } = await load(page, "toi-700");
  // The tallest point near the pipeline's period is the peak the tap should land on.
  const near = pg.period_d.map((p, i) => [p, pg.power[i]] as const).filter(([p]) => Math.abs(p - lc.signal.period_d) / lc.signal.period_d < 0.02);
  const peak = near.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  const at = await pixelFor(page, pg, peak * 1.012); // a little to the side, as a finger would land
  await page.mouse.click(at.x, at.y);
  await expect(page.getByTestId("guess-period")).toHaveText(`${peak.toFixed(4)} days`);
  await expect(page.getByTestId("pg-chart")).toHaveAttribute("data-guess", String(peak));
  // And the score now reflects it: the peak is the pipeline's answer.
  await page.getByTestId("check-guess").click();
  await expect(page.getByTestId("score")).toContainText(/\d+ points/);
});

test("the light curve shows a band for every orbit at the chosen period, and the bands sit on the real dips", async ({ page }) => {
  const { lc, pg } = await load(page, "toi-700");
  await expect(page.getByTestId("lc-chart")).toHaveAttribute("data-bands", String(expectedBands(lc, 3)));
  await page.getByRole("button", { name: "Show the answer" }).click();
  await page.getByRole("button", { name: "Fold there" }).click();
  const P = lc.signal.period_d;
  await expect(page.getByTestId("lc-chart")).toHaveAttribute("data-bands", String(expectedBands(lc, P)));
  // The link means something: at the pipeline's period the points inside the bands are dimmer than the rest.
  const half = lc.signal.duration_d / 2;
  const inside: number[] = [], outside: number[] = [];
  lc.time_btjd.forEach((t, i) => {
    const ph = ((t - lc.signal.t0_btjd + P / 2) % P + P) % P - P / 2;
    (Math.abs(ph) <= half ? inside : outside).push(lc.flux_ppm[i]);
  });
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  expect(inside.length).toBeGreaterThan(0);
  expect(mean(inside)).toBeLessThan(mean(outside) - 50);
  expect(pg.period_d.length).toBeGreaterThan(100);
});

test("moving the slider moves the line on the periodogram and the bands on the light curve", async ({ page }) => {
  const { lc } = await load(page, "toi-270");
  const pgChart = page.getByTestId("pg-chart");
  const before = Number(await pgChart.getAttribute("data-guess"));
  expect(before).toBeCloseTo(3, 3);
  await page.getByRole("button", { name: "+1%" }).click();
  await expect.poll(async () => Number(await pgChart.getAttribute("data-guess"))).toBeGreaterThan(before * 1.005);
  const now = Number(await pgChart.getAttribute("data-guess"));
  await expect(page.getByTestId("lc-chart")).toHaveAttribute("data-bands", String(expectedBands(lc, now)));
});

test("dragging across the periodogram zooms it and does not change the period", async ({ page }) => {
  const { pg } = await load(page, "toi-700");
  const a = await pixelFor(page, pg, 2);
  const b = await pixelFor(page, pg, 6);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, a.y, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("guess-period")).toHaveText("3.0000 days");
});

test("the slider and buttons still do everything the periodogram tap does, for keyboard users", async ({ page }) => {
  await load(page, "toi-700");
  const slider = page.getByTestId("period-slider");
  await slider.focus();
  const before = await page.getByTestId("guess-period").innerText();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("guess-period")).not.toHaveText(before);
  await expect(page.getByRole("heading", { name: "The periodogram" })).toBeVisible();
  await expect(page.getByText(/The slider does the same, one step at a time/)).toBeVisible();
});
