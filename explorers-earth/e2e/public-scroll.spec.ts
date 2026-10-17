import { expect, test } from '@playwright/test';
import { closeFixture, fixtureState, openFixture } from './setup/category-navigation';
import { seedLongPublicCollection, seedScopedPlaces, seedPublicRoots } from './setup/public-scroll';

const rootCategories = ['places', 'apps', 'books', 'movies', 'games', 'products', 'people', 'guides'] as const;
const rootName = (category: string, n: number) => category === 'places' ? `Destination ${n}` : `${category} collection ${n}`;
const rootRead = (category: string) => category === 'apps' ? 'PublicAppData' : `Public${category[0].toUpperCase()}${category.slice(1)}Data`;
const rootLabel = (category: string) => ({ places: 'city lists', apps: 'app lists', books: 'book lists', movies: 'movie lists', games: 'game lists', products: 'product lists', people: 'people lists', guides: 'guides' })[category]!;

for (const width of [390, 1440]) {
for (const category of rootCategories) {
  test(`${category} root scroll reaches list 13 with bounded pages at ${width}`, async ({ browser, baseURL }) => {
    const state = fixtureState(); seedPublicRoots(state);
    const visitor = await openFixture(browser, baseURL!, state, { owner: false, width, height: 500 });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    try {
      await visitor.page.goto(`/fixture-owner/${category}`);
      await expect(visitor.page.getByText(rootName(category, 1), { exact: true }).last()).toBeVisible();
      await expect(visitor.page.getByText(rootName(category, 13), { exact: true })).toHaveCount(0);
      state.faults.set(rootRead(category), [{ gate }]);
      await visitor.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect.poll(() => state.reads.filter(read => read.name === rootRead(category) && read.variables.cursor === 'o12').length).toBe(1);
      await expect(visitor.page.getByRole('navigation', { name: 'Public navigation' })).toBeVisible();
      await expect(visitor.page.locator('.earth-loader-wrapper')).toHaveCount(0);
      await expect(visitor.page.getByText(rootName(category, 1), { exact: true }).last()).toBeAttached();
      release();
      const last = visitor.page.getByText(rootName(category, 13), { exact: true }).last();
      await expect(last).toBeAttached(); await last.scrollIntoViewIfNeeded(); await expect(last).toBeVisible();
      expect(state.reads.filter(read => read.name === rootRead(category) && read.variables.cursor !== null).map(read => read.variables.cursor)).toEqual(['o12']);
      expect(state.reads.filter(read => read.name === rootRead(category)).every(read => read.variables.limit === 12)).toBe(true);
      if (category === 'places') {
        await last.click(); await expect(visitor.page).toHaveURL(/\/places\/city-13$/);
        await expect(visitor.page.getByText('City 13 place 1', { exact: true })).toBeVisible();
        await visitor.page.goBack(); await expect(visitor.page).toHaveURL(/\/places$/);
        await visitor.page.goForward(); await visitor.page.reload();
        await expect(visitor.page.getByText('City 13 place 1', { exact: true })).toBeVisible();
      }
    } finally { release(); await closeFixture(visitor); }
  });

  test(`${category} classic profile shelf scroll reaches list 13 at ${width}`, async ({ browser, baseURL }) => {
    const state = fixtureState(); seedPublicRoots(state);
    const visitor = await openFixture(browser, baseURL!, state, { owner: false, width, height: 500 });
    try {
      await visitor.page.goto('/fixture-owner/profile');
      const shelf = visitor.page.getByTestId('recommendations-shelves').locator(`[data-category-id="${category}"]`);
      await expect(shelf.getByRole('heading', { name: rootName(category, 1), exact: true })).toBeAttached();
      await shelf.scrollIntoViewIfNeeded();
      await shelf.locator('.overflow-x-auto').evaluate(element => element.scrollTo({ left: element.scrollWidth }));
      const last = shelf.getByRole('heading', { name: rootName(category, 13), exact: true });
      await expect(last).toBeAttached(); await last.scrollIntoViewIfNeeded(); await expect(last).toBeVisible();
      expect(state.reads.filter(read => read.name === rootRead(category) && read.variables.cursor !== null).map(read => read.variables.cursor)).toEqual(['o12']);
    } finally { await closeFixture(visitor); }
  });
}

}

