import React from 'react';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginSurface, ordinaryCategories, surfaceHarness as renderSurface } from './surfaceHarness';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { canonicalAccountFixture } from '../../../test/canonicalAccountFixture';
import { explorersApiClient, type CompleteMyCategoryContent, type CollectionObservation } from '../../../lib/explorersApiClient';
import { invalidateGames } from '../../Games/hooks/useGamesOwner';
import { invalidateApps } from '../../AppsAndTools/hooks/useAppsOwner';
import { invalidateProducts } from '../../Products/hooks/useProductsOwner';
import { invalidatePeople } from '../../People/hooks/usePeopleOwner';
import { invalidateMovies } from '../../Movies/api/explorersAdapter';

vi.mock('../../../lib/explorersApiClient', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../lib/explorersApiClient')>();
  return { ...actual,
    // These observations enter at the native API boundary. The real owner hook,
    // complete-read coordination and view models still run; transport branding
    // is covered by the API client's own contract tests.
    assertCompleteMyCategoryContent: vi.fn(),
    explorersApiClient: { ...actual.explorersApiClient, getMyProfile: vi.fn(),
      getCompleteMyCategoryContent: vi.fn(), getCompleteMyCategoryTopPicks: vi.fn(), getMyEditableCollection: vi.fn(), archiveMyCollection: vi.fn(), updateMyCollection: vi.fn() },
  };
});

function gameObservation(title?: string): CompleteMyCategoryContent { const observed = movieObservation(title); return { ...observed, category: 'games', collections: observed.collections.map(list => ({ ...list, category: 'games' })) }; }
function appObservation(title?: string): CompleteMyCategoryContent { const observed = movieObservation(title); return { ...observed, category: 'apps', collections: observed.collections.map(list => ({ ...list, category: 'apps' })) }; }
function productObservation(title?: string): CompleteMyCategoryContent { const observed = movieObservation(title); return { ...observed, category: 'products', collections: observed.collections.map(list => ({ ...list, category: 'products' })) }; }
function personObservation(title?: string): CompleteMyCategoryContent { const observed = movieObservation(title); return { ...observed, category: 'people', collections: observed.collections.map(list => ({ ...list, category: 'people' })) }; }
// Ticket 5.1. Favorites reads its Places lists natively, so this surface needs a places
// observation rather than the Strapi recommendationLists query.
const PLACE_LIST_ID = '00000000-0000-4000-8000-0000000000f1';
function placeObservation(title?: string): CompleteMyCategoryContent { const observed = movieObservation(title); return { ...observed, category: 'places', collections: observed.collections.map(list => ({ ...list, category: 'places', id: PLACE_LIST_ID, slug: 'places' })) }; }

function movieObservation(title?: string): CompleteMyCategoryContent {
  const current = useAuthStore.getState();
  return { complete: true, category: 'movies', status: 'active', accountId: current.accountId!, generation: current.generation,
    revision: '1', snapshotToken: 'native-navigation-fixture', expiresAt: Date.now() + 60_000, pinRevision: 0,
    collections: title ? [{ id: 'list-1', accountId: current.accountId!, category: 'movies', title, description: null,
      heading: null, slug: 'list', visibility: 'public', publicationState: 'published', coverMediaId: null,
      displayOrder: 0, revision: 1, archived: false }] : [], recommendations: [], memberships: [], topPicks: [] };
}

