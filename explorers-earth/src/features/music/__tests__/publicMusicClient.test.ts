import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPublicMusicClient,
  derivePublicMusicViewPolicy,
  parsePublicMusicDescriptor,
  parsePublicMusicResource,
  PUBLIC_MUSIC_RESOURCE_MAX_BYTES,
  PublicMusicError,
  type PublicMusicResource,
} from "../publicMusicClient";
import {
  createPublicMusicObservability,
  type PublicMusicBrowserOperationalEvent,
} from "../publicMusicObservability";

const publicSong = {
  id: "S".repeat(43), youtubeId: "abcdefghijk", title: "Song", artist: "Artist",
  thumbnailUrl: "https://img.example/song.jpg", position: 0, status: "queued" as const, playedAt: null,
};

const publicResource = {
  version: "music-public-resource/v1" as const,
  revision: 7,
  user: { username: "display-name", venueName: "Venue" },
  permissions: {
    allowSongRequests: true, allowGuestPlayOnDevice: false, allowPlaylistSharing: true,
    allowRecentlyPlayedVisibility: true, allowQueueVisibility: true,
  },
  currentlyPlaying: { ...publicSong, id: "P".repeat(43), status: "playing" as const },
  queue: { items: [publicSong], total: 1, truncated: false },
  recentlyPlayed: {
    items: [{ ...publicSong, id: "H".repeat(43), status: "played" as const, playedAt: "2026-08-28T12:00:00.000Z" }],
    total: 1, truncated: false,
  },
  playlists: {
    items: [{
      id: "L".repeat(43), name: "Public playlist", description: null,
      songs: {
        items: [{ ...publicSong, id: "V".repeat(43), status: "saved" as const }],
        total: 1, truncated: false,
      },
    }],
    total: 1, truncated: false,
  },
};

const publicDescriptor = {
  version: "music-public-descriptor/v1" as const,
  publication: { mode: "public" as const, publicSlug: "public_slug-123", revision: 7 },
};

const publicVideo = {
  id: { videoId: "abcdefghijk" },
  snippet: {
    title: "Song", channelTitle: "Artist",
    thumbnails: { default: { url: "https://img.example/song.jpg" } },
  },
};

const publicRequestSong = {
  youtubeId: "abcdefghijk", title: "Song", artist: "Artist", thumbnailUrl: "https://img.example/song.jpg",
};

function success(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

it("routes every public operation through the injected fetch transport", async () => {
  const paths: string[] = [];
  const responses = [publicDescriptor, publicResource, { items: [publicVideo], nextPageToken: null }, publicVideo, { accepted: true }];
  const client = createPublicMusicClient("https://music.example", undefined, async (input) => {
    paths.push(String(input));
    return success(responses.shift());
  });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("unexpected global network")));
  expect(await client.discover("account123")).toEqual(publicDescriptor);
  expect(await client.load("public_slug-123")).toEqual(publicResource);
  expect((await client.search("public_slug-123", "song")).items).toEqual([publicVideo]);
  expect(await client.videoFromUrl("public_slug-123", "https://youtu.be/abcdefghijk")).toEqual(publicVideo);
  expect(await client.requestSong("public_slug-123", publicRequestSong, undefined, "request-key-123")).toEqual({ accepted: true });
  expect(paths).toEqual([
    "https://music.example/api/music/public-profile/account123",
    "https://music.example/api/music/public-resource/v1/public_slug-123",
    "https://music.example/api/playlist/public_slug-123/youtube/search",
    "https://music.example/api/playlist/public_slug-123/youtube/video-from-url",
    "https://music.example/api/playlist/public_slug-123/requests",
  ]);
});

function streamedSuccess(chunks: string[], contentLength?: string) {
  const encoder = new TextEncoder();
  let index = 0;
  let cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) controller.close();
      else controller.enqueue(encoder.encode(chunks[index++]));
    },
    cancel() { cancelled = true; },
  }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      ...(contentLength === undefined ? {} : { "content-length": contentLength }),
    },
  });
  return { response, wasCancelled: () => cancelled };
}

function operationalRecorder() {
  const events: PublicMusicBrowserOperationalEvent[] = [];
  return { events, observability: createPublicMusicObservability((event) => events.push(event)) };
}

type ExpectedPublicMusicError = {
  code: PublicMusicError["code"];
  requestId?: string;
  retryAfterSeconds?: number;
  hostileValues: string[];
};

function expectSafePublicMusicError(error: unknown, expected: ExpectedPublicMusicError) {
  expect(error).toBeInstanceOf(PublicMusicError);
  const publicError = error as PublicMusicError & { cause?: unknown };
  const ownEnumerableFields = Object.fromEntries(Object.entries(publicError));
  const jsonSafeProjection = JSON.parse(JSON.stringify(publicError)) as unknown;
  const visibleSurfaces = {
    name: publicError.name,
    message: publicError.message,
    code: publicError.code,
    requestId: publicError.requestId,
    retryAfterSeconds: publicError.retryAfterSeconds,
    cause: publicError.cause,
    ownEnumerableFields,
    jsonSafeProjection,
    stack: publicError.stack,
  };

  for (const hostileValue of expected.hostileValues) {
    expect(JSON.stringify(visibleSurfaces)).not.toContain(hostileValue);
  }
  expect(publicError).toMatchObject({
    name: "PublicMusicError",
    message: expected.code,
    code: expected.code,
    requestId: expected.requestId,
    retryAfterSeconds: expected.retryAfterSeconds,
  });
  expect(Object.keys(ownEnumerableFields).sort()).toEqual([
    "code", "name", "requestId", "retryAfterSeconds",
  ]);
  expect(Object.prototype.hasOwnProperty.call(publicError, "cause")).toBe(false);
  if (publicError.requestId !== undefined) {
    expect(publicError.requestId).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/);
  }
  if (publicError.retryAfterSeconds !== undefined) {
    expect(Number.isFinite(publicError.retryAfterSeconds)).toBe(true);
    expect(publicError.retryAfterSeconds).toBeGreaterThanOrEqual(0);
    expect(publicError.retryAfterSeconds).toBeLessThanOrEqual(300);
  }
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the public Music operation to reject.");
}