for (const layout of ['grid', 'featured'] as const) {
  test(`${layout} profile keeps 12+ root counts and does not drain previews`, async ({ browser, baseURL }) => {
    const state = fixtureState(); seedPublicRoots(state);
    state.account.social_media.theme_settings.recommendations = { layout, categoryOrder: rootCategories };
    const visitor = await openFixture(browser, baseURL!, state, { owner: false, width: 390, height: 500 });
    try {
      await visitor.page.goto('/fixture-owner/profile');
      const content = visitor.page.getByTestId(layout === 'grid' ? 'recommendations-grid' : 'recommendations-featured');
      for (const category of rootCategories) {
        const card = content.locator(`[data-category-id="${category}"]`);
        await expect(card).toHaveAttribute('href', `/fixture-owner/${category}`);
        await card.scrollIntoViewIfNeeded(); await expect(card).toContainText('12+ lists');
        expect(state.reads.filter(read => read.name === rootRead(category) && read.variables.cursor !== null)).toEqual([]);
        await expect(card).toHaveAttribute('href', `/fixture-owner/${category}`);
      }
      await content.locator('[data-category-id="apps"]').click(); await expect(visitor.page).toHaveURL(/\/apps$/);
    } finally { await closeFixture(visitor); }
  });
}

for (const profile of [false, true]) {
  test(`partial all-null root page reaches valid list via scroll and 503 retry on ${profile ? 'classic shelf' : 'category'}`, async ({ browser, baseURL }) => {
    const state = fixtureState(); seedPublicRoots(state);
    const visitor = await openFixture(browser, baseURL!, state, { owner: false, width: 390, height: 500 });
    let continuationAttempts = 0;
    await visitor.context.route(url => url.origin === 'https://music-fixture.test' && url.pathname.endsWith('/recommendations/apps'), async route => {
      const cursor = new URL(route.request().url()).searchParams.get('cursor');
      state.faults.set('PublicAppData', cursor === null ? [{ kind: 'partial', nullRootPage: true }] : ++continuationAttempts === 1 ? [{ kind: 'error', status: 503 }] : []);
      await route.fallback();
    });
    try {
      await visitor.page.goto(`/fixture-owner/${profile ? 'profile' : 'apps'}`);
      const retry = visitor.page.getByRole('button', { name: `Retry ${rootLabel('apps')}`, exact: true });
      if (profile) {
        const slot = visitor.page.getByTestId('recommendations-shelves').locator('[data-category-id="apps"]');
        await expect(slot).toHaveAttribute('aria-label', 'Apps & Tools unavailable');
        await slot.scrollIntoViewIfNeeded();
      } else await visitor.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(retry).toBeVisible(); await retry.click();
      await expect(visitor.page.getByRole('heading', { name: 'apps collection 13', exact: true })).toBeAttached();
      expect(state.reads.filter(read => read.name === 'PublicAppData' && read.variables.cursor !== null).map(read => read.variables.cursor)).toEqual(['o12', 'o12']);
      await expect(visitor.page.getByRole('button', { name: 'Load more app lists', exact: true })).toHaveCount(0);
      if (!profile) await expect(visitor.page.locator('meta[name="description"]')).toHaveAttribute('content', /1\+ app list/);
    } finally { await closeFixture(visitor); }
  });
}

for (const count of [0, 12]) {
  test(`root ${count} boundary preserves empty and terminal behavior`, async ({ browser, baseURL }) => {
    const state = fixtureState(); seedPublicRoots(state, count);
    const visitor = await openFixture(browser, baseURL!, state, { owner: false, width: 390, height: 500 });
    try {
      await visitor.page.goto('/fixture-owner/apps');
      if (count === 0) await expect(visitor.page.getByText('No apps shared yet', { exact: true })).toBeVisible();
      else {
        await expect(visitor.page.getByRole('heading', { name: 'apps collection 12', exact: true })).toBeAttached();
        await visitor.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await expect.poll(() => state.reads.filter(read => read.name === 'PublicAppData' && read.variables.cursor === 'o12').length).toBe(1);
      }
      await expect(visitor.page.getByRole('button', { name: 'Load more app lists', exact: true })).toHaveCount(0);
      await visitor.page.evaluate(() => window.scrollTo(0, 0)); await visitor.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      expect(state.reads.filter(read => read.name === 'PublicAppData' && read.variables.cursor !== null).map(read => read.variables.cursor)).toEqual(count === 0 ? [] : ['o12']);
    } finally { await closeFixture(visitor); }
  });
}

