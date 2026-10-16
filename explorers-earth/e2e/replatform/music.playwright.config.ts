import { defineConfig, devices } from '@playwright/test';
if (!process.env.MUSIC_E2E_FIXTURE_PATH || !/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.PLAYWRIGHT_EXTERNAL_BASE_URL ?? ''))
  throw new Error('Music requires the owned loopback runner');
export default defineConfig({
  testDir: '.', testMatch: 'music.spec.ts', fullyParallel: false, workers: 1,
  retries: 0, repeatEach: 1, forbidOnly: true, timeout: 120000,
  expect: { timeout: 15000 }, reporter: 'line',
  use: { baseURL: process.env.PLAYWRIGHT_EXTERNAL_BASE_URL, headless: true, serviceWorkers: 'block', trace: 'off', screenshot: 'off', video: 'off' },
  projects: [
    { name: 'music-desktop', use: { browserName: 'chromium', viewport: { width: 1365, height: 900 } } },
    { name: 'music-mobile', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
  ],
});
