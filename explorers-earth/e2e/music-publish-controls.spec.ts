import { expect, test } from '@playwright/test';
import { canonicalCategoryAccount, categories, closeFixture, fixtureState, fixtureUser, invalidateGuests, openFixture, publicSlug, settings, toggle } from './setup/category-navigation';

// The navigation client no longer issues the legacy UpdateTabVisibility mutation;
// it writes the whole canonical preference set through PATCH /api/explorers/v1/account.
// These helpers translate the legacy `variables.data` patch assertions into the
// canonical payload so the same behaviour is still asserted — exact field value,
// exact pin order, revision carried — rather than dropped. Mirrors the helper in
// category-navigation-b.spec.ts.
const ACCOUNT_WRITE = 'PATCH /api/explorers/v1/account';
function preferenceWrite(before: ReturnType<typeof canonicalCategoryAccount>, change: { category?: string; isPublic?: boolean; pins?: string[] }) {
  const fields = new Map<string,string>([...categories.map(category => [category.route, category.field] as [string,string]), ['music', 'public_music']]);
  return { expectedRevision: before.revision, categories: before.categories.map(row => ({ ...row,
    ...(row.category === change.category ? { isPublic: change.isPublic } : {}),
    ...(change.pins ? { pinnedOrder: change.pins.includes(fields.get(row.category)!) ? change.pins.indexOf(fields.get(row.category)!) - 1 : null } : {}),
  })) };
}
// Revision-independent projection, for sequences where an earlier write is still
// in flight and the revision the client will send next cannot be predicted from
// the spec. Keeps the exact asserted field value and the exact pin order.
function writtenPins(write: { variables: any }) {
  return write.variables.categories.filter((row: any) => row.pinnedOrder !== null)
    .sort((a: any, b: any) => a.pinnedOrder - b.pinnedOrder).map((row: any) => row.category);
}
// The fixture's public-profile route accepts either the legacy fixture alias or
// the canonical account UUID, and faults are keyed on the exact request pathname.
// Which one the Music public adapter sends is not determinable from this spec, so
// arm both keys: only the path actually requested consumes its queue, and the
// unused key produces no responses. This keeps the fault firing regardless, rather
// than silently never matching.
function setPublicProfileFault(state: ReturnType<typeof fixtureState>, entries: any[]) {
  for (const id of [state.account.documentId, canonicalCategoryAccount(state).id]) {
    state.faults.set(`/api/music/public-profile/${id}`, entries.map(entry => ({ ...entry })));
  }
}
function writtenField(write: { variables: any }, category: string) {
  return write.variables.categories.find((row: any) => row.category === category)?.isPublic;
}

