import type { PoolClient } from "pg";

export type PublicMusicInvalidationKind =
  | "publication_changed"
  | "guest_controls_changed"
  | "playback_changed"
  | "queue_changed"
  | "playlists_changed";

export const PUBLIC_MUSIC_MUTATION_REVISION_COMPATIBILITY = [
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
] as const satisfies readonly (readonly [string, PublicMusicInvalidationKind, string, string])[];

export async function advancePublicMusicSnapshotRevision(
  client: Pick<PoolClient, "query">,
  musicUserId: number,
  kind: PublicMusicInvalidationKind,
): Promise<number> {
  const result = await client.query(
    "UPDATE users SET public_snapshot_revision=public_snapshot_revision+1 WHERE id=$1 RETURNING public_snapshot_revision",
    [musicUserId],
  );
  if (result.rowCount !== 1) throw new Error("Public Music snapshot revision authority is unavailable.");
  const revision = Number(result.rows[0]?.public_snapshot_revision);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("Public Music snapshot revision authority is invalid.");
  await client.query("SELECT pg_notify('music_public_change',$1)", [
    JSON.stringify({ musicUserId, kind, revision }),
  ]);
  return revision;
}
