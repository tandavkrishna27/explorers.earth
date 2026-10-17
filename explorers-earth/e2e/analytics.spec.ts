import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Route,
} from '@playwright/test';
import { setupMockAuthentication } from './setup/auth';
import { denyHostedEgress } from './setup/deny-hosted-egress';

const operationName = (route: Route) => {
  const payload = route.request().postDataJSON() as
    | { operationName?: string; query?: string }
    | undefined;
  return (
    payload?.operationName ||
    payload?.query?.match(/(?:query|mutation)\s+(\w+)/)?.[1] ||
    'Unknown'
  );
};

const account = {
  documentId: 'acc-123',
  Account_Name: 'Analytics Fixture',
  Account_Type: 'personal',
  mobile_number: '+10000000000',
  profile_picture: { url: '/images/Profile.jpg', alternativeText: 'Analytics fixture' },
  bg_picture: { url: '/images/bg-image.jpg', alternativeText: 'Analytics background' },
  Bio: 'Complete analytics fixture profile.',
  Primary_Address: { address: 'Fixture City' },
  social_media: {},
  users_permissions_users: [],
  Feed_Data: [],
  mobile_number_visibility: false,
  recommendation_lists: [],
  localtunes_integrated: false,
  public_profile: 'Yes',
  public_recommendations: 'Yes',
  public_music: 'No',
  public_movie: 'No',
  public_guides: 'No',
  public_books: 'No',
  public_games: 'No',
  public_apps: 'No',
  public_products: 'No',
  public_people: 'No',
  pinned_nav_tabs: [],
  auto_pinning: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

async function installAuthenticatedDashboardFixture(
  context: BrowserContext,
  page: Page,
) {
  await denyHostedEgress(page);
  await page.route('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ type: 'Topology', objects: { countries: { type: 'GeometryCollection', geometries: [] } }, arcs: [] }),
    }),
  );
  await setupMockAuthentication(context);
  await page.route("**/__localtunes/api/music/identity/ensure", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  const operations: string[] = [];

  await page.route('**/graphql', async (route) => {
    const operation = operationName(route);
    operations.push(operation);

    if (operation === 'GetAccountId') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            usersPermissionsUser: {
              createdAt: '2026-01-01T00:00:00.000Z',
              accounts: [
                {
                  documentId: account.documentId,
                  Account_Name: account.Account_Name,
                  Account_Type: account.Account_Type,
                  mobile_number: account.mobile_number,
                  createdAt: '2026-01-01T00:00:00.000Z',
                },
              ],
            },
          },
        }),
      });
    }

    if (
      operation === 'CheckOnboardingStatus' ||
      operation === 'UsersPermissionsUser' ||
      operation === 'SidebarAccount' ||
      operation === 'MusicIdentityEligibility' ||
      operation === 'SettingsAccount'
    ) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            usersPermissionsUser: {
              id: 'mock-user-123',
              documentId: 'mock-user-123',
              email: 'test@explorers.earth',
              provider: 'local',
              confirmed: true,
              blocked: false,
              username: 'testuser',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              accounts: [account],
            },
          },
        }),
      });
    }

    if (operation === 'user') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            accounts: [account],
            usersPermissionsUser: {
              id: 'mock-user-123',
              documentId: 'mock-user-123',
              username: 'testuser',
              email: 'test@explorers.earth',
              provider: 'local',
              confirmed: true,
              blocked: false,
              accounts: [account],
            },
          },
        }),
      });
    }

    if (operation === 'GetDashboardStatus') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            usersPermissionsUser: {
              documentId: 'mock-user-123',
              accounts: [account],
            },
          },
        }),
      });
    }

    if (operation === 'GetUserAccount') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            usersPermissionsUser: {
              accounts: [account],
            },
          },
        }),
      });
    }

    if (operation === 'RecommendationLists') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { recommendationLists: [] } }),
      });
    }

    if (
      operation === 'PublicCategoryListCounts' ||
      operation === 'CheckPublishedLists'
    ) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            recommendationLists: [],
            bookLists: [],
            movieLists: [],
            gameLists: [],
            appLists: [],
            productLists: [],
            personLists: [],
            guides: [],
          },
        }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          accounts: [account],
          usersPermissionsUser: {
            documentId: 'mock-user-123', username: 'testuser', email: 'test@explorers.earth',
            provider: 'local', confirmed: true, blocked: false, accounts: [account],
          },
          me: { accounts: [account] },
        },
      }),
    });
  });

  return operations;
}

const analyticsRecords = (from: string, to: string) => {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  const timestamp = new Date(fromMs + (toMs - fromMs) / 2).toISOString();

  return [
    {
      Account_Id: account.documentId,
      Location_Id: null,
      Recommendation_Id: null,
      Stats: [
        {
          type: 'view',
          timestamp,
          page: 'public-profile',
          canonicalPath: '/fixture-user',
          country: 'IN',
          utmParams: { utm_source: 'qr_code_scan', utm_medium: 'qr_code' },
        },
        {
          type: 'view',
          timestamp,
          page: 'public-books',
          canonicalPath: '/fixture-user/books',
          country: 'US',
          utmParams: { utm_source: 'newsletter', utm_medium: 'email' },
        },
        {
          type: 'click',
          timestamp,
          page: 'public-books',
          element: 'book-card-book-1',
          canonicalPath: '/fixture-user/books',
          country: 'US',
          metadata: { id: 'book-1', title: 'Fixture Book' },
        },
      ],
    },
  ];
};

