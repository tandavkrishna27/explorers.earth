import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMusicCredential,
  clearGuestMusicCapability,
  acquireGuestMusicCapability,
  getGuestMusicCapability,
  guestMusicRequest,
  guestMusicSearch,
  guestMusicVideoFromUrl,
  isMusicOwnerRequest,
  musicCredentialForRequest,
  musicPrincipalForRequest,
  setGuestMusicCapability,
} from "./musicCredential";
import { useAuthStore } from "../stores/authStore";

const validToken = `${"a".repeat(30)}.${"b".repeat(30)}.${"c".repeat(30)}`;
const credentialResponse = (token = validToken) => new Response(JSON.stringify({
  version: "music-identity/v1",
  identity: { musicUserId: 17, status: "active" },
  credential: { token, expiresAt: Date.now() + 600_000 },
}), { status: 200, headers: { "Content-Type": "application/json" } });

describe("C5 browser credential adapter", () => {
  beforeEach(() => {
    clearMusicCredential();
    const localValues = new Map<string, string>([["qrtoken", "authoritative-explorer-proof"]]);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => localValues.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => localValues.set(key, value)),
      removeItem: vi.fn((key: string) => localValues.delete(key)),
    });
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    });
    useAuthStore.setState({ isAuthenticated: false, user: null, token: null });
  });

  it("does not reuse account A's Music credential after logout and account B login", async () => {
    const tokenA = `${"d".repeat(30)}.${"e".repeat(30)}.${"f".repeat(30)}`;
    const tokenB = `${"g".repeat(30)}.${"h".repeat(30)}.${"i".repeat(30)}`;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const proof = new Headers(init?.headers).get("Authorization");
      return credentialResponse(proof === "Bearer proof-b" ? tokenB : tokenA);
    });
    vi.stubGlobal("fetch", fetchMock);

    useAuthStore.getState().login({
      id: "1", documentId: "account-a-user", username: "a", email: "a@example.com", blocked: false, token: "proof-a",
    });
    await expect(musicCredentialForRequest()).resolves.toBe(tokenA);

    useAuthStore.getState().logout();
    useAuthStore.getState().login({
      id: "2", documentId: "account-b-user", username: "b", email: "b@example.com", blocked: false, token: "proof-b",
    });

    await expect(musicCredentialForRequest()).resolves.toBe(tokenB);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("aborts and fences account A's in-flight mint when account B becomes authoritative", async () => {
    const tokenA = `${"j".repeat(30)}.${"k".repeat(30)}.${"l".repeat(30)}`;
    const tokenB = `${"m".repeat(30)}.${"n".repeat(30)}.${"o".repeat(30)}`;
    let resolveA!: (response: Response) => void;
    let accountASignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, init?: RequestInit): Promise<Response> => {
      const proof = new Headers(init?.headers).get("Authorization");
      if (proof === "Bearer proof-a") {
        accountASignal = init?.signal as AbortSignal | undefined;
        return new Promise((resolve) => { resolveA = resolve; });
      }
      return Promise.resolve(credentialResponse(tokenB));
    });
    vi.stubGlobal("fetch", fetchMock);

    useAuthStore.getState().login({
      id: "1", documentId: "account-a-user", username: "a", email: "a@example.com", blocked: false, token: "proof-a",
    });
    const accountARequest = musicCredentialForRequest();

    useAuthStore.getState().logout();
    useAuthStore.getState().login({
      id: "2", documentId: "account-b-user", username: "b", email: "b@example.com", blocked: false, token: "proof-b",
    });
    await expect(musicCredentialForRequest()).resolves.toBe(tokenB);

    resolveA(credentialResponse(tokenA));
    await expect(accountARequest).rejects.toThrow("Music authorization is required");
    await expect(musicCredentialForRequest()).resolves.toBe(tokenB);
    expect(accountASignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("aborts a pending mint when the Explorer proof rotates outside the auth store", async () => {
    const tokenA = `${"p".repeat(30)}.${"q".repeat(30)}.${"r".repeat(30)}`;
    const tokenB = `${"s".repeat(30)}.${"t".repeat(30)}.${"u".repeat(30)}`;
    let resolveA!: (response: Response) => void;
    let accountASignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, init?: RequestInit): Promise<Response> => {
      const proof = new Headers(init?.headers).get("Authorization");
      if (proof === "Bearer authoritative-explorer-proof") {
        accountASignal = init?.signal as AbortSignal | undefined;
        return new Promise((resolve) => { resolveA = resolve; });
      }
      return Promise.resolve(credentialResponse(tokenB));
    });
    vi.stubGlobal("fetch", fetchMock);

    const accountARequest = musicCredentialForRequest();
    localStorage.setItem("qrtoken", "proof-b");
    const accountBRequest = musicCredentialForRequest();
    resolveA(credentialResponse(tokenA));

    await expect(accountARequest).rejects.toThrow("Music authorization is required");
    await expect(accountBRequest).resolves.toBe(tokenB);
    expect(accountASignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses a bodyless Explorer proof once and returns only the minted Music credential", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      version: "music-identity/v1",
      identity: { musicUserId: 17, status: "active" },
      credential: { token: validToken, expiresAt: Date.now() + 600_000 },
    }), { status: 200, headers: { "Content-Type": "application/json", "X-Request-Id": "c5-client-test" } }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await musicCredentialForRequest();
    const second = await musicCredentialForRequest();
    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/music/identity/ensure", expect.objectContaining({
      method: "POST",
      body: undefined,
      headers: { Accept: "application/json", Authorization: "Bearer authoritative-explorer-proof" },
    }));
  });

  it("deduplicates concurrent minting and remints a credential inside its safety window", async () => {
    const fetchMock = vi.fn(async () => {
      await Promise.resolve();
      return credentialResponse();
    });
    vi.stubGlobal("fetch", fetchMock);
    const [first, second] = await Promise.all([musicCredentialForRequest(), musicCredentialForRequest()]);
    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await musicCredentialForRequest(Date.now() + 600_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed when no authoritative Explorer proof exists", async () => {
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null) });
    vi.stubGlobal("fetch", vi.fn());
    await expect(musicCredentialForRequest()).rejects.toThrow("Explorer authentication is required");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [401, { error: { message: "authoritative denial" } }, "authoritative denial"],
    [401, {}, "Music authentication failed"],
  ] as const)("fails closed on Music mint HTTP %s", async (status, body, message) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
    await expect(musicCredentialForRequest()).rejects.toThrow(message);
  });

  it.each([
    [{}, "missing version"],
    [{ version: "music-identity/v1", credential: { token: 3, expiresAt: Date.now() + 10_000 } }, "non-string token"],
    [{ version: "music-identity/v1", credential: { token: "a", expiresAt: Date.now() + 10_000 } }, "short token"],
    [{ version: "music-identity/v1", credential: { token: `${"a".repeat(4097)}.b.c`, expiresAt: Date.now() + 10_000 } }, "long token"],
    [{ version: "music-identity/v1", credential: { token: "a".repeat(64), expiresAt: Date.now() + 10_000 } }, "non-JWT token"],
    [{ version: "music-identity/v1", credential: { token: validToken, expiresAt: 1.5 } }, "unsafe expiry"],
    [{ version: "music-identity/v1", credential: { token: validToken, expiresAt: Date.now() - 1 } }, "expired token"],
  ])("rejects an invalid minted credential: %s", async (body) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
    await expect(musicCredentialForRequest()).rejects.toThrow("invalid credential");
  });

  it("resolves the current principal with only the minted C5 credential", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(credentialResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        version: "music-principal/v1",
        identity: { musicUserId: 17, status: "active" },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(musicPrincipalForRequest()).resolves.toEqual({ musicUserId: 17, status: "active" });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/music/identity/current", expect.objectContaining({
      headers: { Accept: "application/json", Authorization: `Bearer ${validToken}` },
    }));
  });

  it.each([
    [403, { error: { message: "lifecycle denied" } }, "lifecycle denied"],
    [200, { version: "wrong", identity: { musicUserId: 17, status: "active" } }, "Music principal resolution failed"],
    [200, { version: "music-principal/v1", identity: { musicUserId: 1.5, status: "active" } }, "Music principal resolution failed"],
    [200, { version: "music-principal/v1", identity: { musicUserId: 0, status: "active" } }, "Music principal resolution failed"],
    [200, { version: "music-principal/v1", identity: { musicUserId: 17, status: "suspended" } }, "Music principal resolution failed"],
  ] as const)("fails closed on invalid principal response %#", async (status, body, message) => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(credentialResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify(body), { status })));
    await expect(musicPrincipalForRequest()).rejects.toThrow(message);
  });

  it.each([
    "/api/music/identity/current?ignored=1",
    "/api/playlists", "/api/playlist/songs/2", "/api/playlist/currently-playing",
    "/api/playlist/history", "/api/playlist/import-youtube", "/api/music/publication",
    "/api/music/paid/quota", "/api/music/entitlement", "/api/user/profile",
    "/api/system-settings/app", "/api/youtube/search", "/api/instagram/profile",
    "/api/payments/order", "/api/subscriptions/change", "/api/gemini/generate",
    "/api/email/send", "/api/seo#fragment",
  ])("recognizes the C5-only owner route %s", (url) => {
    expect(isMusicOwnerRequest(url)).toBe(true);
  });

  it("does not attach owner authority to public or retired unknown routes", () => {
    expect(isMusicOwnerRequest("/api/playlist/public-slug")).toBe(false);
    expect(isMusicOwnerRequest("/api/music/guest-capability/rotate")).toBe(false);
    expect(isMusicOwnerRequest("/api/music/publication/publish")).toBe(false);
    expect(isMusicOwnerRequest("/api/unknown")).toBe(false);
  });

  it("sends a slug-bound guest request with capability only in the dedicated header", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const capability = "G".repeat(43);
    await guestMusicRequest(capability, { youtubeId: "yt", title: "t", artist: "a", thumbnailUrl: "https://img" }, "owner-a");
    expect(fetchMock).toHaveBeenCalledWith("/api/playlist/owner-a/requests", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "X-Music-Guest-Capability": capability }),
    }));
    expect(JSON.stringify(fetchMock.mock.calls[0][1]?.body)).not.toContain(capability);
  });

  it("sends public song requests without inventing capability authority", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await guestMusicRequest(undefined, { youtubeId: "yt", title: "t", artist: "a", thumbnailUrl: "https://img" }, "public-owner");
    const init = fetchMock.mock.calls[0][1];
    expect(fetchMock.mock.calls[0][0]).toBe("/api/playlist/public-owner/requests");
    expect(init?.headers).not.toHaveProperty("X-Music-Guest-Capability");
  });

  it("normalizes legacy empty capability call sites to public authority", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await guestMusicSearch("", { query: "song" }, "public-owner");
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty("X-Music-Guest-Capability");
  });

  it("uses the same slug-bound header authority for bounded guest search and URL lookup", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [] }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const capability = "S".repeat(43);
    await guestMusicSearch(capability, { query: "song", pageToken: "next" }, "owner-a");
    await guestMusicVideoFromUrl(capability, "https://youtu.be/abcdefghijk", "owner-a");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/playlist/owner-a/youtube/search",
      "/api/playlist/owner-a/youtube/video-from-url",
    ]);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).not.toContain(capability);
      expect(JSON.stringify(init?.body)).not.toContain(capability);
      expect(init?.headers).toEqual(expect.objectContaining({ "X-Music-Guest-Capability": capability }));
      expect(init?.headers).not.toHaveProperty("Authorization");
    }
  });

  it("rejects malformed guest lookup authority before fetch", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(guestMusicSearch("short", { query: "song" }, "owner-a")).rejects.toThrow("valid guest capability");
    await expect(guestMusicSearch("S".repeat(43), { query: "song" }, "bad/slug")).rejects.toThrow("valid guest playlist slug");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [429, { error: { message: "slow down" } }, "slow down"],
    [500, undefined, "Guest Music request failed"],
  ] as const)("fails closed on non-capability guest lookup HTTP %s", async (status, body, message) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body ? JSON.stringify(body) : "not-json", { status })));
    await expect(guestMusicSearch("S".repeat(43), { query: "song" }, "owner-a")).rejects.toThrow(message);
  });

  it("stores guest capabilities per public slug and never reuses A authority on B", () => {
    // Break caught: one global session capability silently targets owner A while the browser displays owner B.
    const capability = "A".repeat(43);
    setGuestMusicCapability(capability, "owner-a");
    expect(getGuestMusicCapability("owner-a")).toBe(capability);
    expect(getGuestMusicCapability("owner-b")).toBeUndefined();
  });

  it("accepts, reads, and clears only an explicit out-of-band guest capability", () => {
    const capability = "C".repeat(43);
    setGuestMusicCapability(capability, "owner-a");
    expect(getGuestMusicCapability("owner-a")).toBe(capability);
    clearGuestMusicCapability("owner-a");
    expect(getGuestMusicCapability("owner-a")).toBeUndefined();
    expect(() => setGuestMusicCapability("public-slug", "owner-a")).toThrow("valid guest capability");
    expect(() => getGuestMusicCapability("bad/slug")).toThrow("valid guest playlist slug");
  });

  it("does not use a hidden prompt when no visible handoff has been imported", () => {
    vi.stubGlobal("prompt", vi.fn(() => "P".repeat(43)));
    expect(acquireGuestMusicCapability("owner-a")).toBeUndefined();
    expect(globalThis.prompt).not.toHaveBeenCalled();
    expect(sessionStorage.setItem).not.toHaveBeenCalled();
  });

  it("imports a browser-consumable header-only handoff per slug and supports rotate and revoke", async () => {
    // Break caught: the only acquisition path is a hidden prompt and the owner QR text has no browser parser.
    const adapter = await import("./musicCredential") as typeof import("./musicCredential") & {
      guestCapabilityHandoff?: (capability: string, guestUrl: string, origin: string) => string;
      importGuestMusicCapability?: (handoff: string, expectedGuestUrl: string) => string;
    };
    expect(adapter.guestCapabilityHandoff).toBeTypeOf("function");
    expect(adapter.importGuestMusicCapability).toBeTypeOf("function");
    if (!adapter.guestCapabilityHandoff || !adapter.importGuestMusicCapability) return;

    const first = "H".repeat(43);
    const rotated = "N".repeat(43);
    const firstHandoff = adapter.guestCapabilityHandoff(first, "owner-a", "https://music.example");
    expect(firstHandoff.split("\n")[1]).toBe("URL: https://music.example/playlist/owner-a");
    expect(firstHandoff.split("\n")[1]).not.toContain(first);
    expect(adapter.importGuestMusicCapability(firstHandoff, "owner-a")).toBe(first);
    expect(acquireGuestMusicCapability("owner-a")).toBe(first);

    const rotatedHandoff = adapter.guestCapabilityHandoff(rotated, "owner-a", "https://music.example");
    expect(adapter.importGuestMusicCapability(rotatedHandoff, "owner-a")).toBe(rotated);
    expect(acquireGuestMusicCapability("owner-a")).toBe(rotated);

    clearGuestMusicCapability("owner-a");
    expect(acquireGuestMusicCapability("owner-a")).toBeUndefined();
    vi.stubGlobal("prompt", vi.fn(() => "Q".repeat(43)));
    expect(acquireGuestMusicCapability("owner-a")).toBeUndefined();
    expect(globalThis.prompt).not.toHaveBeenCalled();
  });

  it("rejects a cross-slug or URL-leaking guest handoff without storing authority", async () => {
    const adapter = await import("./musicCredential") as typeof import("./musicCredential") & {
      importGuestMusicCapability?: (handoff: string, expectedGuestUrl: string) => string;
    };
    expect(adapter.importGuestMusicCapability).toBeTypeOf("function");
    if (!adapter.importGuestMusicCapability) return;
    const capability = "X".repeat(43);
    expect(() => adapter.importGuestMusicCapability(
      `explorers-music-guest/v1\nURL: https://music.example/playlist/owner-b?capability=${capability}\nGuest capability: ${capability}`,
      "owner-a",
    )).toThrow("valid guest access handoff");
    expect(sessionStorage.setItem).not.toHaveBeenCalled();
  });

  it.each([
    "ftp://music.example/",
    "https://user:pass@music.example/",
    "https://music.example/?secret=1",
    "https://music.example/#secret",
    "https://music.example/not-root",
  ])("rejects unsafe handoff origin %s", async (origin) => {
    const adapter = await import("./musicCredential") as typeof import("./musicCredential") & {
      guestCapabilityHandoff?: (capability: string, guestUrl: string, origin: string) => string;
    };
    expect(() => adapter.guestCapabilityHandoff!("H".repeat(43), "owner-a", origin)).toThrow("valid Music origin");
  });

  it("rejects an invalid capability before creating a handoff", async () => {
    const adapter = await import("./musicCredential") as typeof import("./musicCredential") & {
      guestCapabilityHandoff?: (capability: string, guestUrl: string, origin: string) => string;
    };
    expect(() => adapter.guestCapabilityHandoff!("short", "owner-a", "https://music.example")).toThrow("valid guest capability");
  });

  it.each([
    "",
    "wrong-version\nURL: https://music.example/playlist/owner-a\nGuest capability: HHH",
    `explorers-music-guest/v1\nWrong: https://music.example/playlist/owner-a\nGuest capability: ${"H".repeat(43)}`,
    `explorers-music-guest/v1\nURL: https://music.example/playlist/owner-a\nWrong: ${"H".repeat(43)}`,
    "explorers-music-guest/v1\nURL: not a url\nGuest capability: HHH",
    `explorers-music-guest/v1\nURL: ftp://music.example/playlist/owner-a\nGuest capability: ${"H".repeat(43)}`,
    `explorers-music-guest/v1\nURL: https://user:pass@music.example/playlist/owner-a\nGuest capability: ${"H".repeat(43)}`,
    `explorers-music-guest/v1\nURL: https://music.example/playlist/owner-a#secret\nGuest capability: ${"H".repeat(43)}`,
    `explorers-music-guest/v1\nURL: https://music.example/playlist/owner-a?secret=1\nGuest capability: ${"H".repeat(43)}`,
    `explorers-music-guest/v1\nURL: https://music.example/playlist/owner-b\nGuest capability: ${"H".repeat(43)}`,
    `explorers-music-guest/v1\nURL: https://music.example/playlist/%E0%A4%A\nGuest capability: ${"H".repeat(43)}`,
  ])("rejects malformed handoff %#", async (handoff) => {
    const adapter = await import("./musicCredential") as typeof import("./musicCredential") & {
      importGuestMusicCapability?: (value: string, expectedGuestUrl: string) => string;
    };
    expect(() => adapter.importGuestMusicCapability!(handoff, "owner-a")).toThrow("valid guest access handoff");
  });

  it("reuses an already stored capability without prompting", () => {
    const capability = "R".repeat(43);
    setGuestMusicCapability(capability, "owner-a");
    vi.stubGlobal("prompt", vi.fn());
    expect(acquireGuestMusicCapability("owner-a")).toBe(capability);
    expect(globalThis.prompt).not.toHaveBeenCalled();
  });

  it("does not store an empty or cancelled capability prompt", () => {
    vi.stubGlobal("prompt", vi.fn(() => null));
    expect(acquireGuestMusicCapability("owner-a")).toBeUndefined();
    expect(sessionStorage.setItem).not.toHaveBeenCalled();
  });

  it("removes malformed stored guest authority", () => {
    vi.mocked(sessionStorage.getItem).mockReturnValueOnce("malformed");
    expect(getGuestMusicCapability("owner-a")).toBeUndefined();
    expect(sessionStorage.removeItem).toHaveBeenCalledWith("musicGuestCapability:owner-a");
  });

  it("submits a public song request when a legacy caller supplies an empty capability", async () => {
    // Break caught: public request callers normalize missing session authority to "",
    // which must remain an absent header rather than becoming malformed authority.
    const response = new Response(JSON.stringify({ accepted: true }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(guestMusicRequest("", {
      youtubeId: "public-song",
      title: "Public song",
      artist: "Public artist",
      thumbnailUrl: "https://img.example/public-song.jpg",
    }, "public-owner")).resolves.toBe(response);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/playlist/public-owner/requests");
    expect(init).toEqual(expect.objectContaining({ method: "POST" }));
    expect(init?.headers).toEqual(expect.objectContaining({ "Content-Type": "application/json" }));
    expect(init?.headers).not.toHaveProperty("X-Music-Guest-Capability");
  });

  it("rejects malformed guest capability before fetch", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(guestMusicRequest("short", { youtubeId: "yt", title: "t", artist: "a", thumbnailUrl: "https://img" }, "owner-a"))
      .rejects.toThrow("valid guest capability");
    expect(fetch).not.toHaveBeenCalled();
    await expect(guestMusicRequest("G".repeat(43), { youtubeId: "yt", title: "t", artist: "a", thumbnailUrl: "https://img" }, "bad/slug"))
      .rejects.toThrow("valid guest playlist slug");
  });

  it.each([
    [new Response(JSON.stringify({ error: { message: "guest denied" } }), { status: 403 }), "guest denied"],
    [new Response("{}", { status: 403 }), "Guest Music request failed"],
    [new Response("not-json", { status: 403 }), "Guest Music request failed"],
  ])("fails closed on guest request denial %#", async (denial, message) => {
    vi.stubGlobal("fetch", vi.fn(async () => denial));
    await expect(guestMusicRequest("G".repeat(43), { youtubeId: "yt", title: "t", artist: "a", thumbnailUrl: "https://img" }, "owner-a"))
      .rejects.toThrow(message);
  });

  it("clears only the denied slug on a stale capability 403 and leaves an explicit reacquire signal", async () => {
    setGuestMusicCapability("A".repeat(43), "owner-a");
    setGuestMusicCapability("B".repeat(43), "owner-b");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "stale" } }), {
      status: 403, headers: { "Content-Type": "application/json" },
    })));
    await expect(guestMusicRequest("A".repeat(43), { youtubeId: "yt", title: "t", artist: "a", thumbnailUrl: "https://img" }, "owner-a"))
      .rejects.toMatchObject({ name: "GuestCapabilityRequiredError", guestUrl: "owner-a" });
    expect(getGuestMusicCapability("owner-a")).toBeUndefined();
    expect(getGuestMusicCapability("owner-b")).toBe("B".repeat(43));
  });
});
