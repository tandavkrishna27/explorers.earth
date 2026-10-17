import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "music-public-contract.spec.ts",
  grep: /all 32 permission masks/,
  outputDir: "../.artifacts/music-permissions-isolated/results",
  workers: 1, retries: 0, timeout: 180_000,
  expect: { timeout: 10_000 }, reporter: [['line'], ['json', { outputFile: '../.artifacts/music-permissions-isolated/report.json' }]],
  use: {
    baseURL: "http://127.0.0.1:55177", headless: true, serviceWorkers: "block",
    storageState: { cookies: [], origins: [] }, trace: "retain-on-failure",
    screenshot: "only-on-failure", video: "off",
    launchOptions: { args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "--disable-quic"] },
  },
  projects: [
    { name: "permissions-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "permissions-mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: { command: "node node_modules/vite/bin/vite.js --config e2e/music-permissions.vite.config.ts", url: "http://127.0.0.1:55177", reuseExistingServer: false, timeout: 120_000 },
});
