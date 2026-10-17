import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.GENERAL_E2E_PORT ?? 55241);

export default defineConfig({
  testDir: './e2e',
  outputDir: '../.artifacts/general-e2e/results',
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    serviceWorkers: 'block',
    storageState: { cookies: [], origins: [] },
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions: {
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-quic'],
    },
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --config e2e/general.vite.config.ts',
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { ...process.env, GENERAL_E2E_PORT: String(port) },
  },
});
