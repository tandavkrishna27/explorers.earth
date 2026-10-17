import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "account-lifecycle.spec.ts",
  outputDir: ".artifacts/lifecycle-isolated/results",
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:55176",
    headless: true,
    serviceWorkers: "block",
    storageState: { cookies: [], origins: [] },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    launchOptions: { args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "--disable-quic"] },
  },
  projects: [
    { name: "lifecycle-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "lifecycle-mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npx vite --config e2e/account-lifecycle.vite.config.ts",
    url: "http://127.0.0.1:55176",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
