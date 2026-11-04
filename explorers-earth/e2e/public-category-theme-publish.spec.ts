import { expect, test } from '@playwright/test';
import { categories, closeFixture, openFixture as openContainedFixture } from './setup/category-navigation';
import { seedCategoryThemeState } from './setup/public-category-themes';
import { installCategoryThemePublishIntercept, publishPresets } from './setup/category-theme-publish';

async function openFixture(...args: Parameters<typeof openContainedFixture>) {
  const visitor = await openContainedFixture(...args);
  await visitor.context.route(url => url.origin === new URL(args[1]).origin && url.pathname === '/e2e/setup/category-theme-maps-fixture.tsx', route => route.continue());
  await visitor.context.route(url => url.origin === new URL(args[1]).origin && url.pathname === '/images/category-theme-fixture.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#203040"/></svg>' }));
  return visitor;
}

for (const [preset, colors] of Object.entries(publishPresets)) {
  test(`publish ${preset} one UI save reaches eight fresh anonymous category roots`, async ({ browser, baseURL }, info) => {
    test.setTimeout(180_000);
    const state = seedCategoryThemeState(preset === 'minimal-light' ? 'cinematic-dark' : 'minimal-light');
    state.account.Addresss = { address: '1 Fixture Lane, Test City', streetName: 'Fixture Lane', postalCode: '00001', state: 'Test State', city: 'Test City', country: 'Test Country' };
    state.account.Public_Profile_Address = null;
    state.account.Bio = '<p>Contained&nbsp;browser&nbsp;publication&nbsp;fixture</p>';
    state.account.social_media.fixture_social = { retain: ['future', 7] };
    Object.assign(state.account.social_media.theme_settings, { fixture_theme: { retain: true }, recommendations: { layout: 'shelves', fixture_recommendation: { preserve: 42 } } });
    const owner = await openFixture(browser, baseURL!, state, { owner: true, width: 1440, height: 1000, reducedMotion: 'reduce' });
    const intercepted = await installCategoryThemePublishIntercept(owner.context, state, baseURL!, preset as keyof typeof publishPresets);
    try {
      await owner.page.goto('/profile');
      expect(owner.page.viewportSize()).toEqual({ width: 1440, height: 1000 });
      await owner.page.getByRole('tab', { name: 'Appearance', exact: true }).click();
      await expect(owner.page.getByTestId('appearance-workspace')).toBeVisible();
      const choice = owner.page.locator(`button[data-theme-preset="${preset}"]`);
      await choice.click();
      await expect(choice).toHaveAttribute('aria-pressed', 'true');
      const before = state.reads.filter(read => read.owner && read.name === 'GET /api/explorers/v1/me').length;
      await owner.page.getByRole('button', { name: 'Save & Publish', exact: true }).click();
      await expect(owner.page.getByText('Saved & published successfully', { exact: true })).toBeVisible();
      expect(intercepted.violations).toEqual([]);
      expect(intercepted.updates).toHaveLength(1);
      // The saved account is re-read after the write (Music identity ensure was removed with Music).
      await expect.poll(() => state.reads.filter(read => read.owner && read.name === 'GET /api/explorers/v1/me').length).toBeGreaterThan(before);
      expect(state.account.social_media.theme_settings).toMatchObject({ preset, accentColor: colors.accent });
      expect(state.writes.map(write => write.name)).toEqual(['PATCH /api/explorers/v1/account']);
      for (const category of categories) {
        const visitor = await openFixture(browser, baseURL!, state, { width: 390, height: 900, touch: true, reducedMotion: 'reduce' });
        try {
          const reads = state.reads.length;
          await visitor.page.goto(`/fixture-owner/${category.route}`);
          const shell = visitor.page.locator('[data-public-profile-chrome]');
          await expect(shell).toHaveAttribute('data-theme-preset', preset);
          await expect.poll(() => shell.evaluate(element => getComputedStyle(element).getPropertyValue('--category-page').trim())).toBe(colors.page);
          expect(await shell.evaluate(element => getComputedStyle(element).getPropertyValue('--category-text').trim())).toBe(colors.text);
          expect(visitor.page.viewportSize()).toEqual({ width: 390, height: 900 });
          expect(await visitor.page.evaluate(() => innerWidth)).toBe(390);
          expect(state.reads.slice(reads).some(read => !read.owner && read.name === 'PublicProfileData')).toBe(true);
          await info.attach(`saved-${preset}-${category.route}`, { contentType: 'application/json', body: JSON.stringify({ preset, route: category.route, page: colors.page, text: colors.text, freshAnonymous: true }) });
        } finally { await closeFixture(visitor); }
      }
    } finally {
      await info.attach('publish-intercept', { contentType: 'application/json', body: JSON.stringify(intercepted) });
      expect.soft(intercepted.violations).toEqual([]);
      await closeFixture(owner);
    }
  });
}

test('publish intercept rejects malformed revisions payloads identity edits and over-posts', async ({ browser, baseURL }, info) => {
  const state = seedCategoryThemeState('minimal-light');
  const owner = await openFixture(browser, baseURL!, state, { owner: true });
  const intercept = await installCategoryThemePublishIntercept(owner.context, state, baseURL!, 'cinematic-dark');
  const original = structuredClone(state.account);
  try {
    await owner.page.goto('/fixture-owner');
    const valid = { expectedRevision: 1, themeSettings: { preset: 'cinematic-dark', wallpaperMode: 'solid-color', accentColor: '#10B981', landingTab: 'profile', visibleTabs: { recommendations: true, gallery: false, business: false }, footerBranding: 'enabled' } };
    // Each attempt differs from a valid save in exactly one way; none may be accepted or persisted.
    const attempts: Array<{ label: string; body: unknown }> = [
      { label: 'stale revision', body: { ...valid, expectedRevision: 7 } },
      { label: 'wrong preset', body: { ...valid, themeSettings: { ...valid.themeSettings, preset: 'neon-cyber' } } },
      { label: 'identity edit', body: { ...valid, handle: 'someone-else' } },
      { label: 'nested over-post', body: { ...valid, themeSettings: { ...valid.themeSettings, unapproved_nested_field: { overposted: true } } } },
      { label: 'top-level over-post', body: { ...valid, unapproved_field: true } },
    ];
    for (const attempt of attempts) {
      const status = await owner.page.evaluate(async body => (await fetch('/api/explorers/v1/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status, attempt.body);
      expect.soft(status, attempt.label).toBe(409);
    }
    expect(intercept.violations).toHaveLength(attempts.length);
    // The five refusals are this case's own expected 409s; anything else stays an error.
    await expect.poll(() => owner.guard.errors.filter(error => error === 'Failed to load resource: the server responded with a status of 409 (Conflict)').length).toBe(attempts.length);
    owner.guard.errors.splice(0, owner.guard.errors.length, ...owner.guard.errors.filter(error => error !== 'Failed to load resource: the server responded with a status of 409 (Conflict)'));
    expect(intercept.updates).toEqual([]);
    expect(state.writes).toEqual([]);
    expect(state.account).toEqual(original);
    await info.attach('expected-publish-violations', { contentType: 'application/json', body: JSON.stringify(intercept.violations) });
  } finally { await closeFixture(owner); }
});
