import { defineConfig } from '@playwright/test';
import base from './playwright.category-navigation.config';

const port = Number(process.env.WP11_SAMPLES_PORT ?? 55181);
// WP11 first-visit sample screens on the category-navigation fixture plus the opt-in sample
// dataset (e2e/setup/wp11-samples-fixture.ts). Writes PNGs to docs/superpowers/screenshots/wp11/.
export default defineConfig({ ...base, testMatch: 'wp11-samples-screens.spec.ts',
  outputDir: '../.artifacts/wp11-samples/results',
  reporter: [['line'], ['json', { outputFile: '../.artifacts/wp11-samples/report.json' }]],
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}` },
  webServer: { ...base.webServer, command: 'node node_modules/vite/bin/vite.js --config e2e/category-navigation.vite.config.ts',
    url: `http://127.0.0.1:${port}`, env: { CATEGORY_FIXTURE_PORT: String(port) } },
});
