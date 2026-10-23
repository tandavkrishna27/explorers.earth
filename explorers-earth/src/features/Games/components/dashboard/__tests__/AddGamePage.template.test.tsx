import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AddGamePage from '../AddGamePage';
import { GamesClient } from '../../../api/gamesClient';
import useAuthStore from '../../../../../store/store';

const catalog = vi.hoisted(() => ({ value: { terms: [] as { id: string; label: string; parentId: string | null; slug: string }[], unconfigured: false, loading: false, error: null } }));
vi.mock('../../../../../lib/curatedTaxonomy', async importOriginal => ({ ...(await importOriginal<object>()), useCuratedCatalog: () => catalog.value }));
const owner = vi.hoisted(() => ({ content: { view: { lists: [] as unknown[] }, details: new Map<string, unknown>() }, loading: false, error: undefined, refetch: () => {} }));
vi.mock('../../../hooks/useGamesOwner', () => ({ useGamesOwner: () => owner, invalidateGames: vi.fn() }));
vi.mock('../../../api/gamesClient', () => ({ GamesClient: { observeCollection: vi.fn(), prepareManualIntent: vi.fn(), createManual: vi.fn(), upload: vi.fn(), importCover: vi.fn(), search: vi.fn(), updateRecommendation: vi.fn() } }));
vi.mock('../../../../Favorites/components/TiptapEditor', () => ({ default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <textarea aria-label="Note" value={value} onChange={event => onChange(event.target.value)} /> }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const terms = [{ id: 't-action', label: 'Action', parentId: null, slug: 'action' }, { id: 't-platformer', label: 'Platformer', parentId: null, slug: 'platformer' }];
const celeste = { externalId: '26226', title: 'Celeste', year: 2018, coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co3byy.jpg', platforms: ['PC (Microsoft Windows)', 'Nintendo Switch'], genres: ['Platform', 'Indie'], developer: 'Maddy Makes Games' };
function mount() { return render(<MemoryRouter initialEntries={['/games/list-1/add']}><Routes><Route path="/games/:listId/add" element={<AddGamePage />} /><Route path="/recommendations/games/:listId" element={<p>Saved list</p>} /></Routes></MemoryRouter>); }

describe('AddGamePage on the shared add template (WP7)', () => {
 beforeEach(() => {
  vi.clearAllMocks(); catalog.value = { terms, unconfigured: false, loading: false, error: null }; owner.content.view.lists = []; owner.content.details.clear();
  useAuthStore.getState().login({ id: 'u1', documentId: 'u1', username: 'owner', token: 'fixture' }); useAuthStore.setState({ accountId: 'a1' });
  vi.mocked(GamesClient.observeCollection).mockResolvedValue({ detail: { id: 'list-1' } } as never);
  vi.mocked(GamesClient.prepareManualIntent).mockReturnValue({} as never); vi.mocked(GamesClient.createManual).mockResolvedValue({ id: 'game-1' } as never);
  vi.mocked(GamesClient.importCover).mockResolvedValue({ id: 'cover-1' } as never);
  vi.mocked(GamesClient.search).mockResolvedValue({ version: 'explorers-game-candidates/v1', nextCursor: null, items: [celeste] } as never);
 });
 afterEach(() => { cleanup(); useAuthStore.getState().logout(); });

 it('Enter searches at once (UAT-02); a pick fills developer and suggests the curated category; stars stay the owner\'s', async () => {
  mount(); const box = screen.getByPlaceholderText('Search for a game...');
  fireEvent.change(box, { target: { value: 'celeste' } }); fireEvent.keyDown(box, { key: 'Enter' });
  expect(GamesClient.search).toHaveBeenCalledWith({ query: 'celeste', limit: 24 }, expect.any(AbortSignal));
  fireEvent.click(await screen.findByRole('option', { name: /Celeste/ }));
  expect(screen.getByText('Celeste', { selector: 'b' })).toBeInTheDocument();
  expect(screen.getByLabelText('Developer')).toHaveValue('Maddy Makes Games');
  expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('Platformer');
  expect(screen.getByRole('slider', { name: 'Your rating' })).toHaveAttribute('aria-valuenow', '0');
  await waitFor(() => expect(GamesClient.importCover).toHaveBeenCalledWith('co3byy'));
  fireEvent.click(screen.getByRole('button', { name: 'Save' })); await screen.findByText('Saved list');
  expect(GamesClient.prepareManualIntent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ title: 'Celeste', developer: 'Maddy Makes Games', curatedTermId: 't-platformer', userRating: null, platforms: ['PC (Microsoft Windows)', 'Nintendo Switch'], mediaIds: ['cover-1'] }));
 });

 it('manual add carries a typed developer and never sends a category while the catalog is unconfigured', async () => {
  catalog.value = { terms: [], unconfigured: true, loading: false, error: null };
  mount(); fireEvent.click(screen.getAllByRole('button', { name: /add manually/i })[0]);
  fireEvent.change(screen.getByLabelText('Game title'), { target: { value: 'Home-made' } }); fireEvent.change(screen.getByLabelText('Developer'), { target: { value: ' Me ' } });
  expect(screen.queryByRole('combobox', { name: 'Category' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Save' })); await screen.findByText('Saved list');
  const draft = vi.mocked(GamesClient.prepareManualIntent).mock.calls[0][1];
  expect(draft).toMatchObject({ title: 'Home-made', developer: 'Me' }); expect(draft).not.toHaveProperty('curatedTermId');
 });

 it('edit shows the stored curated category and an untouched save does not resend it', async () => {
  owner.content.view.lists = [{ documentId: 'list-1', recommended_games: [{ documentId: 'game-1', title: 'Celeste', user_recommendation_note: '', user_rating: 4, Media: [] }] }];
  owner.content.details.set('game-1', { detail: { curatedTerm: { term: { id: 't-action' } } } });
  vi.mocked(GamesClient.updateRecommendation).mockResolvedValue({} as never);
  render(<MemoryRouter initialEntries={['/games/list-1/edit/game-1']}><Routes><Route path="/games/:listId/edit/:gameId" element={<AddGamePage />} /><Route path="/recommendations/games/:listId" element={<p>Saved list</p>} /></Routes></MemoryRouter>);
  expect(await screen.findByRole('combobox', { name: 'Category' })).toHaveValue('Action');
  fireEvent.click(screen.getByRole('button', { name: 'Save' })); await screen.findByText('Saved list');
  expect(vi.mocked(GamesClient.updateRecommendation).mock.calls[0][1]).not.toHaveProperty('curatedTermId');
 });
});
