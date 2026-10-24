import { expect, test } from '@playwright/test';
import { canonicalCategoryAccount, categories, closeFixture, fixtureState, fixtureUser, openFixture, settings, headerVisibility, setHeaderVisibility, toggle } from './setup/category-navigation';
import { TOP_LEVEL_DESTINATIONS } from './setup/public-shell-continuity';
import { expectTask6Shell, submitPinnedCategoryUnpublish, beginTask6FrameAudit, finishTask6FrameAudit, assertTask6FrameWindow, computedContrast, seedTask6App } from './setup/category-navigation-helpers';

// Mirrors the helper in category-navigation-b.spec.ts. The navigation client no
// longer issues the legacy UpdateTabVisibility mutation at all — it writes the
// whole canonical preference set through updateAccount — so asserting a legacy
// `variables.data` patch would now assert a request the app never makes. This
// translates the same behavioural check (exact field value, exact pin order,
// revision carried) into the canonical payload rather than dropping it.
function preferenceWrite(before: ReturnType<typeof canonicalCategoryAccount>, change: { category?: string; isPublic?: boolean; pins?: string[] }) {
  const fields = new Map<string,string>(categories.map(category => [category.route, category.field] as [string,string]));
  return { expectedRevision: before.revision, categories: before.categories.map(row => ({ ...row,
    ...(row.category === change.category ? { isPublic: change.isPublic } : {}),
    ...(change.pins ? { pinnedOrder: change.pins.includes(fields.get(row.category)!) ? change.pins.indexOf(fields.get(row.category)!) - 1 : null } : {}),
  })) };
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 320, height: 900 }]) {
  test(`Task 6 contained content-state matrix ${viewport.width}x${viewport.height}`, async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const evidence: Record<string, unknown> = {};
    const options = { ...viewport, touch: viewport.width === 320 };

    const warmState = fixtureState({
      pinned_nav_tabs: ['public_profile', 'public_books', 'public_apps'],
    }, 'public');
    seedTask6App(warmState);
    const warm = await openFixture(browser, baseURL!, warmState, options);
    try {
      // Populate the actual gateway cache, then leave the category. The old
      // Apollo cache no longer participates in public category rendering.
      await warm.page.goto(`/${fixtureUser.username}/apps`);
      await expect(warm.page.getByText('Public apps', { exact: true })).toBeVisible();
      await warm.page.goto(`/${fixtureUser.username}`);
      await expect(warm.page.getByRole('navigation', { name: 'Public navigation' })).toBeVisible();
      let releaseWarm!: () => void;
      warmState.faults.set('PublicAppData', [{ gate: new Promise<void>(resolve => { releaseWarm = resolve; }) }]);
      const readsBeforeWarm = warmState.reads.filter(read => read.name === 'PublicAppData').length;
      await beginTask6FrameAudit(warm.page);
      await warm.page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Apps', exact: true }).click();
      await expect.poll(() => warmState.reads.filter(read => read.name === 'PublicAppData').length).toBe(readsBeforeWarm + 1);
      await expect(warm.page.getByText('Public apps', { exact: true })).toBeVisible();
      await expect(warm.page.locator('[aria-busy="true"]').first()).toBeVisible();
      await expectTask6Shell(warm.page);
      releaseWarm();
      await expect(warm.page.locator('[aria-busy="true"]')).toHaveCount(0);
      const warmFrames = await finishTask6FrameAudit(warm.page);
      expect(warmFrames.length).toBeGreaterThan(0);
      expect(warmFrames.every(frame => frame.banner === 1 && frame.nav === 1 && frame.earth === 0 && frame.nonblank)).toBe(true);
      evidence.warmCache = { frames: warmFrames.length, content: 'Public apps' };
    } finally { await closeFixture(warm); }

    const emptyState = fixtureState({ pinned_nav_tabs: ['public_profile', 'public_apps'] });
    emptyState.lists.appLists = [];
    const empty = await openFixture(browser, baseURL!, emptyState, options);
    try {
      await empty.page.goto(`/${fixtureUser.username}/apps`);
      await expect(empty.page.getByText('No apps shared yet', { exact: true })).toBeVisible();
      await expectTask6Shell(empty.page);
      const frames = await assertTask6FrameWindow(empty.page, { banner: 1, nav: 1, earth: 0, nonblank: true });
      evidence.empty = { content: 'No apps shared yet', frames };
    } finally { await closeFixture(empty); }

    const terminalState = fixtureState({ pinned_nav_tabs: ['public_profile', 'public_apps'] });
    seedTask6App(terminalState);
    // Identical concurrent reads share one request, so whether a strict-effect replay joins the
    // in-flight read or starts its own is a timing detail. Every cold read therefore fails, and
    // the script is cleared before Retry so the retry never inherits an unused failure.
    terminalState.faults.set('PublicAppData', Array.from({ length: 8 }, () => ({ kind: 'error' as const })));
    const terminal = await openFixture(browser, baseURL!, terminalState, options);
    try {
      await terminal.page.goto(`/${fixtureUser.username}/apps`);
      await expectTask6Shell(terminal.page);
      await expect(terminal.page.getByRole('heading', { name: 'Apps unavailable' })).toBeVisible();
      const coldFrames = await assertTask6FrameWindow(terminal.page, { banner: 1, nav: 1, earth: 0, nonblank: true });
      evidence.cold = { state: 'resolved shell remains visible for a first category terminal state', frames: coldFrames };
      await expect(terminal.page.getByText('Please try again. If the problem continues, come back later.', { exact: true })).toBeVisible();
      await expect(terminal.page.getByText('Contained fixture failure', { exact: true })).toHaveCount(0);
      expect((await computedContrast(terminal.page.getByRole('heading', { name: 'Apps unavailable' }))).ratio).toBeGreaterThanOrEqual(4.5);
      await expectTask6Shell(terminal.page);
      await terminal.page.screenshot({ path: test.info().outputPath(`task6-terminal-before-retry-${viewport.width}.png`), fullPage: true });
      await beginTask6FrameAudit(terminal.page);
      terminalState.faults.set('PublicAppData', []);
      await terminal.page.getByRole('button', { name: 'Retry', exact: true }).click({ force: true });
      await expect(terminal.page.getByText('Public apps', { exact: true })).toBeVisible();
      await expectTask6Shell(terminal.page);
      const retryFrames = await finishTask6FrameAudit(terminal.page);
      expect(retryFrames.length).toBeGreaterThan(0);
      expect(retryFrames.every(frame => frame.banner === 1 && frame.nav === 1 && frame.earth === 0 && frame.nonblank)).toBe(true);
      evidence.terminalRetry = { frames: retryFrames.length, recovered: true };
      await terminal.page.screenshot({ path: test.info().outputPath(`task6-recovery-after-retry-${viewport.width}.png`), fullPage: true });
    } finally { await closeFixture(terminal); }

    const partialState = fixtureState({ pinned_nav_tabs: ['public_profile', 'public_apps'] });
    seedTask6App(partialState);
    partialState.faults.set('PublicAppData', [{ kind: 'partial' }]);
    const partial = await openFixture(browser, baseURL!, partialState, options);
    try {
      await partial.page.goto(`/${fixtureUser.username}/apps`);
      await expect(partial.page.getByText('Public apps', { exact: true })).toBeVisible();
      await expect(partial.page.getByText('Some app data is unavailable.', { exact: true })).toBeVisible();
      expect((await computedContrast(partial.page.getByRole('status'))).ratio).toBeGreaterThanOrEqual(4.5);
      await expectTask6Shell(partial.page);
      const frames = await assertTask6FrameWindow(partial.page, { banner: 1, nav: 1, earth: 0, nonblank: true });
      evidence.partial = { state: 'usable list plus warning', frames };
      await partial.page.screenshot({ path: test.info().outputPath(`task6-partial-${viewport.width}.png`), fullPage: true });
    } finally { await closeFixture(partial); }

    const minimalState = fixtureState({ pinned_nav_tabs: ['public_profile', 'public_recommendations'] });
    minimalState.faults.set('PublicProfileData', [{ kind: 'partial' }]);
    minimalState.faults.set('Account', [{ kind: 'error' }]);
    const minimal = await openFixture(browser, baseURL!, minimalState, options);
    try {
      await minimal.page.goto(`/${fixtureUser.username}`);
      await expectTask6Shell(minimal.page);
      const profileFrames = await assertTask6FrameWindow(minimal.page, { banner: 1, nav: 1, earth: 0, nonblank: true });

      await minimal.page.goto(`/${fixtureUser.username}/places/jaipur/placesmap`);
      const mapHeading = minimal.page.getByRole('heading', { name: 'Map Unavailable' });
      await expect(mapHeading).toBeVisible();
      const mapContrast = await computedContrast(mapHeading);
      expect(mapContrast.ratio).toBeGreaterThanOrEqual(4.5);
      await expect(minimal.page.getByText('Contained fixture failure', { exact: true })).toHaveCount(0);
      const mapFrames = await assertTask6FrameWindow(minimal.page, { banner: 1, nav: 0, earth: 0, nonblank: true });
      evidence.minimalLightContrast = {
        profile: { state: 'incomplete optional profile metadata retains the themed shell', frames: profileFrames },
        placeMap: { contrast: mapContrast.ratio, frames: mapFrames },
      };
    } finally { await closeFixture(minimal); }

    const routingState = fixtureState({ public_products: 'No', pinned_nav_tabs: ['public_profile', 'public_apps'] });
    seedTask6App(routingState);
    const routing = await openFixture(browser, baseURL!, routingState, options);
    try {
      await routing.page.goto(`/${fixtureUser.username}/apps`);
      await expect(routing.page.getByText('Public apps', { exact: true })).toBeVisible();
      await routing.page.goto('/different-user/apps');
      await expect(routing.page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();
      await expect(routing.page.getByText('Public apps', { exact: true })).toHaveCount(0);
      await expect(routing.page.getByRole('status', { name: 'Earth loading' })).toHaveCount(0);
      const usernameFrames = await assertTask6FrameWindow(routing.page, { banner: 0, nav: 0, earth: 0, nonblank: true });
      evidence.usernameChange = {
        state: 'invalid identity uses the standalone nonblank Page Not Found boundary with no stale app content',
        frames: usernameFrames,
        shellException: 'banner/nav are intentionally outside this invalid-identity boundary',
      };

      await routing.page.goto(`/${fixtureUser.username}/products`);
      await expect(routing.page).toHaveURL(`${baseURL}/${fixtureUser.username}`);
      await expectTask6Shell(routing.page);
      const hiddenFrames = await assertTask6FrameWindow(routing.page, { banner: 1, nav: 1, earth: 0, nonblank: true });
      evidence.hiddenCategory = { state: 'redirected to profile', frames: hiddenFrames };

      await routing.page.goto(`/${fixtureUser.username}/apps/missing-list`);
      await expect(routing.page.getByText('List not found or not published.', { exact: true })).toBeVisible();
      await expectTask6Shell(routing.page);
      const nestedFrames = await assertTask6FrameWindow(routing.page, { banner: 1, nav: 1, earth: 0, nonblank: true });
      evidence.invalidNested = { state: 'themed not-published state', frames: nestedFrames };
    } finally { await closeFixture(routing); }

    const exceptionState = fixtureState({ pinned_nav_tabs: ['public_profile'] }, 'public');
    const exception = await openFixture(browser, baseURL!, exceptionState, options);
    try {
      await exception.page.goto(`/${fixtureUser.username}/places/map`);
      await expect(exception.page.getByRole('heading', { name: 'Map Unavailable' })).toBeVisible();
      await expect(exception.page.getByRole('banner')).toHaveCount(1);
      await expect(exception.page.getByRole('banner')).toBeVisible();
      await expect(exception.page.getByRole('navigation', { name: 'Public navigation' })).toHaveCount(0);
      await expect(exception.page.getByRole('status', { name: 'Earth loading' })).toHaveCount(0);
      expect(await exception.page.locator('body').innerText()).not.toHaveLength(0);
      const mapFrames = await assertTask6FrameWindow(exception.page, { banner: 1, nav: 0, earth: 0, nonblank: true });
      evidence.map = { state: 'intentional full-screen exception with truthful fallback', frames: mapFrames };
    } finally { await closeFixture(exception); }

    await test.info().attach(`task6-content-state-evidence-${viewport.width}`, {
      contentType: 'application/json',
      body: JSON.stringify(evidence, null, 2),
    });
  });
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 320, height: 900 }]) {
  test(`Task 6 repair rejected Retry is contained ${viewport.width}x${viewport.height}`, async ({ browser, baseURL }) => {
    const state = fixtureState({ pinned_nav_tabs: ['public_profile', 'public_apps'] });
    seedTask6App(state);
    // Identical concurrent reads share one request, and whether a strict-effect replay joins the
    // in-flight read or starts its own is a timing detail. Counting requests per phase therefore
    // leaves a scripted failure behind for the next phase; the script is re-armed per phase instead,
    // so every read of a phase fails the same way.
    const failEveryRead = (kind: 'error' | 'offline') => state.faults.set('PublicAppData', Array.from({ length: 8 }, () => ({ kind })));
    failEveryRead('error');
    const visitor = await openFixture(browser, baseURL!, state, { ...viewport, touch: viewport.width === 320 });
    try {
      await visitor.page.goto(`/${fixtureUser.username}/apps`);
      await expect(visitor.page.getByRole('heading', { name: 'Apps unavailable' })).toBeVisible();
      failEveryRead('offline');
      await visitor.page.getByRole('button', { name: 'Retry' }).click({ force: true });
      await expect(visitor.page.locator('[aria-busy="true"]')).toHaveCount(0);
      await expect(visitor.page.getByRole('heading', { name: 'Apps unavailable' })).toBeVisible();
      state.faults.set('PublicAppData', []);
      await visitor.page.getByRole('button', { name: 'Retry' }).click();
      await expect(visitor.page.getByText('Public apps', { exact: true })).toBeVisible();
      await expectTask6Shell(visitor.page);
    } finally { await closeFixture(visitor); }
  });

  test(`Task 6 repair shared state contrast ${viewport.width}x${viewport.height}`, async ({ browser, baseURL }) => {
    const evidence: Record<string, unknown> = {};
    const minimalState = fixtureState({ pinned_nav_tabs: ['public_profile', 'public_recommendations'] });
    minimalState.faults.set('PublicProfileData', [{ kind: 'partial' }]);
    minimalState.faults.set('Account', [{ kind: 'error' }]);
    const minimal = await openFixture(browser, baseURL!, minimalState, { ...viewport, touch: viewport.width === 320 });
    try {
      await minimal.page.goto(`/${fixtureUser.username}`);
      await expectTask6Shell(minimal.page);
      evidence.minimalLightProfilePartial = { state: 'incomplete optional profile metadata retains the themed shell' };

      await minimal.page.goto(`/${fixtureUser.username}/places/jaipur/placesmap`);
      const terminal = minimal.page.getByRole('heading', { name: 'Map Unavailable' });
      await expect(terminal).toBeVisible();
      const terminalContrast = await computedContrast(terminal);
      evidence.minimalLightPlaceMapTerminal = terminalContrast;
      expect.soft(terminalContrast.ratio, 'minimal-light PlaceMap terminal heading').toBeGreaterThanOrEqual(4.5);
    } finally { await closeFixture(minimal); }

    const darkState = fixtureState({ pinned_nav_tabs: ['public_profile', 'public_apps'] });
    seedTask6App(darkState);
    darkState.faults.set('PublicAppData', [{ kind: 'partial' }]);
    const dark = await openFixture(browser, baseURL!, darkState, { ...viewport, touch: viewport.width === 320 });
    try {
      await dark.page.goto(`/${fixtureUser.username}/apps`);
      const partial = dark.page.getByRole('status');
      await expect(partial).toContainText('Some app data is unavailable.');
      const darkContrast = await computedContrast(partial);
      evidence.darkAppsPartial = darkContrast;
      expect.soft(darkContrast.ratio, 'dark Apps partial notice').toBeGreaterThanOrEqual(4.5);
    } finally { await closeFixture(dark); }

    await test.info().attach(`task6-repair-contrast-${viewport.width}`, {
      contentType: 'application/json',
      body: JSON.stringify(evidence, null, 2),
    });
    console.info(`[task6-contrast ${viewport.width}x${viewport.height}] ${JSON.stringify(evidence)}`);
  });
}

