import { expect, test } from '@playwright/test';
import { categories, closeFixture, fixtureState, fixtureUser, openFixture, settings, toggle } from './setup/category-navigation';
import { submitPinnedCategoryUnpublish } from './setup/category-navigation-helpers';
import { bookFixtureId } from './setup/books-owner-content';

for (const category of categories) {
  // Break caught: Off forgets only visibility, or On silently restores saved pin.
  test(`${category.route}: Settings Off → guest fallback → header On → explicit manual Pin`, async ({ browser, baseURL }) => {
    const other = category.field === 'public_books' ? 'public_games' : 'public_books';
    const state = fixtureState({ pinned_nav_tabs: ['public_profile', category.field, other] });
    const owner = await openFixture(browser, baseURL!, state, { owner: true });
    const guest = await openFixture(browser, baseURL!, state);
    try {
      await settings(owner.page);
      await submitPinnedCategoryUnpublish(owner.page, owner.page.getByRole('checkbox', { name: category.label, exact: true }), category.label);
      await expect.poll(() => state.writes.length).toBe(1);
      expect(state.writes.map(r => r.variables)).toEqual([{ documentId: 'browser-account', data: { [category.field]: 'No', pinned_nav_tabs: ['public_profile', other] } }]);
      await owner.page.reload(); await settings(owner.page, true);
      await expect(owner.page.getByRole('checkbox', { name: category.label, exact: true })).not.toBeChecked();
      await expect(owner.page.getByRole('checkbox', { name: `Pin ${category.label}`, exact: true })).not.toBeChecked();
      await guest.page.goto(`/${fixtureUser.username}`);
      await expect(guest.page.getByRole('link', { name: 'Profile', exact: true })).toBeVisible();
      await expect(guest.page.locator(`a[href="/${fixtureUser.username}/${category.route}"]`)).toHaveCount(0);
      await guest.page.goto(`/${fixtureUser.username}/${category.route}?utm_source=browser`);
      await expect(guest.page).toHaveURL(`${baseURL}/${fixtureUser.username}?utm_source=browser`);
      await owner.page.goto(`/recommendations/${category.route}`);
      await toggle(owner.page.getByRole('checkbox').first(), true);
      expect(state.writes.at(-1)?.variables.data).toEqual({ [category.field]: 'Yes' });
      expect(state.account.pinned_nav_tabs).toEqual(['public_profile', other]);
      await settings(owner.page, true);
      const pin = owner.page.getByRole('checkbox', { name: `Pin ${category.label}`, exact: true });
      await expect(pin).not.toBeChecked(); await toggle(pin, true);
      expect(state.writes.at(-1)?.variables.data).toEqual({ pinned_nav_tabs: ['public_profile', other, category.field] });
      await owner.page.reload(); await settings(owner.page, true); await expect(pin).toBeChecked();
      await guest.page.goto(`/${fixtureUser.username}`);
      await expect(guest.page.getByRole('link', { name: category.route[0].toUpperCase() + category.route.slice(1), exact: true })).toBeVisible();
      expect(guest.guard.vendors).toEqual([]);
      expect(await guest.page.evaluate(() => ({ auth: localStorage.getItem('auth-storage'), token: localStorage.getItem('qrtoken') }))).toEqual({ auth: null, token: null });
    } finally { await closeFixture(owner); await closeFixture(guest); }
  });
}

