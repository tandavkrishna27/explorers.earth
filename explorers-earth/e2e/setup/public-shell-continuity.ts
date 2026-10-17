import type { Page } from '@playwright/test';
import type { PublicMusicResource, PublicMusicSong } from '../../src/features/music/publicMusicClient';
import type { FixtureState } from './category-navigation';

export const TOP_LEVEL_DESTINATIONS = [
  { id: 'profile', field: 'public_profile', route: '', label: 'Profile', source: 'books' },
  { id: 'places', field: 'public_recommendations', route: 'places', label: 'Places', source: '' },
  { id: 'guides', field: 'public_guides', route: 'guides', label: 'Guides', source: '' },
  { id: 'movies', field: 'public_movie', route: 'movies', label: 'Movies', source: '' },
  { id: 'books', field: 'public_books', route: 'books', label: 'Books', source: '' },
  { id: 'games', field: 'public_games', route: 'games', label: 'Games', source: '' },
  { id: 'apps', field: 'public_apps', route: 'apps', label: 'Apps', source: '' },
  { id: 'products', field: 'public_products', route: 'products', label: 'Products', source: '' },
  { id: 'people', field: 'public_people', route: 'people', label: 'People', source: '' },
  { id: 'music', field: 'public_music', route: 'music', label: 'Music', source: '' },
] as const;

export const REQUIRED_THEMES = [
  'cinematic-dark', 'glassmorphism', 'sunset-glow', 'minimal-light', 'emerald-nature', 'neon-cyber',
] as const;
export const REQUIRED_VIEWPORTS = [320, 390, 768, 1024, 1440] as const;
export const REQUIRED_HIGH_RISK_ROUTE_TYPES = ['profile', 'list', 'detail', 'map', 'music'] as const;
export const REQUIRED_DATA_STATES = ['success', 'empty', 'error', 'partial'] as const;

export type PublicShellVisualRow = {
  id: string;
  theme: typeof REQUIRED_THEMES[number];
  viewport: typeof REQUIRED_VIEWPORTS[number];
  routeType: typeof REQUIRED_HIGH_RISK_ROUTE_TYPES[number];
  dataState: typeof REQUIRED_DATA_STATES[number];
  path: string;
};

export type PublicShellFrame = {
  time: number;
  pathname: string;
  banner: number;
  share: number;
  footer: number;
  nav: number;
  earth: number;
  activeHref: string | null;
  contentChildren: number;
  nonblank: boolean;
};

export function framesAfterActivation<T>(frames: readonly T[], clickFrameIndex: number | null) {
  return clickFrameIndex === null ? [...frames] : frames.slice(clickFrameIndex);
}

export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

export const publicPath = (route = '', username = 'fixture-owner') => `/${username}${route ? `/${route}` : ''}`;

export function holdDestination(state: FixtureState, path: string) {
  const gate = deferred<void>();
  state.destinationGates.set(path, gate.promise);
  return {
    release() {
      state.destinationGates.delete(path);
      gate.resolve();
    },
  };
}

