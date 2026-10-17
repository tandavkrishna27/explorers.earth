import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "music-presentation.spec.ts",

  outputDir: "../.artifacts/music-presentation-isolated/results",
  workers: 1, retries: 0, timeout: 180_000,
  expect: { timeout: 10_000 }, reporter: [['line'], ['json', { outputFile: '../.artifacts/music-presentation-isolated/report.json' }]],
  use: {
    baseURL: "http://127.0.0.1:55180", headless: true, serviceWorkers: "block",
    storageState: { cookies: [], origins: [] }, trace: "retain-on-failure",
    screenshot: "only-on-failure", video: "off",
    launchOptions: { args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "--disable-quic"] },
  },
  projects: [
    { name: "presentation-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "presentation-mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: { command: "node node_modules/vite/bin/vite.js --config e2e/music-presentation.vite.config.ts", url: "http://127.0.0.1:55180", reuseExistingServer: false, timeout: 120_000 },
});