for (const layout of ['grid', 'featured'] as const) {
  test(`${layout} partial previews retain lower bounds and never auto-continue error slots`, async ({ browser, baseURL }) => {
    const state = fixtureState(); seedPublicRoots(state);
    state.lists.appLists = state.lists.appLists.slice(0, 1);
    state.account.social_media.theme_settings.recommendations = { layout, categoryOrder: ['apps', 'books'] };
    const visitor = await openFixture(browser, baseURL!, state, { owner: false, width: 390, height: 500 });
    await visitor.context.route(url => url.origin === 'https://music-fixture.test' && /\/recommendations\/(apps|books)$/.test(url.pathname), async route => {
      state.faults.set(new URL(route.request().url()).pathname.endsWith('/apps') ? 'PublicAppData' : 'PublicBooksData', [{ kind: 'partial', nullRootPage: route.request().url().endsWith('/books') }]);
      await route.fallback();
    });
    try {
      await visitor.page.goto('/fixture-owner/profile');
      const content = visitor.page.getByTestId(layout === 'grid' ? 'recommendations-grid' : 'recommendations-featured');
      const app = content.locator('[data-category-id="apps"]');
      await expect(app).toContainText('1+ list');
      await expect(app).toContainText('1+ app');
      const books = content.locator('[data-category-id="books"]');
      await expect(books).toHaveAttribute('aria-label', 'Books unavailable');
      await books.scrollIntoViewIfNeeded();
      await visitor.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      expect(state.reads.filter(read => read.variables.cursor != null)).toEqual([]);
      await expect(content.getByRole('button', { name: /Load more/ })).toHaveCount(0);
    } finally { await closeFixture(visitor); }
  });
}

test('root continuation retry retains rows and a late response cannot cross category navigation', async ({ browser, baseURL }) => {
  const state = fixtureState(); seedPublicRoots(state);
  const visitor = await openFixture(browser, baseURL!, state, { owner: false, width: 390, height: 500 });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    await visitor.page.goto('/fixture-owner/apps');
    await expect(visitor.page.getByText('apps collection 1', { exact: true })).toBeVisible();
    state.faults.set('PublicAppData', [{ kind: 'error', status: 503 }, { gate }]);
    await visitor.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const retry = visitor.page.getByRole('button', { name: 'Retry app lists', exact: true });
    await expect(retry).toBeVisible();
    await expect(visitor.page.getByText('apps collection 1', { exact: true })).toBeAttached();
    await expect(visitor.page.locator('.earth-loader-wrapper')).toHaveCount(0);
    await retry.click();
    await expect(visitor.page.getByRole('button', { name: 'Load more app lists', exact: true })).toBeDisabled();
    await visitor.page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Books', exact: true }).click();
    await expect(visitor.page.getByText('books collection 1', { exact: true })).toBeVisible();
    release();
    await expect(visitor.page.getByText('apps collection 13', { exact: true })).toHaveCount(0);
    await expect(visitor.page.getByText('apps collection 1', { exact: true })).toHaveCount(0);
    expect(state.reads.filter(read => read.name === 'PublicAppData' && read.variables.cursor !== null).map(read => read.variables.cursor)).toEqual(['o12', 'o12']);
  } finally { release(); await closeFixture(visitor); }
});