test('public shell continuity smoke covers every top-level destination', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const destinations = TOP_LEVEL_DESTINATIONS;
  const state = fixtureState({}, 'public');
  const visitor = await openFixture(browser, baseURL!, state);
  const evidence: Record<string, unknown> = {};
  const pathFor = (route: string) => `/${fixtureUser.username}${route ? `/${route}` : ''}`;

  try {
    state.account.pinned_nav_tabs = ['public_profile', 'public_books'];
    await visitor.page.goto(`/${fixtureUser.username.toUpperCase()}/books?utm_source=continuity#matrix`);
    await expect(visitor.page).toHaveURL(`${baseURL}/${fixtureUser.username}/books?utm_source=continuity#matrix`);

    for (const destination of destinations) {
      state.account.pinned_nav_tabs = destination.field === 'public_profile'
        ? ['public_profile', 'public_books']
        : ['public_profile', destination.field];
      const destinationPath = pathFor(destination.route);
      await visitor.page.goto(destinationPath);
      await expect(visitor.page).toHaveURL(`${baseURL}${destinationPath}`);
      const publicNav = visitor.page.getByRole('navigation', { name: 'Public navigation' });
      await expect(publicNav).toBeVisible();
      await expect(publicNav.getByRole('link', { name: 'Profile', exact: true })).toBeVisible();
      await expect(visitor.page.getByRole('status', { name: 'Earth loading' })).toHaveCount(0);
      evidence[`direct:${destination.label}`] = { path: new URL(visitor.page.url()).pathname };
    }

    for (const destination of destinations) {
      state.account.pinned_nav_tabs = destination.field === 'public_profile'
        ? ['public_profile', 'public_books']
        : ['public_profile', destination.field];
      const sourcePath = pathFor(destination.source);
      const destinationPath = pathFor(destination.route);
      await visitor.page.goto(sourcePath);
      const publicNav = visitor.page.getByRole('navigation', { name: 'Public navigation' });
      await expect(publicNav).toBeVisible();
      await expect(publicNav.getByRole('link', { name: 'Profile', exact: true })).toBeVisible();
      const destinationLink = publicNav.getByRole('link', { name: destination.label, exact: true });
      await expect(destinationLink).toBeVisible();

      // This test samples chrome continuity. Gateway request shape is covered
      // separately below so no artificial gate can turn a cache hit into a
      // false navigation failure.
      const hasRouteTransition = false;
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      if (hasRouteTransition) (state as any).destinationGates.set(destinationPath, gate);
      await visitor.page.evaluate(() => {
        const recorder = {
          clickTime: null as number | null,
          clickTrusted: false,
          frames: [] as { time: number; banner: number; nav: number; earth: number; nonblank: boolean }[],
          stop: false,
        };
        (window as any).__publicShellContinuity = recorder;
        addEventListener('click', event => {
          recorder.clickTime = event.timeStamp;
          recorder.clickTrusted = event.isTrusted;
        }, { capture: true, once: true });
        const record = (time: number) => {
          recorder.frames.push({
            time,
            banner: document.querySelectorAll('header').length,
            earth: document.querySelectorAll('[role="status"][aria-label="Earth loading"]').length,
            nav: document.querySelectorAll('nav[aria-label="Public navigation"]').length,
            nonblank: Boolean(document.body.innerText.trim()),
          });
          if (!recorder.stop) requestAnimationFrame(record);
        };
        requestAnimationFrame(record);
      });

      await destinationLink.click();
      await expect(visitor.page).toHaveURL(`${baseURL}${destinationPath}`);
      if (hasRouteTransition) await expect.poll(() => (state as any).destinationWaits.includes(destinationPath)).toBe(true);
      await expect.poll(() => visitor.page.evaluate(() => {
        const recorder = (window as any).__publicShellContinuity;
        return recorder.clickTime !== null && recorder.frames.some((frame: any) => frame.time > recorder.clickTime);
      })).toBe(true);
      const held = await visitor.page.evaluate(() => {
        const recorder = (window as any).__publicShellContinuity;
        const postActivation = recorder.frames.filter((frame: any) => frame.time > recorder.clickTime);
        return { clickTime: recorder.clickTime, clickTrusted: recorder.clickTrusted, postActivation };
      });
      expect(held.clickTrusted).toBe(true);
      expect(held.postActivation.length).toBeGreaterThan(0);
      expect(held.postActivation.every((frame: any) => (
        frame.banner === 1 && frame.nav === 1 && frame.earth === 0 && frame.nonblank
      ))).toBe(true);

      if (hasRouteTransition) {
        release();
        (state as any).destinationGates.delete(destinationPath);
      }
      await expect(visitor.page.getByRole('status', { name: 'Earth loading' })).toHaveCount(0);
      await expect(publicNav.getByRole('link', { name: 'Profile', exact: true })).toBeVisible();
      const completed = await visitor.page.evaluate(() => {
        const recorder = (window as any).__publicShellContinuity;
        recorder.stop = true;
        return {
          clickTime: recorder.clickTime,
          clickTrusted: recorder.clickTrusted,
          postActivation: recorder.frames.filter((frame: any) => frame.time > recorder.clickTime),
        };
      });
      expect(completed.postActivation.length).toBeGreaterThanOrEqual(held.postActivation.length);
      expect(completed.postActivation.every((frame: any) => (
        frame.banner === 1 && frame.nav === 1 && frame.earth === 0 && frame.nonblank
      ))).toBe(true);
      evidence[`navigate:${destination.label}`] = completed;
    }

    await test.info().attach('public-shell-continuity-frames', {
      contentType: 'application/json',
      body: JSON.stringify(evidence, null, 2),
    });
    await visitor.page.screenshot({ path: test.info().outputPath('public-shell-continuity-final.png'), fullPage: true });
  } finally { await closeFixture(visitor); }
});

