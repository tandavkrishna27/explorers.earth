import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { setupMockAuthentication } from "./setup/auth";
import { canonicalAccountFixture, canonicalCategoryAccount } from "../src/test/canonicalAccountFixture";

const artifactDirectory = resolve(process.cwd(), "../.artifacts/task-9");
const credential = "browser-only-music-credential";
// Ensure accepts the canonical same-origin route and the legacy Music-origin
// path, because the full-stack fixtures still answer the latter.
const ENSURE_ROUTE = /\/api\/(?:explorers\/v1\/)?music\/identity\/ensure$/;
const completeAccount = {
  __typename: "Account",
  documentId: "account-document-123",
  Account_Name: "Explorer",
  Account_Type: "Personal",
  mobile_number: "+15555550123",
  profile_picture: null,
  public_profile: "Yes",
  public_recommendations: "No",
  public_music: "No",
  public_guides: "No",
  public_movie: "No",
  public_books: "No",
  public_games: "No",
  public_apps: "No",
  public_products: "No",
  public_people: "No",
  pinned_nav_tabs: [],
  auto_pinning: true,
};

type MockOptions = {
  playlists?: Array<Record<string, unknown>>;
  ensureFailures?: number;
  ensureDelayMs?: number;
  ensureGate?: { call: number; wait: Promise<void> };
  ownerWorkspace?: boolean;
};

