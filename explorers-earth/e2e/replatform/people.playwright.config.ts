import { defineConfig } from '@playwright/test';
import { validatePublicParityEnvironment } from './public-parity-controller';
const { origin } = validatePublicParityEnvironment(process.env);
// expect.timeout is 25000, deliberately ABOVE the 15000ms client abort on
// publicProfileGatewayClient.ts:78. They used to be equal, with retries: 0 and zero slack,
// so a read the PRODUCT abandoned at 15s and a harness assertion that merely ran out of
// patience were indistinguishable -- the recorded cause of public parity cases 10 and 27
// flipping on byte-identical source (receipts/wave2-public-parity-abcfe666/README.md).
// Now the client aborts first, the app renders its error state, and the assertion reports a
// product failure. Raising the harness budget rather than lowering the client bound is
// deliberate: nothing in this repo measures real people/games latency, so retiming a public
// production read on that basis would be a guess, and this change ships nothing to users.
export default defineConfig({ testDir: '.', testMatch: 'people.spec.ts', fullyParallel: false, workers: 1, retries: 0, repeatEach: 1, timeout: 900000, expect: { timeout: 25000 }, reporter: 'line', use: { baseURL: origin, headless: true, trace: 'off', video: 'off', screenshot: 'off' }, projects: [{ name: 'people-desktop', use: { browserName: 'chromium', viewport: { width: 1365, height: 900 } } }, { name: 'people-mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }] });
