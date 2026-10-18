import type { PublicMusicResource, PublicMusicSong } from './publicMusicClient';
import { derivePublicMusicViewPolicy } from './publicMusicViewPolicy';

export type MusicFeaturedSource = 'current' | 'queue';
export interface MusicFeaturedCard { key: string; source: MusicFeaturedSource; song: PublicMusicSong }

export function getMusicFeaturedCards(resource: PublicMusicResource): MusicFeaturedCard[] {
  const policy = derivePublicMusicViewPolicy(resource);
  const cards: MusicFeaturedCard[] = [];
  if (policy.currentVisible && resource.currentlyPlaying) cards.push({ key: `current:${resource.currentlyPlaying.id}`, source: 'current', song: resource.currentlyPlaying });
  if (policy.queueVisible) for (const song of resource.queue.items.slice(0, 4)) cards.push({ key: `queue:${song.id}`, source: 'queue', song });
  return cards;
}

export { getAccentInk as getMusicAccentInk } from '../PublicHome/utils/accentInk';
