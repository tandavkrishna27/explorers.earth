import { defineConfig, devices } from '@playwright/test';

// public-scroll.spec.ts drives the contained category-navigation fixture, whose only
// permitted authority is https://music-fixture.test and whose Maps import is aliased
// to e2e/setup/maps-fixture.tsx. Those come from e2e/public-scroll.vite.config.ts, so
// the spec must run against that server, not the default `npm run dev` one.
const port = 55183; // fixed by e2e/public-scroll.vite.config.ts

export default defineConfig({
  testDir: './e2e', testMatch: /public-scroll\.spec\.ts$/,
  outputDir: '../.artifacts/public-scroll/results',
  workers: 1, retries: 0, timeout: 60_000, expect: { timeout: 12_000 },
  reporter: [['line'], ['json', { outputFile: '../.artifacts/public-scroll/report.json' }]],
  use: {
    ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${port}`, headless: true,
    serviceWorkers: 'block', storageState: { cookies: [], origins: [] },
    actionTimeout: 12_000,
    trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'off',
    launchOptions: { args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-quic'] },
  },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config e2e/public-scroll.vite.config.ts', url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 120_000 },
});
