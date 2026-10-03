import { defineConfig } from '@playwright/test';
import base from './playwright.category-navigation.config';
export default defineConfig({ ...base, testMatch: 'music-publish-controls.spec.ts', outputDir: '../.artifacts/music-publishing/results',
  reporter: [['line'], ['json', { outputFile: '../.artifacts/music-publishing/report.json' }]],
  use: { ...base.use, baseURL: `http://127.0.0.1:${process.env.CATEGORY_FIXTURE_PORT ?? 55179}` },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config e2e/music-publishing.vite.config.ts', url: `http://127.0.0.1:${process.env.CATEGORY_FIXTURE_PORT ?? 55179}`, reuseExistingServer: false, timeout: 120000 },
});
