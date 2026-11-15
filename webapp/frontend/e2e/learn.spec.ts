import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The lesson used here is content/lessons/03-distances-and-light-time.json.
const LESSON = "/learn/distances-and-light-time";

async function toQuiz(page: Page) {
  await page.goto(LESSON);
  for (let i = 0; i < 3; i++) await page.getByTestId("lesson-next").click();
  await expect(page.getByRole("heading", { name: "Quiz", level: 2 })).toBeFocused();
}

async function answerAllRight(page: Page) {
  await page.getByTestId("quiz-earth_minutes-input").fill("8,3");
  await page.getByTestId("quiz-earth_minutes-check").click();
  await page.getByTestId("quiz-neptune_hours-input").fill("4.2");
  await page.getByTestId("quiz-neptune_hours-check").click();
  await page.getByTestId("quiz-sun_off-choice-1").check();
  await page.getByTestId("quiz-sun_off-check").click();
}

test("the lesson list shows every lesson with progress and badges", async ({ page }) => {
  await page.goto("/learn");
  const cards = page.getByTestId("lesson-list").locator("li");
  await expect(cards).toHaveCount(8);
  await expect(page.getByTestId("learn-badges")).toContainText("0 of 8");
  await expect(cards.first()).toContainText("Not started");
  await page.getByRole("link", { name: "Distances and light-time" }).click();
  await expect(page).toHaveURL(new RegExp(`${LESSON}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Distances and light-time");
});

test("steps move with Back and Next, and every fact opens its source", async ({ page }) => {
  await page.goto(LESSON);
  const step = page.getByTestId("lesson-step");
  await expect(step).toContainText("Step 1 of 3");
  await expect(page.getByTestId("lesson-back")).toBeDisabled();
  await step.getByRole("button", { name: "Fact 1: show source" }).click();
  const sheet = page.getByRole("dialog", { name: "Source: Fact 1" });
  await expect(sheet.getByRole("link", { name: /NIST CODATA/ })).toHaveAttribute("href", /^https:\/\/physics\.nist\.gov\//);
  await page.keyboard.press("Escape");

  await page.getByTestId("lesson-next").click();
  await expect(step).toContainText("Step 2 of 3");
  await expect(page.getByRole("heading", { name: "The astronomical unit" })).toBeFocused();
  await page.getByTestId("lesson-back").click();
  await expect(step).toContainText("Step 1 of 3");
  await page.getByRole("button", { name: "Step 3: Light time" }).click();
  await expect(step).toContainText("8 minutes 19 seconds");
  await expect(page.getByTestId("lesson-next")).toHaveText("Take the quiz");
});

test("a wrong answer explains itself and can be retried; a full set earns the badge and persists", async ({ page }) => {
  await toQuiz(page);
  const q = page.getByTestId("quiz-earth_minutes");
  await q.getByRole("textbox").fill("20");
  await page.getByTestId("quiz-earth_minutes-check").click();
  const result = page.getByTestId("quiz-earth_minutes-result");
  await expect(result).toContainText("Not quite.");
  await expect(result).toContainText("The answer is 8.3 minutes");
  await expect(result).toContainText("8 minutes 19 seconds");
  await page.getByTestId("quiz-earth_minutes-retry").click();
  await expect(result).toBeHidden();

  await page.getByTestId("quiz-sun_off-choice-0").check();
  await page.getByTestId("quiz-sun_off-check").click();
  await expect(page.getByTestId("quiz-sun_off-result")).toContainText("Not quite.");
  await expect(page.getByTestId("quiz-sun_off-result")).toContainText("The answer is About 8 minutes later");
  await page.getByTestId("quiz-sun_off-retry").click();

  await expect(page.getByTestId("badge-earned")).toHaveCount(0);
  await answerAllRight(page);
  await expect(page.getByTestId("quiz-earth_minutes-result")).toContainText("Right.");
  await expect(page.getByTestId("quiz-score")).toContainText("3 of 3");
  await expect(page.getByTestId("badge-earned")).toContainText("Light chaser");

  await page.goto("/learn");
  await expect(page.getByTestId("learn-badges")).toContainText("1 of 8");
  await expect(page.getByTestId("learn-badges")).toContainText("Light chaser");
  await expect(page.getByTestId("lesson-list").locator("li").nth(2)).toContainText("Badge earned");
  await page.reload();
  await expect(page.getByTestId("learn-badges")).toContainText("1 of 8");
});

test("a number that is not a number cannot be checked", async ({ page }) => {
  await toQuiz(page);
  await page.getByTestId("quiz-earth_minutes-input").fill("eight");
  await expect(page.getByTestId("quiz-earth_minutes")).toContainText("That is not a number yet.");
  await expect(page.getByTestId("quiz-earth_minutes-check")).toBeDisabled();
});

test("lessons and quizzes still work when storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("storage blocked");
      },
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await toQuiz(page);
  await answerAllRight(page);
  await expect(page.getByTestId("badge-earned")).toBeVisible();
  await expect(page.getByText("Your progress cannot be saved on this device")).toBeVisible();
  expect(errors).toEqual([]);
});

test("an unknown lesson is a 404", async ({ page }) => {
  const res = await page.goto("/learn/no-such-lesson");
  expect(res?.status()).toBe(404);
});

test("no serious axe violations in the quiz after answering", async ({ page }) => {
  await toQuiz(page);
  await page.getByTestId("quiz-earth_minutes-input").fill("20");
  await page.getByTestId("quiz-earth_minutes-check").click();
  await page.getByTestId("quiz-sun_off-choice-1").check();
  await page.getByTestId("quiz-sun_off-check").click();
  await expect(page.getByTestId("quiz-sun_off-result")).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
});
