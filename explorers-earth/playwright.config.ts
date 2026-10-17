import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 5173);
const externalBaseUrl = process.env.PLAYWRIGHT_EXTERNAL_BASE_URL;

const prSafeTestMatch = /\.spec\.ts$/;
const musicFixtureTestMatch = /music-(?:fixture-fullstack|public-contract)\.spec\.ts$/;
const musicLiveTestMatch = /(?:music-fixture-fullstack|music-public-contract|profile-theme)\.spec\.ts$/;
const musicVisualTestMatch = /(?:music|music-accessibility|profile-presentation-visual)\.spec\.ts$/;
// Ticket 6.2 ":33" requires the owner Music journey at desktop and mobile. Every other
// Music project is a desktop device, so the owner workspace had no mobile coverage.
const musicOwnerMobileTestMatch = /music-fullstack\.spec\.ts$/;

export default defineConfig({
  testDir: './e2e',
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
  timeout: 90000, // 90 seconds test timeout
  expect: {
    timeout: 10000, // 10 seconds expect timeout
  },
  fullyParallel: false, // Run tests sequentially to save memory
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to avoid running out of virtual memory
  reporter: 'line',
  use: {
    baseURL: externalBaseUrl ?? `http://localhost:${port}`,
    actionTimeout: 15000,
    navigationTimeout: 60000, // 60 seconds navigation timeout
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-pr-safe',
      testMatch: prSafeTestMatch,
      use: { ...devices['Desktop Chrome'], headless: true },
    },
    {
      name: 'chromium-music-fixture',
      testMatch: musicFixtureTestMatch,
      use: { ...devices['Desktop Chrome'], headless: true },
    },
    {
      name: 'chromium-music-live',
      testMatch: musicLiveTestMatch,
      use: { ...devices['Desktop Chrome'], headless: true },
    },
    {
      name: 'firefox-music-visual',
      testMatch: musicVisualTestMatch,
      use: { ...devices['Desktop Firefox'], headless: true },
    },
    {
      name: 'webkit-music-visual',
      testMatch: musicVisualTestMatch,
      use: { ...devices['Desktop Safari'], headless: true },
    },
    {
      name: 'chromium-music-owner-mobile',
      testMatch: musicOwnerMobileTestMatch,
      use: { ...devices['Pixel 7'], headless: true },
    },
  ],
  webServer: externalBaseUrl ? undefined : {
    command: `npm run dev -- --port ${port}`,
    url: `http://localhost:${port}`,
    env: {
      ...process.env,
      VITE_API_URL: process.env.VITE_API_URL ?? `http://localhost:${port}/graphql`,
      VITE_GOOGLE_MAPS_API_KEY: process.env.VITE_GOOGLE_MAPS_API_KEY ?? 'fixture-placeholder',
      VITE_PUBLIC_ACCESS_TOKEN: process.env.VITE_PUBLIC_ACCESS_TOKEN ?? 'fixture-placeholder',
      VITE_LOCAL_TUNES_ENABLED: process.env.VITE_LOCAL_TUNES_ENABLED ?? 'true',
      VITE_LOCAL_TUNES_API_URL: process.env.VITE_LOCAL_TUNES_API_URL ?? 'https://localtunes.test',
      VITE_PAYMENT_API_URL: process.env.VITE_PAYMENT_API_URL ?? `http://localhost:${port}`,
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