const detailRouteStates = [
  { category: 'apps', title: 'App', unavailable: 'App list unavailable', missing: 'List not found or not published.' },
  { category: 'books', title: 'Book', unavailable: 'Book list unavailable', missing: "This list doesn't exist or isn't publicly visible." },
  { category: 'movies', title: 'Movie', unavailable: 'Movie list unavailable', missing: 'List not found or not published.' },
  { category: 'games', title: 'Game', unavailable: 'Game list unavailable', missing: 'List not found' },
  { category: 'products', title: 'Product', unavailable: 'Product list unavailable', missing: 'List not found or not published.' },
  { category: 'people', title: 'Person', unavailable: 'People list unavailable', missing: 'List not found or not published.' },
] as const;

for (const { category, title, unavailable, missing } of detailRouteStates) {
  test(`${category} missing detail keeps its original not-found state and public shell`, async ({ browser, baseURL }) => {
    const state = fixtureState();
    seedLongPublicCollection(state, category, { lists: 1, items: 25 });
    const visitor = await openFixture(browser, baseURL!, state, { owner: false, width: 390, height: 500 });
    try {
      await visitor.page.goto(`/fixture-owner/${category}/missing-${category}`);
      await expect(visitor.page.getByText(missing, { exact: true })).toBeVisible();
      await expect(visitor.page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
      await expect(visitor.page.getByText(`${title} 1`, { exact: true })).toHaveCount(0);
      await expect(visitor.page.getByRole('button', { name: `Load more ${category}`, exact: true })).toHaveCount(0);
      await expect(visitor.page.getByRole('navigation', { name: 'Public navigation' })).toBeVisible();
    } finally { await closeFixture(visitor); }
  });

  test(`${category} 503 detail remains unavailable and retryable`, async ({ browser, baseURL }) => {
    const state = fixtureState();
    seedLongPublicCollection(state, category, { lists: 1, items: 25 });
    state.faults.set('AppListBySlug', Array.from({ length: 4 }, () => ({ kind: 'error' as const, status: 503 })));
    const visitor = await openFixture(browser, baseURL!, state, { owner: false, width: 390, height: 500 });
    try {
      await visitor.page.goto(`/fixture-owner/${category}/public-${category}`);
      await expect(visitor.page.getByRole('heading', { name: unavailable, exact: true })).toBeVisible();
      await expect(visitor.page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
      await expect(visitor.page.getByText(`${title} 1`, { exact: true })).toHaveCount(0);
      await expect(visitor.page.getByRole('navigation', { name: 'Public navigation' })).toBeVisible();
    } finally { await closeFixture(visitor); }
  });
}

test('Places opens city 13 directly and reloads without falling back to city 1', async ({ browser, baseURL }) => {
  const state = fixtureState();
  seedScopedPlaces(state);
  const visitor = await openFixture(browser, baseURL!, state, { owner: false, width: 390, height: 500 });
  try {
    await visitor.page.goto('/fixture-owner/places/city-13');
    await expect(visitor.page.getByRole('heading', { name: 'Destination 13', exact: true })).toBeVisible();
    await expect(visitor.page.getByText('City 13 place 1', { exact: true })).toBeVisible();
    await expect(visitor.page.getByText('City 1 place 1', { exact: true })).toHaveCount(0);
    await visitor.page.reload();
    await expect(visitor.page.getByText('City 13 place 1', { exact: true })).toBeVisible();
    await visitor.page.getByRole('button', { name: "fixture-owner's Places", exact: true }).click();
    await expect(visitor.page).toHaveURL(/\/places$/);
    await visitor.page.goBack();
    await expect(visitor.page.getByText('City 13 place 1', { exact: true })).toBeVisible();
    expect(state.reads.filter(read => read.name === 'AppListBySlug').every(read => read.variables.limit === 24)).toBe(true);
  } finally { await closeFixture(visitor); }
});

test('Places shelf and hero use stored city slug and preserve it in sharing', async ({ browser, baseURL }) => {
  const state = fixtureState();
  seedScopedPlaces(state);
  const visitor = await openFixture(browser, baseURL!, state, { owner: false, width: 1440, height: 650 });
  await visitor.context.grantPermissions(['clipboard-read', 'clipboard-write']);
  try {
    await visitor.page.goto('/fixture-owner/places');
    await visitor.page.getByRole('heading', { name: 'Destination 1', exact: true }).last().click();
    await expect(visitor.page).toHaveURL(/\/places\/city-1$/);
    await expect(visitor.page.locator('link[rel="canonical"][data-rh]')).toHaveAttribute('href', /\/places\/city-1$/);
    await visitor.page.goBack();
    await visitor.page.getByRole('button', { name: 'Show Destination 1', exact: true }).click();
    await visitor.page.getByText('See Details', { exact: true }).filter({ visible: true }).click();
    await expect(visitor.page).toHaveURL(/\/places\/city-1$/);
    await visitor.page.getByRole('button', { name: /share/i }).first().click();
    await expect.poll(() => visitor.page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/places\/city-1/);
  } finally { await closeFixture(visitor); }
});

for (const width of [390, 1440]) {
  test(`Places city 13 appends once at o24, retains modal fields, and retries at ${width}`, async ({ browser, baseURL }) => {
    const state = fixtureState();
    seedScopedPlaces(state);
    const visitor = await openFixture(browser, baseURL!, state, { owner: false, width, height: 500 });
    try {
      await visitor.page.goto('/fixture-owner/places/city-13');
      await visitor.page.getByText('City 13 place 1', { exact: true }).click();
      const modal = visitor.page.locator('[data-public-place-detail]');
      await expect(modal).toBeVisible();
      await expect(modal.getByText('4/10', { exact: true })).toBeVisible();
      await expect(visitor.page.locator('meta[name="description"]')).toHaveAttribute('content', /A memorable fixture recommendation/);
      await expect(visitor.page.locator('link[rel="canonical"][data-rh]')).toHaveAttribute('href', 'https://example.test/recommendation');
      await modal.locator('button').first().focus();
      await modal.locator('button').first().press('Enter');
      state.faults.set('AppListBySlug', [{ kind: 'error', status: 503 }]);
      await visitor.page.getByRole('button', { name: 'Load more places', exact: true }).scrollIntoViewIfNeeded();
      await expect(visitor.page.getByRole('button', { name: 'Retry places', exact: true })).toBeVisible();
      await expect(visitor.page.getByText('City 13 place 1', { exact: true })).toHaveCount(1);
      await visitor.page.getByRole('button', { name: 'Retry places', exact: true }).click();
      await expect(visitor.page.getByText('City 13 place 25', { exact: true })).toBeVisible();
      expect(state.reads.filter(read => read.name === 'AppListBySlug').map(read => read.variables.cursor)).toEqual([null, 'o24', 'o24']);
      expect(state.reads.filter(read => read.name === 'AppListBySlug').every(read => read.variables.limit === 24)).toBe(true);
      await expect(visitor.page.getByRole('button', { name: 'Load more places', exact: true })).toHaveCount(0);
    } finally { await closeFixture(visitor); }
  });
}

test('Places closes a modal on city navigation and ignores a late old continuation', async ({ browser, baseURL }) => {
  const state = fixtureState();
  seedScopedPlaces(state);
  const visitor = await openFixture(browser, baseURL!, state, { owner: false, width: 390, height: 500 });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    await visitor.page.goto('/fixture-owner/places/city-13');
    await expect(visitor.page.getByText('City 13 place 1', { exact: true })).toBeVisible();
    state.faults.set('AppListBySlug', [{ gate }]);
    await visitor.page.getByRole('button', { name: 'Load more places', exact: true }).scrollIntoViewIfNeeded();
    await expect(visitor.page.getByRole('button', { name: 'Load more places', exact: true })).toBeDisabled();
    await visitor.page.getByText('City 13 place 1', { exact: true }).click();
    await expect(visitor.page.locator('[data-public-place-detail]')).toBeVisible();
    await visitor.page.evaluate(() => { history.pushState({}, '', '/fixture-owner/places/city-2'); dispatchEvent(new PopStateEvent('popstate')); });
    await expect(visitor.page.locator('[data-public-place-detail]')).toHaveCount(0);
    await expect(visitor.page.getByText('City 2 place 1', { exact: true })).toBeVisible();
    release();
    await expect(visitor.page.getByText('City 13 place 25', { exact: true })).toHaveCount(0);
    await expect(visitor.page.getByText('City 13 place 1', { exact: true })).toHaveCount(0);
    expect(state.reads.filter(read => read.name === 'RecommendedPlace')).toEqual([]);
  } finally { release(); await closeFixture(visitor); }
});

test('Places removes an open modal when its city becomes unpublished during append', async ({ browser, baseURL }) => {
  const state = fixtureState();
  seedScopedPlaces(state);
  const visitor = await openFixture(browser, baseURL!, state, { owner: false, width: 390, height: 500 });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    await visitor.page.goto('/fixture-owner/places/city-13');
    await expect(visitor.page.getByText('City 13 place 1', { exact: true })).toBeVisible();
    state.faults.set('AppListBySlug', [{ gate }]);
    await visitor.page.getByRole('button', { name: 'Load more places', exact: true }).scrollIntoViewIfNeeded();
    await expect(visitor.page.getByRole('button', { name: 'Load more places', exact: true })).toBeDisabled();
    await visitor.page.getByText('City 13 place 1', { exact: true }).click();
    await expect(visitor.page.locator('[data-public-place-detail]')).toBeVisible();
    state.lists.recommendationLists[12].Visibility = false;
    release();
    await expect(visitor.page.getByRole('heading', { name: 'Places unavailable' })).toBeVisible();
    await expect(visitor.page.locator('[data-public-place-detail]')).toHaveCount(0);
    await expect(visitor.page.getByText('City 13 place 1', { exact: true })).toHaveCount(0);
    expect(state.reads.filter(read => read.name === 'RecommendedPlace')).toEqual([]);
  } finally { release(); await closeFixture(visitor); }
});

