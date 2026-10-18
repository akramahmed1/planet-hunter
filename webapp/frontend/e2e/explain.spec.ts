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