export async function beginFrameRecorder(page: Page) {
  await page.evaluate(() => {
    const recorder = {
      clickTime: null as number | null,
      clickFrameIndex: null as number | null,
      clickTrusted: false,
      frames: [] as PublicShellFrame[],
      cls: 0,
      stop: false,
    };
    (window as any).__task7PublicShell = recorder;
    addEventListener('click', event => {
      recorder.clickTime = event.timeStamp;
      recorder.clickFrameIndex = recorder.frames.length;
      recorder.clickTrusted = event.isTrusted;
    }, { capture: true, once: true });
    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
          if (!entry.hadRecentInput) recorder.cls += entry.value ?? 0;
        }
      });
      observer.observe({ type: 'layout-shift', buffered: true });
      (recorder as any).observer = observer;
    } catch { /* LayoutShift is Chromium-only; its gate runs only there. */ }
    const sample = (time: number) => {
      const content = document.querySelector('[data-public-content-layer]');
      const active = document.querySelector('nav[aria-label="Public navigation"] a[aria-current="page"]');
      const visibleEarth = Array.from(document.querySelectorAll<HTMLElement>('[role="status"][aria-label="Earth loading"]'))
        .filter(element => !element.closest('[aria-hidden="true"]') && getComputedStyle(element).visibility !== 'hidden').length;
      recorder.frames.push({
        time,
        pathname: location.pathname,
        banner: document.querySelectorAll('[role="banner"], header').length,
        share: document.querySelectorAll('button[aria-label="Share"]').length,
        footer: document.querySelectorAll('[role="contentinfo"]').length,
        nav: document.querySelectorAll('nav[aria-label="Public navigation"]').length,
        earth: visibleEarth,
        activeHref: active?.getAttribute('href') ?? null,
        contentChildren: content?.children.length ?? 0,
        nonblank: Boolean(document.body.innerText.trim()),
      });
      if (!recorder.stop) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

export async function finishFrameRecorder(page: Page) {
  const recorder = await page.evaluate(() => {
    const recorder = (window as any).__task7PublicShell;
    recorder.stop = true;
    recorder.observer?.disconnect();
    return {
      clickTime: recorder.clickTime as number | null,
      clickFrameIndex: recorder.clickFrameIndex as number | null,
      clickTrusted: recorder.clickTrusted as boolean,
      cls: recorder.cls as number,
      frames: recorder.frames as PublicShellFrame[],
    };
  });
  return { ...recorder, postActivation: framesAfterActivation(recorder.frames, recorder.clickFrameIndex) };
}

export async function readFrameRecorder(page: Page) {
  const recorder = await page.evaluate(() => {
    const recorder = (window as any).__task7PublicShell;
    return {
      clickTime: recorder.clickTime as number | null,
      clickFrameIndex: recorder.clickFrameIndex as number | null,
      clickTrusted: recorder.clickTrusted as boolean,
      cls: recorder.cls as number,
      frames: recorder.frames as PublicShellFrame[],
    };
  });
  return { ...recorder, postActivation: framesAfterActivation(recorder.frames, recorder.clickFrameIndex) };
}

export function warmFrameFailures(frames: readonly PublicShellFrame[], destinationPath: string) {
  return frames.filter(frame => frame.banner !== 1
    || frame.nav !== 1
    || frame.earth !== 0
    || !frame.nonblank
    || frame.contentChildren < 1
    || (frame.pathname === destinationPath && frame.activeHref?.split('?')[0] !== destinationPath));
}

export function percentile(samples: readonly number[], percentileValue: number) {
  if (samples.length === 0) throw new Error('Cannot calculate a percentile without samples.');
  const ordered = [...samples].sort((left, right) => left - right);
  const index = Math.min(ordered.length - 1, Math.ceil(percentileValue * ordered.length) - 1);
  return ordered[index];
}

export function seedRenderableApp(state: FixtureState) {
  state.lists.appLists[0].recommended_apps = [{
    __typename: 'RecommendedApp', documentId: 'fixture-app', app_url: 'https://example.test/app',
    title: 'Fixture app', logo_url: null, description: null, developer: null, platforms: [],
    price_tier: null, download_url: null, screenshots: [], user_recommendation_note: null,
    user_rating: null, is_pinned: false, pin_order: null, app_category: null,
  }];
}

export function seedRenderablePlace(state: FixtureState) {
  state.lists.recommendationLists[0].recommended_places = [{
    __typename: 'RecommendedPlace', documentId: 'fixture-place',
    Place_Details: { name: 'Fixture place', geometry: { location: { lat: 26.9124, lng: 75.7873 } }, formatted_address: 'Fixture city' },
    Media: [], recommendation_category: { Category_Name: 'Landmark' },
  }];
}

function musicSong(idCharacter: string, title: string, status: PublicMusicSong['status'], position: number): PublicMusicSong {
  return {
    id: idCharacter.repeat(43),
    youtubeId: 'abcdefghijk',
    title,
    artist: 'Fixture artist',
    thumbnailUrl: null,
    position,
    status,
    playedAt: status === 'played' ? '2026-09-01T12:00:00.000Z' : null,
  };
}

function seedMusicResource(state: FixtureState, resource: PublicMusicResource) {
  state.guestControls = { ...resource.permissions };
  Object.assign(state.publicResource, resource);
}

function seedSuccessfulMusic(state: FixtureState) {
  const permissions = {
    allowSongRequests: true,
    allowGuestPlayOnDevice: true,
    allowPlaylistSharing: true,
    allowRecentlyPlayedVisibility: true,
    allowQueueVisibility: true,
  };
  seedMusicResource(state, {
    version: 'music-public-resource/v1',
    revision: state.revision,
    user: { username: 'fixture-owner', venueName: 'Fixture Venue' },
    permissions,
    currentlyPlaying: musicSong('L', 'Fixture Music live', 'playing', 0),
    queue: { items: [musicSong('Q', 'Fixture Music next', 'queued', 1)], total: 1, truncated: false },
    recentlyPlayed: { items: [musicSong('H', 'Fixture Music replay', 'played', 0)], total: 1, truncated: false },
    playlists: {
      items: [{
        id: 'P'.repeat(43),
        name: 'Fixture shared playlist',
        description: 'A complete public Music fixture.',
        songs: { items: [musicSong('S', 'Fixture Music saved', 'saved', 0)], total: 1, truncated: false },
      }],
      total: 1,
      truncated: false,
    },
  });
}

function seedPartialMusic(state: FixtureState) {
  const permissions = {
    allowSongRequests: false,
    allowGuestPlayOnDevice: true,
    allowPlaylistSharing: false,
    allowRecentlyPlayedVisibility: false,
    allowQueueVisibility: true,
  };
  seedMusicResource(state, {
    version: 'music-public-resource/v1',
    revision: state.revision,
    user: { username: 'fixture-owner', venueName: 'Fixture Venue' },
    permissions,
    currentlyPlaying: musicSong('V', 'Fixture Music preview', 'playing', 0),
    queue: { items: [musicSong('N', 'Fixture Music partial queue', 'queued', 1)], total: 3, truncated: true },
    recentlyPlayed: { items: [], total: 0, truncated: false },
    playlists: { items: [], total: 0, truncated: false },
  });
}

export function configureVisualState(state: FixtureState, row: PublicShellVisualRow) {
  state.account.social_media.theme_settings = {
    ...state.account.social_media.theme_settings,
    preset: row.theme,
    footerBranding: 'enabled',
  };
  state.account.public_music = 'Yes';
  state.account.pinned_nav_tabs = ['public_profile', 'public_apps', 'public_music'];
  state.mode = 'public';
  if (row.routeType === 'list' || row.routeType === 'detail') seedRenderableApp(state);
  if (row.routeType === 'map') seedRenderablePlace(state);
  if (row.routeType === 'profile') {
    if (row.dataState === 'empty') {
      state.account.Bio = null;
      state.account.Feed_Data = [];
      for (const key of Object.keys(state.lists)) state.lists[key] = [];
    }
    if (row.dataState === 'error') state.faults.set('PublicProfileData', [{ kind: 'error' }]);
    if (row.dataState === 'partial') state.faults.set('PublicProfileData', [{ kind: 'partial' }]);
  } else if (row.routeType === 'list') {
    if (row.dataState === 'empty') state.lists.appLists = [];
    if (row.dataState === 'error') state.faults.set('PublicAppData', [{ kind: 'error' }]);
    if (row.dataState === 'partial') state.faults.set('PublicAppData', [{ kind: 'partial' }]);
  } else if (row.routeType === 'detail') {
    if (row.dataState === 'empty') state.lists.appLists = [];
    if (row.dataState === 'error') state.faults.set('AppListBySlug', [{ kind: 'error' }]);
    if (row.dataState === 'partial') state.faults.set('AppListBySlug', [{ kind: 'partial' }]);
  } else if (row.routeType === 'map') {
    if (row.dataState === 'empty') state.lists.recommendationLists = [];
    if (row.dataState === 'error') state.faults.set('Account', [{ kind: 'error' }]);
    if (row.dataState === 'partial') state.faults.set('Account', [{ kind: 'partial' }]);
  } else if (row.routeType === 'music') {
    if (row.dataState === 'success') seedSuccessfulMusic(state);
    if (row.dataState === 'partial') seedPartialMusic(state);
    // Public Music discovery deliberately retries one transient failure before
    // surfacing its unavailable state, so the visual error fixture must fail
    // both bounded attempts.
    if (row.dataState === 'error') state.faults.set('/api/music/public-profile/browser-account', [{ kind: 'error' }, { kind: 'error' }]);
  }
  return state;
}

export function assertPublicShellVisualCoverage(rows: readonly PublicShellVisualRow[]) {
  const dimensions = {
    theme: REQUIRED_THEMES,
    viewport: REQUIRED_VIEWPORTS,
    routeType: REQUIRED_HIGH_RISK_ROUTE_TYPES,
    dataState: REQUIRED_DATA_STATES,
  } as const;
  const names = Object.keys(dimensions) as Array<keyof typeof dimensions>;
  const missing: string[] = [];
  for (let leftIndex = 0; leftIndex < names.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < names.length; rightIndex += 1) {
      const left = names[leftIndex];
      const right = names[rightIndex];
      for (const leftValue of dimensions[left]) {
        for (const rightValue of dimensions[right]) {
          if (!rows.some(row => row[left] === leftValue && row[right] === rightValue)) {
            missing.push(`${left}=${leftValue} x ${right}=${rightValue}`);
          }
        }
      }
    }
  }
  if (missing.length > 0) throw new Error(`Missing required public-shell visual pairs:\n${missing.join('\n')}`);
}
