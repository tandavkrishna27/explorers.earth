import { defineConfig } from '@playwright/test';
import base from './playwright.category-navigation.config';

export default defineConfig({ ...base, testMatch: 'category-navigation-b.spec.ts',
  outputDir: '../.artifacts/category-navigation-b/results',
  reporter: [['line'], ['json', { outputFile: '../.artifacts/category-navigation-b/report.json' }]],
});
