import { defineConfig, devices } from "@playwright/test";

// This suite owns its no-proxy companion on the exact loopback fixture port.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "profile-tab-hit-testing.spec.ts",
  outputDir: ".artifacts/profile-tab-hit-testing/results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: [["line"], ["json"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:55175",
    headless: true,
    actionTimeout: 5_000,
    navigationTimeout: 120_000,
    serviceWorkers: "block",
    storageState: { cookies: [], origins: [] },
    trace: "off",
    screenshot: "off",
    video: "off",
    launchOptions: {
      args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "--disable-quic"],
    },
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js --config e2e/profile-tab-hit-testing.vite.config.ts",
    url: "http://127.0.0.1:55175",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