test('Places preserves an open modal on append and requests o24 only once', async ({ browser, baseURL }) => {
  const state = fixtureState();
  seedScopedPlaces(state);
  const visitor = await openFixture(browser, baseURL!, state, { owner: false, width: 390, height: 500 });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    await visitor.page.goto('/fixture-owner/places/city-13');
    await expect(visitor.page.getByText('City 13 place 1', { exact: true })).toBeVisible();
    state.faults.set('AppListBySlug', [{ gate }]);
    const continuation = visitor.page.getByRole('button', { name: 'Load more places', exact: true });
    await continuation.scrollIntoViewIfNeeded();
    await expect(continuation).toBeDisabled();
    // Repeated activation cannot create a second in-flight continuation.
    await continuation.dispatchEvent('click');
    await continuation.scrollIntoViewIfNeeded();
    await visitor.page.getByText('City 13 place 1', { exact: true }).click();
    const modal = visitor.page.locator('[data-public-place-detail]');
    await expect(modal).toBeVisible();
    release();
    await expect(visitor.page.getByText('City 13 place 25', { exact: true })).toHaveCount(1);
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('heading', { name: 'City 13 place 1', exact: true })).toBeVisible();
    expect(state.reads.filter(read => read.name === 'AppListBySlug').map(read => read.variables.cursor)).toEqual([null, 'o24']);
    await expect(continuation).toHaveCount(0);
  } finally { release(); await closeFixture(visitor); }
});