test('Profile mandatory, five slots, unpublished pin blocked and hidden saved choice removable', async ({ browser, baseURL }) => {
  const state = fixtureState({ public_games: 'No', pinned_nav_tabs: ['public_profile', 'public_books', 'public_movie', 'public_apps', 'public_products'] });
  const owner = await openFixture(browser, baseURL!, state, { owner: true });
  try {
    await settings(owner.page, true);
    await expect(owner.page.getByRole('checkbox', { name: 'Pin Profile Tab' })).toBeDisabled();
    await expect(owner.page.getByRole('checkbox', { name: 'Pin Games Tab' })).toBeDisabled();
    const people = owner.page.getByRole('checkbox', { name: 'Pin People Tab' });
    await people.focus(); await people.press('Space');
    await expect(owner.page.getByRole('alert')).toContainText('up to 5 tabs'); expect(state.writes).toEqual([]);
    state.account.public_books = 'No'; await owner.page.reload(); await settings(owner.page, true);
    await toggle(owner.page.getByRole('checkbox', { name: 'Pin Books Tab' }), false);
    expect(state.writes.at(-1)?.variables.data).toEqual({ pinned_nav_tabs: ['public_profile', 'public_movie', 'public_apps', 'public_products'] });
    expect(state.account.auto_pinning).toBe(false);
  } finally { await closeFixture(owner); }
});

for (const failure of ['read', 'write', 'lost', 'verification'] as const) {
  test(`category ${failure} failure remains honest and recovers through explicit Refresh`, async ({ browser, baseURL }) => {
    const state = fixtureState({ pinned_nav_tabs: ['public_profile', 'public_books', 'public_music'], public_music: 'Yes' }, 'public');
    const owner = await openFixture(browser, baseURL!, state, { owner: true });
    try {
      await settings(owner.page, true);
      const before = state.writes.length;
      if (failure === 'read') state.faults.set('CategoryNavigationAccount', [{ kind: 'error' }]);
      else if (failure === 'verification') state.faults.set('CategoryNavigationAccount', [{}, { kind: 'error' }]);
      else state.faults.set('UpdateTabVisibility', [{ kind: failure === 'lost' ? 'lost' : 'error' }]);
      const control = owner.page.getByRole('checkbox', { name: 'Books Tab', exact: true });
      await submitPinnedCategoryUnpublish(owner.page, control, 'Books Tab');
      await expect(owner.page.getByRole('alert').filter({ has: owner.page.getByRole('button', { name: 'Refresh', exact: true }) })).toBeVisible();
      const count = state.writes.length; await owner.page.waitForTimeout(250); expect(state.writes).toHaveLength(count);
      expect(state.account.pinned_nav_tabs).toContain('public_music');
      // The failed unpublish intentionally leaves its confirmation dialog open;
      // dismiss it before exercising the independent recovery control.
      await owner.page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
      await owner.page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await expect(control).toBeEnabled();
      await expect(control).toBeChecked({ checked: failure === 'read' || failure === 'write' });
      expect(state.writes.length - before).toBe(failure === 'read' ? 0 : 1);
    } finally { await closeFixture(owner); }
  });
}

test('two owner tabs merge latest pins, rapid repeated activation cannot add duplicate writes', async ({ browser, baseURL }) => {
  const state = fixtureState(); const owner = await openFixture(browser, baseURL!, state, { owner: true });
  const second = await owner.context.newPage();
  try {
    await settings(owner.page, true); await settings(second, true);
    await toggle(owner.page.getByRole('checkbox', { name: 'Pin Games Tab' }), true);
    await toggle(second.getByRole('checkbox', { name: 'Pin Apps & Tools Tab' }), true);
    await expect.poll(() => state.account.pinned_nav_tabs).toEqual(['public_profile', 'public_books', 'public_games', 'public_apps']);
    let release!: () => void; state.faults.set('UpdateTabVisibility', [{ gate: new Promise<void>(resolve => { release = resolve; }) }]);
    const control = second.getByRole('checkbox', { name: 'Books Tab', exact: true });
    await submitPinnedCategoryUnpublish(second, control, 'Books Tab'); await expect(control).toBeDisabled(); await control.press('Space');
    expect(state.writes).toHaveLength(3); release(); await expect(control).not.toBeChecked();
    await owner.page.reload(); await settings(owner.page, true);
    await expect(owner.page.getByRole('checkbox', { name: 'Pin Books Tab' })).not.toBeChecked();
    await expect(owner.page.getByRole('checkbox', { name: 'Pin Games Tab' })).toBeChecked();
  } finally { await closeFixture(owner); }
});

