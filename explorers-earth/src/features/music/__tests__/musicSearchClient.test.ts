import { describe, expect, it, vi } from "vitest";
import { createMusicSearchClient } from "../musicSearchClient";

describe("credential-aware Music search client", () => {
  it("uses only the currently supported canonical YouTube requests", async () => {
    const video = { id: { videoId: "abcdefghijk" }, snippet: { title: "Song", channelTitle: "Artist", thumbnails: { default: { url: "https://img" } } } };
    const request = vi.fn(async (input: { path: string }) => new Response(JSON.stringify(input.path.endsWith("search") ? { items: [video], nextPageToken: "next" } : video)));
    const client = createMusicSearchClient(request);
    await expect(client.searchYouTube(" road music ", "page-2")).resolves.toEqual({ items: [video], nextPageToken: "next" });
    await expect(client.videoFromUrl("https://youtu.be/abcdefghijk")).resolves.toEqual(video);

    expect(request.mock.calls.map(([input]) => input)).toEqual([
      { method: "POST", path: "/api/youtube/search", body: { query: " road music ", pageToken: "page-2" } },
      { method: "POST", path: "/api/youtube/video-from-url", body: { url: "https://youtu.be/abcdefghijk" } },
    ]);
    expect(JSON.stringify(request.mock.calls)).not.toMatch(/username|email|ownerId|accountId|documentId|musicUserId/i);
  });

  it.each([
    { items: [], nextPageToken: null, extra: true },
    { items: new Array(21).fill({ id: { videoId: "abcdefghijk" }, snippet: { title: "t", channelTitle: "a", thumbnails: { default: { url: "https://img" } } } }), nextPageToken: null },
    { items: [{ id: { videoId: "short" }, snippet: { title: "t", channelTitle: "a", thumbnails: { default: { url: "https://img" } } } }], nextPageToken: null },
  ])("rejects malformed successful search DTO %#", async (body) => {
    const secret = "must-not-leak";
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...body, secret })));
    const error = await createMusicSearchClient(request).searchYouTube("music").catch((cause) => cause);
    expect(error).toMatchObject({ status: 502, code: "SERVICE_UNAVAILABLE" });
    expect(error.message).not.toContain(secret);
  });

  it("contains unsuccessful search responses", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "RATE_LIMITED", retryable: true } }), { status: 429, headers: { "retry-after": "7", "x-request-id": "search-request" } }));
    await expect(createMusicSearchClient(request).searchYouTube("music")).rejects.toMatchObject({ status: 429, upstreamCode: "RATE_LIMITED", retryable: true, retryAfterSeconds: 7, requestId: "search-request" });
  });

  it("rejects a malformed successful video DTO without reflecting it", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: { videoId: "short" }, snippet: { title: "secret" } })));
    const error = await createMusicSearchClient(request).videoFromUrl("https://youtu.be/abcdefghijk").catch((cause) => cause);
    expect(error).toMatchObject({ status: 502, code: "SERVICE_UNAVAILABLE" });
    expect(error.message).not.toContain("secret");
  });

  it.each([
    [{ query: "music", ownerId: 7 }, "searchYouTube"],
    [{ url: "https://youtu.be/abcdefghijk", username: "other" }, "videoFromUrl"],
  ])("rejects hostile %s input before transport", async (input, method) => {
    const request = vi.fn();
    const client = createMusicSearchClient(request);
    const call = method === "searchYouTube"
      ? client.searchYouTube(input as never)
      : client.videoFromUrl(input as never);
    await expect(call).rejects.toMatchObject({ status: 400, code: "REQUEST_INVALID" });
    expect(request).not.toHaveBeenCalled();
  });
});