test('public category pages read every recommendation type through the unauthenticated gateway', async ({ browser, baseURL }) => {
  const state = fixtureState();
  const visitor = await openFixture(browser, baseURL!, state);
  const requests: Array<{ path: string; authorization: string | undefined }> = [];
  visitor.page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === 'https://music-fixture.test' && url.pathname.startsWith(`/api/explorers/v1/profiles/${fixtureUser.username}/recommendations/`)) {
      requests.push({ path: url.pathname, authorization: request.headers().authorization });
    }
  });
  try {
    for (const category of categories) {
      await visitor.page.goto(`/${fixtureUser.username}/${category.route}`);
      await expect.poll(() => requests.some((request) => request.path === `/api/explorers/v1/profiles/${fixtureUser.username}/recommendations/${category.route}`)).toBe(true);
    }
    expect(requests.every((request) => request.authorization === undefined)).toBe(true);
  } finally {
    await closeFixture(visitor);
  }
});

test('public Places pagination requests one bounded unauthenticated detail page', async ({ browser, baseURL }) => {
  const state = fixtureState();
  const list = state.lists.recommendationLists[0]!;
  // 36, not 24. This case asserts "one bounded unauthenticated detail page", which requires a
  // second page to exist -- and under the canonical envelope a collection of exactly 24 has
  // `recommended_places_next_cursor: null`, so no second request may be issued at all. The old
  // 24-item fixture made the test's own assertion unsatisfiable regardless of the harness.
  list.recommended_places = Array.from({ length: 36 }, (_, index) => ({
    documentId: `paging-place-${index + 1}`,
    Recommendation_Type: 'place',
    Media: [],
    media_details: {},
    recommendation_category: { Category_Name: 'Fixture category' },
    Place_Details: {
      Title: `Paging Place ${index + 1}`,
      Place_Name: `Paging Place ${index + 1}`,
      Place_Address: 'Fixture City',
      Place_Id: `fixture-place-${index + 1}`,
      Photos: [], Rating: 4.5, Rating_Count: 10, Geometry: { lat: 26.9, lng: 75.8 },
    },
  }));
  const visitor = await openFixture(browser, baseURL!, state);
  const requests: Array<{ pathname: string; search: string; authorization: string | undefined }> = [];
  visitor.page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === 'https://music-fixture.test'
      && url.pathname === `/api/explorers/v1/profiles/${fixtureUser.username}/recommendations/places/public-places`) {
      requests.push({ pathname: url.pathname, search: url.search, authorization: request.headers().authorization });
    }
  });
  try {
    await visitor.page.goto(`/${fixtureUser.username}/places/public-places`);
    await expect(visitor.page.getByText('Paging Place 24', { exact: true })).toBeVisible();
    await visitor.page.getByRole('button', { name: 'Load more places', exact: true }).scrollIntoViewIfNeeded();
    // The cursor is server-minted and signed: usePublicProfileDetail's readNext takes the
    // places cursor from the gateway-provided movieCursors and only falls back to `o${offset}`
    // for non-places categories, so the bare `o24` form was never reachable here.
    await expect.poll(() => requests.some((request) => request.search === '?limit=24&cursor=o24.fixture')).toBe(true);
    expect(requests.every((request) => request.authorization === undefined)).toBe(true);
  } finally {
    await closeFixture(visitor);
  }
});

