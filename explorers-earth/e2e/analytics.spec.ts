import { expect, test, type Route } from '@playwright/test';
import { canonicalAccountFixture } from '../src/test/canonicalAccountFixture';
import { publicPersonSchema, publicPeopleSectorPageSchema } from '../../tunes/shared/explorersPublicPeopleSectorContract';
import { denyHostedEgress } from './setup/deny-hosted-egress';
import { fixtureState, openFixture } from './setup/category-navigation';
import { ownerContentSummarySchema } from '../../tunes/shared/explorersOwnerContentContract';

// The owner dashboard reads canonical analytics over REST: GET /api/explorers/analytics/events
// on the configured Music/Explorers authority, scoped to the canonical account id and a
// date-only window, riding the canonical session cookie (no bearer). The contained owner
// fixture answers the canonical session and account reads; only the analytics read is stubbed.

type OwnerHandle = Awaited<ReturnType<typeof openFixture>>;
type AnalyticsRead = { url: URL; authorization?: string; credentialed: boolean };

const ownerAccountId = canonicalAccountFixture().id;

async function openOwner(browser: Parameters<typeof openFixture>[0], baseURL: string, width = 1280) {
  const handle = await openFixture(browser, baseURL, fixtureState(), { owner: true, width, timezoneId: 'Asia/Kolkata' });
  await denyHostedEgress(handle.page);
  // World atlas topology for the country map: an empty, valid topology.
  await handle.page.route('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ type: 'Topology', objects: { countries: { type: 'GeometryCollection', geometries: [] } }, arcs: [] }),
    }),
  );
  // Home's content counts: an empty, contract-valid summary.
  await handle.page.route(url => url.pathname === '/api/explorers/v1/content-summary', route => route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary: ownerContentSummarySchema.parse({
      version: 'explorers-owner-content/v2', categories: [] }) }) })
    : route.fallback());
  return handle;
}

async function routeAnalyticsReads(handle: OwnerHandle, respond: (route: Route, url: URL) => Promise<void>) {
  const reads: AnalyticsRead[] = [];
  await handle.page.route('**/api/explorers/analytics/events?*', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') return route.fallback();
    const url = new URL(request.url());
    const headers = await request.allHeaders();
    reads.push({ url, authorization: headers.authorization, credentialed: Boolean(headers.cookie) });
    await respond(route, url);
  });
  return reads;
}

/** Fails on any denied request; console errors must match one of the expected patterns. */
async function closeOwner(handle: OwnerHandle, expectedConsole: RegExp[] = []) {
  try {
    expect(handle.guard.denied).toEqual([]);
    expect(handle.guard.errors.filter(error => !expectedConsole.some(pattern => pattern.test(error)))).toEqual([]);
  } finally {
    await handle.context.close();
  }
}

const analyticsRecords = (from: string, to: string) => {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  const timestamp = new Date(fromMs + (toMs - fromMs) / 2).toISOString();

  return [
    {
      Account_Id: ownerAccountId,
      Location_Id: null,
      Recommendation_Id: null,
      Stats: [
        {
          type: 'view',
          timestamp,
          page: 'public-profile',
          canonicalPath: '/fixture-owner',
          country: 'IN',
          utmParams: { utm_source: 'qr_code_scan', utm_medium: 'qr_code' },
        },
        {
          type: 'view',
          timestamp,
          page: 'public-books',
          canonicalPath: '/fixture-owner/books',
          country: 'US',
          utmParams: { utm_source: 'newsletter', utm_medium: 'email' },
        },
        {
          type: 'click',
          timestamp,
          page: 'public-books',
          element: 'book-card-book-1',
          canonicalPath: '/fixture-owner/books',
          country: 'US',
          metadata: { id: 'book-1', title: 'Fixture Book' },
        },
      ],
    },
  ];
};

