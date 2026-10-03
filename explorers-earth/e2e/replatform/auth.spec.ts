import {assertFixtureOrigin} from './proxy-fixture-authority.mjs';
import { readFileSync } from 'node:fs';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';

type Persona = { userId: string; cookie: string; handle: string };
type Fixture = { origin: string; personas: { ownerA: Persona; ownerB: Persona; ownerC: Persona }; recoveryProof: string };
const fixturePath = process.env.AUTH_E2E_FIXTURE_PATH;
if (!fixturePath)
  throw new Error('Auth E2E requires the owned loopback fixture runner');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture;
assertFixtureOrigin(fixture);
if (fixture.origin !== process.env.PLAYWRIGHT_EXTERNAL_BASE_URL || !fixture.recoveryProof)
  throw new Error('Auth fixture authority mismatch');

async function browserSession(context: BrowserContext, persona: Persona) {
  const separator = persona.cookie.indexOf('=');
  await context.addCookies([{ name: persona.cookie.slice(0, separator),
    value: persona.cookie.slice(separator + 1), url: fixture.origin, sameSite: 'Lax', httpOnly: true }]);
}
async function localOnly(page: Page) {
  await page.route('**/*', (route) => {
    const target = new URL(route.request().url());
    if (target.protocol === 'data:' || target.protocol === 'blob:' || target.origin === fixture.origin)
      return route.continue();
    return route.abort();
  });
}

test('stale local auth never opens a private deep link; public login remains reachable', async ({ page }) => {
  await localOnly(page);
  await page.addInitScript(() => localStorage.setItem('auth-storage', JSON.stringify({ state: {
    isAuthenticated: true, token: 'old-strapi-token', user: { documentId: 'old-account' },
  }, version: 0 })));
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await expect(page.getByRole('button', { name: /Google/i }).first()).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('qrtoken'))).toBeNull();
  await page.reload();
  await expect(page.getByRole('button', { name: /Google/i }).first()).toBeVisible();
});

test('failed Google start returns the routed login form with a retryable error', async ({ page }) => {
  await localOnly(page);
  await page.route('**/api/auth/sign-in/social', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/login');
  await page.getByRole('button', { name: /Google/i }).first().click();
  await expect(page.getByRole('alert')).toContainText('try again');
  await expect(page.getByRole('button', { name: /Google/i }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('failed recovery start returns the routed recovery form with a retryable error', async ({ page }) => {
  await localOnly(page);
  await page.route('**/api/explorers/v1/recovery/start', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/reactivate');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('alert')).toContainText('try again');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
});

test('failed logout fences a receiving tab after reload and a newly opened tab', async ({ context, page }) => {
  await browserSession(context, fixture.personas.ownerC);
  await localOnly(page);
  await page.goto('/onboarding');
  const second = await context.newPage();
  await localOnly(second);
  await second.goto('/onboarding');
  await expect(second.getByRole('button', { name: 'Log out' }).first()).toBeVisible();
  await page.route('**/api/auth/sign-out', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.getByRole('button', { name: 'Log out' }).first().click();
  await page.getByRole('button', { name: 'Log out' }).last().click();
  await expect(page.getByRole('button', { name: 'Retry sign-out' })).toBeVisible();
  await second.reload();
  await expect(second).toHaveURL(/\/login(?:\?.*)?$/);
  await expect(second.getByRole('button', { name: 'Retry sign-out' })).toBeVisible();
  const fresh = await context.newPage();
  await localOnly(fresh);
  await fresh.goto('/settings');
  await expect(fresh).toHaveURL(/\/login(?:\?.*)?$/);
  await expect(fresh.getByRole('button', { name: 'Retry sign-out' })).toBeVisible();
  const stillLive = await page.request.get(`${fixture.origin}/api/explorers/v1/me`);
  expect(stillLive.status()).toBe(200);
  await page.unroute('**/api/auth/sign-out');
  await page.getByRole('button', { name: 'Retry sign-out' }).click();
  await expect(page.getByRole('button', { name: 'Retry sign-out' })).toHaveCount(0);
  await expect(second.getByRole('button', { name: 'Retry sign-out' })).toHaveCount(0);
  await expect(fresh.getByRole('button', { name: 'Retry sign-out' })).toHaveCount(0);
  await browserSession(context, fixture.personas.ownerA);
  await fresh.goto('/onboarding');
  await expect(fresh.getByRole('button', { name: 'Log out' }).first()).toBeVisible();
  expect((await fresh.request.get(`${fixture.origin}/api/explorers/v1/me`)).status()).toBe(200);
  await fresh.close();
  await second.close();
});

test('real local session gates onboarding and cross-tab logout revokes both tabs', async ({ context, page }) => {
  await browserSession(context, fixture.personas.ownerA);
  await localOnly(page);
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/onboarding$/);
  const second = await context.newPage();
  await localOnly(second);
  await second.goto('/onboarding');
  await expect(second.getByRole('button', { name: 'Log out' }).first()).toBeVisible();
  await second.getByRole('button', { name: 'Log out' }).first().click();
  await second.getByRole('button', { name: 'Log out' }).last().click();
  await expect(second).toHaveURL(/\/login(?:\?.*)?$/);
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await expect(page.getByRole('button', { name: 'Retry sign-out' })).toHaveCount(0);
  await expect(second.getByRole('button', { name: 'Retry sign-out' })).toHaveCount(0);
  const denied = await page.request.get(`${fixture.origin}/api/explorers/v1/me`, {
    headers: { Cookie: fixture.personas.ownerA.cookie },
  });
  expect(denied.status()).toBe(401);
  await second.close();
});

test('purpose-bound proof recovers once against real API and requires a fresh ordinary session', async ({ context, page }) => {
  await context.addCookies([{ name: 'explorers_recovery_proof', value: fixture.recoveryProof,
    domain: new URL(fixture.origin).hostname, path: '/api/explorers/v1/recovery', sameSite: 'Lax', httpOnly: true }]);
  await localOnly(page);
  await page.goto('/reactivate-confirm?token=legacy-url-token');
  await expect(page.getByRole('button', { name: 'Reactivate account' })).toBeVisible();
  await page.getByRole('button', { name: 'Reactivate account' }).click();
  await expect(page.getByText('Account reactivated')).toBeVisible();
  const ordinary = await page.request.get(`${fixture.origin}/api/explorers/v1/me`);
  expect(ordinary.status()).toBe(401);
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('expired or unavailable');
});
