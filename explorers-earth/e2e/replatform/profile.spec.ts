import {assertFixtureOrigin} from './proxy-fixture-authority.mjs';
import { readFileSync } from 'node:fs';
import { test, expect, type Page, type TestInfo, type Request, type Response } from '@playwright/test';
import sharp from 'sharp';

// BEGIN PROFILE DIAGNOSTIC CONTRACT
type ProfileDiagnosticCategory = 'none' | 'books' | 'movies' | 'games';
type ProfileDiagnosticStage = 'setup' | 'collection-create' | 'settings-open' | 'visibility-open' | 'control-enabled' | 'initial-unchecked' | 'publish-click' | 'publish-poll' | 'published-checked' | 'hide-click' | 'hide-poll' | 'hidden-unchecked' | 'legacy-check';
type ProfileDiagnosticSnapshot = { version: 1; category: ProfileDiagnosticCategory; stage: ProfileDiagnosticStage; publishPoll: 'incomplete' | 'completed'; hidePoll: 'incomplete' | 'completed' };
const profileDiagnosticStates = new WeakMap<TestInfo, ProfileDiagnosticSnapshot>();
const profileDiagnosticSeen = new WeakSet<TestInfo>();
function profileDiagnosticIdentity(info: TestInfo): boolean {
  const title = 'canonical navigation: native Books Movies and Games publish and hide through verified owner preferences';
  const file = info.file.replaceAll('\\', '/');
  return file.endsWith('/explorers-earth/e2e/replatform/profile.spec.ts')
    && info.title === title && info.project.name === 'chromium-pr-safe' && info.repeatEachIndex === 0 && info.retry === 0
    && (info.titlePath.length === 1 && info.titlePath[0] === title
      || info.titlePath.length === 2 && info.titlePath[0].replaceAll('\\', '/') === 'replatform/profile.spec.ts' && info.titlePath[1] === title);
}
function setProfileDiagnosticState(info: TestInfo, category: ProfileDiagnosticCategory, stage: ProfileDiagnosticStage, publishPoll: 'incomplete' | 'completed', hidePoll: 'incomplete' | 'completed'): void {
  if (profileDiagnosticIdentity(info)) profileDiagnosticStates.set(info, { version: 1, category, stage, publishPoll, hidePoll });
}
function retainProfileDiagnostic(info: TestInfo, snapshot: ProfileDiagnosticSnapshot): void {
  try {
    if (info.errors.some(error => typeof error.message === 'string' && error.message.includes('[profile-diagnostic-v1:'))) return;
    info.errors.push({ message: `[profile-diagnostic-v1:${snapshot.category}|${snapshot.stage}|${snapshot.publishPoll}|${snapshot.hidePoll}]` });
  } catch {}
}
function captureProfileDiagnostic(info: TestInfo): void {
  try {
    if (!profileDiagnosticIdentity(info) || !['failed', 'timedOut', 'interrupted'].includes(info.status ?? '') || profileDiagnosticSeen.has(info)) return;
    const snapshot = profileDiagnosticStates.get(info);
    if (!snapshot) return;
    profileDiagnosticSeen.add(info);
    retainProfileDiagnostic(info, snapshot);
  } catch {}
}
// END PROFILE DIAGNOSTIC CONTRACT

