import { expect, test } from '@playwright/test';
import { categories, closeFixture, openFixture as openContainedFixture, token } from './setup/category-navigation';
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
      const before = state.reads.filter(read => read.owner && read.name === 'UsersPermissionsUser').length;
      await owner.page.getByRole('button', { name: 'Save & Publish', exact: true }).click();
      await expect(owner.page.getByText('Saved & published successfully', { exact: true })).toBeVisible();
      expect(intercepted.violations).toEqual([]);
      expect(intercepted.updates).toHaveLength(1);
      await expect.poll(() => intercepted.identityAttempts.length).toBe(1);
      expect(state.reads.filter(read => read.owner && read.name === 'UsersPermissionsUser').length).toBeGreaterThan(before);
      expect(state.account.social_media.theme_settings).toMatchObject({ preset, accentColor: colors.accent });
      expect(state.writes.map(write => write.name)).toEqual(['UpdateAccount']);
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

test('publish intercept rejects malformed subjects payloads origins methods and nonmutations', async ({ browser, baseURL }, info) => {
  const state = seedCategoryThemeState('minimal-light');
  const owner = await openFixture(browser, baseURL!, state, { owner: true });
  const intercept = await installCategoryThemePublishIntercept(owner.context, state, baseURL!, 'cinematic-dark');
  const original = structuredClone(state.account);
  try {
    await owner.page.goto('/fixture-owner');
    const mutation = 'mutation UpdateAccount($documentId: ID!, $data: AccountInput!) { updateAccount(documentId: $documentId, data: $data) { documentId } }';
    const attempts = [
      { label: 'subject', variables: { documentId: 'wrong-subject', data: {} } },
      { label: 'payload', variables: { documentId: state.account.documentId, data: { username: 'changed' } } },
      { label: 'wrong origin', url: 'https://music-fixture.test/graphql' },
      { label: 'method', method: 'PUT' },
      { label: 'authority', bearer: 'wrong-synthetic-subject' },
      { label: 'query instead of mutation', query: 'query UpdateAccount { updateAccount { documentId } }' },
      { label: 'wrong root', query: 'mutation UpdateAccount { deleteAccount { documentId } }' },
    ];
    for (const attempt of attempts) await owner.page.evaluate(async ({ attempt, token, mutation }) => {
      await fetch(attempt.url ?? '/graphql', { method: attempt.method ?? 'POST', headers: { Authorization: `Bearer ${attempt.bearer ?? token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ operationName: 'UpdateAccount', query: attempt.query ?? mutation, variables: attempt.variables ?? {} }) });
    }, { attempt, token, mutation });
    expect(intercept.violations).toHaveLength(7);
    expect(intercept.updates).toEqual([]);
    expect(state.account).toEqual(original);
    await info.attach('expected-publish-violations', { contentType: 'application/json', body: JSON.stringify(intercept.violations) });
    // A nested over-post must not be accepted or persisted by the mutation boundary.
    // Each variant gets a fresh intercept so the one-save guard cannot mask permissive payload checks.
    for (const nested of ['address', 'social', 'theme'] as const) {
      const nestedState = seedCategoryThemeState('minimal-light');
      nestedState.account.Addresss = { address: '1 Fixture Lane, Test City', streetName: 'Fixture Lane', postalCode: '00001', state: 'Test State', city: 'Test City', country: 'Test Country' };
      nestedState.account.social_media.fixture_social = { retain: ['future', 7] };
      nestedState.account.social_media.theme_settings.fixture_theme = { retain: true };
      nestedState.account.social_media.theme_settings.recommendations = { layout: 'shelves', fixture_recommendation: { preserve: 42 } };
      const nestedOriginal = structuredClone(nestedState.account);
      const nestedOwner = await openFixture(browser, baseURL!, nestedState, { owner: true });
      const nestedIntercept = await installCategoryThemePublishIntercept(nestedOwner.context, nestedState, baseURL!, 'cinematic-dark');
      try {
        await nestedOwner.page.goto('/fixture-owner');
        // Independent complete normal wire payload, checked against Profile's saved request/source.
        const data = Object.fromEntries(['Account_Name', 'Account_Type', 'Addresss', 'Bio', 'Feed_Data', 'Primary_Address', 'Public_Profile_Address', 'mobile_number', 'mobile_number_visibility'].map(key => [key, structuredClone(nestedOriginal[key])])) as Record<string, any>;
        data.social_media = {
          ...structuredClone(nestedOriginal.social_media),
          ...Object.fromEntries(['instagram', 'youtube', 'whatsapp', 'website', 'facebook', 'linkedin', 'snapchat', 'tiktok', 'email', 'X', 'spotify', 'youtubeMusic', 'appleMusic'].map(key => [key, { link: '', visibility: false }])),
          theme_settings: { ...structuredClone(nestedOriginal.social_media.theme_settings), preset: 'cinematic-dark', accentColor: '#10B981' },
        };
        const target = nested === 'address' ? data.Addresss : nested === 'social' ? data.social_media : data.social_media.theme_settings;
        target.unapproved_nested_field = { overposted: true };
        const response = await nestedOwner.page.evaluate(async ({ token, mutation, documentId, data }) => (await fetch('/graphql', {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ operationName: 'UpdateAccount', query: mutation, variables: { documentId, data } }),
        })).json(), { token, mutation, documentId: nestedOriginal.documentId, data });
        expect.soft(response, nested).toEqual({ errors: [{ message: 'Contained publish violation' }] });
        expect.soft(nestedIntercept.violations, nested).toHaveLength(1);
        expect.soft(nestedIntercept.updates, nested).toEqual([]);
        expect.soft(nestedState.writes, nested).toEqual([]);
        expect.soft(nestedState.account, nested).toEqual(nestedOriginal);
        await info.attach(`nested-${nested}-containment`, { contentType: 'application/json', body: JSON.stringify({ response, ...nestedIntercept, accountUnchanged: JSON.stringify(nestedState.account) === JSON.stringify(nestedOriginal) }) });
      } finally { await closeFixture(nestedOwner); }
    }
  } finally { await closeFixture(owner); }
});
