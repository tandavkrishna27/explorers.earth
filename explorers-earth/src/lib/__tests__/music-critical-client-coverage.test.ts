import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMusicCredential,
  getMusicCredential,
  setMusicCredential,
  subscribeMusicCredential,
} from "../musicCredentialStore";
import { createLocalTunesApiClient, MusicClientError } from "../localTunesApiClient";

const NOW = 1_800_000_000_000;
const credential = { token: "fresh.music.credential", expiresAt: NOW + 600_000 };

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function ensureResponse(value = credential): Response {
  return json({
    version: "music-identity/v1",
    identity: { musicUserId: 41, status: "active" },
    credential: value,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

beforeEach(() => clearMusicCredential());
afterEach(() => {
  clearMusicCredential();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Music credential memory-boundary coverage", () => {
  it.each([
    { token: "", expiresAt: 1 },
    { token: "x".repeat(4_097), expiresAt: 1 },
    { token: "token", expiresAt: 1.5 },
    { token: "token", expiresAt: 0 },
  ])("rejects malformed credentials without notifying listeners", (invalid) => {
    const listener = vi.fn();
    const unsubscribe = subscribeMusicCredential(listener);
    expect(() => setMusicCredential(invalid)).toThrow(/Invalid Music credential/);
    expect(listener).not.toHaveBeenCalled();
    expect(getMusicCredential(NOW)).toBeUndefined();
    unsubscribe();
  });
});

describe("local Tunes client critical edge coverage", () => {
  it("uses safe platform fetch/time defaults and ignores a repeated authority", async () => {
    const fetchImpl = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal("fetch", fetchImpl);
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    setMusicCredential(credential);
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
    });
    client.setAuthority(undefined);
    await expect(client.request({ method: "GET", path: "/api/music/identity/current" }))
      .resolves.toMatchObject({ status: 200 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([undefined, "short proof", "x".repeat(4_097)])("contains unavailable Strapi proof %s", async (proof) => {
    const fetchImpl = vi.fn();
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl,
      now: () => NOW,
    });
    await expect(client.ensureIdentity()).rejects.toMatchObject({ code: "AUTH_UNAVAILABLE" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an authority generation changed while the canonical ensure is in flight", async () => {
    const ensure = deferred<Response>();
    const fetchImpl = vi.fn();
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl,
      sessionFetchImpl: () => ensure.promise,
      now: () => NOW,
    });
    client.setAuthority("user-a");
    const pending = client.ensureIdentity();
    await Promise.resolve();
    client.setAuthority("user-b");
    ensure.resolve(ensureResponse());
    await expect(pending).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { credential: { token: 42, expiresAt: NOW + 600_000 } },
    { credential: { token: "token", expiresAt: "later" } },
    { credential: { token: "token", expiresAt: NOW + 0.5 } },
    { credential: { token: "token", expiresAt: NOW } },
  ])("rejects malformed ensured credential %#", async (body) => {
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl: async () => json(body),
      now: () => NOW,
    });
    await expect(client.ensureIdentity()).rejects.toMatchObject({ code: "AUTH_UNAVAILABLE" });
    expect(getMusicCredential(NOW)).toBeUndefined();
  });

  it("rejects an authority changed while parsing the ensure response", async () => {
    const body = deferred<unknown>();
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl: async () => ({ status: 200, json: () => body.promise }) as Response,
      now: () => NOW,
    });
    client.setAuthority("user-a");
    const pending = client.ensureIdentity();
    await Promise.resolve();
    await Promise.resolve();
    client.setAuthority("user-b");
    body.resolve({ credential });
    await expect(pending).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(getMusicCredential(NOW)).toBeUndefined();
  });

  it("serializes mutation JSON and binds its exact idempotency key", async () => {
    setMusicCredential(credential);
    const fetchImpl = vi.fn(async () => json({ ok: true }));
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl,
      sessionFetchImpl: fetchImpl,
      now: () => NOW,
    });
    await client.request({
      method: "POST",
      path: "/api/music/action",
      body: { action: "play" },
      idempotencyKey: "operation-1234",
    });
    expect(fetchImpl).toHaveBeenCalledWith("https://music.example/api/music/action", expect.objectContaining({
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "operation-1234",
      },
      body: JSON.stringify({ action: "play" }),
    }));
  });

  it("aborts a pending local request when authority changes", async () => {
    setMusicCredential(credential);
    const pendingResponse = deferred<Response>();
    let signal: AbortSignal | undefined;
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl: async (_input, init) => { signal = init?.signal as AbortSignal; return pendingResponse.promise; },
      now: () => NOW,
    });
    client.setAuthority("user-a");
    setMusicCredential(credential);
    const pending = client.request({ method: "GET", path: "/api/music/current" });
    await Promise.resolve();
    await Promise.resolve();
    client.setAuthority("user-b");
    expect(signal?.aborted).toBe(true);
    pendingResponse.resolve(json({ ok: true }));
    await expect(pending).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("returns an unrecognized 401 without refresh and contains malformed response JSON", async () => {
    setMusicCredential(credential);
    const invalidJson = new Response("not-json", { status: 401, headers: { "content-type": "application/json" } });
    const fetchImpl = vi.fn(async () => invalidJson);
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl,
      sessionFetchImpl: fetchImpl,
      now: () => NOW,
    });
    await expect(client.request({ method: "GET", path: "/api/music/current" })).resolves.toBe(invalidJson);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("returns a parsed non-string 401 code without refresh", async () => {
    setMusicCredential(credential);
    const response = json({ error: { code: 42 } }, 401);
    const fetchImpl = vi.fn(async () => response);
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl,
      sessionFetchImpl: fetchImpl,
      now: () => NOW,
    });
    await expect(client.request({ method: "GET", path: "/api/music/current" })).resolves.toBe(response);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([
    { path: "relative", method: "GET" },
    { path: "//other.example/path", method: "GET" },
    { path: "/path", method: "OPTIONS" },
    { path: "/path", method: "POST", idempotencyKey: "short" },
  ])("rejects invalid request shape %# before credential or fetch", async (input) => {
    const fetchImpl = vi.fn();
    const sessionFetchImpl = vi.fn();
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl,
      sessionFetchImpl,
      now: () => NOW,
    });
    await expect(client.request(input as never)).rejects.toMatchObject({ code: "REQUEST_INVALID" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sessionFetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed when ensure response decoding throws", async () => {
    const contained = new MusicClientError("AUTH_REQUIRED", 401, "contained");
    const response = { status: 401, headers: new Headers(), json: async () => { throw contained; } } as Response;
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl: async () => response,
      sessionFetchImpl: async () => response,
      now: () => NOW,
    });
    await expect(client.ensureIdentity()).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
      status: 401,
      retryable: false,
      upstreamCode: undefined,
    });
  });

  it("contains malformed ensure error JSON", async () => {
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl: async () => new Response("not-json", { status: 503 }),
      now: () => NOW,
    });
    await expect(client.ensureIdentity()).rejects.toMatchObject({
      code: "AUTH_UNAVAILABLE",
      status: 503,
      upstreamCode: undefined,
    });
  });

  it.each([
    [401, { error: { code: 42, retryable: false } }, {}, "AUTH_REQUIRED", undefined],
    [503, {
      version: "music-error/v1",
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Contained.",
        action: "retry",
        retryable: true,
        requestId: "coverage-request",
      },
    }, { "retry-after": "3", "x-request-id": "coverage-request" }, "AUTH_UNAVAILABLE", 3],
    [503, { error: { code: "UPSTREAM_UNAVAILABLE", retryable: false } }, { "retry-after": "invalid" }, "AUTH_UNAVAILABLE", undefined],
  ] as const)("contains ensure status %s with bounded retry metadata", async (status, body, headers, code, retryAfterSeconds) => {
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl: async () => json(body, status, headers),
      sessionFetchImpl: async () => json(body, status, headers),
      now: () => NOW,
      delay: async () => undefined,
    });
    await expect(client.ensureIdentity()).rejects.toMatchObject({ code, retryAfterSeconds });
  });

  it.each([
    "not a url",
    "https://user:pass@music.example",
    "https://music.example/?query=1",
    "https://music.example/#fragment",
    "https://music.example/path",
  ])("rejects invalid service origin %s", (baseUrl) => {
    expect(() => createLocalTunesApiClient({
      baseUrl,
      fetchImpl: vi.fn(),
      now: () => NOW,
    })).toThrow(expect.objectContaining({ code: "REQUEST_INVALID" }));
  });
});
