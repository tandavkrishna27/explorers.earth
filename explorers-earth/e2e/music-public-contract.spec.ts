import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Kind, parse, print } from "graphql";
import { LIVE_MUTATION_TAG, LIVE_READ_ONLY_TAG } from "../scripts/music-public-live-preflight.mjs";
import { setupMockAuthentication } from "./setup/auth";
import { musicPermissionOracle } from "../../test-fixtures/music-permission-oracle";
import { fixtureState, installContainedRoutes } from './setup/category-navigation';
import {
  assertLivePermissionGuestControlVisible,
  attachLiveFailureScreenshotBestEffort,
  completeMusicAccount,
  installMusicQualificationMocks,
  LiveReconnectJourneyFailure,
  musicLiveAuthorityFromEnvironment,
  musicOwnerCredentialFromAuthState,
  musicLiveWriteSkipReason,
  musicLiveStrapiTokenFromEnvironment,
  musicLiveTest,
  prepareLivePublicMusicJourney,
  readLiveCanonicalPublicRevision,
  runAuthorizedMusicMutation,
  withRestoredMusicFixture,
  type LivePublicJourneyControls,
  type LivePublicJourneyResponse,
  type MusicMutationCallsite,
} from "./setup/music";

const liveTest = musicLiveTest;

const fixtureOrigin = "http://localhost:55173";
const liveSkipReason = musicLiveWriteSkipReason();

function guardedMutation<T>(callsite: MusicMutationCallsite, mutation: () => Promise<T>): Promise<T> {
  return runAuthorizedMusicMutation(musicLiveAuthorityFromEnvironment(), callsite, mutation);
}

const publicResourceFixture = {
  version: "music-public-resource/v1",
  revision: 7,
  user: { username: "fixture-owner", venueName: "Fixture Venue" },
  permissions: {
    allowSongRequests: true,
    allowGuestPlayOnDevice: false,
    allowPlaylistSharing: true,
    allowRecentlyPlayedVisibility: true,
    allowQueueVisibility: true,
  },
  currentlyPlaying: { id: "P".repeat(43), youtubeId: "abcdefghijk", title: "Playing now", artist: "Fixture artist", thumbnailUrl: null, position: 0, status: "playing", playedAt: null },
  queue: { items: [{ id: "Q".repeat(43), youtubeId: "lmnopqrstuv", title: "Queued song", artist: "Fixture artist", thumbnailUrl: null, position: 1, status: "queued", playedAt: null }], total: 1, truncated: false },
  recentlyPlayed: { items: [], total: 0, truncated: false },
  playlists: { items: [], total: 0, truncated: false },
};

async function installFriendlyMusicFixture(page: Page, options: {
  profileMusic: boolean;
  descriptor: "available" | "missing" | "outage";
  preset?: string;
  wallpaperMode?: string;
  failedImage?: boolean;
}) {
  let descriptorRequests = 0;
  const account = {
    __typename: "Account", documentId: "fixture-account", Account_Name: "Fixture Explorer", Account_Type: "personal",
    Primary_Address: { address: "Fixture City" }, Bio: "Friendly Music fixture", Feed_Data: [], Public_Profile_Address: null,
    mobile_number: null, mobile_number_visibility: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    public_profile: "Yes", public_recommendations: "Yes", public_music: options.profileMusic ? "Yes" : "No",
    public_books: "Yes", public_guides: "No", public_movie: "No", public_games: "No", public_apps: "No", public_products: "No", public_people: "No",
    pinned_nav_tabs: ["public_music"], auto_pinning: false, recommendation_lists: [], profile_picture: null,
    bg_picture: options.failedImage ? { url: "/missing-fixture-image.png", alternativeText: "Missing fixture" } : null,
    social_media: { theme_settings: { preset: options.preset ?? "minimal-light", wallpaperMode: options.wallpaperMode ?? "solid-color", accentColor: "#2563eb", landingTab: "music", visibleTabs: { recommendations: true, gallery: false, business: false }, footerBranding: "disabled", recommendations: { layout: "grid", categoryOrder: [] } } },
  };
  await page.route("**/api/explorers/v1/profiles/fixture-owner", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ...account, username: "fixture-owner" }),
  }));
  await page.route("**/graphql", async (route) => {
    const body = route.request().postDataJSON() as { operationName?: string; query?: string };
    const operation = body.operationName ?? body.query?.match(/(?:query|mutation)\s+(\w+)/)?.[1] ?? "Unknown";
    const data = operation === "CheckUsername"
      ? { accounts: [{ documentId: account.documentId, Account_Name: account.Account_Name }] }
      : operation.startsWith("AccountByUsername")
        ? { usersPermissionsUsers: [{ documentId: "fixture-user", username: "fixture-owner", accounts: [account] }] }
        : operation === "PublicCategoryListCounts"
          ? { recommendationLists: [{ documentId: "visible" }], bookLists: [{ documentId: "visible" }], movieLists: [], gameLists: [], appLists: [], productLists: [], personLists: [], guides: [] }
          : { accounts: [account] };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
  });
  await page.route("**/api/music/public-profile/fixture-account", async (route) => {
    descriptorRequests += 1;
    if (options.descriptor === "outage") return route.fulfill({ status: 503, body: "unavailable" });
    if (options.descriptor === "missing") return route.fulfill({ status: 404, body: "not found" });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "public_slug-123", revision: 7 } }) });
  });
  await page.route("**/api/music/public-resource/v1/public_slug-123", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(publicResourceFixture) }));
  await page.route("**/socket.io/**", (route) => route.abort());
  return { descriptorRequests: () => descriptorRequests };
}