for (const unavailable of ['hidden', 'missing'] as const) {
  test(`Places ${unavailable} scoped city never renders another city`, async ({ browser, baseURL }) => {
    const state = fixtureState();
    seedScopedPlaces(state);
    if (unavailable === 'hidden') state.lists.recommendationLists[12].Visibility = false;
    const visitor = await openFixture(browser, baseURL!, state, { owner: false, width: 390, height: 500 });
    try {
      await visitor.page.goto(`/fixture-owner/places/${unavailable === 'hidden' ? 'city-13' : 'missing-city'}`);
      await expect(visitor.page.getByRole('heading', { name: 'Places unavailable' })).toBeVisible();
      await expect(visitor.page.getByText('City 1 place 1', { exact: true })).toHaveCount(0);
      await expect(visitor.page.locator('[data-public-place-detail]')).toHaveCount(0);
      expect(state.reads.filter(read => read.name === 'RecommendedPlace')).toEqual([]);
    } finally { await closeFixture(visitor); }
  });
}

for (const width of [390, 1440]) {
  for (const [category, title] of [['apps', 'App'], ['books', 'Book'], ['movies', 'Movie'], ['games', 'Game'], ['products', 'Product'], ['people', 'Person']] as const) {
    test(`${category} scroll appends beyond 12 and keeps shell at ${width}`, async ({ browser, baseURL }) => {
      const state = fixtureState();
      seedLongPublicCollection(state, category, { lists: 1, items: 25 });
      const visitor = await openFixture(browser, baseURL!, state, { owner: false, width, height: 500 });
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      await visitor.context.route(url => url.origin === 'https://music-fixture.test' && url.searchParams.get('cursor') === 'o12', async route => { await gate; await route.fallback(); });
      const cardTitle = (n: number) => category === 'games'
        ? visitor.page.getByRole('heading', { name: `${title} ${n}`, exact: true })
        : visitor.page.getByText(`${title} ${n}`, { exact: true });
      try {
        await visitor.page.goto(`/fixture-owner/${category}/public-${category}`);
        await expect(cardTitle(1)).toBeVisible();
        await visitor.page.getByRole('button', { name: `Load more ${category}`, exact: true }).scrollIntoViewIfNeeded();
        await expect(visitor.page.getByRole('button', { name: `Load more ${category}`, exact: true })).toBeDisabled();
        await expect(cardTitle(1)).toHaveCount(1);
        await expect(cardTitle(13)).toHaveCount(0);
        await expect(visitor.page.getByRole('navigation', { name: 'Public navigation' })).toBeVisible();
        await expect(visitor.page.locator('.earth-loader-wrapper')).toHaveCount(0);
        await expect(visitor.page.locator('meta[name="description"]')).toHaveAttribute('content', /12\+/);
        release();
        await expect(cardTitle(13)).toBeVisible();
        for (let n = 1; n <= 24; n++) await expect(cardTitle(n)).toHaveCount(1);
        await expect(visitor.page.getByRole('navigation', { name: 'Public navigation' })).toBeVisible();
        await expect(visitor.page.getByRole('status', { name: 'Earth loading' })).toHaveCount(0);
        expect(state.reads.filter(read => read.name === 'AppListBySlug').map(read => read.variables.cursor)).toContain('o12');
      } finally { release(); await closeFixture(visitor); }
    });
  }

  test(`Guide discovers section 13 from a first page with no available tabs at ${width}`, async ({ browser, baseURL }) => {
    const state = fixtureState();
    seedLongPublicCollection(state, 'guides', { lists: 1, items: 13 });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const visitor = await openFixture(browser, baseURL!, state, { width, height: 500 });
    await visitor.context.route(url => url.origin === 'https://music-fixture.test' && url.searchParams.get('cursor') === 'o12', async route => { await gate; await route.fallback(); });
    try {
      // Exercise the real Guide documentId fallback as well as nested pagination.
      await visitor.page.goto('/fixture-owner/guides/guides-list-1');
      await expect(visitor.page.getByRole('heading', { name: 'Public guides', exact: true })).toBeVisible();
      await expect(visitor.page.getByRole('heading', { name: 'Journey', exact: true })).toBeVisible();
      await expect(visitor.page.getByText('No journey information available yet.', { exact: true })).toBeVisible();
      for (const label of ['Transport', 'Stay', 'Budget', 'Tips']) await expect(visitor.page.getByText(label, { exact: true })).toHaveCount(0);
      await visitor.page.getByRole('button', { name: 'Load more days', exact: true }).last().scrollIntoViewIfNeeded();
      release();
      await expect(visitor.page.getByText('Transport', { exact: true })).toBeVisible();
      await visitor.page.getByText('Transport', { exact: true }).click();
      await expect(visitor.page.getByRole('button', { name: 'Day 13', exact: true })).toBeVisible();
      await expect(visitor.page.getByText('Fixture Station', { exact: true }).first()).toBeVisible();
      expect(state.reads.filter(read => read.name === 'AppListBySlug' && read.variables.cursor !== null).map(read => read.variables.cursor)).toEqual(['o12']);
    } finally { release(); await closeFixture(visitor); }
  });

  test(`Guide preserves explicitly selected populated day during append at ${width}`, async ({ browser, baseURL }) => {
    const state = fixtureState();
    seedLongPublicCollection(state, 'guides', { lists: 1, items: 13 });
    for (const section of state.lists.guides[0].guide_sections) section.Timeline.morning = [{ id: `place-${section.Sequence}`, place_id: `place-${section.Sequence}`, name: `Journey place ${section.Sequence}`, formatted_address: 'Fixture City', types: [], photos: [] }];
    const visitor = await openFixture(browser, baseURL!, state, { width, height: 500 });
    try {
      await visitor.page.goto('/fixture-owner/guides/public-guides');
      await visitor.page.getByRole('button', { name: 'Day 2', exact: true }).click();
      await expect(visitor.page.getByText('Journey place 2', { exact: true })).toBeVisible();
      await visitor.page.getByRole('button', { name: 'Load more days', exact: true }).first().scrollIntoViewIfNeeded();
      await expect(visitor.page.getByRole('button', { name: 'Day 13', exact: true })).toBeAttached();
      await expect(visitor.page.getByText('Journey place 2', { exact: true })).toBeVisible();
      await expect(visitor.page.getByText('Journey place 1', { exact: true })).toHaveCount(0);
    } finally { await closeFixture(visitor); }
  });
}