test.describe('Analytics dashboard E2E', () => {
  test('Home shows a truthful 90-calendar-day value and failure never masquerades as zero', async ({ browser, baseURL }) => {
    const handle = await openOwner(browser, baseURL!);
    let failure = false;
    const reads = await routeAnalyticsReads(handle, async (route) => {
      if (failure) return route.fulfill({ status: 503, body: 'fixture unavailable' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [] }) });
    });
    try {
      const { page } = handle;
      await page.goto('/home');
      await expect.poll(() => reads.length).toBeGreaterThan(0);
      await expect(page.getByText('Views · last 90 days')).toBeVisible();
      const scope = reads.at(-1)!.url;
      expect(scope.searchParams.get('accountId')).toBe(ownerAccountId);
      const fromDate = scope.searchParams.get('fromDate')!;
      const toDate = scope.searchParams.get('toDate')!;
      const inclusiveDays = Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000) + 1;
      expect(inclusiveDays).toBe(90);
      expect(scope.searchParams.get('timeZone')).toBe('Asia/Calcutta');
      await expect(page.getByText('Views · last 90 days').locator('..')).toContainText('0');

      failure = true;
      await page.reload();
      await expect(page.getByText('Views · last 90 days').locator('..')).toContainText('Unavailable');
    } finally {
      await closeOwner(handle, [/status of 503/, /Analytics/]);
    }
  });

  test('reads only the authenticated account and refreshes server date scopes', async ({ browser, baseURL }) => {
    const handle = await openOwner(browser, baseURL!);
    const failedResponses: string[] = [];
    const reads = await routeAnalyticsReads(handle, async (route, url) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          events: analyticsRecords(
            `${url.searchParams.get('fromDate')}T00:00:00.000Z`,
            `${url.searchParams.get('toDate')}T23:59:59.999Z`,
          ),
        }),
      });
    });
    try {
      const { page } = handle;
      page.on('response', response => {
        if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
      });

      await page.goto('/analytics', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Analytics Dashboard' })).toBeVisible();
      // React StrictMode replays the read effect once in development, so the initial load
      // may issue the same scoped read twice; every initial read must carry the same scope.
      await expect.poll(() => reads.length).toBeGreaterThanOrEqual(1);
      expect(new Set(reads.map(read => read.url.search)).size).toBe(1);
      const initialReads = reads.length;

      // The owner's canonical account id, never a caller-chosen account; the canonical
      // session rides the cookie, so no bearer token is sent.
      expect(reads[0].url.searchParams.get('accountId')).toBe(ownerAccountId);
      expect(reads[0].authorization).toBeUndefined();
      expect(reads[0].url.searchParams.get('fromDate')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(reads[0].url.searchParams.get('toDate')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(reads[0].url.searchParams.get('timeZone')).toBe('Asia/Calcutta');

      await expect(
        page.getByRole('heading', { name: 'Total Views' }).locator('..').locator('p.text-2xl'),
      ).toHaveText('2');
      await expect(
        page.getByRole('heading', { name: 'Total Clicks' }).locator('..').locator('p.text-2xl'),
      ).toHaveText('1');
      await expect(
        page.getByRole('heading', { name: 'Total QR Views' }).locator('..').locator('p.text-2xl'),
      ).toHaveText('1');
      await expect(
        page.getByRole('heading', { name: 'Total Link Views' }).locator('..').locator('p.text-2xl'),
      ).toHaveText('1');
      await expect(page.getByText('India')).toBeVisible();
      await expect(page.getByText('United States')).toBeVisible();

      await page.getByRole('button', { name: 'Last 30 Days' }).click();
      await page.getByRole('button', { name: 'Today', exact: true }).click();
      await expect.poll(() => reads.length).toBe(initialReads + 1);
      expect(reads.at(-1)!.url.searchParams.get('fromDate')).toBe(reads.at(-1)!.url.searchParams.get('toDate'));

      await page.getByRole('button', { name: 'Today', exact: true }).click();
      await page.getByRole('button', { name: 'Custom Range', exact: true }).click();
      const dateInputs = page.locator('input[type="date"]');
      await dateInputs.nth(0).fill('2026-08-01');
      await dateInputs.nth(1).fill('2026-08-15');
      await expect.poll(() => reads.length).toBeGreaterThanOrEqual(initialReads + 2);
      const custom = reads.at(-1)!;
      expect(custom.url.searchParams.get('fromDate')).toBe('2026-08-01');
      expect(custom.url.searchParams.get('toDate')).toBe('2026-08-15');
      expect(custom.url.searchParams.get('timeZone')).toBe('Asia/Calcutta');

      await dateInputs.nth(0).fill('2026-01-01');
      await dateInputs.nth(1).fill('2026-04-03');
      await expect.poll(() => reads.at(-1)?.url.searchParams.get('toDate')).toBe('2026-04-03');
      const acceptedReads = reads.length;
      await dateInputs.nth(1).fill('2026-04-04');
      await expect(page.getByRole('alert')).toHaveText('Choose a date range of 93 days or less.');
      await page.waitForTimeout(150);
      expect(reads).toHaveLength(acceptedReads);
      expect(failedResponses).toEqual([]);
    } finally {
      await closeOwner(handle);
    }
  });

  test('renders empty and failure states without overflowing mobile', async ({ browser, baseURL }) => {
    const handle = await openOwner(browser, baseURL!, 320);
    let mode: 'empty' | 'error' = 'empty';
    await routeAnalyticsReads(handle, async (route) => {
      if (mode === 'error') return route.fulfill({ status: 503, body: 'fixture unavailable' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [] }) });
    });
    try {
      const { page } = handle;
      await page.goto('/analytics', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'No Analytics Data' })).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
      ).toBe(true);
      // Only the deliberate 503 below may produce console errors.
      expect(handle.guard.errors).toEqual([]);

      mode = 'error';
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Error Loading Analytics' })).toBeVisible();
      // The raw failure (status, body) goes to the console only; the owner sees translated copy.
      await expect(page.getByText("We couldn't load your analytics right now. Please try again.")).toBeVisible();
      await expect(page.getByText(/503|fixture unavailable/)).toHaveCount(0);
    } finally {
      await closeOwner(handle, [/status of 503/, /Analytics read failed/]);
    }
  });
});

