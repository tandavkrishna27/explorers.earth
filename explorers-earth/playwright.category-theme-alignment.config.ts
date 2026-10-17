import { defineConfig } from '@playwright/test';
import categoryConfig from './playwright.public-category-themes.config';

// Run existing geometry/root/Music checks on the Task 3 owned origin using the
// original inert map fixture. Do not replace its behavior with the loaded adapter.
export default defineConfig({
  ...categoryConfig,
  testMatch: 'public-theme-alignment.spec.ts',
  outputDir: '../.artifacts/category-theme-alignment/results',
  timeout: 180_000,
  reporter: [['line'], ['json', { outputFile: '../.artifacts/category-theme-alignment/report.json' }]],
  projects: [
    { name: 'theme-desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
    { name: 'theme-mobile', use: { browserName: 'chromium', viewport: { width: 320, height: 900 }, hasTouch: true } },
  ],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --config e2e/category-theme-alignment.vite.config.ts',
    url: 'http://127.0.0.1:55184', reuseExistingServer: false, timeout: 120_000,
  },
});
