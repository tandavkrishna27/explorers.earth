import { expect, type Page } from "@playwright/test";
import { isKnownMusicFixtureProviderDiagnostic } from "../src/features/music/fixtureConsoleDiagnostics";
import { LIVE_MUTATION_TAG } from "../scripts/music-public-live-preflight.mjs";
import {
  attachLiveFailureScreenshotBestEffort,
  musicLiveAuthorityFromEnvironment,
  musicOwnerCredentialFromAuthState,
  musicLiveWriteSkipReason,
  musicLiveStrapiTokenFromEnvironment,
  musicLiveTest,
  runAuthorizedMusicMutation,
  withRestoredMusicFixture,
  type MusicMutationCallsite,
} from "./setup/music";

const test = musicLiveTest;

const fixtureOrigin = "http://localhost:55173";
const liveSkipReason = musicLiveWriteSkipReason();
test.skip(Boolean(liveSkipReason), liveSkipReason ?? "authorized live fixture");

function guardedMutation<T>(callsite: MusicMutationCallsite, mutation: () => Promise<T>): Promise<T> {
  return runAuthorizedMusicMutation(musicLiveAuthorityFromEnvironment(), callsite, mutation);
}

async function withFixtureRestore<T>(page: Page, journeyId: string, journey: () => Promise<T>): Promise<T> {
  const state = fixtureMutationState(page);
  const credential = state.ownerCredential!;
  const restored = await withRestoredMusicFixture({
    journeyId,
    snapshot: async () => {
      const [dashboard, controls] = await Promise.all([
        page.request.get(`${fixtureOrigin}/api/music/dashboard`, { headers: { Authorization: credential } }),
        page.request.get(`${fixtureOrigin}/api/music/guest-controls`, { headers: { Authorization: credential } }),
      ]);
      const body = await dashboard.json() as Record<string, unknown>;
      return { publication: body.publication, permissions: await controls.json(), queue: body.songs, playlists: [], requests: [], profilePreference: "unchanged" };
    },
    cleanupNamespace: async () => {
      for (const songId of state.insertedQueueSongIds.splice(0)) {
        const response = await guardedMutation("playlist-song-delete", () => page.request.delete(`${fixtureOrigin}/api/playlist/songs/${songId}`, { headers: fixtureWriteHeaders(credential, `fixture-cleanup-song-${songId}`) }));
        expect(response.status()).toBe(204);
      }
    },
    restore: async (snapshot) => {
      const controls = (snapshot as { permissions: GuestControls }).permissions;
      const response = await guardedMutation("guest-controls", () => page.request.patch(`${fixtureOrigin}/api/music/guest-controls`, { headers: fixtureWriteHeaders(credential, "fixture-restore-guest-controls"), data: controls }));
      expect(response.status()).toBe(200);
      state.guestControls = undefined;
    },
  }, journey);
  return restored.value;
}

const fixtureVideos = [
  { id: { videoId: "abcdefghijk" }, snippet: { title: "UAT First song", channelTitle: "Fixture artist", thumbnails: { default: { url: `${fixtureOrigin}/images/tuneslogo.png` } } } },
  { id: { videoId: "lmnopqrstuv" }, snippet: { title: "UAT Second song", channelTitle: "Fixture artist", thumbnails: { default: { url: `${fixtureOrigin}/images/tuneslogo.png` } } } },
];

type GuestControls = {
  allowSongRequests: boolean;
  allowGuestPlayOnDevice: boolean;
  allowPlaylistSharing: boolean;
  allowRecentlyPlayedVisibility: boolean;
};
type FixtureMutationState = {
  ownerCredential?: string;
  insertedQueueSongIds: number[];
  guestControls?: GuestControls;
};
const fixtureMutations = new WeakMap<Page, FixtureMutationState>();

function fixtureMutationState(page: Page): FixtureMutationState {
  const state = fixtureMutations.get(page);
  if (!state) throw new Error("fixture mutation state was not initialized");
  return state;
}

function fixtureWriteHeaders(credential: string, key: string): Record<string, string> {
  return { Authorization: credential, Origin: fixtureOrigin, "Idempotency-Key": key };
}