// Public People rows are parsed with the canonical public DTO, so the fixture must satisfy it.
const personListId = '5d1f6b1e-0c43-4a8e-9f61-2b7c9e1a4d01';
const personId = '5d1f6b1e-0c43-4a8e-9f61-2b7c9e1a4d02';
const buildersSector = { documentId: '5d1f6b1e-0c43-4a8e-9f61-2b7c9e1a4d03', slug: 'builders', Category_name: 'Builders' };
const publicPerson = publicPersonSchema.parse({
  documentId: personId, title: 'Fixture Person', full_name: 'Fixture Person', username_handle: 'fixture-person',
  headline: 'Builder', location_text: null, avatar_url: null, media_details: null, platform: 'website',
  primary_platform: 'website', profile_url: null, social_urls: {}, skills_tags: [], follower_count: null,
  user_recommendation_note: '', user_rating: 10, is_pinned: true, pin_order: 1, display_order: 1,
  person_list: { documentId: personListId, List_Name: 'Fixture Person List', slug: 'fixture-list' },
  person_category: null, people_category: { ...buildersSector, id: buildersSector.documentId },
});

test.describe('Public category analytics E2E', () => {
  test('Apps, Products, and People emit account-owned list and item IDs from real UI clicks', async ({
    context,
    page,
  }) => {
    await denyHostedEgress(page);
    await context.addInitScript(() => {
      localStorage.setItem(
        'explorers-cookie-consent',
        JSON.stringify({ necessary: true, analytics: true }),
      );
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async () => undefined,
      });
    });

    const publicAccount = {
      documentId: 'acc-public-1',
      username: 'fixture-user',
      Account_Name: 'Public Analytics Fixture',
      Account_Type: 'personal',
      Primary_Address: 'Bengaluru',
      profile_picture: null,
      bg_picture: null,
      localtunes_public: null,
      public_profile: 'Yes',
      public_recommendations: 'Yes',
      public_music: 'No',
      public_movie: 'No',
      public_books: 'No',
      public_guides: 'No',
      public_games: 'No',
      public_apps: 'Yes',
      public_products: 'Yes',
      public_people: 'Yes',
      pinned_nav_tabs: ['apps', 'products', 'people'],
      auto_pinning: false,
    };
    const fixtures = {
      apps: {
        title: 'Fixture App',
        listId: 'app-list-public-1',
        itemId: 'app-public-1',
        listRoot: 'appLists',
        relation: 'recommended_apps',
        operation: 'PublicAppData',
        listOperation: 'AppListBySlug',
        item: {
          documentId: 'app-public-1',
          title: 'Fixture App',
          description: 'A useful public app.',
          logo_url: null,
          developer: 'Fixture Dev',
          platforms: ['Web'],
          price_tier: 'Free',
          screenshots: [],
          user_rating: 9,
          is_pinned: true,
          pin_order: 1,
          display_order: 1,
          app_list: null,
          app_category: null,
        },
      },
      products: {
        title: 'Fixture Product',
        listId: 'product-list-public-1',
        itemId: 'product-public-1',
        listRoot: 'productLists',
        relation: 'recommended_products',
        operation: 'PublicProductData',
        listOperation: 'ProductListBySlug',
        item: {
          documentId: 'product-public-1',
          title: 'Fixture Product',
          description: 'A useful public product.',
          brand: 'Fixture Brand',
          price: 99,
          currency: 'USD',
          logo_url: null,
          images: [],
          user_rating: 8,
          is_pinned: true,
          pin_order: 1,
          display_order: 1,
          product_list: null,
          product_category: null,
        },
      },
      people: {
        title: 'Fixture Person',
        listId: personListId,
        itemId: personId,
        listRoot: 'personLists',
        relation: 'recommended_people',
        operation: 'PublicPeopleData',
        listOperation: 'PersonListBySlug',
        item: publicPerson,
      },
    } as const;

    const writes: Array<Record<string, any>> = [];
    await page.route('**/api/explorers/analytics/events', async (route) => {
      writes.push(route.request().postDataJSON());
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'committed', duplicate: false }),
      });
    });

    await page.route('**/api/explorers/v1/profiles/fixture-user**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/recommendations/people/sectors/builders')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(publicPeopleSectorPageSchema.parse({
            version: 'explorers-public-people-sector/v1', sector: buildersSector, canonicalSlug: 'builders',
            redirectSlug: null, recommended_people: [publicPerson], nextCursor: null,
          })),
        });
      }
      const match = url.pathname.match(/\/recommendations\/(apps|products|people)(?:\/fixture-list)?$/);
      if (!match) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(publicAccount),
        });
      }
      const fixture = fixtures[match[1] as keyof typeof fixtures];
      const list = {
        documentId: fixture.listId,
        List_Name: `${fixture.title} List`,
        list_description: 'Public fixture list',
        slug: 'fixture-list',
        Visibility: true,
        cover_image: null,
        display_order: 1,
        account: { documentId: publicAccount.documentId, username: 'fixture-user' },
        [fixture.relation]: [fixture.item],
        ...(match[1] === 'people' ? { recommended_people_next_cursor: null } : {}),
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ [fixture.listRoot]: [list] }),
      });
    });

    await page.route('**/graphql', async (route) => {
      const payload = route.request().postDataJSON() as { query?: string };
      const query = payload?.query || '';
      if (query.includes('CheckUsername')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { accounts: [publicAccount] } }),
        });
      }
      if (query.includes('PublicAccountBasic')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { accounts: [publicAccount] } }),
        });
      }
      if (query.includes('AccountByUsername')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              usersPermissionsUsers: [{
                username: 'fixture-user',
                accounts: [publicAccount],
              }],
            },
          }),
        });
      }
      const fixture = Object.values(fixtures).find(({ operation, listOperation }) =>
        query.includes(operation) || query.includes(listOperation),
      );
      if (fixture) {
        const list = {
          documentId: fixture.listId,
          List_Name: `${fixture.title} List`,
          list_description: 'Public fixture list',
          slug: 'fixture-list',
          Visibility: true,
          cover_image: null,
          display_order: 1,
          account: {
            documentId: publicAccount.documentId,
            username: 'fixture-user',
          },
          [fixture.relation]: [fixture.item],
        };
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { [fixture.listRoot]: [list] } }),
        });
      }
      if (query.includes('PublicCategoryListCounts')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              recommendationLists: [],
              bookLists: [],
              movieLists: [],
              gameLists: [],
              appLists: [{ documentId: fixtures.apps.listId }],
              productLists: [{ documentId: fixtures.products.listId }],
              personLists: [{ documentId: fixtures.people.listId }],
              guides: [],
            },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: {} }),
      });
    });

    for (const [category, fixture] of Object.entries(fixtures)) {
      await page.goto(`/fixture-user/${category}`, { waitUntil: 'domcontentloaded' });
      const heading = page.getByRole('heading', { name: fixture.title, exact: true }).first();
      await expect(heading).toBeVisible();
      await heading.click();

      await expect.poll(() =>
        writes.some((write) =>
          write.event?.page === `public-${category}` &&
          write.recommendationId === fixture.itemId &&
          write.locationId === fixture.listId,
        ),
      ).toBe(true);
    }

    const itemWrites = writes.filter((write) =>
      ['app-card', 'product-card', 'person-card'].some((element) =>
        String(write.event?.element || '').startsWith(element),
      ),
    );
    expect(itemWrites).toHaveLength(3);
    // SEC-03: public pages address the creator by public handle, never the internal account id.
    expect([...new Set(writes.map((write) => write.accountId))]).toEqual(['fixture-user']);

    for (const [category, fixture] of Object.entries(fixtures)) {
      const canonicalPath = `/fixture-user/${category}/fixture-list`;
      await page.goto(canonicalPath, { waitUntil: 'domcontentloaded' });
      const item = page.getByRole('button', {
        name: new RegExp(fixture.title, 'i'),
      }).first();
      await expect(item).toBeVisible();
      await page.getByLabel('Share').click();
      await item.click();

      await expect.poll(() => ({
        view: writes.some((write) =>
          write.event?.type === 'view' &&
          write.event?.page === `public-${category}` &&
          write.event?.canonicalPath === canonicalPath &&
          write.locationId === fixture.listId &&
          write.recommendationId === null,
        ),
        item: writes.some((write) =>
          write.event?.canonicalPath === canonicalPath &&
          String(write.event?.element || '').startsWith(`${category === 'people' ? 'person' : category.slice(0, -1)}-card`) &&
          write.locationId === fixture.listId &&
          write.recommendationId === fixture.itemId,
        ),
        share: writes.some((write) =>
          write.accountId === publicAccount.username &&
          write.event?.page === `public-${category}` &&
          write.event?.canonicalPath === canonicalPath &&
          write.event?.element === 'share-button' &&
          write.locationId === fixture.listId,
        ),
      })).toEqual({ view: true, item: true, share: true });
    }

    const sectorPath = '/fixture-user/people/sector/builders';
    await page.goto(sectorPath, { waitUntil: 'domcontentloaded' });
    const sectorPerson = page.getByRole('button', { name: /Fixture Person/i }).first();
    await expect(sectorPerson).toBeVisible();
    await page.getByLabel('Share').click();
    await sectorPerson.click();

    await expect.poll(() => ({
      view: writes.some((write) =>
        write.event?.type === 'view' &&
        write.event?.canonicalPath === sectorPath &&
        write.locationId === null &&
        write.recommendationId === null,
      ),
      item: writes.some((write) =>
        write.event?.canonicalPath === sectorPath &&
        String(write.event?.element || '').startsWith('person-card') &&
        write.locationId === fixtures.people.listId &&
        write.recommendationId === fixtures.people.itemId,
      ),
      share: writes.some((write) =>
        write.event?.canonicalPath === sectorPath &&
        write.event?.element === 'share-button',
      ),
    })).toEqual({ view: true, item: true, share: true });
  });
});
