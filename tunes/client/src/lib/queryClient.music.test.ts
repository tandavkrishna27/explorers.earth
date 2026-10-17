import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./csrf", () => ({ getCsrfToken: () => "native-csrf" }));
vi.mock("./musicCredential", () => ({
  isMusicOwnerRequest: (url: string) => url.startsWith("/api/playlists") || url.startsWith("/api/playlist/songs") || url === "/api/music/publication",
  musicCredentialForRequest: async () => "c5-token",
  getGuestMusicCapability: vi.fn(() => "S".repeat(43)),
  clearGuestMusicCapability: vi.fn(),
}));

import { apiRequest, getQueryFn, queryClient } from "./queryClient";
import { clearGuestMusicCapability, getGuestMusicCapability } from "./musicCredential";

describe("apiRequest Music authority serialization", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null) });
  });

  it("does not mix native CSRF state into a canonical C5 owner body", async () => {
    await apiRequest("POST", "/api/playlists", { name: "owner playlist" });
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({ name: "owner playlist" });
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer c5-token");
  });

  it("sends the one-command publication idempotency header without leaking it into the body", async () => {
    await apiRequest("POST", "/api/music/publication", { mode: "unlisted" }, 0, 3, {
      "Idempotency-Key": "publication-command-1",
    });
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({ mode: "unlisted" });
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer c5-token");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe("publication-command-1");
  });

  it("retains the native CSRF body contract outside Music owner routes", async () => {
    await apiRequest("POST", "/api/login", { username: "native" });
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({ username: "native", _csrf: "native-csrf" });
  });

  it("does not replay a non-idempotent POST after an ambiguous network failure", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn()
        .mockRejectedValueOnce(new TypeError("fetch failed after the server may have committed"))
        .mockResolvedValueOnce(new Response("{}", { status: 201 }));
      vi.stubGlobal("fetch", fetchMock);

      const result = apiRequest("POST", "/api/playlist/songs", {
        youtubeId: "video", title: "Song", artist: "Artist", thumbnailUrl: "https://example.com/song.jpg",
      }, 0, 1);
      const outcomePromise = result.then(
        (response) => ({ status: "fulfilled" as const, response }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      );
      await vi.runAllTimersAsync();
      const outcome = await outcomePromise;
      expect(outcome.status).toBe("rejected");
      if (outcome.status === "rejected") expect(outcome.error).toMatchObject({ message: "Unable to connect to the server. Please check your internet connection and try again." });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries the durable publication POST with the same idempotency key", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn()
        .mockRejectedValueOnce(new TypeError("fetch failed before the response arrived"))
        .mockResolvedValueOnce(new Response("{}", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const outcomePromise = apiRequest("POST", "/api/music/publication", { mode: "unlisted" }, 0, 1, {
        "Idempotency-Key": "publication-command-2",
      }).then(
        (response) => ({ status: "fulfilled" as const, response }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      );
      await vi.runAllTimersAsync();
      const outcome = await outcomePromise;
      expect(outcome.status).toBe("fulfilled");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      for (const [, init] of fetchMock.mock.calls) {
        expect(new Headers(init?.headers).get("Idempotency-Key")).toBe("publication-command-2");
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let the global mutation policy replay a failed mutation", async () => {
    vi.useFakeTimers();
    try {
      const ambiguousFailure = Object.assign(new Error("response lost after commit"), { status: 503 });
      const mutationFn = vi.fn()
        .mockRejectedValueOnce(ambiguousFailure)
        .mockResolvedValueOnce({ duplicated: true });
      const mutation = queryClient.getMutationCache().build(queryClient, { mutationFn });
      const outcomePromise = mutation.execute(undefined).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      );

      await vi.runAllTimersAsync();
      const outcome = await outcomePromise;
      expect(outcome.status).toBe("rejected");
      expect(mutationFn).toHaveBeenCalledTimes(1);
    } finally {
      queryClient.getMutationCache().clear();
      vi.useRealTimers();
    }
  });

  it("clears a rejected slug capability and waits for the visible import flow instead of prompting or retrying", async () => {
    vi.stubGlobal("window", { location: { pathname: "/playlist/unlisted" } });
    vi.mocked(getGuestMusicCapability).mockReturnValueOnce("S".repeat(43));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("{}", { status: 404 })));
    const query = getQueryFn<{ songs: unknown[] }>({ on401: "throw" });
    await expect(query({ queryKey: ["/api/playlist/unlisted"] } as never)).rejects.toMatchObject({ status: 404 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get("X-Music-Guest-Capability")).toBe("S".repeat(43));
    expect(clearGuestMusicCapability).toHaveBeenCalledWith("unlisted");
  });
});