function monitorBrowserJourney(page: Page) {
  const browserErrors: string[] = [];
  const failedMusicResponses: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // The sandboxed YouTube iframe emits this opaque player-state diagnostic
    // when playback is driven headlessly; it is not an application exception.
    if (/^\{target: [A-Za-z], data: \d+\}$/.test(message.text())) return;
    if (isKnownMusicFixtureProviderDiagnostic({ message: message.text(), sourceUrl: message.location().url })) return;
    browserErrors.push(message.text());
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === fixtureOrigin && /^\/api\/(music|playlists|playlist|youtube)(?:\/|$)/.test(url.pathname) && response.status() >= 400) {
      failedMusicResponses.push(`${response.status()} ${url.pathname}`);
    }
  });
  return () => {
    expect(failedMusicResponses).toEqual([]);
    expect(browserErrors).toEqual([]);
  };
}

test.beforeEach(async ({ context, page }) => {
  fixtureMutations.set(page, { insertedQueueSongIds: [] });
  page.on("request", (request) => {
    const url = new URL(request.url());
    const credential = request.headers().authorization;
    if (url.origin === fixtureOrigin && credential?.startsWith("Bearer ")
        && (url.pathname === "/api/music/dashboard" || url.pathname === "/api/music/guest-controls")) {
      fixtureMutationState(page).ownerCredential = credential;
    }
  });
  await context.route("**/api/youtube/search", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: fixtureVideos, nextPageToken: null }) });
  });
  // Older disposable fixture rows can reference this synthetic thumbnail host.
  // Keep media rendering deterministic without intercepting Music API traffic.
  await context.route("https://img.example/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") });
  });
});

test.afterEach(async ({ page }, testInfo) => {
  try {
    await attachLiveFailureScreenshotBestEffort(page, testInfo, "sanitized-fixture-page");
  } finally {
    fixtureMutations.delete(page);
  }
});

