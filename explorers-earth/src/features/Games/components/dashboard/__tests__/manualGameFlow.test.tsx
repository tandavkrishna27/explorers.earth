import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing';
import AddGamePage from '../AddGamePage';
import GameListView from '../GameListView';
import { toast } from 'sonner';
import { GamesClient } from '../../../api/gamesClient';
import useAuthStore from '../../../../../store/store';

const fixture = vi.hoisted(() => ({ content: { view: { lists: [] }, details: new Map(), observation: {} }, loading: false, error: undefined as Error | undefined, refetch: vi.fn() }));
vi.mock('../../../hooks/useGamesOwner', () => ({ useGamesOwner: () => ({ content: fixture.content, data: { gameLists: fixture.content.view.lists }, loading: fixture.loading, error: fixture.error, refetch: fixture.refetch }), invalidateGames: vi.fn() }));
vi.mock('../../../api/gamesClient', () => ({ GamesClient: { observeCollection: vi.fn(), prepareManualIntent: vi.fn(), createManual: vi.fn(), upload: vi.fn(), search: vi.fn(), updateRecommendation: vi.fn(), observeRecommendation: vi.fn(), updateCollection: vi.fn(), createCollection: vi.fn(), readCompleteOwner: vi.fn(), setTopPicks: vi.fn() } }));
vi.mock('../../../../Favorites/components/TiptapEditor', () => ({ default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <textarea aria-label="Note" value={value} onChange={event => onChange(event.target.value)} /> }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
function mount() { return render(<MockedProvider><MemoryRouter initialEntries={['/games/list-1/add']}><Routes><Route path="/games/:listId/add" element={<AddGamePage />} /><Route path="/recommendations/games/:listId" element={<p>Saved list</p>} /></Routes></MemoryRouter></MockedProvider>); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
describe('native manual Games', () => {
 beforeEach(() => { vi.clearAllMocks(); fixture.loading = false; fixture.error = undefined; fixture.content.view.lists = []; fixture.content.details.clear(); useAuthStore.getState().login({ id: 'u1', documentId: 'u1', username: 'owner', token: 'fixture' }); useAuthStore.setState({ accountId: 'a1' }); vi.mocked(GamesClient.observeCollection).mockResolvedValue({ detail: { id: 'list-1' } } as never); vi.mocked(GamesClient.prepareManualIntent).mockImplementation((parent, draft) => ({ parent, draft, entityKey: 'entity-key', recommendationKey: 'recommendation-key' })); vi.mocked(GamesClient.createManual).mockResolvedValue({ id: 'game-1' } as never); });
 afterEach(() => { cleanup(); useAuthStore.getState().logout(); });
 it('creates a native manual title/rating/note without fabricating a provider ID', async () => {
  mount(); fireEvent.change(await screen.findByLabelText('Game title'), { target: { value: 'Manual adventure' } }); fireEvent.change(screen.getByLabelText('Your rating'), { target: { value: '8' } }); fireEvent.change(screen.getByLabelText('Note'), { target: { value: '<p>A personal note</p>' } }); fireEvent.click(screen.getByRole('button', { name: 'Save game' }));
  await screen.findByText('Saved list'); expect(GamesClient.prepareManualIntent).toHaveBeenCalledWith(expect.anything(), { title: 'Manual adventure', note: { version: 1, format: 'quill-html', html: '<p>A personal note</p>' }, userRating: 8, mediaIds: [] }); expect(GamesClient.createManual).toHaveBeenCalledTimes(1); expect(GamesClient.search).not.toHaveBeenCalled();
 });
 it('waits for actual uploaded media readiness before saving', async () => {
  const upload = deferred<{ id: string }>(); vi.mocked(GamesClient.upload).mockReturnValue(upload.promise as never); mount(); fireEvent.change(await screen.findByLabelText('Game title'), { target: { value: 'Uploaded game' } }); fireEvent.change(screen.getByLabelText('Snapshots'), { target: { files: [new File(['bytes'], 'snapshot.png', { type: 'image/png' })] } }); expect(screen.getByRole('button', { name: 'Save game' })).toBeDisabled(); expect(GamesClient.createManual).not.toHaveBeenCalled(); await act(async () => upload.resolve({ id: 'media-1' })); await waitFor(() => expect(screen.getByRole('button', { name: 'Save game' })).toBeEnabled()); fireEvent.click(screen.getByRole('button', { name: 'Save game' })); await screen.findByText('Saved list'); expect(GamesClient.prepareManualIntent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mediaIds: ['media-1'] }));
 });
 it('retains the same manual command intent on an explicit network retry', async () => {
  vi.mocked(GamesClient.createManual).mockRejectedValueOnce(new Error('Temporarily unavailable')).mockResolvedValueOnce({ id: 'game-1' } as never); mount(); fireEvent.change(await screen.findByLabelText('Game title'), { target: { value: 'Retained draft' } }); fireEvent.click(screen.getByRole('button', { name: 'Save game' })); await screen.findByRole('alert'); expect(screen.getByLabelText('Game title')).toHaveValue('Retained draft'); fireEvent.click(screen.getByRole('button', { name: 'Save game' })); await screen.findByText('Saved list'); expect(GamesClient.prepareManualIntent).toHaveBeenCalledTimes(1); expect(vi.mocked(GamesClient.createManual).mock.calls[0][0]).toBe(vi.mocked(GamesClient.createManual).mock.calls[1][0]);
 });
 it('provider unavailable response preserves the manual draft without provider identity', async () => {
  vi.mocked(GamesClient.search).mockRejectedValue(new Error('Provider unavailable'));
  mount(); fireEvent.change(await screen.findByLabelText('Game title'), { target: { value: 'My manual draft' } }); fireEvent.change(screen.getByLabelText('Search for a game'), { target: { value: 'Provider query' } }); fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Provider unavailable'); expect(screen.getByLabelText('Game title')).toHaveValue('My manual draft'); expect(GamesClient.prepareManualIntent).not.toHaveBeenCalled();
 });
 it('account replacement while parent observation is pending cannot create a game', async () => {
  const parent = deferred<never>(); vi.mocked(GamesClient.observeCollection).mockReturnValue(parent.promise); mount(); fireEvent.change(await screen.findByLabelText('Game title'), { target: { value: 'Old owner draft' } }); fireEvent.click(screen.getByRole('button', { name: 'Save game' }));
  act(() => useAuthStore.getState().logout()); await act(async () => parent.resolve({ detail: { id: 'list-1' } } as never));
  expect(GamesClient.prepareManualIntent).not.toHaveBeenCalled(); expect(GamesClient.createManual).not.toHaveBeenCalled(); expect(screen.getByLabelText('Game title')).toHaveValue('');
 });

 it('retains an oversized note and presents validation failure without dispatching a save', async () => {
  mount(); fireEvent.change(await screen.findByLabelText('Game title'), { target: { value: 'My invalid draft' } }); const note = '<p>' + 'a'.repeat(256 * 1024) + '</p>'; fireEvent.change(screen.getByLabelText('Note'), { target: { value: note } }); fireEvent.click(screen.getByRole('button', { name: 'Save game' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Rich note exceeds byte limit'); expect(screen.getByLabelText('Note')).toHaveValue(note); expect(GamesClient.observeCollection).not.toHaveBeenCalled(); expect(GamesClient.createManual).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Save game' })).toBeEnabled();
 });
 it('offers separate explicit recommendation publication without inheriting collection publication', async () => {
  const game = { documentId: 'game-a', title: 'Manual game', user_rating: null, user_recommendation_note: '', cover_url: null, genres: null, platforms: null, is_pinned: false, game_list: { documentId: 'list-1', List_Name: 'Published list' } };
  fixture.content.view.lists = [{ documentId: 'list-1', List_Name: 'Published list', slug: 'published', Visibility: true, recommended_games: [game], account: { documentId: 'a1', username: 'owner' } }] as never;
  const observed = { detail: { id: 'game-a', revision: 1, publicationState: 'draft' } }; fixture.content.details.set('game-a', observed); vi.mocked(GamesClient.observeRecommendation).mockResolvedValue(observed as never); vi.mocked(GamesClient.updateRecommendation).mockResolvedValue({} as never);
  render(<MockedProvider><MemoryRouter initialEntries={['/recommendations/games/list-1']}><Routes><Route path="/recommendations/games/:listId" element={<GameListView />} /></Routes></MemoryRouter></MockedProvider>);
  expect(screen.getByText('Recommendation is Draft')).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Publish Manual game' }));
  await waitFor(() => expect(GamesClient.updateRecommendation).toHaveBeenCalledWith(observed, { publicationState: 'published' }, expect.any(String), expect.any(AbortSignal))); expect(GamesClient.updateCollection).not.toHaveBeenCalled();
 });
 it('permits changing the selected ancestry of an existing pick at the category cap', async () => {
  const selected = { documentId: 'game-a', title: 'Same game', user_rating: null, user_recommendation_note: '', is_pinned: false, game_list: { documentId: 'list-1', List_Name: 'Chosen list' } };
  const picks = Array.from({ length: 15 }, (_, index) => ({ recommendationId: index === 0 ? 'game-a' : 'game-' + index, collectionId: 'other-list' })); const otherRows = picks.map((pin, index) => ({ ...selected, documentId: pin.recommendationId, title: 'Pinned ' + index, is_pinned: true, pin_order: index, game_list: { documentId: 'other-list', List_Name: 'Other list' } }));
  fixture.content.view.lists = [{ documentId: 'list-1', List_Name: 'Chosen list', slug: 'chosen', Visibility: false, recommended_games: [selected], account: { documentId: 'a1', username: 'owner' } }, { documentId: 'other-list', List_Name: 'Other list', slug: 'other', Visibility: false, recommended_games: otherRows }] as never;
  fixture.content.details.set('game-a', { detail: { id: 'game-a', publicationState: 'draft' } }); const complete = { revision: '8', topPicks: picks, memberships: [{ recommendationId: 'game-a', collectionId: 'list-1', collectionArchived: false, recommendationArchived: false }] }; vi.mocked(GamesClient.readCompleteOwner).mockResolvedValue(complete as never); vi.mocked(GamesClient.setTopPicks).mockResolvedValue({} as never);
  render(<MockedProvider><MemoryRouter initialEntries={['/recommendations/games/list-1']}><Routes><Route path="/recommendations/games/:listId" element={<GameListView />} /></Routes></MemoryRouter></MockedProvider>);
  fireEvent.click(screen.getByTitle('Pin to Top Picks')); await waitFor(() => expect(GamesClient.setTopPicks).toHaveBeenCalledOnce()); const submitted = vi.mocked(GamesClient.setTopPicks).mock.calls[0][1]; expect(submitted).toHaveLength(15); expect(submitted).toEqual([...picks.slice(1), { recommendationId: 'game-a', collectionId: 'list-1' }]);
 });
});

 describe('Games list caller abandonment', () => {
  beforeEach(() => { vi.clearAllMocks(); fixture.loading = false; fixture.error = undefined; useAuthStore.getState().login({ id: 'u1', documentId: 'u1', username: 'owner', token: 'fixture' }); useAuthStore.setState({ accountId: 'a1' }); });
  afterEach(cleanup);
  it.each(['logout', 'unmount'])('does not report publication errors after %s abandons an observation', async kind => {
   const game = { documentId: 'game-a', title: 'Manual game', user_recommendation_note: '', is_pinned: false, game_list: { documentId: 'list-1', List_Name: 'Published list' } };
   fixture.content.view.lists = [{ documentId: 'list-1', List_Name: 'Published list', Visibility: true, recommended_games: [game], account: { documentId: 'a1', username: 'owner' } }] as never;
   const pending = deferred<never>(); vi.mocked(GamesClient.observeRecommendation).mockReturnValue(pending.promise);
   const view = render(<MockedProvider><MemoryRouter initialEntries={['/recommendations/games/list-1']}><Routes><Route path="/recommendations/games/:listId" element={<GameListView />} /></Routes></MemoryRouter></MockedProvider>);
   fireEvent.click(screen.getByRole('button', { name: 'Publish Manual game' }));
   if (kind === 'unmount') view.unmount(); else act(() => useAuthStore.getState().logout());
   await act(async () => pending.resolve({ detail: { id: 'game-a', revision: 1 } } as never));
   expect(GamesClient.updateRecommendation).not.toHaveBeenCalled(); expect(toast.error).not.toHaveBeenCalled(); expect(toast.success).not.toHaveBeenCalled();
  });
 });

 it('reserves scrollable footer and safe-area clearance below the actual manual Save control', async () => {
  mount(); const save = await screen.findByRole('button', { name: 'Save game' });
  const content = save.parentElement?.parentElement;
  expect(content).toHaveStyle({ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' });
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
   loaded(); view.rerender(editElement()); expect(await screen.findByLabelText('Game title')).toHaveValue('Original title'); expect(screen.getByRole('button', { name: 'Save game' })).toBeEnabled();
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
   fireEvent.click(screen.getByRole('button', { name: 'Save game' })); expect(await screen.findByRole('alert')).toHaveTextContent('Reload the game before saving'); expect(GamesClient.updateRecommendation).not.toHaveBeenCalled(); expect(fixture.content.details.get('game-a')).not.toBe(original);
  });
 });
