import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The map view gives every body a stable, labelled button, so most taps use it.
// "Inner planets" spreads Earth and Mars apart enough to tap each one.
async function openMap(page: Page, zoom: "all" | "inner" = "inner") {
  await page.goto("/solar-system");
  // The View toggle appears once the page has checked for WebGL (it has it in these tests).
  await page.getByRole("radio", { name: "Flat map view" }).check();
  if (zoom === "inner") await page.getByRole("radio", { name: "Show the inner planets" }).check();
  await expect(page.getByTestId("orbit-map")).toBeVisible();
}

// Tap the planet itself (its hit circle), not the middle of its label's box.
async function tapBody(page: Page, id: string) {
  await page.getByTestId(`map-body-${id}`).locator("circle").first().click();
}

async function setUnits(page: Page, label: string) {
  await page.getByTestId("units-button").click();
  await page.getByRole("dialog", { name: "Units" }).getByLabel(label).check();
  await page.keyboard.press("Escape");
}

test("tapping a planet opens its card with sourced values", async ({ page }) => {
  await openMap(page);
  await tapBody(page, "mars");
  const card = page.getByRole("dialog", { name: "Mars" });
  await expect(card).toBeVisible();
  await expect(card.getByText("Average temperature", { exact: true })).toBeVisible();
  await expect(card.getByTestId("sun-distance")).toHaveText(/million mi$/);
  await expect(card.getByTestId("earth-distance")).toHaveText(/million mi$/);
  await expect(card.getByTestId("light-time")).toHaveText(/min \d+ s$/);
  await expect(card.getByText("Orbit gap to Earth", { exact: true })).toBeVisible();
  await expect(card.getByText("Orbit gap to Jupiter", { exact: true })).toBeVisible();
  await expect(card.getByText("Length of day", { exact: true })).toBeVisible();
  await expect(card.getByText("Length of year", { exact: true })).toBeVisible();

  // Every value opens its source.
  const sources = card.getByRole("button", { name: /show source/ });
  expect(await sources.count()).toBeGreaterThanOrEqual(9);
  await card.getByRole("button", { name: "Mars distance from Earth: show source" }).click();
  const src = page.getByRole("dialog", { name: "Source: Mars distance from Earth" });
  await expect(src.getByRole("link").first()).toHaveAttribute("href", /^https:\/\//);
  await expect(src.getByText("computed", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(src).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
});

test("the body buttons open the same cards, including the Sun", async ({ page }) => {
  await page.goto("/solar-system");
  await page.getByTestId("pick-sun").click();
  const card = page.getByRole("dialog", { name: "Sun" });
  await expect(card.getByText("Effective temperature", { exact: true })).toBeVisible();
  await expect(card.getByTestId("earth-distance")).toHaveText(/million mi$/);
  await expect(card.getByTestId("sun-distance")).toHaveCount(0);
});

test("tapping empty space opens the deep-space card", async ({ page }) => {
  await openMap(page);
  const space = page.getByTestId("map-space");
  await space.scrollIntoViewIfNeeded();
  const box = (await space.boundingBox())!;
  // Bottom-left corner: clear of every body and of the sticky top bar.
  await space.click({ position: { x: 8, y: box.height - 8 } });
  const card = page.getByRole("dialog", { name: "Deep space" });
  await expect(card.getByTestId("deep-space-temp")).toHaveText("about -455 °F");
  await expect(card.getByText(/-270 °C/)).toBeVisible();
  await card.getByRole("button", { name: /show source/ }).click();
  await expect(page.getByRole("dialog", { name: /^Source:/ }).getByRole("link"))
    .toHaveAttribute("href", "https://arxiv.org/abs/0911.1955");
});

test("switching units updates the card and the deep-space value", async ({ page }) => {
  await openMap(page);
  await tapBody(page, "earth");
  let card = page.getByRole("dialog", { name: "Earth" });
  await expect(card.getByTestId("temp-value").first()).toHaveText(/°F$/);
  await expect(card.getByTestId("sun-distance")).toHaveText(/ mi$/);
  await page.keyboard.press("Escape");

  await setUnits(page, "Celsius");
  await setUnits(page, "Kilometers");
  await tapBody(page, "earth");
  card = page.getByRole("dialog", { name: "Earth" });
  await expect(card.getByTestId("temp-value").first()).toHaveText("15 °C");
  await expect(card.getByTestId("sun-distance")).toHaveText(/ km$/);
  await page.keyboard.press("Escape");

  await setUnits(page, "Kelvin");
  await page.getByTestId("pick-deep-space").click();
  await expect(page.getByTestId("deep-space-temp")).toHaveText("about 2.7 K");
});

test("measure mode shows the distance between two bodies", async ({ page }) => {
  await openMap(page);
  await page.getByRole("radio", { name: /^Measure/ }).check();
  await tapBody(page, "earth");
  await expect(page.getByTestId("measure-panel")).toContainText("Earth selected");
  await tapBody(page, "mars");
  const dist = page.getByTestId("measure-distance");
  await expect(dist).toHaveText(/million mi$/);
  await expect(page.getByTestId("measure-light")).toHaveText(/Light takes .*min.* to cross it\./);
  await expect(page.getByTestId("measure-line")).toBeVisible();
  // Measuring opens no card.
  await expect(page.getByRole("dialog", { name: "Mars" })).toBeHidden();

  // Same number as the Mars card's distance from Earth.
  const measured = await dist.textContent();
  await page.getByRole("radio", { name: /^Explore/ }).check();
  await tapBody(page, "mars");
  await expect(page.getByRole("dialog", { name: "Mars" }).getByTestId("earth-distance")).toHaveText(measured!);
});

test("tour runs Sun to Neptune with Next and Back and an optional quiz", async ({ page }) => {
  await page.goto("/solar-system");
  await page.getByRole("radio", { name: /^Tour/ }).check();
  const panel = page.getByTestId("tour-panel");
  const title = page.getByTestId("tour-title");
  await expect(title).toHaveText("Sun");
  await expect(panel.getByRole("button", { name: "Back" })).toBeDisabled();
  await panel.getByRole("button", { name: "Next" }).click();
  await expect(title).toHaveText("Mercury");
  await panel.getByRole("button", { name: "Next" }).click();
  await expect(title).toHaveText("Venus");
  await panel.getByRole("button", { name: "Back" }).click();
  await expect(title).toHaveText("Mercury");

  // The quiz is optional: Check stays off until an answer is picked.
  await expect(panel.getByRole("button", { name: "Check" })).toBeDisabled();
  await panel.getByLabel("One day").check();
  await panel.getByRole("button", { name: "Check" }).click();
  await expect(panel.getByTestId("quiz-result")).toHaveText(/^Yes!/);

  for (let i = 0; i < 7; i++) await panel.getByRole("button", { name: "Next" }).click();
  await expect(title).toHaveText("Neptune");
  await expect(panel.getByRole("button", { name: "Next" })).toBeDisabled();
  await expect(page.getByTestId("pick-neptune")).toHaveAttribute("aria-pressed", "true");
});

test("the date controls load positions for another date and come back to today", async ({ page }) => {
  await page.goto("/solar-system");
  const input = page.getByTestId("date-input");
  const today = await input.inputValue();
  await input.fill("1969-07-20");
  await expect(page.getByText(/computed from JPL's approximate formulas/)).toBeVisible();
  await page.getByTestId("pick-mars").click();
  await expect(page.getByRole("dialog", { name: "Mars" })).toContainText("1969-07-20");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Today" }).click();
  await expect(input).toHaveValue(today);
  await expect(page.getByText(/computed from JPL's approximate formulas/)).toBeHidden();
  await expect(page.getByTestId("date-slider")).toHaveAttribute("aria-valuetext", today);
});

test("easy view and true scale say what they show", async ({ page }) => {
  await page.goto("/solar-system");
  await expect(page.getByTestId("scale-note")).toContainText("Distances are to scale");
  await page.getByRole("radio", { name: /^Easy view/ }).check();
  await expect(page.getByTestId("scale-note")).toContainText("The order is right, the spacing is not");
});

test("without WebGL the flat map is shown and everything still works", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error: narrowing the overloads is not useful in a test stub
    HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
      if (type.startsWith("webgl") || type === "experimental-webgl") return null;
      return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
    };
  });
  await page.goto("/solar-system");
  await expect(page.getByTestId("webgl-note")).toBeVisible();
  await expect(page.getByTestId("orbit-map")).toBeVisible();
  await expect(page.getByTestId("scene-3d")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "3D view" })).toHaveCount(0);
  await tapBody(page, "jupiter");
  await expect(page.getByRole("dialog", { name: "Jupiter" })).toBeVisible();
});

test("the 3D view loads after first paint and responds to taps", async ({ page }) => {
  await page.goto("/solar-system");
  // First paint is the map; three.js arrives afterwards.
  const scene = page.getByTestId("scene-3d");
  await expect(scene).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await expect(page.getByTestId("orbit-map")).toHaveCount(0);
  const box = (await scene.boundingBox())!;
  // The camera looks at the Sun, so the centre of the view is the Sun.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole("dialog", { name: "Sun" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.click(box.x + 6, box.y + 6);
  await expect(page.getByRole("dialog", { name: "Deep space" })).toBeVisible();
});

test("the 3D view works with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/solar-system");
  await expect(page.getByTestId("scene-3d")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await page.getByRole("radio", { name: /^Tour/ }).check();
  await page.getByTestId("tour-panel").getByRole("button", { name: "Next" }).click();
  await expect(page.getByTestId("tour-title")).toHaveText("Mercury");
});

test("no serious axe violations with a planet card open", async ({ page }) => {
  await page.goto("/solar-system");
  await page.getByTestId("pick-earth").click();
  await expect(page.getByRole("dialog", { name: "Earth" })).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
});