for (const choice of ['reject', 'accept', 'custom-off', 'custom-on', 'close'] as const) {
  test(`actual HTML consent ${choice} persists only its explicit choice, never recurring seeds`, async ({ browser, baseURL }) => {
    const visitor = await openFixture(browser, baseURL!, fixtureState());
    const page = visitor.page;
    try {
      await page.goto('/');
      const banner = page.getByTestId('cookie-consent-positioner');
      await expect(banner).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem('explorers-cookie-consent'))).toBeNull();
      expect(visitor.guard.vendors).toEqual([]);
      expect(await page.evaluate(() => ({ scripts: [...document.scripts].filter(s => /googletagmanager|clarity\.ms/.test(s.src)).length, configs: ((window as any).dataLayer ?? []).filter((e: any) => e[0] === 'config').length }))).toEqual({ scripts: 0, configs: 0 });
      if (choice === 'close') await page.getByRole('button', { name: 'Close banner' }).click();
      else if (choice === 'reject') await page.getByRole('button', { name: /Reject Non-Essential/ }).click();
      else if (choice === 'accept') await page.getByRole('button', { name: /Accept All Cookies/ }).click();
      else {
        await page.getByRole('button', { name: /Customize/ }).click();
        await page.getByRole('switch', { name: choice === 'custom-on' ? 'Analytics Cookies' : 'Marketing Cookies' }).click();
        await page.getByRole('button', { name: 'Save Preferences' }).click();
      }
      await expect(banner).toHaveCount(0);
      const stored = await page.evaluate(() => localStorage.getItem('explorers-cookie-consent'));
      if (choice === 'close') expect(stored).toBeNull();
      else expect(JSON.parse(stored!)).toMatchObject({ essential: true, analytics: choice === 'accept' || choice === 'custom-on', marketing: choice === 'accept' || choice === 'custom-off' });
      const enabled = choice === 'accept' || choice === 'custom-on';
      await expect.poll(() => visitor.guard.vendors.length).toBe(enabled ? 2 : 0);
      await page.reload();
      expect(await page.evaluate(() => localStorage.getItem('explorers-cookie-consent'))).toBe(stored);
      if (choice === 'close') await expect(banner).toBeVisible(); else await expect(banner).toHaveCount(0);
      await page.goto(`/${fixtureUser.username}`);
      await expect(page.getByRole('link', { name: 'Profile', exact: true })).toBeVisible();
      await expect(banner).toHaveCount(0);
      if (!enabled) expect(visitor.guard.vendors).toEqual([]);
    } finally { await closeFixture(visitor); }
  });
}

