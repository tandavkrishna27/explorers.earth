import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMusicPublicationIdempotencyKey } from "../../shared/musicPublicationContract";
import { setupCanonicalMusicRoutes } from "../routes/musicSurfaceRoutes";
import { createMusicPublicObservability } from "../observability/musicPublicObservability";
import { createYouTubeReadService } from "../services/youtubeReadService";
import { createLoopbackSupertestScope } from "./helpers/loopback-supertest";

const routeNow = Date.parse("2026-08-14T10:00:00.000Z");
const publicationKey = createMusicPublicationIdempotencyKey(routeNow, "11111111-2222-4333-8444-555555555555");

const loopback = createLoopbackSupertestScope();
afterEach(async () => loopback.closeAll());

function appFor(overrides: Record<string, unknown> = {}, routeOverrides: Record<string, unknown> = {}) {
  const calls: unknown[][] = [];
  const publicationOperations = new Map<string, { mode: "private" | "unlisted" | "public"; response: unknown }>();
  const playlistCreateOperations = new Map<string, { input: unknown; response: unknown }>();
  const playlistSongOperations = new Map<string, { input: unknown; response: unknown }>();
  const repository = {
    listPlaylists: vi.fn(async (owner: number) => { calls.push(["list", owner]); return []; }),
    getPlaylist: vi.fn(async (owner: number, id: number) => { calls.push(["get", owner, id]); return id === 9 ? { id: 9, user_id: owner, name: "mine" } : undefined; }),
    createPlaylist: vi.fn(async (owner: number, input: unknown) => { calls.push(["create", owner, input]); return { id: 10, user_id: owner, ...(input as object) }; }),
    createPlaylistIdempotent: vi.fn(async (owner: number, key: string, input: unknown) => {
      calls.push(["create-idempotent", owner, key, input]);
      const cacheKey = `${owner}:${key}`;
      const existing = playlistCreateOperations.get(cacheKey);
      if (existing && JSON.stringify(existing.input) !== JSON.stringify(input)) return { status: "conflict" as const };
      if (existing) return { status: "completed" as const, replayed: true, response: existing.response };
      const response = { id: 10, user_id: owner, ...(input as object) };
      playlistCreateOperations.set(cacheKey, { input, response });
      return { status: "completed" as const, replayed: false, response };
    }),
    updatePlaylist: vi.fn(async (owner: number, id: number, input: unknown) => { calls.push(["update", owner, id, input]); return id === 9 ? { id, user_id: owner, ...(input as object) } : undefined; }),
    deletePlaylist: vi.fn(async (owner: number, id: number) => { calls.push(["delete", owner, id]); return id === 9; }),
    addPlaylistSongIdempotent: vi.fn(async (owner: number, key: string, playlist: number, input: unknown) => {
      calls.push(["playlist-song-add", owner, key, playlist, input]);
      const cacheKey = `${owner}:${key}`;
      const existing = playlistSongOperations.get(cacheKey);
      if (existing && JSON.stringify(existing.input) !== JSON.stringify({ playlist, input })) return { status: "conflict" as const };
      if (existing) return { status: "completed" as const, replayed: true, response: existing.response };
      if (playlist !== 9) return { status: "not_found" as const };
      const response = { id: 12, playlist_id: playlist, ...(input as object), position: 0, added_at: "2026-08-27T10:00:00.000Z" };
      playlistSongOperations.set(cacheKey, { input: { playlist, input }, response });
      return { status: "completed" as const, replayed: false, response };
    }),
    removePlaylistSong: vi.fn(async (owner: number, playlist: number, song: number) => { calls.push(["playlist-song-remove", owner, playlist, song]); return playlist === 9; }),
    reorderPlaylistSong: vi.fn(async (owner: number, playlist: number, song: number, position: number) => { calls.push(["playlist-song-reorder", owner, playlist, song, position]); return playlist === 9; }),
    setPlaylistVisibility: vi.fn(async (owner: number, playlist: number, visible: boolean) => { calls.push(["playlist-visibility", owner, playlist, visible]); return playlist === 9; }),
    listQueue: vi.fn(async (owner: number) => { calls.push(["queue", owner]); return []; }),
    replaceQueue: vi.fn(async (owner: number, key: string, revision: number, songs: unknown[]) => {
      calls.push(["replace-queue", owner, key, revision, songs]);
      if (key === "conflict-key") return { status: "conflict" as const };
      if (revision !== 4) return { status: "stale" as const, revision: 4 };
      return { status: "completed" as const, replayed: key === "replay-key", response: { version: "music-queue/v1", revision: 5, songs: [
        { id: 1, user_id: owner, youtube_id: "abcdefghijk", title: "Song", artist: "Artist", thumbnail_url: "https://img", position: 0, status: "queued", played_at: null },
      ] } };
    }),
    appendQueue: vi.fn(async (owner: number, key: string, revision: number, songs: unknown[]) => {
      calls.push(["append-queue", owner, key, revision, songs]);
      if (key === "conflict-key") return { status: "conflict" as const };
      if (revision !== 4) return { status: "stale" as const, revision: 4 };
      return { status: "completed" as const, replayed: key === "replay-key", response: { version: "music-queue/v1", revision: 5, songs: [
        { id: 1, user_id: owner, youtube_id: "abcdefghijk", title: "Song", artist: "Artist", thumbnail_url: "https://img", position: 0, status: "queued", played_at: null },
      ] } };
    }),
    ownerDashboard: vi.fn(async (owner: number) => { calls.push(["dashboard", owner]); return { queueRevision: 4, songs: [], playedSongs: [], publication: { mode: "private", publicSlug: "private-slug" } }; }),
    updateGuestControls: vi.fn(async (owner: number, controls: unknown) => { calls.push(["guest-controls", owner, controls]); return controls; }),
    getGuestControls: vi.fn(async (owner: number) => { calls.push(["get-guest-controls", owner]); return { allowSongRequests: true, allowGuestPlayOnDevice: false, allowPlaylistSharing: true, allowRecentlyPlayedVisibility: false }; }),
    addSong: vi.fn(async (owner: number, input: unknown) => { calls.push(["add-song", owner, input]); return { id: 1 }; }),
    setPlaying: vi.fn(async (owner: number, id: number | null) => { calls.push(["playing", owner, id]); return id === null ? null : { id }; }),
    updateSongPosition: vi.fn(async (owner: number, id: number, position: number) => { calls.push(["position", owner, id, position]); return { id, position }; }),
    removeSong: vi.fn(async (owner: number, id: number) => { calls.push(["remove-song", owner, id]); return true; }),
    removeHistorySong: vi.fn(async (owner: number, key: string, id: number) => {
      calls.push(["remove-history-song", owner, key, id]);
      return key === "history-conflict" ? { status: "conflict" as const } : { status: "completed" as const, replayed: key === "history-replay" };
    }),
    removeSongs: vi.fn(async (owner: number, ids: number[]) => { calls.push(["remove-songs", owner, ids]); return ids.length; }),
    clearHistory: vi.fn(async (owner: number) => { calls.push(["history", owner]); return 0; }),
    rotateGuestCapability: vi.fn(async () => ({})),
    revokeGuestCapability: vi.fn(async () => undefined),
    setDiscoverable: vi.fn(async () => undefined),
    setPublicationMode: vi.fn(async (_owner: number, mode: "private" | "unlisted" | "public") => ({ mode, publicSlug: "private-slug" })),
    executePublicationCommand: vi.fn(async (owner: number, key: string, mode: "private" | "unlisted" | "public") => {
      const cacheKey = `${owner}:${key}`;
      const existing = publicationOperations.get(cacheKey);
      if (existing && existing.mode !== mode) return { status: "conflict" as const };
      if (existing) return { status: "completed" as const, replayed: true, response: existing.response };
      const response = {
        version: "music-publication/v1" as const,
        publication: { mode, publicSlug: "private-slug" },
        ...(mode === "unlisted" ? { capability: "C".repeat(43) } : {}),
      };
      publicationOperations.set(cacheKey, { mode, response });
      return { status: "completed" as const, replayed: false, response };
    }),
    resolveEntitlement: vi.fn(async () => ({ state: "entitled", sourceUpdatedAt: new Date("2026-08-14T09:55:00.000Z") })),
    resolvePublicDescriptor: vi.fn(async (accountDocumentId: string) => accountDocumentId === "account-public"
      ? { mode: "public" as const, publicSlug: "stable-public-slug", revision: 7 }
      : undefined),
    resolvePublicMusicResource: vi.fn(async () => undefined),
    resolveGuestResource: vi.fn(async () => undefined),
    resolveGuestSocketAuthority: vi.fn(async (capability: string) => capability === "G".repeat(43)
      ? { musicUserId: 77, active: true, allowSongRequests: true } : undefined),
    resolveGuestRequestAuthority: vi.fn(async (slug: string, capability: string) => slug === "owner-a" && capability === "G".repeat(43)
      ? { musicUserId: 77, active: true, allowSongRequests: true } : undefined),
    addGuestSongIdempotent: vi.fn(async (slug: string, capability?: string) =>
      (slug === "owner-a" && capability === "G".repeat(43)) || (slug === "public-owner" && capability === undefined)
        ? { status: "completed" as const, replayed: false, response: { accepted: true as const } }
        : { status: "forbidden" as const }),
    ...overrides,
  };
  const app = express();
  app.use(express.json({ limit: "8kb" }));
  setupCanonicalMusicRoutes(app, {
    repository: repository as never,
    resolvePrincipal: async (token) => {
      if (token !== "aaa.bbb.ccc") throw new Error("invalid");
      return { musicUserId: 11, subject: "subject", accountDocumentId: "account", sessionVersion: 3 };
    },
    now: () => new Date(routeNow),
    requestIdFactory: () => "route-request-id",
    allowedOrigins: ["https://explorers.example"],
    youtube: {
      search: vi.fn(async () => ({ items: [{ id: { videoId: "abcdefghijk" }, snippet: { title: "safe" } }], nextPageToken: null })),
      videoFromUrl: vi.fn(async () => ({ id: { videoId: "abcdefghijk" }, snippet: { title: "safe" } })),
    },
    mintSocketTicket: () => ({ token: "default.socket.ticket", expiresAt: 1760000060 }),
    ...routeOverrides,
  });
  return { app, repository, calls };
}

