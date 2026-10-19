import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useQuery } from '@apollo/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PublicApps from '../AppsAndTools/components/public/PublicApps';
import PublicAppList from '../AppsAndTools/components/public/PublicAppList';
import PublicProducts from '../Products/components/public/PublicProducts';
import PublicProductList from '../Products/components/public/PublicProductList';
import PublicPeople from '../People/components/public/PublicPeople';
import PublicPersonList from '../People/components/public/PublicPersonList';
import PublicPersonSector from '../People/components/public/PublicPersonSector';
import PublicHome from '../PublicHome/components/PublicHome';
import PublicGuides from '../PublicHome/components/PublicGuides';
import PublicGuideDetailPage from '../PublicHome/components/PublicGuideDetailPage';
import PublicBookSubject from '../Books/components/public/PublicBookSubject';
import PublicMovieGenre from '../Movies/components/public/PublicMovieGenre';
import { PublicHeaderDescriptorProvider } from '../PublicHome/components/PublicHeaderDescriptorContext';
import { PublicProfileFixedHeader } from '../PublicHome/components/PublicProfileChromePrimitives';

const analyticsMocks = vi.hoisted(() => ({
  trackClick: vi.fn(),
  trackInteraction: vi.fn(),
  hookOptions: vi.fn(),
  appsOptions: vi.fn((accountId: string, pageUsername?: string, listId?: string) => ({
    accountId,
    pageUsername,
    locationId: listId,
    pageName: 'public-apps',
  })),
  productsOptions: vi.fn((accountId: string, pageUsername?: string, listId?: string) => ({
    accountId,
    pageUsername,
    locationId: listId,
    pageName: 'public-products',
  })),
  peopleOptions: vi.fn((accountId: string, pageUsername?: string, listId?: string) => ({
    accountId,
    pageUsername,
    locationId: listId,
    pageName: 'public-people',
  })),
}));

const gatewayFixtures = vi.hoisted(() => ({
  loading: false,
  categoryData: undefined as Record<string, unknown> | undefined,
  detailData: undefined as Record<string, unknown> | undefined,
  sectorData: undefined as Record<string, unknown> | undefined,
}));

// PublicPeople and PublicPersonSector were moved off Apollo onto the native sector view
// model, so their rows must be public-people DTOs (uuid identities, `title`/`full_name`)
// rather than the Strapi-shaped records the Apollo consumers below still read.
const nativePeopleIds = vi.hoisted(() => ({
  list: '00000000-0000-4000-8000-000000000201',
  person: '00000000-0000-4000-8000-000000000301',
  sector: '00000000-0000-4000-8000-000000000401',
}));

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@apollo/client')>();
  return { ...actual, useQuery: vi.fn() };
});

vi.mock('../PublicHome/api/usePublicProfileShell', () => ({
  usePublicProfileShell: () => ({
    data: gatewayFixtures.loading ? undefined : {
      documentId: 'account-1', username: 'tk2727', Account_Name: 'TK', public_profile: 'Yes',
      public_apps: 'Yes', public_products: 'Yes', public_people: 'Yes', public_books: 'Yes',
      public_movies: 'Yes', public_guides: 'Yes', public_games: 'Yes', public_recommendations: 'Yes',
    },
    loading: gatewayFixtures.loading, error: null, refetch: vi.fn(),
  }),
}));

vi.mock('../PublicHome/api/usePublicRecommendationCategory', () => ({
  usePublicRecommendationCategory: () => ({
    data: gatewayFixtures.categoryData, loading: gatewayFixtures.loading, error: null, refetch: vi.fn(),
  }),
}));

vi.mock('../People/api/usePublicPeopleSector', () => ({
  usePublicPeopleSector: () => ({
    data: gatewayFixtures.sectorData, loading: gatewayFixtures.loading, error: null, refetch: vi.fn(),
  }),
}));

vi.mock('../PublicHome/api/usePublicProfileDetail', () => ({
  usePublicProfileDetail: () => ({
    data: gatewayFixtures.detailData, loading: gatewayFixtures.loading, error: null, refetch: vi.fn(),
  }),
}));

vi.mock('../../services/analyticsService', () => ({
  useTrackAnalytics: (options: unknown) => (analyticsMocks.hookOptions(options), {
    trackClick: analyticsMocks.trackClick,
    trackView: vi.fn(),
    trackInteraction: analyticsMocks.trackInteraction,
    loading: false,
    error: null,
  }),
  createAnalyticsOptions: {
    books: (accountId: string, pageUsername?: string) => ({ accountId, pageUsername, pageName: "public-books" }),
    apps: analyticsMocks.appsOptions,
    products: analyticsMocks.productsOptions,
    people: analyticsMocks.peopleOptions,
  },
}));

