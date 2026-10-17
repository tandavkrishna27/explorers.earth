import { describe, expect, it } from 'vitest';
import { musicPermissionOracle } from '../../../../../test-fixtures/music-permission-oracle';
import type { PublicMusicResource, PublicMusicSong } from '../publicMusicClient';
import { getMusicAccentInk, getMusicFeaturedCards } from '../publicMusicPresentation';

function song(id: string, status: PublicMusicSong['status']): PublicMusicSong {
  return { id: id.repeat(43), youtubeId: 'abcdefghijk', title: id, artist: 'Artist', thumbnailUrl: null, position: 0, status, playedAt: status === 'played' ? '2026-08-31T00:00:00Z' : null };
}
function resource(mask: number): PublicMusicResource {
  return {
    version: 'music-public-resource/v1', revision: 1, user: { username: 'listener', venueName: null },
    permissions: { allowSongRequests: Boolean(mask & 1), allowGuestPlayOnDevice: Boolean(mask & 2), allowPlaylistSharing: Boolean(mask & 4), allowRecentlyPlayedVisibility: Boolean(mask & 8), allowQueueVisibility: Boolean(mask & 16) },
    currentlyPlaying: song('C', 'playing'), queue: { items: [song('Q', 'queued')], total: 1, truncated: false },
    recentlyPlayed: { items: [song('H', 'played')], total: 1, truncated: false },
    playlists: { items: [{ id: 'L'.repeat(43), name: 'Playlist', description: null, songs: { items: [song('S', 'saved')], total: 1, truncated: false } }], total: 1, truncated: false },
  };
}
describe('public Music presentation', () => {
  // A raw-field mapping would leak the deliberately populated denied values.
  it.each(musicPermissionOracle)('filters featured music for mask %i', (mask, _r, _d, _p, _h, queue, current) => {
    expect(getMusicFeaturedCards(resource(mask)).map(card => [card.source, card.song.title])).toEqual([
      ...(current ? [['current', 'C']] : []), ...(queue ? [['queue', 'Q']] : []),
    ]);
  });
  it('bounds artwork to four upcoming songs, preserving order and source keys', () => {
    const value = resource(31);
    value.queue.items = ['C', 'B', 'D', 'E', 'F'].map(id => song(id, 'queued'));
    const before = structuredClone(value);
    expect(getMusicFeaturedCards(value).map(card => card.key)).toEqual(['current:' + 'C'.repeat(43), ...['C','B','D','E'].map(id => 'queue:' + id.repeat(43))]);
    expect(value).toEqual(before);
  });
  it('never promotes a saved or played song into the host artwork', () => {
    const value = resource(31); value.currentlyPlaying = null; value.queue.items = [];
    expect(getMusicFeaturedCards(value)).toEqual([]);
  });
  it('labels a queue-only source honestly', () => {
    const value = resource(16); value.currentlyPlaying = null;
    expect(getMusicFeaturedCards(value).map(card => card.source)).toEqual(['queue']);
  });
  it.each([['#000000','#ffffff'],['#FFFFFF','#000000'],['#10b981','#000000'],['#0f172a','#ffffff'],['invalid','#000000']])('uses readable button ink for %s', (accent, expected) => {
    expect(getMusicAccentInk(accent)).toBe(expected);
  });
});
