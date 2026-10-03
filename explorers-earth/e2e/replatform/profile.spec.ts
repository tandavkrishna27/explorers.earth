import {assertFixtureOrigin} from './proxy-fixture-authority.mjs';
import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';

type Persona = { userId: string; cookie: string; handle: string };
type Fixture = { origin: string; personas: { ownerA: Persona; ownerB: Persona } };
const fixturePath = process.env.PROFILE_E2E_FIXTURE_PATH;
if (!fixturePath)
  throw new Error('Profile E2E requires the owned loopback fixture runner');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture;
assertFixtureOrigin(fixture);
if (fixture.origin !== process.env.PLAYWRIGHT_EXTERNAL_BASE_URL) throw new Error('Profile fixture origin mismatch');

async function signInAs(page: Page, persona: Persona) {
  const separator = persona.cookie.indexOf('=');
  await page.context().addCookies([{ name: persona.cookie.slice(0, separator),
    value: persona.cookie.slice(separator + 1), url: fixture.origin, sameSite: 'Lax' }]);
  await page.addInitScript(({ userId, handle }) => {
    localStorage.setItem('auth-storage', JSON.stringify({ state: {
      isAuthenticated: true, token: 'profile-fixture-placeholder',
      user: { id: userId, documentId: userId, username: handle,
        email: `${userId}@example.invalid`, blocked: false },
    }, version: 0 }));
  }, persona);
  await page.route('**/*', (route) => {
    const target = new URL(route.request().url());
    if (target.protocol === 'data:' || target.protocol === 'blob:' || target.origin === fixture.origin)
      return route.continue();
    return route.abort();
  });
}