// BEGIN PROFILE NATIVE BOUNDARY DIAGNOSTIC
type NativeBoundary = { category: 'books' | 'movies' | 'games'; action: 'publish' | 'hide'; request: 'absent' | 'present' | 'uncertain'; response: 'none' | '2xx' | '409' | 'other' | 'transport' | 'uncertain' };
const nativeBoundaryObservers = new WeakMap<TestInfo, ReturnType<typeof observeNativeBoundary>>();
function observeNativeBoundary(page: Page, origin: string) {
  let current: NativeBoundary | undefined;
  let sealed = false;
  let finished = false;
  const admitted = new WeakMap<object, NativeBoundary>();
  const request = (event: Request) => {
    if (sealed || !current) return;
    try {
      const target = new URL(event.url());
      if (event.method() !== 'PATCH' || target.origin !== origin || target.pathname !== '/api/explorers/v1/account' || target.search || target.hash) return;
      if (current.request !== 'absent') { current.request = 'uncertain'; current.response = 'uncertain'; }
      else current.request = 'present';
      admitted.set(event, current);
    } catch {}
  };
  const outcome = (event: object, value: NativeBoundary['response']) => {
    if (sealed || !current || admitted.get(event) !== current) return;
    if (current.request === 'uncertain' || current.response !== 'none') { current.request = 'uncertain'; current.response = 'uncertain'; }
    else current.response = value;
  };
  const response = (event: Response) => { try { const status = event.status(); outcome(event.request(), status >= 200 && status < 300 ? '2xx' : status === 409 ? '409' : 'other'); } catch {} };
  const failed = (event: Request) => outcome(event, 'transport');
  page.on('request', request); page.on('response', response); page.on('requestfailed', failed);
  const seal = () => {
    sealed = true;
    page.off('request', request); page.off('response', response); page.off('requestfailed', failed);
  };
  return {
    seal,
    begin(category: NativeBoundary['category'], action: NativeBoundary['action']) { if (!sealed) current = { category, action, request: 'absent', response: 'none' }; },
    finish(info: TestInfo) {
      if (finished) return;
      finished = true;
      seal();
      const progress = profileDiagnosticStates.get(info);
      const stages = current?.action === 'publish' ? ['publish-click', 'publish-poll', 'published-checked'] : ['hide-click', 'hide-poll', 'hidden-unchecked'];
      if (current && progress?.category === current.category && stages.includes(progress.stage)
        && profileDiagnosticIdentity(info) && ['failed', 'timedOut', 'interrupted'].includes(info.status ?? '')) {
        try { info.errors.push({ message: `[profile-native-boundary-v1:${current.category}|${current.action}|${current.request}|${current.response}]` }); } catch {}
      }
    },
  };
}
// END PROFILE NATIVE BOUNDARY DIAGNOSTIC

// BEGIN PROFILE ONBOARDING DIAGNOSTIC
function profileOnboardingProjection(doc: Document = document) {
  const present = (name: string) => doc.querySelector(`[name="${name}"]`);
  const step = present('accountName') ? 'account' : present('mobile_number') ? 'contact' : present('address') ? 'address' : 'other';
  const phoneNode = doc.querySelector('input[placeholder="Enter your mobile number"]');
  const phone = !phoneNode ? 'absent' : phoneNode.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) ? 'visible' : 'hidden';
  const errors = [['accountName', 'account-name'], ['username', 'username'], ['bio', 'bio'], ['accountType', 'account-type']].filter(([name]) => {
    const container = present(name)?.closest('div.flex.flex-col.gap-2');
    return container?.querySelector('span.text-xs.font-poppins.text-red-400, p.text-xs.font-poppins.text-red-500');
  });
  const fieldError = errors.length > 1 ? 'multiple' : errors.length === 1 ? errors[0][1] : 'none';
  const footerNode = doc.querySelector('.ob-footer button');
  const footer = !footerNode ? 'absent' : footerNode.matches(':disabled') ? 'disabled' : 'enabled';
  return { version: 1, step, phone, fieldError, footer };
}
async function captureProfileOnboarding(page: Page, info: TestInfo): Promise<void> {
  const titles = ['canonical onboarding and profile round-trip at 1365px', 'canonical onboarding and profile round-trip at 390px'];
  if (!info.file.replaceAll('\\', '/').endsWith('/explorers-earth/e2e/replatform/profile.spec.ts') || !titles.includes(info.title)
    || info.project.name !== 'chromium-pr-safe' || info.repeatEachIndex !== 0 || info.retry !== 0
    || !(info.titlePath.length === 1 && info.titlePath[0] === info.title || info.titlePath.length === 2 && info.titlePath[0] === 'replatform/profile.spec.ts' && info.titlePath[1] === info.title)) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unavailable = { version: 1, step: 'unavailable', phone: 'unavailable', fieldError: 'unavailable', footer: 'unavailable' };
  try {
    const snapshot = await Promise.race([page.evaluate(profileOnboardingProjection), new Promise<typeof unavailable>(resolve => { timer = setTimeout(() => resolve(unavailable), 900); })]).catch(() => unavailable);
    info.errors.push({ message: `[profile-onboarding-v1:${snapshot.step}|${snapshot.phone}|${snapshot.fieldError}|${snapshot.footer}]` });
  } catch {} finally { if (timer !== undefined) clearTimeout(timer); }
}
// END PROFILE ONBOARDING DIAGNOSTIC

