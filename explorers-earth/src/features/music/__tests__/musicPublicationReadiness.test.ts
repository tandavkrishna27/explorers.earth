import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMusicPublicationReadiness } from "../musicPublicationReadiness";
import * as readiness from '../musicPublicationReadiness';
import { musicBackend, readyMusic } from './musicPublishHarness';
import { musicIdentityCoordinator } from '../musicApi';
import { canonicalAccountFixture } from '../../../test/canonicalAccountFixture';
// readyMusic() makes the coordinator ready for this account; verifyMusicPin returns
// 'unknown' for any other, so the origin and the transaction scope must both use it.
const ACCOUNT = canonicalAccountFixture().id;
const OTHER_ACCOUNT = '22222222-2222-4222-8222-222222222222';

describe("owner Music publication readiness", () => {
  beforeEach(() => { vi.restoreAllMocks(); musicIdentityCoordinator.reset(); });
  it.each(['private', 'unlisted', 'public'] as const)('new pins require combined verified Public, with no write or nested coordinator (%s)', async mode => {
    await readyMusic(); const backend = musicBackend(mode);
    const tx = { read: vi.fn().mockResolvedValue({ scope: { userDocumentId: 'u1', accountDocumentId: ACCOUNT }, visibility: { public_music: 'Yes' } }), commit: vi.fn(), isCurrent: () => true };
    const verifier = (readiness as any).verifyMusicPin;
    expect(verifier).toBeTypeOf('function');
    expect(await verifier(tx, { userDocumentId: 'u1', accountDocumentId: ACCOUNT, generation: 1 })).toBe(mode === 'public' ? 'public' : 'not-public');
    expect(tx.commit).not.toHaveBeenCalled(); expect(backend.publish).not.toHaveBeenCalled();
  });
  it.each(['profile-hidden', 'wrong-account', 'not-ready', 'dashboard-outage', 'discovery-outage', 'wrong-slug', 'stale'] as const)('rejects a new pin when verification is %s', async problem => {
    if (problem !== 'not-ready') await readyMusic();
    const backend = musicBackend('public'); let current = true;
    const tx = { read: vi.fn().mockResolvedValue({ scope: { userDocumentId: 'u1', accountDocumentId: problem === 'wrong-account' ? OTHER_ACCOUNT : ACCOUNT }, visibility: { public_music: problem === 'profile-hidden' ? 'No' : 'Yes' } }), commit: vi.fn(), isCurrent: () => current };
    if (problem === 'dashboard-outage') backend.dashboard.mockRejectedValue(new Error('offline'));
    if (problem === 'discovery-outage') backend.discover.mockRejectedValue(new Error('offline'));
    if (problem === 'wrong-slug') backend.discover.mockResolvedValue({ version: 'music-public-descriptor/v1', publication: { mode: 'public', publicSlug: 'different-slug', revision: 1 } });
    if (problem === 'stale') backend.dashboard.mockImplementationOnce(async () => { current = false; return { queueRevision: 0, songs: [], currentlyPlaying: null, playedSongs: [], publication: { mode: 'public', publicSlug: 'public-slug-123' } }; });
    expect(await readiness.verifyMusicPin(tx as never, { userDocumentId: 'u1', accountDocumentId: ACCOUNT, generation: 1 })).toBe(problem === 'profile-hidden' ? 'not-public' : 'unknown');
    expect(tx.commit).not.toHaveBeenCalled(); expect(backend.publish).not.toHaveBeenCalled();
    if (['profile-hidden', 'wrong-account', 'not-ready'].includes(problem)) expect(backend.dashboard).not.toHaveBeenCalled();
    if (problem === 'stale') expect(backend.discover).not.toHaveBeenCalled();
  });
  it.each([
    [{ profilePreference: "No", publicationMode: "private", statusAvailable: true }, "hidden", "Hidden from profile", "Enable profile Music"],
    [{ profilePreference: "Yes", publicationMode: "private", statusAvailable: true }, "setup-required", "Profile enabled, Music not public", "Make Music public"],
    [{ profilePreference: "No", publicationMode: "public", statusAvailable: true }, "published-hidden", "Public link active, profile tab hidden", "Show on profile"],
    [{ profilePreference: "Yes", publicationMode: "public", statusAvailable: true }, "live", "Live on profile", "View as guest"],
    [{ profilePreference: "Yes", publicationMode: "public", statusAvailable: false }, "unavailable", "Status unavailable", "Retry status"],
  ] as const)("derives $1", (input, state, label, primaryAction) => {
    expect(getMusicPublicationReadiness(input)).toMatchObject({ state, label, primaryAction });
  });
});