test('page two failure retains cards until explicit retry, and browser refresh resets pagination', async ({ browser, baseURL }) => {
  const state = fixtureState();
  seedLongPublicCollection(state, 'apps', { lists: 1, items: 25 });
  const visitor = await openFixture(browser, baseURL!, state, { width: 390, height: 500 });
  try {
    await visitor.page.goto('/fixture-owner/apps/public-apps');
    await expect(visitor.page.getByText('App 1', { exact: true })).toBeVisible();
    state.faults.set('AppListBySlug', [{ kind: 'error', status: 503 }]);
    await visitor.page.getByRole('button', { name: 'Load more apps', exact: true }).scrollIntoViewIfNeeded();
    await expect(visitor.page.getByRole('button', { name: 'Retry apps', exact: true })).toBeVisible();
    await expect(visitor.page.getByText('App 1', { exact: true })).toHaveCount(1);
    await expect(visitor.page.getByText('App 13', { exact: true })).toHaveCount(0);
    await visitor.page.getByRole('button', { name: 'Retry apps', exact: true }).click();
    await expect(visitor.page.getByText('App 13', { exact: true })).toBeVisible();
    state.reads.length = 0;
    await visitor.page.reload();
    await expect(visitor.page.getByText('App 1', { exact: true })).toBeAttached();
    expect(state.reads.find(read => read.name === 'AppListBySlug')?.variables).toMatchObject({ cursor: null, limit: 12 });
    expect(visitor.guard.observedHttpErrors.some(error => error.startsWith('503 '))).toBe(true);
  } finally { await closeFixture(visitor); }
});

test('detail becoming missing during continuation restores not-found state and removes stale cards', async ({ browser, baseURL }) => {
  const state = fixtureState();
  seedLongPublicCollection(state, 'apps', { lists: 1, items: 25 });
  const visitor = await openFixture(browser, baseURL!, state, { width: 390, height: 500 });
  try {
    await visitor.page.goto('/fixture-owner/apps/public-apps');
    await expect(visitor.page.getByText('App 1', { exact: true })).toBeVisible();
    state.lists.appLists[0].Visibility = false;
    await visitor.page.getByRole('button', { name: 'Load more apps', exact: true }).scrollIntoViewIfNeeded();
    await expect(visitor.page.getByText('List not found or not published.', { exact: true })).toBeVisible();
    await expect(visitor.page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
    await expect(visitor.page.getByText('App 1', { exact: true })).toHaveCount(0);
    await expect(visitor.page.getByRole('button', { name: 'Load more apps', exact: true })).toHaveCount(0);
    await expect(visitor.page.getByRole('navigation', { name: 'Public navigation' })).toBeVisible();
  } finally { await closeFixture(visitor); }
});
