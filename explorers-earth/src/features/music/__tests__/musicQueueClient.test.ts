import { describe, expect, it, vi } from "vitest";
import { createMusicQueueClient } from "../musicQueueClient";

const song = { id: 3, youtubeId: "abcdefghijk", title: "Song", artist: "Artist", thumbnailUrl: "https://img", position: 0, status: "queued", playedAt: null };

describe("credential-aware Music queue client", () => {
  it("uses the exact owner-derived queue routes and DTOs", async () => {
    const request = vi.fn(async (input: { path: string }) => input.path === "/api/music/dashboard"
      ? new Response(JSON.stringify({ queueRevision: 4, songs: [song], currentlyPlaying: null, playedSongs: [], publication: { mode: "private", publicSlug: "slug" } }))
      : input.path === "/api/music/queue/replace" || input.path === "/api/music/queue/append"
        ? new Response(JSON.stringify({ version: "music-queue/v1", revision: 5, songs: [song] }))
        : input.path === "/api/playlist/currently-playing" && (input as { body?: { songId?: number | null } }).body?.songId === null
          ? new Response(null, { status: 204 })
          : input.path === "/api/playlist/songs/3" || input.path === "/api/playlist/songs/bulk" || input.path === "/api/playlist/history"
            ? new Response(null, { status: 204 })
            : new Response(JSON.stringify(song), { status: input.path === "/api/playlist/songs" ? 201 : 200 }));
    const client = createMusicQueueClient(request);

    await expect(client.loadDashboard()).resolves.toMatchObject({ queueRevision: 4, songs: [song] });
    await client.addSong({ youtubeId: song.youtubeId, title: song.title, artist: song.artist, thumbnailUrl: song.thumbnailUrl }, "add-song-1");
    await client.setPlaying(3, "set-playing-1");
    await client.setPlaying(null, "stop-playing-1");
    await client.removeSong(3, "remove-song-1");
    await client.removeSongs([3, 4], "remove-songs-1");
    await client.moveSong(3, 2, "move-song-1");
    await client.clearHistory("clear-history-1");
    await client.removeHistorySong(3, "remove-history-1");
    await expect(client.replaceQueue(4, [{ playlistId: 8, songId: 9 }], "replace-queue-1")).resolves.toEqual({ version: "music-queue/v1", revision: 5, songs: [song] });
    await expect(client.appendQueue(5, [{ playlistId: 8, songId: 10 }], "append-queue-1")).resolves.toEqual({ version: "music-queue/v1", revision: 5, songs: [song] });

    expect(request.mock.calls.map(([input]) => input)).toEqual([
      { method: "GET", path: "/api/music/dashboard" },
      { method: "POST", path: "/api/playlist/songs", body: { youtubeId: "abcdefghijk", title: "Song", artist: "Artist", thumbnailUrl: "https://img" }, idempotencyKey: "add-song-1" },
      { method: "POST", path: "/api/playlist/currently-playing", body: { songId: 3 }, idempotencyKey: "set-playing-1" },
      { method: "POST", path: "/api/playlist/currently-playing", body: { songId: null }, idempotencyKey: "stop-playing-1" },
      { method: "DELETE", path: "/api/playlist/songs/3", idempotencyKey: "remove-song-1" },
      { method: "DELETE", path: "/api/playlist/songs/bulk", body: { songIds: [3, 4] }, idempotencyKey: "remove-songs-1" },
      { method: "PATCH", path: "/api/playlist/songs/3/position", body: { position: 2 }, idempotencyKey: "move-song-1" },
      { method: "DELETE", path: "/api/playlist/history", idempotencyKey: "clear-history-1" },
      { method: "DELETE", path: "/api/playlist/history/3", idempotencyKey: "remove-history-1" },
      { method: "POST", path: "/api/music/queue/replace", body: { expectedRevision: 4, songs: [{ playlistId: 8, songId: 9 }] }, idempotencyKey: "replace-queue-1" },
      { method: "POST", path: "/api/music/queue/append", body: { expectedRevision: 5, songs: [{ playlistId: 8, songId: 10 }] }, idempotencyKey: "append-queue-1" },
    ]);
    expect(JSON.stringify(request.mock.calls)).not.toMatch(/username|email|ownerId|accountId|documentId|musicUserId/i);
  });

  it("sends and validates the revisioned playback contract without changing the legacy method", async () => {
    // Break caught: the client timeout arbiter has no owner-scoped revision the server can verify.
    const request = vi.fn(async () => new Response(JSON.stringify({
      version: "music-playback/v1", revision: 8, playbackRevision: 8, song: { ...song, status: "playing" },
    }), { headers: { "content-type": "application/json" } }));

    await expect(createMusicQueueClient(request).setPlayingRevision(3, 7, 4, "playback-8"))
      .resolves.toEqual({ version: "music-playback/v1", revision: 8, playbackRevision: 8, song: { ...song, status: "playing" } });
    expect(request).toHaveBeenCalledWith({
      method: "POST", path: "/api/playlist/currently-playing",
      body: { songId: 3, expectedRevision: 7, expectedPlaybackRevision: 4 }, idempotencyKey: "playback-8",
    });
  });

  it("forwards cancellation and accepts a null revisioned playback result", async () => {
    const controller = new AbortController();
    const request = vi.fn(async (input: { body?: { expectedRevision?: number } }) => input.body?.expectedRevision === undefined
      ? new Response(JSON.stringify(song), { headers: { "content-type": "application/json" } })
      : new Response(JSON.stringify({ version: "music-playback/v1", revision: 8, playbackRevision: 8, song: null }), { headers: { "content-type": "application/json" } }));
    const client = createMusicQueueClient(request);

    await expect(client.setPlaying(3, "legacy-cancel", controller.signal)).resolves.toEqual(song);
    await expect(client.setPlaying(null, "legacy-stop-cancel", controller.signal)).resolves.toBeUndefined();
    await expect(client.setPlayingRevision(null, 0, 0, "revision-cancel", controller.signal))
      .resolves.toEqual({ version: "music-playback/v1", revision: 8, playbackRevision: 8, song: null });
    expect(request.mock.calls.map(([input]) => input)).toEqual([
      { method: "POST", path: "/api/playlist/currently-playing", body: { songId: 3 }, idempotencyKey: "legacy-cancel", signal: controller.signal },
      { method: "POST", path: "/api/playlist/currently-playing", body: { songId: null }, idempotencyKey: "legacy-stop-cancel", signal: controller.signal },
      { method: "POST", path: "/api/playlist/currently-playing", body: { songId: null, expectedRevision: 0, expectedPlaybackRevision: 0 }, idempotencyKey: "revision-cancel", signal: controller.signal },
    ]);
  });

  it("rejects malformed revisioned playback responses", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      version: "music-playback/v2", revision: 8, song: null,
    }), { headers: { "content-type": "application/json" } }));

    await expect(createMusicQueueClient(request).setPlayingRevision(null, 0, 0, "revision-malformed"))
      .rejects.toMatchObject({ status: 502, code: "SERVICE_UNAVAILABLE" });
  });

  it("accepts the full 500-song queue for one bounded bulk removal", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const ids = Array.from({ length: 500 }, (_, index) => index + 1);
    await createMusicQueueClient(request).removeSongs(ids, "remove-500");
    expect(request).toHaveBeenCalledWith({ method: "DELETE", path: "/api/playlist/songs/bulk", body: { songIds: ids }, idempotencyKey: "remove-500" });
    expect(() => createMusicQueueClient(request).removeSongs([...ids, 501], "remove-501"))
      .toThrow(expect.objectContaining({ status: 400, code: "REQUEST_INVALID" }));
  });

  it("accepts a discovery thumbnail at the shared 2048-character limit", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(song), { status: 201 }));
    const thumbnailUrl = "x".repeat(2_048);
    await createMusicQueueClient(request).addSong({ youtubeId: song.youtubeId, title: song.title, artist: song.artist, thumbnailUrl }, "thumbnail-2048");
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ thumbnailUrl }) }));
  });

  it("preserves contained retry metadata", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "QUEUE_REVISION_CONFLICT", retryable: false } }), { status: 409, headers: { "retry-after": "2", "x-request-id": "queue-request" } }));
    await expect(createMusicQueueClient(request).replaceQueue(1, [], "replace-queue-2")).rejects.toMatchObject({ status: 409, upstreamCode: "QUEUE_REVISION_CONFLICT", retryable: false, retryAfterSeconds: undefined, requestId: "queue-request" });
  });

  it.each([
    { youtubeId: "abcdefghijk", title: "Song", artist: "Artist", thumbnailUrl: "https://img", ownerId: 99 },
    { youtubeId: "abcdefghij", title: "Song", artist: "Artist", thumbnailUrl: "https://img" },
    { youtubeId: "abcdefghijkl", title: "Song", artist: "Artist", thumbnailUrl: "https://img" },
  ])("rejects hostile or noncanonical add input before transport %#", async (input) => {
    const request = vi.fn();
    await expect(createMusicQueueClient(request).addSong(input as never, "add-song-safe"))
      .rejects.toMatchObject({ status: 400, code: "REQUEST_INVALID" });
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects nested queue authority before transport", async () => {
    const request = vi.fn();
    await expect(createMusicQueueClient(request).replaceQueue(1, [{ playlistId: 8, songId: 9, username: "other" } as never], "replace-safe"))
      .rejects.toMatchObject({ status: 400, code: "REQUEST_INVALID" });
    expect(request).not.toHaveBeenCalled();
  });

  it("trusts only allowlisted bounded retry metadata", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "RATE_LIMITED", retryable: true } }), { status: 429, headers: { "retry-after": "999999" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "HOSTILE_CODE!", retryable: true } }), { status: 503, headers: { "retry-after": "1" } }));
    await expect(createMusicQueueClient(request).loadDashboard()).rejects.toMatchObject({ upstreamCode: "RATE_LIMITED", retryable: true, retryAfterSeconds: 3_600 });
    await expect(createMusicQueueClient(request).loadDashboard()).rejects.toMatchObject({ upstreamCode: undefined, retryable: false, retryAfterSeconds: undefined });
  });

  it.each([[500, "INTERNAL_ERROR"], [502, "UPSTREAM_MALFORMED"], [503, "DATABASE_UNAVAILABLE"]] as const)("derives retryability for trusted %s %s", async (status, code) => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code, retryable: false } }), { status, headers: { "retry-after": "1" } }));
    await expect(createMusicQueueClient(request).loadDashboard()).rejects.toMatchObject({ upstreamCode: code, retryable: true, retryAfterSeconds: 1 });
  });

  it("does not expose an invalid upstream request identifier", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 503, headers: { "x-request-id": "unsafe request id" } }));
    await expect(createMusicQueueClient(request).loadDashboard()).rejects.toMatchObject({ requestId: undefined });
  });

  it.each([
    { version: "music-queue/v2", revision: 1, songs: [] },
    { version: "music-queue/v1", revision: -1, songs: [] },
    { version: "music-queue/v1", revision: 1, songs: [], extra: true },
    { version: "music-queue/v1", revision: 1, songs: [{ ...song, status: "unknown" }] },
  ])("rejects malformed successful replacement DTO %#", async (body) => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));
    await expect(createMusicQueueClient(request).replaceQueue(1, [], "replace-queue-3"))
      .rejects.toMatchObject({ status: 502, code: "SERVICE_UNAVAILABLE" });
  });
});