describe("public Music client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("rejects an error surrogate that leaks hostile values through secondary surfaces", () => {
    const secret = "secret-surrogate-token";
    const leakingError = Object.assign(new PublicMusicError("PUBLIC_UNAVAILABLE"), {
      cause: { responseBody: secret },
      diagnostic: secret,
    });

    expect(() => expectSafePublicMusicError(leakingError, {
      code: "PUBLIC_UNAVAILABLE", hostileValues: [secret],
    })).toThrow();
  });

  it("uses capability-safe public request endpoints and strict canonical song input", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(success({ items: [publicVideo], nextPageToken: null }))
      .mockResolvedValueOnce(success(publicVideo))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accepted: true }), { status: 201 }));
    vi.stubGlobal("fetch", fetcher);
    const client = createPublicMusicClient("https://music.example");
    await expect(client.search("public_slug-123", " Song ", "a".repeat(43))).resolves.toMatchObject({ items: [publicVideo] });
    await expect(client.videoFromUrl("public_slug-123", "https://youtu.be/abcdefghijk", "a".repeat(43))).resolves.toEqual(publicVideo);
    await expect(client.requestSong("public_slug-123", publicRequestSong, "a".repeat(43), "request-key-12345678"))
      .resolves.toMatchObject({ accepted: true });
    expect(fetcher.mock.calls[0][1]).toMatchObject({ body: JSON.stringify({ query: "Song" }) });
    expect(fetcher.mock.calls[2][1]).toMatchObject({ headers: expect.objectContaining({ "Idempotency-Key": "request-key-12345678" }) });
    expect(JSON.stringify(fetcher.mock.calls)).not.toMatch(/username|ownerId|Authorization|rawQuery/);
  });

  it("rejects invalid public request input before network and normalizes request failures", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "RATE_LIMITED" } }), { status: 429, headers: { "Retry-After": "12" } }));
    vi.stubGlobal("fetch", fetcher);
    const client = createPublicMusicClient("https://music.example");
    await expect(client.search("public_slug-123", " ")).rejects.toMatchObject({ code: "REQUEST_INVALID" });
    await expect(client.search("public_slug-123", "x".repeat(201))).rejects.toMatchObject({ code: "REQUEST_INVALID" });
    await expect(client.videoFromUrl("public_slug-123", "not a url")).rejects.toMatchObject({ code: "REQUEST_INVALID" });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(client.search("public_slug-123", "valid")).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 12 });
  });

  it.each([
    "https://youtube.com.evil.example/watch?v=abcdefghijk",
    "https://youtu.be.evil.example/abcdefghijk",
    "https://youtube.com@evil.example/watch?v=abcdefghijk",
    "https://evil.example/youtube.com/watch?v=abcdefghijk",
    "javascript:alert(1)",
  ])("rejects a lookalike or malformed media URL before transmission: %s", async (url) => {
    const fetchImpl = vi.fn();
    const client = createPublicMusicClient("https://music.example", undefined, fetchImpl);
    await expect(client.videoFromUrl("public_slug-123", url)).rejects.toMatchObject({ code: "REQUEST_INVALID" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [403, "REQUEST_FORBIDDEN"],
    [404, "REQUEST_FORBIDDEN"],
    [409, "REQUEST_INVALID"],
    [413, "QUEUE_FULL"],
    [400, "REQUEST_INVALID"],
    [503, "PUBLIC_UNAVAILABLE"],
  ] as const)("maps request HTTP %i to %s with a sanitized request ID", async (status, code) => {
    // Break caught: request endpoints expose unstable upstream error bodies or drop a safe correlation ID.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret-upstream-body", {
      status,
      headers: { "x-request-id": "request.http-1" },
    })));
    const error = await captureRejection(
      createPublicMusicClient("https://music.example").search("public_slug-123", "valid"),
    );
    expectSafePublicMusicError(error, {
      code, requestId: "request.http-1", hostileValues: ["secret-upstream-body"],
    });
  });

  it.each([
    ["999", 300],
    ["-1", 60],
    ["Infinity", 60],
  ])("bounds request Retry-After %j to %i seconds", async (retryAfter, retryAfterSeconds) => {
    // Break caught: a hostile Retry-After value schedules an unbounded or negative retry.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, {
      status: 429,
      headers: { "retry-after": retryAfter, "x-request-id": "request.retry-1" },
    })));
    const error = await captureRejection(
      createPublicMusicClient("https://music.example").search("public_slug-123", "valid"),
    );
    expectSafePublicMusicError(error, {
      code: "RATE_LIMITED", retryAfterSeconds, requestId: "request.retry-1", hostileValues: [],
    });
  });

  it("drops an unsafe request correlation ID instead of reflecting capability-shaped input", async () => {
    const unsafeRequestId = `secret/${"C".repeat(43)}`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, {
      status: 503,
      headers: { "x-request-id": unsafeRequestId },
    })));
    const capability = "C".repeat(43);
    const error = await captureRejection(
      createPublicMusicClient("https://music.example").search("public_slug-123", "valid", capability),
    );
    expectSafePublicMusicError(error, {
      code: "PUBLIC_UNAVAILABLE", requestId: undefined, hostileValues: [unsafeRequestId, capability],
    });
  });

  it.each([
    ["oversized", () => new Response("x".repeat(64 * 1_024 + 1), { status: 200 }), "size"],
    ["invalid UTF-8", () => new Response(new Uint8Array([0xc3, 0x28]), { status: 200 }), "encoding"],
    ["malformed JSON", () => new Response("{secret-response-token", { status: 200 }), "json"],
    ["missing", () => new Response(null, { status: 200 }), "json"],
  ] as const)("contains a %s request body with safe parser observability", async (_label, responseFactory, reason) => {
    // Break caught: body failures leak transport/parser details or hostile content beyond the public boundary.
    const capability = "C".repeat(43);
    const recorder = operationalRecorder();
    const response = responseFactory();
    response.headers.set("x-request-id", "request.body-1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const error = await captureRejection(createPublicMusicClient("https://music.example", recorder.observability)
      .search("public_slug-123", "valid", capability));
    expectSafePublicMusicError(error, {
      code: "PUBLIC_UNAVAILABLE", requestId: "request.body-1",
      hostileValues: [capability, "secret-response-token"],
    });
    expect(recorder.events).toEqual([{
      version: "music-public-browser-ops/v1", event: "parser_rejected", parser: "request", reason,
    }]);
    expect(JSON.stringify(recorder.events)).not.toMatch(/secret-response-token|CCCCCCCC/);
  });

  it.each([
    ["search slug", async (client: ReturnType<typeof createPublicMusicClient>) => client.search("short", "valid"), "PUBLIC_NOT_FOUND"],
    ["video slug", async (client: ReturnType<typeof createPublicMusicClient>) => client.videoFromUrl("short", "https://youtu.be/abcdefghijk"), "PUBLIC_NOT_FOUND"],
    ["video host", async (client: ReturnType<typeof createPublicMusicClient>) => client.videoFromUrl("public_slug-123", "https://video.example/abcdefghijk"), "REQUEST_INVALID"],
    ["song slug", async (client: ReturnType<typeof createPublicMusicClient>) => client.requestSong("short", publicRequestSong, undefined, "request-key-12345678"), "REQUEST_INVALID"],
    ["idempotency key", async (client: ReturnType<typeof createPublicMusicClient>) => client.requestSong("public_slug-123", publicRequestSong, undefined, "short"), "REQUEST_INVALID"],
    ["canonical song", async (client: ReturnType<typeof createPublicMusicClient>) => client.requestSong("public_slug-123", { ...publicRequestSong, title: "" }, undefined, "request-key-12345678"), "REQUEST_INVALID"],
  ] as const)("rejects invalid request %s before network access", async (_label, invoke, code) => {
    // Break caught: invalid public request input crosses the trust boundary.
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(invoke(createPublicMusicClient("https://music.example"))).rejects.toMatchObject({ code });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["search", success({ items: [], nextPageToken: null, authorityToken: "secret-response-token" })],
    ["video", success({ ...publicVideo, ownerId: "secret-response-token" })],
    ["song request", success({ accepted: false, token: "secret-response-token" })],
  ] as const)("contains an invalid %s response schema with safe observability", async (operation, response) => {
    // Break caught: strict response schemas loosen or log rejected authority-bearing fields.
    const capability = "C".repeat(43);
    const recorder = operationalRecorder();
    response.headers.set("x-request-id", "request.schema-1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const client = createPublicMusicClient("https://music.example", recorder.observability);
    const promise = operation === "search"
      ? client.search("public_slug-123", "valid", capability)
      : operation === "video"
        ? client.videoFromUrl("public_slug-123", "https://youtu.be/abcdefghijk", capability)
        : client.requestSong("public_slug-123", publicRequestSong, capability, "request-key-12345678");
    const error = await captureRejection(promise);
    expectSafePublicMusicError(error, {
      code: "PUBLIC_UNAVAILABLE", requestId: "request.schema-1",
      hostileValues: [capability, "secret-response-token"],
    });
    expect(recorder.events).toEqual([{
      version: "music-public-browser-ops/v1", event: "parser_rejected", parser: "request", reason: "schema",
    }]);
    expect(JSON.stringify(recorder.events)).not.toMatch(/secret-response-token|CCCCCCCC/);
  });

  it("strictly parses the stable public descriptor without accepting authority aliases", () => {
    expect(parsePublicMusicDescriptor(publicDescriptor)).toEqual(publicDescriptor);
    expect(() => parsePublicMusicDescriptor({ ...publicDescriptor, publication: { ...publicDescriptor.publication, publicSlug: "short" } })).toThrow();
    expect(() => parsePublicMusicDescriptor({ ...publicDescriptor, publication: { ...publicDescriptor.publication, revision: -1 } })).toThrow();
    expect(() => parsePublicMusicDescriptor({ ...publicDescriptor, publication: { ...publicDescriptor.publication, userId: 9 } })).toThrow();
  });

  it.each([
    [0, false, false, false, false, false, false],
    [1, true, false, false, false, false, false],
    [2, false, true, false, false, false, true],
    [3, true, true, false, false, false, true],
    [4, false, false, true, false, false, false],
    [5, true, false, true, false, false, false],
    [6, false, true, true, false, false, true],
    [7, true, true, true, false, false, true],
    [8, false, false, false, true, false, false],
    [9, true, false, false, true, false, false],
    [10, false, true, false, true, false, true],
    [11, true, true, false, true, false, true],
    [12, false, false, true, true, false, false],
    [13, true, false, true, true, false, false],
    [14, false, true, true, true, false, true],
    [15, true, true, true, true, false, true],
    [16, false, false, false, false, true, true],
    [17, true, false, false, false, true, true],
    [18, false, true, false, false, true, true],
    [19, true, true, false, false, true, true],
    [20, false, false, true, false, true, true],
    [21, true, false, true, false, true, true],
    [22, false, true, true, false, true, true],
    [23, true, true, true, false, true, true],
    [24, false, false, false, true, true, true],
    [25, true, false, false, true, true, true],
    [26, false, true, false, true, true, true],
    [27, true, true, false, true, true, true],
    [28, false, false, true, true, true, true],
    [29, true, false, true, true, true, true],
    [30, false, true, true, true, true, true],
    [31, true, true, true, true, true, true],
  ] as const)("derives data visibility and interactivity independently for permission mask %i", (
    mask,
    requestEligible,
    playerEligible,
    playlistsVisible,
    historyVisible,
    queueVisible,
    currentVisible,
  ) => {
    // Break caught: one permission grants another field/control, especially queue visibility granting playback.
    const permissions = {
      allowSongRequests: (mask & 1) !== 0,
      allowGuestPlayOnDevice: (mask & 2) !== 0,
      allowPlaylistSharing: (mask & 4) !== 0,
      allowRecentlyPlayedVisibility: (mask & 8) !== 0,
      allowQueueVisibility: (mask & 16) !== 0,
    };
    expect(derivePublicMusicViewPolicy({ ...publicResource, permissions })).toEqual({
      requestEligible,
      playerEligible,
      playlistsVisible,
      historyVisible,
      queueVisible,
      currentVisible,
    });
  });

  it.each([
    ["current-only", {
      currentlyPlaying: publicResource.currentlyPlaying,
      queue: { items: [], total: 0, truncated: false },
      playlists: { items: [], total: 0, truncated: false },
    }],
    ["queue-only", {
      currentlyPlaying: null,
      queue: publicResource.queue,
      playlists: { items: [], total: 0, truncated: false },
    }],
    ["playlist-only", {
      currentlyPlaying: null,
      queue: { items: [], total: 0, truncated: false },
      playlists: publicResource.playlists,
    }],
  ] as const)("enables the player for an exposed %s playable source", (_label, content) => {
    expect(derivePublicMusicViewPolicy({
      ...publicResource,
      ...content,
      permissions: {
        ...publicResource.permissions,
        allowGuestPlayOnDevice: true,
        allowQueueVisibility: true,
        allowPlaylistSharing: true,
      },
    })).toMatchObject({ playerEligible: true });
  });

  it("requires at least one exposed playable source before enabling the player", () => {
    // Break caught: playback permission alone renders a player without exposed playable data.
    expect(derivePublicMusicViewPolicy({
      ...publicResource,
      currentlyPlaying: null,
      queue: { items: [], total: 0, truncated: false },
      playlists: { items: [], total: 0, truncated: false },
      permissions: { ...publicResource.permissions, allowGuestPlayOnDevice: true, allowQueueVisibility: true },
    })).toMatchObject({ requestEligible: true, playerEligible: false, currentVisible: false, queueVisible: true });
  });

  it("does not let protected malicious data contribute to visibility or player eligibility", () => {
    // Break caught: denied queue/playlist payloads manufacture playback eligibility downstream.
    expect(derivePublicMusicViewPolicy({
      ...publicResource,
      currentlyPlaying: null,
      permissions: {
        ...publicResource.permissions,
        allowGuestPlayOnDevice: true,
        allowQueueVisibility: false,
        allowPlaylistSharing: false,
        allowRecentlyPlayedVisibility: false,
      },
    } as PublicMusicResource)).toEqual({
      requestEligible: true,
      playerEligible: false,
      currentVisible: false,
      queueVisible: false,
      historyVisible: false,
      playlistsVisible: false,
    });
    expect(derivePublicMusicViewPolicy({
      ...publicResource,
      permissions: {
        ...publicResource.permissions,
        allowGuestPlayOnDevice: false,
        allowQueueVisibility: false,
        allowPlaylistSharing: false,
      },
    } as PublicMusicResource)).toMatchObject({
      playerEligible: false,
      currentVisible: false,
      queueVisible: false,
      playlistsVisible: false,
    });
  });

  it("reads the additive versioned resource without owner authority or browser persistence", async () => {
    const fetcher = vi.fn().mockResolvedValue(success(publicResource));
    vi.stubGlobal("fetch", fetcher);
    const localGet = vi.spyOn(localStorage, "getItem");
    const sessionGet = vi.spyOn(sessionStorage, "getItem");

    await expect(createPublicMusicClient("https://music.example").load("public_slug-123")).resolves.toEqual(publicResource);

    expect(fetcher).toHaveBeenCalledWith("https://music.example/api/music/public-resource/v1/public_slug-123", {
      headers: { Accept: "application/json" },
    });
    expect(localGet).not.toHaveBeenCalled();
    expect(sessionGet).not.toHaveBeenCalled();
  });

  it.each([
    ["discover", "supplied"],
    ["discover", "omitted"],
    ["search", "supplied"],
    ["search", "omitted"],
    ["videoFromUrl", "supplied"],
    ["videoFromUrl", "omitted"],
  ] as const)("builds %s fetch init with an %s AbortSignal", async (operation, signalMode) => {
    // Break caught: a caller signal is lost, synthesized when omitted, or leaks into transport data.
    const signalMarker = "secret-signal-data";
    const controller = new AbortController();
    (controller.signal as AbortSignal & { marker: string }).marker = signalMarker;
    const signal = signalMode === "supplied" ? controller.signal : undefined;
    const response = operation === "discover"
      ? success(publicDescriptor)
      : operation === "search"
        ? success({ items: [publicVideo], nextPageToken: null })
        : success(publicVideo);
    const fetcher = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetcher);
    const client = createPublicMusicClient("https://music.example");

    if (operation === "discover") await client.discover("account-document-id", signal);
    else if (operation === "search") await client.search("public_slug-123", " valid ", undefined, signal);
    else await client.videoFromUrl("public_slug-123", "https://youtu.be/abcdefghijk", undefined, signal);

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    const expectedUrl = operation === "discover"
      ? "https://music.example/api/music/public-profile/account-document-id"
      : operation === "search"
        ? "https://music.example/api/playlist/public_slug-123/youtube/search"
        : "https://music.example/api/playlist/public_slug-123/youtube/video-from-url";
    const expectedInit = operation === "discover"
      ? { headers: { Accept: "application/json" } }
      : {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: operation === "search"
            ? JSON.stringify({ query: "valid" })
            : JSON.stringify({ url: "https://youtu.be/abcdefghijk" }),
        };
    expect(url).toBe(expectedUrl);
    expect(init).toEqual({ ...expectedInit, ...(signal ? { signal } : {}) });
    if (signal) expect(init.signal).toBe(controller.signal);
    else {
      expect(init).not.toHaveProperty("signal");
      expect(JSON.stringify(init)).not.toContain('"signal"');
    }
    expect(url).not.toContain(signalMarker);
    expect(String(init.body ?? "")).not.toContain(signalMarker);
  });

  it.each(["", "account/document", "x".repeat(256)])(
    "rejects invalid descriptor account ID %j before network access",
    async (accountDocumentId) => {
      // Break caught: authority-bearing or oversized account identifiers reach the public endpoint.
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      await expect(createPublicMusicClient("https://music.example").discover(accountDocumentId))
        .rejects.toMatchObject({ code: "PUBLIC_NOT_FOUND" });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each([
    [403, "PUBLIC_NOT_FOUND", undefined],
    [404, "PUBLIC_NOT_FOUND", undefined],
    [429, "RATE_LIMITED", 300],
    [503, "PUBLIC_UNAVAILABLE", undefined],
  ] as const)("maps descriptor HTTP %i to %s with a sanitized request ID", async (status, code, retryAfterSeconds) => {
    // Break caught: public discovery exposes upstream status details or trusts an unbounded retry value.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, {
      status,
      headers: { "x-request-id": "descriptor.request-1", "retry-after": "999" },
    })));
    const error = await captureRejection(
      createPublicMusicClient("https://music.example").discover("account-document-id"),
    );
    expectSafePublicMusicError(error, {
      code, requestId: "descriptor.request-1", retryAfterSeconds, hostileValues: [],
    });
  });

  it("drops an unsafe descriptor request ID instead of reflecting it", async () => {
    const unsafeRequestId = `secret/${"C".repeat(43)}`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, {
      status: 503,
      headers: { "x-request-id": unsafeRequestId },
    })));
    const error = await captureRejection(
      createPublicMusicClient("https://music.example").discover("account-document-id"),
    );
    expectSafePublicMusicError(error, {
      code: "PUBLIC_UNAVAILABLE", requestId: undefined, hostileValues: [unsafeRequestId, "C".repeat(43)],
    });
  });

  it.each([
    ["malformed JSON", new Response("{secret-capability-token", { status: 200 }), "json"],
    ["invalid schema", success({ ...publicDescriptor, publication: { ...publicDescriptor.publication, mode: "private" }, ownerToken: "secret-capability-token" }), "schema"],
  ] as const)("contains descriptor %s with safe parser observability", async (_label, response, reason) => {
    // Break caught: descriptor parser failures escape their public error boundary or log hostile response data.
    const recorder = operationalRecorder();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const error = await captureRejection(
      createPublicMusicClient("https://music.example", recorder.observability).discover("account-document-id"),
    );
    expectSafePublicMusicError(error, {
      code: "PUBLIC_UNAVAILABLE", hostileValues: ["secret-capability-token"],
    });
    expect(recorder.events).toEqual([{
      version: "music-public-browser-ops/v1", event: "parser_rejected", parser: "descriptor", reason,
    }]);
    expect(JSON.stringify(recorder.events)).not.toContain("secret-capability-token");
  });

  it("keeps an unlisted capability out of the URL and sends no owner credential", async () => {
    const fetcher = vi.fn().mockResolvedValue(success(publicResource));
    vi.stubGlobal("fetch", fetcher);
    await createPublicMusicClient("https://music.example/").load("public_slug-123", "a".repeat(43));
    expect(fetcher).toHaveBeenCalledWith("https://music.example/api/music/public-resource/v1/public_slug-123", {
      headers: { Accept: "application/json", "X-Music-Guest-Capability": "a".repeat(43) },
    });
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain("Authorization");
  });

  it.each([403, 404])("normalizes HTTP %s to the same public 404", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status })));
    await expect(createPublicMusicClient("https://music.example").load("public_slug-123"))
      .rejects.toMatchObject({ code: "PUBLIC_NOT_FOUND" });
  });

  it("rejects malformed slugs before the network and ignores malformed capabilities", async () => {
    const fetcher = vi.fn().mockResolvedValue(success(publicResource));
    vi.stubGlobal("fetch", fetcher);
    const client = createPublicMusicClient("https://music.example");
    await expect(client.load("short")).rejects.toMatchObject({ code: "PUBLIC_NOT_FOUND" });
    await client.load("public_slug-123", "not-a-capability");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("https://music.example/api/music/public-resource/v1/public_slug-123", {
      headers: { Accept: "application/json" },
    });
  });

  it("rejects unknown keys and any legacy optional-permission success shape", () => {
    for (const malformed of [
      { ...publicResource, internal: true },
      { ...publicResource, permissions: undefined },
      { songs: [], playlists: [], allowQueueVisibility: true },
      { ...publicResource, permissions: { ...publicResource.permissions, allowQueueVisibility: undefined } },
      { ...publicResource, permissions: { ...publicResource.permissions, userId: 17 } },
      { ...publicResource, user: { ...publicResource.user, documentId: "account-secret" } },
      { ...publicResource, queue: { ...publicResource.queue, items: [{ ...publicSong, credential: "secret" }] } },
    ]) expect(() => parsePublicMusicResource(malformed)).toThrow();
  });

  it("accepts empty playlist descriptions and canonical nullable thumbnails", () => {
    const legacySafeResource = {
      ...publicResource,
      currentlyPlaying: { ...publicResource.currentlyPlaying!, thumbnailUrl: null },
      queue: { ...publicResource.queue, items: [{ ...publicSong, thumbnailUrl: null }] },
      playlists: {
        ...publicResource.playlists,
        items: [{
          ...publicResource.playlists.items[0],
          description: "",
          songs: { ...publicResource.playlists.items[0].songs, items: [{ ...publicResource.playlists.items[0].songs.items[0], thumbnailUrl: null }] },
        }],
      },
    };
    expect(parsePublicMusicResource(legacySafeResource)).toEqual(legacySafeResource);
    expect(() => parsePublicMusicResource({
      ...publicResource,
      currentlyPlaying: { ...publicResource.currentlyPlaying!, thumbnailUrl: "legacy-thumbnail" },
    })).toThrow();
  });

  it("rejects oversized collections, invalid public song IDs/status, and inconsistent envelopes", () => {
    const queue101 = Array.from({ length: 101 }, (_, index) => ({
      ...publicSong, id: index.toString(36).padStart(43, "A"), position: index,
    }));
    for (const malformed of [
      { ...publicResource, queue: { items: queue101, total: 101, truncated: false } },
      { ...publicResource, recentlyPlayed: { items: Array(51).fill(publicResource.recentlyPlayed.items[0]), total: 51, truncated: false } },
      { ...publicResource, playlists: { items: Array(21).fill(publicResource.playlists.items[0]), total: 21, truncated: false } },
      { ...publicResource, queue: { items: [{ ...publicSong, id: 9 }], total: 1, truncated: false } },
      { ...publicResource, queue: { items: [{ ...publicSong, id: "short" }], total: 1, truncated: false } },
      { ...publicResource, queue: { items: [{ ...publicSong, status: "played" }], total: 1, truncated: false } },
      { ...publicResource, currentlyPlaying: { ...publicResource.currentlyPlaying!, playedAt: "2026-08-28T12:00:00.000Z" } },
      { ...publicResource, queue: { items: [{ ...publicSong, playedAt: "2026-08-28T12:00:00.000Z" }], total: 1, truncated: false } },
      { ...publicResource, playlists: { ...publicResource.playlists, items: [{ ...publicResource.playlists.items[0], songs: { items: [{ ...publicResource.playlists.items[0].songs.items[0], playedAt: "2026-08-28T12:00:00.000Z" }], total: 1, truncated: false } }] } },
      { ...publicResource, queue: { items: [publicSong], total: 0, truncated: false } },
      { ...publicResource, queue: { items: [publicSong], total: 2, truncated: false } },
    ]) expect(() => parsePublicMusicResource(malformed)).toThrow();
  });

  it.each([
    ["fewer playlist rows than advertised", { ...publicResource.playlists, total: 2 }],
    ["more playlist rows than advertised", { ...publicResource.playlists, total: 0 }],
  ])("rejects %s", (_label, playlists) => {
    // Break caught: a playlist envelope can lie about pagination state.
    expect(() => parsePublicMusicResource({ ...publicResource, playlists })).toThrow();
  });

  it.each([
    ["non-played history status", { ...publicResource.recentlyPlayed.items[0], status: "queued" }],
    ["missing history timestamp", { ...publicResource.recentlyPlayed.items[0], playedAt: null }],
  ])("rejects %s", (_label, historySong) => {
    // Break caught: history accepts a song that was not verifiably played.
    expect(() => parsePublicMusicResource({
      ...publicResource,
      recentlyPlayed: { items: [historySong], total: 1, truncated: false },
    })).toThrow();
  });

  it.each([
    ["queue", { currentlyPlaying: null, queue: { items: [], total: 0, truncated: false } }],
    ["history", { recentlyPlayed: { items: [], total: 0, truncated: false } }],
    ["playlists", { playlists: { items: [], total: 0, truncated: false } }],
  ])("accepts an empty protected %s envelope", (permission, resourcePatch) => {
    // Break caught: a disabled permission rejects the canonical empty representation.
    const permissions = {
      ...publicResource.permissions,
      ...(permission === "queue" ? { allowQueueVisibility: false } : {}),
      ...(permission === "history" ? { allowRecentlyPlayedVisibility: false } : {}),
      ...(permission === "playlists" ? { allowPlaylistSharing: false } : {}),
    };
    expect(() => parsePublicMusicResource({ ...publicResource, ...resourcePatch, permissions })).not.toThrow();
  });

  it("rejects protected data when its permission is false", () => {
    expect(() => parsePublicMusicResource({
      ...publicResource,
      permissions: { ...publicResource.permissions, allowQueueVisibility: false, allowGuestPlayOnDevice: false },
    })).toThrow();
    expect(() => parsePublicMusicResource({
      ...publicResource, permissions: { ...publicResource.permissions, allowPlaylistSharing: false },
    })).toThrow();
    expect(() => parsePublicMusicResource({
      ...publicResource, permissions: { ...publicResource.permissions, allowRecentlyPlayedVisibility: false },
    })).toThrow();
  });

  it("contains malformed, non-JSON, and oversized successful responses as public unavailability", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(success({ ...publicResource, revision: Number.MAX_SAFE_INTEGER + 1 }))
      .mockResolvedValueOnce(new Response("not-json", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...publicResource, padding: "x".repeat(512 * 1024) }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const client = createPublicMusicClient("https://music.example");
    await expect(client.load("public_slug-123")).rejects.toMatchObject({ code: "PUBLIC_UNAVAILABLE" });
    await expect(client.load("public_slug-123")).rejects.toMatchObject({ code: "PUBLIC_UNAVAILABLE" });
    await expect(client.load("public_slug-123")).rejects.toMatchObject({ code: "PUBLIC_UNAVAILABLE" });
  });

  it("rejects oversized Content-Length before reading the response stream", async () => {
    const streamed = streamedSuccess([JSON.stringify(publicResource)], String(PUBLIC_MUSIC_RESOURCE_MAX_BYTES + 1));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamed.response));
    const recorder = operationalRecorder();

    const error = await captureRejection(
      createPublicMusicClient("https://music.example", recorder.observability).load("public_slug-123"),
    );
    expectSafePublicMusicError(error, {
      code: "PUBLIC_UNAVAILABLE", hostileValues: [],
    });
    expect(streamed.wasCancelled()).toBe(true);
    expect(recorder.events).toEqual([{
      version: "music-public-browser-ops/v1", event: "parser_rejected", parser: "resource", reason: "size",
    }]);
  });

  it("cancels a chunked response as soon as a lying small Content-Length crosses the byte limit", async () => {
    const streamed = streamedSuccess(["x".repeat(PUBLIC_MUSIC_RESOURCE_MAX_BYTES), "y", "unread-tail"], "1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamed.response));

    await expect(createPublicMusicClient("https://music.example").load("public_slug-123"))
      .rejects.toMatchObject({ code: "PUBLIC_UNAVAILABLE" });
    expect(streamed.wasCancelled()).toBe(true);
  });

  it("counts multibyte UTF-8 bytes instead of JavaScript characters while streaming", async () => {
    const streamed = streamedSuccess(["😀".repeat(70_000), "😀".repeat(70_000), "unread-tail"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamed.response));

    await expect(createPublicMusicClient("https://music.example").load("public_slug-123"))
      .rejects.toMatchObject({ code: "PUBLIC_UNAVAILABLE" });
    expect(streamed.wasCancelled()).toBe(true);
  });

  it("classifies invalid UTF-8 without leaking response content into observability", async () => {
    const secret = "secret-capability-token";
    const recorder = operationalRecorder();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      new Uint8Array([0xc3, 0x28, ...new TextEncoder().encode(secret)]),
      { status: 200 },
    )));

    const error = await captureRejection(
      createPublicMusicClient("https://music.example", recorder.observability).load("public_slug-123"),
    );
    expectSafePublicMusicError(error, {
      code: "PUBLIC_UNAVAILABLE", hostileValues: [secret],
    });
    expect(recorder.events).toEqual([{
      version: "music-public-browser-ops/v1", event: "parser_rejected", parser: "resource", reason: "encoding",
    }]);
    expect(JSON.stringify(recorder.events)).not.toContain(secret);
  });

  it("contains rate limits with parsed or default retry durations", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "17" } }))
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "later" } }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }));
    vi.stubGlobal("fetch", fetcher);
    const client = createPublicMusicClient("https://music.example");
    await expect(client.load("public_slug-123")).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 17 });
    await expect(client.load("public_slug-123")).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 60 });
    await expect(client.load("public_slug-123")).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 60 });
  });

  it("contains other upstream failures and rejects insecure non-local service URLs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(createPublicMusicClient("http://localhost:5174/").load("public_slug-123"))
      .rejects.toMatchObject({ code: "PUBLIC_UNAVAILABLE" });
    expect(() => createPublicMusicClient("http://music.example")).toThrow("must use HTTPS");
  });

  it("keys an acquisition to its caller lifecycle and forwards the AbortSignal to fetch", async () => {
    const fetcher = vi.fn().mockResolvedValue(success(publicResource));
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    await createPublicMusicClient("https://music.example").load("public_slug-123", "a".repeat(43), controller.signal);
    expect(fetcher).toHaveBeenCalledWith("https://music.example/api/music/public-resource/v1/public_slug-123", {
      headers: { Accept: "application/json", "X-Music-Guest-Capability": "a".repeat(43) }, signal: controller.signal,
    });
  });

  it.each([
    ["configured", "https://configured-music.example/", "https://configured-music.example"],
    ["packaged default", "", "https://localtunes.earth"],
  ])("uses the %s module base without leaking it into resource data", async (_label, configuredBase, expectedBase) => {
    // Break caught: the singleton ignores deployment configuration or loses its safe packaged fallback.
    vi.stubEnv("VITE_LOCAL_TUNES_API_URL", configuredBase);
    vi.stubEnv("DEV", false);
    vi.resetModules();
    const fetcher = vi.fn().mockResolvedValue(success(publicResource));
    vi.stubGlobal("fetch", fetcher);
    const { publicMusicClient: moduleClient } = await import("../publicMusicClient");

    const resource = await moduleClient.load("public_slug-123");
    expect(resource).toEqual(publicResource);
    expect(fetcher).toHaveBeenCalledWith(`${expectedBase}/api/music/public-resource/v1/public_slug-123`, {
      headers: { Accept: "application/json" },
    });
    expect(JSON.stringify(resource)).not.toContain(expectedBase);
  });

  it.each([
    ["production", false, "https://configured-music.example"],
    ["development proxy", true, "/__localtunes"],
  ] as const)("forwards all singleton operations through the %s transport", async (_label, development, prefix) => {
    vi.stubEnv("VITE_LOCAL_TUNES_API_URL", "https://configured-music.example/");
    vi.stubEnv("DEV", development);
    vi.resetModules();
    const staleFetch = vi.fn().mockRejectedValue(new Error("fetch captured during import"));
    vi.stubGlobal("fetch", staleFetch);
    const { publicMusicClient: moduleClient } = await import("../publicMusicClient");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(success(publicDescriptor))
      .mockResolvedValueOnce(success(publicResource))
      .mockResolvedValueOnce(success({ items: [publicVideo], nextPageToken: null }))
      .mockResolvedValueOnce(success(publicVideo))
      .mockResolvedValueOnce(success({ accepted: true }));
    vi.stubGlobal("fetch", fetcher);
    const signal = new AbortController().signal;
    const capability = "a".repeat(43);
    const headers = { Accept: "application/json", "Content-Type": "application/json", "X-Music-Guest-Capability": capability };

    expect(await moduleClient.discover("account123", signal)).toEqual(publicDescriptor);
    expect(await moduleClient.load("public_slug-123", capability, signal)).toEqual(publicResource);
    expect(await moduleClient.search("public_slug-123", "  song  ", capability, signal)).toEqual({ items: [publicVideo], nextPageToken: null });
    expect(await moduleClient.videoFromUrl("public_slug-123", "https://youtu.be/abcdefghijk", capability, signal)).toEqual(publicVideo);
    expect(await moduleClient.requestSong("public_slug-123", publicRequestSong, capability, "request-key-123")).toEqual({ accepted: true });

    expect(staleFetch).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(fetcher).toHaveBeenNthCalledWith(1, `${prefix}/api/music/public-profile/account123`, { headers: { Accept: "application/json" }, signal });
    expect(fetcher).toHaveBeenNthCalledWith(2, `${prefix}/api/music/public-resource/v1/public_slug-123`, { headers: { Accept: "application/json", "X-Music-Guest-Capability": capability }, signal });
    expect(fetcher).toHaveBeenNthCalledWith(3, `${prefix}/api/playlist/public_slug-123/youtube/search`, { method: "POST", headers, body: JSON.stringify({ query: "song" }), signal });
    expect(fetcher).toHaveBeenNthCalledWith(4, `${prefix}/api/playlist/public_slug-123/youtube/video-from-url`, { method: "POST", headers, body: JSON.stringify({ url: "https://youtu.be/abcdefghijk" }), signal });
    expect(fetcher).toHaveBeenNthCalledWith(5, `${prefix}/api/playlist/public_slug-123/requests`, { method: "POST", headers: { ...headers, "Idempotency-Key": "request-key-123" }, body: JSON.stringify(publicRequestSong) });
  });
});