async function installMusicMocks(page: Page, options: MockOptions = {}) {
  let ensureCalls = 0;
  let publicationMode: "private" | "unlisted" | "public" = "private";
  let accountState = { ...completeAccount };
  const publicationCommands: Array<{ body: unknown; idempotencyKey: string | null }> = [];
  const warnings: string[] = [];
  const pageErrors: string[] = [];
  const playlists = options.playlists ?? [];

  // The canonical account is the one the navigation reads and writes, so it has to be
  // durable across the read and the write below: publishing Music commits
  // `public_music` through PATCH /api/explorers/v1/account and then re-reads to confirm
  // it, and a fixture that always replied with the seed would report it unconfirmed.
  let canonicalAccount = canonicalCategoryAccount({
    handle: "testuser", displayName: accountState.Account_Name,
    mobileNumber: accountState.mobile_number,
  });

  await page.route("**/api/explorers/v1/me", route => {
    if (route.request().method() !== "GET" || new URL(route.request().url()).origin !== new URL(String(test.info().project.use.baseURL)).origin) return route.abort("blockedbyclient");
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ account: canonicalAccount }),
    });
  });

  // The navigation client no longer issues the legacy UpdateTabVisibility mutation; it
  // writes the whole canonical preference set through this one command.
  await page.route("**/api/explorers/v1/account", async route => {
    const request = route.request();
    if (request.method() !== "PATCH") return route.abort("blockedbyclient");
    const patch = request.postDataJSON() as {
      expectedRevision?: number;
      categories?: Array<{ category: string; isPublic: boolean; displayOrder: number; pinnedOrder: number | null }>;
      autoPinning?: boolean;
    };
    if (patch.expectedRevision !== canonicalAccount.revision) {
      return route.fulfill({
        status: 409, contentType: "application/json",
        body: JSON.stringify({ error: { code: "CONFLICT", message: "Fixture revision moved.", requestId: "music-e2e-account" } }),
      });
    }
    canonicalAccount = {
      ...canonicalAccount,
      revision: canonicalAccount.revision + 1,
      ...(patch.categories ? { categories: patch.categories.map(row => ({ ...row })) } : {}),
      ...(patch.autoPinning === undefined ? {} : { autoPinning: patch.autoPinning }),
    };
    // Keep the legacy projection the GraphQL eligibility query still reads in step.
    const music = canonicalAccount.categories.find(row => row.category === "music");
    if (music) accountState = { ...accountState, public_music: music.isPublic ? "Yes" : "No" };
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ account: canonicalAccount }),
    });
  });

  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type())) warnings.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.route("**/graphql", async (route) => {
    const payload = route.request().postDataJSON();
    const query = payload?.query ?? "";
    if (query.includes("mutation UpdateTabVisibility")) {
      accountState = { ...accountState, ...(payload?.variables?.data ?? {}) };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { updateAccount: accountState } }),
      });
      return;
    }
    if (query.includes("usersPermissionsUser")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            usersPermissionsUser: {
              __typename: "UsersPermissionsUser",
              documentId: "mock-user-123",
              username: "testuser",
              email: "test@explorers.earth",
              razorpay_customer_id: null,
              provider: "local",
              confirmed: true,
              blocked: false,
              accounts: [accountState],
            },
          },
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {} }) });
  });

  await page.route(ENSURE_ROUTE, async (route) => {
    ensureCalls += 1;
    if (options.ensureGate && ensureCalls >= options.ensureGate.call) await options.ensureGate.wait;
    if (options.ensureDelayMs) await new Promise((resolveDelay) => setTimeout(resolveDelay, options.ensureDelayMs));
    if (ensureCalls <= (options.ensureFailures ?? 0)) {
      const requestId = `music-e2e-ensure-${ensureCalls}`;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: {
          "retry-after": "1",
          "x-request-id": requestId,
          "access-control-expose-headers": "Retry-After, X-Request-Id",
        },
        body: JSON.stringify({
          version: "music-error/v1",
          error: {
            code: "UPSTREAM_UNAVAILABLE",
            message: "Contained fixture failure.",
            action: "retry",
            retryable: true,
            requestId,
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ credential: { token: credential, expiresAt: Date.now() + 600_000 } }),
    });
  });

  await page.route("**/api/playlists", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(playlists) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: 99, name: "Road songs", description: null, isVisibleToGuests: false, songs: [] }),
    });
  });
  await page.route("**/api/music/dashboard", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      queueRevision: 0,
      songs: [],
      currentlyPlaying: null,
      playedSongs: [],
      publication: { mode: publicationMode, publicSlug: "public-slug-123" },
      guestControls: { allowSongRequests: false, allowGuestPlayOnDevice: false, allowPlaylistSharing: false, allowRecentlyPlayedVisibility: false, allowQueueVisibility: false },
    }),
  }));
  // Ticket 6.3. One purpose-limited handshake ticket per connection attempt.
  await page.route("**/api/music/socket-ticket", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      version: "music-socket-ticket/v1",
      ticket: { token: "fixture.socket.ticket", expiresAt: Math.floor(Date.now() / 1000) + 60 },
    }),
  }));
  await page.route("**/api/music/entitlement", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ state: "included", coreRead: true, coreMutation: true, paidMutation: false, maxAgeSeconds: 600 }),
  }));
  await page.route("**/api/music/publication", (route) => {
    const body = route.request().postDataJSON();
    publicationMode = body.mode;
    publicationCommands.push({ body, idempotencyKey: route.request().headers()["idempotency-key"] ?? null });
    return route.fulfill({
    status: 200,
    contentType: "application/json",
      body: JSON.stringify({
        version: "music-publication/v1",
        publication: { mode: body.mode, publicSlug: "public-slug-123" },
        ...(body.mode === "unlisted" ? { capability: "a".repeat(43) } : {}),
      }),
    });
  });
  // The owner scope is keyed on the canonical account id, so the descriptor is
  // discovered by that id rather than the Strapi account document id. Derived from the
  // shared fixture so the two cannot drift apart.
  await page.route(`**/api/music/public-profile/${canonicalAccountFixture().id}`, (route) => route.fulfill({
    status: publicationMode === "public" ? 200 : 404,
    contentType: "application/json",
    body: publicationMode === "public"
      ? JSON.stringify({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "public-slug-123", revision: 1 } })
      : JSON.stringify({}),
  }));
  await page.route("**/api/playlists/*/visibility", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/playlists/*/reorder", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/music/guest-controls", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: route.request().postData() ?? "{}",
  }));
  await page.route("**/api/music/features", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ownerWorkspace: options.ownerWorkspace ?? false,
      guestWorkspace: false,
      playlistImports: false,
      exposureId: "music-e2e-exposure",
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    }),
  }));

  return {
    ensureCalls: () => ensureCalls,
    publicationCommands,
    warnings,
    pageErrors,
  };
}

async function openSharingSettings(page: Page) {
  const opener = page.getByRole("button", { name: "Open playlist and sharing menu" });
  await opener.click();
  await page.getByRole("menuitem", { name: "Sharing settings" }).click();
  return opener;
}

test.beforeEach(async ({ context }) => {
  await setupMockAuthentication(context);
});