test.afterEach(({}, info) => {
  captureProfileDiagnostic(info);
  nativeBoundaryObservers.get(info)?.finish(info);
});
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
    try {
      await expect(page.getByRole('textbox', { name: 'Enter your mobile number' })).toBeVisible();
    } catch (error) {
      await captureProfileOnboarding(page, test.info());
      throw error;
    }
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
    const galleryUpload = page.waitForResponse(response => new URL(response.url()).pathname === '/api/explorers/v1/media' && response.request().method() === 'POST');
    await page.locator('input[type="file"][multiple]').setInputFiles({
      name: 'landscape.png', mimeType: 'image/png', buffer: landscape,
    });
    expect((await galleryUpload).status()).toBe(201);
    await expect(page.getByRole('button', { name: 'Remove image', exact: true })).toBeVisible();
    const galleryPublish = page.waitForResponse(response => new URL(response.url()).pathname === '/api/explorers/v1/account' && response.request().method() === 'PATCH');
    await page.getByRole('button', { name: /Save & Publish/i }).first().click();
    expect((await galleryPublish).status()).toBe(200);
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

// These additional cases use only the harness's existing signed sessions and
// canonical HTTP routes. They deliberately do not seed persisted auth state.
type NavigationAccount = {
  id: string; revision: number; onboardingStatus: string; autoPinning: boolean;
  bioPlain: string | null;
  categories: Array<{ category: string; isPublic: boolean; displayOrder: number; pinnedOrder: number | null }>;
};
const navigationBase = '/api/explorers/v1';
const navigationOwner = (fixture.personas as Fixture['personas'] & { ownerC: Persona }).ownerC;
async function navigationAccount(page: Page): Promise<NavigationAccount> {
  const response = await page.request.get(`${fixture.origin}${navigationBase}/me`);
  expect(response.status()).toBe(200);
  return (await response.json()).account;
}
async function navigationPatch(page: Page, data: Record<string, unknown>) {
  return page.request.patch(`${fixture.origin}${navigationBase}/account`, {
    headers: { Origin: fixture.origin }, data,
  });
}
async function navigationSession(page: Page, persona: Persona) {
  const separator = persona.cookie.indexOf('=');
  await page.context().addCookies([{ name: persona.cookie.slice(0, separator),
    value: persona.cookie.slice(separator + 1), url: fixture.origin, sameSite: 'Lax' }]);
  await page.route('**/*', route => {
    const target = new URL(route.request().url());
    return target.origin === fixture.origin || ['data:', 'blob:'].includes(target.protocol)
      ? route.continue() : route.abort();
  });
  const session = await page.request.get(`${fixture.origin}/api/auth/get-session`);
  expect(session.status()).toBe(200);
  // Boolean identity assertions avoid printing session payloads on failure.
  expect((await session.json()).user?.id === persona.userId).toBe(true);
  let account = await navigationAccount(page);
  expect(account.id === persona.userId).toBe(false);
  expect(account.id).toMatch(/^[0-9a-f-]{36}$/);
  if (account.onboardingStatus !== 'complete') {
    const response = await navigationPatch(page, { expectedRevision: account.revision,
      onboardingStatus: 'complete', handle: persona.handle, displayName: 'Navigation Fixture', accountType: 'Personal' });
    expect(response.status()).toBe(200);
    account = await navigationAccount(page);
  }
  return account;
}
async function prepareNavigation(page: Page) {
  const account = await navigationSession(page, navigationOwner);
  const response = await navigationPatch(page, { expectedRevision: account.revision, autoPinning: false,
    categories: account.categories.map(row => ({ ...row, isPublic: false, pinnedOrder: null })) });
  expect(response.status()).toBe(200);
  const legacyOperations: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/graphql') {
      const operation = request.postDataJSON()?.operationName;
      if (['CategoryNavigationAccount', 'SettingsAccount', 'PublicCategoryListCounts', 'CheckPublishedLists'].includes(operation))
        legacyOperations.push(operation);
    }
  });
  return legacyOperations;
}
async function openNavigation(page: Page) {
  await page.goto('/settings#public-navigation');
  await expect(page.getByRole('checkbox', { name: 'Auto-pin navigation tabs', exact: true })).toBeEnabled();
}
async function createNavigationList(page: Page, category: 'books' | 'movies' | 'games') {
  const response = await page.request.post(`${fixture.origin}${navigationBase}/collections`, {
    headers: { Origin: fixture.origin, 'Idempotency-Key': crypto.randomUUID() },
    data: { category, title: `Navigation ${category}`, slug: `navigation-${crypto.randomUUID()}`,
      visibility: 'public', publicationState: 'published' },
  });
  expect(response.status()).toBe(201);
  const collection = (await response.json()).collection;
  expect(collection).toMatchObject({ accountId: (await navigationAccount(page)).id,
    category, visibility: 'public', publicationState: 'published' });
  return collection as { id: string; revision: number };
}

