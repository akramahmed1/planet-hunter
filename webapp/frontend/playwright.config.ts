import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Runs against local servers by default (started below, or reused if already
// up, as in CI). Set PW_BASE_URL to test a deployed site such as staging.
const remote = process.env.PW_BASE_URL;
const baseURL = remote ?? "http://127.0.0.1:3000";
// Screenshot projects only exist when asked for (SCREENSHOTS=1), so the normal run stays as fast as before.
const shots = !!process.env.SCREENSHOTS;

// Firefox and WebKit projects only exist when asked for (CROSS_BROWSER=1) and only run the main flows listed in
// e2e/CROSS_BROWSER_SPECS, so the normal run and a developer's machine need only Chromium.
const cross = !!process.env.CROSS_BROWSER;
const crossSpecs = new RegExp(
  readFileSync(join(__dirname, "e2e", "CROSS_BROWSER_SPECS"), "utf8")
    .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile",
      testIgnore: /down\.spec|classroom-off\.spec|screenshots\.spec/,
      use: {
        browserName: "chromium",
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "desktop",
      testIgnore: /down\.spec|classroom-off\.spec|screenshots\.spec/,
      use: { browserName: "chromium", viewport: { width: 1280, height: 800 } },
    },
    ...(cross
      ? [
          { name: "desktop-firefox", testMatch: crossSpecs, use: { ...devices["Desktop Firefox"], viewport: { width: 1280, height: 800 } } },
          // WebKit on a Linux CI machine runs the longest flows about 2.5 times slower than Chromium (the Classroom
          // flow took 11 s in Chromium and 29 to 30 s in WebKit against the 30 s limit), so it gets twice the time.
          { name: "desktop-webkit", testMatch: crossSpecs, timeout: 60_000, use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 800 } } },
          // Safari on a phone: touch and the small screen. Firefox has no mobile emulation in Playwright.
          { name: "mobile-webkit", testMatch: crossSpecs, timeout: 60_000, use: { ...devices["iPhone 13"] } },
        ]
      : []),
    // Screenshots for review (e2e/screenshots.spec.ts): a Pixel-class phone in Chrome and a laptop.
    ...(shots
      ? [
          {
            name: "screenshots-phone",
            testMatch: /screenshots\.spec/,
            use: {
              browserName: "chromium" as const,
              viewport: { width: 390, height: 844 },
              deviceScaleFactor: 3,
              isMobile: true,
              hasTouch: true,
              userAgent:
                "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
            },
          },
          {
            name: "screenshots-laptop",
            testMatch: /screenshots\.spec/,
            use: { browserName: "chromium" as const, viewport: { width: 1440, height: 900 } },
          },
        ]
      : []),
    // Every live source down: a second backend whose upstream calls all fail, and a second server
    // rendering from it (e2e/down.spec.ts). That backend also has Classroom switched OFF, so the same server
    // proves the off state in the browser (e2e/classroom-off.spec.ts). Not run against a deployed site.
    ...(remote
      ? []
      : [
          {
            name: "upstream-down",
            testMatch: /down\.spec|classroom-off\.spec/,
            use: {
              browserName: "chromium" as const,
              baseURL: "http://127.0.0.1:3001",
              viewport: { width: 375, height: 812 },
            },
          },
        ]),
  ],
  webServer: remote
    ? undefined
    : [
        {
          command: "python3 -m uvicorn app:app --port 8000",
          cwd: "../backend",
          // Answer external requests with the saved real samples, so tests never hit the network.
          env: { PH_OFFLINE_FIXTURES: "1", CLASSROOM_ENABLED: "1" },
          url: "http://127.0.0.1:8000/api/health",
          reuseExistingServer: true,
          timeout: 60_000,
        },
        {
          command: "python3 -m uvicorn app:app --port 8001",
          cwd: "../backend",
          // No database (so no shared cache) and every upstream call fails.
          env: { PH_OFFLINE_FIXTURES: "down", DATABASE_URL: "", CLASSROOM_ENABLED: "0" },
          url: "http://127.0.0.1:8001/api/health",
          reuseExistingServer: true,
          timeout: 60_000,
        },
        {
          command: "npm run start -- --port 3001",
          env: { PH_SERVER_API_BASE: "http://127.0.0.1:8001" },
          url: "http://127.0.0.1:3001",
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: "npm run start -- --port 3000",
          // /error-check throws only when this is set, so the error page can be tested end to end.
          env: { PH_ERROR_TEST: "1" },
          url: "http://127.0.0.1:3000",
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ],
});
