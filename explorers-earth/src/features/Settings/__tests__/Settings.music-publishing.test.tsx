import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Settings from '../Settings';
import { loginSurface, surfaceHarness } from '../../navigation/__tests__/surfaceHarness';
import useAuthStore from '../../../store/store';
import MusicDashboard from '../../../components/MusicDashboard';
import { musicBackend, readyMusic } from '../../music/__tests__/musicPublishHarness';
import { musicIdentityCoordinator, musicApi } from '../../music/musicApi';
import { musicWorkspaceClient } from '../../../hooks/useTunesDashboard';
import { verifyMusicPin } from '../../music/musicPublicationReadiness';
import { MusicClientError } from '../../../lib/localTunesApiClient';
import { Route, Routes } from 'react-router-dom';
import { PublicMusicAvailabilityProvider, usePublicMusicAvailability } from '../../music/PublicMusicAvailabilityProvider';
const usePublicProfileShell = vi.hoisted(() => vi.fn());
vi.mock('../../PublicHome/api/usePublicProfileShell', () => ({ usePublicProfileShell }));
vi.mock('../../Profile/api/useCanonicalAccount', () => ({ useCanonicalAccount: () => ({
  data: { id: 'a1', revision: 1 }, isLoading: false,
}) }));
vi.mock('../components/ProfileAccountSettings', () => ({ default: () => null }));
vi.mock('../components/BillingTab', () => ({ default: () => null }));
vi.mock('../components/LanguageSelector', () => ({ default: () => null, LANGUAGES: [{ code: 'en', name: 'English' }] }));
vi.mock('react-player', () => ({ default: () => null }));
const dashboard = { playlists: [], dashboard: { queueRevision: 0, songs: [], currentlyPlaying: null, playedSongs: [], publication: { mode: 'private' as const, publicSlug: 'public-slug-123' } },
  entitlement: { state: 'included' as const, coreRead: true, coreMutation: true, paidMutation: false, maxAgeSeconds: 600 }, isLoading: false, error: null, refetch: vi.fn() };
