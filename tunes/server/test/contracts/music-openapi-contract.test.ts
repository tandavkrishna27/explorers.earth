import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import express from "express";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMusicPublicationIdempotencyKey } from "../../../shared/musicPublicationContract";
import { inventoryRuntimeSurfaces } from "../../../scripts/inventory-runtime-surfaces";
import { MUSIC_OPENAPI_DOCUMENT } from "../../routes/musicOpenApiRoutes";
import { setupCanonicalMusicRoutes } from "../../routes/musicSurfaceRoutes";
import { createLoopbackSupertestScope } from "../helpers/loopback-supertest";

type Operation = {
  parameters?: Array<{ name?: string; in?: string; required?: boolean }>;
  requestBody?: unknown;
  responses?: Record<string, { headers?: Record<string, unknown> }>;
  security?: Array<Record<string, unknown>>;
};

const METHODS = ["get", "post", "patch", "delete", "put"] as const;
const root = resolve(import.meta.dirname, "../../../..");
const inventory = inventoryRuntimeSurfaces(root);
const loopback = createLoopbackSupertestScope();
afterEach(async () => loopback.closeAll());

function openApiPath(path: string): string {
  return path.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, "{$1}");
}

function liveCanonicalOperations(): string[] {
  return inventory.routes
    .filter((route) => [
      "strapi-identity-boundary", "local-music-owner", "paid-local-music-owner", "guest-capability",
    ].includes(route.classification) || route.path === "/api-docs"
      || route.path === "/api/music/public-profile/:accountDocumentId"
      || route.path === "/api/music/public-resource/v1/:publicSlug"
      || route.path === "/api/explorers/analytics/music/:publicSlug/events"
      || route.path === "/api/explorers/analytics/music-account/:accountDocumentId/events"
      || route.path === "/api/playlist/:guestUrl/youtube/search"
      || route.path === "/api/playlist/:guestUrl/youtube/video-from-url")
    .map((route) => `${route.method.toLowerCase()} ${openApiPath(route.path)}`)
    .sort();
}

function documentedOperations(): string[] {
  return Object.entries(MUSIC_OPENAPI_DOCUMENT.paths).flatMap(([path, pathItem]) => METHODS
    .filter((method) => method in pathItem)
    .map((method) => `${method} ${path}`)).sort();
}

function operations(): Array<{ method: string; path: string; operation: Operation }> {
  return Object.entries(MUSIC_OPENAPI_DOCUMENT.paths).flatMap(([path, pathItem]) => METHODS.flatMap((method) => {
    const operation = (pathItem as Record<string, Operation>)[method];
    return operation ? [{ method, path, operation }] : [];
  }));
}

