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
    // `--host-resolver-rules` and `--disable-quic` are Chromium switches. Inherited by
    // this lane's other two projects, they reached WebKit's `pw_run.sh`, which exits on
    // an option it does not know - so all ten WebKit cases failed at
    // `browserType.launch` with "Target page, context or browser has been closed" on
    // every scheduled run, while Chromium and Firefox passed. Firefox ignores the
    // switches, so the resolver block was already inert for everything but Chromium and
    // clearing it here costs no coverage; the fixture is served from 127.0.0.1 with
    // service workers blocked, and the one case that asserts no external traffic reads
    // what was copied rather than the resolver. This is the same per-project
    // `launchOptions: {}` override the (since removed) Music presentation
    // cross-browser config used for its own Firefox and WebKit projects.
    { name: 'firefox', use: { ...devices['Desktop Firefox'], launchOptions: {} } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], launchOptions: {} } },
  ],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --config e2e/public-shell-continuity.vite.config.ts',
    url: `http://127.0.0.1:${process.env.CATEGORY_FIXTURE_PORT ?? 55179}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
