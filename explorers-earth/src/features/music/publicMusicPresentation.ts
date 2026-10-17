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

export function getMusicAccentInk(accent: string): '#000000' | '#ffffff' {
  const color = /^#[a-f0-9]{6}$/i.test(accent) ? accent : '#10b981';
  const linear = (hex: string) => {
    const value = parseInt(hex, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = .2126 * linear(color.slice(1, 3)) + .7152 * linear(color.slice(3, 5)) + .0722 * linear(color.slice(5, 7));
  return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? '#000000' : '#ffffff';
}
