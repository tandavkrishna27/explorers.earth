import { describe, expect, it } from "vitest";
import { advancePublicMusicSnapshotRevision, PUBLIC_MUSIC_MUTATION_REVISION_COMPATIBILITY } from "../repositories/publicMusicRevision";

describe("public Music mutation revision compatibility", () => {
  it("advances and transactionally publishes the exact low-cardinality invalidation", async () => {
    // Break caught: a committed public mutation increments the snapshot but never reaches
    // the cross-replica LISTEN channel, or leaks authority into the notification envelope.
    const calls: Array<{ text: string; parameters?: unknown[] }> = [];
    const client = {
      query: async (text: string, parameters?: unknown[]) => {
        calls.push({ text, parameters });
        if (text.startsWith("UPDATE users")) return { rowCount: 1, rows: [{ public_snapshot_revision: "42" }] };
        return { rowCount: 1, rows: [] };
      },
    };

    await expect(advancePublicMusicSnapshotRevision(client as never, 17, "queue_changed")).resolves.toBe(42);
    expect(calls).toEqual([
      expect.objectContaining({ text: expect.stringContaining("RETURNING public_snapshot_revision"), parameters: [17] }),
      { text: "SELECT pg_notify('music_public_change',$1)", parameters: [JSON.stringify({ musicUserId: 17, kind: "queue_changed", revision: 42 })] },
    ]);
  });
  it("keeps one explicit mutation-to-kind-to-transaction-to-revision oracle", () => {
    // Break caught: a new or legacy public-output mutation can silently bypass the one canonical snapshot revision.
    expect(PUBLIC_MUSIC_MUTATION_REVISION_COMPATIBILITY).toEqual([
      ["MusicPublicationOperationRepository.execute", "publication_changed", "publication-operation", "conditional"],
      ["MusicDomainRepository.createPlaylist", "playlists_changed", "playlist-collection", "accepted"],
      ["MusicDomainRepository.createPlaylistIdempotent", "playlists_changed", "playlist-collection", "accepted-not-replay"],
      ["MusicDomainRepository.updatePlaylist", "playlists_changed", "saved-playlist", "changed"],
      ["MusicDomainRepository.deletePlaylist", "playlists_changed", "saved-playlist", "deleted"],
      ["MusicDomainRepository.addPlaylistSong", "playlists_changed", "saved-playlist", "accepted"],
      ["MusicDomainRepository.addPlaylistSongIdempotent", "playlists_changed", "saved-playlist", "accepted-not-replay"],
      ["MusicDomainRepository.removePlaylistSong", "playlists_changed", "saved-playlist", "deleted"],
      ["MusicDomainRepository.reorderPlaylistSong", "playlists_changed", "saved-playlist", "changed"],
      ["MusicDomainRepository.setPlaylistVisibility", "playlists_changed", "saved-playlist", "changed"],
      ["MusicDomainRepository.replaceQueue", "queue_changed", "queue", "accepted-not-replay"],
      ["MusicDomainRepository.appendQueue", "queue_changed", "queue", "accepted-not-replay"],
      ["MusicDomainRepository.addSong", "queue_changed", "queue", "accepted"],
      ["MusicDomainRepository.addGuestSongIdempotent", "queue_changed", "queue", "accepted-not-replay"],
      ["MusicDomainRepository.updateSongPosition", "queue_changed", "queue", "changed"],
      ["MusicDomainRepository.removeSong", "queue_changed", "queue", "deleted"],
      ["MusicDomainRepository.removeSongs", "queue_changed", "queue", "deleted"],
      ["MusicDomainRepository.setPlaying", "playback_changed", "queue", "changed"],
      ["MusicDomainRepository.removeHistorySong", "playback_changed", "queue", "accepted-not-replay"],
      ["MusicDomainRepository.clearHistory", "playback_changed", "queue", "deleted"],
      ["MusicDomainRepository.updateGuestControls", "guest_controls_changed", "owner-state", "changed"],
      ["MusicDomainRepository.rotateGuestCapability", "publication_changed", "owner-state", "changed"],
      ["MusicDomainRepository.setPublicationMode", "publication_changed", "publication", "conditional"],
      ["MusicDomainRepository.revokeGuestCapability", "publication_changed", "owner-state", "changed"],
      ["MusicDomainRepository.setDiscoverable", "publication_changed", "owner-state", "changed"],
      ["MusicIdentityRepository.transitionIdentity", "publication_changed", "identity-lifecycle", "changed"],
      ["MusicIdentityRepository.suspendIdentity", "publication_changed", "identity-lifecycle", "changed"],
      ["MusicIdentityRepository.reactivateIdentity", "publication_changed", "identity-lifecycle", "changed"],
      ["MusicIdentityRepository.prepareDeletion", "publication_changed", "identity-lifecycle", "changed"],
      ["MusicIdentityRepository.cancelDeletion", "publication_changed", "identity-lifecycle", "changed"],
      ["MusicIdentityRepository.tombstoneIdentity", "publication_changed", "identity-lifecycle", "deleted"],
      ["MusicIdentityRepository.finalizeDeletion", "publication_changed", "identity-lifecycle", "deleted"],
    ]);
    expect(new Set(PUBLIC_MUSIC_MUTATION_REVISION_COMPATIBILITY.map(([method]) => method)).size)
      .toBe(PUBLIC_MUSIC_MUTATION_REVISION_COMPATIBILITY.length);
  });
});