test('canonical navigation: native Books Movies and Games publish and hide through verified owner preferences', async ({ page }, info) => {
  const nativeBoundary = observeNativeBoundary(page, fixture.origin);
  nativeBoundaryObservers.set(info, nativeBoundary);
  try {
  setProfileDiagnosticState(info, 'none', 'setup', 'incomplete', 'incomplete');
  const legacy = await prepareNavigation(page);
  for (const category of ['books', 'movies', 'games'] as const) {
    setProfileDiagnosticState(info, category, 'collection-create', 'incomplete', 'incomplete');
    await createNavigationList(page, category);
  }
  setProfileDiagnosticState(info, 'none', 'settings-open', 'incomplete', 'incomplete');
  await openNavigation(page);
  setProfileDiagnosticState(info, 'none', 'visibility-open', 'incomplete', 'incomplete');
  await page.getByRole('button', { name: /Public Visibility/i }).click();
  const labels = { books: 'Books Tab', movies: 'Movies & Shows Tab', games: 'Games Tab' };
  for (const category of ['books', 'movies', 'games'] as const) {
    const control = page.getByRole('region', { name: 'Public visibility settings' })
      .getByRole('checkbox', { name: labels[category], exact: true });
    setProfileDiagnosticState(info, category, 'control-enabled', 'incomplete', 'incomplete');
    await expect(control).toBeEnabled();
    setProfileDiagnosticState(info, category, 'initial-unchecked', 'incomplete', 'incomplete');
    await expect(control).not.toBeChecked();
    setProfileDiagnosticState(info, category, 'publish-click', 'incomplete', 'incomplete');
    nativeBoundary.begin(category, 'publish');
    await control.click({ force: true });
    setProfileDiagnosticState(info, category, 'publish-poll', 'incomplete', 'incomplete');
    await expect.poll(async () => (await navigationAccount(page)).categories.find(row => row.category === category)?.isPublic).toBe(true);
    setProfileDiagnosticState(info, category, 'published-checked', 'completed', 'incomplete');
    await expect(control).toBeChecked();
    setProfileDiagnosticState(info, category, 'hide-click', 'completed', 'incomplete');
    nativeBoundary.begin(category, 'hide');
    await control.click({ force: true });
    setProfileDiagnosticState(info, category, 'hide-poll', 'completed', 'incomplete');
    await expect.poll(async () => (await navigationAccount(page)).categories.find(row => row.category === category)?.isPublic).toBe(false);
    setProfileDiagnosticState(info, category, 'hidden-unchecked', 'completed', 'completed');
    await expect(control).not.toBeChecked();
  }
  setProfileDiagnosticState(info, 'none', 'legacy-check', 'incomplete', 'incomplete');
  expect(legacy).toEqual([]);
  } finally { nativeBoundary.seal(); }
});

test('canonical navigation: external account preference refresh preserves all nine saved rows', async ({ page }) => {
  const legacy = await prepareNavigation(page);
  await openNavigation(page);
  const account = await navigationAccount(page);
  const categories = account.categories.map(row => ({ ...row, isPublic: true, pinnedOrder: null }));
  const response = await navigationPatch(page, { expectedRevision: account.revision, autoPinning: true, categories });
  expect(response.status()).toBe(200);
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Auto-pin navigation tabs', exact: true })).toBeChecked();
  await page.getByRole('button', { name: /Public Visibility/i }).click();
  await expect(page.getByRole('region', { name: 'Public visibility settings' }).getByRole('checkbox', { name: 'Books Tab', exact: true })).toBeChecked();
  const refreshed = await navigationAccount(page);
  expect(refreshed.categories).toEqual(categories);
  expect(refreshed.categories).toHaveLength(9);
  expect(legacy).toEqual([]);
});

