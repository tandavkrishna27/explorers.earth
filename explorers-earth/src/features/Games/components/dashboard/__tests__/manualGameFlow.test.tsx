import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useGamesListAdapter } from '../../../../shared/list/adapters/games';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing';
import AddGamePage from '../AddGamePage';
import GameListView from '../GameListView';
import { toast } from 'sonner';
import { GamesClient } from '../../../api/gamesClient';
import useAuthStore from '../../../../../store/store';
import { ExplorersApiError } from '../../../../../lib/explorersApiClient';

const fixture = vi.hoisted(() => ({ content: { view: { lists: [] }, details: new Map(), observation: {} }, loading: false, error: undefined as Error | undefined, refetch: vi.fn() }));
vi.mock('../../../hooks/useGamesOwner', () => ({ useGamesOwner: () => ({ content: fixture.content, data: { gameLists: fixture.content.view.lists }, loading: fixture.loading, error: fixture.error, refetch: fixture.refetch }), invalidateGames: vi.fn() }));
vi.mock('../../../api/gamesClient', () => ({ GamesClient: { observeCollection: vi.fn(), prepareManualIntent: vi.fn(), createManual: vi.fn(), upload: vi.fn(), importCover: vi.fn(), search: vi.fn(), updateRecommendation: vi.fn(), observeRecommendation: vi.fn(), updateCollection: vi.fn(), createCollection: vi.fn(), readCompleteOwner: vi.fn(), setTopPicks: vi.fn() } }));
vi.mock('../../../../Favorites/components/TiptapEditor', () => ({ default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <textarea aria-label="Note" value={value} onChange={event => onChange(event.target.value)} /> }));
vi.mock('../../../../../lib/curatedTaxonomy', async importOriginal => ({ ...(await importOriginal<object>()), useCuratedCatalog: () => ({ terms: [], unconfigured: true, loading: false, error: null }) }));
vi.mock('sonner',() => ({ toast: { success: vi.fn(), error: vi.fn() } }));
function mount() { return render(<MockedProvider><MemoryRouter initialEntries={['/games/list-1/add']}><Routes><Route path="/games/:listId/add" element={<AddGamePage />} /><Route path="/recommendations/games/:listId" element={<p>Saved list</p>} /></Routes></MemoryRouter></MockedProvider>); }
function openManual() { fireEvent.click(screen.getByRole('button', { name: "Can't find it? Add manually" })); }
function searchFor(text: string) { const box = screen.getByPlaceholderText('Search for a game...'); fireEvent.change(box, { target: { value: text } }); fireEvent.keyDown(box, { key: 'Enter' }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
describe('native manual Games', () => {
 beforeEach(() => { vi.clearAllMocks(); fixture.loading = false; fixture.error = undefined; fixture.content.view.lists = []; fixture.content.details.clear(); useAuthStore.getState().login({ id: 'u1', documentId: 'u1', username: 'owner', token: 'fixture' }); useAuthStore.setState({ accountId: 'a1' }); vi.mocked(GamesClient.observeCollection).mockResolvedValue({ detail: { id: 'list-1' } } as never); vi.mocked(GamesClient.prepareManualIntent).mockImplementation((parent, draft) => ({ parent, draft, entityKey: 'entity-key', recommendationKey: 'recommendation-key' })); vi.mocked(GamesClient.createManual).mockResolvedValue({ id: 'game-1' } as never); });
 afterEach(() => { cleanup(); useAuthStore.getState().logout(); });
 it('creates a native manual title/rating/note without fabricating a provider ID', async () => {
  mount(); openManual(); fireEvent.change(await screen.findByLabelText('Game title'), { target: { value: 'Manual adventure' } }); fireEvent.keyDown(screen.getByRole('slider', { name: 'Your rating' }), { key: 'End' }); fireEvent.change(screen.getByLabelText('Note'), { target: { value: '<p>A personal note</p>' } }); fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Saved list'); expect(GamesClient.prepareManualIntent).toHaveBeenCalledWith(expect.anything(), { title: 'Manual adventure', note: { version: 1, format: 'quill-html', html: '<p>A personal note</p>' }, userRating: 10, mediaIds: [], releaseYear: null, platforms: [], genres: [], developer: null }); expect(GamesClient.createManual).toHaveBeenCalledTimes(1); expect(GamesClient.search).not.toHaveBeenCalled();
 });
 it('waits for actual uploaded media readiness before saving', async () => {
  const upload = deferred<{ id: string }>(); vi.mocked(GamesClient.upload).mockReturnValue(upload.promise as never); mount(); openManual(); fireEvent.change(await screen.findByLabelText('Game title'), { target: { value: 'Uploaded game' } }); fireEvent.change(screen.getByLabelText('Snapshots'), { target: { files: [new File(['bytes'], 'snapshot.png', { type: 'image/png' })] } }); expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled(); expect(GamesClient.createManual).not.toHaveBeenCalled(); await act(async () => upload.resolve({ id: 'media-1' })); await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()); fireEvent.click(screen.getByRole('button', { name: 'Save' })); await screen.findByText('Saved list'); expect(GamesClient.prepareManualIntent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mediaIds: ['media-1'] }));
 });
 it('saves uploaded snapshots in the order the owner arranged them', async () => {
  let next = 0; vi.mocked(GamesClient.upload).mockImplementation(async () => ({ id: `shot-${++next}` }) as never);
  const { container } = mount(); openManual(); fireEvent.change(await screen.findByLabelText('Game title'), { target: { value: 'Ordered game' } });
  fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' }), new File(['c'], 'c.png', { type: 'image/png' })] } });
  await waitFor(() => expect(screen.getAllByAltText('Game snapshot')).toHaveLength(3));
  fireEvent.click(screen.getByRole('button', { name: 'Move Snapshot 3 up' })); fireEvent.click(screen.getByRole('button', { name: 'Move Snapshot 2 up' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' })); await screen.findByText('Saved list');
  expect(vi.mocked(GamesClient.prepareManualIntent).mock.calls[0][1]).toMatchObject({ mediaIds: ['shot-3', 'shot-1', 'shot-2'] });
 });
 it('retains the same manual command intent on an explicit network retry', async () => {
  vi.mocked(GamesClient.createManual).mockRejectedValueOnce(new Error('Temporarily unavailable')).mockResolvedValueOnce({ id: 'game-1' } as never); mount(); openManual(); fireEvent.change(await screen.findByLabelText('Game title'), { target: { value: 'Retained draft' } }); fireEvent.click(screen.getByRole('button', { name: 'Save' })); await screen.findByRole('alert'); expect(screen.getByLabelText('Game title')).toHaveValue('Retained draft'); fireEvent.click(screen.getByRole('button', { name: 'Save' })); await screen.findByText('Saved list'); expect(GamesClient.prepareManualIntent).toHaveBeenCalledTimes(1); expect(vi.mocked(GamesClient.createManual).mock.calls[0][0]).toBe(vi.mocked(GamesClient.createManual).mock.calls[1][0]);
 });
 it('provider unavailable response preserves the manual draft without provider identity', async () => {
  vi.mocked(GamesClient.search).mockRejectedValue(new Error('Provider unavailable'));
  mount(); openManual(); fireEvent.change(await screen.findByLabelText('Game title'), { target: { value: 'My manual draft' } }); fireEvent.click(screen.getByRole('button', { name: '‹ Back to search' })); searchFor('Provider query');
  expect(await screen.findByRole('alert')).toHaveTextContent("Search isn't working right now"); openManual(); expect(screen.getByLabelText('Game title')).toHaveValue('My manual draft'); expect(GamesClient.prepareManualIntent).not.toHaveBeenCalled();
 });
 it('search lists IGDB candidates and picking one fills the title, keeping the rest of the draft', async () => {
  vi.mocked(GamesClient.search).mockResolvedValue({ version: 'explorers-game-candidates/v1', nextCursor: null, items: [
   { externalId: '7346', title: 'The Legend of Zelda: Breath of the Wild', year: 2017, coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co3p2d.jpg', platforms: ['Wii U', 'Nintendo Switch'], genres: ['Adventure'] },
   { externalId: '233', title: 'Zelda fan game', year: null, coverUrl: null, platforms: [], genres: [] }] } as never);
  mount(); openManual(); fireEvent.keyDown(screen.getByRole('slider', { name: 'Your rating' }), { key: 'End' }); fireEvent.click(screen.getByRole('button', { name: '‹ Back to search' })); searchFor('zelda');
  expect(GamesClient.search).toHaveBeenCalledWith({ query: 'zelda', limit: 24 }, expect.any(AbortSignal));
  expect(await screen.findByText('2017 · Wii U · Nintendo Switch')).toBeInTheDocument();
  expect(screen.getByRole('option', { name: /Zelda fan game/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('option', { name: /Breath of the Wild/ }));
  expect(screen.getByLabelText('Game title')).toHaveValue('The Legend of Zelda: Breath of the Wild'); expect(screen.getByRole('slider', { name: 'Your rating' })).toHaveAttribute('aria-valuenow', '10');
 });
 it('picking a hit imports its IGDB cover as the first snapshot and saves it with the game (GMS-X01)', async () => {
  vi.mocked(GamesClient.search).mockResolvedValue({ version: 'explorers-game-candidates/v1', nextCursor: null, items: [
   { externalId: '26226', title: 'Celeste', year: 2018, coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co3byy.jpg', platforms: ['PC (Microsoft Windows)'], genres: ['Platform'] }] } as never);
  vi.mocked(GamesClient.importCover).mockResolvedValue({ id: 'cover-1', url: '/api/explorers/v1/media/cover-1/content' } as never);
  vi.mocked(GamesClient.prepareManualIntent).mockReturnValue({} as never); vi.mocked(GamesClient.createManual).mockResolvedValue({ id: 'game-1' } as never);
  mount(); searchFor('celeste');
  fireEvent.click(await screen.findByRole('option', { name: /Celeste/ }));
  await waitFor(() => expect(GamesClient.importCover).toHaveBeenCalledWith('co3byy'));
  expect(screen.getByLabelText('Release year')).toHaveValue(2018); expect(screen.getByRole('button', { name: 'PC (Microsoft Windows)' })).toHaveAttribute('aria-pressed', 'true'); expect(screen.getByRole('button', { name: 'PC' })).toHaveAttribute('aria-pressed', 'false'); expect(screen.getByLabelText('Genres')).toHaveValue('Platform');
  expect(await screen.findByAltText('Game snapshot')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Saved list');
  expect(GamesClient.prepareManualIntent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ title: 'Celeste', mediaIds: ['cover-1'], releaseYear: 2018, platforms: ['PC (Microsoft Windows)'], genres: ['Platform'] }));
 });
 it('saves typed year, platforms and genres for a manual game, trimming blanks', async () => {
  vi.mocked(GamesClient.prepareManualIntent).mockReturnValue({} as never); vi.mocked(GamesClient.createManual).mockResolvedValue({ id: 'game-1' } as never);
  mount(); openManual(); fireEvent.change(await screen.findByLabelText('Game title'), { target: { value: 'Home-made' } });
  fireEvent.change(screen.getByLabelText('Release year'), { target: { value: '1999' } }); fireEvent.click(screen.getByRole('button', { name: 'PC' })); fireEvent.change(screen.getByLabelText('Other platform'), { target: { value: ' Amiga ' } }); fireEvent.keyDown(screen.getByLabelText('Other platform'), { key: 'Enter' }); expect(screen.getByRole('button', { name: 'Amiga' })).toHaveAttribute('aria-pressed', 'true'); fireEvent.change(screen.getByLabelText('Genres'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' })); await screen.findByText('Saved list');
  expect(GamesClient.prepareManualIntent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ title: 'Home-made', releaseYear: 1999, platforms: ['PC', 'Amiga'], genres: [] }));
 });
 it('says search is not available when the deployment has no IGDB credentials', async () => {
  vi.mocked(GamesClient.search).mockRejectedValue(new ExplorersApiError(503, 'PROVIDER_NOT_CONFIGURED', 'Game search is not available. Add the game manually.'));
  mount(); searchFor('zelda');
  expect(await screen.findByRole('status')).toHaveTextContent('Game search is not available yet. Add the game manually.');
 });
 it('offers platform chips in Add manually, with Switch toggling on and off', async () => {
  mount(); openManual();
  for (const platform of ['PC', 'PlayStation 5', 'Xbox Series X|S', 'Nintendo Switch']) expect(await screen.findByRole('button', { name: platform })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.queryByRole('textbox', { name: 'Platforms' })).toBeNull();
  const chip = screen.getByRole('button', { name: 'Nintendo Switch' }); fireEvent.click(chip); expect(chip).toHaveAttribute('aria-pressed', 'true'); fireEvent.click(chip); expect(chip).toHaveAttribute('aria-pressed', 'false');
 });
 it('retries a search the API answers PROVIDER_BUSY instead of showing the failure (UAT: Hades + Enter)', async () => {
  vi.mocked(GamesClient.search).mockRejectedValueOnce(new ExplorersApiError(429, 'PROVIDER_BUSY', 'Games provider is busy')).mockResolvedValue({ version: 'explorers-game-candidates/v1', nextCursor: null, items: [
   { externalId: '113112', title: 'Hades', year: 2020, coverUrl: null, platforms: ['PC (Microsoft Windows)'], genres: ['Indie'], developer: 'Supergiant Games' }] } as never);
  mount(); searchFor('hades');
  expect(await screen.findByRole('option', { name: /Hades/ }, { timeout: 3000 })).toBeInTheDocument();
  expect(screen.queryByText(/Search isn't working/)).toBeNull(); expect(GamesClient.search).toHaveBeenCalledTimes(2);
 });
 it('shows no leftover existing-game picker under the search box', () => {
  mount();
  expect(screen.queryByText(/Existing game/i)).toBeNull(); expect(screen.queryByRole('button', { name: /Add existing game/i })).toBeNull();
 });
 it('account replacement while parent observation is pending cannot create a game', async () => {
  const parent = deferred<never>(); vi.mocked(GamesClient.observeCollection).mockReturnValue(parent.promise); mount(); openManual(); fireEvent.change(await screen.findByLabelText('Game title'), { target: { value: 'Old owner draft' } }); fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  act(() => useAuthStore.getState().logout()); await act(async () => parent.resolve({ detail: { id: 'list-1' } } as never));
  expect(GamesClient.prepareManualIntent).not.toHaveBeenCalled(); expect(GamesClient.createManual).not.toHaveBeenCalled(); expect(screen.queryByDisplayValue('Old owner draft')).toBeNull();
 });

 it('retains an oversized note and presents validation failure without dispatching a save', async () => {
  mount(); openManual(); fireEvent.change(await screen.findByLabelText('Game title'), { target: { value: 'My invalid draft' } }); const note = '<p>' + 'a'.repeat(256 * 1024) + '</p>'; fireEvent.change(screen.getByLabelText('Note'), { target: { value: note } }); fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Rich note exceeds byte limit'); expect(screen.getByLabelText('Note')).toHaveValue(note); expect(GamesClient.observeCollection).not.toHaveBeenCalled(); expect(GamesClient.createManual).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
 });
 // LP-04: per-item publication is gone from the list page. The list's own publish pill changes
 // only the collection; it never writes a recommendation's publication state.
 it('list publication goes through the list pill and never writes a recommendation', async () => {
  const game = { documentId: 'game-a', title: 'Manual game', user_rating: null, user_recommendation_note: '', cover_url: null, genres: null, platforms: null, is_pinned: false, game_list: { documentId: 'list-1', List_Name: 'Published list' } };
  fixture.content.view.lists = [{ documentId: 'list-1', List_Name: 'Published list', slug: 'published', Visibility: true, recommended_games: [game], account: { documentId: 'a1', username: 'owner' } }] as never;
  const observed = { detail: { id: 'list-1', revision: 1 } }; vi.mocked(GamesClient.observeCollection).mockResolvedValue(observed as never); vi.mocked(GamesClient.updateCollection).mockResolvedValue({} as never);
  render(<MockedProvider><MemoryRouter initialEntries={['/recommendations/games/list-1']}><Routes><Route path="/recommendations/games/:listId" element={<GameListView />} /></Routes></MemoryRouter></MockedProvider>);
  expect(screen.queryByRole('button', { name: 'Publish Manual game' })).toBeNull(); expect(screen.queryByText(/Recommendation is/)).toBeNull();
  fireEvent.click(document.querySelector('[aria-haspopup="menu"]')!); fireEvent.click(screen.getByRole('menuitemradio', { name: /draft/i }));
  await waitFor(() => expect(GamesClient.updateCollection).toHaveBeenCalledWith(observed, { visibility: 'private', publicationState: 'draft' }, expect.any(String), expect.any(AbortSignal))); expect(GamesClient.updateRecommendation).not.toHaveBeenCalled();
 });
 it('permits changing the selected ancestry of an existing pick at the category cap', async () => {
  const selected = { documentId: 'game-a', title: 'Same game', user_rating: null, user_recommendation_note: '', is_pinned: false, game_list: { documentId: 'list-1', List_Name: 'Chosen list' } };
  const picks = Array.from({ length: 15 }, (_, index) => ({ recommendationId: index === 0 ? 'game-a' : 'game-' + index, collectionId: 'other-list' })); const otherRows = picks.map((pin, index) => ({ ...selected, documentId: pin.recommendationId, title: 'Pinned ' + index, is_pinned: true, pin_order: index, game_list: { documentId: 'other-list', List_Name: 'Other list' } }));
  fixture.content.view.lists = [{ documentId: 'list-1', List_Name: 'Chosen list', slug: 'chosen', Visibility: false, recommended_games: [selected], account: { documentId: 'a1', username: 'owner' } }, { documentId: 'other-list', List_Name: 'Other list', slug: 'other', Visibility: false, recommended_games: otherRows }] as never;
  fixture.content.details.set('game-a', { detail: { id: 'game-a', publicationState: 'draft' } }); const complete = { revision: '8', topPicks: picks, memberships: [{ recommendationId: 'game-a', collectionId: 'list-1', collectionArchived: false, recommendationArchived: false }] }; vi.mocked(GamesClient.readCompleteOwner).mockResolvedValue(complete as never); vi.mocked(GamesClient.setTopPicks).mockResolvedValue({} as never);
  render(<MockedProvider><MemoryRouter initialEntries={['/recommendations/games/list-1']}><Routes><Route path="/recommendations/games/:listId" element={<GameListView />} /></Routes></MemoryRouter></MockedProvider>);
  fireEvent.click(screen.getByRole('button', { name: /^Pin .* to Top Picks$/, pressed: false })); await waitFor(() => expect(GamesClient.setTopPicks).toHaveBeenCalledOnce()); const submitted = vi.mocked(GamesClient.setTopPicks).mock.calls[0][1]; expect(submitted).toHaveLength(15); expect(submitted).toEqual([...picks.slice(1), { recommendationId: 'game-a', collectionId: 'list-1' }]);
 });
});

 describe('Games list caller abandonment', () => {
  beforeEach(() => { vi.clearAllMocks(); fixture.loading = false; fixture.error = undefined; useAuthStore.getState().login({ id: 'u1', documentId: 'u1', username: 'owner', token: 'fixture' }); useAuthStore.setState({ accountId: 'a1' }); });
  afterEach(cleanup);
  // Per-item publication is gone (LP-04); the same abandonment guarantee now protects the list
  // publication command the page's pill drives.
  it.each(['logout', 'unmount'])('does not write or report list publication after %s abandons an observation', async kind => {
   const game = { documentId: 'game-a', title: 'Manual game', user_recommendation_note: '', is_pinned: false, game_list: { documentId: 'list-1', List_Name: 'Published list' } };
   fixture.content.view.lists = [{ documentId: 'list-1', List_Name: 'Published list', Visibility: true, recommended_games: [game], account: { documentId: 'a1', username: 'owner' } }] as never;
   const pending = deferred<never>(); vi.mocked(GamesClient.observeCollection).mockReturnValue(pending.promise);
   const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter initialEntries={['/recommendations/games/list-1']}>{children}</MemoryRouter>;
   const view = renderHook(() => useGamesListAdapter('list-1'), { wrapper });
   let result!: Promise<void>; act(() => { result = view.result.current.setStatus('draft'); }); const rejection = expect(result).rejects.toThrow('owner or route changed');
   if (kind === 'unmount') view.unmount(); else act(() => useAuthStore.getState().logout());
   await act(async () => pending.resolve({ detail: { id: 'list-1', revision: 1 } } as never)); await rejection;
   expect(GamesClient.updateCollection).not.toHaveBeenCalled(); expect(toast.error).not.toHaveBeenCalled(); expect(toast.success).not.toHaveBeenCalled();
  });
 });

 it('keeps the manual Save control in the sticky action bar (ADD-02)', async () => {
  mount(); openManual(); const save = await screen.findByRole('button', { name: 'Save' });
  expect(screen.getByRole('toolbar')).toContainElement(save); expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Game title'), { target: { value: 'Reachable mobile game' } }); expect(save).toBeEnabled();
 });

 describe('manual edit hydration readiness', () => {
  afterEach(cleanup);
  function editElement() { return <MockedProvider><MemoryRouter initialEntries={['/games/list-1/edit/game-a']}><Routes><Route path="/games/:listId/edit/:gameId" element={<AddGamePage />} /></Routes></MemoryRouter></MockedProvider>; }
  function loaded(title = 'Original title') {
   const game = { documentId: 'game-a', title, user_recommendation_note: '<p>Original note</p>', user_rating: 8, Media: [] };
   fixture.content.view.lists = [{ documentId: 'list-1', recommended_games: [game] }] as never;
   fixture.content.details.set('game-a', { detail: { id: 'game-a', revision: 1 } });
   fixture.content = { ...fixture.content }; fixture.loading = false; fixture.error = undefined;
  }
  beforeEach(() => { vi.clearAllMocks(); fixture.content = { view: { lists: [] }, details: new Map(), observation: {} }; fixture.loading = false; fixture.error = undefined; useAuthStore.getState().login({ id: 'u1', documentId: 'u1', username: 'owner', token: 'fixture' }); useAuthStore.setState({ accountId: 'a1' }); });
  it('waits for actual full owner hydration instead of exposing blank editable controls', async () => {
   fixture.loading = true; const view = render(editElement());
   expect(screen.getByRole('status')).toHaveTextContent('Loading game'); expect(screen.queryByLabelText('Game title')).not.toBeInTheDocument(); expect(GamesClient.updateRecommendation).not.toHaveBeenCalled();
   loaded(); view.rerender(editElement()); expect(await screen.findByLabelText('Game title')).toHaveValue('Original title'); expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
  it('presents a current owner read failure and invokes explicit manual retry only', async () => {
   fixture.error = new Error('Owner temporarily unavailable'); const view = render(editElement());
   expect(screen.getByRole('alert')).toHaveTextContent('Owner temporarily unavailable'); expect(screen.queryByLabelText('Game title')).not.toBeInTheDocument(); expect(fixture.refetch).not.toHaveBeenCalled();
   fireEvent.click(screen.getByRole('button', { name: 'Retry loading game' })); expect(fixture.refetch).toHaveBeenCalledTimes(1);
   loaded(); view.rerender(editElement()); expect(await screen.findByLabelText('Game title')).toHaveValue('Original title');
  });
  it('denies stale edit controls after account replacement until the new owner actually hydrates', async () => {
   loaded(); render(editElement()); expect(await screen.findByLabelText('Game title')).toHaveValue('Original title');
   fixture.content = { view: { lists: [] }, details: new Map(), observation: {} }; fixture.loading = true;
   act(() => useAuthStore.getState().logout()); expect(screen.queryByLabelText('Game title')).not.toBeInTheDocument(); expect(screen.getByRole('status')).toHaveTextContent('Loading game'); expect(GamesClient.updateRecommendation).not.toHaveBeenCalled();
  });
  it('preserves a hydrated user draft on background error and never silently rebases its observation', async () => {
   loaded(); const original = fixture.content.details.get('game-a'); const view = render(editElement());
   fireEvent.change(await screen.findByLabelText('Game title'), { target: { value: 'My unsaved edit' } });
   fixture.error = new Error('Refresh unavailable'); fixture.content = { view: { lists: [] }, details: new Map(), observation: {} }; view.rerender(editElement()); expect(screen.getByLabelText('Game title')).toHaveValue('My unsaved edit');
   loaded('Server newer title'); fixture.content.details.set('game-a', { detail: { id: 'game-a', revision: 2 } }); view.rerender(editElement()); expect(screen.getByLabelText('Game title')).toHaveValue('My unsaved edit');
   fireEvent.click(screen.getByRole('button', { name: 'Save' })); expect(await screen.findByRole('alert')).toHaveTextContent('Reload the game before saving'); expect(GamesClient.updateRecommendation).not.toHaveBeenCalled(); expect(fixture.content.details.get('game-a')).not.toBe(original);
  });
 });
