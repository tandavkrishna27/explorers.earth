import { defineConfig } from '@playwright/test';
import base from './playwright.category-navigation.config';

const port = Number(process.env.DASHBOARD_LAYOUT_PORT ?? 55179);
// Geometry guard on the category-navigation fixture: shared page container width, phone header and
// bottom-nav clearance, one title. Its own server adds the add-template harness (dashboard-layout.vite.config.ts).
export default defineConfig({ ...base, testMatch: 'dashboard-layout.spec.ts',
  outputDir: '../.artifacts/dashboard-layout/results',
  reporter: [['line'], ['json', { outputFile: '../.artifacts/dashboard-layout/report.json' }]],
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}` },
  webServer: { ...base.webServer, command: 'node node_modules/vite/bin/vite.js --config e2e/dashboard-layout.vite.config.ts', url: `http://127.0.0.1:${port}` },
});
