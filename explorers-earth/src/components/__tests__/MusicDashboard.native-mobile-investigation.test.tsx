import { act, cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import MusicDashboard from '../MusicDashboard';
import { musicWorkspaceClient, type TunesDashboardData } from '../../hooks/useTunesDashboard';
import { musicIdentityCoordinator } from '../../features/music/musicApi';
import { loginSurface, surfaceHarness } from '../../features/navigation/__tests__/surfaceHarness';
import { readyMusic } from '../../features/music/__tests__/musicPublishHarness';
import useAuthStore from '../../store/store';

vi.mock('react-player', () => ({ default: () => null }));

const scope = { userDocumentId: 'investigation-owner', accountDocumentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
const owned = { id: 1, name: 'Owned list', description: null, isVisibleToGuests: false, songs: [] };
const data = {
  playlists: [owned],
  dashboard: { queueRevision: 0, songs: [], currentlyPlaying: null, playedSongs: [], publication: { mode: 'private' as const, publicSlug: 'investigation-slug' } },
  entitlement: { state: 'included' as const, coreRead: true, coreMutation: true, paidMutation: false, maxAgeSeconds: 600 },
  playlist: null, guestUrl: null, localUser: null, identityStatus: musicIdentityCoordinator.getSnapshot(), retryIdentity: vi.fn(async () => undefined),
  isLoading: false, error: null, refetch: vi.fn(async () => undefined),
} satisfies TunesDashboardData;

// This mounts the actual collection, Dashboard selection state and PlaylistPanel.
// It tests DOM/state boundaries only: jsdom has no browser geometry or touch layout.
describe('native mobile failure selection investigation', () => {
  beforeEach(async () => {
    sessionStorage.clear(); musicIdentityCoordinator.reset();
    await readyMusic(scope.userDocumentId, scope.accountDocumentId);
    loginSurface(scope.userDocumentId, scope.accountDocumentId);
    vi.spyOn(musicWorkspaceClient, 'loadDashboard').mockResolvedValue(data.dashboard);
  });
  afterEach(() => {
    cleanup(); useAuthStore.getState().logout(); musicIdentityCoordinator.reset(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  async function mount() {
    const h = surfaceHarness(<MusicDashboard data={data} scope={scope} complete />, {
      initial: { documentId: scope.accountDocumentId, public_music: 'No', pinned_nav_tabs: ['public_profile', 'public_books'] },
    });
    await act(async () => undefined); await h.ready();
    await userEvent.click(screen.getByRole('button', { name: 'Open Owned list' }));
    return h;
  }
  it('opens the exact native target and retains selection across an equivalent playlist refresh', async () => {
    const h = await mount();
    expect(screen.getByRole('tabpanel', { name: 'Owned list' })).toBeVisible();
    h.rerenderChild(<MusicDashboard data={{ ...data, playlists: [{ ...owned, songs: [] }] }} scope={scope} complete />);
    expect(screen.getByRole('tabpanel', { name: 'Owned list' })).toBeVisible();
  });
  it('demonstrates selection loss after a controlled omitted playlist snapshot', async () => {
    const h = await mount();
    expect(screen.getByRole('tabpanel', { name: 'Owned list' })).toBeVisible();
    h.rerenderChild(<MusicDashboard data={{ ...data, playlists: [] }} scope={scope} complete />);
    expect(screen.queryByRole('tabpanel', { name: 'Owned list' })).not.toBeInTheDocument();
    h.rerenderChild(<MusicDashboard data={data} scope={scope} complete />);
    expect(screen.getByRole('button', { name: 'Open Owned list' })).toBeVisible();
    expect(screen.queryByRole('tabpanel', { name: 'Owned list' })).not.toBeInTheDocument();
  });
});
