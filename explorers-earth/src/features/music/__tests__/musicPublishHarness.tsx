import type { ReactNode } from 'react';
import { canonicalAccountFixture } from '../../../test/canonicalAccountFixture';
import { vi } from 'vitest';
import { surfaceHarness, loginSurface } from '../../navigation/__tests__/surfaceHarness';
import { musicApi, musicIdentityCoordinator } from '../musicApi';
import { musicWorkspaceClient } from '../../../hooks/useTunesDashboard';
import { publicMusicClient, PublicMusicError } from '../publicMusicClient';
import type { MusicPublicationMode } from '../musicWorkspaceClient';

export async function readyMusic(userDocumentId = 'u1', accountDocumentId = canonicalAccountFixture().id) {
  vi.spyOn(musicApi, 'ensureIdentity').mockResolvedValue({} as never);
  await musicIdentityCoordinator.reconcile({ provider: 'google', authenticated: true, verified: true, userDocumentId, account: { documentId: accountDocumentId } });
}
export function musicBackend(initialMode: MusicPublicationMode = 'private') {
  let mode = initialMode;
  const dashboard = vi.spyOn(musicWorkspaceClient, 'loadDashboard').mockImplementation(async () => ({ queueRevision: 0, songs: [], currentlyPlaying: null, playedSongs: [], publication: { mode, publicSlug: 'public-slug-123' } }));
  const publish = vi.spyOn(musicWorkspaceClient, 'setPublication').mockImplementation(async next => {
    mode = next;
    return next === 'unlisted' ? { version: 'music-publication/v1', publication: { mode: next, publicSlug: 'public-slug-123' }, capability: 'secret-capability-value-12345678901234567890' }
      : { version: 'music-publication/v1', publication: { mode: next, publicSlug: 'public-slug-123' } };
  });
  const discover = vi.spyOn(publicMusicClient, 'discover').mockImplementation(async () => {
    if (mode !== 'public') throw new PublicMusicError('PUBLIC_NOT_FOUND');
    return { version: 'music-public-descriptor/v1', publication: { mode: 'public', publicSlug: 'public-slug-123', revision: 1 } };
  });
  return { dashboard, publish, discover, get mode() { return mode; }, set mode(next: MusicPublicationMode) { mode = next; } };
}
export function musicPublishHarness(child: ReactNode, initial: Record<string, unknown> = {}) {
  loginSurface();
  return surfaceHarness(child, { initial: { public_music: 'No', pinned_nav_tabs: ['public_profile', 'public_books'], ...initial } });
}
