import { expect, type BrowserContext } from '@playwright/test';
import type { PublicMusicResource, PublicMusicSong } from '../../src/features/music/publicMusicClient';
import { fixtureState, installContainedRoutes, invalidateGuests, publicSlug } from './category-navigation';

const envelope = <T>(items: T[]) => ({ items, total: items.length, truncated: false });
const track = (id: string, title: string, status: PublicMusicSong['status'], position = 0): PublicMusicSong => ({
  id: id.repeat(43), youtubeId: position % 2 ? 'lmnopqrstuv' : 'abcdefghijk',
  title, artist: 'The exploratory sessions', thumbnailUrl: null, position, status,
  playedAt: status === 'played' ? '2026-08-28T10:00:00.000Z' : null,
});
export const populatedPublicResource: PublicMusicResource = {
  version: 'music-public-resource/v1', revision: 7,
  user: { username: 'fixture-owner', venueName: 'The Listening Room' },
  permissions: { allowSongRequests: true, allowGuestPlayOnDevice: true, allowPlaylistSharing: true, allowRecentlyPlayedVisibility: true, allowQueueVisibility: true },
  currentlyPlaying: track('C', 'Evening light', 'playing'),
  queue: envelope(['Coastal drive', 'After the rain', 'Small hours', 'Northern skies'].map((title, index) => track(String(index), title, 'queued', index + 1))),
  recentlyPlayed: envelope([track('H', 'Morning reflections', 'played')]),
  playlists: envelope([
    { id: 'L'.repeat(43), name: 'Slow Sunday', description: 'Space to slow down and listen.', songs: envelope([track('S', 'Golden hour', 'saved')]) },
    { id: 'M'.repeat(43), name: 'On the road', description: null, songs: envelope([track('T', 'Open horizons', 'saved')]) },
    { id: 'N'.repeat(43), name: 'Late night discoveries', description: null, songs: envelope<PublicMusicSong>([]) },
  ]),
};
export function resourceForMask(mask: number): PublicMusicResource {
  const value = structuredClone(populatedPublicResource);
  value.permissions = {
    allowSongRequests: Boolean(mask & 1), allowGuestPlayOnDevice: Boolean(mask & 2),
    allowPlaylistSharing: Boolean(mask & 4), allowRecentlyPlayedVisibility: Boolean(mask & 8), allowQueueVisibility: Boolean(mask & 16),
  };
  if (!(mask & 18)) value.currentlyPlaying = null;
  if (!(mask & 16)) value.queue = envelope([]);
  if (!(mask & 8)) value.recentlyPlayed = envelope([]);
  if (!(mask & 4)) value.playlists = envelope([]);
  return value;
}
export async function installMusicPresentationFixture(context: BrowserContext, origin: string, options: {
  resource: PublicMusicResource; preset?: string; wallpaperMode?: string;
  imageMode?: 'valid' | 'missing' | 'broken'; resourceDelay?: Promise<void>;
}) {
  let resource = structuredClone(options.resource);
  let imageMode = options.imageMode ?? 'valid';
  const artwork = origin + '/images/music-presentation-art.svg';
  const state = fixtureState({ public_music: 'Yes', pinned_nav_tabs: ['public_profile', 'public_music'] }, 'public');
  const setAppearance = (preset = 'cinematic-dark', wallpaperMode = 'solid-color', mode = imageMode) => {
    imageMode = mode;
    state.account.social_media.theme_settings = { ...state.account.social_media.theme_settings, preset, wallpaperMode, accentColor: '#10b981' };
    state.account.profile_picture = imageMode === 'missing' ? null : { url: artwork, alternativeText: 'Selected profile photo' };
    state.account.bg_picture = imageMode === 'missing' ? null : { url: artwork, alternativeText: 'Selected background' };
  };
  setAppearance(options.preset, options.wallpaperMode);
  state.revision = resource.revision;
  const guard = await installContainedRoutes(context, origin, state);
  // PublicGuideDetailPage resolves its selected guide through a singular `guide`
  // query; the shared category fixture deliberately models only list roots.
  // Keep this tiny detail record local to presentation tests so the real header
  // is exercised without reaching an external guide service.
  const publicGuide = {
    ...state.lists.guides[0],
    Description: null,
    Guide_Type: "City guide",
    Estimated_Budget: null,
    Number_Of_Days: 1,
    guide_sections: [{
      documentId: "guide-section-day-1",
      Title: "Day 1",
      Sequence: 1,
      Description: "A contained first-day itinerary for sticky navigation geometry.",
      Timeline: null,
      Transport: null,
      Stay: null,
      Recommendation_Activity: null,
      Map_Details: null,
      Packing_List: null,
      Pre_Tasks: null,
      Section_tags: null,
      Budget: null,
    }],
    Guide_Media: [{ url: `${origin}/images/music-presentation-art.svg`, name: "Contained guide cover" }],
    Guide_Tags: [],
    Place_Details: [],
    Tips_Notes: null,
    Guide_Section_Details: null,
    is_pinned: false,
    pin_order: 0,
    display_order: 0,
    account: state.account,
  };
  await context.route("**/graphql", async route => {
    const request = route.request();
    const operationName = request.method() === "POST" ? request.postDataJSON()?.operationName : undefined;
    if (operationName === "GetPublicGuideById") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { guide: publicGuide } }) });
    }
    return route.fallback();
  });
  await context.route("https://images.unsplash.com/**", route => route.fulfill({
    status: 200,
    contentType: "image/gif",
    body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"),
  }));
  await context.route(origin + '/e2e/setup/music-presentation-media.tsx', route => route.continue());
  const requests: Array<{ path: string; method: string; body: unknown }> = [];
  await context.route(origin + '/images/music-presentation-art.svg', route => route.fulfill({
    status: 200, contentType: 'image/svg+xml',
    body: imageMode === 'broken' ? 'invalid image fixture' : '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#314f6b"/><stop offset=".5" stop-color="#db957c"/><stop offset="1" stop-color="#284435"/></linearGradient></defs><path fill="url(#g)" d="M0 0h1000v600H0z"/><circle cx="740" cy="140" r="80" fill="#f7dfb4"/><path d="M0 380 260 180 540 380 790 250 1000 360v240H0" fill="#152d35" opacity=".65"/></svg>',
  }));
  await context.route('**/api/music/public-resource/v1/' + publicSlug, async route => {
    const url = new URL(route.request().url());
    expect(url.origin).toBe(origin);
    if (state.mode !== 'public' || state.faults.has('/api/music/public-resource/v1/' + publicSlug)) return route.fallback();
    await options.resourceDelay;
    const value = structuredClone(resource);
    const setArt = (song: PublicMusicSong) => { song.thumbnailUrl = imageMode === 'missing' ? null : artwork; };
    if (value.currentlyPlaying) setArt(value.currentlyPlaying);
    value.queue.items.forEach(setArt); value.recentlyPlayed.items.forEach(setArt);
    value.playlists.items.forEach(list => list.songs.items.forEach(setArt));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
  });
  await context.route('**/api/playlist/' + publicSlug + '/**', async route => {
    const request = route.request(), url = new URL(request.url());
    expect(url.origin).toBe(origin);
    requests.push({ path: url.pathname, method: request.method(), body: request.postData() ? request.postDataJSON() : null });
    const video = { id: { videoId: 'abcdefghijk' }, snippet: { title: 'Verified request song', channelTitle: 'Verified artist', thumbnails: { default: { url: artwork } } } };
    if (url.pathname.endsWith('/youtube/search') && request.method() === 'POST') return route.fulfill({ json: { items: [video], nextPageToken: null } });
    if (url.pathname.endsWith('/youtube/video-from-url') && request.method() === 'POST') return route.fulfill({ json: video });
    if (url.pathname.endsWith('/requests') && request.method() === 'POST') return route.fulfill({ status: 201, json: { accepted: true } });
    return route.fallback();
  });
  return {
    state, requests, setAppearance,
    update(next: PublicMusicResource) { resource = structuredClone(next); state.revision = resource.revision; state.guestControls = resource.permissions; invalidateGuests(state); },
    assertClean() { guard.assertClean(); expect(state.writes).toEqual([]); },
  };
}