test('Places ripple radius stays finite at startup, repeat and route re-entry', async ({ browser, baseURL }) => {
  const state = fixtureState(); state.lists.recommendationLists = [];
  const owner = await openFixture(browser, baseURL!, state, { owner: true });
  await owner.context.addInitScript(() => {
    (window as any).__invalidFixtureRadii = [];
    const original = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
      if (this.localName === 'circle' && name === 'r' && !Number.isFinite(Number(value))) (window as any).__invalidFixtureRadii.push({ value: String(value), stack: new Error().stack });
      return original.call(this, name, value);
    };
  });
  try {
    for (let visit = 0; visit < 2; visit++) {
      if (visit === 0) await owner.page.goto('/recommendations/places'); else await owner.page.goBack();
      // The shared category template's first-visit state replaced the old animated empty state.
      await expect(owner.page.getByText('Your best picks go here', { exact: true })).toBeVisible();
      await expect(owner.page.getByRole('button', { name: /Create your first list/ })).toBeVisible();
      await owner.page.waitForTimeout(3000); // Includes the 2.4s repeat boundary.
      const invalid = await owner.page.evaluate(() => (window as any).__invalidFixtureRadii);
      await test.info().attach(`circle-startup-${visit}`, { body: JSON.stringify(invalid), contentType: 'application/json' });
      expect(invalid).toEqual([]);
      const radii = await owner.page.locator('circle[r]').evaluateAll(circles => circles.map(circle => Number(circle.getAttribute('r'))));
      // The ripple animation no longer exists (WP3A first-visit state has no SVG circles), so the
      // invariant is checked on whatever circles remain: none may ever carry a non-finite radius.
      expect(radii.every(r => Number.isFinite(r) && r >= 0)).toBe(true);
      await owner.page.getByText('Settings', { exact: true }).first().click();
    }
  } finally { await closeFixture(owner); }
});