vi.mock('../AppsAndTools/components/public/AppTopPicksHero', () => ({
  default: ({ apps, onAppClick }: any) => (
    <button onClick={() => onAppClick(apps[0])}>Open app card</button>
  ),
}));
vi.mock('../AppsAndTools/components/public/AppTopPicksMobileHero', () => ({ default: () => null }));
vi.mock('../AppsAndTools/components/public/AppCarouselRow', () => ({
  default: ({ onViewAll }: any) => <button onClick={onViewAll}>Open app list</button>,
}));
vi.mock('../AppsAndTools/components/public/AppDetailModal', () => ({ default: () => null }));

vi.mock('../Products/components/public/ProductTopPicksHero', () => ({
  default: ({ products, onProductClick }: any) => (
    <button onClick={() => onProductClick(products[0])}>Open product card</button>
  ),
}));
vi.mock('../Products/components/public/ProductTopPicksMobileHero', () => ({ default: () => null }));
vi.mock('../Products/components/public/ProductCarouselRow', () => ({
  default: ({ onViewAll }: any) => <button onClick={onViewAll}>Open product list</button>,
}));
vi.mock('../Products/components/public/ProductDetailModal', () => ({ default: () => null }));

vi.mock('../People/components/public/PersonTopPicksHero', () => ({
  default: ({ people, onPersonClick }: any) => (
    <button onClick={() => onPersonClick(people[0])}>Open person card</button>
  ),
}));
vi.mock('../People/components/public/PersonTopPicksMobileHero', () => ({ default: () => null }));
vi.mock('../People/components/public/PersonCarouselRow', () => ({
  default: ({ onViewAll }: any) => <button onClick={onViewAll}>Open people list</button>,
}));
vi.mock('../People/components/public/PersonDetailModal', () => ({ default: () => null }));
vi.mock('../../components/SEO', () => ({ default: () => null }));
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: any) => <>{children}</>,
  AdvancedMarker: ({ children }: any) => <>{children}</>,
  Map: ({ children }: any) => <>{children}</>,
  Pin: () => null,
  useApiIsLoaded: () => false,
  useMap: () => null,
}));

const mockUseQuery = vi.mocked(useQuery);

const records = {
  apps: {
    list: { documentId: 'app-list-1', List_Name: 'Daily tools', slug: 'daily-tools' },
    item: { documentId: 'app-1', title: 'Signal', is_pinned: true, pin_order: 1, app_list: null },
  },
  products: {
    list: { documentId: 'product-list-1', List_Name: 'Travel kit', slug: 'travel-kit' },
    item: { documentId: 'product-1', title: 'Daypack', brand: 'Acme', is_pinned: true, pin_order: 1, product_list: null },
  },
  people: {
    list: { documentId: 'person-list-1', List_Name: 'Creators', slug: 'creators' },
    item: { documentId: 'person-1', name: 'Ada', primary_platform: 'website', is_pinned: true, pin_order: 1, person_list: null, people_category: { Category_name: 'Creators' } },
  },
};

const nativeSectorTerm = {
  documentId: nativePeopleIds.sector,
  id: nativePeopleIds.sector,
  slug: 'creators',
  Category_name: 'Creators',
};
const nativePerson = {
  documentId: nativePeopleIds.person,
  title: 'Ada',
  full_name: 'Ada',
  username_handle: null,
  headline: null,
  location_text: null,
  avatar_url: null,
  platform: null,
  primary_platform: 'website',
  profile_url: null,
  social_urls: null,
  skills_tags: null,
  follower_count: null,
  user_recommendation_note: '',
  user_rating: null,
  is_pinned: true,
  pin_order: 1,
  display_order: 0,
  person_list: { documentId: nativePeopleIds.list, List_Name: 'Creators', slug: 'creators' },
  person_category: nativeSectorTerm,
  people_category: nativeSectorTerm,
};
const nativePeopleCategoryPayload = {
  personLists: [{
    documentId: nativePeopleIds.list,
    List_Name: 'Creators',
    slug: 'creators',
    recommended_people: [nativePerson],
    recommended_people_next_cursor: null,
  }],
};
const nativePeopleSectorPayload = {
  version: 'explorers-public-people-sector/v1',
  sector: { documentId: nativeSectorTerm.documentId, slug: nativeSectorTerm.slug, Category_name: nativeSectorTerm.Category_name },
  canonicalSlug: 'creators',
  redirectSlug: null,
  recommended_people: [nativePerson],
  nextCursor: null,
};