for (const [width, height, owner] of [[1365, 900, 'ownerA'], [390, 844, 'ownerB']] as const) {
  test(`canonical onboarding and profile round-trip at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const persona = fixture.personas[owner];
    await signInAs(page, persona);
    const apiCalls: string[] = [];
    page.on('response', (response) => {
      if (response.url().startsWith(`${fixture.origin}/api/explorers/v1/`)) apiCalls.push(`${response.request().method()} ${new URL(response.url()).pathname} ${response.status()}`);
    });
    await page.goto('/onboarding');
    await expect(page.locator('.ob-card')).toBeVisible();
    await page.locator('[name="accountName"]').fill('Fixture Explorer');
    await page.locator('[name="username"]').fill(persona.handle);
    await page.locator('[name="bio"]').fill('A real local API profile');
    await page.getByRole('radio').first().check();
    await page.locator('.ob-footer button').click();
    await expect(page.getByRole('textbox', { name: 'Enter your mobile number' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Enter your mobile number' }).fill('9876543210');
    await page.locator('.ob-footer button').click();
    await expect(page.locator('.ob-footer button')).toBeVisible();
    await page.getByRole('textbox', { name: 'Enter your address' }).fill('Fixture Street');
    await page.getByRole('textbox', { name: 'Enter city' }).fill('Jaipur');
    await page.getByRole('textbox', { name: 'Enter state' }).fill('Rajasthan');
    await page.getByRole('textbox', { name: 'Enter country' }).fill('India');
    await page.getByRole('textbox', { name: 'Enter postal code' }).fill('302001');
    await page.getByRole('textbox', { name: 'Enter primary address' }).fill('Fixture Street, Jaipur');
    await page.locator('.ob-footer button').click();
    await expect.poll(async () => (await page.request.get(`${fixture.origin}/api/explorers/v1/me`, {
      headers: { Cookie: persona.cookie },
    })).json()).toMatchObject({ account: { handle: persona.handle, onboardingStatus: 'complete' } });
    await page.goto('/profile');
    await expect(page.getByTestId('profile-editor-root')).toBeVisible();
    const stalePage = await page.context().newPage();
    await signInAs(stalePage, persona);
    await stalePage.goto('/profile');
    await expect(stalePage.getByTestId('profile-editor-root')).toBeVisible();
    await stalePage.locator('[name="accountName"]').fill(`Stale ${width}`);
    await page.locator('[name="accountName"]').fill(`Updated ${width}`);
    await page.getByRole('button', { name: /Save & Publish/i }).first().click();
    await expect.poll(async () => (await page.request.get(`${fixture.origin}/api/explorers/v1/me`, {
      headers: { Cookie: persona.cookie },
    })).json()).toMatchObject({ account: { displayName: `Updated ${width}` } });
    await page.locator('[name="accountName"]').fill(`Updated twice ${width}`);
    await page.getByRole('button', { name: /Save & Publish/i }).first().click();
    await expect.poll(async () => (await page.request.get(`${fixture.origin}/api/explorers/v1/me`, {
      headers: { Cookie: persona.cookie },
    })).json()).toMatchObject({ account: { displayName: `Updated twice ${width}` } });
    const conflict = stalePage.waitForResponse((response) => response.url().endsWith('/api/explorers/v1/account')
      && response.request().method() === 'PATCH' && response.status() === 409);
    await stalePage.getByRole('button', { name: /Save & Publish/i }).first().click();
    await conflict;
    expect((await (await page.request.get(`${fixture.origin}/api/explorers/v1/me`, {
      headers: { Cookie: persona.cookie },
    })).json()).account.displayName).toBe(`Updated twice ${width}`);
    await stalePage.close();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==', 'base64');
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'avatar.png', mimeType: 'image/png', buffer: png,
    });
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect.poll(async () => (await page.request.get(`${fixture.origin}/api/explorers/v1/me`, {
      headers: { Cookie: persona.cookie },
    })).json()).toMatchObject({ account: { profileImage: { mimeType: 'image/jpeg' } } });
    await page.locator('[name="accountName"]').fill(`After avatar ${width}`);
    await page.getByRole('button', { name: /Save & Publish/i }).first().click();
    await expect.poll(async () => (await page.request.get(`${fixture.origin}/api/explorers/v1/me`, {
      headers: { Cookie: persona.cookie },
    })).json()).toMatchObject({ account: { displayName: `After avatar ${width}` } });
    await page.getByRole('tab', { name: 'Gallery' }).click();
    const landscape = await sharp({ create: { width: 191, height: 100, channels: 3,
      background: { r: 40, g: 100, b: 170 } } }).png().toBuffer();
    await page.locator('input[type="file"][multiple]').setInputFiles({
      name: 'landscape.png', mimeType: 'image/png', buffer: landscape,
    });
    await page.getByRole('button', { name: /Save & Publish/i }).first().click();
    await expect.poll(async () => (await page.request.get(`${fixture.origin}/api/explorers/v1/me`, {
      headers: { Cookie: persona.cookie },
    })).json()).toMatchObject({ account: { feedItems: [expect.objectContaining({
      details: expect.objectContaining({ aspectRatio: '1.91:1' }),
    })] } });
    await page.reload();
    await expect(page.getByTestId('profile-editor-root')).toBeVisible();
    await expect(page.locator('[name="accountName"]')).toHaveValue(`After avatar ${width}`);
    await page.getByRole('tab', { name: 'Gallery' }).click();
    await expect.poll(async () => (await page.request.get(`${fixture.origin}/api/explorers/v1/me`, {
      headers: { Cookie: persona.cookie },
    })).json()).toMatchObject({ account: { feedItems: [expect.objectContaining({
      details: expect.objectContaining({ aspectRatio: '1.91:1' }),
    })] } });
    await page.goto('/settings');
    await expect(page.getByRole('tab', { name: 'Account', exact: true })).toBeVisible();
    await page.getByRole('tabpanel', { name: 'Account' }).getByRole('button', { name: 'Account', exact: true }).click();
    await expect(page.getByPlaceholder('Enter your username')).toHaveValue(persona.handle);
    await page.getByRole('radio', { name: 'Business' }).check();
    await page.getByRole('tabpanel', { name: 'Account' }).getByRole('button', { name: /Save & Publish/i }).click();
    await expect.poll(async () => (await page.request.get(`${fixture.origin}/api/explorers/v1/me`, {
      headers: { Cookie: persona.cookie },
    })).json()).toMatchObject({ account: { accountType: 'Business' } });
    await page.goto('/profile');
    await page.getByRole('button', { name: /How to reach us/i }).click();
    await page.getByRole('button', { name: 'Title', exact: true }).click();
    await page.locator('[name="title"]').fill(`Studio ${width}`);
    await page.getByRole('button', { name: /Save & Publish/i }).first().click();
    await expect.poll(async () => (await page.request.get(`${fixture.origin}/api/explorers/v1/me`, {
      headers: { Cookie: persona.cookie },
    })).json()).toMatchObject({ account: { publicAddress: { title: `Studio ${width}`, places: null } } });
    await page.reload();
    await page.getByRole('button', { name: /How to reach us/i }).click();
    await expect(page.locator('[name="title"]')).toHaveValue(`Studio ${width}`);
    await page.goto('/settings');
    await page.getByRole('tabpanel', { name: 'Account' }).getByRole('button', { name: 'Account', exact: true }).click();
    await page.getByRole('radio', { name: 'Creator' }).check();
    await page.getByRole('tabpanel', { name: 'Account' }).getByRole('button', { name: /Save & Publish/i }).click();
    await expect.poll(async () => (await page.request.get(`${fixture.origin}/api/explorers/v1/me`, {
      headers: { Cookie: persona.cookie },
    })).json()).toMatchObject({ account: { accountType: 'Creator' } });
    await page.reload();
    await page.getByRole('tabpanel', { name: 'Account' }).getByRole('button', { name: 'Account', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Creator' })).toBeChecked();
    const current = (await (await page.request.get(`${fixture.origin}/api/explorers/v1/me`, {
      headers: { Cookie: persona.cookie },
    })).json()).account;
    const feedUpload = await page.request.post(`${fixture.origin}/api/explorers/v1/media`, {
      headers: { Cookie: persona.cookie, Origin: fixture.origin, 'Content-Type': 'image/png',
        'X-Media-Purpose': 'feed', 'X-File-Name': 'public-feed.png' }, data: png,
    });
    expect(feedUpload.status()).toBe(201);
    const feedId = (await feedUpload.json()).media.id;
    const publish = await page.request.patch(`${fixture.origin}/api/explorers/v1/account`, {
      headers: { Cookie: persona.cookie, Origin: fixture.origin }, data: { expectedRevision: current.revision,
        bioPlain: `Public biography ${width}`, themeSettings: { preset: 'cinematic-dark' },
        socialLinks: [{ platform: 'instagram', url: 'https://instagram.com/explorerfixture', visible: true },
          { platform: 'facebook', url: 'https://example.invalid/hidden', visible: false }],
        feedItems: [{ mediaId: feedId, externalUrl: null, source: 'manual', type: 'image', caption: null,
          details: { fileName: 'public-feed.png', width: 800, height: 1000, aspectRatio: '4:5' } }],
      },
    });
    expect(publish.status()).toBe(200);
    await page.goto(`/${persona.handle}`);
    await expect(page.getByTestId('public-profile-theme-root')).toHaveAttribute('data-theme-preset', 'cinematic-dark');
    await expect(page.getByText(`Public biography ${width}`)).toBeVisible();
    await expect(page.locator('a[href="https://instagram.com/explorerfixture"]')).toBeVisible();
    await expect(page.locator(`img[src="/api/explorers/v1/media/${feedId}/content"]`).first()).toBeVisible();
    expect((await (await page.request.get(`${fixture.origin}/api/explorers/v1/profiles/${persona.handle}`)).text()))
      .not.toContain('https://example.invalid/hidden');
    expect(apiCalls.some((entry) => entry.startsWith('PATCH /api/explorers/v1/account 200'))).toBe(true);
  });
}