test('canonical navigation: external revision contention reports conflict without replay or lost profile update', async ({ page }) => {
  const legacy = await prepareNavigation(page);
  await openNavigation(page);
  const account = await navigationAccount(page);
  const autoPin = page.getByRole('checkbox', { name: 'Auto-pin navigation tabs', exact: true });
  await expect(autoPin).not.toBeChecked();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let writes = 0;
  await page.route(`**${navigationBase}/account`, async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    writes += 1;
    await gate;
    await route.continue();
  });
  try {
    const admitted = page.waitForRequest(request => new URL(request.url()).pathname === `${navigationBase}/account` && request.method() === 'PATCH');
    await autoPin.click({ force: true });
    const request = await admitted;
    await expect(autoPin).not.toBeChecked();
    expect(request.postDataJSON().expectedRevision).toBe(account.revision);
    const external = await navigationPatch(page, { expectedRevision: account.revision, bioPlain: 'External navigation revision sentinel' });
    expect(external.status()).toBe(200);
    const conflict = page.waitForResponse(response => new URL(response.url()).pathname === `${navigationBase}/account`
      && response.request().method() === 'PATCH' && response.status() === 409);
    release();
    await conflict;
    await expect(autoPin).not.toBeChecked();
    await expect(page.getByRole('alert').filter({ hasText: 'Navigation changed elsewhere' })).toBeVisible();
    const preserved = await navigationAccount(page);
    expect(preserved.bioPlain).toBe('External navigation revision sentinel');
    expect(preserved.autoPinning).toBe(false);
    expect(preserved.revision).toBe(account.revision + 1);
    expect(writes).toBe(1);
    expect(legacy).toEqual([]);
  } finally { release(); await page.unroute(`**${navigationBase}/account`); }
});

test('canonical navigation: a foreign signed owner cannot read content or mutate another owner preference scope', async ({ page, browser }) => {
  const legacy = await prepareNavigation(page);
  const list = await createNavigationList(page, 'books');
  const owner = await navigationAccount(page);
  const foreignContext = await browser.newContext();
  try {
    const foreignPage = await foreignContext.newPage();
    const foreign = await navigationSession(foreignPage, fixture.personas.ownerB);
    expect(foreign.id === owner.id).toBe(false);
    await openNavigation(foreignPage);
    const foreignAuto = foreignPage.getByRole('checkbox', { name: 'Auto-pin navigation tabs', exact: true });
    if (foreign.autoPinning) await expect(foreignAuto).toBeChecked();
    else await expect(foreignAuto).not.toBeChecked();
    const denied = await foreignPage.request.get(`${fixture.origin}${navigationBase}/collections/${list.id}/editable`);
    expect(denied.status()).toBe(404);
    const deniedMutation = await foreignPage.request.patch(`${fixture.origin}${navigationBase}/collections/${list.id}`, {
      headers: { Origin: fixture.origin, 'Idempotency-Key': crypto.randomUUID() },
      data: { expectedRevision: list.revision, visibility: 'private' },
    });
    expect(deniedMutation.status()).toBe(404);
    const ambiguous = await foreignPage.request.patch(`${fixture.origin}${navigationBase}/account`, {
      headers: { Origin: fixture.origin, 'X-Account-Id': owner.id },
      data: { expectedRevision: owner.revision, autoPinning: true },
    });
    expect(ambiguous.status()).toBe(401);
    expect((await navigationAccount(page)).revision).toBe(owner.revision);
    expect((await navigationAccount(foreignPage)).revision).toBe(foreign.revision);
    await openNavigation(page);
    const ownerAuto = page.getByRole('checkbox', { name: 'Auto-pin navigation tabs', exact: true });
    await expect(ownerAuto).not.toBeChecked();
    await ownerAuto.click({ force: true });
    await expect.poll(async () => (await navigationAccount(page)).autoPinning).toBe(true);
    await expect(ownerAuto).toBeChecked();
    expect((await navigationAccount(foreignPage)).revision).toBe(foreign.revision);
    await foreignPage.reload();
    if (foreign.autoPinning) await expect(foreignAuto).toBeChecked();
    else await expect(foreignAuto).not.toBeChecked();
    expect(legacy).toEqual([]);
  } finally { await foreignContext.close(); }
});
