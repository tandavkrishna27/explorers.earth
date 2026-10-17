import { defineConfig, devices } from '@playwright/test';
import base from './playwright.music-presentation.config';

export default defineConfig({
  ...base,
  grep: /queue first|320px expanded|ready and empty light/,
  outputDir: '../.artifacts/music-presentation-cross-browser/results',
  reporter: [['line'], ['json', { outputFile: '../.artifacts/music-presentation-cross-browser/report.json' }]],
  projects: [
    { name: 'presentation-firefox', use: { ...devices['Desktop Firefox'], launchOptions: {} } },
    { name: 'presentation-webkit', use: { ...devices['Desktop Safari'], launchOptions: {} } },
  ],
});