for (const width of [320, 375, 640, 768, 1024]) {
  test(`Music ready-empty remains responsive and accessible at ${width}px`, async ({ page }) => {
    mkdirSync(artifactDirectory, { recursive: true });
    const audit = await installMusicMocks(page);
    await page.setViewportSize({ width, height: 820 });
    await page.goto("/recommendations/music");

    const title = page.getByRole("heading", { name: "Music", level: 1 });
    await expect(title).toHaveClass("sr-only");
    await expect(page.getByRole("heading", { name: "Create your first playlist" })).toBeVisible();
    await expect(page.getByText("Build a playlist to collect and share the music you love.")).toBeVisible();
    await expect(page.getByRole("button", { name: "New playlist" })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const musicMain = page.locator("section.dashboard-theme");
    const contrastRatios = await musicMain.evaluate((main) => {
      const parse = (value: string) => {
        const parts = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
        const rgb = value.startsWith("color(srgb") ? parts.slice(0, 3).map((part) => part * 255) : parts.slice(0, 3);
        return [...rgb, parts[3] ?? 1];
      };
      const luminance = (rgb: number[]) => {
        const channel = rgb.map((part) => {
          const normalized = part / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * channel[0] + 0.7152 * channel[1] + 0.0722 * channel[2];
      };
      const ratio = (element: Element) => {
        const foreground = parse(getComputedStyle(element).color);
        let backgroundElement: Element | null = element;
        let background = [0, 0, 0];
        while (backgroundElement) {
          const computed = getComputedStyle(backgroundElement).backgroundColor;
          if (computed !== "rgba(0, 0, 0, 0)" && computed !== "transparent") {
            background = parse(computed);
            break;
          }
          backgroundElement = backgroundElement.parentElement;
        }
        const compositedForeground = foreground.slice(0, 3).map((part, index) => part * foreground[3] + background[index] * (1 - foreground[3]));
        const [bright, dark] = [luminance(compositedForeground), luminance(background)].sort((a, b) => b - a);
        return (bright + 0.05) / (dark + 0.05);
      };
      return [
        ratio(Array.from(main.querySelectorAll("p")).find((node) => node.textContent?.startsWith("Build a playlist"))!),
        ratio(Array.from(main.querySelectorAll("button")).find((node) => node.textContent?.trim() === "New playlist")!),
      ];
    });
    for (const ratio of contrastRatios) expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect((await musicMain.innerText())).not.toMatch(/Local Tunes|integration|provisioning|projection|ensure|sync|database|Strapi|token/i);

    for (const control of await musicMain.getByRole("button").all()) {
      if (await control.isVisible()) {
        const box = await control.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
    }

    await page.screenshot({ path: resolve(artifactDirectory, `music-ready-empty-${width}.png`), fullPage: true });
    expect(audit.ensureCalls()).toBe(1);
    expect(audit.pageErrors).toEqual([]);
    expect(audit.warnings.filter((message) => /go\.apollo\.dev|missing field|cache data may be lost|invariant.*documentid/i.test(message))).toEqual([]);
    const browserStorage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    expect(browserStorage).not.toContain(credential);
  });
}

test("sharing dialog traps focus, closes with Escape, and exposes only approved modes", async ({ page }) => {
  await installMusicMocks(page);
  await page.setViewportSize({ width: 375, height: 820 });
  await page.goto("/recommendations/music");
  const opener = await openSharingSettings(page);
  const dialog = page.getByRole("dialog", { name: "Music sharing" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("radio")).toHaveCount(3);
  await expect(dialog.getByText("Private", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Unlisted", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Public", { exact: true })).toBeVisible();
  await dialog.getByRole("radio", { name: "Public" }).check();
  await expect(dialog.getByText("Anyone can view shared playlists, and the page can appear in search.")).toBeVisible();
  await expect(dialog.getByLabel("Music share link")).toHaveCount(0);

  const first = dialog.getByRole("radio", { name: "Private" });
  const last = dialog.getByRole("button", { name: "Save sharing" });
  await last.focus();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(last).toBeFocused();
  await page.screenshot({ path: resolve(artifactDirectory, "music-sharing-375.png"), fullPage: true });

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("sharing save uses one canonical publication command and restores focus", async ({ page }) => {
  const audit = await installMusicMocks(page);
  await page.goto("/recommendations/music");
  const opener = await openSharingSettings(page);
  const dialog = page.getByRole("dialog", { name: "Music sharing" });
  await dialog.getByRole("radio", { name: "Public" }).check();
  await dialog.getByRole("button", { name: "Save sharing" }).click();
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  expect(audit.publicationCommands).toHaveLength(1);
  expect(audit.publicationCommands[0]).toEqual({
    body: { mode: "public" },
    idempotencyKey: expect.stringMatching(/^tunes-share-v1-\d{13}-[0-9a-f-]{36}$/),
  });
});

test("account-generation resets Music authority across tabs without logging Explorer out", async ({ page, context }) => {
  const second = await context.newPage();
  await installMusicMocks(page);
  let releaseSecondEnsure!: () => void;
  const secondEnsureGate = new Promise<void>((resolveGate) => { releaseSecondEnsure = resolveGate; });
  const secondAudit = await installMusicMocks(second, {
    playlists: [{ id: 10, name: "Old account playlist", description: null, isVisibleToGuests: false, songs: [] }],
    ensureGate: { call: 2, wait: secondEnsureGate },
  });
  await page.goto("/recommendations/music");
  await second.goto("/recommendations/music");
  await expect(second.getByRole("button", { name: /^Old account playlist/ })).toBeVisible();

  await page.evaluate(() => {
    const event = { version: "music-session/v1", kind: "account-generation", eventId: crypto.randomUUID() };
    localStorage.setItem("explorers-music-session", JSON.stringify(event));
    localStorage.removeItem("explorers-music-session");
  });

  await expect(second).toHaveURL(/\/recommendations\/music$/);
  await expect.poll(secondAudit.ensureCalls).toBeGreaterThanOrEqual(2);
  await expect(second.getByRole("button", { name: /^Old account playlist/ })).toHaveCount(0);
  // The replaced assertion read `auth-storage`.state.isAuthenticated. The store now
  // persists nothing (`partialize: () => ({})`) because the canonical session cookie is
  // the only authority, so that key is permanently empty and cannot witness anything.
  // The behaviour it guarded - resetting Music authority must not sign the Explorer out
  // - is asserted here against what a signed-out tab would actually do: ProtectedRoute
  // sends it to /login and the authenticated shell disappears.
  await expect(second).not.toHaveURL(/\/login$/);
  await expect(second.getByRole("heading", { name: "Music", level: 1 })).toBeAttached();
  releaseSecondEnsure();
  await expect(second.getByRole("button", { name: /^Old account playlist/ })).toBeVisible();
  expect(secondAudit.ensureCalls()).toBeGreaterThanOrEqual(2);
  await second.close();
});

test("logout boundary clears Explorer authentication in another tab", async ({ page, context }) => {
  const second = await context.newPage();
  await installMusicMocks(page);
  await installMusicMocks(second);
  await page.goto("/recommendations/music");
  await second.goto("/recommendations/music");
  // ADR-006: the canonical session is the authority, so a logout is the session actually
  // ending. Sign out first, because a tab that re-verifies a still-valid session is
  // entitled to come straight back - the replaced localStorage assertion could not tell
  // those two outcomes apart.
  await page.evaluate(() => fetch("/api/auth/sign-out", { method: "POST", credentials: "include" }).then(() => undefined));
  await page.evaluate(() => {
    const event = { version: "music-session/v1", kind: "logout", eventId: crypto.randomUUID() };
    localStorage.setItem("explorers-music-session", JSON.stringify(event));
    localStorage.removeItem("explorers-music-session");
  });
  // The replaced assertion read `auth-storage`.state.isAuthenticated, which the store no
  // longer persists at all. The safety behaviour it guarded - a logout in one tab really
  // does de-authenticate the other - is asserted against the canonical consequence: the
  // other tab loses its authority and ProtectedRoute sends it to the login route.
  await expect(second).toHaveURL(/\/login$/);
  await expect(second.getByRole("heading", { name: "Music", level: 1 })).toHaveCount(0);
  await second.close();
});

test("playlist tabs, keyboard reorder, and polite announcement work without mutable owner data", async ({ page }) => {
  const playlists = [
    {
      id: 10,
      name: "Road songs",
      description: "For the drive",
      isVisibleToGuests: false,
      songs: [
        {
          id: 1, playlistId: 10, youtubeId: "northSong01", title: "North", artist: "Sky",
          thumbnailUrl: "https://images.example/north.jpg", position: 0, addedAt: "2026-08-26T00:00:00.000Z",
        },
        {
          id: 2, playlistId: 10, youtubeId: "southSong02", title: "South", artist: "Sea",
          thumbnailUrl: "https://images.example/south.jpg", position: 1, addedAt: "2026-08-26T00:00:00.000Z",
        },
      ],
    },
    { id: 11, name: "Quiet", description: null, isVisibleToGuests: true, songs: [] },
  ];
  await installMusicMocks(page, { playlists, ownerWorkspace: true });
  await page.goto("/recommendations/music");
  await page.getByRole("button", { name: /^Road songs/ }).click();
  await page.getByRole("button", { name: "Move North down" }).click();
  await expect(page.getByText("North moved to position 2.")).toHaveCount(1);
});

test("a Music outage keeps the Explorer shell usable and explicit retry recovers", async ({ page }) => {
  // Exhaust the client's three-attempt reliability budget; the explicit UI retry is call four.
  const audit = await installMusicMocks(page, { ensureFailures: 3 });
  await page.goto("/recommendations/music");
  await expect(page.getByText("Music is taking longer than expected. Your Explorers account is ready.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Home/i }).or(page.getByRole("button", { name: /Home/i })).first()).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Create your first playlist" })).toBeVisible();
  expect(audit.ensureCalls()).toBe(4);
});

test("Music loading animation respects reduced-motion preference", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let releaseEnsure!: () => void;
  const ensureGate = new Promise<void>((resolveGate) => { releaseEnsure = resolveGate; });
  await installMusicMocks(page, { ensureGate: { call: 1, wait: ensureGate } });
  // The identity request is intentionally kept pending so the loading skeleton
  // remains observable. Waiting for the full load event couples this assertion
  // to unrelated late-loading resources and can exhaust the navigation timeout.
  await page.goto("/recommendations/music", { waitUntil: "domcontentloaded" });
  const skeleton = page.locator("section.dashboard-theme .animate-pulse").first();
  await expect(skeleton).toBeVisible();
  expect(await skeleton.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  releaseEnsure();
  await expect(page.getByRole("heading", { name: "Create your first playlist" })).toBeVisible();
});

test("public private, missing, and invalid links converge on the exact 404", async ({ page }) => {
  await page.route("**/api/music/public-resource/v1/**", (route) => route.fulfill({ status: 403, contentType: "application/json", body: "{}" }));
  await page.goto("/music/share/public-slug-123");
  await expect(page.getByRole("heading", { name: "Music page unavailable" })).toBeVisible();
  await expect(page.getByText("No public playlists yet.")).toHaveCount(0);
});

test("a valid public owner with no visible playlists has the exact reachable empty state", async ({ page }) => {
  await page.route("**/api/music/public-resource/v1/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ version: "music-public-resource/v1", revision: 1, user: { username: "fixture", venueName: "Fixture" }, permissions: { allowSongRequests: false, allowGuestPlayOnDevice: false, allowPlaylistSharing: true, allowRecentlyPlayedVisibility: false, allowQueueVisibility: false }, currentlyPlaying: null, queue: { items: [], total: 0, truncated: false }, recentlyPlayed: { items: [], total: 0, truncated: false }, playlists: { items: [], total: 0, truncated: false } }),
  }));
  await page.goto("/music/share/public-slug-123");
  await expect(page.getByRole("heading", { name: "Music", level: 1 })).toBeVisible();
  await expect(page.getByText("Nothing has been shared here yet")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Music page unavailable" })).toHaveCount(0);
});

test("public rate-limit retry waits for Retry-After and then reaches the empty state", async ({ page }) => {
  let requests = 0;
  let rateLimited = true;
  await page.route("**/api/music/public-resource/v1/**", (route) => {
    requests += 1;
    if (rateLimited) return route.fulfill({ status: 429, headers: { "retry-after": "3", "access-control-expose-headers": "Retry-After" }, body: "{}" });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ version: "music-public-resource/v1", revision: 1, user: { username: "fixture", venueName: "Fixture" }, permissions: { allowSongRequests: false, allowGuestPlayOnDevice: false, allowPlaylistSharing: true, allowRecentlyPlayedVisibility: false, allowQueueVisibility: false }, currentlyPlaying: null, queue: { items: [], total: 0, truncated: false }, recentlyPlayed: { items: [], total: 0, truncated: false }, playlists: { items: [], total: 0, truncated: false } }) });
  });
  await page.goto("/music/share/public-slug-123");
  await expect(page.getByRole("heading", { name: "Too many requests. Try again in 3 seconds." })).toBeVisible();
  const retry = page.getByRole("button", { name: "Retry" });
  await expect(retry).toBeDisabled();
  await expect(retry).toBeEnabled({ timeout: 4_000 });
  rateLimited = false;
  await retry.click();
  await expect(page.getByText("Nothing has been shared here yet")).toBeVisible();
  expect(requests).toBeGreaterThanOrEqual(2);
});
