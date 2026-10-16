import { defineConfig } from '@playwright/test';
import base from './playwright.category-navigation.config';

export default defineConfig({ ...base, testMatch: 'contained-auth-session.spec.ts',
  outputDir: '../.artifacts/contained-auth-session/results',
  reporter: [['line'], ['json', { outputFile: '../.artifacts/contained-auth-session/report.json' }]],
});
