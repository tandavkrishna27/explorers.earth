import type { PublicMusicResource } from "./publicMusicClient";

export interface PublicMusicViewPolicy {
  requestEligible: boolean;
  playerEligible: boolean;
  currentVisible: boolean;
  queueVisible: boolean;
  historyVisible: boolean;
  playlistsVisible: boolean;
}

export function derivePublicMusicViewPolicy(
  resource: PublicMusicResource,
): PublicMusicViewPolicy {
  const currentVisible = resource.currentlyPlaying !== null
    && (resource.permissions.allowGuestPlayOnDevice || resource.permissions.allowQueueVisibility);
  const exposedPlayableSource = currentVisible
    || (resource.permissions.allowQueueVisibility && resource.queue.items.length > 0)
    || (resource.permissions.allowPlaylistSharing
      && resource.playlists.items.some((playlist) => playlist.songs.items.length > 0));

  return {
    requestEligible: resource.permissions.allowSongRequests,
    playerEligible: resource.permissions.allowGuestPlayOnDevice && exposedPlayableSource,
    currentVisible,
    queueVisible: resource.permissions.allowQueueVisibility,
    historyVisible: resource.permissions.allowRecentlyPlayedVisibility,
    playlistsVisible: resource.permissions.allowPlaylistSharing,
  };
}