function surfaceHarness(child: React.ReactNode, options: Parameters<typeof renderSurface>[1] = {}) {
  vi.mocked(explorersApiClient.getMyProfile).mockResolvedValue(canonicalAccountFixture());
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderSurface(<QueryClientProvider client={client}>{child}</QueryClientProvider>, options);
}
import useAuthStore from '../../../store/store';
import BooksHome from '../../Books/components/dashboard/BooksHome';
import MoviesHome from '../../Movies/components/dashboard/MoviesHome';
import GamesHome from '../../Games/components/dashboard/GamesHome';
import AppsHome from '../../AppsAndTools/components/dashboard/AppsHome';
import ProductsHome from '../../Products/components/dashboard/ProductsHome';
import PeopleHome from '../../People/components/dashboard/PeopleHome';
import GuidesPage from '../../Guides/GuidesPage';
import Favorites from '../../../pages/Favorites';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import english from '../../../i18n/resources/en.json';
import Settings from '../../Settings/Settings';
import GuideDetailsPage from '../../Guides/pages/GuideDetailsPage';
import GuideHeader from '../../Guides/components/GuideDetails/GuideHeader';
import { GuideEditingProvider } from '../../Guides/context/GuideEditingProvider';
import BookListView from '../../Books/components/dashboard/BookListView';
import MovieListView from '../../Movies/components/dashboard/MovieListView';
import { Route, Routes } from 'react-router-dom';
import { useCityStore } from '../../../store/useCityStore';
vi.mock('../../Favorites/components/Recommendations', () => ({ default: () => null }));
vi.mock('../../Settings/components/ProfileAccountSettings', () => ({ default: () => null }));
vi.mock('../../Settings/components/BillingTab', () => ({ default: () => null }));
vi.mock('../../Settings/components/LanguageSelector', () => ({ default: () => null, LANGUAGES: [{ code: 'en', name: 'English' }] }));
vi.mock('../../music/publicMusicClient', () => ({ publicMusicClient: { discover: vi.fn().mockRejectedValue(new Error('offline')) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// These integrations are unrelated to publication: map/location creation,
// guided tours, and SEO require browser APIs or external services.
vi.mock('../../../hooks/useRecommendationsWalkthrough', () => ({ useRecommendationsWalkthrough: () => ({ steps: [], run: false, stepIndex: 0, handleJoyrideCallback: vi.fn(), advanceToNextStep: vi.fn() }) }));
vi.mock('../../../components/SEO', () => ({ default: () => null }));
vi.mock('react-joyride', () => ({ default: () => null }));
vi.mock('../../Favorites/hooks/useCreateLocation', () => ({ useCreateLocation: () => ({ handleLocationSubmit: vi.fn(), accountData: {} }) }));

// Canonical writes include all nine preference rows. Compare the full payload,
// including unchanged visibility and pin ranks, rather than a legacy partial patch.
function canonicalWrite(category?: string, isPublic?: boolean, pins = ['public_profile', 'public_music'], expectedRevision = 1) {
  const fields = ['public_recommendations','public_music','public_guides','public_movie','public_books','public_games','public_apps','public_products','public_people'];
  const categories = ['places','music','guides','movies','books','games','apps','products','people'];
  return { input: { expectedRevision, categories: categories.map((name, displayOrder) => ({
    category: name, displayOrder, isPublic: fields[displayOrder] === category ? isPublic : true,
    pinnedOrder: pins.includes(fields[displayOrder]) ? pins.indexOf(fields[displayOrder]) - 1 : null,
  })) } };
}

const headers = [
  ['public_movie', MoviesHome], ['public_games', GamesHome], ['public_apps', AppsHome],
  ['public_products', ProductsHome], ['public_people', PeopleHome], ['public_guides', GuidesPage], ['public_recommendations', Favorites],
] as const;
const listFixture = { recommendationLists: [{ documentId: PLACE_LIST_ID, List_Name: 'My places', slug: 'places', Visibility: true, createdAt: '2026-01-01', recommended_places: [], List_Name_Details: {} }] };
const guideFixture = { documentId: 'g1', Title: 'Test guide', Visibility: true, guide_sections: [], Guide_Media: [], Guide_Tags: [], Number_Of_Days: 1 };
// Ticket 5.3. Guides reads its owner content through its own bracketed adapter, so the
// harness's Apollo transport no longer answers for it. The adapter is mocked at its
// boundary - the same thing the adapter's own suite does - because a fixture cannot join
// the API client's private observation brand, and refusing an unbranded observation is
// the point of that brand.
const guideListObservation = { detail: { ...guideFixture, category: 'guides', revision: 1, categoryRevision: '1', pinOrder: null } } as never;
const guideAggregateObservation = {
  accountId: 'account-1', generation: 0, observedAt: 0, collectionId: 'g1', revision: 1,
  aggregate: { collectionId: 'g1', revision: 1, coverMediaId: null, sections: [], sectionCount: 0, nextCursor: null,
    details: { guideType: null, multiCity: false, numberOfDays: 1, estimatedBudget: null, budgetCurrency: null,
      budgetType: null, bestTimeToVisit: [], categories: [], tags: [], tipsNotes: null, place: {}, locationEntityId: null } },
} as never;
vi.mock('../../Guides/api/explorersAdapter', () => ({
  readGuidesOwnerContent: vi.fn(async () => ({
    observation: { complete: true, category: 'guides', revision: '1', pinRevision: null, collections: [], recommendations: [], memberships: [], topPicks: [] },
    guides: [guideFixture],
    lists: new Map([['g1', guideListObservation]]),
    aggregates: new Map([['g1', guideAggregateObservation]]),
  })),
}));
describe('ordinary category headers use verified navigation', () => {
  beforeEach(async () => { loginSurface();
    // Each surface reads its own category, so the complete read answers per category
    // rather than handing every surface the same one.
    vi.mocked(explorersApiClient.getCompleteMyCategoryContent).mockImplementation(async input =>
      input.category === 'places' ? placeObservation('My places') : gameObservation());
    // The real editable read runs against the harness's own transport, so the
    // observations the commands receive carry the client's private brand. A fixture
    // cannot join that brand, and refusing an unbranded observation is the point of it.
    const real = await vi.importActual<typeof import('../../../lib/explorersApiClient')>('../../../lib/explorersApiClient');
    vi.mocked(explorersApiClient.getMyEditableCollection).mockImplementation(real.explorersApiClient.getMyEditableCollection);
    vi.mocked(explorersApiClient.updateMyCollection).mockImplementation(async (observed, patch) => ({ ...(observed as { detail: Record<string, unknown> }).detail, ...patch }) as never);
    vi.mocked(explorersApiClient.getCompleteMyCategoryTopPicks).mockResolvedValue(movieObservation()); await i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: english } } }); });
  afterEach(() => { cleanup(); useAuthStore.getState().logout(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
  it.each(headers)('%s Off removes only the target saved pin and desktop/mobile share confirmed state', async (category, Component) => {
    const h = surfaceHarness(<Component />, { lists: listFixture, initial: { pinned_nav_tabs: ['public_profile', category, 'public_music'] } }); await h.ready();
    const switches = await screen.findAllByRole('checkbox');
    expect(switches[0]).toBeChecked(); fireEvent.click(switches[0]);
    await waitFor(() => expect(h.writes).toHaveLength(1));
    expect(h.writes[0].variables).toEqual(canonicalWrite(category, false));
    await waitFor(() => expect(screen.getAllByRole('checkbox')[0]).not.toBeChecked());
  });
  it.each(headers)('%s On only publishes after a fresh content check', async (category, Component) => {
    const h = surfaceHarness(<Component />, { lists: listFixture, initial: { [category]: 'No', pinned_nav_tabs: ['public_profile', 'public_music'] } }); await h.ready();
    fireEvent.click((await screen.findAllByRole('checkbox'))[0]);
    await waitFor(() => expect(h.writes).toHaveLength(1));
    expect(h.writes[0].variables).toEqual(canonicalWrite(category, true));
  });
  // This case drives an Apollo observable query and refetches it, so a category is removed
  // from it as that category stops having one. Movies, Games, Apps, Products, People and
  // Places went first; public_guides joins them with ticket 5.3. Only public_books is left,
  // so once Books migrates this case has no subject and should go rather than be kept
  // passing vacuously - the rule it protects (a list refresh never changes category
  // visibility or saved pins) is asserted per category in their own suites.
  it.each(headers.filter(([category]) => category !== 'public_movie' && category !== 'public_games' && category !== 'public_apps' && category !== 'public_products' && category !== 'public_people' && category !== 'public_recommendations' && category !== 'public_guides'))('%s empty list refresh never changes category visibility or saved pins', async (category, Component) => {
    const listFields = { public_books: 'bookLists', public_movie: 'movieLists', public_games: 'gameLists', public_apps: 'appLists', public_products: 'productLists', public_people: 'personLists', public_guides: 'guides', public_recommendations: 'recommendationLists' };
    const field = listFields[category];
    const lists: Record<string, unknown> = { [field]: [{ ...listFixture.recommendationLists[0], ...guideFixture,
      List_Name: 'Before refresh', Title: 'Before refresh', recommended_books: [], recommended_movies: [], recommended_games: [], recommended_apps: [], recommended_products: [], recommended_people: [] }] };
    const h = surfaceHarness(<Component />, { lists, initial: { pinned_nav_tabs: ['public_profile', category, 'public_music'] } }); await h.ready();
    const listQuery = await waitFor(() => {
      const query = [...h.client.getObservableQueries().values()].find(query => Array.isArray(query.getCurrentResult().data?.[field]));
      expect(query?.getCurrentResult().data[field]).toHaveLength(1);
      return query!;
    });
    expect((await screen.findAllByText('Before refresh')).length).toBeGreaterThan(0);
    const requestsBefore = h.requests.filter(request => request.name === listQuery.queryName).length;
    lists[field] = [];
    await act(async () => { const result = await listQuery.refetch(); expect(result.data[field]).toEqual([]); });
    expect(h.requests.filter(request => request.name === listQuery.queryName)).toHaveLength(requestsBefore + 1);
    expect(listQuery.getCurrentResult().loading).toBe(false);
    expect(listQuery.getCurrentResult().data[field]).toEqual([]);
    await waitFor(() => expect(screen.queryByText('Before refresh')).not.toBeInTheDocument());
    expect(h.writes).toEqual([]);
    expect(h.navigation.snapshot?.visibility[category]).toBe('Yes');
    expect(h.navigation.snapshot?.savedPins).toEqual(['public_profile', category, 'public_music']);
  });
  it('public_movie native empty list refresh never changes category visibility or saved pins', async () => {
    const read = vi.mocked(explorersApiClient.getCompleteMyCategoryTopPicks);
    read.mockResolvedValue(movieObservation('Before refresh'));
    const h = surfaceHarness(<MoviesHome />, { initial: { pinned_nav_tabs: ['public_profile', 'public_movie', 'public_music'] } });
    await h.ready();
    expect((await screen.findAllByText('Before refresh')).length).toBeGreaterThan(0);
    const readsBefore = read.mock.calls.length;
    read.mockResolvedValue(movieObservation());
    act(() => invalidateMovies());
    await waitFor(() => expect(screen.queryByText('Before refresh')).not.toBeInTheDocument());
    await waitFor(() => expect(read).toHaveBeenCalledTimes(readsBefore + 2));
    expect(read).toHaveBeenLastCalledWith({ category: 'movies', status: 'active' }, expect.any(AbortSignal));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(h.requests.some(request => request.name === 'MovieListsByAccount')).toBe(false);
    expect(h.writes).toEqual([]);
    expect(h.navigation.snapshot?.visibility.public_movie).toBe('Yes');
    expect(h.navigation.snapshot?.savedPins).toEqual(['public_profile', 'public_movie', 'public_music']);
  });
  it('public_games native empty list refresh never changes category visibility or saved pins', async () => {
    const read = vi.mocked(explorersApiClient.getCompleteMyCategoryContent);
    read.mockResolvedValue(gameObservation('Before refresh'));
    const h = surfaceHarness(<GamesHome />, { initial: { pinned_nav_tabs: ['public_profile', 'public_games', 'public_music'] } });
    await h.ready();
    expect((await screen.findAllByText('Before refresh')).length).toBeGreaterThan(0);
    const readsBefore = read.mock.calls.length;
    read.mockResolvedValue(gameObservation());
    act(() => invalidateGames());
    await waitFor(() => expect(screen.queryByText('Before refresh')).not.toBeInTheDocument());
    await waitFor(() => expect(read).toHaveBeenCalledTimes(readsBefore + 2));
    expect(read).toHaveBeenLastCalledWith({ category: 'games', status: 'active' }, expect.any(AbortSignal), true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(h.requests.some(request => request.name === 'GameListsByAccount')).toBe(false);
    expect(h.writes).toEqual([]);
    expect(h.navigation.snapshot?.visibility.public_games).toBe('Yes');
    expect(h.navigation.snapshot?.savedPins).toEqual(['public_profile', 'public_games', 'public_music']);
  });
  it('public_apps native empty list refresh never changes category visibility or saved pins', async () => {
    const read = vi.mocked(explorersApiClient.getCompleteMyCategoryContent);
    read.mockResolvedValue(appObservation('Before refresh'));
    const h = surfaceHarness(<AppsHome />, { initial: { pinned_nav_tabs: ['public_profile', 'public_apps', 'public_music'] } });
    await h.ready();
    expect((await screen.findAllByText('Before refresh')).length).toBeGreaterThan(0);
    const readsBefore = read.mock.calls.length;
    read.mockResolvedValue(appObservation());
    act(() => invalidateApps());
    await waitFor(() => expect(screen.queryByText('Before refresh')).not.toBeInTheDocument());
    await waitFor(() => expect(read).toHaveBeenCalledTimes(readsBefore + 2));
    expect(read).toHaveBeenLastCalledWith({ category: 'apps', status: 'active' }, expect.any(AbortSignal), true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(h.requests.some(request => request.name === 'AppListsByAccount')).toBe(false);
    expect(h.writes).toEqual([]);
    expect(h.navigation.snapshot?.visibility.public_apps).toBe('Yes');
    expect(h.navigation.snapshot?.savedPins).toEqual(['public_profile', 'public_apps', 'public_music']);
  });
  it('public_products native empty list refresh never changes category visibility or saved pins', async () => {
    const read = vi.mocked(explorersApiClient.getCompleteMyCategoryContent);
    read.mockResolvedValue(productObservation('Before refresh'));
    const h = surfaceHarness(<ProductsHome />, { initial: { pinned_nav_tabs: ['public_profile', 'public_products', 'public_music'] } });
    await h.ready();
    expect((await screen.findAllByText('Before refresh')).length).toBeGreaterThan(0);
    const readsBefore = read.mock.calls.length;
    read.mockResolvedValue(productObservation());
    act(() => invalidateProducts());
    await waitFor(() => expect(screen.queryByText('Before refresh')).not.toBeInTheDocument());
    await waitFor(() => expect(read).toHaveBeenCalledTimes(readsBefore + 2));
    expect(read).toHaveBeenLastCalledWith({ category: 'products', status: 'active' }, expect.any(AbortSignal), true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(h.requests.some(request => request.name === 'ProductListsByAccount')).toBe(false);
    expect(h.writes).toEqual([]);
    expect(h.navigation.snapshot?.visibility.public_products).toBe('Yes');
    expect(h.navigation.snapshot?.savedPins).toEqual(['public_profile', 'public_products', 'public_music']);
  });
  it('public_people native empty list refresh never changes category visibility or saved pins', async () => {
    const read = vi.mocked(explorersApiClient.getCompleteMyCategoryContent);
    read.mockResolvedValue(personObservation('Before refresh'));
    const h = surfaceHarness(<PeopleHome />, { initial: { pinned_nav_tabs: ['public_profile', 'public_people', 'public_music'] } });
    await h.ready();
    expect((await screen.findAllByText('Before refresh')).length).toBeGreaterThan(0);
    const readsBefore = read.mock.calls.length;
    read.mockResolvedValue(personObservation());
    act(() => invalidatePeople());
    await waitFor(() => expect(screen.queryByText('Before refresh')).not.toBeInTheDocument());
    await waitFor(() => expect(read).toHaveBeenCalledTimes(readsBefore + 2));
    expect(read).toHaveBeenLastCalledWith({ category: 'people', status: 'active' }, expect.any(AbortSignal), true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(h.requests.some(request => request.name === 'PersonListsByAccount')).toBe(false);
    expect(h.writes).toEqual([]);
    expect(h.navigation.snapshot?.visibility.public_people).toBe('Yes');
    expect(h.navigation.snapshot?.savedPins).toEqual(['public_profile', 'public_people', 'public_music']);
  });
  it.each(headers)('%s uses the verified selected account, not incomplete accounts[0]', async (_category, Component) => {
    const h = surfaceHarness(<Component />, { incompleteFirst: true, lists: listFixture }); await h.ready();
    expect((await screen.findAllByRole('checkbox'))[0]).toBeChecked();
  });
  it.each(headers)('%s disables both header controls while a verified save is pending', async (category, Component) => {
    const h = surfaceHarness(<Component />, { lists: listFixture }); await h.ready();
    let release!: () => void; h.pauseMutation(new Promise(resolve => { release = resolve; }));
    fireEvent.click(h.container.querySelector('button.border-l')!);
    const controls = await screen.findAllByRole('checkbox'); fireEvent.click(controls[0]);
    await waitFor(() => expect(controls[0]).toBeDisabled()); expect(controls[1]).toBeDisabled();
    expect(controls[0]).toBeChecked();
    await act(async () => { release(); }); await waitFor(() => expect(h.navigation.busy).toBe(false));
    expect(h.saved[category]).toBe('No');
  });
  it.each(headers)('%s mobile visibility explicitly turns Off and On without restoring its pin', async (category, Component) => {
    const h = surfaceHarness(<Component />, { lists: listFixture, initial: { pinned_nav_tabs: ['public_profile', category, 'public_music'] } }); await h.ready();
    fireEvent.click(h.container.querySelector('button.border-l')!);
    fireEvent.click(screen.getAllByRole('checkbox')[1]); await waitFor(() => expect(h.navigation.busy).toBe(false));
    await waitFor(() => expect(screen.getAllByRole('checkbox')[1]).not.toBeChecked());
    fireEvent.click(screen.getAllByRole('checkbox')[1]); await waitFor(() => expect(screen.getAllByRole('checkbox')[1]).toBeChecked());
    expect(h.writes.map(r => r.variables)).toEqual([
      canonicalWrite(category, false),
      canonicalWrite(category, true, ['public_profile', 'public_music'], 2),
    ]);
  });
  it.each(headers.filter(([category]) => category !== 'public_movie' && category !== 'public_games' && category !== 'public_apps' && category !== 'public_products' && category !== 'public_people'))('%s failed list refresh has no category side effects', async (_category, Component) => {
    const h = surfaceHarness(<Component />, { lists: listFixture }); await h.ready(); h.failLists = true;
    await act(async () => { await h.client.refetchQueries({ include: 'active' }).catch(() => {}); });
    expect(h.writes).toEqual([]);
  });
  it('public_movie failed native refresh has no category side effects', async () => {
    const h = surfaceHarness(<MoviesHome />, { initial: { pinned_nav_tabs: ['public_profile', 'public_movie', 'public_music'] } });
    await h.ready();
    await waitFor(() => expect(explorersApiClient.getCompleteMyCategoryTopPicks).toHaveBeenCalledTimes(2));
    vi.mocked(explorersApiClient.getCompleteMyCategoryTopPicks).mockRejectedValue(new Error('Native lists unavailable'));
    act(() => invalidateMovies());
    expect(await screen.findByRole('alert')).toHaveTextContent('Movies could not be loaded');
    expect(h.writes).toEqual([]);
    expect(h.navigation.snapshot?.visibility.public_movie).toBe('Yes');
    expect(h.navigation.snapshot?.savedPins).toEqual(['public_profile', 'public_movie', 'public_music']);
  });
  it('public_people failed native refresh has no category side effects', async () => {
    vi.mocked(explorersApiClient.getCompleteMyCategoryContent).mockResolvedValue(personObservation());
    const h = surfaceHarness(<PeopleHome />, { initial: { pinned_nav_tabs: ['public_profile', 'public_people', 'public_music'] } });
    await h.ready();
    await waitFor(() => expect(explorersApiClient.getCompleteMyCategoryContent).toHaveBeenCalledTimes(2));
    vi.mocked(explorersApiClient.getCompleteMyCategoryContent).mockRejectedValue(new Error('Native lists unavailable'));
    act(() => invalidatePeople());
    expect(await screen.findByRole('alert')).toHaveTextContent('People could not be loaded');
    expect(h.writes).toEqual([]);
    expect(h.navigation.snapshot?.visibility.public_people).toBe('Yes');
    expect(h.navigation.snapshot?.savedPins).toEqual(['public_profile', 'public_people', 'public_music']);
  });
  it('public_products failed native refresh has no category side effects', async () => {
    vi.mocked(explorersApiClient.getCompleteMyCategoryContent).mockResolvedValue(productObservation());
    const h = surfaceHarness(<ProductsHome />, { initial: { pinned_nav_tabs: ['public_profile', 'public_products', 'public_music'] } });
    await h.ready();
    await waitFor(() => expect(explorersApiClient.getCompleteMyCategoryContent).toHaveBeenCalledTimes(2));
    vi.mocked(explorersApiClient.getCompleteMyCategoryContent).mockRejectedValue(new Error('Native lists unavailable'));
    act(() => invalidateProducts());
    expect(await screen.findByRole('alert')).toHaveTextContent('Products could not be loaded');
    expect(h.writes).toEqual([]);
    expect(h.navigation.snapshot?.visibility.public_products).toBe('Yes');
    expect(h.navigation.snapshot?.savedPins).toEqual(['public_profile', 'public_products', 'public_music']);
  });
  it('public_apps failed native refresh has no category side effects', async () => {
    vi.mocked(explorersApiClient.getCompleteMyCategoryContent).mockResolvedValue(appObservation());
    const h = surfaceHarness(<AppsHome />, { initial: { pinned_nav_tabs: ['public_profile', 'public_apps', 'public_music'] } });
    await h.ready();
    await waitFor(() => expect(explorersApiClient.getCompleteMyCategoryContent).toHaveBeenCalledTimes(2));
    vi.mocked(explorersApiClient.getCompleteMyCategoryContent).mockRejectedValue(new Error('Native lists unavailable'));
    act(() => invalidateApps());
    expect(await screen.findByRole('alert')).toHaveTextContent('Apps could not be loaded');
    expect(h.writes).toEqual([]);
    expect(h.navigation.snapshot?.visibility.public_apps).toBe('Yes');
    expect(h.navigation.snapshot?.savedPins).toEqual(['public_profile', 'public_apps', 'public_music']);
  });
  it('public_games failed native refresh has no category side effects', async () => {
    const h = surfaceHarness(<GamesHome />, { initial: { pinned_nav_tabs: ['public_profile', 'public_games', 'public_music'] } });
    await h.ready();
    await waitFor(() => expect(explorersApiClient.getCompleteMyCategoryContent).toHaveBeenCalledTimes(2));
    vi.mocked(explorersApiClient.getCompleteMyCategoryContent).mockRejectedValue(new Error('Native lists unavailable'));
    act(() => invalidateGames());
    expect(await screen.findByRole('alert')).toHaveTextContent('Games could not be loaded');
    expect(h.writes).toEqual([]);
    expect(h.navigation.snapshot?.visibility.public_games).toBe('Yes');
    expect(h.navigation.snapshot?.savedPins).toEqual(['public_profile', 'public_games', 'public_music']);
  });
  it.each([
    ['public_recommendations', Favorites, 'justCreatedList'], ['public_apps', AppsHome, 'justCreatedList'], ['public_guides', GuidesPage, 'justCreatedGuide'],
  ] as const)('%s existing creation prompt captures publication origin', async (category, Component, stateKey) => {
    const h = surfaceHarness(<Component />, { initial: { [category]: 'No' }, lists: listFixture, route: { pathname: '/', state: { [stateKey]: true } } }); await h.ready();
    const confirm = await screen.findByRole('button', { name: 'Yes, Make Public' }); expect(confirm).toBeEnabled(); fireEvent.click(confirm);
    await waitFor(() => expect(h.writes).toHaveLength(1));
    expect(h.writes[0].variables).toEqual(canonicalWrite(category, true, ['public_profile', 'public_music', 'public_books']));
  });
  it('GuideDetails existing creation prompt publishes only Guides', async () => {
    const h = surfaceHarness(<Routes><Route path="/guides/:guideId" element={<GuideDetailsPage />} /></Routes>, { initial: { public_guides: 'No' }, lists: { guide: guideFixture }, route: { pathname: '/guides/g1', state: { justCreatedGuide: true } } }); await h.ready();
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, Make Public' }));
    await waitFor(() => expect(h.writes).toHaveLength(1));
    expect(h.writes[0].variables).toEqual(canonicalWrite('public_guides', true, ['public_profile', 'public_music', 'public_books']));
  });
  it.each(['switch', 'switch-back', 'logout-login'])('GuideDetails prompt retains its origin through %s', async transition => {
    const h = surfaceHarness(<Routes><Route path="/guides/:guideId" element={<GuideDetailsPage />} /></Routes>, { initial: { public_guides: 'No' }, lists: { guide: guideFixture }, route: { pathname: '/guides/g1', state: { justCreatedGuide: true } } }); await h.ready();
    await screen.findByRole('button', { name: 'Yes, Make Public' });
    await act(async () => { if (transition === 'logout-login') useAuthStore.getState().logout(); else loginSurface('u2'); if (transition !== 'switch') loginSurface(); }); await h.ready();
    const confirm = screen.getByRole('button', { name: 'Yes, Make Public' }); expect(confirm).toBeDisabled(); fireEvent.click(confirm); expect(h.writes).toEqual([]);
  });
  it.each([
    ['public_recommendations', Favorites, 'justCreatedList', 'UsersPermissionsUser'],
    ['public_apps', AppsHome, 'justCreatedList', 'MyAccountForApps'],
    ['public_guides', GuidesPage, 'justCreatedGuide', 'GetUserAccount'],
  ] as const)('%s creation prompt uses verified origin even while the legacy account query is pending', async (category, Component, stateKey, query) => {
    const h = surfaceHarness(<Component />, { initial: { [category]: 'No' }, route: { pathname: '/', state: { [stateKey]: true } }, respond: name => name === query ? new Promise(() => {}) : undefined }); await h.ready();
    expect(await screen.findByRole('button', { name: 'Yes, Make Public' })).toBeEnabled(); expect(h.writes).toEqual([]);
  });
  it.each([
    ['public_recommendations', Favorites, 'justCreatedList'], ['public_apps', AppsHome, 'justCreatedList'], ['public_guides', GuidesPage, 'justCreatedGuide'],
  ].flatMap(([category, Component, stateKey]) => ['switch', 'switch-back', 'logout-login'].map(transition => ({ category: category as string, Component: Component as React.ComponentType, stateKey: stateKey as string, transition }))))('$category open prompt never rebinds after $transition', async ({ category, Component, stateKey, transition }) => {
    const h = surfaceHarness(<Component />, { initial: { [category]: 'No' }, lists: listFixture, route: { pathname: '/', state: { [stateKey]: true } } }); await h.ready();
    await screen.findByRole('button', { name: 'Yes, Make Public' });
    await act(async () => { if (transition === 'logout-login') useAuthStore.getState().logout(); else loginSurface('u2'); if (transition !== 'switch') loginSurface(); }); await h.ready();
    const confirm = screen.getByRole('button', { name: 'Yes, Make Public' }); expect(confirm).toBeDisabled(); fireEvent.click(confirm); expect(h.writes).toEqual([]);
  });
  it('GuideHeader Draft changes only the guide, never category visibility or saved pins', async () => {
    vi.mocked(explorersApiClient.updateMyCollection).mockResolvedValue({ ...guideFixture, visibility: 'private' } as never);
    const h = surfaceHarness(
      <GuideEditingProvider observation={guideAggregateObservation} list={guideListObservation} reload={() => {}}>
        <GuideHeader guide={guideFixture as any} guideId="g1" />
      </GuideEditingProvider>,
    ); await h.ready();
    fireEvent.click(screen.getByRole('checkbox')); await screen.findByText('Draft');
    // Unpublishing is one collection command. It does NOT clear the pin here: the server
    // does that in the same transaction, which is why no second write appears.
    await waitFor(() => expect(vi.mocked(explorersApiClient.updateMyCollection)).toHaveBeenCalled());
    expect(vi.mocked(explorersApiClient.updateMyCollection).mock.calls[0][1]).toEqual({ visibility: 'private', publicationState: 'draft' });
    expect(h.writes).toEqual([]);
  });
  it('movies native list archive never unpublishes the category or changes saved pins', async () => {
    const observation = movieObservation('Test list');
    const observed = { complete: true, detail: observation.collections[0] } as CollectionObservation;
    vi.mocked(explorersApiClient.getCompleteMyCategoryTopPicks).mockResolvedValue(observation);
    vi.mocked(explorersApiClient.getMyEditableCollection).mockResolvedValue(observed);
    vi.mocked(explorersApiClient.archiveMyCollection).mockResolvedValue({ ...observed.detail, archived: true });
    const h = surfaceHarness(<Routes><Route path="/list/:listId" element={<MovieListView />} /><Route path="*" element={<div>Returned to lists</div>} /></Routes>, { route: '/list/list-1', initial: { pinned_nav_tabs: ['public_profile', 'public_movie', 'public_music'] } }); await h.ready();
    fireEvent.click(await screen.findByRole('button', { name: /^manage$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Archive list$/i }));
    expect(explorersApiClient.archiveMyCollection).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: /^Archive list$/i }).at(-1)!);
    await screen.findByText('Returned to lists');
    expect(explorersApiClient.getMyEditableCollection).toHaveBeenCalledWith('list-1');
    expect(explorersApiClient.archiveMyCollection).toHaveBeenCalledExactlyOnceWith(observed, expect.any(String));
    expect(h.requests.some(request => request.name === 'DeleteMovieList')).toBe(false);
    expect(h.writes).toEqual([]);
    expect(h.navigation.snapshot?.visibility.public_movie).toBe('Yes');
    expect(h.navigation.snapshot?.savedPins).toEqual(['public_profile', 'public_movie', 'public_music']);
  });
  it('Favorites per-list Visibility never changes category visibility or saved pins', async () => {
    const list = { ...listFixture.recommendationLists[0], recommended_places: [{ documentId: 'p1' }] };
    useCityStore.setState({ selectedCity: list });
    const update = vi.mocked(explorersApiClient.updateMyCollection);
    update.mockResolvedValue({ id: 'place-list', revision: 2 } as never);
    const h = surfaceHarness(<Favorites />, { lists: { recommendationLists: [list] } }); await h.ready();
    fireEvent.click((await screen.findAllByText('My places'))[0]);
    const control = await waitFor(() => { const node = document.querySelector('[data-walkthrough="togglePublish"] input'); if (!node) throw new Error('Waiting for list details'); return node; });
    fireEvent.click(control);
    // Taking one list out of public view is a list command, not an account write.
    await waitFor(() => expect(update.mock.calls.some(call => (call[0] as { resourceId: string }).resourceId === PLACE_LIST_ID
      && (call[1] as { visibility?: string }).visibility === 'private')).toBe(true));
    expect(h.writes).toEqual([]);
    expect(h.navigation.snapshot?.visibility.public_recommendations).toBe('Yes');
  });
});
describe('Settings verified ordinary publication', () => {
  beforeEach(async () => { loginSurface(); await i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: english } } }); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 }))); });
  afterEach(() => { cleanup(); useAuthStore.getState().logout(); vi.unstubAllGlobals(); });
  it.each(ordinaryCategories)('%s Off uses target-only saved-pin cleanup', async category => {
    const h = surfaceHarness(<Settings />, { initial: { pinned_nav_tabs: ['public_profile', category, 'public_music'] } }); await h.ready();
    fireEvent.click(screen.getByRole('button', { name: /Public Visibility/ }));
    const categories = ['public_profile', 'public_recommendations', 'public_guides', 'public_movie', 'public_books', 'public_games', 'public_apps', 'public_products', 'public_people'];
    fireEvent.click(screen.getAllByRole('checkbox')[categories.indexOf(category)]);
    await screen.findByRole('dialog');
    expect(h.writes).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: /^Unpublish / }));
    await waitFor(() => expect(h.writes).toHaveLength(1));
    expect(h.writes[0].variables).toEqual(canonicalWrite(category, false));
  });
  it.each(ordinaryCategories)('%s cancelling unpublish preserves visibility and saved pins', async category => {
    const pins = ['public_profile', category, 'public_music'];
    const h = surfaceHarness(<Settings />, { initial: { pinned_nav_tabs: pins } }); await h.ready();
    fireEvent.click(screen.getByRole('button', { name: /Public Visibility/ }));
    const categories = ['public_profile', 'public_recommendations', 'public_guides', 'public_movie', 'public_books', 'public_games', 'public_apps', 'public_products', 'public_people'];
    const control = screen.getAllByRole('checkbox')[categories.indexOf(category)];
    fireEvent.click(control);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(control).toBeChecked();
    expect(h.writes).toEqual([]);
    expect(h.saved.pinned_nav_tabs).toEqual(pins);
  });
  it.each(ordinaryCategories)('%s On writes only visibility and hidden Pin cannot publish it', async category => {
    const labels: Record<string, string> = { public_recommendations: 'Places', public_movie: 'Movies & Shows', public_books: 'Books', public_games: 'Games', public_apps: 'Apps & Tools', public_products: 'Products', public_people: 'People', public_guides: 'Guides' };
    const h = surfaceHarness(<Settings />, { initial: { [category]: 'No', pinned_nav_tabs: ['public_profile', 'public_music'] } }); await h.ready();
    fireEvent.click(screen.getByRole('button', { name: /Pinned Navigation Tabs/ }));
    const pin = screen.getByRole('checkbox', { name: `Pin ${labels[category]} Tab` }); expect(pin).toBeDisabled(); fireEvent.click(pin); expect(h.writes).toEqual([]);
    await waitFor(() => expect(h.navigation.busy).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /Public Visibility/ }));
    const categories = ['public_profile', 'public_recommendations', 'public_guides', 'public_movie', 'public_books', 'public_games', 'public_apps', 'public_products', 'public_people'];
    fireEvent.click(screen.getAllByRole('checkbox')[categories.indexOf(category)]);
    await waitFor(() => expect(h.writes).toHaveLength(1));
    expect(h.writes[0].variables).toEqual(canonicalWrite(category, true));
  });
  it('explicit Manual mode changes only mode and preserves the stored manual array', async () => {
    const h = surfaceHarness(<Settings />, { initial: { auto_pinning: true } }); await h.ready();
    fireEvent.click(screen.getByRole('button', { name: /Pinned Navigation Tabs/ }));
    expect(screen.getByRole('checkbox', { name: 'Pin Books Tab' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Auto-pin navigation tabs' }));
    await waitFor(() => expect(h.writes).toHaveLength(1));
    expect(h.writes[0].variables).toEqual({ input: { expectedRevision: 1, autoPinning: false } });
    expect(h.saved.pinned_nav_tabs).toEqual(['public_profile', 'public_music', 'public_books']);
  });
  it.each([null, []])('fresh manual saved pins %j stay unwritten until an explicit Pin', async pins => {
    const h = surfaceHarness(<Settings />, { initial: { pinned_nav_tabs: pins } }); await h.ready();
    fireEvent.click(screen.getByRole('button', { name: /Pinned Navigation Tabs/ })); expect(h.writes).toEqual([]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pin Books Tab' }));
    await waitFor(() => expect(h.writes).toHaveLength(1));
    expect(h.writes[0].variables).toEqual(canonicalWrite(undefined, undefined, ['public_profile', 'public_books']));
  });
  it('does not allow a new hidden Music pin', async () => {
    const h = surfaceHarness(<Settings />, { initial: { public_music: 'No', pinned_nav_tabs: ['public_profile'] } }); await h.ready();
    fireEvent.click(screen.getByRole('button', { name: /Pinned Navigation Tabs/ }));
    expect(screen.getByRole('checkbox', { name: 'Pin Music Tab' })).toBeDisabled();
  });
  it('uses canonical navigation without either redundant Settings GraphQL operation', async () => {
    const h = surfaceHarness(<Settings />, { initial: { documentId: 'verified-account' }, respond: name => name === 'SettingsAccount' ? new Promise(() => {}) : undefined }); await h.ready();
    await waitFor(() => expect(h.navigation.content).toBeDefined());
    expect(h.requests.filter(r => ['SettingsAccount','PublicCategoryListCounts'].includes(r.name))).toEqual([]);
    expect(h.navigation.snapshot?.scope.accountDocumentId).toBe('11111111-1111-4111-8111-111111111111');
  });
});
