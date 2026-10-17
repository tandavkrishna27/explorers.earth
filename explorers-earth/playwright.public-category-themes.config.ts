import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: ['public-category-themes.spec.ts', 'public-category-portals.spec.ts', 'public-category-theme-publish.spec.ts'],
  outputDir: '../.artifacts/public-category-themes/results',
  workers: 1, retries: 0, timeout: 90_000, expect: { timeout: 12_000 },
  reporter: [['line'], ['json', { outputFile: process.env.CATEGORY_THEME_REPORT || '../.artifacts/public-category-themes/report.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:55184', headless: true, serviceWorkers: 'block',
    storageState: { cookies: [], origins: [] }, actionTimeout: 12_000,
    trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'off',
    launchOptions: { args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-quic'] },
  },
  projects: [
    { name: 'desktop', testIgnore: 'public-category-theme-publish.spec.ts', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', testIgnore: 'public-category-theme-publish.spec.ts', grepInvert: /@once/, use: { browserName: 'chromium', viewport: { width: 390, height: 900 }, hasTouch: true } },
    { name: 'publish', testMatch: 'public-category-theme-publish.spec.ts', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --config e2e/public-category-themes.vite.config.ts',
    url: 'http://127.0.0.1:55184', reuseExistingServer: false, timeout: 120_000,
  },
});
