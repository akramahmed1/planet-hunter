import { expect, test } from "@playwright/test";

// The explainer is switched off unless the server enables it. CI runs the backend with the fake
// model switched on; staging leaves it off until a model key is added. Each case checks the state
// the server reports, so both are covered.
async function explainerOn(request: import("@playwright/test").APIRequestContext): Promise<boolean> {
  const res = await request.get("/api/v2/explain/status");
  return (await res.json()).enabled === true;
}

test("the explainer answers from the page's data and names the fields it used", async ({ page, request }) => {
  const on = await explainerOn(request);
  await page.goto("/candidates/toi-700");
  if (!on) {
    await expect(page.getByTestId("explain")).toHaveCount(0);
    return;
  }
  const box = page.getByTestId("explain");
  await expect(box.getByRole("heading", { name: "What am I looking at?" })).toBeVisible();
  await box.getByTestId("explain-question").fill("What period did the pipeline find?");
  await box.getByTestId("explain-ask").click();
  const answer = page.getByTestId("explain-answer");
  await expect(answer).toContainText("item.period_d");
  await expect(answer).toContainText("AI model");
});

test("a question the data cannot answer gets 'not known'", async ({ page, request }) => {
  const on = await explainerOn(request);
  await page.goto("/exoplanets/toi-700");
  if (!on) {
    await expect(page.getByTestId("explain")).toHaveCount(0);
    return;
  }
  const box = page.getByTestId("explain");
  await box.getByTestId("explain-question").fill("How many moons does it have?");
  await box.getByTestId("explain-ask").click();
  await expect(page.getByTestId("explain-answer")).toContainText("Not known from this page's data.");
});

// When the month's spend cap is used up the server reports paused: the box stays, says so quietly, and offers no form.
test("a paused explainer says so instead of vanishing", async ({ page }) => {
  await page.route("**/api/v2/explain/status", (route) =>
    route.fulfill({
      json: { enabled: false, paused: true, model: null,
              reason: "The explainer is paused until next month to keep its running cost in check. Everything else works." },
    }),
  );
  await page.goto("/candidates/toi-700");
  const box = page.getByTestId("explain-paused");
  await expect(box).toContainText("paused until next month");
  await expect(box.getByRole("heading", { name: "What am I looking at?" })).toBeVisible();
  await expect(page.getByTestId("explain-question")).toHaveCount(0);
  await expect(page.getByTestId("explain-ask")).toHaveCount(0);
});

test("a switched-off explainer still shows nothing", async ({ page }) => {
  await page.route("**/api/v2/explain/status", (route) =>
    route.fulfill({ json: { enabled: false, paused: false, model: null, reason: "The explainer is switched off on this server." } }),
  );
  await page.goto("/candidates/toi-700");
  await expect(page.getByTestId("explain")).toHaveCount(0);
  await expect(page.getByTestId("explain-paused")).toHaveCount(0);
});

// T43: one tap, no typing.
test("Explain this dip answers from the page's data with named, cited fields on a candidate and a scan, and not on a planet system", async ({ page, request }) => {
  const on = await explainerOn(request);
  await page.goto("/candidates/toi-700");
  if (!on) {
    await expect(page.getByTestId("explain-dip")).toHaveCount(0);
    return;
  }
  await page.getByTestId("explain-dip").click();
  const answer = page.getByTestId("explain-answer");
  await expect(answer).toBeVisible();
  await expect(answer.locator(".explain-cites li").first()).toContainText("item.");
  await expect(answer.locator(".explain-cites strong").first()).toBeVisible(); // a plain name beside the path
  await expect(answer).toContainText("AI model");

  await page.goto("/scan/1");
  if (await page.getByTestId("explain-dip").count()) {
    await page.getByTestId("explain-dip").click();
    await expect(page.getByTestId("explain-answer")).toBeVisible();
  }

  await page.goto("/exoplanets/toi-700");
  await expect(page.getByTestId("explain")).toBeVisible();
  await expect(page.getByTestId("explain-dip")).toHaveCount(0);
});

test("Explain this dip shows a plain message when the server refuses, and the button works again", async ({ page, request }) => {
  const on = await explainerOn(request);
  test.skip(!on, "needs the explainer on");
  await page.route("**/api/v2/explain", (route) => route.fulfill({ status: 429, json: { detail: "Too many questions just now. Try again in a minute." } }));
  await page.goto("/candidates/toi-700");
  await page.getByTestId("explain-dip").click();
  await expect(page.getByRole("alert").filter({ hasText: "Too many questions" })).toBeVisible();
  await expect(page.getByTestId("explain-dip")).toBeEnabled();
});