const musicPage = <MusicDashboard data={dashboard} scope={{ userDocumentId: 'u1', accountDocumentId: 'a1' }} complete />;
const openVisibility = () => fireEvent.click(screen.getByRole('button', { name: /Public Visibility/i }));
const control = () => screen.getByRole('switch', { name: 'Music public visibility' });
const musicPin = () => screen.getByRole('checkbox', { name: 'Pin Music Tab' });
const musicPinRow = () => musicPin().closest('label')!.parentElement!.parentElement!;
const openPins = () => fireEvent.click(screen.getByRole('button', { name: /Pinned Navigation Tabs/ }));
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; };
function PublicProbe() { const availability = usePublicMusicAvailability(); return <div>Public tab:{availability.state}</div>; }
describe('Settings unified Music visibility', () => {
  beforeEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); musicIdentityCoordinator.reset(); loginSurface(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 }))); });
  afterEach(() => { cleanup(); useAuthStore.getState().logout(); musicIdentityCoordinator.reset(); vi.unstubAllGlobals(); });
  it('keeps the Music pin hint checking while the real provider read is pending', async () => {
    await readyMusic(); const backend = musicBackend('public');
    let finish!: (value: Awaited<ReturnType<typeof musicWorkspaceClient.loadDashboard>>) => void;
    backend.dashboard.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const h = surfaceHarness(<Settings />); await h.ready(); openPins();
    await waitFor(() => expect(backend.dashboard).toHaveBeenCalledTimes(1));
    expect(musicPin()).toBeChecked();
    expect.soft(musicPinRow()).toHaveTextContent('Checking Music publication…');
    expect.soft(musicPinRow()).not.toHaveTextContent('Visibility off');
    expect(h.writes).toEqual([]);
    await act(async () => finish({ queueRevision: 0, songs: [], currentlyPlaying: null, playedSongs: [], publication: { mode: 'public', publicSlug: 'public-slug-123' } }));
    await waitFor(() => expect(musicPinRow()).toHaveTextContent(/^♫Music Tab$/));
    expect(h.saved.pinned_nav_tabs).toEqual(['public_profile', 'public_music', 'public_books']);
    expect(backend.publish).not.toHaveBeenCalled();
  });
  it('keeps the Music pin hint uncertain during outage and preserves explicit saved-pin removal', async () => {
    await readyMusic(); const backend = musicBackend('public');
    backend.dashboard.mockRejectedValue(new Error('offline'));
    const h = surfaceHarness(<Settings />); await h.ready(); openVisibility(); openPins();
    await screen.findByRole('alert');
    expect.soft(musicPinRow()).toHaveTextContent('Music publication was not confirmed. Refresh or retry the previous action.');
    expect.soft(musicPinRow()).not.toHaveTextContent('Visibility off');
    expect(musicPin()).toBeChecked(); expect(h.writes).toEqual([]);
    expect(h.saved.pinned_nav_tabs).toEqual(['public_profile', 'public_music', 'public_books']);
    await waitFor(() => expect(musicPin()).toBeEnabled()); fireEvent.click(musicPin());
    await waitFor(() => expect(musicPin()).not.toBeChecked());
    expect(h.writes.map(write => write.variables.data)).toEqual([{ pinned_nav_tabs: ['public_profile', 'public_books'] }]);
    expect(h.saved.public_music).toBe('Yes'); expect(backend.publish).not.toHaveBeenCalled();
  });
  it.each([
    ['draft', 'No', 'private', false, 'Music is private.'],
    ['published', 'Yes', 'public', true, null],
    ['mismatched', 'No', 'public', true, 'Music sharing needs attention. Review or make it private.'],
    ['hidden saved', 'No', 'private', true, 'Music sharing needs attention. Review or make it private.'],
    ['unlisted', 'Yes', 'unlisted', true, 'Music sharing needs attention. Review or make it private.'],
  ] as const)('shows a truthful Music pin hint for %s without changing saved pins', async (_name, profile, mode, pinned, hint) => {
    await readyMusic(); const backend = musicBackend(mode);
    const pins = ['public_profile', ...(pinned ? ['public_music'] : []), 'public_books'];
    const h = surfaceHarness(<Settings />, { initial: { public_music: profile, pinned_nav_tabs: pins } }); await h.ready(); openVisibility();
    await waitFor(() => expect(control()).toBeEnabled()); openPins();
    if (hint) expect.soft(musicPinRow()).toHaveTextContent(hint);
    else expect.soft(musicPinRow()).toHaveTextContent(/^♫Music Tab$/);
    expect.soft(musicPinRow()).not.toHaveTextContent('Visibility off');
    expect(musicPin()).toHaveProperty('checked', pinned);
    expect(h.saved.pinned_nav_tabs).toEqual(pins); expect(h.writes).toEqual([]);
    if (pinned && profile === 'No') {
      fireEvent.click(musicPin()); await waitFor(() => expect(musicPin()).not.toBeChecked());
      expect(h.writes.map(write => write.variables.data)).toEqual([{ pinned_nav_tabs: ['public_profile', 'public_books'] }]);
      expect(h.saved.public_music).toBe('No');
    }
    expect(backend.publish).not.toHaveBeenCalled();
  });
  it('shows a not-ready Music pin hint without calling missing account readiness visibility off', async () => {
    const backend = musicBackend('public');
    const h = surfaceHarness(<Settings />); await h.ready(); openPins();
    expect(musicPinRow()).toHaveTextContent('Music is not ready for this account. Other settings remain available.');
    expect(musicPinRow()).not.toHaveTextContent('Visibility off');
    expect(musicPin()).toBeChecked(); expect(h.writes).toEqual([]);
    expect(backend.dashboard).not.toHaveBeenCalled(); expect(backend.publish).not.toHaveBeenCalled();
  });
  it('keeps the Music pin hint truthful while saving and after a surfaced conflict', async () => {
    await readyMusic(); const backend = musicBackend();
    let reject!: (error: Error) => void;
    backend.publish.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const h = surfaceHarness(<Settings />, { initial: { public_music: 'No', pinned_nav_tabs: ['public_profile', 'public_books'] } }); await h.ready(); openVisibility(); openPins();
    await waitFor(() => expect(control()).toBeEnabled()); fireEvent.click(control());
    await waitFor(() => expect(backend.publish).toHaveBeenCalledTimes(1));
    expect.soft(musicPinRow()).toHaveTextContent('Saving and verifying Music publication…');
    expect.soft(musicPinRow()).not.toHaveTextContent('Visibility off');
    await act(async () => reject(new MusicClientError('AUTH_UNAVAILABLE', 409, 'expired', undefined, 'PUBLICATION_REPLAY_EXPIRED')));
    await screen.findByRole('button', { name: 'Confirm new public action' });
    expect(musicPinRow()).toHaveTextContent('Music changed or the previous action expired. Confirm a new action after reviewing the current state.');
    expect(musicPinRow()).not.toHaveTextContent('Visibility off');
    expect(h.saved.pinned_nav_tabs).toEqual(['public_profile', 'public_books']);
  });
  it('keeps other public visibility rows available while Books is saving and verifying', async () => {
    await readyMusic(); musicBackend('public');
    const h = surfaceHarness(<Settings />, { initial: { pinned_nav_tabs: ['public_profile', 'public_music'] } }); await h.ready(); openVisibility();
    const pause = deferred(); h.pauseMutation(pause.promise);
    const books = screen.getByRole('checkbox', { name: 'Books Tab' });
    const apps = screen.getByRole('checkbox', { name: 'Apps & Tools Tab' });
    fireEvent.click(books);
    await waitFor(() => expect(books).toBeDisabled());
    expect(apps).toBeEnabled();
    await act(async () => { pause.resolve(); });
    await waitFor(() => expect(books).toBeEnabled());
  });
  it('puts Music in the named Public Visibility panel and names every ordinary checkbox', async () => {
    musicBackend();
    const h = surfaceHarness(<Settings />); await h.ready();
    fireEvent.click(screen.getByRole('button', { name: /Public Visibility/i }));
    const panel = screen.getByRole('region', { name: 'Public visibility settings' });
    expect(within(panel).getByRole('switch', { name: 'Music public visibility' })).toBeVisible();
    for (const name of ['Profile Tab', 'Places Tab', 'Guides Tab', 'Movies & Shows Tab', 'Books Tab', 'Games Tab', 'Apps & Tools Tab', 'Products Tab', 'People Tab']) expect(within(panel).getByRole('checkbox', { name })).toBeInTheDocument();
    expect(screen.queryByText(/This saved preference does not confirm Music/)).not.toBeInTheDocument();
  });
  it('renders Music as a compact icon-and-label row with its switch at the right and no duplicate section label', async () => {
    await readyMusic(); musicBackend('public');
    const h = surfaceHarness(<Settings />); await h.ready(); openVisibility();
    await waitFor(() => expect(control()).toBeChecked());
    const panel = screen.getByRole('region', { name: 'Public visibility settings' });
    const label = within(panel).getByText('Music Tab');
    const labelGroup = label.parentElement!;
    const row = labelGroup.parentElement!;
    expect(labelGroup).toHaveClass('flex', 'items-center', 'gap-2');
    expect(within(labelGroup).getByText('♫')).toHaveAttribute('aria-hidden', 'true');
    expect(row).toHaveClass('flex', 'items-center', 'justify-between');
    expect(row.firstElementChild).toBe(labelGroup);
    expect(row.lastElementChild).toContainElement(control());
    expect(label.compareDocumentPosition(control()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(panel).queryByText('Public Visibility')).not.toBeInTheDocument();
    const status = document.getElementById(control().getAttribute('aria-describedby')!)!;
    expect(status).toHaveTextContent('Music is public.'); expect(status).toHaveClass('sr-only');
  });
  it('keeps compact-row attention and Make private recovery accessible without a second visibility label', async () => {
    await readyMusic(); const backend = musicBackend('unlisted');
    const h = surfaceHarness(<Settings />, { initial: { public_music: 'No' } }); await h.ready(); openVisibility();
    const recover = await screen.findByRole('button', { name: 'Make private' });
    const status = document.getElementById(control().getAttribute('aria-describedby')!)!;
    expect(status).toBeVisible(); expect(status).not.toHaveClass('sr-only'); expect(control()).not.toBeChecked();
    fireEvent.click(recover); await waitFor(() => expect(control()).toBeEnabled());
    expect(backend.publish.mock.calls.map(call => call[0])).toEqual(['private']);
    expect(h.writes.map(write => write.variables.data)).toEqual([{ public_music: 'No', pinned_nav_tabs: ['public_profile', 'public_books'] }]);
    expect(within(screen.getByRole('region', { name: 'Public visibility settings' })).queryByText('Public Visibility')).not.toBeInTheDocument();
  });
  it.each(['Settings', 'Music'])('publishes from %s and verifies On/Off after navigating to the other surface', async surface => {
    await readyMusic(); const backend = musicBackend();
    const playlists = vi.spyOn(musicWorkspaceClient, 'setPlaylistVisibility');
    const guests = vi.spyOn(musicWorkspaceClient, 'updateGuestControls');
    const first = surface === 'Settings' ? <Settings /> : musicPage;
    const second = surface === 'Settings' ? musicPage : <Settings />;
    const h = surfaceHarness(first, { verifyMusicPin, initial: { public_music: 'No', pinned_nav_tabs: ['public_profile', 'public_music', 'public_books'] } }); await h.ready();
    if (surface === 'Settings') openVisibility();
    await waitFor(() => expect(control()).toBeEnabled());
    expect(control()).not.toBeChecked();
    fireEvent.click(control());
    await waitFor(() => expect(control()).toBeChecked());
    h.rerenderChild(second);
    if (surface === 'Music') openVisibility();
    await waitFor(() => expect(control()).toBeChecked());
    fireEvent.click(control());
    await waitFor(() => expect(screen.getByText('Music is private.')).toBeInTheDocument());
    h.rerenderChild(first);
    if (surface === 'Settings') openVisibility();
    await waitFor(() => expect(control()).toBeEnabled());
    expect(control()).not.toBeChecked();
    expect(h.writes.map(write => write.variables)).toEqual([
      { documentId: 'a1', data: { public_music: 'Yes' } },
      { documentId: 'a1', data: { public_music: 'No', pinned_nav_tabs: ['public_profile', 'public_books'] } },
    ]);
    expect(backend.publish.mock.calls.map(call => call[0])).toEqual(['public', 'private']);
    expect(playlists).not.toHaveBeenCalled(); expect(guests).not.toHaveBeenCalled();
  });
  it('shares pending disablement and an honest failed-save alert across both entry points', async () => {
    await readyMusic(); const backend = musicBackend();
    let reject!: (error: Error) => void;
    backend.publish.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const h = surfaceHarness(<><Settings />{musicPage}</>, { initial: { public_music: 'No', pinned_nav_tabs: ['public_profile', 'public_music', 'public_books'] } }); await h.ready(); openVisibility();
    const controls = screen.getAllByRole('switch', { name: 'Music public visibility' });
    await waitFor(() => expect(controls.every(item => !item.hasAttribute('disabled'))).toBe(true));
    fireEvent.click(controls[0]);
    await waitFor(() => expect(backend.publish).toHaveBeenCalledTimes(1));
    controls.forEach(item => { expect(item).toBeDisabled(); expect(item).not.toBeChecked(); });
    await act(async () => reject(new Error('backend unavailable')));
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    screen.getAllByRole('alert').forEach(alert => { expect(alert).toHaveTextContent(/not confirmed/i); expect(alert).toHaveAttribute('tabindex', '0'); });
    expect(h.saved.pinned_nav_tabs).toEqual(['public_profile', 'public_music', 'public_books']);
    controls.forEach(item => expect(item).not.toBeChecked());
  });
  it.each(['unenrolled', 'disabled', 'outage'])('keeps ordinary Settings usable when Music is %s', async problem => {
    const backend = musicBackend();
    if (problem !== 'unenrolled') await readyMusic();
    if (problem === 'disabled') musicIdentityCoordinator.reportFailure(new MusicClientError('FEATURE_DISABLED', 503, 'disabled'));
    if (problem === 'outage') backend.dashboard.mockRejectedValue(new Error('offline'));
    const ensure = vi.spyOn(musicApi, 'ensureIdentity'); ensure.mockClear();
    const h = surfaceHarness(<Settings />, { initial: { public_music: 'No' } }); await h.ready(); openVisibility();
    await waitFor(() => expect(control()).toBeDisabled());
    fireEvent.click(screen.getByRole('checkbox', { name: 'Books Tab' }));
    await screen.findByRole('dialog', { name: 'Unpublish Books' });
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish Books' }));
    await waitFor(() => expect(h.writes).toHaveLength(1));
    expect(h.writes[0].variables.data).toEqual({ public_books: 'No', pinned_nav_tabs: ['public_profile', 'public_music'] });
    expect(ensure).not.toHaveBeenCalled(); expect(backend.publish).not.toHaveBeenCalled();
    if (problem !== 'outage') expect(backend.dashboard).not.toHaveBeenCalled();
  });
  it.each(['private', 'unlisted', 'outage', 'public'] as const)('uses the real read-only verifier before a new Music pin (%s)', async mode => {
    await readyMusic(); const backend = musicBackend(mode === 'outage' ? 'public' : mode);
    if (mode === 'outage') backend.discover.mockRejectedValue(new Error('offline'));
    const h = surfaceHarness(<Settings />, { verifyMusicPin, initial: { pinned_nav_tabs: ['public_profile', 'public_books'] } }); await h.ready();
    fireEvent.click(screen.getByRole('button', { name: /Pinned Navigation Tabs/ }));
    const pin = screen.getByRole('checkbox', { name: 'Pin Music Tab' });
    if (mode === 'private' || mode === 'unlisted') { expect(pin).toBeDisabled(); expect(h.writes).toEqual([]); }
    else {
      await waitFor(() => expect(pin).toBeEnabled()); fireEvent.click(pin);
      if (mode === 'outage') { expect(await screen.findByRole('alert')).toHaveTextContent(/Could not verify publication/i); expect(h.writes).toEqual([]); }
      else { await waitFor(() => expect(pin).toBeChecked()); expect(h.writes.map(write => write.variables.data)).toEqual([{ pinned_nav_tabs: ['public_profile', 'public_books', 'public_music'] }]); }
    }
    expect(backend.publish).not.toHaveBeenCalled();
  });
  it('recovers a mounted not-public profile after the final backend verification, not the intermediate Yes flag', async () => {
    await readyMusic(); const backend = musicBackend();
    const refetch = vi.fn().mockResolvedValue(undefined);
    usePublicProfileShell.mockImplementation(() => ({
      data: { documentId: 'a1', username: 'owner', public_music: backend.mode === 'public' ? 'Yes' : 'No' },
      loading: false, error: null, refetch,
    }));
    let finish!: () => void;
    backend.publish.mockImplementationOnce(async mode => { await new Promise<void>(resolve => { finish = resolve; }); backend.mode = mode; return { version: 'music-publication/v1', publication: { mode, publicSlug: 'public-slug-123' } }; });
    const h = surfaceHarness(<><Settings /><Routes><Route path=":username/music" element={<PublicMusicAvailabilityProvider><PublicProbe /></PublicMusicAvailabilityProvider>} /></Routes></>,
      { route: '/owner/music', initial: { public_music: 'No' } }); await h.ready(); openVisibility();
    await screen.findByText('Public tab:not-public');
    await waitFor(() => expect(control()).toBeEnabled()); fireEvent.click(control());
    await waitFor(() => expect(backend.publish).toHaveBeenCalledTimes(1));
    expect(h.saved.public_music).toBe('Yes');
    await waitFor(() => expect(backend.discover).toHaveBeenCalled());
    await screen.findByText('Public tab:not-public');
    expect(control()).not.toBeChecked();
    await act(async () => finish());
    await screen.findByText('Public tab:available');
    await waitFor(() => expect(control()).toBeChecked());
    expect(refetch).toHaveBeenCalled();
  });
});
