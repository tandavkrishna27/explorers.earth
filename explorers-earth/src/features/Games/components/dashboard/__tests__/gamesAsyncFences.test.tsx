import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import TopGamesManager from '../TopGamesManager';
import { useGamesCommands, useGamesCallerCustody } from '../../../api/query';
import { toast } from 'sonner';
import { GamesClient } from '../../../api/gamesClient';
import useAuthStore from '../../../../../store/store';
vi.mock('../../../api/gamesClient', () => ({ GamesClient: { observeCollection: vi.fn(), updateCollection: vi.fn(), updateRecommendation: vi.fn(), readCompleteOwner: vi.fn(), setTopPicks: vi.fn(), observeRecommendation: vi.fn(), prepareMembershipIntent: vi.fn(), saveMembership: vi.fn(), archiveCollection: vi.fn(), createCollection: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;
describe('Games operation authority', () => {
 afterEach(cleanup);
 beforeEach(() => { vi.clearAllMocks(); useAuthStore.getState().login({ id: 'u1', documentId: 'u1', username: 'owner', token: 'fixture' }); useAuthStore.setState({ accountId: 'a1' }); });
 it('does not mutate after account replacement during an awaited observation', async () => {
  const parent = deferred<never>(); vi.mocked(GamesClient.observeCollection).mockReturnValue(parent.promise);
  const { result } = renderHook(useGamesCommands, { wrapper }); let pending!: Promise<unknown>; act(() => { pending = result.current.updateList('list-a', { title: 'New title' }); }); const rejection = expect(pending).rejects.toThrow('owner or route changed');
  act(() => { useAuthStore.getState().login({ id: 'u2', documentId: 'u2', username: 'other', token: 'fixture' }); }); await act(async () => parent.resolve({ detail: { id: 'list-a' } } as never));
  await rejection; expect(GamesClient.updateCollection).not.toHaveBeenCalled();
 });
 it('does not mutate after unmount during an awaited observation', async () => {
  const parent = deferred<never>(); vi.mocked(GamesClient.observeCollection).mockReturnValue(parent.promise);
  const { result, unmount } = renderHook(useGamesCommands, { wrapper }); let pending!: Promise<unknown>; act(() => { pending = result.current.archiveList('list-a'); }); unmount(); parent.resolve({ detail: { id: 'list-a' } } as never);
  await expect(pending).rejects.toThrow('owner or route changed'); expect(GamesClient.archiveCollection).not.toHaveBeenCalled();
 });
 it('binds a pinned recommendation to the selected collection, preserving other picks', async () => {
  const complete = { topPicks: [{ recommendationId: 'same', collectionId: 'list-a' }, { recommendationId: 'other', collectionId: 'list-c' }], memberships: [{ recommendationId: 'same', collectionId: 'list-a', collectionArchived: false, recommendationArchived: false }, { recommendationId: 'same', collectionId: 'list-b', collectionArchived: false, recommendationArchived: false }] };
  vi.mocked(GamesClient.readCompleteOwner).mockResolvedValue(complete as never); vi.mocked(GamesClient.setTopPicks).mockResolvedValue({} as never);
  const { result } = renderHook(useGamesCommands, { wrapper }); await act(async () => { await result.current.pin('same', 'list-b', true); });
  expect(GamesClient.setTopPicks).toHaveBeenCalledWith(complete, [{ recommendationId: 'other', collectionId: 'list-c' }, { recommendationId: 'same', collectionId: 'list-b' }], expect.any(String), expect.any(AbortSignal));
 });
 it('does not issue a subsequent mutation after route replacement during observation', async () => {
  const parent = deferred<never>(); vi.mocked(GamesClient.observeCollection).mockReturnValue(parent.promise);
  const { result } = renderHook(() => ({ commands: useGamesCommands(), navigate: useNavigate() }), { wrapper });
  let pending!: Promise<unknown>; act(() => { pending = result.current.commands.updateList('list-a', { title: 'Changed' }); });
  const rejection = expect(pending).rejects.toThrow('owner or route changed');
  act(() => result.current.navigate('/list-b'));
  await act(async () => parent.resolve({ detail: { id: 'list-a', revision: 1 } } as never));
  await rejection; expect(GamesClient.updateCollection).not.toHaveBeenCalled();
 });
 it('explicit membership retry preserves both original observations and command intent', async () => {
  const parent = { detail: { id: 'list-b', revision: 7 } }, item = { detail: { id: 'game-a', revision: 9 } }, intent = { parent, item, attached: true, commandKey: 'paired-original' };
  vi.mocked(GamesClient.observeCollection).mockResolvedValue(parent as never); vi.mocked(GamesClient.observeRecommendation).mockResolvedValue(item as never); vi.mocked(GamesClient.prepareMembershipIntent).mockReturnValue(intent as never);
  vi.mocked(GamesClient.saveMembership).mockRejectedValueOnce(new Error('Receipt unavailable')).mockResolvedValueOnce({} as never);
  const { result } = renderHook(useGamesCommands, { wrapper });
  await act(async () => { await expect(result.current.membership('game-a', 'list-b', true)).rejects.toThrow('Receipt unavailable'); });
  await act(async () => { await result.current.membership('game-a', 'list-b', true); });
  expect(GamesClient.prepareMembershipIntent).toHaveBeenCalledTimes(1); expect(GamesClient.observeCollection).toHaveBeenCalledTimes(1); expect(GamesClient.observeRecommendation).toHaveBeenCalledTimes(1);
  expect(GamesClient.saveMembership.mock.calls[0][0]).toBe(intent); expect(GamesClient.saveMembership.mock.calls[1][0]).toBe(intent);
 });
 it('account replacement between paired observations prevents intent and membership write', async () => {
  const item = deferred<never>(); vi.mocked(GamesClient.observeCollection).mockResolvedValue({ detail: { id: 'list-b' } } as never); vi.mocked(GamesClient.observeRecommendation).mockReturnValue(item.promise);
  const { result } = renderHook(useGamesCommands, { wrapper }); let pending!: Promise<unknown>; act(() => { pending = result.current.membership('game-a', 'list-b', false); }); const rejection = expect(pending).rejects.toThrow('owner or route changed');
  await act(async () => { await Promise.resolve(); }); expect(GamesClient.observeRecommendation).toHaveBeenCalledTimes(1);
  act(() => useAuthStore.getState().logout()); await act(async () => item.resolve({ detail: { id: 'game-a' } } as never)); await rejection;
  expect(GamesClient.prepareMembershipIntent).not.toHaveBeenCalled(); expect(GamesClient.saveMembership).not.toHaveBeenCalled();
 });

 it('retries an uncertain list update using its original observation rather than a newer revision', async () => {
  const original = { detail: { id: 'list-a', revision: 4 } }, newer = { detail: { id: 'list-a', revision: 5 } };
  vi.mocked(GamesClient.observeCollection).mockResolvedValueOnce(original as never).mockResolvedValueOnce(newer as never);
  vi.mocked(GamesClient.updateCollection).mockRejectedValueOnce(new Error('Response lost')).mockResolvedValueOnce({} as never);
  const { result } = renderHook(useGamesCommands, { wrapper });
  await act(async () => { await expect(result.current.updateList('list-a', { title: 'My edit' })).rejects.toThrow('Response lost'); });
  await act(async () => { await result.current.updateList('list-a', { title: 'My edit' }); });
  const calls = vi.mocked(GamesClient.updateCollection).mock.calls;
  expect(calls[1][0]).toBe(original); expect(calls[1][2]).toBe(calls[0][2]); expect(GamesClient.observeCollection).toHaveBeenCalledTimes(1);
 });

 it('stages top pick removal and ordering until one explicit full-category save', async () => {
  const first = { documentId: 'game-a', title: 'First game', pin_order: 0, game_list: { documentId: 'selected-b', List_Name: 'Chosen list' } }, second = { documentId: 'game-c', title: 'Other game', pin_order: 1, game_list: { documentId: 'other-c', List_Name: 'Other list' } };
  const complete = { revision: '8', topPicks: [{ recommendationId: 'game-a', collectionId: 'selected-b' }, { recommendationId: 'game-c', collectionId: 'other-c' }] };
  vi.mocked(GamesClient.readCompleteOwner).mockResolvedValue(complete as never); vi.mocked(GamesClient.setTopPicks).mockResolvedValue({} as never);
  render(<MemoryRouter><TopGamesManager games={[first, second] as never} allGames={[first, second] as never} onClose={vi.fn()} onRefetch={vi.fn()} /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Move Other game up' })); expect(GamesClient.setTopPicks).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Unpin First game' })); expect(GamesClient.setTopPicks).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save Top Picks' })); await waitFor(() => expect(GamesClient.setTopPicks).toHaveBeenCalledTimes(1));
  expect(GamesClient.setTopPicks).toHaveBeenCalledWith(complete, [{ recommendationId: 'game-c', collectionId: 'other-c' }], expect.any(String), expect.any(AbortSignal));
 });

 it('publishes only the explicitly selected recommendation through its original observed revision', async () => {
  const observed = { detail: { id: 'game-a', revision: 4, publicationState: 'draft' } }; vi.mocked(GamesClient.observeRecommendation).mockResolvedValue(observed as never); vi.mocked(GamesClient.updateRecommendation).mockResolvedValue({} as never);
  const { result } = renderHook(useGamesCommands, { wrapper }); await act(async () => { await result.current.publishRecommendation('game-a', true); });
  expect(GamesClient.updateRecommendation).toHaveBeenCalledWith(observed, { publicationState: 'published' }, expect.any(String), expect.any(AbortSignal)); expect(GamesClient.updateCollection).not.toHaveBeenCalled(); expect(GamesClient.saveMembership).not.toHaveBeenCalled();
 });
 it('explicit uncertain publication retry keeps its original recommendation and key', async () => {
  const original = { detail: { id: 'game-a', revision: 4, publicationState: 'draft' } }; vi.mocked(GamesClient.observeRecommendation).mockResolvedValue(original as never); vi.mocked(GamesClient.updateRecommendation).mockRejectedValueOnce(new Error('Response lost')).mockResolvedValueOnce({} as never);
  const { result } = renderHook(useGamesCommands, { wrapper }); await act(async () => { await expect(result.current.publishRecommendation('game-a', true)).rejects.toThrow('Response lost'); }); await act(async () => { await result.current.publishRecommendation('game-a', true); });
  const calls = vi.mocked(GamesClient.updateRecommendation).mock.calls; expect(calls[1][0]).toBe(original); expect(calls[1][2]).toBe(calls[0][2]); expect(GamesClient.observeRecommendation).toHaveBeenCalledTimes(1);
 });
 it('account replacement during publication observation prevents any publication write', async () => {
  const observed = deferred<never>(); vi.mocked(GamesClient.observeRecommendation).mockReturnValue(observed.promise); const { result } = renderHook(useGamesCommands, { wrapper }); let pending!: Promise<unknown>; act(() => { pending = result.current.publishRecommendation('game-a', true); }); const rejection = expect(pending).rejects.toThrow('owner or route changed'); act(() => useAuthStore.getState().logout()); await act(async () => observed.resolve({ detail: { id: 'game-a', revision: 4 } } as never)); await rejection;
  expect(GamesClient.updateRecommendation).not.toHaveBeenCalled();
 });
 it('Keep Draft changes only recommendation publication and preserves collections and memberships', async () => {
  const observed = { detail: { id: 'game-a', revision: 5, publicationState: 'published' } }; vi.mocked(GamesClient.observeRecommendation).mockResolvedValue(observed as never); vi.mocked(GamesClient.updateRecommendation).mockResolvedValue({} as never); const { result } = renderHook(useGamesCommands, { wrapper }); await act(async () => { await result.current.publishRecommendation('game-a', false); });
  expect(GamesClient.updateRecommendation).toHaveBeenCalledWith(observed, { publicationState: 'draft' }, expect.any(String), expect.any(AbortSignal)); expect(GamesClient.updateCollection).not.toHaveBeenCalled(); expect(GamesClient.saveMembership).not.toHaveBeenCalled();
 });
 it('retires an uncertain publication intent when the owner explicitly chooses the opposite decision', async () => {
  const first = { detail: { id: 'game-a', revision: 4 } }, opposite = { detail: { id: 'game-a', revision: 5 } }, last = { detail: { id: 'game-a', revision: 6 } };
  vi.mocked(GamesClient.observeRecommendation).mockResolvedValueOnce(first as never).mockResolvedValueOnce(opposite as never).mockResolvedValueOnce(last as never); vi.mocked(GamesClient.updateRecommendation).mockRejectedValueOnce(new Error('Response lost')).mockResolvedValue({} as never);
  const { result } = renderHook(useGamesCommands, { wrapper }); await act(async () => { await expect(result.current.publishRecommendation('game-a', true)).rejects.toThrow('Response lost'); }); await act(async () => { await result.current.publishRecommendation('game-a', false); }); await act(async () => { await result.current.publishRecommendation('game-a', true); });
  const calls = vi.mocked(GamesClient.updateRecommendation).mock.calls; expect(calls[2][0]).toBe(last); expect(calls[2][2]).not.toBe(calls[0][2]); expect(GamesClient.observeRecommendation).toHaveBeenCalledTimes(3);
 });
});

 describe('Top Picks caller custody', () => {
  afterEach(cleanup);
  beforeEach(() => { vi.clearAllMocks(); useAuthStore.getState().login({ id: 'u1', documentId: 'u1', username: 'owner', token: 'fixture' }); useAuthStore.setState({ accountId: 'a1' }); });
  it.each(['logout', 'unmount', 'route'])('does not emit effects after %s abandons the observation', async kind => {
   const observation = deferred<never>(); vi.mocked(GamesClient.readCompleteOwner).mockReturnValue(observation.promise);
   const closed = vi.fn(), refreshed = vi.fn(); let navigate!: ReturnType<typeof useNavigate>;
   function App() { navigate = useNavigate(); return <TopGamesManager games={[]} allGames={[]} onClose={closed} onRefetch={refreshed} />; }
   const view = render(<MemoryRouter><App /></MemoryRouter>);
   fireEvent.click(screen.getByRole('button', { name: 'Save Top Picks' }));
   if (kind === 'unmount') view.unmount(); else act(() => { if (kind === 'logout') useAuthStore.getState().logout(); else navigate('/other'); });
   await act(async () => observation.resolve({ topPicks: [] } as never));
   expect(GamesClient.setTopPicks).not.toHaveBeenCalled(); expect(toast.error).not.toHaveBeenCalled(); expect(toast.success).not.toHaveBeenCalled(); expect(closed).not.toHaveBeenCalled(); expect(refreshed).not.toHaveBeenCalled();
  });
  it('retains an actual current-owner error and permits explicit retry', async () => {
   vi.mocked(GamesClient.readCompleteOwner).mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce({ topPicks: [] } as never); vi.mocked(GamesClient.setTopPicks).mockResolvedValue({} as never);
   render(<MemoryRouter><TopGamesManager games={[]} allGames={[]} onClose={vi.fn()} onRefetch={vi.fn()} /></MemoryRouter>);
   fireEvent.click(screen.getByRole('button', { name: 'Save Top Picks' })); await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
   fireEvent.click(screen.getByRole('button', { name: 'Save Top Picks' })); await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
  });
 });

 it('a newer caller operation retires prior success/error/finally custody', () => {
  const { result, unmount } = renderHook(useGamesCallerCustody, { wrapper });
  const first = result.current(); expect(first()).toBe(true);
  const second = result.current(); expect(first()).toBe(false); expect(second()).toBe(true);
  unmount(); expect(second()).toBe(false);
 });
