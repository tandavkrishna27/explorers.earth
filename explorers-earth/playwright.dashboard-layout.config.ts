import { defineConfig } from '@playwright/test';
import base from './playwright.category-navigation.config';

// Geometry guard on the category-navigation fixture: shared page container width, phone header clearance, one title.
export default defineConfig({ ...base, testMatch: 'dashboard-layout.spec.ts',
  outputDir: '../.artifacts/dashboard-layout/results',
  reporter: [['line'], ['json', { outputFile: '../.artifacts/dashboard-layout/report.json' }]],
});
