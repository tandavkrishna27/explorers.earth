import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearPublicMusicAnalyticsReceiptsForTests, usePublicMusicProductAnalytics } from "../publicMusicAnalytics";

describe("usePublicMusicProductAnalytics", () => {
  it('freezes the minimal event and attribution after ambiguous acknowledgement',async()=>{
    const track=vi.fn().mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce(undefined);
    const hook=renderHook(()=>usePublicMusicProductAnalytics({publicSlug:'public-owner',route:'direct',client:{track}}));
    const event={name:'request_submitted',outcome:'accepted'} as const;
    await act(async()=>{await hook.result.current(event,'immutable-occurrence-123');});
    const initial=JSON.stringify(track.mock.calls[0][0]);sessionStorage.clear();window.history.replaceState({},'', '/alice/music?utm_source=changed');
    await act(async()=>{await hook.result.current({name:'request_submitted',outcome:'forbidden'},'immutable-occurrence-123');});
    expect(JSON.stringify(track.mock.calls[1][0])).toBe(initial);expect(initial).not.toContain('timestamp');
  });
  it("delivers consented default-client events through the Music proxy in development", async () => {
    vi.stubEnv("DEV", true);
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      requests.push(String(input)); return new Response(null, { status: 201 });
    });
    try {
      const { result } = renderHook(() => usePublicMusicProductAnalytics({ publicSlug: "public-owner", route: "friendly" }));
      await act(async () => { await result.current({ name: "playlist_opened" }, "proxy-occurrence-123"); });
      expect(requests).toEqual(["/__localtunes/api/explorers/analytics/music/public-owner/events"]);
    } finally { vi.unstubAllGlobals(); }
  });
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.setItem("explorers-cookie-consent", JSON.stringify({ necessary: true, analytics: true }));
    window.history.replaceState({}, "", "/alice/music?utm_source=newsletter&utm_medium=email");
    clearPublicMusicAnalyticsReceiptsForTests();
  });

  it("deduplicates one opaque occurrence but records a later identical action", async () => {
    const track = vi.fn(async () => undefined);
    const { result } = renderHook(() => usePublicMusicProductAnalytics({
      publicSlug: "public-owner", route: "friendly", client: { track },
    }), { wrapper: StrictMode });
    await act(async () => { await Promise.all([
      result.current({ name: "navigation_opened", route: "friendly" }, "occurrence-00000001"),
      result.current({ name: "navigation_opened", route: "friendly" }, "occurrence-00000001"),
    ]); });
    expect(track).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current({ name: "navigation_opened", route: "friendly" }, "occurrence-00000002"); });
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenCalledWith(expect.objectContaining({
      publicSlug: "public-owner",
      event: { name: "navigation_opened", route: "friendly" },
      attribution: { utm_source: "newsletter", utm_medium: "email" },
      eventId: expect.any(String),
    }));
    expect(JSON.stringify(track.mock.calls[0][0])).not.toContain("account");
  });

  it("retries a failed delivery with the same event ID", async () => {
    const track = vi.fn().mockRejectedValueOnce(new Error("connection lost after commit")).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => usePublicMusicProductAnalytics({
      publicSlug: "public-owner", route: "direct", client: { track },
    }));
    await act(async () => { await result.current({ name: "playlist_opened" }, "occurrence-00000003"); });
    await act(async () => { await result.current({ name: "playlist_opened" }, "occurrence-00000003"); });
    expect(track).toHaveBeenCalledTimes(2);
    expect(track.mock.calls[1][0].eventId).toBe(track.mock.calls[0][0].eventId);
  });

  it("never persists route authority, capability, event properties, or committed receipts", async () => {
    const track = vi.fn(async () => undefined);
    const { result } = renderHook(() => usePublicMusicProductAnalytics({
      publicSlug: "secret-public-owner", capability: "C".repeat(43), route: "direct", client: { track },
    }));
    await act(async () => { await result.current({ name: "request_submitted", outcome: "forbidden" }, "occurrence-00000004"); });
    const storage = Object.keys(sessionStorage).filter((key) => key.startsWith("explorers.music.analytics"))
      .map((key) => [key, sessionStorage.getItem(key)]);
    expect(JSON.stringify(storage)).not.toMatch(/secret-public-owner|CCCCCCCC|request_submitted|forbidden|account|https?:|\?/i);
    expect(storage).toHaveLength(0);
  });

  it("does nothing without consent", async () => {
    localStorage.setItem("explorers-cookie-consent", JSON.stringify({ necessary: true, analytics: false }));
    const track = vi.fn();
    const { result } = renderHook(() => usePublicMusicProductAnalytics({
      publicSlug: "unlisted-owner", capability: "C".repeat(43), route: "direct", client: { track },
    }));
    await act(async () => { await result.current({ name: "navigation_opened", route: "direct" }); });
    expect(track).not.toHaveBeenCalled();
  });

  it("never evicts 256 active receipts and drops the 257th occurrence", async () => {
    const track = vi.fn(() => new Promise<void>(() => undefined));
    const { result } = renderHook(() => usePublicMusicProductAnalytics({ publicSlug: "public-owner", route: "direct", client: { track } }));
    for (let index = 0; index < 256; index += 1) void result.current({ name: "playlist_opened" }, `active-occurrence-${String(index).padStart(4, "0")}`);
    expect(track).toHaveBeenCalledTimes(256);
    void result.current({ name: "playlist_opened" }, "active-occurrence-0256");
    expect(track).toHaveBeenCalledTimes(256);
    void result.current({ name: "playlist_opened" }, "active-occurrence-0000");
    expect(track).toHaveBeenCalledTimes(256);
  });

  it("evicts only a committed terminal receipt and retains retry event identity", async () => {
    const never = () => new Promise<void>(() => undefined);
    const track = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("ambiguous"));
    const { result } = renderHook(() => usePublicMusicProductAnalytics({ publicSlug: "public-owner", route: "direct", client: { track } }));
    await act(async () => { await result.current({ name: "playlist_opened" }, "terminal-occurrence-0000"); });
    await act(async () => { await result.current({ name: "playlist_opened" }, "retry-occurrence-000000"); });
    const retryEventId = track.mock.calls[1][0].eventId;
    track.mockImplementation(never);
    for (let index = 0; index < 254; index += 1) void result.current({ name: "playlist_opened" }, `pressure-occurrence-${String(index).padStart(4, "0")}`);
    void result.current({ name: "playlist_opened" }, "replacement-occurrence-0001");
    expect(track).toHaveBeenCalledTimes(257);
    track.mockResolvedValueOnce(undefined);
    await act(async () => { await result.current({ name: "playlist_opened" }, "retry-occurrence-000000"); });
    expect(track.mock.calls.at(-1)?.[0].eventId).toBe(retryEventId);
  });
});
