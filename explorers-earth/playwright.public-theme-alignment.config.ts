import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "public-theme-alignment.spec.ts",
  outputDir: "../.artifacts/public-theme-alignment-20260901/playwright-results",
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: [["line"], ["json", { outputFile: "../.artifacts/public-theme-alignment-20260901/playwright-report.json" }]],
  use: {
    baseURL: "http://127.0.0.1:55180",
    headless: true,
    serviceWorkers: "block",
    storageState: { cookies: [], origins: [] },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    launchOptions: { args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "--disable-quic"] },
  },
  projects: [
    { name: "theme-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "theme-mobile", use: { ...devices["Pixel 7"], viewport: { width: 320, height: 900 } } },
  ],
  webServer: {
    command: "node node_modules/vite/bin/vite.js --config e2e/music-presentation.vite.config.ts",
    url: "http://127.0.0.1:55180",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