describe("Music OpenAPI 3.1 executable contract", () => {
  it("parses as OpenAPI 3.1 and has exact parity with every live canonical route", async () => {
    await expect(SwaggerParser.validate(MUSIC_OPENAPI_DOCUMENT as never)).resolves.toBeDefined();
    expect(documentedOperations()).toEqual(liveCanonicalOperations());
  });

  it("documents the historical Explorer bearer analytics read separately from Music credentials", () => {
    const operation = (MUSIC_OPENAPI_DOCUMENT.paths as Record<string, any>)["/api/explorers/analytics/events"]?.get;
    expect(operation).toBeDefined();
    expect(operation.security).toEqual([{ explorerProof: [] }]);
    expect(operation.parameters.filter((p: any) => p.in === "query").map((p: any) => p.name).sort()).toEqual(["accountId", "fromDate", "timeZone", "toDate"]);
    expect(operation.parameters.filter((p: any) => p.in === "query").every((p: any) => p.required)).toBe(true);
    expect(Object.keys(operation.responses).sort()).toEqual(["200", "400", "403", "502"]);
    expect(operation.description).toContain("93");
    expect(operation.description).toContain("7.2");
  });

  it("declares exact path parameters, status codes, schemas, and request correlation", () => {
    for (const { path, operation } of operations()) {
      for (const name of [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1])) {
        expect(operation.parameters, `${path} must declare ${name}`).toContainEqual(expect.objectContaining({
          name, in: "path", required: true,
        }));
      }
      expect(Object.keys(operation.responses ?? {}), `${path} must use exact statuses`)
        .not.toEqual(expect.arrayContaining([expect.stringMatching(/^[1-5]XX$/)]));
      for (const [status, response] of Object.entries(operation.responses ?? {})) {
        expect(response.headers, `${path} ${status} must return X-Request-Id`).toHaveProperty("X-Request-Id");
      }
    }
  });

  it("documents C5, origin, guest header, publication, and entitlement semantics", () => {
    for (const { method, path, operation } of operations()) {
      const isHistoricalAnalytics = path === "/api/explorers/analytics/events" && method === "get";
      const isIdentityBoundary = isHistoricalAnalytics || path.includes("/identity/ensure") || path.includes("/identity/lifecycle/");
      const isPublic = path === "/api/music/public-profile/{accountDocumentId}"
        || path === "/api/music/public-resource/v1/{publicSlug}"
        || path === "/api/explorers/analytics/music/{publicSlug}/events"
        || path === "/api/explorers/analytics/music-account/{accountDocumentId}/events";
      const isOwner = !isIdentityBoundary && !isPublic && !path.includes("{guestUrl}") && path !== "/api-docs";
      if (isIdentityBoundary) expect(operation.security, `${method} ${path}`).toContainEqual({ explorerProof: [] });
      if (isOwner) expect(operation.security, `${method} ${path}`).toContainEqual({ musicCredential: [] });
      if (isOwner && method !== "get" || path.endsWith("/{guestUrl}/requests")) {
        expect(operation.parameters, `${method} ${path} requires an exact Origin`).toContainEqual(expect.objectContaining({
          name: "Origin", in: "header", required: true,
        }));
      }
    }
    expect(MUSIC_OPENAPI_DOCUMENT.paths["/api/playlist/{guestUrl}"].get.parameters)
      .toContainEqual(expect.objectContaining({ name: "X-Music-Guest-Capability", in: "header", required: false }));
    expect(MUSIC_OPENAPI_DOCUMENT.paths["/api/playlist/{guestUrl}/requests"].post.parameters)
      .toContainEqual(expect.objectContaining({ name: "X-Music-Guest-Capability", in: "header", required: false }));
    expect(MUSIC_OPENAPI_DOCUMENT.paths["/api/playlist/{guestUrl}/requests"].post.parameters)
      .toContainEqual(expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true }));
    expect(JSON.stringify(MUSIC_OPENAPI_DOCUMENT.paths["/api/playlist/{guestUrl}"].get)).toMatch(/unlisted.*noindex/i);
    const descriptor = MUSIC_OPENAPI_DOCUMENT.paths["/api/music/public-profile/{accountDocumentId}"].get;
    expect(descriptor.security).toEqual([]);
    expect(descriptor.parameters).toContainEqual(expect.objectContaining({
      name: "accountDocumentId", in: "path", required: true,
      schema: expect.objectContaining({ type: "string", minLength: 1, maxLength: 512 }),
    }));
    expect(descriptor).not.toHaveProperty("requestBody");
    expect(Object.keys(descriptor.responses)).toEqual(["200", "400", "404", "413", "429", "500", "503"]);
    expect(JSON.stringify(descriptor.responses["404"])).toContain("PUBLIC_NOT_FOUND");
    expect(descriptor.responses["429"]).toHaveProperty("headers.Retry-After");
    expect(MUSIC_OPENAPI_DOCUMENT.components.schemas.PublicMusicDescriptor).toMatchObject({
      type: "object", additionalProperties: false, required: ["version", "publication"],
    });
    const publicResource = MUSIC_OPENAPI_DOCUMENT.paths["/api/music/public-resource/v1/{publicSlug}"]?.get;
    expect(publicResource).toBeDefined();
    expect(publicResource?.security).toEqual([{}, { guestCapability: [] }]);
    for (const path of ["/api/playlist/{guestUrl}/youtube/search", "/api/playlist/{guestUrl}/youtube/video-from-url"] as const) {
      const operation = MUSIC_OPENAPI_DOCUMENT.paths[path]?.post;
      expect(operation?.security).toEqual([{}, { guestCapability: [] }]);
      expect(operation?.parameters).toContainEqual(expect.objectContaining({ name: "X-Music-Guest-Capability", required: false }));
      expect(JSON.stringify(operation)).toMatch(/Public publications work anonymously.*optional.*hashed/i);
    }
    expect(publicResource?.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "publicSlug", in: "path", required: true }),
      expect.objectContaining({ name: "X-Music-Guest-Capability", in: "header", required: false }),
    ]));
    expect(Object.keys(publicResource?.responses ?? {}).sort()).toEqual(["200", "400", "404", "413", "429", "500", "503"]);
    expect(JSON.stringify(publicResource?.responses["200"])).toContain("music-public-resource/v1");
    const guestRequest = MUSIC_OPENAPI_DOCUMENT.paths["/api/playlist/{guestUrl}/requests"].post;
    expect(Object.keys(guestRequest.responses)).toContain("503");
    for (const operation of [descriptor, publicResource, guestRequest]) {
      expect(JSON.stringify(operation.responses)).toContain("SERVICE_UNAVAILABLE");
      expect(JSON.stringify(operation.responses)).toContain("REQUEST_INVALID");
      expect(JSON.stringify(operation.responses)).toContain("RATE_LIMITED");
    }
    expect(descriptor.responses["200"]).toHaveProperty("content.application/json.examples.success.value.version", "music-public-descriptor/v1");
    expect(publicResource?.responses["200"]).toHaveProperty("content.application/json.examples.success.value.version", "music-public-resource/v1");
    expect(guestRequest.responses["201"]).toHaveProperty("content.application/json.examples.success.value.accepted", true);
    const productAnalytics = MUSIC_OPENAPI_DOCUMENT.paths["/api/explorers/analytics/music/{publicSlug}/events"]?.post;
    expect(productAnalytics?.security).toEqual([{}, { guestCapability: [] }]);
    expect(productAnalytics?.requestBody).toBeDefined();
    expect(JSON.stringify(productAnalytics?.requestBody)).not.toMatch(/accountId|publicSlug|capability|query|mediaUrl|credential/i);
    const friendlyAnalytics = MUSIC_OPENAPI_DOCUMENT.paths["/api/explorers/analytics/music-account/{accountDocumentId}/events"]?.post;
    expect(friendlyAnalytics?.security).toEqual([{}]);
    expect(JSON.stringify(friendlyAnalytics?.requestBody)).not.toMatch(/accountId|accountDocumentId|publicSlug|capability|query|mediaUrl|credential/i);
    expect(MUSIC_OPENAPI_DOCUMENT.components.schemas.PublicMusicResource).toMatchObject({
      type: "object", additionalProperties: false,
      required: ["version", "revision", "user", "permissions", "currentlyPlaying", "queue", "recentlyPlayed", "playlists"],
    });
    expect(MUSIC_OPENAPI_DOCUMENT.components.schemas.PublicMusicSong).toMatchObject({ type: "object", additionalProperties: false });
    expect(MUSIC_OPENAPI_DOCUMENT.components.schemas.PublicMusicSong.properties.thumbnailUrl).toEqual({
      type: ["string", "null"], format: "uri", minLength: 1, maxLength: 2_048,
    });
    expect(MUSIC_OPENAPI_DOCUMENT.components.schemas.PublicMusicPlaylist).toMatchObject({ type: "object", additionalProperties: false });
    expect(MUSIC_OPENAPI_DOCUMENT.components.schemas.PublicMusicPlaylist.properties.description).toEqual({
      type: ["string", "null"], maxLength: 2_000,
    });
    expect(JSON.stringify(MUSIC_OPENAPI_DOCUMENT.components.schemas.PublicMusicSong)).not.toMatch(/userId|playlistId|documentId|capability|credential/);
    expect(JSON.stringify(MUSIC_OPENAPI_DOCUMENT.components.schemas.PublicMusicPlaylist)).not.toMatch(/userId|playlistId|documentId|capability|credential/);
    expect(JSON.stringify(MUSIC_OPENAPI_DOCUMENT.paths["/api/music/paid/import"].post.responses)).toContain("ENTITLEMENT_REQUIRED");
    expect(MUSIC_OPENAPI_DOCUMENT.components.schemas.Dashboard.required).toContain("publication");
    expect(MUSIC_OPENAPI_DOCUMENT.components.schemas.Dashboard.required).toContain("queueRevision");
    expect(MUSIC_OPENAPI_DOCUMENT.components.schemas.PlayingInput.required).toEqual(["songId"]);
    expect(MUSIC_OPENAPI_DOCUMENT.components.schemas.PlayingInput.properties.expectedRevision).toMatchObject({ type: "integer", minimum: 0 });
    expect(MUSIC_OPENAPI_DOCUMENT.components.schemas.PlayingInput.properties.expectedPlaybackRevision).toMatchObject({ type: "integer", minimum: 0 });
    expect(MUSIC_OPENAPI_DOCUMENT.components.schemas).toHaveProperty("PlaybackCommandResponse");
    expect(JSON.stringify(MUSIC_OPENAPI_DOCUMENT.paths["/api/playlist/currently-playing"].post.responses)).toContain("music-playback/v1");
    expect(JSON.stringify(MUSIC_OPENAPI_DOCUMENT.paths["/api/playlist/currently-playing"].post.responses["409"])).toContain("PLAYBACK_REVISION_CONFLICT");
    expect(JSON.stringify(MUSIC_OPENAPI_DOCUMENT.paths["/api/playlist/currently-playing"].post.responses["409"])).toContain("PLAYBACK_QUEUE_REVISION_CONFLICT");
    expect(MUSIC_OPENAPI_DOCUMENT.components.schemas.SongInput.properties.youtubeId).toMatchObject({ minLength: 11, maxLength: 11, pattern: "^[A-Za-z0-9_-]{11}$" });
    expect(MUSIC_OPENAPI_DOCUMENT.components.schemas.SongInput.properties.thumbnailUrl).toMatchObject({ minLength: 1, maxLength: 2_048 });
    expect(MUSIC_OPENAPI_DOCUMENT.components.schemas.BulkSongInput.properties.songIds).toMatchObject({ minItems: 1, maxItems: 500, uniqueItems: true });
    expect(MUSIC_OPENAPI_DOCUMENT.components.schemas.Song.properties.youtubeId).toMatchObject({ minLength: 11, maxLength: 11, pattern: "^[A-Za-z0-9_-]{11}$" });
    expect(MUSIC_OPENAPI_DOCUMENT.components.schemas.PlaylistSong.properties.youtubeId).toMatchObject({ minLength: 11, maxLength: 11, pattern: "^[A-Za-z0-9_-]{11}$" });
    expect(JSON.stringify(MUSIC_OPENAPI_DOCUMENT.components.schemas.Dashboard.properties.publication)).toContain("publicSlug");
    expect(JSON.stringify(MUSIC_OPENAPI_DOCUMENT.components.schemas.Dashboard.properties.publication)).not.toMatch(/capability|secret|hash/i);
    expect(MUSIC_OPENAPI_DOCUMENT.paths).toHaveProperty("/api/music/publication");
    expect(MUSIC_OPENAPI_DOCUMENT.paths).not.toHaveProperty("/api/music/publication/{action}");
    expect(MUSIC_OPENAPI_DOCUMENT.paths).not.toHaveProperty("/api/music/guest-capability/rotate");
    expect(MUSIC_OPENAPI_DOCUMENT.paths).not.toHaveProperty("/api/music/guest-capability/revoke");
    expect(MUSIC_OPENAPI_DOCUMENT.paths["/api/music/publication"].post.parameters)
      .toContainEqual(expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true }));
    const queueReplace = MUSIC_OPENAPI_DOCUMENT.paths["/api/music/queue/replace"].post;
    const queueAppend = MUSIC_OPENAPI_DOCUMENT.paths["/api/music/queue/append"].post;
    expect(queueReplace.parameters).toContainEqual(expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true }));
    expect(queueAppend.parameters).toContainEqual(expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true }));
    expect(MUSIC_OPENAPI_DOCUMENT.paths["/api/playlists"].post.parameters)
      .toContainEqual(expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true }));
    expect(MUSIC_OPENAPI_DOCUMENT.paths["/api/playlists/{playlistId}/songs"].post.parameters)
      .toContainEqual(expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true }));
    expect(Object.keys(queueReplace.responses)).toEqual(expect.arrayContaining(["200", "400", "401", "403", "409", "503"]));
    expect(JSON.stringify(queueReplace)).toContain("QUEUE_REVISION_CONFLICT");
    expect(JSON.stringify(queueReplace)).toMatch(/24 hours.*expired.*reused/i);
    expect(JSON.stringify(queueAppend)).toContain("QUEUE_REVISION_CONFLICT");
    expect(queueReplace.requestBody).toMatchObject({ content: { "application/json": { schema: {
      required: ["expectedRevision", "songs"], additionalProperties: false,
    } } } });
    const queueAppendRequest = queueAppend.requestBody as unknown as { content: { "application/json": { schema: { properties: { songs: unknown } } } } };
    expect(queueAppendRequest.content["application/json"].schema.properties.songs).toMatchObject({ minItems: 1, maxItems: 500 });
    const publicationContract = JSON.stringify(MUSIC_OPENAPI_DOCUMENT.paths["/api/music/publication"].post);
    expect(publicationContract).toContain("PUBLICATION_REPLAY_EXPIRED");
    expect(publicationContract).toMatch(/24 hours|86400/i);
    expect(publicationContract).not.toMatch(/cipher|nonce|tag|response.key|aes|capability.hash/i);
    expect(JSON.stringify(MUSIC_OPENAPI_DOCUMENT.paths["/api/playlist/{guestUrl}"].get).toLowerCase()).not.toContain("zero-visible resources share the same safe 404");
  });

  it("documents the bounded publication command quota as a retryable 429", () => {
    const publication = MUSIC_OPENAPI_DOCUMENT.paths["/api/music/publication"].post;
    const responses = publication.responses as Record<string, unknown>;
    expect(responses["429"])
      .toMatchObject({ headers: { "Retry-After": expect.any(Object) } });
    const serialized = JSON.stringify(publication);
    expect(serialized).toContain("RATE_LIMITED");
    expect(serialized).toMatch(/100|quota/i);
  });

  it("validates mounted success DTOs for every product family against resolved 3.1 schemas", async () => {
    // Break caught: syntax-valid documentation advertises camelCase/enum shapes that live route bodies do not return.
    const addedAt = new Date("2026-08-14T10:00:00.000Z");
    const queueRow = {
      id: 21, user_id: 11, youtube_id: "abcdefghijk", title: "Queue", artist: "Artist",
      thumbnail_url: "https://img/queue", position: 0, status: "queued", played_at: null,
    };
    const savedRow = {
      id: 31, playlist_id: 7, youtube_id: "lmnopqrstuv", title: "Saved", artist: "Artist",
      thumbnail_url: "https://img/saved", position: 0, added_at: addedAt,
    };
    const playlistRow = {
      id: 7, user_id: 11, name: "Saved list", description: null, is_visible_to_guests: true,
      created_at: addedAt, updated_at: addedAt, songs: [savedRow],
    };
    const youtubeVideo = {
      id: { videoId: "abcdefghijk" },
      snippet: {
        title: "Video",
        channelTitle: "Channel",
        thumbnails: { default: { url: "https://img/video" } },
      },
    };
    const publicPlaylist = {
      songs: [{ id: 41, userId: 11, youtubeId: "zyxwvutsrqp", title: "Public", artist: "Artist", thumbnailUrl: "https://img/public", position: 0, status: "playing", playedAt: null }],
      currentlyPlaying: { id: 41, userId: 11, youtubeId: "zyxwvutsrqp", title: "Public", artist: "Artist", thumbnailUrl: "https://img/public", position: 0, status: "playing", playedAt: null },
      playedSongs: [],
      user: {
        id: 11, username: "display", guestUrl: "public-owner", venueName: "Venue", theme: { primary: "#123456" },
        allowSongRequests: true, allowGuestPlayOnDevice: false, allowPlaylistSharing: true, allowRecentlyPlayedVisibility: true, allowQueueVisibility: true,
      },
      allowGuestPlayOnDevice: false,
      allowRecentlyPlayedVisibility: true,
      allowQueueVisibility: true,
      playlists: [{ id: 7, userId: 11, name: "Saved list", description: null, isVisibleToGuests: true, createdAt: addedAt.toISOString(), updatedAt: addedAt.toISOString(), songs: [{ id: 31, playlistId: 7, youtubeId: "lmnopqrstuv", title: "Saved", artist: "Artist", thumbnailUrl: "https://img/saved", position: 0, addedAt: addedAt.toISOString() }] }],
    };
    const publicResource = {
      version: "music-public-resource/v1" as const,
      revision: 7,
      user: { username: "display", venueName: "Venue" },
      permissions: { allowSongRequests: true, allowGuestPlayOnDevice: false, allowPlaylistSharing: true, allowRecentlyPlayedVisibility: true, allowQueueVisibility: true },
      currentlyPlaying: null,
      queue: { items: [], total: 0, truncated: false },
      recentlyPlayed: { items: [], total: 0, truncated: false },
      playlists: { items: [], total: 0, truncated: false },
    };
    const repository = {
      listPlaylists: async () => [playlistRow], getPlaylist: async () => playlistRow,
      createPlaylist: async () => playlistRow,
      createPlaylistIdempotent: async () => ({ status: "completed" as const, replayed: false, response: playlistRow }),
      updatePlaylist: async () => playlistRow, deletePlaylist: async () => true,
      addPlaylistSongIdempotent: async () => ({ status: "completed" as const, replayed: false, response: savedRow }), removePlaylistSong: async () => true, reorderPlaylistSong: async () => true,
      setPlaylistVisibility: async () => true, listQueue: async () => [queueRow], ownerDashboard: async () => ({ queueRevision: 0, playbackRevision: 0, songs: [queueRow], currentlyPlaying: queueRow, playedSongs: [], publication: { mode: "public", publicSlug: "public-owner" }, guestControls: { allowSongRequests: true, allowGuestPlayOnDevice: false, allowPlaylistSharing: true, allowRecentlyPlayedVisibility: true, allowQueueVisibility: true } }),
      getGuestControls: async () => ({ allowSongRequests: true, allowGuestPlayOnDevice: false, allowPlaylistSharing: true, allowRecentlyPlayedVisibility: true, allowQueueVisibility: true }),
      updateGuestControls: async (_owner: number, controls: { allowSongRequests: boolean; allowGuestPlayOnDevice: boolean; allowPlaylistSharing: boolean; allowRecentlyPlayedVisibility: boolean; allowQueueVisibility?: boolean }) => ({ ...controls, allowQueueVisibility: controls.allowQueueVisibility ?? true }),
      replaceQueue: async () => ({ status: "completed" as const, replayed: false, response: { version: "music-queue/v1" as const, revision: 1, songs: [queueRow] } }),
      appendQueue: async () => ({ status: "completed" as const, replayed: false, response: { version: "music-queue/v1" as const, revision: 1, songs: [queueRow] } }),
      addSong: async () => queueRow, setPlaying: async (_owner: number, songId: number | null) => songId === null ? null : queueRow,
      addGuestSongIdempotent: async () => ({ status: "completed" as const, replayed: false, response: { accepted: true as const } }),
      updateSongPosition: async () => queueRow, removeSong: async () => true,
      removeHistorySong: async () => ({ status: "completed" as const, replayed: false }),
      removeSongs: async () => 1, clearHistory: async () => 1,
      rotateGuestCapability: async () => ({}), revokeGuestCapability: async () => undefined, setDiscoverable: async () => undefined,
      setPublicationMode: async (_owner: number, mode: "private" | "unlisted" | "public") => ({ mode, publicSlug: "public-owner" }),
      executePublicationCommand: async (_owner: number, _key: string, mode: "private" | "unlisted" | "public") => ({
        status: "completed" as const,
        replayed: false,
        response: { version: "music-publication/v1" as const, publication: { mode, publicSlug: "public-owner" }, ...(mode === "unlisted" ? { capability: "C".repeat(43) } : {}) },
      }),
      resolveEntitlement: async () => ({ state: "included" as const, sourceUpdatedAt: addedAt }),
      resolvePublicDescriptor: async () => ({ mode: "public" as const, publicSlug: "public-owner", revision: 7 }),
      resolvePublicMusicResource: async () => ({ state: "public", noindex: false, resource: publicResource }),
      resolveGuestResource: async () => ({ state: "public", noindex: false, playlist: publicPlaylist }),
      resolveGuestSocketAuthority: async () => ({ musicUserId: 11, active: true as const, allowSongRequests: true }),
      resolveGuestRequestAuthority: async () => ({ musicUserId: 11, active: true as const, allowSongRequests: true }),
    };
    const app = express();
    app.use(express.json());
    setupCanonicalMusicRoutes(app, {
      repository,
      resolvePrincipal: async () => ({ musicUserId: 11, subject: "subject", accountDocumentId: "account", sessionVersion: 1 }),
      allowedOrigins: ["https://explorers.example"],
      // Ticket 6.3. Required: the socket accepts only a handshake ticket, so every
      // composition serving the Music surface must be able to mint one.
      mintSocketTicket: () => ({ token: "openapi.socket.ticket", expiresAt: 1760000060 }),
      requestIdFactory: () => "openapi-success-request",
      now: () => new Date("2026-08-14T10:00:01.000Z"),
      publicRateLimited: () => false,
      youtube: {
        search: async () => ({ items: [youtubeVideo], nextPageToken: null }),
        videoFromUrl: async () => youtubeVideo,
      },
    });
    const { request } = await loopback.open({ app });
    const ownerRead = { Authorization: "Bearer aaa.bbb.ccc" };
    const ownerWrite = { ...ownerRead, Origin: "https://explorers.example" };
    const guestWrite = { Origin: "https://explorers.example", "X-Music-Guest-Capability": "G".repeat(43), "Idempotency-Key": "openapi-guest-request" };
    const songInput = { youtubeId: "abcdefghijk", title: "Video", artist: "Artist", thumbnailUrl: "https://img/video" };
    const cases = [
      ["get", "/api/music/public-profile/{accountDocumentId}", "/api/music/public-profile/account-public", 200, undefined, {}],
      ["get", "/api/music/public-resource/v1/{publicSlug}", "/api/music/public-resource/v1/public-owner", 200, undefined, {}],
      ["get", "/api/playlists", "/api/playlists", 200, undefined, ownerRead],
      ["post", "/api/playlists", "/api/playlists", 201, { name: "Saved list", description: null }, { ...ownerWrite, "Idempotency-Key": "openapi-playlist-create" }],
      ["get", "/api/playlists/{playlistId}", "/api/playlists/7", 200, undefined, ownerRead],
      ["patch", "/api/playlists/{playlistId}", "/api/playlists/7", 200, { name: "Saved list", description: null }, ownerWrite],
      ["post", "/api/playlists/{playlistId}/songs", "/api/playlists/7/songs", 201, songInput, { ...ownerWrite, "Idempotency-Key": "openapi-playlist-song" }],
      ["get", "/api/playlist/songs", "/api/playlist/songs", 200, undefined, ownerRead],
      ["post", "/api/playlist/songs", "/api/playlist/songs", 201, songInput, ownerWrite],
      ["post", "/api/music/queue/replace", "/api/music/queue/replace", 200, { expectedRevision: 0, songs: [{ playlistId: 7, songId: 31 }] }, { ...ownerWrite, "Idempotency-Key": "openapi-queue-replace" }],
      ["post", "/api/music/queue/append", "/api/music/queue/append", 200, { expectedRevision: 0, songs: [{ playlistId: 7, songId: 31 }] }, { ...ownerWrite, "Idempotency-Key": "openapi-queue-append" }],
      ["post", "/api/playlist/currently-playing", "/api/playlist/currently-playing", 200, { songId: 21 }, ownerWrite],
      ["patch", "/api/playlist/songs/{songId}/position", "/api/playlist/songs/21/position", 200, { position: 0 }, ownerWrite],
      ["get", "/api/music/dashboard", "/api/music/dashboard", 200, undefined, ownerRead],
      ["get", "/api/music/guest-controls", "/api/music/guest-controls", 200, undefined, ownerRead],
      ["patch", "/api/music/guest-controls", "/api/music/guest-controls", 200, { allowSongRequests: true, allowGuestPlayOnDevice: false, allowPlaylistSharing: true, allowRecentlyPlayedVisibility: true, allowQueueVisibility: true }, ownerWrite],
      ["post", "/api/youtube/search", "/api/youtube/search", 200, { query: "video" }, ownerWrite],
      ["post", "/api/youtube/video-from-url", "/api/youtube/video-from-url", 200, { url: "https://youtu.be/abcdefghijk" }, ownerWrite],
      ["post", "/api/playlist/{guestUrl}/youtube/search", "/api/playlist/public-owner/youtube/search", 200, { query: "video" }, guestWrite],
      ["post", "/api/playlist/{guestUrl}/youtube/video-from-url", "/api/playlist/public-owner/youtube/video-from-url", 200, { url: "https://youtu.be/abcdefghijk" }, guestWrite],
      ["post", "/api/music/publication", "/api/music/publication", 200, { mode: "public" }, { ...ownerWrite, "Idempotency-Key": createMusicPublicationIdempotencyKey(Date.parse("2026-08-14T10:00:01.000Z"), "11111111-2222-4333-8444-555555555555") }],
      ["get", "/api/music/entitlement", "/api/music/entitlement", 200, undefined, ownerRead],
      ["get", "/api/playlist/{guestUrl}", "/api/playlist/public-owner", 200, undefined, {}],
      ["post", "/api/playlist/{guestUrl}/requests", "/api/playlist/public-owner/requests", 201, songInput, guestWrite],
    ] as const;

    const dereferenced = await SwaggerParser.dereference(JSON.parse(JSON.stringify(MUSIC_OPENAPI_DOCUMENT)) as never) as any;
    const validator = new Ajv2020({ allErrors: true, strict: false });
    addFormats(validator);
    for (const [method, documentedPath, actualPath, status, requestBody, headers] of cases) {
      let pending = request[method](actualPath).set(headers as Record<string, string>);
      if (requestBody !== undefined) pending = pending.send(requestBody);
      const response = await pending;
      expect(response.status, `${method} ${actualPath}`).toBe(status);
      const schema = dereferenced.paths[documentedPath][method].responses[String(status)].content["application/json"].schema;
      const validate = validator.compile(schema);
      expect(validate(response.body), `${method} ${actualPath}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }

    const noContentCases = [
      ["delete", "/api/playlists/{playlistId}", "/api/playlists/7", undefined],
      ["delete", "/api/playlists/{playlistId}/songs/{songId}", "/api/playlists/7/songs/31", undefined],
      ["patch", "/api/playlists/{playlistId}/reorder", "/api/playlists/7/reorder", { songId: 31, position: 0 }],
      ["patch", "/api/playlists/{playlistId}/visibility", "/api/playlists/7/visibility", { isVisibleToGuests: true }],
      ["post", "/api/playlist/currently-playing", "/api/playlist/currently-playing", { songId: null }],
      ["delete", "/api/playlist/songs/bulk", "/api/playlist/songs/bulk", { songIds: [21] }],
      ["delete", "/api/playlist/songs/{songId}", "/api/playlist/songs/21", undefined],
      ["delete", "/api/playlist/history", "/api/playlist/history", undefined],
    ] as const;
    for (const [method, documentedPath, actualPath, requestBody] of noContentCases) {
      let pending = request[method](actualPath).set(ownerWrite);
      if (requestBody !== undefined) pending = pending.send(requestBody);
      const response = await pending;
      expect(response.status, `${method} ${actualPath}`).toBe(204);
      expect(response.text).toBe("");
      expect(dereferenced.paths[documentedPath][method].responses["204"]).not.toHaveProperty("content");
    }

    const historyRemove = await request
      .delete("/api/playlist/history/21")
      .set({ ...ownerWrite, "Idempotency-Key": "openapi-history-remove" });
    expect(historyRemove.status, "delete /api/playlist/history/21").toBe(204);
    expect(historyRemove.text).toBe("");
    expect(dereferenced.paths["/api/playlist/history/{songId}"].delete.responses["204"]).not.toHaveProperty("content");

    expect((MUSIC_OPENAPI_DOCUMENT.components.schemas.EntitlementResponse.properties.state as { enum: readonly string[] }).enum)
      .toEqual(["unknown", "included", "eligible", "entitled", "revoked"]);
    expect(MUSIC_OPENAPI_DOCUMENT.components.schemas).toHaveProperty("PublicUser");

    const videoSchema = validator.compile(dereferenced.components.schemas.YouTubeVideo);
    expect(videoSchema(youtubeVideo)).toBe(true);
    expect(videoSchema({ ...youtubeVideo, unexpected: true }), JSON.stringify(videoSchema.errors)).toBe(false);
    expect(videoSchema({ ...youtubeVideo, snippet: { title: "Video", thumbnails: youtubeVideo.snippet.thumbnails } }), JSON.stringify(videoSchema.errors)).toBe(false);
    expect(videoSchema({ ...youtubeVideo, id: { videoId: "too-short" } }), JSON.stringify(videoSchema.errors)).toBe(false);

    const searchSchema = validator.compile(dereferenced.components.schemas.YouTubeSearchResponse);
    expect(searchSchema({ items: [youtubeVideo], nextPageToken: null })).toBe(true);
    expect(searchSchema({ items: [youtubeVideo] }), JSON.stringify(searchSchema.errors)).toBe(false);
    expect(searchSchema({ items: [youtubeVideo], nextPageToken: null, unexpected: true }), JSON.stringify(searchSchema.errors)).toBe(false);

    const publicUserSchema = validator.compile(dereferenced.components.schemas.PublicUser);
    expect(publicUserSchema(publicPlaylist.user)).toBe(true);
    expect(publicUserSchema({ ...publicPlaylist.user, theme: null })).toBe(true);
    expect(publicUserSchema({ ...publicPlaylist.user, theme: {} }), JSON.stringify(publicUserSchema.errors)).toBe(false);
    expect(publicUserSchema({ ...publicPlaylist.user, theme: { primary: "#123456", unexpected: true } }), JSON.stringify(publicUserSchema.errors)).toBe(false);
  });

  it("expresses the exact entitlement truth table and rejects unsupported or impossible responses", async () => {
    // Break caught: the published contract permits a core denial or grants premium mutation to a non-entitled state.
    const dereferenced = await SwaggerParser.dereference(JSON.parse(JSON.stringify(MUSIC_OPENAPI_DOCUMENT)) as never) as any;
    const validator = new Ajv2020({ allErrors: true, strict: false });
    addFormats(validator);
    const validate = validator.compile(dereferenced.components.schemas.EntitlementResponse);
    const base = { coreRead: true, coreMutation: true, paidMutation: false, maxAgeSeconds: 600 };

    for (const state of ["unknown", "included", "eligible", "revoked"] as const) {
      expect(validate({ ...base, state }), `${state}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
    expect(validate({ ...base, state: "entitled", paidMutation: true, sourceUpdatedAt: "2026-08-14T09:55:00.000Z" }), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...base, state: "entitled", paidMutation: false }), JSON.stringify(validate.errors)).toBe(true);

    expect(validate({ ...base, state: "paused" })).toBe(false);
    expect(validate({ ...base, state: "included", paidMutation: true })).toBe(false);
    expect(validate({ ...base, state: "entitled", paidMutation: true })).toBe(false);
    expect(validate({ ...base, state: "revoked", coreMutation: false })).toBe(false);
  });

  it("expresses the exact conditional publication response for every requested mode", async () => {
    const dereferenced = await SwaggerParser.dereference(JSON.parse(JSON.stringify(MUSIC_OPENAPI_DOCUMENT)) as never) as any;
    const validator = new Ajv2020({ allErrors: true, strict: false });
    const validate = validator.compile(dereferenced.components.schemas.PublicationCommandResponse);
    const slug = "public-owner-slug";
    const capability = "C".repeat(43);

    expect(validate({ version: "music-publication/v1", publication: { mode: "private", publicSlug: slug } })).toBe(true);
    expect(validate({ version: "music-publication/v1", publication: { mode: "public", publicSlug: slug } })).toBe(true);
    expect(validate({ version: "music-publication/v1", publication: { mode: "unlisted", publicSlug: slug }, capability })).toBe(true);

    for (const invalid of [
      { version: "music-publication/v1", publication: { mode: "unlisted", publicSlug: slug } },
      { version: "music-publication/v1", publication: { mode: "public", publicSlug: slug }, capability },
      { version: "music-publication/v1", publication: { mode: "private", publicSlug: null } },
      { version: "music-publication/v1", publication: { mode: "public", publicSlug: slug }, extra: true },
      { version: "music-publication/v1", publication: { mode: "public", publicSlug: slug, extra: true } },
      { version: "music-publication/v1", publication: { mode: "unlisted", publicSlug: slug }, capability: "short" },
    ]) expect(validate(invalid), JSON.stringify(validate.errors)).toBe(false);
  });
});
