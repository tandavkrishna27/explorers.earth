import React from 'react';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginSurface, ordinaryCategories, surfaceHarness as renderSurface } from './surfaceHarness';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { canonicalAccountFixture } from '../../../test/canonicalAccountFixture';
import { explorersApiClient } from '../../../lib/explorersApiClient';

vi.mock('../../../lib/explorersApiClient', () => ({ explorersApiClient: { getMyProfile: vi.fn() } }));

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
import BookListView from '../../Books/components/dashboard/BookListView';
import MovieListView from '../../Movies/components/dashboard/MovieListView';
import { Route, Routes } from 'react-router-dom';
import { useCityStore } from '../../../store/useCityStore';
vi.mock('../../../hooks/useAIGuideQuota', () => ({ useAIGuideQuota: () => ({ shouldDisableGeneration: true, disableReason: 'Test', refetch: vi.fn() }) }));
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
const headers = [
  ['public_movie', MoviesHome], ['public_games', GamesHome], ['public_apps', AppsHome],
  ['public_products', ProductsHome], ['public_people', PeopleHome], ['public_guides', GuidesPage], ['public_recommendations', Favorites],
] as const;
const listFixture = { recommendationLists: [{ documentId: 'place-list', List_Name: 'My places', slug: 'places', Visibility: true, createdAt: '2026-01-01', recommended_places: [], List_Name_Details: {} }] };
const guideFixture = { documentId: 'g1', Title: 'Test guide', Visibility: true, guide_sections: [], Guide_Media: [], Guide_Tags: [], Number_Of_Days: 1 };
describe('ordinary category headers use verified navigation', () => {
  beforeEach(async () => { loginSurface(); await i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: english } } }); });
  afterEach(() => { cleanup(); useAuthStore.getState().logout(); vi.clearAllMocks(); });
  it.each(headers)('%s Off removes only the target saved pin and desktop/mobile share confirmed state', async (category, Component) => {
    const h = surfaceHarness(<Component />, { lists: listFixture, initial: { pinned_nav_tabs: ['public_profile', category, 'public_music'] } }); await h.ready();
    const switches = await screen.findAllByRole('checkbox');
    expect(switches[0]).toBeChecked(); fireEvent.click(switches[0]);
    await waitFor(() => expect(h.writes).toHaveLength(1));
    expect(h.writes[0].variables).toEqual({ documentId: 'a1', data: { [category]: 'No', pinned_nav_tabs: ['public_profile', 'public_music'] } });
    await waitFor(() => expect(screen.getAllByRole('checkbox')[0]).not.toBeChecked());
  });
  it.each(headers)('%s On only publishes after a fresh content check', async (category, Component) => {
    const h = surfaceHarness(<Component />, { lists: listFixture, initial: { [category]: 'No', pinned_nav_tabs: ['public_profile', 'public_music'] } }); await h.ready();
    fireEvent.click((await screen.findAllByRole('checkbox'))[0]);
    await waitFor(() => expect(h.writes).toHaveLength(1));
    expect(h.writes[0].variables).toEqual({ documentId: 'a1', data: { [category]: 'Yes' } });
  });
  it.each(headers)('%s empty list refresh never changes category visibility or saved pins', async (category, Component) => {
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
      { documentId: 'a1', data: { [category]: 'No', pinned_nav_tabs: ['public_profile', 'public_music'] } },
      { documentId: 'a1', data: { [category]: 'Yes' } },
    ]);
  });
  it.each(headers)('%s failed list refresh has no category side effects', async (_category, Component) => {
    const h = surfaceHarness(<Component />, { lists: listFixture }); await h.ready(); h.failLists = true;
    await act(async () => { await h.client.refetchQueries({ include: 'active' }).catch(() => {}); });
    expect(h.writes).toEqual([]);
  });
  it.each([
    ['public_recommendations', Favorites, 'justCreatedList'], ['public_apps', AppsHome, 'justCreatedList'], ['public_guides', GuidesPage, 'justCreatedGuide'],
  ] as const)('%s existing creation prompt captures publication origin', async (category, Component, stateKey) => {
    const h = surfaceHarness(<Component />, { initial: { [category]: 'No' }, lists: listFixture, route: { pathname: '/', state: { [stateKey]: true } } }); await h.ready();
    const confirm = await screen.findByRole('button', { name: 'Yes, Make Public' }); expect(confirm).toBeEnabled(); fireEvent.click(confirm);
    await waitFor(() => expect(h.writes).toHaveLength(1));
    expect(h.writes[0].variables).toEqual({ documentId: 'a1', data: { [category]: 'Yes' } });
  });
  it('GuideDetails existing creation prompt publishes only Guides', async () => {
    const h = surfaceHarness(<Routes><Route path="/guides/:guideId" element={<GuideDetailsPage />} /></Routes>, { initial: { public_guides: 'No' }, lists: { guide: guideFixture }, route: { pathname: '/guides/g1', state: { justCreatedGuide: true } } }); await h.ready();
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, Make Public' }));
    await waitFor(() => expect(h.writes).toHaveLength(1));
    expect(h.writes[0].variables).toEqual({ documentId: 'a1', data: { public_guides: 'Yes' } });
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
    const h = surfaceHarness(<GuideHeader guide={guideFixture as any} guideId="g1" />, { respond: (name, variables) => name === 'UpdateGuide' ? { updateGuide: { ...guideFixture, ...variables.data } } : undefined }); await h.ready();
    fireEvent.click(screen.getByRole('checkbox')); await screen.findByText('Draft');
    await waitFor(() => expect(h.requests.some(r => r.name === 'UpdateGuide')).toBe(true));
    expect(h.requests.find(r => r.name === 'UpdateGuide')?.variables).toEqual({ documentId: 'g1', data: { Visibility: false } }); expect(h.writes).toEqual([]);
  });
  it.each([['movies', MovieListView, 'movieLists', 'DeleteMovieList']] as const)('%s list delete never unpublishes the category or changes saved pins', async (kind, Component, listField, operation) => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fixture = { documentId: 'list-1', List_Name: 'Test list', visibility: true, slug: 'list', recommended_books: [], recommended_movies: [] };
    const h = surfaceHarness(<Routes><Route path="/list/:listId" element={<Component />} /><Route path="*" element={<div>Returned to lists</div>} /></Routes>, { route: '/list/list-1', lists: { [listField]: [fixture] }, respond: name => name === operation ? { [kind === 'books' ? 'deleteBookList' : 'deleteMovieList']: { documentId: 'list-1' } } : undefined }); await h.ready();
    fireEvent.click(await screen.findByRole('button', { name: /^manage$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));
    if (kind === 'movies') fireEvent.click(screen.getAllByRole('button', { name: /^Delete$/i }).at(-1)!);
    await waitFor(() => expect(h.requests.some(r => r.name === operation)).toBe(true)); expect(h.writes).toEqual([]);
    expect(h.requests.find(r => r.name === operation)?.variables).toEqual({ documentId: 'list-1' });
  });
  it('Favorites per-list Visibility never changes category visibility or saved pins', async () => {
    const list = { ...listFixture.recommendationLists[0], recommended_places: [{ documentId: 'p1' }] };
    useCityStore.setState({ selectedCity: list });
    const h = surfaceHarness(<Favorites />, { lists: { recommendationLists: [list] } }); await h.ready();
    fireEvent.click((await screen.findAllByText('My places'))[0]);
    const control = await waitFor(() => { const node = document.querySelector('[data-walkthrough="togglePublish"] input'); if (!node) throw new Error('Waiting for list details'); return node; });
    fireEvent.click(control);
    await waitFor(() => expect(h.requests.some(r => r.variables.documentId === 'place-list' && r.variables.data?.Visibility === false)).toBe(true));
    expect(h.writes).toEqual([]);
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
    expect(h.writes[0].variables).toEqual({ documentId: 'a1', data: { [category]: 'No', pinned_nav_tabs: ['public_profile', 'public_music'] } });
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
    expect(h.writes[0].variables).toEqual({ documentId: 'a1', data: { [category]: 'Yes' } });
  });
  it('explicit Manual mode changes only mode and preserves the stored manual array', async () => {
    const h = surfaceHarness(<Settings />, { initial: { auto_pinning: true } }); await h.ready();
    fireEvent.click(screen.getByRole('button', { name: /Pinned Navigation Tabs/ }));
    expect(screen.getByRole('checkbox', { name: 'Pin Books Tab' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Auto-pin navigation tabs' }));
    await waitFor(() => expect(h.writes).toHaveLength(1));
    expect(h.writes[0].variables).toEqual({ documentId: 'a1', data: { auto_pinning: false } });
    expect(h.saved.pinned_nav_tabs).toEqual(['public_profile', 'public_music', 'public_books']);
  });
  it.each([null, []])('fresh manual saved pins %j stay unwritten until an explicit Pin', async pins => {
    const h = surfaceHarness(<Settings />, { initial: { pinned_nav_tabs: pins } }); await h.ready();
    fireEvent.click(screen.getByRole('button', { name: /Pinned Navigation Tabs/ })); expect(h.writes).toEqual([]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pin Books Tab' }));
    await waitFor(() => expect(h.writes).toHaveLength(1));
    expect(h.writes[0].variables).toEqual({ documentId: 'a1', data: { pinned_nav_tabs: ['public_profile', 'public_books'] } });
  });
  it('does not allow a new hidden Music pin', async () => {
    const h = surfaceHarness(<Settings />, { initial: { public_music: 'No', pinned_nav_tabs: ['public_profile'] } }); await h.ready();
    fireEvent.click(screen.getByRole('button', { name: /Pinned Navigation Tabs/ }));
    expect(screen.getByRole('checkbox', { name: 'Pin Music Tab' })).toBeDisabled();
  });
  it('ranks navigation using the verified account even while the separate Settings details query is pending', async () => {
    const h = surfaceHarness(<Settings />, { initial: { documentId: 'verified-account' }, respond: name => name === 'SettingsAccount' ? new Promise(() => {}) : undefined }); await h.ready();
    await waitFor(() => expect(h.requests.find(r => r.name === 'PublicCategoryListCounts')?.variables).toEqual({ accountDocumentId: 'verified-account' }));
  });
});
