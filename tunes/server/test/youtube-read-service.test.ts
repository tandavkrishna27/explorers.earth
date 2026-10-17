import { describe, expect, it, vi } from "vitest";
import { createYouTubeReadService } from "../services/youtubeReadService";

describe("typed YouTube read service", () => {
  it.each([
    "https://youtube.com.evil.example/watch?v=abcdefghijk",
    "https://youtu.be.evil.example/abcdefghijk",
    "https://youtube.com@evil.example/watch?v=abcdefghijk",
    "https://evil.example/youtube.com/watch?v=abcdefghijk",
    "not-a-url",
  ])("does not call upstream for lookalike or malformed URL %s", async (url) => {
    const fetchImpl = vi.fn();
    const service = createYouTubeReadService("fixture-only-key", fetchImpl);
    await expect(service.videoFromUrl(url)).resolves.toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("aborts a stalled upstream connection within five seconds", async () => {
    vi.useFakeTimers();
    try {
      const service = createYouTubeReadService("server-secret", ((_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as typeof fetch);
      const result = service.search({ query: "music" });
      const assertion = expect(result).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
      await vi.advanceTimersByTimeAsync(5_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels non-success and oversized upstream streams", async () => {
    for (const fixture of [
      { status: 503, chunks: [new Uint8Array([1])] },
      { status: 200, chunks: [new Uint8Array(128 * 1024), new Uint8Array([1])] },
    ] as const) {
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        start(controller) { for (const chunk of fixture.chunks) controller.enqueue(chunk); },
        cancel() { cancelled = true; },
      });
      const service = createYouTubeReadService("server-secret", async () => new Response(body, { status: fixture.status }));
      await expect(service.search({ query: "music" })).rejects.toMatchObject({
        code: fixture.status === 503 ? "UPSTREAM_UNAVAILABLE" : "UPSTREAM_MALFORMED",
      });
      expect(cancelled).toBe(true);
    }
  });

  it("returns only the product search fields and never exposes service authority", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      nextPageToken: "next",
      items: [{ id: { videoId: "abcdefghijk", channelId: "drop" }, snippet: {
        title: "title", channelTitle: "artist", description: "drop",
        thumbnails: { default: { url: "https://img", width: 120, height: 90 } },
      } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const service = createYouTubeReadService("server-secret", fetchImpl as typeof fetch);
    await expect(service.search({ query: "music", pageToken: "next" })).resolves.toEqual({
      nextPageToken: "next",
      items: [{ id: { videoId: "abcdefghijk" }, snippet: {
        title: "title", channelTitle: "artist", thumbnails: { default: { url: "https://img" } },
      } }],
    });
    expect(String(fetchImpl.mock.calls[0][0])).toContain("key=server-secret");
    const requestUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(requestUrl.searchParams.get("type")).toBe("video");
    expect(requestUrl.searchParams.get("videoEmbeddable")).toBe("true");
    expect(requestUrl.searchParams.get("videoSyndicated")).toBe("true");
  });

  it("extracts an exact video ID and maps the typed video response", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      items: [{ id: "abcdefghijk", snippet: {
        title: "title", channelTitle: "artist", thumbnails: { default: { url: "https://img" } },
      }, status: { embeddable: true } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const service = createYouTubeReadService("server-secret", fetchImpl as typeof fetch);
    await expect(service.videoFromUrl("https://youtu.be/abcdefghijk")).resolves.toMatchObject({ id: { videoId: "abcdefghijk" } });
    const requestUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(requestUrl.searchParams.get("part")).toBe("snippet,status");
    await expect(service.videoFromUrl("https://example.com/abcdefghijk")).resolves.toBeUndefined();
  });

  it("does not make a non-embeddable pasted video selectable", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      items: [{ id: "abcdefghijk", snippet: {
        title: "title", channelTitle: "artist", thumbnails: { default: { url: "https://img" } },
      }, status: { embeddable: false } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const service = createYouTubeReadService("server-secret", fetchImpl as typeof fetch);

    await expect(service.videoFromUrl("https://youtube.com/watch?v=abcdefghijk")).resolves.toBeUndefined();
  });
});