test('contained actual Settings boot verifies account without mounting consent or writing preferences', async ({ browser, baseURL }) => {
  const state = fixtureState(); const owner = await openFixture(browser, baseURL!, state, { owner: true });
  try {
    await owner.page.goto('/settings');
    await owner.page.getByRole('button', { name: /Public Visibility/ }).click();
    await expect(owner.page.getByRole('checkbox', { name: 'Books Tab', exact: true })).toBeEnabled();
    await expect(owner.page.getByTestId('cookie-consent-positioner')).toHaveCount(0);
    expect(await owner.page.evaluate(() => localStorage.getItem('explorers-cookie-consent'))).toBeNull();
    expect(state.writes).toEqual([]); owner.guard.assertClean();
  } finally { await closeFixture(owner); }
});

for (const category of categories) {
  test(`${category.route}: Auto saved → header Off → reload → Hub On → Manual explicit Pin`, async ({ browser, baseURL }) => {
    const other = category.field === 'public_books' ? 'public_games' : 'public_books';
    const state = fixtureState({ auto_pinning: true, pinned_nav_tabs: ['public_profile', category.field, other] });
    const owner = await openFixture(browser, baseURL!, state, { owner: true });
    const guest = await openFixture(browser, baseURL!, state);
    try {
      await owner.page.goto(`/recommendations/${category.route}`);
      await setHeaderVisibility(owner.page, false);
      await owner.page.reload(); await expect(headerVisibility(owner.page)).toHaveAccessibleName('Visibility: Hidden');
      expect(state.account.pinned_nav_tabs).toEqual(['public_profile', other]); expect(state.account.auto_pinning).toBe(true);
      await guest.page.goto(`/${fixtureUser.username}/${category.route}`); await expect(guest.page).toHaveURL(`${baseURL}/${fixtureUser.username}`);
      await owner.page.goto('/recommendations');
      const card = owner.page.locator('.rec-card').filter({ has: owner.page.getByRole('heading', { name: category.label.replace(/ Tab$/, ''), exact: true }) });
      await card.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await card.getByTitle('Category options').click();
      const beforeEnable = canonicalCategoryAccount(state);
      const enable = owner.page.getByRole('button', { name: 'Enable Public URL', exact: true });
      // Resolved once, deliberately. press() focuses the element itself, so an explicit
      // focus() first bought nothing and opened a second independent resolution of a
      // locator inside the popover. Keyboard activation is unchanged: press('Enter')
      // still focuses, then presses.
      //
      // The press timeouts seen in CI here (and at the pin step below) were not a locator
      // race: the menu closed itself. RecommendationsHub used to dismiss the menu on any
      // scroll event, and the layout scroller emits unsolicited ones while the page settles
      // (the route loader and the verifying/saving banners shift content and clamp
      // scrollTop), so a click landing in that window lost its menu and Playwright retried
      // a detached button for the full 12s. The menu now follows its trigger instead of
      // closing; see docs/replatform/ci-optimization-plan.md.
      await enable.press('Enter');
      await expect.poll(() => state.account[category.field]).toBe('Yes');
      expect(state.writes.at(-1)?.variables).toEqual(preferenceWrite(beforeEnable, { category: category.route, isPublic: true }));
      await settings(owner.page, true); await toggle(owner.page.getByRole('checkbox', { name: 'Auto-pin navigation tabs' }), false);
      await expect(owner.page.getByRole('checkbox', { name: `Pin ${category.label}`, exact: true })).not.toBeChecked();
      await owner.page.goto('/recommendations'); await card.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' })); await card.getByTitle('Category options').click();
      const pinAction = owner.page.getByRole('button', { name: 'Pin to Public Nav (Max 5)', exact: true }); await pinAction.focus(); await pinAction.press('Enter');
      // 30s: this polls a SERVER write that follows a keyboard-activated pin. The budget
      // predates the menu fix described above and that fix did not change it. The expected
      // tab list is unchanged.
      await expect.poll(() => state.account.pinned_nav_tabs, { timeout: 30000 }).toEqual(['public_profile', other, category.field]);
      await guest.page.goto(`/${fixtureUser.username}`);
      await expect(guest.page.getByRole('link', { name: category.route[0].toUpperCase() + category.route.slice(1), exact: true })).toBeVisible();
    } finally { await closeFixture(owner); await closeFixture(guest); }
  });
}
