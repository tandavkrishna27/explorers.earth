import { defineConfig } from '@playwright/test';
import base from './playwright.category-navigation.config';

export default defineConfig({ ...base, testMatch: 'category-navigation-a.spec.ts',
  outputDir: '../.artifacts/category-navigation-a/results',
  reporter: [['line'], ['json', { outputFile: '../.artifacts/category-navigation-a/report.json' }]],
});
