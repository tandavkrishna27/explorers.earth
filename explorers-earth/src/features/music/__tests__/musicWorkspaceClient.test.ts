import { describe, expect, it, vi } from "vitest";
import { createMusicWorkspaceClient } from "../musicWorkspaceClient";
import { MusicClientError } from "../../../lib/localTunesApiClient";

describe("canonical Music workspace client", () => {
  it('reads only the parsed dashboard for publication hydration', async () => {
    const dashboard = { queueRevision: 1, songs: [], playedSongs: [], currentlyPlaying: null, publication: { mode: 'private', publicSlug: 'public-slug' } };
    const request = vi.fn(async () => new Response(JSON.stringify(dashboard)));
    const client = createMusicWorkspaceClient(request);
    expect(typeof client.loadDashboard).toBe('function');
    await expect(client.loadDashboard()).resolves.toEqual(dashboard);
    expect(request.mock.calls).toEqual([[{ method: 'GET', path: '/api/music/dashboard' }]]);
  });
  it('lightweight publication reads reject missing mode instead of defaulting Private', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ queueRevision: 1, songs: [], playedSongs: [], currentlyPlaying: null, publication: { publicSlug: 'public-slug' } })));
    const client = createMusicWorkspaceClient(request);
    expect(typeof client.loadDashboard).toBe('function');
    await expect(client.loadDashboard()).rejects.toMatchObject({ status: 502, code: 'SERVICE_UNAVAILABLE' });
  });
  it("uses only owner-derived canonical routes and exact DTO bodies", async () => {
    const playlistSong = { id: 9, playlistId: 7, youtubeId: "abcdefghijk", title: "Saved", artist: "Artist", thumbnailUrl: "https://img", position: 0, addedAt: "2026-08-25T10:00:00.000Z" };
    const playlist = { id: 7, userId: 11, name: "Road songs", description: null, isVisibleToGuests: false, createdAt: "2026-08-25T10:00:00.000Z", updatedAt: "2026-08-25T10:00:00.000Z", songs: [playlistSong] };
    const request = vi.fn(async (input: { path: string; method?: string }) => input.path === "/api/playlists" && input.method === "GET"
      ? new Response(JSON.stringify([playlist]), { status: 200 })
      : input.path === "/api/music/dashboard"
        ? new Response(JSON.stringify({ queueRevision: 6, songs: [], playedSongs: [], currentlyPlaying: null, publication: { mode: "private", publicSlug: "public-slug" } }), { status: 200 })
        : input.path === "/api/music/entitlement"
          ? new Response(JSON.stringify({ state: "included", coreRead: true, coreMutation: true, paidMutation: false, maxAgeSeconds: 600 }), { status: 200 })
          : input.path === "/api/music/publication"
            ? new Response(JSON.stringify({
              version: "music-publication/v1",
              publication: { mode: (input as { body?: { mode?: string } }).body?.mode, publicSlug: "public-slug" },
            }), { status: 200 })
          : (input.path === "/api/playlists" || input.path === "/api/playlists/7")
            ? new Response(JSON.stringify({ ...playlist, name: input.path.endsWith("/7") ? "Renamed" : "Road songs" }), { status: 200 })
            : new Response(null, { status: 204 }));
    const client = createMusicWorkspaceClient(request);
    await expect(client.load()).resolves.toMatchObject({ dashboard: { queueRevision: 6 }, playlists: [{ songs: [playlistSong] }] });
    await client.createPlaylist("Road songs", "For later", "create-playlist-1");
    await client.renamePlaylist(7, "Renamed", null, "rename-playlist-1");
    await client.setPlaylistVisibility(7, true, "visibility-playlist-1");
    await client.reorderPlaylistSong(7, 9, 2, "reorder-playlist-1");
    await client.setPublication("public", "publication-mode-1");
    await client.setPublication("private", "publication-mode-2");

    expect(request.mock.calls).toEqual([
      [{ method: "GET", path: "/api/playlists" }],
      [{ method: "GET", path: "/api/music/dashboard" }],
      [{ method: "GET", path: "/api/music/entitlement" }],
      [{ method: "POST", path: "/api/playlists", body: { name: "Road songs", description: "For later" }, idempotencyKey: "create-playlist-1" }],
      [{ method: "PATCH", path: "/api/playlists/7", body: { name: "Renamed", description: null }, idempotencyKey: "rename-playlist-1" }],
      [{ method: "PATCH", path: "/api/playlists/7/visibility", body: { isVisibleToGuests: true }, idempotencyKey: "visibility-playlist-1" }],
      [{ method: "PATCH", path: "/api/playlists/7/reorder", body: { songId: 9, position: 2 }, idempotencyKey: "reorder-playlist-1" }],
      [{ method: "POST", path: "/api/music/publication", body: { mode: "public" }, idempotencyKey: "publication-mode-1" }],
      [{ method: "POST", path: "/api/music/publication", body: { mode: "private" }, idempotencyKey: "publication-mode-2" }],
    ]);
    expect(JSON.stringify(request.mock.calls)).not.toMatch(/username|email|ownerId|accountId|documentId|X-Username/i);
  });

  it.each([
    { queueRevision: -1, songs: [], playedSongs: [], currentlyPlaying: null, publication: { mode: "private", publicSlug: "public-slug" } },
    { queueRevision: 1, songs: new Array(501).fill({}), playedSongs: [], currentlyPlaying: null, publication: { mode: "private", publicSlug: "public-slug" } },
    { queueRevision: 1, songs: [], playedSongs: [], currentlyPlaying: null, publication: { mode: "private", publicSlug: "public-slug" }, extra: true },
  ])("rejects a malformed successful dashboard DTO %#", async (dashboard) => {
    const request = vi.fn(async (input: { path: string }) => input.path === "/api/playlists"
      ? new Response("[]")
      : input.path === "/api/music/dashboard"
        ? new Response(JSON.stringify(dashboard))
        : new Response(JSON.stringify({ state: "included", coreRead: true, coreMutation: true, paidMutation: false, maxAgeSeconds: 600 })));
    await expect(createMusicWorkspaceClient(request).load()).rejects.toMatchObject({ status: 502, code: "SERVICE_UNAVAILABLE" });
  });

  it("rejects queue-only fields on a saved-playlist song", async () => {
    const saved = { id: 9, playlistId: 7, youtubeId: "abcdefghijk", title: "Saved", artist: "Artist", thumbnailUrl: "https://img", position: 0, addedAt: "2026-08-25T10:00:00.000Z", status: "queued" };
    const request = vi.fn(async (input: { path: string }) => input.path === "/api/playlists"
      ? new Response(JSON.stringify([{ id: 7, userId: 11, name: "Road songs", description: null, isVisibleToGuests: false, createdAt: "2026-08-25T10:00:00.000Z", updatedAt: "2026-08-25T10:00:00.000Z", songs: [saved] }]))
      : input.path === "/api/music/dashboard"
        ? new Response(JSON.stringify({ queueRevision: 1, songs: [], playedSongs: [], currentlyPlaying: null, publication: { mode: "private", publicSlug: "public-slug" } }))
        : new Response(JSON.stringify({ state: "included", coreRead: true, coreMutation: true, paidMutation: false, maxAgeSeconds: 600 })));
    await expect(createMusicWorkspaceClient(request).load()).rejects.toMatchObject({ status: 502, code: "SERVICE_UNAVAILABLE" });
  });

  it("rejects malformed successful JSON without leaking it", async () => {
    const request = vi.fn().mockResolvedValue(new Response("{secret-invalid-json"));
    const error = await createMusicWorkspaceClient(request).createPlaylist("Safe", null, "safe-create").catch((cause) => cause);
    expect(error).toMatchObject({ status: 502, code: "SERVICE_UNAVAILABLE" });
    expect(error.message).not.toContain("secret-invalid-json");
  });

  it("rejects a malformed successful playlist DTO", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 7, name: "Unsafe", description: null, isVisibleToGuests: false, songs: [], extra: true })));
    await expect(createMusicWorkspaceClient(request).createPlaylist("Safe", null, "safe-create"))
      .rejects.toMatchObject({ status: 502, code: "SERVICE_UNAVAILABLE" });
  });

  it("parses bounded active and played queue songs while stripping response authority", async () => {
    const queued = { id: 1, userId: 11, youtubeId: "abcdefghijk", title: "Queued", artist: "Artist", thumbnailUrl: "https://img", position: 0, status: "queued", playedAt: null };
    const playing = { ...queued, id: 2, status: "playing" };
    const played = { ...queued, id: 3, status: "played", playedAt: "2026-08-25T10:00:00.000Z" };
    const request = vi.fn(async (input: { path: string }) => input.path === "/api/playlists"
      ? new Response("[]")
      : input.path === "/api/music/dashboard"
        ? new Response(JSON.stringify({ queueRevision: 2, songs: [queued], currentlyPlaying: playing, playedSongs: [played], publication: { mode: "unlisted", publicSlug: "public-slug" } }))
        : new Response(JSON.stringify({ state: "included", coreRead: true, coreMutation: true, paidMutation: false, maxAgeSeconds: 600 })));
    const result = await createMusicWorkspaceClient(request).load();
    expect(result.dashboard).toMatchObject({ songs: [{ status: "queued" }], currentlyPlaying: { status: "playing" }, playedSongs: [{ status: "played" }] });
    expect(JSON.stringify(result.dashboard)).not.toContain("userId");
  });

  it("fails closed without mutating when a legacy row has a noncanonical YouTube ID", async () => {
    const legacy = { id: 1, youtubeId: "legacy-id", title: "Legacy", artist: "Artist", thumbnailUrl: "https://img", position: 0, status: "queued", playedAt: null };
    const request = vi.fn(async (input: { path: string }) => input.path === "/api/playlists"
      ? new Response("[]")
      : input.path === "/api/music/dashboard"
        ? new Response(JSON.stringify({ queueRevision: 2, songs: [legacy], currentlyPlaying: null, playedSongs: [], publication: { mode: "private", publicSlug: "public-slug" } }))
        : new Response(JSON.stringify({ state: "included", coreRead: true, coreMutation: true, paidMutation: false, maxAgeSeconds: 600 })));
    await expect(createMusicWorkspaceClient(request).load()).rejects.toMatchObject({ status: 502, code: "SERVICE_UNAVAILABLE" });
    expect(request.mock.calls.every(([input]) => (input as { method: string }).method === "GET")).toBe(true);
  });

  it("changes to unlisted with one atomic owner-derived command and returns only the new in-memory capability", async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      version: "music-publication/v1", publication: { mode: "unlisted", publicSlug: "public-slug" }, capability: "A".repeat(43),
    }), { status: 200 }));
    const client = createMusicWorkspaceClient(request);
    await expect(client.setPublication("unlisted", "unlisted-mode-1")).resolves.toEqual({
      version: "music-publication/v1",
      publication: { mode: "unlisted", publicSlug: "public-slug" },
      capability: "A".repeat(43),
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      method: "POST", path: "/api/music/publication", body: { mode: "unlisted" }, idempotencyKey: "unlisted-mode-1",
    });
  });

  it.each([
    ["unlisted", { version: "music-publication/v1", publication: { mode: "unlisted", publicSlug: "public-slug" } }],
    ["unlisted", { version: "music-publication/v1", publication: { mode: "public", publicSlug: "public-slug" }, capability: "A".repeat(43) }],
    ["unlisted", { version: "music-publication/v1", publication: { mode: "unlisted", publicSlug: "public-slug" }, capability: "A".repeat(43), extra: true }],
    ["public", { version: "music-publication/v1", publication: { mode: "public", publicSlug: "public-slug" }, capability: "A".repeat(43) }],
    ["private", { version: "music-publication/v1", publication: { mode: "private", publicSlug: null } }],
    ["private", { version: "music-publication/v1", publication: { mode: "private", publicSlug: "short" } }],
  ] as const)("rejects a successful but non-canonical %s publication response %#", async (mode, body) => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    await expect(createMusicWorkspaceClient(request).setPublication(mode, "publication-contract-1"))
      .rejects.toThrow("Music sharing returned an invalid response.");
  });

  it("deletes an owner playlist through the canonical route", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await createMusicWorkspaceClient(request).deletePlaylist(11, "delete-playlist-1");
    expect(request).toHaveBeenCalledWith({ method: "DELETE", path: "/api/playlists/11", idempotencyKey: "delete-playlist-1" });
  });

  it("removes an owner saved song through the canonical playlist route", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await createMusicWorkspaceClient(request).removePlaylistSong(11, 12, "remove-playlist-song-1");
    expect(request).toHaveBeenCalledWith({ method: "DELETE", path: "/api/playlists/11/songs/12", idempotencyKey: "remove-playlist-song-1" });
  });

  it("adds a validated song to an owner saved playlist through the canonical route", async () => {
    const saved = { id: 9, playlistId: 11, youtubeId: "abcdefghijk", title: "Saved", artist: "Artist", thumbnailUrl: "https://img", position: 0, addedAt: "2026-08-25T10:00:00.000Z" };
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(saved), { status: 201 }));
    await expect(createMusicWorkspaceClient(request).addPlaylistSong(11, { youtubeId: "abcdefghijk", title: "Saved", artist: "Artist", thumbnailUrl: "https://img" }, "playlist-add-1")).resolves.toEqual(saved);
    expect(request).toHaveBeenCalledWith({ method: "POST", path: "/api/playlists/11/songs", body: { youtubeId: "abcdefghijk", title: "Saved", artist: "Artist", thumbnailUrl: "https://img" }, idempotencyKey: "playlist-add-1" });
  });

  it("updates the complete canonical guest-control state", async () => {
    const controls = { allowSongRequests: true, allowGuestPlayOnDevice: false, allowPlaylistSharing: true, allowRecentlyPlayedVisibility: false, allowQueueVisibility: false };
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(controls), { status: 200 }));
    await expect(createMusicWorkspaceClient(request).updateGuestControls(controls, "guest-controls-1")).resolves.toEqual(controls);
    expect(request).toHaveBeenCalledWith({ method: "PATCH", path: "/api/music/guest-controls", body: controls, idempotencyKey: "guest-controls-1" });
  });

  it("rejects malformed successful saved-playlist and guest-control DTOs", async () => {
    const request = vi.fn(async (input: { path: string }) => input.path === "/api/playlists/11/songs"
      ? new Response(JSON.stringify({ id: 9, playlistId: 11, youtubeId: "abcdefghijk", title: "Saved", artist: "Artist", thumbnailUrl: "https://img", position: 0, addedAt: "2026-08-25T10:00:00.000Z", status: "queued" }), { status: 201 })
      : new Response(JSON.stringify({ allowSongRequests: true, allowGuestPlayOnDevice: false, allowPlaylistSharing: true, allowRecentlyPlayedVisibility: false, allowQueueVisibility: false, extra: true }), { status: 200 }));
    const client = createMusicWorkspaceClient(request);

    await expect(client.addPlaylistSong(11, { youtubeId: "abcdefghijk", title: "Saved", artist: "Artist", thumbnailUrl: "https://img" }, "playlist-add-malformed"))
      .rejects.toMatchObject({ status: 502, code: "SERVICE_UNAVAILABLE" });
    await expect(client.updateGuestControls({ allowSongRequests: true, allowGuestPlayOnDevice: false, allowPlaylistSharing: true, allowRecentlyPlayedVisibility: false, allowQueueVisibility: false }, "guest-controls-malformed"))
      .rejects.toMatchObject({ status: 502, code: "SERVICE_UNAVAILABLE" });
  });

  it("contains unsuccessful JSON and empty responses", async () => {
    const failed = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    const client = createMusicWorkspaceClient(failed);
    await expect(client.createPlaylist("Road songs", null, "create-1")).rejects.toMatchObject({ status: 503, code: "SERVICE_UNAVAILABLE" });
    await expect(client.deletePlaylist(11, "delete-1")).rejects.toMatchObject({ status: 503, code: "SERVICE_UNAVAILABLE" });
  });

  it("preserves the canonical status, upstream code, retryability, and retry delay from failed workspace responses", async () => {
    const failed = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      version: "music-error/v1",
      error: { code: "IDENTITY_SUSPENDED", message: "sensitive", retryable: false, requestId: "request-1" },
    }), { status: 403, headers: { "content-type": "application/json", "retry-after": "19" } }));

    const error = await createMusicWorkspaceClient(failed).load().catch((cause) => cause);
    expect(error).toBeInstanceOf(MusicClientError);
    expect(error).toMatchObject({ status: 403, upstreamCode: "IDENTITY_SUSPENDED", retryable: false, retryAfterSeconds: undefined });
    expect(error.message).not.toContain("sensitive");
  });

  it.each([
    {
      status: 401,
      body: JSON.stringify({ error: { code: "AUTH_INVALID", retryable: true } }),
      retryAfter: "7",
      expected: { code: "AUTH_REQUIRED", upstreamCode: "AUTH_INVALID", retryable: false, retryAfterSeconds: undefined },
      message: "Music authorization is required.",
    },
    {
      status: 400,
      body: JSON.stringify({ error: { code: 42, retryable: "yes" } }),
      retryAfter: "0",
      expected: { code: "REQUEST_INVALID", upstreamCode: undefined, retryable: false, retryAfterSeconds: undefined },
      message: "Music is temporarily unavailable.",
    },
    {
      status: 409,
      body: "not-json",
      retryAfter: "invalid",
      expected: { code: "AUTH_UNAVAILABLE", upstreamCode: undefined, retryable: false, retryAfterSeconds: undefined },
      message: "Music is temporarily unavailable.",
    },
    {
      status: 500,
      body: JSON.stringify({}),
      retryAfter: undefined,
      expected: { code: "SERVICE_UNAVAILABLE", upstreamCode: undefined, retryable: false, retryAfterSeconds: undefined },
      message: "Music is temporarily unavailable.",
    },
  ])("contains a $status workspace failure without reflecting its body", async ({ status, body, retryAfter, expected, message }) => {
    const response = new Response(body, {
      status,
      headers: retryAfter === undefined ? undefined : { "retry-after": retryAfter },
    });
    const error = await createMusicWorkspaceClient(vi.fn().mockResolvedValue(response))
      .createPlaylist("Safe", null, "safe-command")
      .catch((cause) => cause);
    expect(error).toBeInstanceOf(MusicClientError);
    expect(error).toMatchObject({ status, ...expected });
    expect(error.message).toBe(message);
    expect(error.message).not.toContain(body);
  });

  it("contains an unsuccessful publication response before parsing any payload", async () => {
    const response = new Response(JSON.stringify({ error: { code: "PUBLICATION_CONFLICT", retryable: true } }), {
      status: 409,
      headers: { "retry-after": "3" },
    });
    await expect(createMusicWorkspaceClient(vi.fn().mockResolvedValue(response))
      .setPublication("public", "publication-failure"))
      .rejects.toMatchObject({
        code: "AUTH_UNAVAILABLE",
        status: 409,
        upstreamCode: "PUBLICATION_CONFLICT",
        retryable: false,
        retryAfterSeconds: undefined,
      });
  });

  it.each([
    ["7", 7],
    ["60", 60],
    ["3600", 3_600],
    ["3601", 3_600],
    ["999999999999999999999", 3_600],
    ["1.5", undefined],
    ["-1", undefined],
    ["nope", undefined],
  ] as const)("bounds canonical Retry-After %s without trusting the body", async (retryAfter, expected) => {
    const response = new Response(JSON.stringify({ error: { code: "UPSTREAM_UNAVAILABLE", retryable: false, retryAfterSeconds: 9 } }), {
      status: 503,
      headers: { "retry-after": retryAfter },
    });
    await expect(createMusicWorkspaceClient(vi.fn().mockResolvedValue(response)).load())
      .rejects.toMatchObject({ retryable: true, retryAfterSeconds: expected });
  });

  it.each([
    ["unknown", false],
    ["included", false],
    ["eligible", false],
    ["entitled", true],
    ["revoked", false],
  ] as const)("accepts the exact %s entitlement DTO", async (state, paidMutation) => {
    // Break caught: a supported server state is renamed or discarded before the page can apply the approved policy.
    const request = vi.fn(async (input: { path: string }) => input.path === "/api/playlists"
      ? new Response("[]", { status: 200 })
      : input.path === "/api/music/dashboard"
        ? new Response(JSON.stringify({ queueRevision: 0, songs: [], playedSongs: [], currentlyPlaying: null, publication: { mode: "private", publicSlug: "public-slug" } }), { status: 200 })
        : new Response(JSON.stringify({ state, coreRead: true, coreMutation: true, paidMutation, maxAgeSeconds: 600, ...(paidMutation ? { sourceUpdatedAt: "2026-08-20T17:00:00.000Z" } : {}) }), { status: 200 }));
    await expect(createMusicWorkspaceClient(request).load()).resolves.toMatchObject({
      entitlement: { state, coreRead: true, coreMutation: true, paidMutation, maxAgeSeconds: 600 },
    });
  });

  it.each([
    [{ state: "paused", coreRead: true, coreMutation: true, paidMutation: false, maxAgeSeconds: 600 }, "unsupported state"],
    [{ state: "included", coreRead: true, coreMutation: true, paidMutation: true, maxAgeSeconds: 600 }, "impossible premium grant"],
    [{ state: "revoked", coreRead: true, coreMutation: false, paidMutation: false, maxAgeSeconds: 600 }, "core denial"],
  ])("rejects an %s entitlement DTO (%s)", async (entitlement) => {
    // Break caught: unvalidated successful JSON drives unreachable or contradictory whole-page UX.
    const request = vi.fn(async (input: { path: string }) => input.path === "/api/playlists"
      ? new Response("[]", { status: 200 })
      : input.path === "/api/music/dashboard"
        ? new Response(JSON.stringify({ queueRevision: 0, songs: [], playedSongs: [], currentlyPlaying: null, publication: { mode: "private", publicSlug: "public-slug" } }), { status: 200 })
        : new Response(JSON.stringify(entitlement), { status: 200 }));
    await expect(createMusicWorkspaceClient(request).load()).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      status: 502,
    });
  });
});
