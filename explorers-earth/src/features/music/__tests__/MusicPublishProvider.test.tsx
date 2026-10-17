import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicPublishProvider, useMusicPublish } from '../MusicPublishProvider';
import { useCategoryNavigation } from '../../navigation/CategoryNavigationProvider';
import { musicBackend, musicPublishHarness, readyMusic } from './musicPublishHarness';
import { musicApi, musicIdentityCoordinator } from '../musicApi';
import { loginSurface } from '../../navigation/__tests__/surfaceHarness';
import useAuthStore from '../../../store/store';
import { StrictMode } from 'react';
import { queryClient } from '../../../lib/queryClient';
import { musicWorkspaceQueryKey } from '../../../hooks/useTunesDashboard';
import { writtenPins, writtenVisibility } from '../../navigation/__tests__/surfaceHarness';
import { canonicalAccountFixture } from '../../../test/canonicalAccountFixture';
// The account musicPublishHarness signs in as. Cross-tab signals are matched against it,
// so a legacy 'a1' id was simply ignored and the published state never arrived.
const ACCOUNT = canonicalAccountFixture().id;
let latest: ReturnType<typeof useMusicPublish>;
function Consumer({ label = 'first', ready = true }: { label?: string; ready?: boolean }) {
  const { authority } = useCategoryNavigation();
  const music = useMusicPublish(authority, { ready }); latest = music;
  return <div><span>{label}:{music.state.kind}</span><button disabled={!music.canChange} onClick={() => void music.request('public')}>{label} publish</button></div>;
}
describe('scoped Music publication registry', () => {
  beforeEach(() => { vi.restoreAllMocks(); musicIdentityCoordinator.reset(); sessionStorage.clear(); });
  afterEach(() => { cleanup(); useAuthStore.getState().logout(); musicIdentityCoordinator.reset(); });
  it('mounts inertly outside any account context without Music or identity requests', () => {
    const backend = musicBackend(); const ensure = vi.spyOn(musicApi, 'ensureIdentity');
    render(<MusicPublishProvider><div>Unrelated dashboard</div></MusicPublishProvider>);
    expect(backend.dashboard).not.toHaveBeenCalled(); expect(backend.publish).not.toHaveBeenCalled(); expect(ensure).not.toHaveBeenCalled();
  });
  it('shares one active controller and pending command across two consumers', async () => {
    await readyMusic(); const backend = musicBackend();
    const h = musicPublishHarness(<><Consumer /><Consumer label="second" /></>); await h.ready();
    await screen.findByText('first:draft'); await screen.findByText('second:draft');
    expect(backend.dashboard).toHaveBeenCalledTimes(1);
    let finish!: () => void;
    backend.publish.mockImplementationOnce(async mode => { await new Promise<void>(resolve => { finish = resolve; }); backend.mode = mode; return { version: 'music-publication/v1', publication: { mode, publicSlug: 'public-slug-123' } }; });
    fireEvent.click(screen.getByRole('button', { name: 'first publish' }));
    await screen.findByText('second:saving');
    expect(screen.getByRole('button', { name: 'second publish' })).toBeDisabled();
    expect(backend.publish).toHaveBeenCalledTimes(1);
    await act(async () => finish()); await screen.findByText('second:published');
    expect(h.writes).toHaveLength(1);
    expect(writtenVisibility(h.writes[0].variables.input, 'public_music')).toBe(true);
    expect(writtenPins(h.writes[0].variables.input)).toEqual(['public_profile', 'public_books']);
  });
  it('refuses a new origin while the old identity still globally reports ready', async () => {
    await readyMusic(); const backend = musicBackend();
    const h = musicPublishHarness(<Consumer />); await h.ready(); await screen.findByText('first:draft');
    const old = latest.request;
    await act(async () => loginSurface('u2')); await h.ready();
    expect(musicIdentityCoordinator.getSnapshot()).toBe('ready');
    expect(screen.getByRole('button', { name: 'first publish' })).toBeDisabled();
    await act(async () => { await old('public'); });
    expect(backend.publish).not.toHaveBeenCalled(); expect(h.writes).toEqual([]);
  });
  it.each([false, true])('does not read Music until both consumer and scope readiness are verified (%s)', async ready => {
    if (!ready) await readyMusic(); const backend = musicBackend();
    const h = musicPublishHarness(<Consumer ready={ready} />); await h.ready();
    expect(screen.getByRole('button', { name: 'first publish' })).toBeDisabled(); expect(backend.dashboard).not.toHaveBeenCalled(); expect(h.writes).toEqual([]);
  });
  it('refreshes shared confirmed state on focus and online without publication writes', async () => {
    await readyMusic(); const backend = musicBackend();
    const h = musicPublishHarness(<Consumer />, { public_music: 'Yes' }); await h.ready(); await screen.findByText('first:needs-attention');
    backend.mode = 'public'; await act(async () => window.dispatchEvent(new Event('focus'))); await screen.findByText('first:published');
    backend.mode = 'private'; await act(async () => window.dispatchEvent(new Event('online'))); await screen.findByText('first:needs-attention');
    expect(h.writes).toEqual([]); expect(backend.publish).not.toHaveBeenCalled();
  });
  it('refreshes the owner controller after another tab finishes publication, without requiring a second focus', async () => {
    await readyMusic(); const backend = musicBackend();
    const h = musicPublishHarness(<><Consumer /><Consumer label="second" /></>); await h.ready(); await screen.findByText('first:draft');
    // Tab A has acknowledged Yes but its backend publication is still pending.
    h.saved = { ...h.saved, public_music: 'Yes' };
    await act(async () => window.dispatchEvent(new Event('focus')));
    await screen.findByText('first:needs-attention');
    expect(latest.state.confirmed).toMatchObject({ profile: 'Yes', mode: 'private' });
    expect(backend.dashboard).toHaveBeenCalledTimes(2);
    // Tab A completes after B's focus read; only its final storage signal arrives.
    backend.mode = 'public';
    await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: 'explorers-music-publication-verified/v1', newValue: JSON.stringify({ version: 1, accountDocumentId: ACCOUNT, eventId: 'tab-a-complete' }) })));
    await screen.findByText('first:published'); await screen.findByText('second:published');
    expect(backend.dashboard).toHaveBeenCalledTimes(3);
    expect(h.writes).toEqual([]); expect(backend.publish).not.toHaveBeenCalled();
  });
  it('does not lose a final signal that arrives while an older focus read is still in flight', async () => {
    await readyMusic(); const backend = musicBackend();
    const h = musicPublishHarness(<Consumer />, { public_music: 'Yes' }); await h.ready(); await screen.findByText('first:needs-attention');
    let finish!: (value: Awaited<ReturnType<typeof backend.dashboard>>) => void;
    backend.dashboard.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(backend.dashboard).toHaveBeenCalledTimes(2));
    backend.mode = 'public';
    await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: 'explorers-music-publication-verified/v1', newValue: JSON.stringify({ version: 1, accountDocumentId: ACCOUNT, eventId: 'tab-a-complete' }) })));
    await act(async () => finish({ queueRevision: 0, songs: [], currentlyPlaying: null, playedSongs: [], publication: { mode: 'private', publicSlug: 'public-slug-123' } }));
    await screen.findByText('first:published');
    expect(backend.dashboard).toHaveBeenCalledTimes(3); expect(h.writes).toEqual([]);
  });
  it('filters final signals by account and stops their reads when the consumer loses readiness or leaves', async () => {
    await readyMusic(); const backend = musicBackend();
    const h = musicPublishHarness(<Consumer />); await h.ready(); await screen.findByText('first:draft');
    const signal = (accountDocumentId: string) => window.dispatchEvent(new StorageEvent('storage', { key: 'explorers-music-publication-verified/v1', newValue: JSON.stringify({ version: 1, accountDocumentId, eventId: 'external-complete' }) }));
    await act(async () => signal('another-account'));
    expect(backend.dashboard).toHaveBeenCalledTimes(1);
    h.rerenderChild(<Consumer ready={false} />);
    await act(async () => signal(ACCOUNT));
    expect(backend.dashboard).toHaveBeenCalledTimes(1);
    h.unmount(); await act(async () => signal(ACCOUNT));
    expect(backend.dashboard).toHaveBeenCalledTimes(1); expect(h.writes).toEqual([]);
  });
  it('rejects a retained callback after its consumer loses readiness even if another consumer stays ready', async () => {
    await readyMusic(); const backend = musicBackend();
    const h = musicPublishHarness(<><Consumer label="second" /><Consumer /></>); await h.ready(); await screen.findByText('first:draft');
    const old = latest.request;
    h.rerenderChild(<><Consumer label="second" /><Consumer ready={false} /></>);
    expect(screen.getByRole('button', { name: 'first publish' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'second publish' })).toBeEnabled();
    await act(async () => { await old('public'); });
    expect(backend.publish).not.toHaveBeenCalled(); expect(h.writes).toEqual([]);
  });
  it('keeps StrictMode subscriptions live and refreshes after leaving and reentering a route', async () => {
    await readyMusic(); const backend = musicBackend();
    const h = musicPublishHarness(<StrictMode><Consumer /></StrictMode>); await h.ready(); await screen.findByText('first:draft');
    const previous = latest.request;
    await act(async () => h.rerenderChild(<div>Another route</div>));
    await act(async () => { await previous('public'); });
    expect(h.writes).toEqual([]);
    backend.mode = 'public'; h.saved = { ...h.saved, public_music: 'Yes' };
    h.rerenderChild(<StrictMode><Consumer /></StrictMode>);
    await screen.findByText('first:published'); expect(backend.publish).not.toHaveBeenCalled();
  });
  it('notifies availability and the scoped dashboard only after backend publication is verified', async () => {
    await readyMusic(); const backend = musicBackend();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const notification = vi.fn(); window.addEventListener('explorers-music-publication-verified/v1', notification);
    const h = musicPublishHarness(<Consumer />); await h.ready(); await screen.findByText('first:draft');
    let finish!: () => void;
    backend.publish.mockImplementationOnce(async mode => { await new Promise<void>(resolve => { finish = resolve; }); backend.mode = mode; return { version: 'music-publication/v1', publication: { mode, publicSlug: 'public-slug-123' } }; });
    try {
      fireEvent.click(screen.getByRole('button', { name: 'first publish' }));
      await waitFor(() => expect(backend.publish).toHaveBeenCalledTimes(1));
      expect(h.saved.public_music).toBe('Yes');
      expect(notification).not.toHaveBeenCalled(); expect(invalidate).not.toHaveBeenCalled();
      await act(async () => finish()); await screen.findByText('first:published');
      expect(notification).toHaveBeenCalledTimes(1);
      expect((notification.mock.calls[0][0] as CustomEvent).detail).toEqual({ version: 1, accountDocumentId: ACCOUNT, eventId: expect.any(String) });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: musicWorkspaceQueryKey({ userDocumentId: 'u1', accountDocumentId: ACCOUNT }) });
      // The originating entry is already verified; its own event must not queue
      // another read against the same writer or recursively notify itself.
      await act(async () => {});
      expect(backend.dashboard).toHaveBeenCalledTimes(3); expect(notification).toHaveBeenCalledTimes(1);
    } finally { window.removeEventListener('explorers-music-publication-verified/v1', notification); }
  });
  it('returns an Unlisted capability only to the caller, never the shared state or browser storage', async () => {
    await readyMusic(); const backend = musicBackend();
    const capability = 'a'.repeat(43);
    backend.publish.mockImplementationOnce(async mode => { backend.mode = mode; return { version: 'music-publication/v1', publication: { mode: 'unlisted', publicSlug: 'public-slug-123' }, capability }; });
    const h = musicPublishHarness(<Consumer />); await h.ready(); await screen.findByText('first:draft');
    let outcome: unknown;
    await act(async () => { outcome = await latest.request('unlisted'); });
    expect(outcome).toMatchObject({ status: 'verified', response: { capability } });
    expect(JSON.stringify(latest.state)).not.toContain(capability);
    expect(JSON.stringify(sessionStorage)).not.toContain(capability); expect(JSON.stringify(localStorage)).not.toContain(capability);
    expect(h.writes.every(write => !JSON.stringify(write).includes(capability))).toBe(true);
  });
  it('stops the remaining publication stages if its requesting consumer loses readiness during a save', async () => {
    await readyMusic(); const backend = musicBackend();
    const h = musicPublishHarness(<><Consumer label="second" /><Consumer /></>); await h.ready(); await screen.findByText('first:draft');
    let finish!: () => void; h.pauseMutation(new Promise<void>(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'first publish' }));
    await waitFor(() => expect(h.writes).toHaveLength(1));
    h.rerenderChild(<><Consumer label="second" /><Consumer ready={false} /></>);
    await act(async () => finish());
    expect(backend.publish).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'first publish' })).toBeDisabled();
  });
});
