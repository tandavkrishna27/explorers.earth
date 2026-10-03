import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'public-shell-continuity.spec.ts',
  outputDir: '../.artifacts/public-shell-continuity/results',
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 12_000 },
  reporter: [['line'], ['json', { outputFile: '../.artifacts/public-shell-continuity/report.json' }]],
  use: {
    baseURL: `http://127.0.0.1:${process.env.CATEGORY_FIXTURE_PORT ?? 55179}`,
    headless: true,
    serviceWorkers: 'block',
    storageState: { cookies: [], origins: [] },
    actionTimeout: 12_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions: { args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-quic'] },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --config e2e/public-shell-continuity.vite.config.ts',
    url: `http://127.0.0.1:${process.env.CATEGORY_FIXTURE_PORT ?? 55179}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