test('last list Draft and Delete preserve category settings/pins, private items stay filtered', async ({ browser, baseURL }) => {
  const state = fixtureState();
  state.lists.bookLists[0].recommended_books = [{ __typename: 'RecommendedBook', documentId: 'fixture-book', volume_id: 'fixture-volume', title: 'Visible fixture book', authors: [], subjects: [], Media: [], book_categories: [], is_pinned: false }];
  const privateList = { ...structuredClone(state.lists.bookLists[0]), documentId: 'private-books-list', List_Name: 'Private fixture list', slug: 'private-fixture', visibility: false };
  state.lists.bookLists.push(privateList);
  const before = { public_books: state.account.public_books, pins: [...state.account.pinned_nav_tabs] };
  const publicCollectionPath = `/api/explorers/v1/collections/${bookFixtureId('collection', 'books-list')}`;
  const privateCollectionPath = `/api/explorers/v1/collections/${bookFixtureId('collection', 'private-books-list')}`;
  const owner = await openFixture(browser, baseURL!, state, { owner: true }); const guest = await openFixture(browser, baseURL!, state);
  try {
    await guest.page.goto(`/${fixtureUser.username}/books`);
    await expect(guest.page.getByText('Public books', { exact: true }).first()).toBeVisible();
    await expect(guest.page.getByText('Private fixture list', { exact: true })).toHaveCount(0);
    await owner.page.goto('/recommendations/books');
    const card = owner.page.locator('div.group').filter({ has: owner.page.getByRole('heading', { name: 'Public books', exact: true }) });
    await card.getByRole('switch', { name: 'Toggle', exact: true }).click();
    await expect(card.getByText('Draft', { exact: true })).toBeVisible();
    expect(state.writes.map(r => r.name)).toEqual([`PATCH ${publicCollectionPath}`]);
    await owner.page.reload(); await expect(card.getByText('Draft', { exact: true })).toBeVisible();
    await guest.page.reload(); await expect(guest.page.getByText('Public books', { exact: true })).toHaveCount(0);
    await owner.page.getByRole('heading', { name: 'Public books', exact: true }).click();
    await owner.page.getByRole('button', { name: 'manage', exact: true }).click();
    owner.page.once('dialog', dialog => dialog.accept());
    await owner.page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(owner.page).toHaveURL(`${baseURL}/recommendations/books`);
    expect(state.writes.map(r => r.name)).toEqual([`PATCH ${publicCollectionPath}`, `DELETE ${publicCollectionPath}`]);
    await owner.page.getByRole('heading', { name: 'Private fixture list', exact: true }).click();
    await owner.page.getByRole('button', { name: 'manage', exact: true }).click();
    owner.page.once('dialog', dialog => dialog.accept()); await owner.page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(owner.page.getByText('Build your library', { exact: true })).toBeVisible();
    expect(state.lists.bookLists).toEqual([]); expect(state.writes.map(r => r.name)).toEqual([`PATCH ${publicCollectionPath}`, `DELETE ${publicCollectionPath}`, `DELETE ${privateCollectionPath}`]);
    expect({ public_books: state.account.public_books, pins: state.account.pinned_nav_tabs }).toEqual(before);
    await settings(owner.page, true); await expect(owner.page.getByRole('checkbox', { name: 'Books Tab', exact: true })).toBeChecked();
    await expect(owner.page.getByRole('checkbox', { name: 'Pin Books Tab' })).toBeChecked();
  } finally { await closeFixture(owner); await closeFixture(guest); }
});

test('all eight empty list responses never mutate category publication or saved pins', async ({ browser, baseURL }) => {
  test.setTimeout(120000);
  const state = fixtureState(); for (const category of categories) state.lists[category.root] = [];
  const before = structuredClone(state.account); const owner = await openFixture(browser, baseURL!, state, { owner: true });
  await owner.context.addInitScript(() => {
    (window as any).__invalidSvgNumbers = [];
    const original = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
      const number = parseFloat(String(value));
      if (['circle', 'rect'].includes(this.localName) && ['r', 'cx', 'cy', 'width', 'height'].includes(name) && (!Number.isFinite(number) || ['r', 'width', 'height'].includes(name) && number < 0)) (window as any).__invalidSvgNumbers.push({ tag: this.localName, name, value: String(value) });
      return original.call(this, name, value);
    };
  });
  try {
    const taglines = ['Map your world', 'Your personal cinema', 'Build your library', 'Level up your lists', 'Your stack, curated', 'Showcase your picks', 'Celebrate great minds', 'Write the itinerary'];
    const diagnostics: Record<string, string[]> = {};
    const invalid: Record<string, unknown> = {};
    for (const [index, category] of categories.entries()) {
      const start = owner.guard.errors.length; await owner.page.goto(`/recommendations/${category.route}`); await expect(owner.page.getByText(taglines[index], { exact: true })).toBeVisible();
      await owner.page.waitForTimeout(5500); // Cross the observed longest numeric repeat (Games XP, 5s).
      invalid[category.route] = await owner.page.evaluate(() => (window as any).__invalidSvgNumbers);
      await owner.page.getByText('Settings', { exact: true }).first().click(); await owner.page.goBack(); await expect(owner.page.getByText(taglines[index], { exact: true })).toBeVisible();
      invalid[category.route] = await owner.page.evaluate(() => (window as any).__invalidSvgNumbers);
      diagnostics[category.route] = owner.guard.errors.slice(start);
    }
    await test.info().attach('empty-category-console-by-route', { contentType: 'application/json', body: JSON.stringify(diagnostics) });
    await test.info().attach('invalid-numeric-svg-attributes', { contentType: 'application/json', body: JSON.stringify(invalid) });
    expect(Object.values(invalid).every(values => Array.isArray(values) && values.length === 0)).toBe(true);
    await settings(owner.page); expect(state.writes).toEqual([]); expect(state.account).toEqual(before);
  } finally { await closeFixture(owner); }
});

