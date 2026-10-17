import { defineConfig } from '@playwright/test';
import { validateGuidesEnvironment } from './guides-harness-client';
const { origin } = validateGuidesEnvironment(process.env);
export default defineConfig({ testDir: '.', testMatch: 'guides.spec.ts', fullyParallel: false, workers: 1, retries: 0, repeatEach: 1, timeout: 900000, expect: { timeout: 15000 }, reporter: 'line', use: { baseURL: origin, headless: true, trace: 'off', video: 'off', screenshot: 'off' }, projects: [{ name: 'guides-desktop', use: { browserName: 'chromium', viewport: { width: 1365, height: 900 } } }, { name: 'guides-mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }] });
