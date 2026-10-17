import { defineConfig } from '@playwright/test';
if (!process.env.LIFECYCLE_E2E_FIXTURE_PATH || !/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.PLAYWRIGHT_EXTERNAL_BASE_URL ?? ''))
    throw new Error('Lifecycle requires owned loopback runner');
export default defineConfig({ testDir: '.', testMatch: 'lifecycle.spec.ts', fullyParallel: false, workers: 1, retries: 0, forbidOnly: true, timeout: 90000, expect: { timeout: 15000 }, reporter: 'line', use: { baseURL: process.env.PLAYWRIGHT_EXTERNAL_BASE_URL, headless: true, serviceWorkers: 'block', trace: 'off', screenshot: 'only-on-failure' }, projects: [{ name: 'lifecycle-chromium', use: { browserName: 'chromium', viewport: { width: 1365, height: 900 } } }] });