function installQueryResults(category: keyof typeof records) {
  const source = records[category];
  mockUseQuery.mockImplementation((query: any) => {
    const body = query?.loc?.source?.body || '';
    if (body.includes('AccountByUsername')) {
      return {
        data: {
          usersPermissionsUsers: [{
            username: 'tk2727',
            accounts: [{ documentId: 'account-1', Account_Name: 'TK' }],
          }],
        },
        loading: false,
      } as ReturnType<typeof useQuery>;
    }
    const relation = category === 'apps'
      ? 'recommended_apps'
      : category === 'products'
        ? 'recommended_products'
        : 'recommended_people';
    const root = category === 'apps'
      ? 'appLists'
      : category === 'products'
        ? 'productLists'
        : 'personLists';
    return {
      data: { [root]: [{ ...source.list, [relation]: [source.item] }] },
      loading: false,
    } as ReturnType<typeof useQuery>;
  });
  const relation = category === 'apps'
    ? 'recommended_apps'
    : category === 'products'
      ? 'recommended_products'
      : 'recommended_people';
  const root = category === 'apps'
    ? 'appLists'
    : category === 'products'
      ? 'productLists'
      : 'personLists';
  const data = { [root]: [{ ...source.list, [relation]: [source.item] }] };
  // Native consumers (PublicPeople, PublicPersonSector) read the gateway payloads; the
  // Apollo consumers (PublicPersonList and the apps/products pages) read the mock above.
  gatewayFixtures.categoryData = category === 'people' ? nativePeopleCategoryPayload : data;
  gatewayFixtures.detailData = data;
  gatewayFixtures.sectorData = category === 'people' ? nativePeopleSectorPayload : undefined;
}

function renderCategory(path: string, Component: React.ComponentType) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PublicHeaderDescriptorProvider username="tk2727" profileName="TK">
        <PublicProfileFixedHeader onTrackClick={analyticsMocks.trackClick} />
        <Routes>
          <Route path="/:username/:category" element={<Component />} />
          <Route path="/:username/:category/:slug" element={<div>List route</div>} />
        </Routes>
      </PublicHeaderDescriptorProvider>
    </MemoryRouter>,
  );
}

