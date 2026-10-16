import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

it("isolates invalid Music configuration from application imports and logout", async () => {
  vi.stubEnv("VITE_LOCAL_TUNES_API_URL", "http://localhost:5000");
  const { musicApi } = await import("../musicApi");
  expect(() => musicApi.setAuthority(undefined)).not.toThrow();
  expect(() => musicApi.logout()).not.toThrow();
  await expect(musicApi.request({ method: "GET", path: "/api/music/dashboard" }))
    .rejects.toThrow("Music service origin is invalid");
});

async function startup(fetchImpl: typeof fetch) {
  vi.stubEnv("VITE_LOCAL_TUNES_API_URL", "https://music.example");
  vi.stubEnv("DEV", false);
  vi.stubGlobal("fetch", fetchImpl);
  const [{ musicApi }, { default: store }, credentials] = await Promise.all([
    import("../musicApi"), import("../../../store/store"), import("../../../lib/musicCredentialStore"),
  ]);
  credentials.clearMusicCredential();
  return { musicApi, store, credentials };
}

function identity(token = "test.music.A") {
  return new Response(JSON.stringify({ version: "music-identity/v1", identity: { musicUserId: 41, status: "active" }, credential: { token, expiresAt: Date.now() + 600_000 } }), { status: 200 });
}

it("retains pre-initialization authority and shares one underlying identity flight across concurrent callers", async () => {
  let resolve!: (response: Response) => void;
  const pending = new Promise<Response>((done) => { resolve = done; });
  const transport = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
    // Cookie authority on the canonical ensure, never a bearer.
    expect(init?.credentials).toBe("include");
    expect(init?.headers).toBeUndefined();
    return pending;
  });
  const { musicApi, credentials } = await startup(transport);
  musicApi.setAuthority("A");
  const first = musicApi.ensureIdentity();
  const second = musicApi.ensureIdentity();
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  resolve(identity());
  await Promise.all([first, second]);
  musicApi.setAuthority("A");
  await musicApi.ensureIdentity();
  expect(transport).toHaveBeenCalledTimes(1);
  expect(credentials.getMusicCredential()?.token).toBe("test.music.A");
  musicApi.logout();
  expect(credentials.getMusicCredential()).toBeUndefined();
});

it("forwards refreshed authority, JSON, idempotency and abort without recreating stale credentials", async () => {
  const transport = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(identity())
    .mockResolvedValueOnce(identity("test.music.B"))
    .mockResolvedValueOnce(new Response('{"accepted":true}', { status: 200 }));
  const { musicApi, store } = await startup(transport);
  musicApi.logout(); // pre-initialization logout is safe
  musicApi.setAuthority("A");
  await musicApi.ensureIdentity();
  musicApi.setAuthority("B");
  await musicApi.refreshIdentity();
  const controller = new AbortController();
  const response = await musicApi.request({ method: "PATCH", path: "/api/music/guest-controls", body: { allowSongRequests: true }, idempotencyKey: "test-key-123", signal: controller.signal });
  expect(await response.json()).toEqual({ accepted: true });
  expect(transport.mock.calls[1]).toEqual(["/api/explorers/v1/music/identity/ensure", expect.objectContaining({ method: "POST", credentials: "include" })]);
  expect(transport.mock.calls[2]).toEqual(["https://music.example/api/music/guest-controls", expect.objectContaining({ method: "PATCH", body: '{"allowSongRequests":true}', headers: { Authorization: "Bearer test.music.B", "Content-Type": "application/json", "Idempotency-Key": "test-key-123" }, signal: expect.any(AbortSignal) })]);
  musicApi.logout();
});

it.each(["switch", "logout"])("discards real-client in-flight identity completion on %s", async (change) => {
  let resolve!: (response: Response) => void;
  const transport = vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; })).mockResolvedValue(identity("test.music.B"));
  const { musicApi, store, credentials } = await startup(transport);
  musicApi.setAuthority("A");
  const old = musicApi.ensureIdentity();
  const rejected = expect(old).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  if (change === "switch") {
    musicApi.setAuthority("B");
    await musicApi.ensureIdentity();
  } else {
    musicApi.logout();
  }
  resolve(identity("stale.music.A"));
  await rejected;
  expect(credentials.getMusicCredential()?.token).toBe(change === "switch" ? "test.music.B" : undefined);
  musicApi.logout();
});

it("rejects late owner responses after logout and propagates real request failures", async () => {
  let resolve!: (response: Response) => void;
  const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(identity()).mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }));
  const { musicApi, credentials } = await startup(transport);
  musicApi.setAuthority("A");
  const pending = musicApi.request({ method: "GET", path: "/api/music/dashboard" });
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
  musicApi.logout();
  resolve(new Response('{"privateOwnerData":true}'));
  await expect(pending).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  // A post-logout ensure now reaches the transport. The proof gate that used to
  // short-circuit it is gone, and the client cannot gate on an authority subject
  // because nothing in production sets one - musicApi.setAuthority has no production
  // caller, so that seam is vestigial. Deciding whether to provision belongs to
  // musicIdentityCoordinator, which only reconciles a verified complete account.
  // What must still hold is that the late owner response is refused and logout
  // leaves no credential behind.
  await expect(musicApi.ensureIdentity()).rejects.toMatchObject({ code: "AUTH_UNAVAILABLE" });
  expect(transport).toHaveBeenCalledTimes(3);
  expect(credentials.getMusicCredential()).toBeUndefined();
});

it("keeps public clients importable with malformed config and rejects operations without transmitting", async () => {
  vi.stubEnv("VITE_LOCAL_TUNES_API_URL", "not-a-url");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const { publicMusicClient } = await import("../publicMusicClient");
  await import("../publicMusicAnalytics");
  await expect(publicMusicClient.load("public_slug-123")).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