test.describe("PR-safe direct public Music routes", { tag: LIVE_READ_ONLY_TAG }, () => {
  test("owner View as guest link opens public Music in a separate logged-out browser context", async ({ browser, context, page }) => {
    await setupMockAuthentication(context);
    await installMusicQualificationMocks(page, {
      accounts: [{ ...completeMusicAccount, public_music: "Yes" }],
      ownerWorkspace: true,
    });
    await page.route("**/api/music/dashboard", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        queueRevision: 0,
        songs: [],
        currentlyPlaying: null,
        playedSongs: [],
        publication: { mode: "public", publicSlug: "qualification-public" },
        guestControls: {
          allowSongRequests: true,
          allowGuestPlayOnDevice: false,
          allowPlaylistSharing: true,
          allowRecentlyPlayedVisibility: true,
          allowQueueVisibility: true,
        },
      }),
    }));

    await page.goto("/recommendations/music");
    await page.getByRole("button", { name: "Open playlist and sharing menu" }).click();
    await page.getByRole("menuitem", { name: "Sharing settings" }).click();
    const viewAsGuest = page.getByRole("link", { name: "Preview public Music page" });
    await expect(viewAsGuest).toBeVisible();
    const guestUrl = await viewAsGuest.evaluate((link: HTMLAnchorElement) => link.href);
    expect(new URL(guestUrl).pathname).toBe("/music/share/qualification-public");

    const guestContext = await browser.newContext();
    const guestAuthorizationHeaders: string[] = [];
    try {
      expect(await guestContext.storageState()).toEqual({ cookies: [], origins: [] });
      await guestContext.route("**/api/music/public-resource/v1/qualification-public", async (route) => {
        const authorization = route.request().headers().authorization;
        if (authorization) guestAuthorizationHeaders.push(authorization);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(publicResourceFixture),
        });
      });
      await guestContext.route("**/socket.io/**", (route) => route.abort());
      const guestPage = await guestContext.newPage();
      await guestPage.goto(guestUrl);
      await expect(guestPage.getByRole("heading", { name: "Music", level: 1 })).toBeVisible();
      await expect(guestPage.getByText("Queued song")).toBeVisible();
      // The store persists nothing of the session now (`partialize: () => ({})`), so the
      // auth-storage key exists as an empty envelope rather than being absent. What this
      // case is actually protecting - that a logged-out guest page carries no owner
      // authority - is asserted on the contents instead of the key's presence.
      const guestStorage = await guestPage.evaluate(() => ({
        auth: localStorage.getItem("auth-storage"),
        user: localStorage.getItem("user"),
        session: localStorage.getItem("auth_session"),
      }));
      expect(guestStorage).toMatchObject({ user: null, session: null });
      expect(JSON.parse(guestStorage.auth ?? "null")?.state ?? {}).toEqual({});
      expect((await guestContext.cookies()).some(({ name }) => name === "token")).toBe(false);
      expect(guestAuthorizationHeaders).toEqual([]);
    } finally {
      await guestContext.close();
    }
  });

  test("all 32 permission masks expose exactly the independently expected guest surfaces", async ({ page, context, baseURL }, testInfo) => {
    const guard = await installContainedRoutes(context, baseURL!, fixtureState());
    try {
    await page.route("**/socket.io/**", (route) => route.abort());
    for (const [mask, requests, playback, playlists, history, queue, current] of musicPermissionOracle) {
      const permissions = {
        allowSongRequests: Boolean(mask & 1), allowGuestPlayOnDevice: Boolean(mask & 2),
        allowPlaylistSharing: Boolean(mask & 4), allowRecentlyPlayedVisibility: Boolean(mask & 8),
        allowQueueVisibility: Boolean(mask & 16),
      };
      await page.unroute("**/api/music/public-resource/v1/public_slug-123");
      await page.route("**/api/music/public-resource/v1/public_slug-123", (route) => route.fulfill({
        status: 200, contentType: "application/json", body: JSON.stringify({
          ...publicResourceFixture,
          permissions,
          currentlyPlaying: permissions.allowQueueVisibility || permissions.allowGuestPlayOnDevice ? publicResourceFixture.currentlyPlaying : null,
          queue: permissions.allowQueueVisibility ? publicResourceFixture.queue : { items: [], total: 0, truncated: false },
          recentlyPlayed: permissions.allowRecentlyPlayedVisibility ? {
            items: [{ ...publicResourceFixture.queue.items[0], id: "H".repeat(43), status: "played", playedAt: "2026-08-28T00:00:00.000Z" }], total: 1, truncated: false,
          } : { items: [], total: 0, truncated: false },
          playlists: permissions.allowPlaylistSharing ? {
            items: [{ id: "L".repeat(43), name: "Matrix playlist", description: null, songs: { items: [], total: 0, truncated: false } }], total: 1, truncated: false,
          } : { items: [], total: 0, truncated: false },
        }),
      }));
      await page.goto(`/music/share/public_slug-123?matrix=${mask}`);
      await expect(page.getByRole("heading", { name: "Music", exact: true })).toBeVisible();
      for (const name of ["Queue", "Recently played", "Playlists", "Play on this device"]) {
        const trigger = page.getByRole("button", { name, exact: true });
        if (await trigger.count() && await trigger.getAttribute("aria-expanded") === "false") await trigger.click();
      }
      const effects = [
        [requests, page.getByRole("region", { name: "Request a song" })],
        [queue, page.getByRole("region", { name: "Queue" })],
        [playlists, page.getByRole("region", { name: "Playlists" })],
        [history, page.getByRole("region", { name: "Recently played" })],
      ] as const;
      for (const [enabled, locator] of effects) {
        if (enabled) await expect(locator, `mask ${mask}`).toBeVisible();
        else await expect(locator, `mask ${mask}`).toHaveCount(0);
      }
      const playControl = page.getByRole("button", { name: /^Play .+ on this device$/ });
      if (playback) await expect(playControl.first(), `mask ${mask}`).toBeVisible();
      else await expect(playControl, `mask ${mask}`).toHaveCount(0);
      const currentTitle = page.getByText("Playing now", { exact: true });
      if (current) await expect(currentTitle.first(), `mask ${mask}`).toBeVisible();
      else await expect(currentTitle, `mask ${mask}`).toHaveCount(0);
    }
    } finally {
      await testInfo.attach('permission-boundary', { contentType: 'application/json', body: JSON.stringify({ denied: guard.denied, unexpectedConsole: guard.errors }) });
      guard.assertClean();
    }
  });

  test("first-view fallback selects the first permitted content and then the explicit empty state", async ({ page }) => {
    let empty = false;
    await page.route("**/api/music/public-resource/v1/public_slug-123", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify(empty ? {
        ...publicResourceFixture,
        permissions: { allowSongRequests: false, allowGuestPlayOnDevice: false, allowPlaylistSharing: false, allowRecentlyPlayedVisibility: false, allowQueueVisibility: false },
        currentlyPlaying: null, queue: { items: [], total: 0, truncated: false }, recentlyPlayed: { items: [], total: 0, truncated: false }, playlists: { items: [], total: 0, truncated: false },
      } : {
        ...publicResourceFixture,
        permissions: { allowSongRequests: false, allowGuestPlayOnDevice: false, allowPlaylistSharing: false, allowRecentlyPlayedVisibility: true, allowQueueVisibility: false },
        currentlyPlaying: null, queue: { items: [], total: 0, truncated: false },
        recentlyPlayed: { items: [{ ...publicResourceFixture.queue.items[0], id: "H".repeat(43), status: "played", playedAt: "2026-08-28T00:00:00.000Z" }], total: 1, truncated: false },
        playlists: { items: [], total: 0, truncated: false },
      }),
    }));
    await page.route("**/socket.io/**", (route) => route.abort());
    await page.goto("/music/share/public_slug-123");
    await expect(page.getByRole("region", { name: "Recently played" })).toBeVisible();
    empty = true;
    await page.reload();
    await expect(page.getByText("Nothing has been shared here yet")).toBeVisible();
  });

  test("screen readers receive actual loading and request-success announcements", async ({ page }) => {
    let releaseResource!: () => void;
    const resourceGate = new Promise<void>((resolve) => { releaseResource = resolve; });
    await page.route("**/api/music/public-resource/v1/public_slug-123", async (route) => {
      await resourceGate;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(publicResourceFixture) });
    });
    await page.route("**/api/playlist/public_slug-123/youtube/search", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ id: { videoId: "abcdefghijk" }, snippet: { title: "Announced song", channelTitle: "Fixture artist", thumbnails: { default: { url: `${fixtureOrigin}/images/tuneslogo.png` } } } }], nextPageToken: null }),
    }));
    await page.route("**/api/playlist/public_slug-123/requests", (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ accepted: true }) }));
    await page.route("**/socket.io/**", (route) => route.abort());
    const navigation = page.goto("/music/share/public_slug-123");
    await expect(page.getByRole("status", { name: "" }).filter({ hasText: "Loading Music…" })).toHaveAttribute("aria-live", "polite");
    releaseResource();
    await navigation;
    await page.getByRole("textbox", { name: /search for a song/i }).fill("announced");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: /Request Announced song/ }).click();
    const success = page.getByRole("status").filter({ hasText: "Song requested." });
    await expect(success).toBeVisible();
    await expect(success).toBeFocused();
  });

  test("public and unlisted shares preserve canonical and capability privacy", async ({ page }) => {
    const capabilities: Array<string | undefined> = [];
    await page.route("**/api/music/public-resource/v1/public_slug-123", async (route) => {
      capabilities.push(route.request().headers()["x-music-guest-capability"]);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(publicResourceFixture) });
    });
    await page.route("**/socket.io/**", (route) => route.abort());

    await page.goto("/music/share/public_slug-123");
    await expect(page.getByRole("heading", { name: "Music", level: 1 })).toBeVisible();
    await expect(page.getByText("Queued song")).toBeVisible();
    await expect(page.locator('link[rel="canonical"][data-rh="true"]')).toHaveAttribute("href", /\/music\/share\/public_slug-123$/);

    const capability = "A".repeat(43);
    await page.goto(`/music/share/public_slug-123#access=${capability}`);
    await expect(page).toHaveURL(/\/music\/share\/public_slug-123$/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    expect(capabilities).toContain(capability);
    expect(await page.content()).not.toContain(capability);
  });

  test("public and unlisted caches stay isolated and invalid capabilities recover generically", async ({ page }) => {
    const valid = "V".repeat(43);
    await page.route("**/api/music/public-resource/v1/**", (route) => {
      const capability = route.request().headers()["x-music-guest-capability"];
      if (capability && capability !== valid) return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ version: "music-error/v1", error: { code: "PUBLIC_NOT_FOUND", message: "Unavailable", action: "none", retryable: false, requestId: "fixture" } }) });
      const title = capability === valid ? "Unlisted-only queue song" : "Public-only queue song";
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        ...publicResourceFixture,
        queue: { items: [{ ...publicResourceFixture.queue.items[0], title }], total: 1, truncated: false },
      }) });
    });
    await page.route("**/socket.io/**", (route) => route.abort());
    await page.goto("/music/share/public_slug-456");
    await expect(page.getByText("Public-only queue song")).toBeVisible();
    await page.goto(`/music/share/public_slug-123#access=${"X".repeat(43)}`);
    await expect(page.getByText(/unavailable|not found/i).first()).toBeVisible();
    await expect(page.getByText("Public-only queue song")).toHaveCount(0);
    await page.goto(`/music/share/public_slug-123#access=${valid}`);
    await expect(page.getByText("Unlisted-only queue song")).toBeVisible();
    await page.goto("/music/share/public_slug-456");
    await expect(page.getByText("Public-only queue song")).toBeVisible();
    await expect(page.getByText("Unlisted-only queue song")).toHaveCount(0);
  });

  test("invalid, private, and missing resources converge on generic nonretryable recovery", async ({ page }) => {
    await page.route("**/api/music/public-resource/v1/**", (route) => route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ version: "music-error/v1", error: { code: "PUBLIC_NOT_FOUND", message: "Unavailable", action: "retry", retryable: false, requestId: "fixture" } }),
    }));
    await page.goto("/music/share/private_slug-123");
    await expect(page.getByText(/unavailable|not found/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /retry/i })).toHaveCount(0);
  });

  for (const viewport of [
    { width: 320, height: 700 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    test(`accessible public structure reflows at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.route("**/api/music/public-resource/v1/public_slug-123", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(publicResourceFixture) }));
      await page.route("**/socket.io/**", (route) => route.abort());
      await page.goto("/music/share/public_slug-123");
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1, name: "Music" })).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
      const input = page.getByRole("textbox", { name: /search for a song/i });
      expect(parseFloat(await input.evaluate((element) => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
      for (const control of await page.locator("main button, main input, main a").all()) {
        if (!(await control.isVisible())) continue;
        const box = await control.boundingBox();
        expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(44);
      }
      const last = page.locator("main button, main input, main a").last();
      await last.scrollIntoViewIfNeeded();
      const lastBox = await last.boundingBox();
      expect((lastBox?.y ?? 0) + (lastBox?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
      const audit = await new AxeBuilder({ page }).include("main").analyze();
      expect(audit.violations).toEqual([]);
      if (viewport.width === 320) {
        await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
      }
    });
  }
});

test.describe("PR-safe friendly public Music routes", { tag: LIVE_READ_ONLY_TAG }, () => {
  test("friendly route resolves one stable Account descriptor and shares canonical content", async ({ page }) => {
    const fixture = await installFriendlyMusicFixture(page, { profileMusic: true, descriptor: "available" });
    await page.goto("/fixture-owner/music");
    await expect(page.getByRole("heading", { name: "Music", level: 1 })).toBeVisible();
    await expect(page.getByText("Queued song")).toBeVisible();
    await expect(page.getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/fixture-owner");
    await expect(page.locator('link[rel="canonical"][data-rh="true"]')).toHaveAttribute("href", /\/music\/share\/public_slug-123$/);
    expect(fixture.descriptorRequests()).toBe(1);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Music", level: 1 })).toBeVisible();
  });

  test("friendly Music navigation preserves history, current-page semantics, heading order, and announcements", async ({ page }) => {
    await installFriendlyMusicFixture(page, { profileMusic: true, descriptor: "available" });
    await page.goto("/fixture-owner/music");
    await expect(page.getByRole("heading", { name: "Music", level: 1 })).toBeVisible();
    await expect(page.locator('a[aria-current="page"]')).toContainText(/music/i);
    const levels = await page.locator("main h1, main h2, main h3, main h4, main h5, main h6").evaluateAll((nodes) => nodes.map((node) => Number(node.tagName.slice(1))));
    expect(levels[0]).toBe(1);
    expect(levels.every((level, index) => index === 0 || level <= levels[index - 1]! + 1)).toBe(true);
    await expect(page.locator('[role="status"], [aria-live="polite"], [aria-live="assertive"]').first()).toBeAttached();
    await Promise.all([
      page.waitForURL(/\/fixture-owner$/),
      page.locator('a[href="/fixture-owner"]').first().click(),
    ]);
    await page.goBack();
    await expect(page).toHaveURL(/\/fixture-owner\/music$/);
    await expect(page.getByRole("heading", { name: "Music", level: 1 })).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/\/fixture-owner$/);
  });

  test("wrong username and descriptor outage use non-enumerating recovery", async ({ page }) => {
    await page.route("**/graphql", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { accounts: [], usersPermissionsUsers: [] } }) }));
    await page.goto("/definitely-wrong-music-owner/music");
    await expect(page.getByText(/unavailable|not found|not shared/i).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/account document|private|suspended|tombstone/i);
  });

  for (const row of [
    { profileMusic: true, descriptor: "missing" as const },
    { profileMusic: true, descriptor: "outage" as const },
    { profileMusic: false, descriptor: "available" as const },
  ]) {
    test(`explicit friendly recovery: preference=${row.profileMusic} descriptor=${row.descriptor}`, async ({ page }) => {
      await installFriendlyMusicFixture(page, row);
      await page.goto("/fixture-owner/music");
      if (row.descriptor === "outage") {
        await expect(page).toHaveURL(/\/fixture-owner\/music$/);
        await expect(page.getByText("Music is temporarily unavailable.")).toBeVisible();
        await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();
      } else {
        await expect(page).toHaveURL(/\/fixture-owner$/);
        await expect(page.getByRole("heading", { name: "Music page unavailable" })).toHaveCount(0);
      }
    });
  }

  for (const visual of [
    { name: "dark-banner-full-content", width: 390, height: 844, preset: "dark", wallpaperMode: "banner-top" },
    { name: "minimal-light-solid", width: 390, height: 844, preset: "minimal-light", wallpaperMode: "solid-color" },
    { name: "failed-image-fallback", width: 390, height: 844, preset: "dark", wallpaperMode: "banner-top", failedImage: true },
    { name: "mobile-reconnecting", width: 375, height: 667, preset: "dark", wallpaperMode: "ambient-gradient" },
    { name: "320-long-nav-stress", width: 320, height: 700, preset: "minimal-light", wallpaperMode: "solid-color" },
    { name: "desktop-full-content", width: 1440, height: 900, preset: "dark", wallpaperMode: "full-wallpaper-image" },
  ]) {
    test(`visual baseline ${visual.name}`, async ({ page }) => {
      await page.setViewportSize({ width: visual.width, height: visual.height });
      await installFriendlyMusicFixture(page, { profileMusic: true, descriptor: "available", ...visual });
      await page.goto("/fixture-owner/music");
      await expect(page.getByText("Queued song")).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page).toHaveScreenshot(`${visual.name}.png`, {
        animations: "disabled",
        maxDiffPixelRatio: 0.03,
        mask: [page.locator("img"), page.locator("iframe")],
      });
    });
  }
});

type GuestControls = {
  allowSongRequests: boolean;
  allowGuestPlayOnDevice: boolean;
  allowPlaylistSharing: boolean;
  allowRecentlyPlayedVisibility: boolean;
  allowQueueVisibility: boolean;
};

type OwnerState = {
  credential?: string;
};

function checkedInSettingsUpdateAccountDocument(): string {
  const source = readFileSync(
    resolve(import.meta.dirname, "../src/features/Settings/api/mutation.ts"),
    "utf8",
  );
  const matches = [...source.matchAll(/gql`([\s\S]*?)`/g)]
    .map((match) => parse(match[1]!, { noLocation: true }))
    .filter((document) => {
      if (document.definitions.length !== 1) return false;
      const definition = document.definitions[0];
      return definition.kind === Kind.OPERATION_DEFINITION
        && definition.operation === "mutation"
        && definition.name?.value === "UpdateAccount";
    });
  if (matches.length !== 1) {
    throw new Error("Music live fixture requires one checked-in Settings UpdateAccount document");
  }
  return print(matches[0]);
}

const settingsUpdateAccountDocument = checkedInSettingsUpdateAccountDocument();

const ownerStates = new WeakMap<Page, OwnerState>();

function ownerState(page: Page): OwnerState {
  const state = ownerStates.get(page);
  if (!state) throw new Error("fixture owner state was not initialized");
  return state;
}

function mutationHeaders(credential: string, key = `music-contract-${randomUUID()}`): Record<string, string> {
  return { Authorization: credential, Origin: fixtureOrigin, "Idempotency-Key": key };
}

function publicationHeaders(credential: string): Record<string, string> {
  return mutationHeaders(credential, `tunes-share-v1-${Date.now()}-${randomUUID()}`);
}

async function authenticateOwner(page: Page): Promise<string> {
  const fixtureStrapiToken = musicLiveStrapiTokenFromEnvironment();
  await page.goto(`/google-auth/callback?access_token=${encodeURIComponent(fixtureStrapiToken)}`);
  await expect(page.getByText("Login successful! Redirecting...")).toBeVisible();
  await page.goto("/recommendations/music");
  await expect(page.getByRole("tab", { name: "Playlists", exact: true })).toHaveAttribute("aria-selected", "true");
  const credential = process.env.MUSIC_E2E_AUTH_STATE_PATH ? musicOwnerCredentialFromAuthState() : ownerState(page).credential;
  expect(credential, "the fixture must mint an owner Music credential after Explorer login").toMatch(/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  return credential!;
}

async function canonicalPublicRevision(
  page: Page,
  publicSlug: string,
  stage: "initial-canonical-resource" | "online-canonical-apply",
): Promise<number> {
  return readLiveCanonicalPublicRevision({
    publicSlug,
    stage,
    read: async (path) => {
      const response = await page.request.get(`${fixtureOrigin}${path}`);
      return { status: response.status(), ...(response.status() === 204 ? {} : { body: await response.json() }) };
    },
  });
}

async function publicResource(page: Page, publicSlug: string, capability?: string) {
  return page.request.get(`${fixtureOrigin}/api/playlist/${publicSlug}`, {
    headers: capability ? { "X-Music-Guest-Capability": capability } : undefined,
  });
}

async function reconnectStage<T>(
  stage: ConstructorParameters<typeof LiveReconnectJourneyFailure>[0],
  code: ConstructorParameters<typeof LiveReconnectJourneyFailure>[1],
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof LiveReconnectJourneyFailure) throw error;
    throw new LiveReconnectJourneyFailure(stage, code);
  }
}

const disabledGuestControls = (): GuestControls => ({
  allowSongRequests: false,
  allowGuestPlayOnDevice: false,
  allowPlaylistSharing: false,
  allowRecentlyPlayedVisibility: false,
  allowQueueVisibility: false,
});

const liveJourneyAdapters = (journeyId: string) => ({
  journeyId,
  snapshot: async () => ({}),
  cleanupNamespace: async () => undefined,
  restore: async () => undefined,
});

async function prepareOwnerPublicJourney(
  page: Page,
  credential: string,
  controls: LivePublicJourneyControls,
) {
  const decode = async (response: Awaited<ReturnType<typeof page.request.fetch>>): Promise<LivePublicJourneyResponse> => ({
    status: response.status(),
    ...(response.status() === 204 ? {} : { body: await response.json() }),
  });
  return prepareLivePublicMusicJourney({
    seedId: randomUUID().replace(/-/g, "").slice(0, 8),
    privatePublicationIdempotencyKey: `tunes-share-v1-${Date.now()}-${randomUUID()}`,
    publicationIdempotencyKey: `tunes-share-v1-${Date.now()}-${randomUUID()}`,
    controls,
    read: async (path) => decode(await page.request.get(`${fixtureOrigin}${path}`, {
      headers: path === "/api/music/dashboard" ? { Authorization: credential } : undefined,
    })),
    updatePublicProfile: async () => guardedMutation("owner-publication", async () => decode(await page.request.post(
      `${process.env.MUSIC_E2E_STRAPI_URL}/graphql`,
      {
        headers: { Authorization: `Bearer ${musicLiveStrapiTokenFromEnvironment()}` },
        data: {
          query: settingsUpdateAccountDocument,
          variables: {
            documentId: process.env.MUSIC_E2E_ACCOUNT_DOCUMENT_ID,
            data: { public_music: "Yes" },
          },
        },
      },
    ))),
    mutate: async (callsite, request) => guardedMutation(callsite, async () => decode(await page.request.fetch(
      `${fixtureOrigin}${request.path}`,
      {
        method: request.method,
        headers: mutationHeaders(credential, request.idempotencyKey),
        data: request.data,
      },
    ))),
  });
}

test.beforeEach(async ({ page }) => {
  ownerStates.set(page, {});
  page.on("request", (request) => {
    const url = new URL(request.url());
    const authorization = request.headers().authorization;
    const fixtureStrapiToken = process.env.MUSIC_E2E_STRAPI_TOKEN;
    if (url.origin === fixtureOrigin
      && authorization?.startsWith("Bearer ")
      && authorization !== `Bearer ${fixtureStrapiToken}`
      && ["/api/music/dashboard", "/api/playlists", "/api/music/guest-controls"].includes(url.pathname)) {
      ownerState(page).credential = authorization;
    }
  });
});

test.afterEach(async ({ page }, testInfo) => {
  try {
    await attachLiveFailureScreenshotBestEffort(page, testInfo, "public-contract-fixture");
  } finally {
    ownerStates.delete(page);
  }
});

const permissionJourneyIds = {
  allowSongRequests: "music.owner-guest.permission.allow-song-requests",
  allowGuestPlayOnDevice: "music.owner-guest.permission.allow-guest-play-on-device",
  allowPlaylistSharing: "music.owner-guest.permission.allow-playlist-sharing",
  allowRecentlyPlayedVisibility: "music.owner-guest.permission.allow-recently-played-visibility",
  allowQueueVisibility: "music.owner-guest.permission.allow-queue-visibility",
} as const;

for (const control of [
  "allowSongRequests",
  "allowGuestPlayOnDevice",
  "allowPlaylistSharing",
  "allowRecentlyPlayedVisibility",
  "allowQueueVisibility",
] as const) {
  liveTest(`live owner/guest toggle ${control} restores the exact permission snapshot`, { tag: LIVE_MUTATION_TAG }, async ({ page, browser }) => {
    test.skip(
      Boolean(liveSkipReason),
      liveSkipReason ?? "authorized disposable Music live-write fixture",
    );
    const credential = await authenticateOwner(page);
    await withRestoredMusicFixture(liveJourneyAdapters(permissionJourneyIds[control]), async () => {
      const guest = await browser.newContext();
      try {
        const controls = { ...disabledGuestControls(), [control]: true };
        const prepared = await prepareOwnerPublicJourney(page, credential, controls);
        const guestPage = await guest.newPage();
        await assertLivePermissionGuestControlVisible(async () => {
          await guestPage.goto(`${fixtureOrigin}/music/share/${prepared.publicSlug}`);
          const guestEffect = control === "allowSongRequests"
            ? guestPage.getByRole("textbox", { name: /search for a song/i })
            : control === "allowGuestPlayOnDevice"
              ? guestPage.getByRole("button", { name: /play .*device/i })
              : control === "allowPlaylistSharing"
                ? guestPage.getByRole("heading", { name: /playlists/i })
                : control === "allowRecentlyPlayedVisibility"
                  ? guestPage.getByRole("heading", { name: /recently played/i })
                  : guestPage.getByRole("region", { name: "Up next", exact: true });
          await expect(guestEffect.first(), `${control} exposes its seeded guest control`).toBeVisible();
        });
      } finally {
        await guest.close();
      }
    });
  });
}

liveTest("live guest reconnect refetches canonical state after transport interruption", { tag: LIVE_MUTATION_TAG }, async ({ page, browser }) => {
  test.skip(
    Boolean(liveSkipReason),
    liveSkipReason ?? "authorized disposable Music fixture socket",
  );
  const credential = await authenticateOwner(page);
  await withRestoredMusicFixture(liveJourneyAdapters("music.owner-guest.reconnect"), async () => {
    const guest = await browser.newContext();
    try {
      const initialControls = disabledGuestControls();
      const prepared = await reconnectStage("preparation", "operation-failed",
        () => prepareOwnerPublicJourney(page, credential, initialControls));
      const beforeRevision = await canonicalPublicRevision(page, prepared.publicSlug, "initial-canonical-resource");
      const guestPage = await guest.newPage();
      await reconnectStage("guest-ready", "operation-failed",
        () => guestPage.goto(`${fixtureOrigin}/music/share/${prepared.publicSlug}`));
      await reconnectStage("guest-ready", "assertion-failed",
        () => expect(guestPage.getByRole("heading", { name: "Music", level: 1 })).toBeVisible());
      await reconnectStage("offline-announcement", "operation-failed", () => guest.setOffline(true));
      await reconnectStage("offline-announcement", "assertion-failed",
        () => expect(guestPage.getByRole("status").filter({ hasText: /reconnecting/i })).toHaveAttribute("aria-live", "polite"));
      const changed = await reconnectStage("owner-controls", "operation-failed",
        () => guardedMutation("guest-controls", () => page.request.patch(`${fixtureOrigin}/api/music/guest-controls`, {
          headers: mutationHeaders(credential), data: { ...initialControls, allowSongRequests: !initialControls.allowSongRequests },
        })));
      if (changed.status() !== 200) throw new LiveReconnectJourneyFailure("owner-controls", "http-failed");
      await reconnectStage("online-canonical-apply", "operation-failed", () => guest.setOffline(false));
      await reconnectStage("online-canonical-apply", "assertion-failed", () => expect.poll(
        () => canonicalPublicRevision(page, prepared.publicSlug, "online-canonical-apply"),
      ).toBeGreaterThan(beforeRevision));
      await reconnectStage("online-announcement-cleared", "assertion-failed",
        () => expect(guestPage.getByText(/reconnecting/i)).toBeHidden());
      const requestRegion = guestPage.getByRole("region", { name: "Request a song" });
      await reconnectStage("guest-control-visible", "assertion-failed", async () => {
        if (initialControls.allowSongRequests) await expect(requestRegion).toHaveCount(0);
        else await expect(requestRegion).toBeVisible();
      });
    } finally {
      await guest.close();
    }
  });
});

liveTest("live guest request accepts once, replays, conflicts, rate-limits, and owner revokes it", { tag: LIVE_MUTATION_TAG }, async ({ page }) => {
  test.skip(Boolean(liveSkipReason), liveSkipReason ?? "authorized guest request fixture");
  const credential = await authenticateOwner(page);
  await withRestoredMusicFixture(liveJourneyAdapters("music.guest.request-lifecycle"), async () => {
    const prepared = await prepareOwnerPublicJourney(page, credential, {
      ...disabledGuestControls(), allowSongRequests: true,
    });
    const publicSlug = prepared.publicSlug;
    const requestKey = `guest-request-${randomUUID()}`;
    const song = { youtubeId: "abcdefghijk", title: "Requested fixture song", artist: "Fixture artist", thumbnailUrl: `${fixtureOrigin}/images/tuneslogo.png` };
    const accepted = await guardedMutation("song-request", () => page.request.post(`${fixtureOrigin}/api/playlist/${publicSlug}/requests`, {
      headers: { Origin: fixtureOrigin, "Idempotency-Key": requestKey }, data: song,
    }));
    expect(accepted.status()).toBe(201);
    const replay = await guardedMutation("song-request", () => page.request.post(`${fixtureOrigin}/api/playlist/${publicSlug}/requests`, {
      headers: { Origin: fixtureOrigin, "Idempotency-Key": requestKey }, data: song,
    }));
    expect(replay.status()).toBe(201);
    const conflict = await guardedMutation("song-request", () => page.request.post(`${fixtureOrigin}/api/playlist/${publicSlug}/requests`, {
      headers: { Origin: fixtureOrigin, "Idempotency-Key": requestKey }, data: { ...song, title: "Different payload" },
    }));
    expect(conflict.status()).toBe(409);
    let rateLimited = false;
    for (let index = 0; index < 70 && !rateLimited; index += 1) {
      const response = await guardedMutation("song-request", () => page.request.post(`${fixtureOrigin}/api/playlist/${publicSlug}/requests`, {
        headers: { Origin: fixtureOrigin, "Idempotency-Key": `rate-${index}-${randomUUID()}` }, data: song,
      }));
      rateLimited = response.status() === 429;
    }
    expect(rateLimited).toBe(true);
    const dashboard = await page.request.get(`${fixtureOrigin}/api/music/dashboard`, { headers: { Authorization: credential } });
    const requested = (await dashboard.json() as { songs: Array<{ id: number; title: string }> }).songs.find(({ title }) => title === song.title);
    expect(requested).toBeDefined();
    const revoked = await guardedMutation("request-revoke", () => page.request.delete(`${fixtureOrigin}/api/playlist/songs/${requested!.id}`, { headers: mutationHeaders(credential) }));
    expect(revoked.status()).toBe(204);
  });
});

liveTest("live guest playback remains isolated while queue and player revisions refetch", { tag: LIVE_MUTATION_TAG }, async ({ page, browser }) => {
  test.skip(Boolean(liveSkipReason), liveSkipReason ?? "authorized guest playback fixture");
  const ownerCredential = await authenticateOwner(page);
  await withRestoredMusicFixture(liveJourneyAdapters("music.guest.playback-second-guest"), async () => {
    const guests: BrowserContext[] = [];
    try {
      guests.push(await browser.newContext());
      guests.push(await browser.newContext());
      const [guestA, guestB] = guests;
      const prepared = await prepareOwnerPublicJourney(page, ownerCredential, {
        ...disabledGuestControls(), allowGuestPlayOnDevice: true, allowQueueVisibility: true,
      });
      const a = await guestA.newPage();
      const b = await guestB.newPage();
      await Promise.all([
        a.goto(`${fixtureOrigin}/music/share/${prepared.publicSlug}`),
        b.goto(`${fixtureOrigin}/music/share/${prepared.publicSlug}`),
      ]);
      const before = await page.request.get(`${fixtureOrigin}/api/music/dashboard`, {
        headers: { Authorization: ownerCredential },
      });
      const beforeBody = await before.json() as Record<string, unknown>;

      await a.getByRole("button", { name: "Choose Fixture queued song to play on this device" }).click();
      await expect(a.getByTestId("public-music-player")).toContainText("Fixture queued song");
      await a.getByRole("button", { name: "Play Fixture queued song on this device" }).click();

      const after = await page.request.get(`${fixtureOrigin}/api/music/dashboard`, {
        headers: { Authorization: ownerCredential },
      });
      const afterBody = await after.json() as Record<string, unknown>;
      expect(afterBody).toEqual(beforeBody);
      await expect(
        b.getByTestId("public-music-player"),
        "second guest remains on the canonical owner selection",
      ).toContainText("Fixture playing song");
      await expect(b.getByTestId("public-music-player")).not.toContainText("Fixture queued song");
      await expect(b.locator("body")).not.toContainText(/credential|authorization|bearer/i);
    } finally {
      await Promise.allSettled(guests.map((guest) => guest.close()));
    }
  });
});

liveTest("owner publication, playlist visibility, and playlist-sharing settings persist and control fixture public access", { tag: LIVE_MUTATION_TAG }, async ({ page }) => {
  test.skip(
    Boolean(liveSkipReason),
    liveSkipReason ?? "authorized disposable integrated Music fixture",
  );
  const credential = await authenticateOwner(page);
  await withRestoredMusicFixture(liveJourneyAdapters("music.owner.publication-playlist-sharing"), async () => {
    const sharingEnabled: GuestControls = { ...disabledGuestControls(), allowPlaylistSharing: true };
    const prepared = await prepareOwnerPublicJourney(page, credential, sharingEnabled);
    const name = prepared.playlistName;
    const playlist = { id: prepared.playlistId };
    const publicCommand = { publication: { mode: "public", publicSlug: prepared.publicSlug } };

    const publicVisible = await publicResource(page, publicCommand.publication.publicSlug);
    expect(publicVisible.status(), "public workspace exposes a visible playlist when sharing is enabled").toBe(200);
    const publicVisibleBody = await publicVisible.json() as { playlists: Array<{ id: number; songs: Array<{ title: string }> }>; user: { allowPlaylistSharing: boolean } };
    expect(publicVisibleBody.user.allowPlaylistSharing).toBe(true);
    expect(publicVisibleBody.playlists).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: playlist.id, songs: expect.arrayContaining([expect.objectContaining({ title: "Fixture playing song" })]) }),
    ]));
    expect(publicVisibleBody).toMatchObject({ songs: [], allowQueueVisibility: false, user: { allowQueueVisibility: false } });

  const queueEnabled: GuestControls = { ...sharingEnabled, allowQueueVisibility: true };
  const enabledQueue = await guardedMutation("guest-controls", () => page.request.patch(`${fixtureOrigin}/api/music/guest-controls`, {
    headers: mutationHeaders(credential), data: queueEnabled,
  }));
  expect(enabledQueue.status()).toBe(200);
  const publicQueueEnabled = await publicResource(page, publicCommand.publication.publicSlug);
  expect(publicQueueEnabled.status()).toBe(200);
  expect(await publicQueueEnabled.json()).toMatchObject({
    songs: expect.arrayContaining([expect.objectContaining({ id: expect.any(Number), title: "Fixture queued song" })]),
    allowQueueVisibility: true,
    user: { allowQueueVisibility: true },
  });

  await page.goto("/recommendations/music");
  await expect(page.getByRole("switch", { name: `Make ${name} private` })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("tab", { name: "Live", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Show shared playlists" })).toHaveAttribute("aria-checked", "true");

  const hidden = await guardedMutation("playlist-visibility", () => page.request.patch(`${fixtureOrigin}/api/playlists/${playlist.id}/visibility`, {
    headers: mutationHeaders(credential), data: { isVisibleToGuests: false },
  }));
  expect(hidden.status()).toBe(204);
  const publicHiddenPlaylist = await publicResource(page, publicCommand.publication.publicSlug);
  expect(publicHiddenPlaylist.status()).toBe(200);
  expect((await publicHiddenPlaylist.json() as { playlists: Array<{ id: number }> }).playlists).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: playlist.id })]));

  const visibleAgain = await guardedMutation("playlist-visibility", () => page.request.patch(`${fixtureOrigin}/api/playlists/${playlist.id}/visibility`, {
    headers: mutationHeaders(credential), data: { isVisibleToGuests: true },
  }));
  expect(visibleAgain.status()).toBe(204);
  const sharingDisabled: GuestControls = { ...queueEnabled, allowPlaylistSharing: false };
  const disabled = await guardedMutation("guest-controls", () => page.request.patch(`${fixtureOrigin}/api/music/guest-controls`, {
    headers: mutationHeaders(credential), data: sharingDisabled,
  }));
  expect(disabled.status()).toBe(200);
  const publicSharingDisabled = await publicResource(page, publicCommand.publication.publicSlug);
  expect(publicSharingDisabled.status()).toBe(200);
  expect((await publicSharingDisabled.json() as { playlists: unknown[] }).playlists).toEqual([]);

  const sharingRestored = await guardedMutation("guest-controls", () => page.request.patch(`${fixtureOrigin}/api/music/guest-controls`, {
    headers: mutationHeaders(credential), data: queueEnabled,
  }));
  expect(sharingRestored.status()).toBe(200);
  await page.goto("/recommendations/music");
  await expect(page.getByRole("switch", { name: `Make ${name} private` })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("tab", { name: "Live", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Show shared playlists" })).toHaveAttribute("aria-checked", "true");

  const madeUnlisted = await guardedMutation("owner-publication", () => page.request.post(`${fixtureOrigin}/api/music/publication`, {
    headers: publicationHeaders(credential), data: { mode: "unlisted" },
  }));
  expect(madeUnlisted.status()).toBe(200);
  const unlistedCommand = await madeUnlisted.json() as { publication: { mode: string; publicSlug: string }; capability: string };
  expect(unlistedCommand.publication).toMatchObject({ mode: "unlisted", publicSlug: publicCommand.publication.publicSlug });
  expect(unlistedCommand.capability).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect((await publicResource(page, unlistedCommand.publication.publicSlug)).status(), "unlisted access without its fragment capability").toBe(404);
  const unlistedResource = await publicResource(page, unlistedCommand.publication.publicSlug, unlistedCommand.capability);
  expect(unlistedResource.status(), "unlisted access with its fragment capability").toBe(200);
  expect(unlistedResource.headers()["x-robots-tag"]).toBe("noindex, nofollow");

  await page.goto(`/music/share/${unlistedCommand.publication.publicSlug}#access=${unlistedCommand.capability}`);
  await expect(page.getByRole("heading", { name })).toBeVisible();

  const madePrivate = await guardedMutation("owner-publication", () => page.request.post(`${fixtureOrigin}/api/music/publication`, {
    headers: publicationHeaders(credential), data: { mode: "private" },
  }));
  expect(madePrivate.status()).toBe(200);
  expect((await publicResource(page, publicCommand.publication.publicSlug, unlistedCommand.capability)).status(), "private workspaces never expose public resources").toBe(404);
  });
});