describe('public category analytics wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockReset();
    gatewayFixtures.loading = false;
    gatewayFixtures.categoryData = undefined;
    gatewayFixtures.detailData = undefined;
    gatewayFixtures.sectorData = undefined;
    class TestIntersectionObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = '';
      readonly thresholds = [];
      disconnect() {}
      observe() {}
      takeRecords() { return []; }
      unobserve() {}
    }
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: TestIntersectionObserver,
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
  });

  it.each([
    ['Places', '/tk2727/places', '/:username/places', PublicHome, 'places-header', {}],
    ['Guides', '/tk2727/guides', '/:username/guides', PublicGuides, 'guides-header', {}],
    ['guide detail', '/tk2727/guides/weekend-in-goa', '/:username/guides/:guideSlug', PublicGuideDetailPage, 'guides-header', {}],
    ['book subject', '/tk2727/books/subject/design', '/:username/books/subject/:subjectSlug', PublicBookSubject, 'books-subject-header', { subject: 'design' }],
    ['movie genre', '/tk2727/movies/genre/drama', '/:username/movies/genre/:genreSlug', PublicMovieGenre, 'movies-genre-header', { genre: 'drama' }],
  ] as const)('renders one shared banner for %s while route data is loading', (_label, path, routePath, Component, context, metadata) => {
    mockUseQuery.mockReturnValue({ data: undefined, loading: true } as ReturnType<typeof useQuery>);
    gatewayFixtures.loading = true;

    render(
      <MemoryRouter initialEntries={[path]}>
        <PublicHeaderDescriptorProvider username="tk2727" profileName="TK">
          <PublicProfileFixedHeader onTrackClick={analyticsMocks.trackClick} />
          <Routes>
            <Route path={routePath} element={<Component />} />
          </Routes>
        </PublicHeaderDescriptorProvider>
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Share' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    if (_label === 'book subject') expect(analyticsMocks.trackClick).not.toHaveBeenCalled();
    else expect(analyticsMocks.trackClick).toHaveBeenCalledWith('share-button', { context, ...metadata });
  });

  it.each([
    ['apps', PublicApps, 'Open app card', 'app-card', 'app-1', 'app-list-1', 'Open app list', 'app-list'],
    ['products', PublicProducts, 'Open product card', 'product-card', 'product-1', 'product-list-1', 'Open product list', 'product-list'],
    ['people', PublicPeople, 'Open person card', 'person-card', nativePeopleIds.person, nativePeopleIds.list, 'Open people list', 'person-list'],
  ] as const)(
    'tracks %s page item and list navigation with canonical ownership IDs',
    (category, Component, cardLabel, cardElement, itemId, listId, listLabel, listElement) => {
      installQueryResults(category);
      renderCategory(`/tk2727/${category}`, Component);

      expect(screen.getAllByRole('banner')).toHaveLength(1);

      fireEvent.click(screen.getByRole('button', { name: cardLabel }));
      expect(analyticsMocks.trackClick).toHaveBeenCalledWith(
        cardElement,
        expect.objectContaining({ id: itemId, listId }),
      );

      fireEvent.click(screen.getByRole('button', { name: listLabel }));
      expect(analyticsMocks.trackClick).toHaveBeenCalledWith(
        listElement,
        expect.objectContaining({ listId }),
      );
    },
  );

  it.each([
    ['apps', PublicAppList, 'Signal', 'app-card', 'app-1', 'app-list-1', analyticsMocks.appsOptions],
    ['products', PublicProductList, 'Daypack', 'product-card', 'product-1', 'product-list-1', analyticsMocks.productsOptions],
    ['people', PublicPersonList, 'Ada', 'person-card', 'person-1', 'person-list-1', analyticsMocks.peopleOptions],
  ] as const)(
    'tracks direct %s list views, item opens, and shares with canonical ownership IDs',
    async (category, Component, itemLabel, itemElement, itemId, listId, optionsSpy) => {
      installQueryResults(category);
      render(
        <MemoryRouter initialEntries={[`/tk2727/${category}/creators`]}>
          <PublicHeaderDescriptorProvider username="tk2727" profileName="TK">
            <PublicProfileFixedHeader onTrackClick={analyticsMocks.trackClick} />
            <Routes>
              <Route path="/:username/:category/:listSlug" element={<Component />} />
            </Routes>
          </PublicHeaderDescriptorProvider>
        </MemoryRouter>,
      );

      expect(screen.getAllByRole('banner')).toHaveLength(1);
      expect(optionsSpy).toHaveBeenLastCalledWith('account-1', 'tk2727', listId);
      fireEvent.click(screen.getByRole('button', { name: new RegExp(itemLabel, 'i') }));
      expect(analyticsMocks.trackClick).toHaveBeenCalledWith(
        itemElement,
        expect.objectContaining({ id: itemId, listId }),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Share' }));
      await waitFor(() =>
        expect(analyticsMocks.trackClick).toHaveBeenCalledWith(
          'share-button',
          expect.objectContaining({ context: `${category}-list-header`, listId }),
        ),
      );
    },
  );

  it('records a guide opened directly from a link as a guide open for that guide', async () => {
    mockUseQuery.mockReturnValue({ data: undefined, loading: false } as ReturnType<typeof useQuery>);
    gatewayFixtures.detailData = { guides: [{ documentId: 'guide-1', Title: 'Weekend in Goa', slug: 'weekend-in-goa', Guide_Type: 'Theme', guide_sections: [] }] };
    render(
      <MemoryRouter initialEntries={['/tk2727/guides/weekend-in-goa']}>
        <PublicHeaderDescriptorProvider username="tk2727" profileName="TK">
          <Routes>
            <Route path="/:username/guides/:guideSlug" element={<PublicGuideDetailPage />} />
          </Routes>
        </PublicHeaderDescriptorProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(analyticsMocks.trackInteraction).toHaveBeenCalledWith(
      'guide-open', expect.objectContaining({ listId: 'guide-1', title: 'Weekend in Goa', guideType: 'Theme' }),
    ));
    expect(analyticsMocks.hookOptions).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'account-1', pageName: 'public-guides', pageUsername: 'tk2727',
    }));
  });

  it('tracks direct people-sector views, item opens, and shares with the owning list ID', async () => {
    installQueryResults('people');
    render(
      <MemoryRouter initialEntries={['/tk2727/people/sector/creators']}>
        <PublicHeaderDescriptorProvider username="tk2727" profileName="TK">
          <PublicProfileFixedHeader onTrackClick={analyticsMocks.trackClick} />
          <Routes>
            <Route
              path="/:username/people/sector/:sectorSlug"
              element={<PublicPersonSector />}
            />
          </Routes>
        </PublicHeaderDescriptorProvider>
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(analyticsMocks.peopleOptions).toHaveBeenLastCalledWith(
      'account-1',
      'tk2727',
    );
    fireEvent.click(screen.getByRole('button', { name: /Ada/i }));
    expect(analyticsMocks.trackClick).toHaveBeenCalledWith(
      'person-card',
      expect.objectContaining({ id: nativePeopleIds.person, listId: nativePeopleIds.list }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() =>
      expect(analyticsMocks.trackClick).toHaveBeenCalledWith(
        'share-button',
        expect.objectContaining({ context: 'people-sector-header', sector: 'creators' }),
      ),
    );
  });
});
