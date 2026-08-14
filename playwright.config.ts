import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const productionServer = process.env.PLAYWRIGHT_E2E_PRODUCTION === "true";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: externalBaseUrl ?? "http://127.0.0.1:3100",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    {
      name: "mobile-webkit",
      testMatch: /early-feedback\.spec\.ts/,
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: productionServer
          ? "pnpm start --port 3100"
          : "pnpm dev --port 3100",
        url: "http://127.0.0.1:3100",
        reuseExistingServer: !process.env.CI,
      },
});