test("authenticated owner queue mutation reaches the branch-local Tunes fixture through the fixture browser origin", { tag: LIVE_MUTATION_TAG }, async ({ page }) => {
  const requests: Array<{ path: string; method: string; authorization?: string; xUsername?: string }> = [];
  const fixtureAuthRequests: string[] = [];
  const assertCleanJourney = monitorBrowserJourney(page);
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/music/") || path === "/api/playlists" || path.startsWith("/api/playlist/")) {
      requests.push({
        path,
        method: request.method(),
        authorization: request.headers().authorization,
        xUsername: request.headers()["x-username"],
      });
    }
    if (path === "/api/users/me" || path === "/graphql") fixtureAuthRequests.push(path);
  });

  const fixtureStrapiToken = musicLiveStrapiTokenFromEnvironment();
  await page.goto(`/google-auth/callback?access_token=${encodeURIComponent(fixtureStrapiToken)}`);
  await expect(page.getByText("Login successful! Redirecting...")).toBeVisible();
  await expect.poll(() => requests.filter(({ path }) => path === "/api/music/identity/ensure").length).toBe(1);
  await page.goto("/recommendations/music");
  await expect(page.getByRole("tab", { name: "Playlists", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Live", exact: true }).click();
  await expect(page.getByRole("region", { name: "Music workspace" })).toBeVisible();
  expect(fixtureAuthRequests).toEqual(expect.arrayContaining(["/api/users/me", "/graphql"]));
  await expect(page.getByRole("heading", { name: "Find music" })).toBeVisible();
  const ownerCredential = process.env.MUSIC_E2E_AUTH_STATE_PATH ? musicOwnerCredentialFromAuthState() : fixtureMutationState(page).ownerCredential;
  expect(ownerCredential).toMatch(/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

  await withFixtureRestore(page, "music.owner.queue-add", async () => {

  await page.getByRole("searchbox", { name: "Search music or paste a URL" }).fill("fixture journey");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("checkbox", { name: "Select UAT First song" }).check();
  const queueMutation = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === fixtureOrigin && url.pathname === "/api/playlist/songs" && response.request().method() === "POST";
  });
  await runAuthorizedMusicMutation(musicLiveAuthorityFromEnvironment(), "playlist-song-add", async () => undefined);
  await page.getByRole("button", { name: "Add 1 selected to queue" }).click();
  const queueResponse = await queueMutation;
  expect(queueResponse.status()).toBe(201);
  const inserted = await queueResponse.json() as { id?: unknown };
  expect(inserted.id).toEqual(expect.any(Number));
  fixtureMutationState(page).insertedQueueSongIds.push(inserted.id as number);
  await expect(page.getByRole("region", { name: "Music workspace" })).toContainText("UAT First song");

  const ensure = requests.find(({ path }) => path === "/api/music/identity/ensure");
  expect(ensure).toMatchObject({ authorization: `Bearer ${fixtureStrapiToken}`, xUsername: undefined });
  const owner = requests.find(({ path }) => path === "/api/playlists");
  expect(owner?.authorization).toMatch(/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  expect(owner?.authorization).not.toBe(`Bearer ${fixtureStrapiToken}`);
  expect(owner?.xUsername).toBeUndefined();

  expect(requests.some(({ path, method }) => path === "/api/playlist/songs" && method === "POST")).toBe(true);
  const browserStorage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(browserStorage).not.toMatch(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
  assertCleanJourney();
  });
});

test("full owner workspace remains usable at a mobile viewport", { tag: LIVE_MUTATION_TAG }, async ({ page }, testInfo) => {
  const assertCleanJourney = monitorBrowserJourney(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const fixtureStrapiToken = musicLiveStrapiTokenFromEnvironment();
  await page.goto(`/google-auth/callback?access_token=${encodeURIComponent(fixtureStrapiToken)}`);
  await expect(page.getByText("Login successful! Redirecting...")).toBeVisible();
  await page.goto("/recommendations/music");

  await page.getByRole("tab", { name: "Live", exact: true }).click();
  await expect(page.getByRole("region", { name: "Music workspace" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search music or paste a URL" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Queue", exact: true })).toBeVisible();
  const ownerCredential = process.env.MUSIC_E2E_AUTH_STATE_PATH ? musicOwnerCredentialFromAuthState() : fixtureMutationState(page).ownerCredential;
  expect(ownerCredential).toMatch(/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  await withFixtureRestore(page, "music.owner.mobile-workspace", async () => {
  const longTitle = "A deliberately very long mobile queue title that must truncate without hiding play or actions";
  const insertLongTitle = await guardedMutation("playlist-song-add", () => page.request.post(`${fixtureOrigin}/api/playlist/songs`, {
    headers: fixtureWriteHeaders(ownerCredential!, "fixture-mobile-long-title"),
    data: { youtubeId: "abcdefghijk", title: longTitle, artist: "Fixture artist", thumbnailUrl: `${fixtureOrigin}/images/tuneslogo.png` },
  }));
  expect(insertLongTitle.status()).toBe(201);
  const insertedLongTitle = await insertLongTitle.json() as { id?: unknown };
  expect(insertedLongTitle.id).toEqual(expect.any(Number));
  fixtureMutationState(page).insertedQueueSongIds.push(insertedLongTitle.id as number);
  await page.reload();
  await page.getByRole("tab", { name: "Live", exact: true }).click();
  const longTitleRow = page.getByRole("listitem", { name: new RegExp(longTitle) });
  await expect(longTitleRow).toBeVisible();
  const longTitleText = longTitleRow.locator("strong");
  await expect(longTitleText).toHaveClass(/truncate/);
  expect(await longTitleText.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await expect(longTitleRow.getByRole("button", { name: `Play ${longTitle}` })).toBeVisible();
  await expect(longTitleRow.getByRole("button", { name: `Queue actions for ${longTitle}` })).toBeVisible();
  const reorderHandle = longTitleRow.getByLabel(`Reorder ${longTitle}`);
  await expect(reorderHandle).toBeHidden();
  await expect(reorderHandle).toHaveAttribute("tabindex", "-1");
  await expect(reorderHandle).toHaveAttribute("draggable", "false");
  await page.getByRole("button", { name: "Queue actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Reorder queue" }).click();
  await expect(reorderHandle).toBeVisible();
  await expect(reorderHandle).toHaveAttribute("tabindex", "0");
  await expect(reorderHandle).toHaveAttribute("draggable", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const controlsResponse = await page.request.get(`${fixtureOrigin}/api/music/guest-controls`, {
    headers: { Authorization: ownerCredential! },
  });
  expect(controlsResponse.status()).toBe(200);
  fixtureMutationState(page).guestControls = await controlsResponse.json() as GuestControls;
  const songRequests = page.getByRole("switch", { name: "Allow song requests" });
  const originalSongRequests = await songRequests.isChecked();
  await runAuthorizedMusicMutation(musicLiveAuthorityFromEnvironment(), "guest-controls", async () => undefined);
  await songRequests.click();
  await expect(songRequests).toHaveAttribute("aria-checked", String(!originalSongRequests));
  await page.reload();
  await page.getByRole("tab", { name: "Live", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Allow song requests" })).toHaveAttribute("aria-checked", String(!originalSongRequests));
  await expect(page.getByRole("heading", { name: "Recently played" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await testInfo.attach("mobile-owner-workspace", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  assertCleanJourney();
  });
});