describe("canonical Music REST surfaces", () => {
  it("completes public HTTP responses when operational telemetry throws", async () => {
    const { app } = appFor({}, { observability: createMusicPublicObservability({ sink: () => { throw new Error("monitor down"); } }) });
    const { request } = await loopback.open({ app });
    await request.get("/api/music/public-profile/account-public").expect(200);
  });

  it("records a safe descriptor outcome without authority dimensions", async () => {
    const finish = vi.fn();
    const observability = { startHttp: vi.fn(() => finish) };
    const { app } = appFor({}, { observability });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/music/public-profile/account-public")
      .set("X-Request-Id", "descriptor-support-1");

    expect(response.status).toBe(200);
    expect(observability.startHttp).toHaveBeenCalledWith("descriptor", "descriptor-support-1");
    expect(finish).toHaveBeenCalledWith("success", 200);
    expect(JSON.stringify(observability.startHttp.mock.calls)).not.toMatch(/account-public|stable-public-slug/);
  });

  it("returns one strict public descriptor from stable Account identity without owner authentication", async () => {
    // Break caught: friendly profile discovery needs owner credentials or leaks an internal identity field.
    const { app, repository } = appFor();
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/music/public-profile/account-public")
      .set("X-Request-Id", "descriptor-request");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("descriptor-request");
    expect(response.body).toEqual({
      version: "music-public-descriptor/v1",
      publication: { mode: "public", publicSlug: "stable-public-slug", revision: 7 },
    });
    expect(repository.resolvePublicDescriptor).toHaveBeenCalledWith("account-public");
    expect(JSON.stringify(response.body)).not.toMatch(/userId|ownerId|accountDocumentId/i);
  });

  it.each([
    ["private", "account-private"],
    ["unlisted", "account-unlisted"],
    ["suspended", "account-suspended"],
    ["pending deletion", "account-pending"],
    ["tombstoned", "account-tombstoned"],
    ["unknown", "account-unknown"],
    ["collision", "account-collision"],
  ])("returns the same public-safe 404 for %s descriptor state", async (_state, accountDocumentId) => {
    // Break caught: status or body differences turn the descriptor into an account-state oracle.
    const { app } = appFor();
    const { request } = await loopback.open({ app });
    const response = await request.get(`/api/music/public-profile/${accountDocumentId}`);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      version: "music-error/v1",
      error: {
        code: "PUBLIC_NOT_FOUND",
        message: "The Music resource was not found.",
        action: "none",
        retryable: false,
        requestId: "route-request-id",
      },
    });
  });

  it("returns the same 404 for malformed IDs and safely parameterizes an injection-shaped ID", async () => {
    // Break caught: malformed and SQL-shaped discovery values escape validation or become an enumeration signal.
    const lookup = vi.fn(async () => undefined);
    const { app } = appFor({ resolvePublicDescriptor: lookup });
    const { request } = await loopback.open({ app });
    const malformed = await request.get(`/api/music/public-profile/${encodeURIComponent("   ")}`);
    const oversized = await request.get(`/api/music/public-profile/${"a".repeat(513)}`);
    const injection = "account' OR '1'='1";
    const shaped = await request.get(`/api/music/public-profile/${encodeURIComponent(injection)}`);

    for (const response of [malformed, oversized, shaped]) {
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("PUBLIC_NOT_FOUND");
    }
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith(injection);
  });

  it("maps an Express path-decode failure on descriptor discovery to the same contained 404", async () => {
    // Break caught: Express decodes path parameters before identify, exposing malformed UTF-8 as a distinct 400/500 oracle.
    const lookup = vi.fn(async () => undefined);
    const publicRateLimited = vi.fn(() => false);
    const { app } = appFor({ resolvePublicDescriptor: lookup }, { publicRateLimited });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/music/public-profile/%E0%A4%A")
      .set("X-Request-Id", "descriptor-decode-request");

    expect(response.status).toBe(404);
    expect(response.headers["x-request-id"]).toBe("descriptor-decode-request");
    expect(response.body).toEqual({
      version: "music-error/v1",
      error: {
        code: "PUBLIC_NOT_FOUND",
        message: "The Music resource was not found.",
        action: "none",
        retryable: false,
        requestId: "descriptor-decode-request",
      },
    });
    expect(publicRateLimited).toHaveBeenCalledWith({
      source: expect.stringMatching(/127\.0\.0\.1$/),
      resource: "malformed-account-document-id",
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rate limits malformed descriptor paths before returning their generic discovery error", async () => {
    // Break caught: invalid percent encodings bypass the normal per-source/public-surface containment boundary.
    const lookup = vi.fn(async () => undefined);
    const publicRateLimited = vi.fn(() => true);
    const { app } = appFor({ resolvePublicDescriptor: lookup }, { publicRateLimited });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/music/public-profile/%E0%A4%A")
      .set("X-Request-Id", "unsafe request id");

    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBe("60");
    expect(response.headers["x-request-id"]).toBe("route-request-id");
    expect(response.body.error).toMatchObject({ code: "RATE_LIMITED", retryable: true, requestId: "route-request-id" });
    expect(publicRateLimited).toHaveBeenCalledWith({
      source: expect.stringMatching(/127\.0\.0\.1$/),
      resource: "malformed-account-document-id",
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("does not reclassify path-decode failures on unrelated routes as public descriptor misses", async () => {
    // Break caught: a broad URIError catch hides malformed paths outside the one public discovery endpoint.
    const { app } = appFor();
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/playlists/%E0%A4%A");

    expect(response.status).toBe(500);
    expect(response.body.error).toMatchObject({ code: "INTERNAL_ERROR" });
    expect(response.body.error.code).not.toBe("PUBLIC_NOT_FOUND");
  });

  it("rejects every query, body, and identity-header authority channel before descriptor lookup", async () => {
    // Break caught: callers substitute username/email/user/owner selectors for the stable Account path identity.
    const lookup = vi.fn(async () => ({ mode: "public" as const, publicSlug: "stable-public-slug", revision: 1 }));
    const { app } = appFor({ resolvePublicDescriptor: lookup });
    const { request } = await loopback.open({ app });
    const attempts = [
      request.get("/api/music/public-profile/account-public?username=forged"),
      request.get("/api/music/public-profile/account-public?email=forged@example.invalid"),
      request.get("/api/music/public-profile/account-public?userId=44"),
      request.get("/api/music/public-profile/account-public?ownerId=44"),
      request.get("/api/music/public-profile/account-public?accountId=44"),
      request.get("/api/music/public-profile/account-public?mode=public"),
      request.get("/api/music/public-profile/account-public").set("X-Username", "forged"),
      request.get("/api/music/public-profile/account-public").set("X-Email", "forged@example.invalid"),
      request.get("/api/music/public-profile/account-public").set("X-User-Id", "44"),
      request.get("/api/music/public-profile/account-public").set("X-Owner-Id", "44"),
      request.get("/api/music/public-profile/account-public").set("X-Account-Id", "44"),
      request.get("/api/music/public-profile/account-public").set("X-Strapi-Account-Document-Id", "forged"),
      request.get("/api/music/public-profile/account-public").set("X-Music-Guest-Capability", "G".repeat(43)),
      request.get("/api/music/public-profile/account-public").set("Authorization", "Bearer aaa.bbb.ccc"),
      request.get("/api/music/public-profile/account-public").send({ ownerId: 44 }),
      request.get("/api/music/public-profile/account-public").send({ mode: "public" }),
      request.get("/api/music/public-profile/account-public").type("text").send("ownerId=44"),
    ];

    const responses = await Promise.all(attempts);
    expect(responses.map(({ status }) => status)).toEqual(Array(attempts.length).fill(400));
    expect(responses.every(({ body }) => body.error.code === "REQUEST_INVALID")).toBe(true);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rate limits descriptor discovery before lookup and replaces unsafe request IDs", async () => {
    // Break caught: descriptor enumeration bypasses local public limits or reflects unsafe correlation input.
    const lookup = vi.fn(async () => ({ mode: "public" as const, publicSlug: "stable-public-slug", revision: 1 }));
    const publicRateLimited = vi.fn(() => true);
    const { app } = appFor({ resolvePublicDescriptor: lookup }, { publicRateLimited });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/music/public-profile/account-public")
      .set("X-Request-Id", "unsafe request id");

    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBe("60");
    expect(response.headers["x-request-id"]).toBe("route-request-id");
    expect(response.body.error).toMatchObject({ code: "RATE_LIMITED", retryable: true, requestId: "route-request-id" });
    expect(publicRateLimited).toHaveBeenCalledWith({
      source: expect.stringMatching(/127\.0\.0\.1$/),
      resource: "account-public",
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("keeps a downstream URIError on a valid descriptor path internal and charges only the normal limiter", async () => {
    // Break caught: error type alone mistakes a repository URIError for Express path decoding and charges fallback containment twice.
    const sentinel = "valid-descriptor-downstream-uri-secret";
    const lookup = vi.fn(async () => { throw new URIError(sentinel); });
    const publicRateLimited = vi.fn(() => false);
    const { app } = appFor({ resolvePublicDescriptor: lookup }, { publicRateLimited });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/music/public-profile/account-valid")
      .set("X-Request-Id", "descriptor-uri-error-request");

    expect(response.status).toBe(500);
    expect(response.headers["x-request-id"]).toBe("descriptor-uri-error-request");
    expect(response.body).toEqual({
      version: "music-error/v1",
      error: {
        code: "INTERNAL_ERROR",
        message: "Music is temporarily unavailable.",
        action: "retry",
        retryable: true,
        requestId: "descriptor-uri-error-request",
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(sentinel);
    expect(publicRateLimited).toHaveBeenCalledTimes(1);
    expect(publicRateLimited).toHaveBeenCalledWith({
      source: expect.stringMatching(/127\.0\.0\.1$/),
      resource: "account-valid",
    });
    expect(lookup).toHaveBeenCalledWith("account-valid");
  });

  it("returns one generic request-bound error when descriptor storage fails", async () => {
    // Break caught: database details escape or a storage failure is misclassified as public identity state.
    const sentinel = "descriptor-postgres-secret-must-not-leak";
    const { app } = appFor({ resolvePublicDescriptor: vi.fn(async () => { throw new Error(sentinel); }) });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/music/public-profile/account-public")
      .set("X-Request-Id", "descriptor-error-request");

    expect(response.status).toBe(500);
    expect(response.headers["x-request-id"]).toBe("descriptor-error-request");
    expect(response.body).toEqual({
      version: "music-error/v1",
      error: {
        code: "INTERNAL_ERROR",
        message: "Music is temporarily unavailable.",
        action: "retry",
        retryable: true,
        requestId: "descriptor-error-request",
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(sentinel);
  });

  it("accepts an explicit queue visibility control for the authenticated owner", async () => {
    const { app, calls } = appFor();
    const { request } = await loopback.open({ app });
    const controls = { allowSongRequests: true, allowGuestPlayOnDevice: false, allowPlaylistSharing: true, allowRecentlyPlayedVisibility: false, allowQueueVisibility: true };
    const response = await request.patch("/api/music/guest-controls")
      .set("Authorization", "Bearer aaa.bbb.ccc").set("Origin", "https://explorers.example").send(controls);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(controls);
    expect(calls).toContainEqual(["guest-controls", 11, controls]);
    const invalid = await request.patch("/api/music/guest-controls")
      .set("Authorization", "Bearer aaa.bbb.ccc").set("Origin", "https://explorers.example").send({ ...controls, ownerId: 99 });
    expect(invalid.status).toBe(400);
    expect(calls).not.toContainEqual(["guest-controls", 99, expect.anything()]);
  });

  it("keeps persisted queue visibility when an old four-field guest-control client updates the other controls", async () => {
    const legacyControls = { allowSongRequests: true, allowGuestPlayOnDevice: false, allowPlaylistSharing: true, allowRecentlyPlayedVisibility: false };
    const { app, repository } = appFor({
      updateGuestControls: vi.fn(async (_owner: number, controls: typeof legacyControls) => ({ ...controls, allowQueueVisibility: true })),
    });
    const { request } = await loopback.open({ app });
    const response = await request.patch("/api/music/guest-controls")
      .set("Authorization", "Bearer aaa.bbb.ccc").set("Origin", "https://explorers.example").send(legacyControls);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ...legacyControls, allowQueueVisibility: true });
    expect(repository.updateGuestControls).toHaveBeenCalledWith(11, legacyControls);
  });
  it("reads the private owner dashboard only through the C5 principal", async () => {
    const { app, calls } = appFor();
    const { request } = await loopback.open({ app });
    expect((await request.get("/api/music/dashboard")).status).toBe(401);
    const response = await request.get("/api/music/dashboard").set("Authorization", "Bearer aaa.bbb.ccc");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ queueRevision: 4, playbackRevision: 0, songs: [], currentlyPlaying: null, playedSongs: [], publication: { mode: "private", publicSlug: "private-slug" } });
    expect(calls).toContainEqual(["dashboard", 11]);
  });

  it("accepts only the C5 credential and derives playlist owner from req.musicPrincipal", async () => {
    // Break caught: native sessions or browser owner targets substitute for the local Music principal.
    const { app, calls } = appFor();
    const { request } = await loopback.open({ app });
    const unauthenticated = await request.get("/api/playlists").set("Cookie", "cosmic.sid=native");
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers["x-request-id"]).toBe("route-request-id");

    const owner = await request.get("/api/playlists").set("Authorization", "Bearer aaa.bbb.ccc");
    expect(owner.status).toBe(200);
    expect(calls).toContainEqual(["list", 11]);

    const targeted = await request.get("/api/playlists?userId=22").set("Authorization", "Bearer aaa.bbb.ccc");
    expect(targeted.status).toBe(400);
    expect(calls).not.toContainEqual(["list", 22]);
  });

  it("returns one typed request-bound failure for an other-user resource", async () => {
    // Break caught: absent owner predicate leaks resource existence or returns an ad-hoc error body.
    const { app } = appFor();
    const { request } = await loopback.open({ app });
    const response = await request.patch("/api/playlists/99")
      .set("Authorization", "Bearer aaa.bbb.ccc")
      .set("Origin", "https://explorers.example")
      .send({ name: "attempt", description: null });
    expect(response.status).toBe(404);
    expect(response.headers["x-request-id"]).toBe("route-request-id");
    expect(response.body).toEqual({
      version: "music-error/v1",
      error: {
        code: "PUBLIC_NOT_FOUND",
        message: "The Music resource was not found.",
        action: "none",
        retryable: false,
        requestId: "route-request-id",
      },
    });
  });

  it("derives every queue mutation owner from the C5 principal", async () => {
    // Break caught: queue body/query song IDs select a different Music owner.
    const { app, calls } = appFor();
    const { request } = await loopback.open({ app });
    const headers = { Authorization: "Bearer aaa.bbb.ccc", Origin: "https://explorers.example" };
    expect((await request.get("/api/playlist/songs").set("Authorization", headers.Authorization)).status).toBe(200);
    expect((await request.post("/api/playlist/songs").set(headers).send({ youtubeId: "abcdefghijk", title: "t", artist: "a", thumbnailUrl: "https://img" })).status).toBe(201);
    expect((await request.patch("/api/playlist/songs/7/position").set(headers).send({ position: 2 })).status).toBe(200);
    expect((await request.delete("/api/playlist/songs/7").set(headers)).status).toBe(204);
    expect((await request.delete("/api/playlist/songs/bulk").set(headers).send({ songIds: [7, 8] })).status).toBe(204);
    expect((await request.delete("/api/playlist/history").set(headers)).status).toBe(204);
    expect(calls.filter((entry) => ["queue", "add-song", "position", "remove-song", "remove-songs", "history"].includes(String(entry[0])))
      .every((entry) => entry[1] === 11)).toBe(true);
  });

  it.each(["abcdefghij", "abcdefghijkl", "A".repeat(65)])("rejects noncanonical YouTube ID %s before mutation", async (youtubeId) => {
    const { app, calls } = appFor();
    const { request } = await loopback.open({ app });
    const response = await request.post("/api/playlist/songs")
      .set({ Authorization: "Bearer aaa.bbb.ccc", Origin: "https://explorers.example" })
      .send({ youtubeId, title: "t", artist: "a", thumbnailUrl: "https://img" });
    expect(response.status).toBe(400);
    expect(calls.some((entry) => entry[0] === "add-song")).toBe(false);
  });

  it("accepts an exact canonical YouTube ID and returns a readable song", async () => {
    const { app, calls } = appFor({
      addSong: vi.fn(async (owner: number, input: any) => ({ id: 1, user_id: owner, ...input, position: 0, status: "queued", played_at: null })),
    });
    const { request } = await loopback.open({ app });
    const response = await request.post("/api/playlist/songs")
      .set({ Authorization: "Bearer aaa.bbb.ccc", Origin: "https://explorers.example" })
      .send({ youtubeId: "abcdefghijk", title: "t", artist: "a", thumbnailUrl: "https://img" });
    expect(response.status).toBe(201);
    expect(response.body.youtubeId).toBe("abcdefghijk");
    expect(calls.some((entry) => entry[0] === "add-song")).toBe(false);
  });

  it("accepts the shared 2048-character thumbnail bound and rejects the next byte", async () => {
    const headers = { Authorization: "Bearer aaa.bbb.ccc", Origin: "https://explorers.example" };
    const accepted = appFor();
    const { request: acceptedRequest } = await loopback.open({ app: accepted.app });
    expect((await acceptedRequest.post("/api/playlist/songs").set(headers)
      .send({ youtubeId: "abcdefghijk", title: "t", artist: "a", thumbnailUrl: "x".repeat(2_048) })).status).toBe(201);
    const rejected = appFor();
    const { request: rejectedRequest } = await loopback.open({ app: rejected.app });
    expect((await rejectedRequest.post("/api/playlist/songs").set(headers)
      .send({ youtubeId: "abcdefghijk", title: "t", artist: "a", thumbnailUrl: "x".repeat(2_049) })).status).toBe(400);
  });

  it("accepts one atomic bulk removal for the full 500-song queue", async () => {
    const headers = { Authorization: "Bearer aaa.bbb.ccc", Origin: "https://explorers.example" };
    const songIds = Array.from({ length: 500 }, (_, index) => index + 1);
    const accepted = appFor();
    const { request: acceptedRequest } = await loopback.open({ app: accepted.app });
    expect((await acceptedRequest.delete("/api/playlist/songs/bulk").set(headers).send({ songIds })).status).toBe(204);
    const rejected = appFor();
    const { request: rejectedRequest } = await loopback.open({ app: rejected.app });
    expect((await rejectedRequest.delete("/api/playlist/songs/bulk").set(headers).send({ songIds: [...songIds, 501] })).status).toBe(400);
  });

  it("returns a contained client error when the active queue is full", async () => {
    const { app } = appFor({ addSong: vi.fn(async () => undefined) });
    const { request } = await loopback.open({ app });
    const response = await request.post("/api/playlist/songs")
      .set({ Authorization: "Bearer aaa.bbb.ccc", Origin: "https://explorers.example" })
      .send({ youtubeId: "abcdefghijk", title: "t", artist: "a", thumbnailUrl: "https://img" });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: "REQUEST_INVALID", action: "none", retryable: false });
  });

  it("contains saved playlist and saved-song capacity failures", async () => {
    const headers = { Authorization: "Bearer aaa.bbb.ccc", Origin: "https://explorers.example" };
    const playlistLimit = appFor({ createPlaylistIdempotent: vi.fn(async () => ({ status: "limit" as const })) });
    const { request: playlistRequest } = await loopback.open({ app: playlistLimit.app });
    const playlistResponse = await playlistRequest
      .post("/api/playlists").set({ ...headers, "Idempotency-Key": "full-playlist-create" }).send({ name: "Full", description: null });
    expect(playlistResponse.status).toBe(400);
    expect(playlistResponse.body.error).toMatchObject({ code: "REQUEST_INVALID", action: "none", retryable: false });

    const songLimit = appFor({ addPlaylistSongIdempotent: vi.fn(async () => ({ status: "limit" as const })) });
    const { request: songRequest } = await loopback.open({ app: songLimit.app });
    const songResponse = await songRequest
      .post("/api/playlists/9/songs").set({ ...headers, "Idempotency-Key": "full-playlist-song" })
      .send({ youtubeId: "abcdefghijk", title: "t", artist: "a", thumbnailUrl: "https://img" });
    expect(songResponse.status).toBe(400);
    expect(songResponse.body.error).toMatchObject({ code: "REQUEST_INVALID", action: "none", retryable: false });
  });

  it("atomically replaces the principal queue and rejects stale, reused, targeted, unauthenticated, and cross-origin requests", async () => {
    // Break caught: replacement trusts owner input or loses typed concurrency/idempotency failures.
    const { app, calls } = appFor();
    const { request } = await loopback.open({ app });
    const body = { expectedRevision: 4, songs: [{ playlistId: 9, songId: 31 }] };
    const headers = { Authorization: "Bearer aaa.bbb.ccc", Origin: "https://explorers.example", "Idempotency-Key": "replace-key" };
    const success = await request.post("/api/music/queue/replace").set(headers).send(body);
    expect(success.status).toBe(200);
    expect(success.body).toEqual({ version: "music-queue/v1", revision: 5, songs: [{ id: 1, userId: 11, youtubeId: "abcdefghijk", title: "Song", artist: "Artist", thumbnailUrl: "https://img", position: 0, status: "queued", playedAt: null }] });
    expect(calls).toContainEqual(["replace-queue", 11, "replace-key", 4, [{ playlistId: 9, songId: 31 }]]);
    expect((await request.post("/api/music/queue/replace").set({ ...headers, "Idempotency-Key": "replay-key" }).send(body)).status).toBe(200);
    expect((await request.post("/api/music/queue/replace").set(headers).send({ ...body, expectedRevision: 3 })).body.error.code).toBe("QUEUE_REVISION_CONFLICT");
    expect((await request.post("/api/music/queue/replace").set({ ...headers, "Idempotency-Key": "conflict-key" }).send(body)).body.error.code).toBe("IDEMPOTENCY_CONFLICT");
    expect((await request.post("/api/music/queue/replace").set(headers).send({ ...body, ownerId: 99 })).status).toBe(400);
    expect((await request.post("/api/music/queue/replace").set(headers).send({ ...body, username: "other" })).status).toBe(400);
    expect((await request.post("/api/music/queue/replace").set("Origin", "https://explorers.example").set("Idempotency-Key", "x").send(body)).status).toBe(401);
    expect((await request.post("/api/music/queue/replace").set("Authorization", headers.Authorization).set("Origin", "https://evil.example").set("Idempotency-Key", "x").send(body)).status).toBe(403);
  });

  it("clears completed playback through the owner-predicated C5 mutation", async () => {
    // Break caught: the browser used an unauthenticated raw fetch and the server rejected null after the UI advanced.
    const { app, calls } = appFor();
    const { request } = await loopback.open({ app });
    const response = await request.post("/api/playlist/currently-playing")
      .set("Authorization", "Bearer aaa.bbb.ccc")
      .set("Origin", "https://explorers.example")
      .send({ songId: null });
    expect(response.status).toBe(204);
    expect(calls).toContainEqual(["playing", 11, null]);
  });

  it("appends validated saved songs through the owner-scoped revisioned command", async () => {
    // Break caught: playlist append bypasses the canonical owner/revision/idempotency boundary.
    const { app, calls } = appFor();
    const { request } = await loopback.open({ app });
    const headers = { Authorization: "Bearer aaa.bbb.ccc", Origin: "https://explorers.example", "Idempotency-Key": "append-key" };
    const body = { expectedRevision: 4, songs: [{ playlistId: 9, songId: 31 }] };
    const response = await request.post("/api/music/queue/append").set(headers).send(body);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ version: "music-queue/v1", revision: 5, songs: [{ id: 1, userId: 11 }] });
    expect(calls).toContainEqual(["append-queue", 11, "append-key", 4, [{ playlistId: 9, songId: 31 }]]);
    expect((await request.post("/api/music/queue/append").set(headers).send({ ...body, ownerId: 99 })).status).toBe(400);
    expect((await request.post("/api/music/queue/append").set({ ...headers, "Idempotency-Key": "conflict-key" }).send(body)).body.error.code).toBe("IDEMPOTENCY_CONFLICT");
    expect((await request.post("/api/music/queue/append").set(headers).send({ ...body, expectedRevision: 3 })).body.error.code).toBe("QUEUE_REVISION_CONFLICT");
    expect((await request.post("/api/music/queue/append").set(headers).send({ expectedRevision: 4, songs: [] })).status).toBe(400);
    expect(calls.filter((entry) => entry[0] === "append-queue")).toHaveLength(3);
  });

  it("mints a purpose-limited socket handshake ticket only for a proven owner behind an exact origin", async () => {
    // Break caught: the handshake ticket route is mounted without the origin guard, so any
    // site a signed-in owner visits can mint a live socket capability for that owner.
    const mintSocketTicket = vi.fn(() => ({ token: "ticket.aaa.bbb", expiresAt: 1760000060 }));
    const { app } = appFor({}, { mintSocketTicket });
    const { request } = await loopback.open({ app });
    const headers = { Authorization: "Bearer aaa.bbb.ccc", Origin: "https://explorers.example" };

    const minted = await request.post("/api/music/socket-ticket").set(headers).send({});
    expect(minted.status).toBe(200);
    expect(minted.body).toEqual({ version: "music-socket-ticket/v1", ticket: { token: "ticket.aaa.bbb", expiresAt: 1760000060 } });
    expect(mintSocketTicket).toHaveBeenCalledWith({ subject: "subject", sessionVersion: 3 });

    const foreign = await request.post("/api/music/socket-ticket")
      .set({ ...headers, Origin: "https://evil.example" }).send({});
    expect(foreign.status).toBe(403);
    expect(foreign.body.error.code).toBe("ORIGIN_FORBIDDEN");

    const originless = await request.post("/api/music/socket-ticket")
      .set({ Authorization: "Bearer aaa.bbb.ccc" }).send({});
    expect(originless.status).toBe(403);

    const unauthenticated = await request.post("/api/music/socket-ticket")
      .set({ Origin: "https://explorers.example" }).send({});
    expect(unauthenticated.status).toBe(401);

    expect(mintSocketTicket).toHaveBeenCalledTimes(1);
  });

  it("always mounts the socket handshake route, because the socket accepts nothing else", async () => {
    // Break caught, and this one shipped: the mint was an optional dependency and the
    // production composition in routes/index.ts never passed it, so the route did not
    // mount while the socket had already been switched to require a ticket. Every owner
    // would have failed to open a live connection. The dependency is required now, and a
    // default composition must answer this route rather than 404.
    const { app } = appFor();
    const { request } = await loopback.open({ app });
    const response = await request.post("/api/music/socket-ticket")
      .set({ Authorization: "Bearer aaa.bbb.ccc", Origin: "https://explorers.example" }).send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      version: "music-socket-ticket/v1",
      ticket: { token: "default.socket.ticket", expiresAt: 1760000060 },
    });
  });

  it("requires durable idempotency for saved-playlist song insertion", async () => {
    // Break caught: POST /api/playlists/:id/songs ignores its key and inserts twice after a lost response.
    const { app, calls } = appFor();
    const { request } = await loopback.open({ app });
    const headers = { Authorization: "Bearer aaa.bbb.ccc", Origin: "https://explorers.example", "Idempotency-Key": "saved-song-1" };
    const body = { youtubeId: "abcdefghijk", title: "Saved", artist: "Artist", thumbnailUrl: "https://img" };

    const first = await request.post("/api/playlists/9/songs").set(headers).send(body);
    const replay = await request.post("/api/playlists/9/songs").set(headers).send(body);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(calls.filter((entry) => entry[0] === "playlist-song-add")).toEqual([
      ["playlist-song-add", 11, "saved-song-1", 9, body],
      ["playlist-song-add", 11, "saved-song-1", 9, body],
    ]);
    expect((await request.post("/api/playlists/9/songs").set({ Authorization: headers.Authorization, Origin: headers.Origin }).send(body)).status).toBe(400);
    expect((await request.post("/api/playlists/9/songs").set(headers).send({ ...body, title: "Changed" })).body.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("removes one history row through a durable owner-scoped idempotency operation", async () => {
    // Break caught: history removal reuses generic queue deletion or accepts a caller-selected owner.
    const { app, calls } = appFor();
    const { request } = await loopback.open({ app });
    const headers = { Authorization: "Bearer aaa.bbb.ccc", Origin: "https://explorers.example", "Idempotency-Key": "history-remove" };
    expect((await request.delete("/api/playlist/history/7").set(headers)).status).toBe(204);
    expect((await request.delete("/api/playlist/history/7").set({ ...headers, "Idempotency-Key": "history-replay" })).status).toBe(204);
    const conflict = await request.delete("/api/playlist/history/8").set({ ...headers, "Idempotency-Key": "history-conflict" });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(calls).toContainEqual(["remove-history-song", 11, "history-remove", 7]);
    expect(calls).not.toContainEqual(["remove-song", 11, 7]);
  });

  it("requires and owner-scopes playlist create idempotency and replays a lost response", async () => {
    // Break caught: POST /api/playlists ignores Idempotency-Key and persists a second playlist on retry.
    const { app, calls } = appFor();
    const { request } = await loopback.open({ app });
    const headers = { Authorization: "Bearer aaa.bbb.ccc", Origin: "https://explorers.example", "Idempotency-Key": "playlist-create-1" };
    const body = { name: "One create", description: null };

    const first = await request.post("/api/playlists").set(headers).send(body);
    const replay = await request.post("/api/playlists").set(headers).send(body);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(calls.filter((entry) => entry[0] === "create-idempotent")).toEqual([
      ["create-idempotent", 11, "playlist-create-1", body],
      ["create-idempotent", 11, "playlist-create-1", body],
    ]);
    expect((await request.post("/api/playlists").set({ Authorization: headers.Authorization, Origin: headers.Origin }).send(body)).status).toBe(400);
    expect((await request.post("/api/playlists").set(headers).send({ ...body, name: "Different" })).body.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("uses the opt-in playback revision contract and contains a stale command", async () => {
    // Break caught: delayed browser commands have no server-verifiable ordering and can overwrite newer owner intent.
    let canonicalRevision = 2;
    let playbackRevision = 0;
    const setPlaying = vi.fn(async (owner: number, id: number | null, expectedRevision?: number, expectedPlaybackRevision?: number) => {
      if (expectedRevision !== canonicalRevision) return { status: "stale" as const, revision: canonicalRevision, playbackRevision, queueOnly: expectedPlaybackRevision === playbackRevision };
      canonicalRevision += 1;
      playbackRevision = canonicalRevision;
      return { status: "completed" as const, revision: canonicalRevision, playbackRevision, song: id === null ? null : {
        id, user_id: owner, youtube_id: "abcdefghijk", title: "Song", artist: "Artist",
        thumbnail_url: "https://img", position: 0, status: "playing", played_at: null,
      } };
    });
    const { app } = appFor({ setPlaying });
    const { request } = await loopback.open({ app });
    const headers = { Authorization: "Bearer aaa.bbb.ccc", Origin: "https://explorers.example" };

    const accepted = await request.post("/api/playlist/currently-playing").set(headers)
      .send({ songId: 21, expectedRevision: 2, expectedPlaybackRevision: 0 });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual({
      version: "music-playback/v1", revision: 3, playbackRevision: 3,
      song: { id: 21, userId: 11, youtubeId: "abcdefghijk", title: "Song", artist: "Artist", thumbnailUrl: "https://img", position: 0, status: "playing", playedAt: null },
    });
    expect(setPlaying).toHaveBeenCalledWith(11, 21, 2, 0);

    const stale = await request.post("/api/playlist/currently-playing").set(headers)
      .send({ songId: 20, expectedRevision: 2, expectedPlaybackRevision: 0 });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({ code: "PLAYBACK_REVISION_CONFLICT", retryable: false });

    const queueOnly = await request.post("/api/playlist/currently-playing").set(headers)
      .send({ songId: 20, expectedRevision: 2, expectedPlaybackRevision: 3 });
    expect(queueOnly.body.error).toMatchObject({ code: "PLAYBACK_QUEUE_REVISION_CONFLICT", retryable: false });
  });

  it("keeps only the typed read-only YouTube product operations behind C5", async () => {
    // Break caught: core search lands on a retirement while an unrestricted sibling proxy remains reachable.
    const { app } = appFor();
    const { request } = await loopback.open({ app });
    const headers = { Authorization: "Bearer aaa.bbb.ccc", Origin: "https://explorers.example" };
    const search = await request.post("/api/youtube/search").set(headers).send({ query: "music", pageToken: "next" });
    expect(search.status).toBe(200);
    expect(search.body.items[0].id.videoId).toBe("abcdefghijk");
    const video = await request.post("/api/youtube/video-from-url").set(headers).send({ url: "https://youtu.be/abcdefghijk" });
    expect(video.status).toBe(200);
    expect(video.body.id.videoId).toBe("abcdefghijk");
    expect((await request.post("/api/youtube/search").send({ query: "music" })).status).toBe(401);
  });

  it("derives saved-playlist song, reorder, and visibility ownership from C5", async () => {
    // Break caught: a browser playlist ID selects another owner's saved playlist.
    const { app, calls } = appFor();
    const { request } = await loopback.open({ app });
    const headers = { Authorization: "Bearer aaa.bbb.ccc", Origin: "https://explorers.example", "Idempotency-Key": "owner-saved-song" };
    expect((await request.post("/api/playlists/9/songs").set(headers).send({ youtubeId: "abcdefghijk", title: "t", artist: "a", thumbnailUrl: "https://img" })).status).toBe(201);
    expect((await request.delete("/api/playlists/9/songs/12").set(headers)).status).toBe(204);
    expect((await request.patch("/api/playlists/9/reorder").set(headers).send({ songId: 12, position: 2 })).status).toBe(204);
    expect((await request.patch("/api/playlists/9/visibility").set(headers).send({ isVisibleToGuests: true })).status).toBe(204);
    expect(calls.filter((entry) => String(entry[0]).startsWith("playlist-")).every((entry) => entry[1] === 11)).toBe(true);
  });

  it("denies paid mutation when the server entitlement timestamp is stale", async () => {
    // Break caught: a local read or caller assertion refreshes premium mutation authority.
    const { app } = appFor({
      resolveEntitlement: vi.fn(async () => ({ state: "entitled", sourceUpdatedAt: new Date("2026-08-14T09:49:59.999Z") })),
    });
    const { request } = await loopback.open({ app });
    const response = await request.post("/api/music/paid/import")
      .set("Authorization", "Bearer aaa.bbb.ccc")
      .set("Origin", "https://explorers.example")
      .send({ source: "youtube" });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ENTITLEMENT_REQUIRED");
  });

  it.each([
    ["unknown", false],
    ["included", false],
    ["eligible", false],
    ["entitled", true],
    ["revoked", false],
  ] as const)("exposes canonical %s entitlement without accepting a browser target", async (state, paidMutation) => {
    // Break caught: a retained database state is rewritten, gains premium authority, or changes universal core access in transit.
    const { app } = appFor({
      resolveEntitlement: vi.fn(async () => ({ state, sourceUpdatedAt: new Date("2026-08-14T09:55:00.000Z") })),
    });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/music/entitlement").set("Authorization", "Bearer aaa.bbb.ccc");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      state,
      sourceUpdatedAt: "2026-08-14T09:55:00.000Z",
      paidMutation,
      coreRead: true,
      coreMutation: true,
      maxAgeSeconds: 600,
    });
    expect((await request.get("/api/music/entitlement?username=other").set("Authorization", "Bearer aaa.bbb.ccc")).status).toBe(400);
  });

  it("fails closed when the repository returns an unsupported entitlement value", async () => {
    // Break caught: a corrupt/future state escapes a response that the exact client contract cannot interpret.
    const { app } = appFor({
      resolveEntitlement: vi.fn(async () => ({ state: "paused", sourceUpdatedAt: new Date("2026-08-14T09:55:00.000Z") })),
    });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/music/entitlement").set("Authorization", "Bearer aaa.bbb.ccc");
    expect(response.status).toBe(500);
    expect(response.body.error).toMatchObject({ code: "INTERNAL_ERROR", retryable: true });
    expect(JSON.stringify(response.body)).not.toContain("paused");
  });

  it("makes unknown, private, suspended, pending, and revoked guest resources indistinguishable", async () => {
    // Break caught: public errors reveal lifecycle or publication state.
    for (const value of [undefined, "private", "suspended", "pending_deletion", "revoked"] as const) {
      const { app } = appFor({ resolveGuestResource: vi.fn(async () => value && ({ state: value })) });
      const { request } = await loopback.open({ app });
      const response = await request.get("/api/playlist/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("PUBLIC_NOT_FOUND");
      expect(response.body.error.message).toBe("The Music resource was not found.");
    }
  });

  it("returns 200 and an exact empty playlist array for a valid public owner with no visible playlists", async () => {
    const { app } = appFor({
      resolveGuestResource: vi.fn(async () => ({
        state: "public",
        playlist: {
          songs: [], currentlyPlaying: null, playedSongs: [],
          user: {
            id: 11, username: "display", guestUrl: "public-empty", venueName: null, theme: null,
            allowSongRequests: false, allowGuestPlayOnDevice: false, allowPlaylistSharing: true, allowRecentlyPlayedVisibility: false, allowQueueVisibility: false,
          },
          allowGuestPlayOnDevice: false, allowRecentlyPlayedVisibility: false, allowQueueVisibility: false, playlists: [],
        },
      })),
    });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/playlist/public-empty");
    expect(response.status).toBe(200);
    expect(response.body.playlists).toEqual([]);
  });

  it("serves the additive exact public-resource v1 DTO while leaving the legacy response byte-shape unchanged", async () => {
    // Break caught: the backend rollout replaces /api/playlist/:guestUrl or lets canonical internal IDs leak into v1.
    const legacyPlaylist = {
      songs: [], currentlyPlaying: null, playedSongs: [],
      user: {
        id: 11, username: "display", guestUrl: "public-owner", venueName: null, theme: null,
        allowSongRequests: true, allowGuestPlayOnDevice: false, allowPlaylistSharing: true,
        allowRecentlyPlayedVisibility: false, allowQueueVisibility: false,
      },
      allowGuestPlayOnDevice: false, allowRecentlyPlayedVisibility: false, allowQueueVisibility: false,
      playlists: [],
    };
    const resource = {
      version: "music-public-resource/v1" as const,
      revision: 19,
      user: { username: "display", venueName: null },
      permissions: {
        allowSongRequests: true, allowGuestPlayOnDevice: false, allowPlaylistSharing: true,
        allowRecentlyPlayedVisibility: false, allowQueueVisibility: false,
      },
      currentlyPlaying: null,
      queue: { items: [], total: 0, truncated: false },
      recentlyPlayed: { items: [], total: 0, truncated: false },
      playlists: { items: [], total: 0, truncated: false },
    };
    const resolvePublicMusicResource = vi.fn(async (_slug: string, capability?: string) => ({
      state: capability ? "unlisted" : "public", noindex: !!capability, resource,
    }));
    const { app } = appFor({
      resolvePublicMusicResource,
      resolveGuestResource: vi.fn(async () => ({ state: "public", playlist: legacyPlaylist })),
    });
    const { request } = await loopback.open({ app });

    const canonical = await request.get("/api/music/public-resource/v1/public-owner")
      .set("X-Music-Guest-Capability", "C".repeat(43));
    expect(canonical.status).toBe(200);
    expect(canonical.headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(canonical.body).toEqual(resource);
    expect(resolvePublicMusicResource).toHaveBeenCalledWith("public-owner", "C".repeat(43));

    const legacy = await request.get("/api/playlist/public-owner");
    expect(legacy.status).toBe(200);
    expect(legacy.body).toEqual(legacyPlaylist);
    expect(legacy.body).not.toHaveProperty("version");
    expect(legacy.body).not.toHaveProperty("revision");
    expect(legacy.body).not.toHaveProperty("permissions");
  });

  it("contains malformed public-resource path decoding as the same rate-limited public 404", async () => {
    const lookup = vi.fn(async () => undefined);
    const publicRateLimited = vi.fn(() => false);
    const { app } = appFor({ resolvePublicMusicResource: lookup }, { publicRateLimited });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/music/public-resource/v1/%E0%A4%A")
      .set("X-Request-Id", "resource-decode-request");

    expect(response.status).toBe(404);
    expect(response.headers["x-request-id"]).toBe("resource-decode-request");
    expect(response.body.error).toMatchObject({ code: "PUBLIC_NOT_FOUND", requestId: "resource-decode-request" });
    expect(publicRateLimited).toHaveBeenCalledTimes(1);
    expect(publicRateLimited).toHaveBeenCalledWith({
      source: expect.stringMatching(/127\.0\.0\.1$/),
      resource: "malformed-public-slug",
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rate limits malformed public-resource paths and replaces unsafe request IDs", async () => {
    const lookup = vi.fn(async () => undefined);
    const publicRateLimited = vi.fn(() => true);
    const { app } = appFor({ resolvePublicMusicResource: lookup }, { publicRateLimited });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/music/public-resource/v1/%E0%A4%A")
      .set("X-Request-Id", "unsafe request id");

    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBe("60");
    expect(response.headers["x-request-id"]).toBe("route-request-id");
    expect(response.body.error).toMatchObject({ code: "RATE_LIMITED", requestId: "route-request-id" });
    expect(publicRateLimited).toHaveBeenCalledTimes(1);
    expect(publicRateLimited).toHaveBeenCalledWith({
      source: expect.stringMatching(/127\.0\.0\.1$/),
      resource: "malformed-public-slug",
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("keeps downstream URIError on a valid public-resource path internal without double limiting", async () => {
    const lookup = vi.fn(async () => { throw new URIError("resource-uri-secret"); });
    const publicRateLimited = vi.fn(() => false);
    const { app } = appFor({ resolvePublicMusicResource: lookup }, { publicRateLimited });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/music/public-resource/v1/public-owner")
      .set("X-Request-Id", "resource-uri-request");

    expect(response.status).toBe(500);
    expect(response.body.error).toMatchObject({ code: "INTERNAL_ERROR", requestId: "resource-uri-request" });
    expect(JSON.stringify(response.body)).not.toContain("resource-uri-secret");
    expect(publicRateLimited).toHaveBeenCalledTimes(1);
    expect(publicRateLimited).toHaveBeenCalledWith({
      source: expect.stringMatching(/127\.0\.0\.1$/),
      resource: "public-owner",
    });
    expect(lookup).toHaveBeenCalledWith("public-owner", undefined);
  });

  it("returns a typed 413 if a repository result exceeds the public resource byte contract", async () => {
    const resource = {
      version: "music-public-resource/v1" as const,
      revision: 1,
      user: { username: "x".repeat(512 * 1_024), venueName: null },
      permissions: { allowSongRequests: false, allowGuestPlayOnDevice: false, allowPlaylistSharing: false, allowRecentlyPlayedVisibility: false, allowQueueVisibility: false },
      currentlyPlaying: null,
      queue: { items: [], total: 0, truncated: false },
      recentlyPlayed: { items: [], total: 0, truncated: false },
      playlists: { items: [], total: 0, truncated: false },
    };
    const { app } = appFor({ resolvePublicMusicResource: vi.fn(async () => ({ state: "public", resource })) });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/music/public-resource/v1/public-owner");

    expect(response.status).toBe(413);
    expect(response.body.error).toMatchObject({ code: "PAYLOAD_TOO_LARGE", retryable: false });
  });

  it("keeps every unavailable canonical public resource enumeration-safe and rate-limited before lookup", async () => {
    for (const state of [undefined, "private", "revoked", "suspended", "pending_deletion"] as const) {
      const lookup = vi.fn(async () => state ? { state } : undefined);
      const unavailable = appFor({ resolvePublicMusicResource: lookup as any });
      const { request: unavailableRequest } = await loopback.open({ app: unavailable.app });
      const response = await unavailableRequest
        .get("/api/music/public-resource/v1/public-owner");
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("PUBLIC_NOT_FOUND");
    }
    const lookup = vi.fn(async () => ({ state: "public", resource: {} }));
    const limited = appFor({ resolvePublicMusicResource: lookup as any }, { publicRateLimited: () => true });
    const { request: limitedRequest } = await loopback.open({ app: limited.app });
    const response = await limitedRequest.get("/api/music/public-resource/v1/public-owner");
    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBe("60");
    expect(lookup).not.toHaveBeenCalled();

    const malformedCapabilityLookup = vi.fn(async () => ({ state: "public", resource: {} }));
    const malformedCapabilityApp = appFor({ resolvePublicMusicResource: malformedCapabilityLookup as any });
    const { request: malformedCapabilityRequest } = await loopback.open({ app: malformedCapabilityApp.app });
    const malformedCapability = await malformedCapabilityRequest
      .get("/api/music/public-resource/v1/public-owner")
      .set("X-Music-Guest-Capability", "not-a-capability");
    expect(malformedCapability.status).toBe(404);
    expect(malformedCapability.body.error.code).toBe("PUBLIC_NOT_FOUND");
    expect(malformedCapabilityLookup).not.toHaveBeenCalled();
  });

  it("changes publication with one owner-derived idempotent command and never persists capability material", async () => {
    // Break caught: separate rotate/publish writes can leave a partially public mode or rotate twice on a replay.
    const { app, repository } = appFor();
    const { request } = await loopback.open({ app });
    const headers = { Authorization: "Bearer aaa.bbb.ccc", Origin: "https://explorers.example" };
    const first = await request.post("/api/music/publication").set(headers)
      .set("Idempotency-Key", publicationKey).send({ mode: "unlisted" });
    const replay = await request.post("/api/music/publication").set(headers)
      .set("Idempotency-Key", publicationKey).send({ mode: "unlisted" });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ version: "music-publication/v1", publication: { mode: "unlisted", publicSlug: "private-slug" } });
    expect(first.body.capability).toBe("C".repeat(43));
    expect(replay.body).toEqual(first.body);
    expect(repository.executePublicationCommand).toHaveBeenCalledTimes(2);
    expect(repository.executePublicationCommand).toHaveBeenNthCalledWith(1, 11, publicationKey, "unlisted");
    expect(repository.executePublicationCommand).toHaveBeenNthCalledWith(2, 11, publicationKey, "unlisted");
    expect(repository.setPublicationMode).not.toHaveBeenCalled();
    expect(repository.rotateGuestCapability).not.toHaveBeenCalled();
    expect(repository.revokeGuestCapability).not.toHaveBeenCalled();
    expect(repository.setDiscoverable).not.toHaveBeenCalled();

    const conflict = await request.post("/api/music/publication").set(headers)
      .set("Idempotency-Key", publicationKey).send({ mode: "public" });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("keeps publication idempotency isolated by owner principal", async () => {
    const resolvePrincipal = vi.fn(async (token: string) => ({
      musicUserId: token === "ddd.eee.fff" ? 22 : 11,
      subject: token,
      accountDocumentId: token === "ddd.eee.fff" ? "account-b" : "account-a",
      sessionVersion: 3,
    }));
    const { app, repository } = appFor({}, { resolvePrincipal });
    const { request } = await loopback.open({ app });
    const write = (token: string) => request.post("/api/music/publication")
      .set({ Authorization: `Bearer ${token}`, Origin: "https://explorers.example", "Idempotency-Key": publicationKey })
      .send({ mode: "private" });
    expect((await write("aaa.bbb.ccc")).status).toBe(200);
    expect((await write("ddd.eee.fff")).status).toBe(200);
    expect(repository.executePublicationCommand.mock.calls.map((call: unknown[]) => call[0])).toEqual([11, 22]);
  });

  it("maps an expired durable replay to one typed no-mutation response", async () => {
    const executePublicationCommand = vi.fn(async () => ({ status: "expired" as const }));
    const { app, repository } = appFor({ executePublicationCommand });
    const { request } = await loopback.open({ app });
    const response = await request.post("/api/music/publication")
      .set({ Authorization: "Bearer aaa.bbb.ccc", Origin: "https://explorers.example", "Idempotency-Key": publicationKey })
      .send({ mode: "unlisted" });
    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({ code: "PUBLICATION_REPLAY_EXPIRED", retryable: false });
    expect(executePublicationCommand).toHaveBeenCalledWith(11, publicationKey, "unlisted");
    expect(repository.setPublicationMode).not.toHaveBeenCalled();
  });

  it("maps the per-owner publication operation quota to a retryable 429", async () => {
    const executePublicationCommand = vi.fn(async () => ({
      status: "rate_limited" as const,
      retryAfterSeconds: 37,
    }));
    const { app } = appFor({ executePublicationCommand });
    const { request } = await loopback.open({ app });
    const response = await request.post("/api/music/publication")
      .set({ Authorization: "Bearer aaa.bbb.ccc", Origin: "https://explorers.example", "Idempotency-Key": publicationKey })
      .send({ mode: "public" });
    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBe("37");
    expect(response.body.error).toMatchObject({ code: "RATE_LIMITED", retryable: true });
    expect(executePublicationCommand).toHaveBeenCalledWith(11, publicationKey, "public");
  });

  it("admits the one-day issuance-cutoff overlap only for repository replay authority", async () => {
    const overlapKey = createMusicPublicationIdempotencyKey(
      routeNow - 30 * 24 * 60 * 60 * 1_000 - 60 * 60 * 1_000,
      "11111111-2222-4333-8444-555555555556",
    );
    const accepted = appFor();
    const { request: acceptedRequest } = await loopback.open({ app: accepted.app });
    const response = await acceptedRequest.post("/api/music/publication")
      .set({ Authorization: "Bearer aaa.bbb.ccc", Origin: "https://explorers.example", "Idempotency-Key": overlapKey })
      .send({ mode: "private" });
    expect(response.status).toBe(200);
    expect(accepted.repository.executePublicationCommand).toHaveBeenCalledWith(11, overlapKey, "private");

    const beyondReplayKey = createMusicPublicationIdempotencyKey(
      routeNow - 31 * 24 * 60 * 60 * 1_000 - 1,
      "11111111-2222-4333-8444-555555555557",
    );
    const rejected = appFor();
    const { request: rejectedRequest } = await loopback.open({ app: rejected.app });
    expect((await rejectedRequest.post("/api/music/publication")
      .set({ Authorization: "Bearer aaa.bbb.ccc", Origin: "https://explorers.example", "Idempotency-Key": beyondReplayKey })
      .send({ mode: "private" })).status).toBe(400);
    expect(rejected.repository.executePublicationCommand).not.toHaveBeenCalled();
  });

  it("marks unlisted capability reads noindex and returns a distinct public-only 429", async () => {
    // Break caught: unlisted pages enter indexing or public throttling is disguised as resource existence.
    const unlisted = appFor({
      resolveGuestResource: vi.fn(async () => ({
        state: "unlisted",
        noindex: true,
        playlist: {
          songs: [], currentlyPlaying: undefined, playedSongs: [], playlists: [],
          user: { id: 11, username: "empty-owner", guestUrl: "empty-unlisted" },
        },
      })),
    });
    const { request: unlistedRequest } = await loopback.open({ app: unlisted.app });
    const found = await unlistedRequest.get(`/api/playlist/${"A".repeat(43)}`);
    expect(found.status).toBe(200);
    expect(found.headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(found.body).toMatchObject({ songs: [], playlists: [], user: { id: 11, username: "empty-owner", guestUrl: "empty-unlisted" } });

    const limitedLookup = vi.fn(async () => ({ state: "public", playlist: { id: 2 } }));
    const limited = appFor({ resolveGuestResource: limitedLookup }, { publicRateLimited: () => true });
    const { request: limitedRequest } = await loopback.open({ app: limited.app });
    const rejected = await limitedRequest.get("/api/playlist/discoverable-slug");
    expect(rejected.status).toBe(429);
    expect(rejected.body.error.code).toBe("RATE_LIMITED");
    expect(rejected.headers["retry-after"]).toBe("60");
    expect(limitedLookup).not.toHaveBeenCalled();
  });

  it("passes source, resource, and optional capability dimensions to public limiting", async () => {
    // Break caught: public limiting is keyed only by attacker-controlled slug cardinality.
    const inputs: unknown[] = [];
    const capability = "C".repeat(43);
    const { app } = appFor({
      resolveGuestResource: vi.fn(async () => ({ state: "public", playlist: { id: 2 } })),
    }, {
      publicRateLimited: (input: unknown) => { inputs.push(input); return false; },
    });
    const { request } = await loopback.open({ app });

    const response = await request.get("/api/playlist/discoverable-slug")
      .set("X-Music-Guest-Capability", capability);
    expect(response.status).toBe(200);
    expect(inputs).toEqual([{
      source: expect.stringMatching(/127\.0\.0\.1$/),
      resource: "discoverable-slug",
      capability,
    }]);
  });

  it("accepts unlisted capability only from the dedicated header, never the URL", async () => {
    // Break caught: the capability appears in access logs, telemetry, history, or indexing through a route parameter.
    const capability = "C".repeat(43);
    const lookup = vi.fn(async (_slug: string, suppliedCapability?: string) => suppliedCapability === capability
      ? { state: "unlisted", noindex: true, playlist: { id: 3 } }
      : undefined);
    const { app } = appFor({ resolveGuestResource: lookup as any });
    const { request } = await loopback.open({ app });
    const headerRead = await request.get("/api/playlist/public-slug")
      .set("X-Music-Guest-Capability", capability);
    expect(headerRead.status).toBe(200);
    expect(headerRead.headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(lookup).toHaveBeenLastCalledWith("public-slug", capability);

    const urlRead = await request.get(`/api/playlist/${capability}`);
    expect(urlRead.status).toBe(404);
    expect(lookup).toHaveBeenLastCalledWith(capability, undefined);
  });

  it("binds a guest request capability to its slug before deriving the queue owner", async () => {
    // Break caught: owner A's capability submitted from owner B's page silently mutates A's queue.
    const { app, calls } = appFor();
    const { request } = await loopback.open({ app });
    const crossOwner = await request.post("/api/playlist/owner-b/requests")
      .set("Origin", "https://explorers.example")
      .set("Idempotency-Key", "cross-owner-key")
      .set("X-Music-Guest-Capability", "G".repeat(43))
      .send({ youtubeId: "abcdefghijk", title: "t", artist: "a", thumbnailUrl: "https://img" });
    expect(crossOwner.status).toBe(403);
    expect(crossOwner.body.error.code).toBe("GUEST_CAPABILITY_INVALID");
    expect(calls).not.toContainEqual(expect.arrayContaining(["add-song"]));

    const response = await request.post("/api/playlist/owner-a/requests")
      .set("Origin", "https://explorers.example")
      .set("Idempotency-Key", "valid-owner-key")
      .set("X-Music-Guest-Capability", "G".repeat(43))
      .send({ youtubeId: "abcdefghijk", title: "t", artist: "a", thumbnailUrl: "https://img" });
    expect(response.status).toBe(201);
    expect(calls).not.toContainEqual(expect.arrayContaining(["add-song"]));

    const invalid = await request.post("/api/playlist/owner-a/requests")
      .set("Origin", "https://explorers.example")
      .set("Idempotency-Key", "invalid-cap-key")
      .set("X-Music-Guest-Capability", "public-slug")
      .send({ youtubeId: "abcdefghijk", title: "t", artist: "a", thumbnailUrl: "https://img" });
    expect(invalid.status).toBe(403);
    expect(invalid.body.error.code).toBe("GUEST_CAPABILITY_INVALID");
  });

  it("accepts a public publication request without weakening unlisted authority", async () => {
    const resolveGuestRequestAuthority = vi.fn(async (slug: string, capability?: string) =>
      slug === "public-owner" && capability === undefined
        ? { musicUserId: 88, active: true as const, allowSongRequests: true }
        : undefined);
    const { app, calls } = appFor({ resolveGuestRequestAuthority });
    const { request } = await loopback.open({ app });
    const response = await request.post("/api/playlist/public-owner/requests")
      .set("Origin", "https://explorers.example")
      .set("Idempotency-Key", "public-request-key")
      .send({ youtubeId: "abcdefghijk", title: "t", artist: "a", thumbnailUrl: "https://img" });
    expect(response.status).toBe(201);
    expect(resolveGuestRequestAuthority).not.toHaveBeenCalled();
    expect(calls).not.toContainEqual(expect.arrayContaining(["add-song"]));

    const unlisted = await request.post("/api/playlist/unlisted-owner/requests")
      .set("Origin", "https://explorers.example")
      .set("Idempotency-Key", "unlisted-request-key")
      .send({ youtubeId: "abcdefghijk", title: "t", artist: "a", thumbnailUrl: "https://img" });
    expect(unlisted.status).toBe(403);
  });

  it("requires durable guest idempotency and maps replay, conflict, capacity, and revoked permission", async () => {
    const addGuestSongIdempotent = vi.fn()
      .mockResolvedValueOnce({ status: "completed", replayed: false, response: { accepted: true, song: { id: 1, user_id: 88, youtube_id: "abcdefghijk", title: "t", artist: "a", thumbnail_url: "https://img", position: 0, status: "queued", played_at: null } } })
      .mockResolvedValueOnce({ status: "completed", replayed: true, response: { accepted: true, song: { id: 1, user_id: 88, youtube_id: "abcdefghijk", title: "t", artist: "a", thumbnail_url: "https://img", position: 0, status: "queued", played_at: null } } })
      .mockResolvedValueOnce({ status: "conflict" })
      .mockResolvedValueOnce({ status: "limit" })
      .mockResolvedValueOnce({ status: "forbidden" })
      .mockResolvedValueOnce({ status: "rate_limited" });
    const { app } = appFor({ addGuestSongIdempotent });
    const { request } = await loopback.open({ app });
    const body = { youtubeId: "abcdefghijk", title: "t", artist: "a", thumbnailUrl: "https://img" };
    const send = (key?: string) => request.post("/api/playlist/public-owner/requests")
      .set("Origin", "https://explorers.example")
      .set(key ? { "Idempotency-Key": key } : {})
      .send(body);
    expect((await send()).body.error.code).toBe("REQUEST_INVALID");
    expect((await send("guest-request-key-1")).status).toBe(201);
    expect((await send("guest-request-key-1")).headers["idempotency-replayed"]).toBe("true");
    expect((await send("guest-request-key-1")).body.error.code).toBe("IDEMPOTENCY_CONFLICT");
    expect((await send("guest-request-key-2")).body.error.code).toBe("REQUEST_INVALID");
    expect((await send("guest-request-key-3")).body.error.code).toBe("GUEST_CAPABILITY_INVALID");
    const limited = await send("guest-request-key-4");
    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBe("60");
  });

  it("binds guest search and URL lookup to the same per-slug capability without C5 authority", async () => {
    // Break caught: the public request UI called owner-only /api/youtube routes and minted a C5 credential.
    const { app, repository } = appFor();
    const { request } = await loopback.open({ app });
    const headers = { Origin: "https://explorers.example", "X-Music-Guest-Capability": "G".repeat(43) };
    const search = await request.post("/api/playlist/owner-a/youtube/search").set(headers).send({ query: "music" });
    expect(search.status).toBe(200);
    expect(search.body.items[0].id.videoId).toBe("abcdefghijk");
    const video = await request.post("/api/playlist/owner-a/youtube/video-from-url").set(headers)
      .send({ url: "https://youtu.be/abcdefghijk" });
    expect(video.status).toBe(200);
    expect(repository.resolveGuestRequestAuthority).toHaveBeenCalledTimes(2);
    expect(repository.resolveGuestRequestAuthority).toHaveBeenCalledWith("owner-a", "G".repeat(43));
    expect((await request.post("/api/playlist/owner-b/youtube/search").set(headers).send({ query: "music" })).status).toBe(403);
    expect((await request.post("/api/playlist/owner-a/youtube/search").set("Origin", "https://explorers.example").send({ query: "music" })).status).toBe(403);
    expect((await request.post("/api/playlist/owner-a/youtube/search").set("X-Music-Guest-Capability", "G".repeat(43)).send({ query: "music" })).status).toBe(403);
  });

  it.each([
    "https://youtube.com.evil.example/watch?v=abcdefghijk",
    "https://youtu.be.evil.example/abcdefghijk",
    "https://youtube.com@evil.example/watch?v=abcdefghijk",
    "not-a-url",
  ])("denies guest lookalike media input on the server without an upstream call: %s", async (url) => {
    const fetchImpl = vi.fn();
    const { app } = appFor({}, { youtube: createYouTubeReadService("fixture-only-key", fetchImpl) });
    const { request } = await loopback.open({ app });
    const response = await request.post("/api/playlist/owner-a/youtube/video-from-url")
      .set("Origin", "https://explorers.example").set("X-Music-Guest-Capability", "G".repeat(43)).send({ url });
    expect(response.status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns a safe internal error instead of misclassifying a repository failure as an invalid token", async () => {
    // Break caught: an unexpected repository error was converted into TOKEN_INVALID and its detail could escape.
    const sentinel = "postgres-secret-detail-must-not-leak";
    const { app } = appFor({ addSong: vi.fn(async () => { throw new Error(sentinel); }) });
    const { request } = await loopback.open({ app });
    const response = await request.post("/api/playlist/songs")
      .set("Authorization", "Bearer aaa.bbb.ccc")
      .set("Origin", "https://explorers.example")
      .set("X-Request-Id", "safe-route-request")
      .send({ youtubeId: "abcdefghijk", title: "t", artist: "a", thumbnailUrl: "https://img" });

    expect(response.status).toBe(500);
    expect(response.headers["x-request-id"]).toBe("safe-route-request");
    expect(response.body).toEqual({
      version: "music-error/v1",
      error: {
        code: "INTERNAL_ERROR",
        message: "Music is temporarily unavailable.",
        action: "retry",
        retryable: true,
        requestId: "safe-route-request",
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(sentinel);
  });
});
