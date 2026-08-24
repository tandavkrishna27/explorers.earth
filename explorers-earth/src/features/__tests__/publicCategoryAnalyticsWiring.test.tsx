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

const analyticsMocks = vi.hoisted(() => ({
  trackClick: vi.fn(),
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

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@apollo/client')>();
  return { ...actual, useQuery: vi.fn() };
});

vi.mock('../../services/analyticsService', () => ({
  useTrackAnalytics: () => ({
    trackClick: analyticsMocks.trackClick,
    trackView: vi.fn(),
    trackInteraction: vi.fn(),
    loading: false,
    error: null,
  }),
  createAnalyticsOptions: {
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
}

function renderCategory(path: string, Component: React.ComponentType) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/:username/:category" element={<Component />} />
        <Route path="/:username/:category/:slug" element={<div>List route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('public category analytics wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockReset();
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
  });

  it.each([
    ['apps', PublicApps, 'Open app card', 'app-card', 'app-1', 'app-list-1', 'Open app list', 'app-list'],
    ['products', PublicProducts, 'Open product card', 'product-card', 'product-1', 'product-list-1', 'Open product list', 'product-list'],
    ['people', PublicPeople, 'Open person card', 'person-card', 'person-1', 'person-list-1', 'Open people list', 'person-list'],
  ] as const)(
    'tracks %s page item and list navigation with canonical ownership IDs',
    (category, Component, cardLabel, cardElement, itemId, listId, listLabel, listElement) => {
      installQueryResults(category);
      renderCategory(`/tk2727/${category}`, Component);

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
          <Routes>
            <Route path="/:username/:category/:listSlug" element={<Component />} />
          </Routes>
        </MemoryRouter>,
      );

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

  it('tracks direct people-sector views, item opens, and shares with the owning list ID', async () => {
    installQueryResults('people');
    render(
      <MemoryRouter initialEntries={['/tk2727/people/sector/creators']}>
        <Routes>
          <Route
            path="/:username/people/sector/:sectorSlug"
            element={<PublicPersonSector />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(analyticsMocks.peopleOptions).toHaveBeenLastCalledWith(
      'account-1',
      'tk2727',
    );
    fireEvent.click(screen.getByRole('button', { name: /Ada/i }));
    expect(analyticsMocks.trackClick).toHaveBeenCalledWith(
      'person-card',
      expect.objectContaining({ id: 'person-1', listId: 'person-list-1' }),
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