test('direct dashboard/public/share never mount consent; landing delayed banner cancels on navigation', async ({ browser, baseURL }) => {
  const state = fixtureState(); const visitor = await openFixture(browser, baseURL!, state, { owner: true });
  const landing = await openFixture(browser, baseURL!, state);
  try {
    for (const path of ['/settings', '/recommendations/music', `/${fixtureUser.username}`, `/${fixtureUser.username}/music`, '/music/share/missing-fixture']) {
      await visitor.page.goto(path); await visitor.page.waitForTimeout(2200);
      await expect(visitor.page.getByTestId('cookie-consent-positioner')).toHaveCount(0);
      expect(await visitor.page.evaluate(() => localStorage.getItem('explorers-cookie-consent'))).toBeNull(); expect(visitor.guard.vendors).toEqual([]);
    }
    await landing.page.goto('/'); await landing.page.getByRole('button', { name: /log.?in/i }).first().click();
    await landing.page.waitForTimeout(2300); await expect(landing.page.getByTestId('cookie-consent-positioner')).toHaveCount(0); expect(landing.guard.vendors).toEqual([]);
  } finally { await closeFixture(visitor); await closeFixture(landing); }
});

test('consent storage denial keeps actual bootstrap and explicit Accept fail closed', async ({ browser, baseURL }) => {
  const visitor = await openFixture(browser, baseURL!, fixtureState());
  await visitor.context.addInitScript(() => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = function(key) { if (key === 'explorers-cookie-consent') throw new DOMException('Fixture denied', 'SecurityError'); return get.call(this, key); };
    Storage.prototype.setItem = function(key, value) { if (key === 'explorers-cookie-consent') throw new DOMException('Fixture denied', 'SecurityError'); return set.call(this, key, value); };
  });
  try {
    await visitor.page.goto('/'); await visitor.page.getByRole('button', { name: /Accept All Cookies/ }).click();
    await expect(visitor.page.getByTestId('cookie-consent-positioner')).toHaveCount(0); expect(visitor.guard.vendors).toEqual([]);
    await visitor.page.reload(); await expect(visitor.page.getByTestId('cookie-consent-positioner')).toBeVisible(); expect(visitor.guard.vendors).toEqual([]);
    expect(await visitor.page.evaluate(() => [...document.scripts].filter(s => /googletagmanager|clarity\.ms/.test(s.src)).length)).toBe(0);
  } finally { await closeFixture(visitor); }
});

