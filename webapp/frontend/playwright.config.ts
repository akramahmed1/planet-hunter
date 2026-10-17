import { defineConfig } from "@playwright/test";

// Runs against local servers by default (started below, or reused if already
// up, as in CI). Set PW_BASE_URL to test a deployed site such as staging.
const remote = process.env.PW_BASE_URL;
const baseURL = remote ?? "http://127.0.0.1:3000";

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
      use: { browserName: "chromium", viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: remote
    ? undefined
    : [
        {
          command: "python3 -m uvicorn app:app --port 8000",
          cwd: "../backend",
          url: "http://127.0.0.1:8000/api/health",
          reuseExistingServer: true,
          timeout: 60_000,
        },
        {
          command: "npm run start -- --port 3000",
          url: "http://127.0.0.1:3000",
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ],
});
