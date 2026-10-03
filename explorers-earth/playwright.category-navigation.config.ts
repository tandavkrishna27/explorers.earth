import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: /category-navigation-[ab]\.spec\.ts/,
  outputDir: '../.artifacts/category-navigation/results',
  workers: 1, retries: 0, timeout: 60_000, expect: { timeout: 12_000 }, reporter: [['line'], ['json', { outputFile: '../.artifacts/category-navigation/report.json' }]],
  use: {
    ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${process.env.CATEGORY_FIXTURE_PORT ?? 55178}`, headless: true,
    serviceWorkers: 'block', storageState: { cookies: [], origins: [] },
    actionTimeout: 12_000,
    trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'off',
    launchOptions: { args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-quic'] },
  },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config e2e/category-navigation.vite.config.ts', url: `http://127.0.0.1:${process.env.CATEGORY_FIXTURE_PORT ?? 55178}`, reuseExistingServer: false, timeout: 120_000 },
});