for (const width of [320, 1280]) {
  test(`Music pin hint checking and outage preserve the saved pin at ${width}px`, async ({ browser, baseURL }) => {
    const state = fixtureState({ public_music: 'Yes', pinned_nav_tabs: ['public_profile', 'public_music', 'public_books'] }, 'public');
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    state.faults.set('/api/music/dashboard', Array.from({ length: 10 }, () => ({ gate, kind: 'error' as const })));
    const owner = await openFixture(browser, baseURL!, state, { owner: true, width });
    try {
      await owner.page.goto('/settings#public-navigation');
      const pin = owner.page.getByRole('checkbox', { name: 'Pin Music Tab' });
      const row = pin.locator('xpath=../../..');
      await expect.poll(() => state.apiCalls.some(call => call.path === '/api/music/dashboard')).toBe(true);
      await expect(pin).toBeChecked();
      await expect.soft(row).toContainText('Checking Music publication…');
      await expect.soft(row).not.toContainText('Visibility off');
      expect(state.writes).toEqual([]);
      release();
      await expect(row).toContainText('Music publication was not confirmed. Refresh or retry the previous action.');
      await expect(row).not.toContainText('Visibility off'); await expect(pin).toBeChecked();
      expect(state.account.pinned_nav_tabs).toEqual(['public_profile', 'public_music', 'public_books']); expect(state.writes).toEqual([]);
      expect(await owner.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const beforeUnpin = canonicalCategoryAccount(state);
      await toggle(pin, false);
      expect(state.writes.map(write => write.variables)).toEqual([preferenceWrite(beforeUnpin, { pins: ['public_profile', 'public_books'] })]);
      expect(state.account.public_music).toBe('Yes'); expect(state.apiCalls.filter(call => call.path === '/api/music/publication')).toEqual([]);
    } finally { release(); await closeFixture(owner); }
  });
}

for (const [profile, mode, pinned, hint] of [
  ['No', 'private', false, 'Music is private.'],
  ['Yes', 'public', true, null],
  ['No', 'public', true, 'Music sharing needs attention. Review or make it private.'],
] as const) {
  test(`Music pin hint ${profile}/${mode} is truthful without changing placement`, async ({ browser, baseURL }) => {
    const pins = ['public_profile', ...(pinned ? ['public_music'] : []), 'public_books'];
    const state = fixtureState({ public_music: profile, pinned_nav_tabs: pins }, mode);
    const owner = await openFixture(browser, baseURL!, state, { owner: true });
    try {
      await settings(owner.page, true);
      await expect(owner.page.getByRole('switch', { name: 'Music public visibility' })).toBeEnabled();
      const pin = owner.page.getByRole('checkbox', { name: 'Pin Music Tab' }); const row = pin.locator('xpath=../../..');
      if (hint) await expect(row).toContainText(hint);
      else await expect(row).toHaveText('♫Music Tab');
      await expect(row).not.toContainText('Visibility off'); await expect(pin).toBeChecked({ checked: pinned });
      expect(state.account.pinned_nav_tabs).toEqual(pins); expect(state.writes).toEqual([]);
      if (pinned && profile === 'No') {
        const beforeUnpin = canonicalCategoryAccount(state);
        await toggle(pin, false);
        expect(state.writes.map(write => write.variables)).toEqual([preferenceWrite(beforeUnpin, { pins: ['public_profile', 'public_books'] })]);
        expect(state.account.public_music).toBe('No');
      }
      expect(state.apiCalls.filter(call => call.path === '/api/music/publication')).toEqual([]);
    } finally { await closeFixture(owner); }
  });
}

const statusCases = [
  ['No', 'private', 'private', 'attention'], ['No', 'unlisted', 'attention', 'attention'], ['No', 'public', 'attention', 'attention'],
  ['Yes', 'private', 'attention', 'attention'], ['Yes', 'unlisted', 'attention', 'attention'], ['Yes', 'public', 'public', 'public'],
] as const;
for (const [profile, mode, absent, saved] of statusCases) for (const auto of [false, true]) for (const pin of [false, true]) {
  test(`matrix ${profile}/${mode}/${auto ? 'Auto' : 'Manual'}/${pin ? 'saved' : 'absent'} is truthful and read-only`, async ({ browser, baseURL }) => {
    const state = fixtureState({ public_music: profile, auto_pinning: auto, pinned_nav_tabs: ['public_profile', ...(pin ? ['public_music'] : []), 'public_books'] }, mode);
    const owner = await openFixture(browser, baseURL!, state, { owner: true });
    try {
      await settings(owner.page);
      const control = owner.page.getByRole('switch', { name: 'Music public visibility' });
      await expect(control).toHaveCount(1); await expect(control).toBeEnabled();
      await expect(control).toBeChecked({ checked: profile === 'Yes' && mode === 'public' });
      const expected = pin ? saved : absent;
      await expect(owner.page.getByText(expected === 'attention' ? 'Music sharing needs attention. Review or make it private.' : `Music is ${expected}.`, { exact: true })).toHaveCount(1);
      expect(state.writes).toEqual([]);
    } finally { await closeFixture(owner); }
  });
}

test('Settings On → reload/Pin → anonymous friendly/share → header Off revokes open guest and old link', async ({ browser, baseURL }) => {
  const state = fixtureState(); const beforePermissions = structuredClone(state.guestControls); const beforeLists = structuredClone(state.playlists);
  const owner = await openFixture(browser, baseURL!, state, { owner: true }); const guest = await openFixture(browser, baseURL!, state);
  try {
    await settings(owner.page); const control = owner.page.getByRole('switch', { name: 'Music public visibility' });
    const beforeOn = canonicalCategoryAccount(state);
    await control.click(); await expect(control).toBeChecked(); await expect(control).toBeEnabled();
    expect(state.writes.map(r => r.name)).toEqual([ACCOUNT_WRITE, '/api/music/publication']);
    expect(state.writes[0].variables).toEqual(preferenceWrite(beforeOn, { category: 'music', isPublic: true }));
    await owner.page.reload(); await settings(owner.page, true); await expect(control).toBeChecked();
    await toggle(owner.page.getByRole('checkbox', { name: 'Pin Music Tab' }), true);
    await guest.page.goto(`/${fixtureUser.username}`);
    await guest.page.getByRole('link', { name: 'Music', exact: true }).click();
    await expect(guest.page.getByRole('heading', { name: 'Music', exact: true })).toBeVisible();
    await expect(guest.page.getByText('Private owner playlist')).toHaveCount(0);
    const sharePage = await guest.context.newPage(); await sharePage.goto(`/music/share/${publicSlug}`);
    await expect(sharePage.getByRole('heading', { name: 'Music', exact: true })).toBeVisible(); await expect(sharePage.getByText('Private owner playlist')).toHaveCount(0); await sharePage.close();
    await owner.page.goto('/recommendations/music');
    await expect(control).toHaveCount(1); await expect(control).toBeEnabled(); await control.click();
    await expect(control).not.toBeChecked(); await expect(control).toBeEnabled();
    invalidateGuests(state);
    await expect(guest.page).toHaveURL(`${baseURL}/${fixtureUser.username}`);
    await guest.page.goto(`/music/share/${publicSlug}`);
    await expect(guest.page.getByRole('heading', { name: 'Music page unavailable' })).toBeVisible();
    await expect(guest.page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
    await settings(owner.page, true);
    await expect(owner.page.getByRole('checkbox', { name: 'Pin Music Tab' })).not.toBeChecked();
    expect(state.account.pinned_nav_tabs).toEqual(['public_profile', 'public_books']);
    expect(state.guestControls).toEqual(beforePermissions); expect(state.playlists).toEqual(beforeLists);
  } finally { await closeFixture(owner); await closeFixture(guest); }
});

test('Auto + saved Music → header Off → Manual → Settings On never restores removed pin', async ({ browser, baseURL }) => {
  const state = fixtureState({ public_music: 'Yes', auto_pinning: true, pinned_nav_tabs: ['public_profile', 'public_music', 'public_books', 'public_games'] }, 'public');
  const owner = await openFixture(browser, baseURL!, state, { owner: true }); const guest = await openFixture(browser, baseURL!, state);
  try {
    await owner.page.goto('/recommendations/music'); const control = owner.page.getByRole('switch', { name: 'Music public visibility' });
    await expect(control).toBeChecked(); await control.click(); await expect(control).toBeEnabled(); await expect(control).not.toBeChecked();
    expect(state.account.pinned_nav_tabs).toEqual(['public_profile', 'public_books', 'public_games']);
    await owner.page.reload(); await settings(owner.page, true);
    await toggle(owner.page.getByRole('checkbox', { name: 'Auto-pin navigation tabs' }), false);
    await expect(owner.page.getByRole('checkbox', { name: 'Pin Music Tab' })).not.toBeChecked();
    await control.click(); await expect(control).toBeChecked(); await expect(control).toBeEnabled();
    expect(state.account.pinned_nav_tabs).toEqual(['public_profile', 'public_books', 'public_games']);
    await guest.page.goto(`/${fixtureUser.username}/music`); await expect(guest.page.getByRole('heading', { name: 'Music', exact: true })).toBeVisible();
    await control.click(); await expect(control).not.toBeChecked(); await expect(control).toBeEnabled();
    await owner.page.goto('/recommendations/music'); await expect(control).not.toBeChecked();
    await control.click(); await expect(control).toBeChecked(); await expect(control).toBeEnabled();
    expect(state.account.pinned_nav_tabs).toEqual(['public_profile', 'public_books', 'public_games']);
  } finally { await closeFixture(owner); await closeFixture(guest); }
});

for (const [profile, mode] of [['No', 'public'], ['Yes', 'unlisted']] as const) {
  test(`${profile}+${mode} Make private recovery never publishes first`, async ({ browser, baseURL }) => {
    const state = fixtureState({ public_music: profile, pinned_nav_tabs: ['public_profile', 'public_music', 'public_books'] }, mode);
    const owner = await openFixture(browser, baseURL!, state, { owner: true });
    try {
      const beforePrivate = canonicalCategoryAccount(state);
      await settings(owner.page); await owner.page.getByRole('button', { name: 'Make private', exact: true }).click();
      await expect(owner.page.getByText('Music is private.', { exact: true })).toHaveCount(1);
      expect(state.apiCalls.filter(r => r.path === '/api/music/publication').map(r => r.body)).toEqual([{ mode: 'private' }]);
      expect(state.account.pinned_nav_tabs).toEqual(['public_profile', 'public_books']);
      expect(state.writes.filter(r => r.name === ACCOUNT_WRITE).map(r => r.variables)).toEqual([preferenceWrite(beforePrivate, { category: 'music', isPublic: false, pins: ['public_profile', 'public_books'] })]);
    } finally { await closeFixture(owner); }
  });
}

for (const fault of ['Strapi', 'Express', 'lost response', 'verification', 'expired replay'] as const) {
  test(`Music ${fault} requires explicit same-key recovery or separate fresh confirmation`, async ({ browser, baseURL }) => {
    const state = fixtureState(); const owner = await openFixture(browser, baseURL!, state, { owner: true });
    try {
      await settings(owner.page);
      if (fault === 'Strapi') state.faults.set('/api/explorers/v1/account', [{ kind: 'error' }]);
      else if (fault === 'verification') setPublicProfileFault(state, [{ kind: 'error' }, { kind: 'error' }]);
      else state.faults.set('/api/music/publication', [{ kind: fault === 'lost response' ? 'lost' : fault === 'expired replay' ? 'expired' : 'error' }]);
      const control = owner.page.getByRole('switch', { name: 'Music public visibility' });
      await expect(control).toBeEnabled(); await control.click(); await expect(control).toBeDisabled();
      const recovery = owner.page.getByRole('button', { name: fault === 'expired replay' ? 'Confirm new public action' : 'Retry previous action', exact: true });
      await expect(recovery).toBeEnabled();
      const commands = () => state.apiCalls.filter(r => r.path === '/api/music/publication');
      const count = commands().length; await owner.page.waitForTimeout(250); expect(commands()).toHaveLength(count);
      const firstKey = commands()[0]?.key;
      state.faults.clear();
      if (fault === 'expired replay') { await owner.page.getByRole('button', { name: 'Refresh Music status' }).click(); await expect(control).toBeDisabled(); }
      await recovery.click(); await expect(control).toBeChecked(); await expect(control).toBeEnabled();
      if (firstKey) expect(commands().at(-1)?.key === firstKey).toBe(fault !== 'expired replay');
      expect(commands().every(r => Object.keys(r.body).join(',') === 'mode')).toBe(true);
    } finally { await closeFixture(owner); }
  });
}

for (const status of [429, 503]) {
  test(`friendly ${status} retains route and recovers with the intended retry policy`, async ({ browser, baseURL }) => {
    const state = fixtureState({ public_music: 'Yes' }, 'public');
    setPublicProfileFault(state, [{ kind: 'error', status }]);
    const guest = await openFixture(browser, baseURL!, state);
    try {
      await guest.page.goto(`/${fixtureUser.username}/music?utm_source=browser`);
      await expect(guest.page).toHaveURL(`${baseURL}/${fixtureUser.username}/music?utm_source=browser`);
      if (status === 429) {
        const retry = guest.page.getByRole('button', { name: 'Retry', exact: true });
        await expect(retry).toBeVisible();
        await expect(guest.page.getByRole('heading', { name: 'Too many requests. Try again in 1 seconds.' })).toBeVisible();
        await expect(retry).toBeEnabled(); await retry.click();
      }
      await expect(guest.page.getByRole('heading', { name: 'Music', exact: true })).toBeVisible();
      expect(state.writes).toEqual([]);
    } finally { await closeFixture(guest); }
  });
}

for (const width of [320, 375, 390, 768, 1280, 1440]) for (const theme of ['light', 'dark']) {
  test(`geometry ${width}/${theme}: Settings and complete/compact Music, keyboard and touch`, async ({ browser, baseURL }) => {
    const state = fixtureState(); const owner = await openFixture(browser, baseURL!, state, { owner: true, width, theme, touch: width <= 390 });
    try {
      for (const surface of ['Settings', 'complete', 'compact']) {
        if (surface === 'Settings') await settings(owner.page);
        else { state.ownerWorkspace = surface === 'complete'; await owner.page.goto('/recommendations/music'); }
        const control = owner.page.getByRole('switch', { name: 'Music public visibility' });
        await expect(control).toHaveCount(1); await expect(control).toBeEnabled(); await control.scrollIntoViewIfNeeded();
        const box = await control.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(await owner.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await owner.page.locator('html').evaluate(el => el.classList.contains('dashboard-theme-dark'))).toBe(theme === 'dark');
        const status = owner.page.locator(`[id="${await control.getAttribute('aria-describedby')}"]`);
        await expect(status).toContainText('Music is private.'); if (surface !== 'Settings') await expect(status).toBeVisible();
        await expect(owner.page.getByText('Music publication', { exact: true })).toHaveCount(0);
        await control.focus(); await expect(control).toBeFocused(); await control.press('Space'); await expect(control).toBeChecked(); await expect(control).toBeEnabled();
        if (width <= 390) await control.tap(); else await control.press('Enter');
        await expect(control).not.toBeChecked(); await expect(control).toBeEnabled();
        if ((width === 320 || width === 1280) && surface !== 'compact') await owner.page.screenshot({ path: test.info().outputPath(`${surface}-${width}-${theme}.png`), fullPage: true });
      }
      expect(state.writes.filter(r => r.name === '/api/music/publication')).toHaveLength(6);
    } finally { await closeFixture(owner); }
  });
}

test('authoritative friendly fallback replaces history, preserves only safe UTM and drops capability fragment', async ({ browser, baseURL }) => {
  const state = fixtureState(); const guest = await openFixture(browser, baseURL!, state);
  try {
    await guest.page.goto(`/${fixtureUser.username}/books`); await expect(guest.page.getByRole('link', { name: 'Profile', exact: true })).toBeVisible();
    await guest.page.goto(`/${fixtureUser.username}/music?utm_source=browser&utm_medium=qa&unsafe=value#access=discard-me`);
    await expect(guest.page).toHaveURL(`${baseURL}/${fixtureUser.username}?utm_source=browser&utm_medium=qa`);
    await guest.page.goBack(); await expect(guest.page).toHaveURL(`${baseURL}/${fixtureUser.username}/books`);
    expect(state.writes).toEqual([]);
  } finally { await closeFixture(guest); }
});

for (const username of ['unknown-fixture-user', 'bad%20username']) {
  test(`unknown/invalid username ${username} keeps normal 404`, async ({ browser, baseURL }) => {
    const guest = await openFixture(browser, baseURL!, fixtureState());
    try {
      await guest.page.goto(`/${username}/music`);
      await expect(guest.page.getByText(/page not found|user not found|404/i).first()).toBeVisible();
      await expect(guest.page).not.toHaveURL(`${baseURL}/${fixtureUser.username}`);
    } finally { await closeFixture(guest); }
  });
}

test('friendly pending descriptor never redirects; failed account read Retry performs a fresh account read', async ({ browser, baseURL }) => {
  const state = fixtureState({ public_music: 'Yes' }, 'public'); const guest = await openFixture(browser, baseURL!, state);
  let release!: () => void;
  setPublicProfileFault(state, [{ gate: new Promise<void>(resolve => { release = resolve; }) }]);
  try {
    await guest.page.goto(`/${fixtureUser.username}/music`);
    await expect.poll(() => state.apiCalls.some(r => r.path.includes('public-profile'))).toBe(true);
    await guest.page.waitForTimeout(250); await expect(guest.page).toHaveURL(`${baseURL}/${fixtureUser.username}/music`);
    await expect(guest.page.getByRole('heading', { name: 'Music', exact: true })).toHaveCount(0);
    release(); await expect(guest.page.getByRole('heading', { name: 'Music', exact: true })).toBeVisible();
    // The public shell now reads through the gateway. Consume both the one
    // automatic transient retry and the failed attempt rendered for the user.
    state.faults.set('PublicProfileData', [{ kind: 'error' }, { kind: 'error' }]);
    await guest.page.reload();
    const retry = guest.page.getByRole('button', { name: 'Retry', exact: true }); await expect(retry).toBeVisible();
    const reads = state.reads.length; await retry.click();
    // Explicit 30s window on THIS wait only. It is a MITIGATION, not a fix: the cause of the
    // variance is not known. Measured on CI at 741068bd, where the same commit's two runs of this
    // lane differed -- the failing run took 19.65s for this test, 12.0s of which was the expect
    // timeout, so its prologue cost ~7.6s; the passing twin took 7.94s end to end. The gateway read
    // the Retry click starts therefore completed in under a second in one run and exceeded 12s in
    // the other.
    // Two earlier claims in this comment were wrong and are corrected here. The budget is 60s, not
    // 90s: in CI this spec runs only under playwright.music-publishing.config.ts, which spreads
    // playwright.category-navigation.config.ts:6 (timeout 60_000, expect 12_000). And the mechanism
    // is NOT parallel contention -- that same line sets workers: 1, so the lane is serial and 69 is
    // its serial test count. navigationTimeout is unset there, so the reload before this point is
    // bounded only by the 60s test budget.
    // 30s sits inside 60s against a measured ~7.6s prologue, so a genuinely slow read still fails as
    // this assertion rather than as an opaque test timeout. The assertion is unchanged and must still
    // come true; the read-count and no-writes checks on the next line are untouched.
    await expect(guest.page.getByRole('heading', { name: 'Music', exact: true })).toBeVisible({ timeout: 30000 }); expect(state.reads.length).toBeGreaterThan(reads); expect(state.writes).toEqual([]);
  } finally { release?.(); await closeFixture(guest); }
});

test('same-key Private replay cannot clear account after another device restored Public', async ({ browser, baseURL }) => {
  const state = fixtureState({ public_music: 'Yes', pinned_nav_tabs: ['public_profile', 'public_music', 'public_books'] }, 'public');
  const owner = await openFixture(browser, baseURL!, state, { owner: true });
  try {
    await settings(owner.page); state.faults.set('/api/music/publication', [{ kind: 'lost' }]);
    await owner.page.getByRole('switch', { name: 'Music public visibility' }).click();
    const retry = owner.page.getByRole('button', { name: 'Retry previous action' }); await expect(retry).toBeEnabled();
    state.mode = 'public'; state.revision++; // Another device's newer backend publication, not this app's serialized owner.
    const key = state.apiCalls.find(r => r.path === '/api/music/publication')!.key;
    await retry.click(); await expect(owner.page.getByRole('button', { name: 'Confirm new private action' })).toBeEnabled();
    expect(state.writes.filter(r => r.name === ACCOUNT_WRITE)).toEqual([]);
    expect(state.apiCalls.filter(r => r.path === '/api/music/publication').map(r => r.key)).toEqual([key, key]);
    expect(state.mode).toBe('public'); expect(state.account.pinned_nav_tabs).toContain('public_music');
  } finally { await closeFixture(owner); }
});

test('session storage denial retains in-memory stable retry without automatic writes', async ({ browser, baseURL }) => {
  const state = fixtureState(); const owner = await openFixture(browser, baseURL!, state, { owner: true });
  await owner.context.addInitScript(() => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem, remove = Storage.prototype.removeItem;
    Storage.prototype.getItem = function(key) { if (key.startsWith('explorers-music-publish/')) throw new DOMException('Fixture denied', 'SecurityError'); return get.call(this, key); };
    Storage.prototype.setItem = function(key, value) { if (key.startsWith('explorers-music-publish/')) throw new DOMException('Fixture denied', 'SecurityError'); return set.call(this, key, value); };
    Storage.prototype.removeItem = function(key) { if (key.startsWith('explorers-music-publish/')) throw new DOMException('Fixture denied', 'SecurityError'); return remove.call(this, key); };
  });
  try {
    await settings(owner.page); expect(state.writes).toEqual([]); state.faults.set('/api/music/publication', [{ kind: 'lost' }]);
    const control = owner.page.getByRole('switch', { name: 'Music public visibility' }); await control.click();
    await owner.page.getByRole('button', { name: 'Retry previous action' }).click(); await expect(control).toBeChecked(); await expect(control).toBeEnabled();
    const keys = state.apiCalls.filter(r => r.path === '/api/music/publication').map(r => r.key); expect(keys).toHaveLength(2); expect(keys[1]).toBe(keys[0]);
    await owner.page.reload(); await settings(owner.page); await expect(control).toBeChecked(); expect(state.apiCalls.filter(r => r.path === '/api/music/publication')).toHaveLength(2);
  } finally { await closeFixture(owner); }
});

test('cold mobile Music and breakpoint remount during pending read cannot leak an old write', async ({ browser, baseURL }) => {
  const state = fixtureState(); const owner = await openFixture(browser, baseURL!, state, { owner: true, width: 375, touch: true });
  let release!: () => void;
  try {
    await owner.page.goto('/recommendations/music'); const control = owner.page.getByRole('switch', { name: 'Music public visibility' });
    await expect(control).toHaveCount(1); await expect(control).toBeEnabled(); expect(state.writes).toEqual([]);
    const gate = new Promise<void>(resolve => { release = resolve; });
    // Focus and the new layout may also read; hold all account reads at this boundary.
    state.faults.set('/api/explorers/v1/me', Array.from({ length: 10 }, () => ({ gate })));
    await control.tap(); await expect(control).toBeDisabled();
    await owner.page.setViewportSize({ width: 1280, height: 900 }); await expect(owner.page.locator('.dashboard-content')).toBeVisible();
    state.faults.delete('/api/explorers/v1/me'); release(); await expect(control).toHaveCount(1); await owner.page.waitForTimeout(300); expect(state.writes).toEqual([]);
    await owner.page.setViewportSize({ width: 375, height: 900 }); await expect(control).toHaveCount(1);
    await owner.page.reload(); await expect(control).toHaveCount(1); expect(state.writes).toEqual([]);
  } finally { release?.(); await closeFixture(owner); }
});

for (const condition of ['invalid', 'unknown', 'identity not ready'] as const) {
  test(`Music ${condition} is disabled without blocking ordinary Settings`, async ({ browser, baseURL }) => {
    const state = fixtureState();
    if (condition === 'invalid') state.mode = 'invalid' as any;
    else if (condition === 'unknown') state.faults.set('/api/music/dashboard', Array.from({ length: 10 }, () => ({ kind: 'error' as const })));
    // Provisioning moved to the canonical same-origin route (ADR-006/008), so faulting
    // the legacy Music-origin path no longer makes the identity unready - the client
    // never calls it, ensure succeeds and the control renders enabled.
    else state.faults.set('/api/explorers/v1/music/identity/ensure', Array.from({ length: 10 }, () => ({ kind: 'error' as const })));
    const owner = await openFixture(browser, baseURL!, state, { owner: true });
    try {
      await settings(owner.page); const control = owner.page.getByRole('switch', { name: 'Music public visibility' }); await expect(control).toBeDisabled();
      const status = owner.page.locator(`[id="${await control.getAttribute('aria-describedby')}"]`); await expect(status).toContainText(/not confirmed|not ready/); await expect(status).toBeVisible();
      const books = owner.page.getByRole('checkbox', { name: 'Books Tab', exact: true });
      await books.focus(); await books.press('Space');
      const confirm = owner.page.getByRole('button', { name: 'Unpublish Books', exact: true });
      await expect(confirm).toBeVisible(); await confirm.click();
      await expect(books).not.toBeChecked();
      expect(state.writes.map(r => r.name)).toEqual([ACCOUNT_WRITE]);
      expect(state.account.public_books).toBe('No'); expect(state.account.public_music).toBe('No');
    } finally { await closeFixture(owner); }
  });
}

test('two owner tabs observe verified final Music On and Off without automatic commands', async ({ browser, baseURL }) => {
  const state = fixtureState(); const owner = await openFixture(browser, baseURL!, state, { owner: true }); const second = await owner.context.newPage();
  try {
    await settings(owner.page); await second.goto('/recommendations/music');
    const firstSwitch = owner.page.getByRole('switch', { name: 'Music public visibility' }); const secondSwitch = second.getByRole('switch', { name: 'Music public visibility' });
    await expect(secondSwitch).toBeEnabled(); await firstSwitch.click(); await expect(firstSwitch).toBeChecked(); await expect(firstSwitch).toBeEnabled();
    await expect(secondSwitch).toBeChecked(); await expect(secondSwitch).toBeEnabled(); await secondSwitch.click();
    await expect(secondSwitch).not.toBeChecked(); await expect(secondSwitch).toBeEnabled(); await expect(firstSwitch).not.toBeChecked();
    expect(state.apiCalls.filter(r => r.path === '/api/music/publication').map(r => r.body.mode)).toEqual(['public', 'private']);
  } finally { await closeFixture(owner); }
});

test('delayed cross-device old Public can win backend ordering and must surface conflict', async ({ browser, baseURL }) => {
  const state = fixtureState(); const first = await openFixture(browser, baseURL!, state, { owner: true }); const otherDevice = await openFixture(browser, baseURL!, state, { owner: true });
  let release!: () => void;
  try {
    await settings(first.page); state.faults.set('/api/music/publication', [{ gate: new Promise<void>(resolve => { release = resolve; }) }]);
    await first.page.getByRole('switch', { name: 'Music public visibility' }).click(); await expect.poll(() => state.apiCalls.some(r => r.path === '/api/music/publication')).toBe(true);
    await settings(otherDevice.page); await otherDevice.page.getByRole('button', { name: 'Make private', exact: true }).click();
    await expect(otherDevice.page.getByText('Music is private.', { exact: true })).toHaveCount(1); expect(state.mode).toBe('private');
    release(); await expect(first.page.getByRole('button', { name: 'Confirm new public action' })).toBeEnabled();
    expect(state.mode).toBe('public'); expect(state.account.public_music).toBe('No');
    expect(state.apiCalls.filter(r => r.path === '/api/music/publication').map(r => r.body.mode)).toEqual(['public', 'private']);
    await first.page.waitForTimeout(250); expect(state.apiCalls.filter(r => r.path === '/api/music/publication')).toHaveLength(2);
  } finally { release?.(); await closeFixture(first); await closeFixture(otherDevice); }
});

test('pending account read across A→B→A and logout never authorizes a stale publication', async ({ browser, baseURL }) => {
  // This case signs out, which is a canonical same-origin command the fixture only
  // answers on request - the containment spec asserts it stays denied by default.
  const state = fixtureState(); state.signOutHandled = true;
  const owner = await openFixture(browser, baseURL!, state, { owner: true }); let release!: () => void;
  try {
    await settings(owner.page); state.faults.set('/api/explorers/v1/me', [{ gate: new Promise<void>(resolve => { release = resolve; }) }]);
    await owner.page.getByRole('switch', { name: 'Music public visibility' }).click(); await expect(owner.page.getByRole('switch', { name: 'Music public visibility' })).toBeDisabled();
    state.account.documentId = 'fixture-account-b'; await owner.page.reload(); await settings(owner.page); release(); await owner.page.waitForTimeout(200);
    expect(state.writes).toEqual([]);
    state.account.documentId = 'browser-account'; await owner.page.reload(); await settings(owner.page); expect(state.writes).toEqual([]);
    await owner.page.getByRole('button').filter({ has: owner.page.getByAltText('account', { exact: true }) }).first().click();
    await owner.page.getByRole('button', { name: 'Logout', exact: true }).click(); await expect(owner.page).toHaveURL(/\/login$/);
    expect(state.writes).toEqual([]); expect(await owner.page.evaluate(() => localStorage.getItem('qrtoken'))).toBeNull();
  } finally { release?.(); await closeFixture(owner); }
});

test('Unlisted sharing is explicit, dialog closure drops capability and old link is refused after Off', async ({ browser, baseURL }) => {
  const state = fixtureState({ public_music: 'Yes', pinned_nav_tabs: ['public_profile', 'public_music', 'public_books'] }, 'public');
  const owner = await openFixture(browser, baseURL!, state, { owner: true }); const guest = await openFixture(browser, baseURL!, state);
  try {
    await owner.page.goto('/recommendations/music'); await owner.page.getByRole('button', { name: 'Open playlist and sharing menu', exact: true }).click(); await owner.page.getByRole('menuitem', { name: 'Sharing settings', exact: true }).click();
    const dialog = owner.page.getByRole('dialog', { name: 'Music sharing' }); await dialog.getByRole('radio', { name: 'Unlisted', exact: true }).check();
    await dialog.getByRole('button', { name: 'Save sharing', exact: true }).click();
    const link = dialog.getByRole('textbox', { name: 'Music share link' }); await expect(link).toBeVisible();
    const shareUrl = await link.inputValue(); expect(new URL(shareUrl).hash.startsWith('#access=')).toBe(true);
    expect(state.account.pinned_nav_tabs).toEqual(['public_profile', 'public_books']); expect(state.account.public_music).toBe('No');
    await guest.page.goto(shareUrl); await expect(guest.page.getByRole('heading', { name: 'Music', exact: true })).toBeVisible();
    await expect(guest.page.getByText('Private owner playlist')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await owner.page.getByRole('button', { name: 'Open playlist and sharing menu', exact: true }).click(); await owner.page.getByRole('menuitem', { name: 'Sharing settings', exact: true }).click(); await expect(link).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await owner.page.getByRole('button', { name: 'Make private', exact: true }).click();
    await guest.page.reload(); await expect(guest.page.getByRole('heading', { name: 'Music page unavailable' })).toBeVisible(); await expect(guest.page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  } finally { await closeFixture(owner); await closeFixture(guest); }
});

test('320px error/pending controls remain visible, keyboard-recoverable, and RTL Music has no overflow', async ({ browser, baseURL }) => {
  const state = fixtureState(); const owner = await openFixture(browser, baseURL!, state, { owner: true, width: 320, theme: 'dark', touch: true });
  try {
    await settings(owner.page); state.faults.set('/api/music/publication', [{ kind: 'error' }]);
    const control = owner.page.getByRole('switch', { name: 'Music public visibility' }); await control.tap();
    const alert = owner.page.getByRole('alert').filter({ hasText: 'Music publication was not confirmed' }); await expect(alert).toBeVisible(); await alert.focus(); await expect(alert).toBeFocused();
    const retry = owner.page.getByRole('button', { name: 'Retry previous action' }); const box = await retry.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(await owner.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await retry.focus(); await retry.press('Enter'); await expect(control).toBeChecked(); await expect(control).toBeEnabled();
    // Fixture-only saved language preference exercises production lazy-language/dir setup.
    await owner.page.evaluate(() => localStorage.setItem('explorers-language', 'ar'));
    await owner.page.goto('/recommendations/music'); await expect(owner.page.locator('html')).toHaveAttribute('dir', 'rtl');
    const rtlControl = owner.page.getByRole('switch').and(owner.page.locator('[aria-describedby]'));
    await expect(rtlControl).toHaveCount(1); await expect(rtlControl).toBeEnabled();
    expect(await owner.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await closeFixture(owner); }
});

test('navigating away from a pending Unlisted dialog discards the capability outcome', async ({ browser, baseURL }) => {
  const state = fixtureState({ public_music: 'Yes' }, 'public'); const owner = await openFixture(browser, baseURL!, state, { owner: true }); let release!: () => void;
  try {
    await owner.page.goto('/recommendations/music');
    await owner.page.getByRole('button', { name: 'Open playlist and sharing menu' }).click(); await owner.page.getByRole('menuitem', { name: 'Sharing settings' }).click();
    await owner.page.getByRole('radio', { name: 'Unlisted', exact: true }).check();
    state.faults.set('/api/music/publication', [{ gate: new Promise<void>(resolve => { release = resolve; }) }]);
    await owner.page.getByRole('button', { name: 'Save sharing', exact: true }).click(); await expect(owner.page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
    await expect.poll(() => state.apiCalls.filter(r => r.path === '/api/music/publication').length).toBe(1);
    await settings(owner.page); release(); await expect.poll(() => state.mode).toBe('unlisted');
    await owner.page.goto('/recommendations/music'); await owner.page.getByRole('button', { name: 'Open playlist and sharing menu' }).click(); await owner.page.getByRole('menuitem', { name: 'Sharing settings' }).click();
    await expect(owner.page.getByRole('textbox', { name: 'Music share link' })).toHaveCount(0);
    expect(state.apiCalls.filter(r => r.path === '/api/music/publication')).toHaveLength(1);
    expect(await owner.page.evaluate(() => [...Array(sessionStorage.length)].map((_, i) => sessionStorage.getItem(sessionStorage.key(i)!)).some(value => value?.includes('capability')))).toBe(false);
  } finally { release?.(); await closeFixture(owner); }
});

test('admitted account mutation settles across mobile→desktop replacement before the next explicit pin', async ({ browser, baseURL }) => {
  const state = fixtureState({ pinned_nav_tabs: ['public_profile', 'public_books', 'public_apps'] });
  const owner = await openFixture(browser, baseURL!, state, { owner: true, width: 375, touch: true }); let release!: () => void;
  try {
    await settings(owner.page, true);
    state.faults.set('/api/explorers/v1/account', [{ gate: new Promise<void>(resolve => { release = resolve; }) }]);
    const books = owner.page.getByRole('checkbox', { name: 'Books Tab', exact: true }); await books.focus(); await books.press('Space');
    const confirm = owner.page.getByRole('button', { name: 'Unpublish Books', exact: true });
    await expect(confirm).toBeVisible(); await confirm.click();
    await expect.poll(() => state.writes.length).toBe(1); // The first mutation is admitted but its reply is held.
    await owner.page.setViewportSize({ width: 1280, height: 900 }); await expect(owner.page.locator('.dashboard-content')).toBeVisible();
    if (await owner.page.getByRole('checkbox', { name: 'Books Tab', exact: true }).count() === 0) await owner.page.getByRole('button', { name: /Public Visibility/ }).click();
    const pin = owner.page.getByRole('checkbox', { name: 'Pin Games Tab' }); await expect(pin).toBeDisabled(); await pin.press('Space');
    await owner.page.waitForTimeout(250); expect(state.writes).toHaveLength(1);
    release(); await expect(pin).toBeEnabled(); await toggle(pin, true); await expect(pin).toBeEnabled();
    expect(state.writes.map(r => ({ books: writtenField(r, 'books'), pins: writtenPins(r) }))).toEqual([
      { books: false, pins: ['apps'] },
      { books: false, pins: ['apps', 'games'] },
    ]);
    if (await books.count() === 0) await owner.page.getByRole('button', { name: /Public Visibility/ }).click();
    await expect(books).not.toBeChecked();
    expect(state.apiCalls.filter(r => r.path === '/api/music/publication')).toEqual([]);
  } finally { release?.(); await closeFixture(owner); }
});