test('catchall deliberately denies unknown external HTTP and WebSocket without forwarding', async ({ browser, baseURL }) => {
  const visitor = await openFixture(browser, baseURL!, fixtureState());
  try {
    await visitor.page.goto(`/${fixtureUser.username}`); await expect(visitor.page.getByRole('link', { name: 'Profile', exact: true })).toBeVisible();
    visitor.guard.assertClean();
    await visitor.page.evaluate(async () => { try { await fetch('https://music-fixture.test/deliberately-unhandled'); } catch { /* Expected local abort. */ } });
    const unhandledMusicPage = await visitor.context.newPage();
    await unhandledMusicPage.goto('https://localtunes.test/assets/deliberately-unhandled.js').catch(() => undefined);
    await unhandledMusicPage.close();
    await visitor.page.evaluate(origin => new Promise<void>(resolve => { const socket = new WebSocket(origin.replace('http:', 'ws:') + '/deliberately-unhandled'); socket.onclose = () => resolve(); }), baseURL!);
    expect(visitor.guard.denied).toEqual([
      'GET external music-fixture.test',
      'GET external localtunes.test/assets/deliberately-unhandled.js',
      'unexpected websocket',
    ]);
    await test.info().attach('expected-denial', { contentType: 'application/json', body: JSON.stringify({ denied: visitor.guard.denied, console: visitor.guard.errors }) });
    expect(visitor.guard.errors).toEqual(['Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector']);
  } finally { await visitor.context.close(); }
});

test('offline/online and Music outage preserve unrelated pins until explicit fresh owner action', async ({ browser, baseURL }) => {
  const state = fixtureState({ public_music: 'Yes', pinned_nav_tabs: ['public_profile', 'public_music', 'public_books'] }, 'public');
  const owner = await openFixture(browser, baseURL!, state, { owner: true });
  try {
    await settings(owner.page, true);
    state.faults.set('CategoryNavigationAccount', [{ kind: 'offline' }]);
    await owner.context.setOffline(true);
    const pin = owner.page.getByRole('checkbox', { name: 'Pin Games Tab' }); await pin.focus(); await pin.press('Space');
    await expect(owner.page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible(); expect(state.writes).toEqual([]);
    expect(state.account.pinned_nav_tabs).toEqual(['public_profile', 'public_music', 'public_books']);
    await owner.context.setOffline(false); await expect(pin).toBeEnabled(); expect(state.writes).toEqual([]);
    state.faults.set('/api/music/public-profile/browser-account', Array.from({ length: 10 }, () => ({ kind: 'error' as const })));
    await toggle(pin, true);
    expect(state.writes.at(-1)?.variables.data).toEqual({ pinned_nav_tabs: ['public_profile', 'public_music', 'public_books', 'public_games'] });
    expect(state.account.public_music).toBe('Yes'); expect(state.mode).toBe('public');
  } finally { await owner.context.setOffline(false); await closeFixture(owner); }
});

test('ordinary stale loaded account rereads latest pins and route/account change blocks pending intent', async ({ browser, baseURL }) => {
  const state = fixtureState(); const owner = await openFixture(browser, baseURL!, state, { owner: true }); let release!: () => void;
  try {
    await settings(owner.page, true);
    state.account.pinned_nav_tabs = ['public_profile', 'public_books', 'public_apps'];
    await toggle(owner.page.getByRole('checkbox', { name: 'Pin Games Tab' }), true);
    expect(state.account.pinned_nav_tabs).toEqual(['public_profile', 'public_books', 'public_apps', 'public_games']);
    const writes = state.writes.length;
    state.faults.set('CategoryNavigationAccount', [{ gate: new Promise<void>(resolve => { release = resolve; }) }]);
    const books = owner.page.getByRole('checkbox', { name: 'Books Tab', exact: true }); await submitPinnedCategoryUnpublish(owner.page, books, 'Books Tab'); await expect(books).toBeDisabled();
    state.account.documentId = 'fixture-account-b'; await owner.page.goto('/recommendations/books'); release();
    await expect(owner.page.getByRole('checkbox').first()).toBeEnabled(); expect(state.writes).toHaveLength(writes); expect(state.account.public_books).toBe('Yes');
    state.account.documentId = 'browser-account'; await owner.page.reload(); await expect(owner.page.getByRole('checkbox').first()).toBeChecked(); expect(state.writes).toHaveLength(writes);
  } finally { release?.(); await closeFixture(owner); }
});