test.describe('Analytics dashboard E2E', () => {
  test.use({ timezoneId: 'Asia/Kolkata' });

  test('Home shows a truthful 90-calendar-day value and failure never masquerades as zero', async ({ context, page }) => {
    const operations = await installAuthenticatedDashboardFixture(context, page);
    const reads: URL[] = [];
    let failure = false;
    await page.route('**/api/explorers/analytics/events*', async (route) => {
      reads.push(new URL(route.request().url()));
      if (failure) return route.fulfill({ status: 503, body: 'fixture unavailable' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [] }) });
    });
    await page.goto('/home');
    await expect.poll(() => reads.length, { message: `analytics read after GraphQL operations: ${operations.join(',')}` }).toBeGreaterThan(0);
    await expect(page.getByText('Views · last 90 days')).toBeVisible();
    const scope = reads.at(-1)!;
    const fromDate = scope.searchParams.get('fromDate')!;
    const toDate = scope.searchParams.get('toDate')!;
    const inclusiveDays = Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000) + 1;
    expect(inclusiveDays).toBe(90);
    expect(scope.searchParams.get('timeZone')).toBe('Asia/Calcutta');
    await expect(page.getByText('Views · last 90 days').locator('..')).toContainText('0');

    failure = true;
    await page.reload();
    await expect(page.getByText('Views · last 90 days').locator('..')).toContainText('Unavailable');
  });
  test('reads only the authenticated account and refreshes server date scopes', async ({
    context,
    page,
  }) => {
    const operations = await installAuthenticatedDashboardFixture(context, page);
    const reads: Array<{ url: URL; authorization?: string }> = [];
    const consoleIssues: string[] = [];
    const failedResponses: string[] = [];
    page.on('console', message => {
      if (
        message.type() === 'error' ||
        (message.type() === 'warning' &&
          (message.text().includes('go.apollo.dev') ||
            message.text().includes('width(-1)')))
      ) {
        consoleIssues.push(message.text());
      }
    });
    page.on('response', response => {
      if (response.status() >= 400) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.route('**/api/explorers/analytics/events*', async (route) => {
      const url = new URL(route.request().url());
      reads.push({
        url,
        authorization: route.request().headers().authorization,
      });
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

    await page.goto('/analytics', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Analytics Dashboard' })).toBeVisible();
    await expect.poll(() => reads.length).toBe(1);

    expect(reads[0].url.searchParams.get('accountId')).toBe(account.documentId);
    expect(reads[0].authorization).toBe('Bearer mock-jwt-token-xyz');
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
    expect(operations).not.toContain('GetPublicPageAnalytics');

    await page.getByRole('button', { name: 'Last 30 Days' }).click();
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect.poll(() => reads.length).toBe(2);
    expect(reads[1].url.searchParams.get('fromDate')).toBe(reads[1].url.searchParams.get('toDate'));

    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await page.getByRole('button', { name: 'Custom Range', exact: true }).click();
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.nth(0).fill('2026-08-01');
    await dateInputs.nth(1).fill('2026-08-15');
    await expect.poll(() => reads.length).toBeGreaterThanOrEqual(3);
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
    expect(consoleIssues).toEqual([]);
  });

  test('renders empty and failure states without overflowing mobile', async ({
    context,
    page,
  }) => {
    await installAuthenticatedDashboardFixture(context, page);
    const consoleIssues: string[] = [];
    let mode: 'empty' | 'error' = 'empty';
    page.on('console', message => {
      const text = message.text();
      const expectedFailureResponse =
        mode === 'error' &&
        text.includes('server responded with a status of 503');
      if (
        !expectedFailureResponse &&
        (message.type() === 'error' ||
          (message.type() === 'warning' &&
            (text.includes('go.apollo.dev') || text.includes('width(-1)'))))
      ) {
        consoleIssues.push(text);
      }
    });
    await page.setViewportSize({ width: 320, height: 800 });

    await page.route('**/api/explorers/analytics/events*', async (route) => {
      if (mode === 'error') {
        return route.fulfill({ status: 503, body: 'fixture unavailable' });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ events: [] }),
      });
    });

    await page.goto('/analytics', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'No Analytics Data' })).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);

    mode = 'error';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Error Loading Analytics' })).toBeVisible();
    await expect(page.getByText(/503/)).toBeVisible();
    expect(consoleIssues).toEqual([]);
  });
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
        listId: 'person-list-public-1',
        itemId: 'person-public-1',
        listRoot: 'personLists',
        relation: 'recommended_people',
        operation: 'PublicPeopleData',
        listOperation: 'PersonListBySlug',
        item: {
          documentId: 'person-public-1',
          name: 'Fixture Person',
          username_handle: 'fixture-person',
          headline: 'Builder',
          avatar_path: null,
          primary_platform: 'website',
          social_urls: {},
          skills_tags: [],
          user_rating: 10,
          is_pinned: true,
          pin_order: 1,
          display_order: 1,
          person_list: null,
          people_category: {
            documentId: 'people-category-builders',
            Category_name: 'Builders',
          },
        },
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
          write.accountId === publicAccount.documentId &&
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
