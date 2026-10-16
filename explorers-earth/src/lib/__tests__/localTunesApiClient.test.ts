import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { clearMusicCredential, getMusicCredential, setMusicCredential } from "../musicCredentialStore";
import { createLocalTunesApiClient, MusicClientError } from "../localTunesApiClient";
import { createMusicIdentityCoordinator } from "../../features/music/musicIdentityCoordinator";

const NOW = 1_800_000_000_000;
const freshCredential = { token: "fresh.music.credential", expiresAt: NOW + 600_000 };
const rotatedCredential = { token: "rotated.music.credential", expiresAt: NOW + 600_000 };

function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/**
 * One stub for both transports. In production the canonical ensure is same-origin and
 * the Music calls are cross-origin, but where a case already drove the ensure through
 * its own stub, letting that stub answer both keeps its assertions about counts,
 * ordering and responses meaningful.
 */
function bothTransports(impl: typeof fetch) {
  return { fetchImpl: impl, sessionFetchImpl: impl };
}

function ensureResponse(credential = freshCredential): Response {
  return json({
    version: "music-identity/v1",
    identity: { musicUserId: 41, status: "active" },
    credential,
  });
}

function expiredResponse(): Response {
  return json({
    version: "music-error/v1",
    error: {
      code: "TOKEN_EXPIRED", message: "Expired.", action: "authenticate", retryable: false, requestId: "request-expired",
    },
  }, 401);
}

function tokenResponse(code: "TOKEN_EXPIRED" | "TOKEN_INVALID" | "TOKEN_REVOKED"): Response {
  return json({
    version: "music-error/v1",
    error: { code, message: "Contained.", action: "authenticate", retryable: false, requestId: `request-${code}` },
  }, 401);
}

function identityErrorResponse(
  status: number,
  code: string,
  options: {
    retryable?: boolean;
    action?: string;
    requestId?: string;
    version?: string;
    headerRequestId?: string;
    retryAfter?: string;
  } = {},
): Response {
  const requestId = options.requestId ?? `identity-request-${status}`;
  return json({
    version: options.version ?? "music-error/v1",
    error: {
      code,
      message: "Contained.",
      action: options.action ?? (options.retryable ? "retry" : "authenticate"),
      retryable: options.retryable ?? false,
      requestId,
    },
  }, status, {
    "x-request-id": options.headerRequestId ?? requestId,
    ...(options.retryAfter ? { "retry-after": options.retryAfter } : {}),
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => clearMusicCredential());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("local Tunes API client", () => {
  it.each([
    ["no credential at all", {}],
    ["a non-string token", { token: 41, expiresAt: NOW + 600_000 }],
    ["a fractional expiry", { token: "t", expiresAt: NOW + 0.5 }],
    ["an already-passed expiry", { token: "t", expiresAt: NOW - 1 }],
  ])("fails closed when a successful ensure carries %s", async (_label, credential) => {
    // A 200 that does not carry a usable credential must be refused and must leave
    // nothing behind; it is the one response shape a caller cannot see for itself.
    const fetchImpl = vi.fn(async () => json({
      version: "music-identity/v1", identity: { musicUserId: 41, status: "active" }, credential,
    }));
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl,
      sessionFetchImpl: fetchImpl,
      now: () => NOW,
    });

    await expect(client.ensureIdentity()).rejects.toMatchObject({ code: "AUTH_UNAVAILABLE" });
    expect(getMusicCredential(NOW)).toBeUndefined();
  });

  it("sends the canonical ensure through the ambient fetch when no session transport is injected", async () => {
    // This is the production path: musicApi injects only the Music transport, so the
    // canonical same-origin route must fall back to the ambient fetch - and must not
    // be routed through the Music-origin transport, which rejects a relative path.
    const ambient = vi.fn(async () => ensureResponse());
    vi.stubGlobal("fetch", ambient);
    const fetchImpl = vi.fn(async () => json({ ok: true }));
    const client = createLocalTunesApiClient({ baseUrl: "https://music.example", fetchImpl, now: () => NOW });

    await client.ensureIdentity();

    expect(ambient).toHaveBeenCalledWith("/api/explorers/v1/music/identity/ensure", expect.objectContaining({
      method: "POST",
      credentials: "include",
    }));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("prevents conditional browser caching for canonical authenticated JSON reads", async () => {
    setMusicCredential(freshCredential);
    const fetchImpl = vi.fn(async () => json({ queueRevision: 1 }));
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl,
      sessionFetchImpl: fetchImpl,
      now: () => NOW,
    });

    await client.request({ method: "GET", path: "/api/music/dashboard" });

    expect(fetchImpl).toHaveBeenCalledWith("https://music.example/api/music/dashboard", expect.objectContaining({ cache: "no-store" }));
  });

  it("has no caller-flippable fixture HTTP capability in the production client source", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../localTunesApiClient.ts"), "utf8");
    expect(source).not.toMatch(/fixtureMode|fixtureHttpAllowed|http:\/\/127\.0\.0\.1|import\.meta\.env/);
    expect(source).not.toContain("http://localhost:55173");
  });

  it("allows the exact same-origin localhost Music fixture for authenticated browser UAT", async () => {
    vi.stubGlobal("location", new URL("http://localhost:55173/"));
    const fetchImpl = vi.fn(async () => ensureResponse());
    const client = createLocalTunesApiClient({
      baseUrl: "http://localhost:55173",
      fetchImpl,
      sessionFetchImpl: fetchImpl,
      now: () => NOW,
    });

    await client.ensureIdentity();

    // ADR-006: the canonical route is same-origin and relative, whatever the Music
    // origin is, and carries cookie authority with no bearer at all.
    expect(fetchImpl).toHaveBeenCalledWith("/api/explorers/v1/music/identity/ensure", expect.objectContaining({
      method: "POST",
      credentials: "include",
    }));
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toBeUndefined();
  });

  it.each([
    ["browser location is unavailable", undefined],
    ["browser is not on the fixture origin", new URL("https://explorers.earth/music")],
  ])("rejects the localhost fixture URL when %s", (_scenario, location) => {
    vi.stubGlobal("location", location);
    const fetchImpl = vi.fn();

    expect(() => createLocalTunesApiClient({
      baseUrl: "http://localhost:55173",
      fetchImpl,
      sessionFetchImpl: fetchImpl,
    })).toThrow(expect.objectContaining({ code: "REQUEST_INVALID" }));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    "http://music.example",
    "http://10.2.3.4:5000",
    "http://192.168.10.12:5000",
    "http://172.20.0.5:5000",
    "http://127.0.0.1:55000",
  ])("rejects cleartext Music origin %s before fetch without leaking a stored token", (baseUrl) => {
    const fetchImpl = vi.fn();
    setMusicCredential(freshCredential);
    let error: unknown;
    try {
      createLocalTunesApiClient({ baseUrl, fetchImpl, sessionFetchImpl: fetchImpl});
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: "REQUEST_INVALID" });
    expect(JSON.stringify(error)).not.toContain(freshCredential.token);
    expect(String((error as Error).message)).not.toContain(baseUrl);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(["http://127.0.0.1:55173", "http://127.0.0.1:55000", "http://localhost:55000"])(
    "rejects loopback cleartext even when a caller tries the former fixture switch at %s",
    (baseUrl) => {
      setMusicCredential(freshCredential);
      const fetchImpl = vi.fn();
      expect(() => createLocalTunesApiClient({
        baseUrl, fixtureMode: true, fetchImpl, sessionFetchImpl: fetchImpl, now: () => NOW,
      } as never)).toThrow(expect.objectContaining({ code: "REQUEST_INVALID" }));
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it("coalesces 50 initial refreshes onto one ensure and uses the minted credential on local calls", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("/music/identity/ensure")) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return ensureResponse();
      }
      return json({ ok: true });
    });
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl,
      sessionFetchImpl: fetchImpl,
      now: () => NOW,
    });
    const responses = await Promise.all(Array.from({ length: 50 }, () => client.request({ method: "GET", path: "/api/music/identity/current" })));
    expect(responses.every(({ status }) => status === 200)).toBe(true);
    expect(calls.filter(({ url }) => url.endsWith("/ensure"))).toHaveLength(1);
    expect(calls.filter(({ url }) => url.endsWith("/current"))).toHaveLength(50);
    const ensure = calls.find(({ url }) => url.endsWith("/ensure"));
    expect(ensure?.url).toBe("/api/explorers/v1/music/identity/ensure");
    expect(ensure?.init).toMatchObject({ method: "POST", credentials: "include" });
    // Cookie authority on the ensure, and the minted credential on the Music calls.
    expect(ensure?.init?.headers).toBeUndefined();
    expect(calls.filter(({ url }) => url.endsWith("/current"))[0].init).toMatchObject({
      headers: { Authorization: `Bearer ${freshCredential.token}` },
    });
  });

  it("exposes one bodyless single-flight automatic ensure without a downstream owner request", async () => {
    const fetchImpl = vi.fn(async () => ensureResponse());
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl,
      sessionFetchImpl: fetchImpl,
      now: () => NOW,
    });
    await Promise.all(Array.from({ length: 25 }, () => client.ensureIdentity()));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("/api/explorers/v1/music/identity/ensure", expect.objectContaining({
      method: "POST",
      credentials: "include",
      signal: expect.any(AbortSignal),
    }));
    // No bearer on the canonical route: the subject comes from the server-side Actor.
    expect(fetchImpl.mock.calls.every(([, init]) => !(init?.headers as Record<string, string> | undefined)?.Authorization)).toBe(true);
  });

  it("forces one bodyless single-flight snapshot refresh even while credential C is still fresh", async () => {
    setMusicCredential(freshCredential);
    const fetchImpl = vi.fn(async () => ensureResponse(rotatedCredential));
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl,
      sessionFetchImpl: fetchImpl,
      now: () => NOW,
    });
    await Promise.all(Array.from({ length: 12 }, () => client.refreshIdentity()));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("/api/explorers/v1/music/identity/ensure", expect.objectContaining({
      method: "POST",
      credentials: "include",
      signal: expect.any(AbortSignal),
    }));
    // No bearer on the canonical route: the subject comes from the server-side Actor.
    expect(fetchImpl.mock.calls.every(([, init]) => !(init?.headers as Record<string, string> | undefined)?.Authorization)).toBe(true);
    expect(getMusicCredential(NOW)).toEqual(rotatedCredential);
  });

  it("refreshes one near-expiry credential once for concurrent callers within the configured window", async () => {
    setMusicCredential({ token: "near-expiry.music.credential", expiresAt: NOW + 30_000 });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("/ensure")
      ? ensureResponse(rotatedCredential) : json({ ok: true }));
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl,
      sessionFetchImpl: fetchImpl,
      now: () => NOW,
      refreshWindowMs: 60_000,
    });

    await Promise.all(Array.from({ length: 20 }, () => client.request({ method: "GET", path: "/api/music/dashboard" })));

    expect(fetchImpl.mock.calls.filter(([input]) => String(input).endsWith("/ensure"))).toHaveLength(1);
    expect(fetchImpl.mock.calls.filter(([input]) => String(input).endsWith("/dashboard"))).toHaveLength(20);
    expect(getMusicCredential(NOW)).toEqual(rotatedCredential);
  });

  it("honors bounded Retry-After for retryable 503 identity failures and stops after two retries", async () => {
    let elapsedMs = 0;
    const fetchImpl = vi.fn(async () => {
      const requestId = `retry-request-${fetchImpl.mock.calls.length}`;
      return json({
      version: "music-error/v1",
      error: {
        code: "UPSTREAM_UNAVAILABLE", message: "Contained.", action: "retry", retryable: true, requestId,
      },
      }, 503, { "retry-after": "3600", "x-request-id": requestId });
    });
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl,
      sessionFetchImpl: fetchImpl,
      now: () => NOW,
      delay: async (milliseconds) => { elapsedMs += milliseconds; },
    });

    const error = await client.ensureIdentity().catch((cause) => cause);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(elapsedMs).toBe(2_000);
    expect(error).toMatchObject({
      status: 503,
      retryable: true,
      retryAfterSeconds: 3_600,
      requestId: "retry-request-3",
    });
  });

  it("uses the bounded default retry delay and cancels the old authority before another attempt", async () => {
    const delayEntered = deferred<void>();
    const releaseDelay = deferred<void>();
    let observedDelayMs = 0;
    const fetchImpl = vi.fn(async () => json({
      version: "music-error/v1",
      error: {
        code: "INTERNAL_ERROR", message: "Contained.", action: "retry", retryable: true, requestId: "retry-without-header",
      },
    }, 500, { "x-request-id": "retry-without-header" }));
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl,
      sessionFetchImpl: fetchImpl,
      now: () => NOW,
      delay: async (milliseconds) => {
        observedDelayMs = milliseconds;
        delayEntered.resolve();
        await releaseDelay.promise;
      },
    });
    client.setAuthority("user-a:account-a");

    const oldFlight = client.ensureIdentity();
    await delayEntered.promise;
    client.setAuthority("user-b:account-b");
    releaseDelay.resolve();

    await expect(oldFlight).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(observedDelayMs).toBe(1_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("uses the real default delay without exceeding the shared deadline", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(async () => fetchImpl.mock.calls.length === 1
        ? identityErrorResponse(500, "INTERNAL_ERROR", { retryable: true, action: "retry" })
        : ensureResponse());
      const client = createLocalTunesApiClient({
        baseUrl: "https://music.example",
        fetchImpl,
        sessionFetchImpl: fetchImpl,
        now: () => NOW,
      });
      const outcome = client.ensureIdentity();
      await vi.advanceTimersByTimeAsync(999);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);

      await expect(outcome).resolves.toBeUndefined();
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("handles an authority abort that happens synchronously inside a retry delay", async () => {
    let abortAuthority = () => undefined;
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      ...bothTransports(async () => identityErrorResponse(500, "INTERNAL_ERROR", {
        retryable: true,
        action: "retry",
      })),
      now: () => NOW,
      delay: async () => { abortAuthority(); },
    });
    abortAuthority = () => client.setAuthority("user-b:account-b");
    client.setAuthority("user-a:account-a");

    await expect(client.ensureIdentity()).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("fails a malformed 400 ensure response closed as request-invalid", async () => {
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      ...bothTransports(async () => json({ error: { code: "REQUEST_INVALID" } }, 400)),
      now: () => NOW,
    });

    await expect(client.ensureIdentity()).rejects.toMatchObject({
      code: "REQUEST_INVALID",
      status: 400,
      retryable: false,
    });
  });

  it.each([401, 403] as const)("does not retry non-retryable %s identity failures and returns a safe request ID", async (status) => {
    let elapsedMs = 0;
    const requestId = `safe-request-${status}`;
    const fetchImpl = vi.fn(async () => json({
      version: "music-error/v1",
      error: {
        code: status === 401 ? "AUTH_INVALID" : "IDENTITY_INELIGIBLE",
        message: "Contained.",
        action: status === 401 ? "authenticate" : "complete_onboarding",
        retryable: false,
        requestId,
      },
    }, status, { "x-request-id": requestId }));
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl,
      sessionFetchImpl: fetchImpl,
      now: () => NOW,
      delay: async (milliseconds) => { elapsedMs += milliseconds; },
    });

    const error = await client.ensureIdentity().catch((cause) => cause);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(elapsedMs).toBe(0);
    expect(error).toMatchObject({ status, retryable: false, requestId: `safe-request-${status}` });
  });

  it("drops an unsafe response request ID from the contained UI error", async () => {
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      ...bothTransports(async () => json({
        version: "music-error/v1",
        error: {
          code: "AUTH_INVALID", message: "Contained.", action: "authenticate", retryable: false, requestId: "safe-body-id",
        },
      }, 401, { "x-request-id": "unsafe/request-id" })),
      now: () => NOW,
    });

    await expect(client.ensureIdentity()).rejects.toMatchObject({ requestId: undefined });
  });

  it.each([
    { label: "lying 401", status: 401, code: "AUTH_INVALID", retryable: true, retryAfter: undefined },
    { label: "lying 403", status: 403, code: "IDENTITY_INELIGIBLE", retryable: true, retryAfter: undefined },
    { label: "retryable 400 request", status: 400, code: "REQUEST_INVALID", retryable: true, action: "retry", retryAfter: undefined },
    { label: "retryable 409 conflict", status: 409, code: "IDENTITY_CONFLICT", retryable: true, action: "retry", retryAfter: undefined },
    { label: "unversioned 503", status: 503, code: "UPSTREAM_UNAVAILABLE", retryable: true, retryAfter: "1", version: "legacy-error" },
    { label: "contradictory 503 code", status: 503, code: "AUTH_INVALID", retryable: true, retryAfter: "1" },
    { label: "mismatched correlation", status: 503, code: "UPSTREAM_UNAVAILABLE", retryable: true, retryAfter: "1", headerRequestId: "header-request" },
    { label: "missing rate-limit Retry-After", status: 429, code: "RATE_LIMITED", retryable: true, retryAfter: undefined },
    { label: "missing Retry-After", status: 503, code: "UPSTREAM_UNAVAILABLE", retryable: true, retryAfter: undefined },
    { label: "invalid Retry-After", status: 503, code: "UPSTREAM_UNAVAILABLE", retryable: true, retryAfter: "invalid" },
  ])("fails closed without retrying a $label envelope", async ({ status, code, retryable, action, retryAfter, version, headerRequestId }) => {
    const fetchImpl = vi.fn(async () => identityErrorResponse(status, code, {
      retryable,
      action,
      retryAfter,
      version,
      requestId: "body-request",
      headerRequestId,
    }));
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl,
      sessionFetchImpl: fetchImpl,
      now: () => NOW,
      delay: async () => undefined,
    });

    const error = await client.ensureIdentity().catch((cause) => cause);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({ status, retryable: false, upstreamCode: undefined });
  });

  it("fails a fully shaped non-string identity code closed", async () => {
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      ...bothTransports(async () => json({
        version: "music-error/v1",
        error: {
          code: 503,
          message: "Contained.",
          action: "retry",
          retryable: true,
          requestId: "non-string-code",
        },
      }, 503, { "retry-after": "1", "x-request-id": "non-string-code" })),
      now: () => NOW,
    });

    await expect(client.ensureIdentity()).rejects.toMatchObject({ retryable: false, upstreamCode: undefined });
  });

  it.each([
    { status: 400, code: "REQUEST_INVALID", action: "none", retryable: false },
    { status: 401, code: "AUTH_REQUIRED", action: "authenticate", retryable: false },
    { status: 401, code: "AUTH_INVALID", action: "authenticate", retryable: false },
    { status: 403, code: "IDENTITY_INELIGIBLE", action: "complete_onboarding", retryable: false },
    { status: 403, code: "IDENTITY_SUSPENDED", action: "contact_support", retryable: false },
    { status: 409, code: "ONBOARDING_INCOMPLETE", action: "complete_onboarding", retryable: false },
    { status: 409, code: "ACCOUNT_AMBIGUOUS", action: "contact_support", retryable: false },
    { status: 409, code: "ACCOUNT_SWITCH_CONFLICT", action: "contact_support", retryable: false },
    { status: 409, code: "IDENTITY_CONFLICT", action: "contact_support", retryable: false },
    { status: 409, code: "IDENTITY_TOMBSTONED", action: "contact_support", retryable: false },
    { status: 409, code: "IDENTITY_PENDING_DELETION", action: "contact_support", retryable: false },
    { status: 429, code: "RATE_LIMITED", action: "retry", retryable: true },
    { status: 500, code: "INTERNAL_ERROR", action: "retry", retryable: true },
    { status: 502, code: "UPSTREAM_MALFORMED", action: "retry", retryable: true },
    { status: 503, code: "UPSTREAM_UNAVAILABLE", action: "retry", retryable: true },
    { status: 503, code: "DATABASE_UNAVAILABLE", action: "retry", retryable: true },
    { status: 503, code: "ENTRY_DISABLED", action: "retry", retryable: true },
  ] as const)("accepts emitted $status $code policy and preserves its code", async ({ status, code, action, retryable }) => {
    const fetchImpl = vi.fn(async () => identityErrorResponse(status, code, {
      action,
      retryable,
      ...(status === 429 || status === 503 ? { retryAfter: "1" } : {}),
    }));
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl,
      sessionFetchImpl: fetchImpl,
      now: () => NOW,
      delay: async () => undefined,
    });

    const error = await client.ensureIdentity().catch((cause) => cause);

    expect(fetchImpl).toHaveBeenCalledTimes(retryable ? 3 : 1);
    expect(error).toMatchObject({ status, upstreamCode: code, retryable });
  });

  it("enforces one total deadline when an ensure fetch ignores AbortSignal", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(() => new Promise<Response>(() => undefined));
      const client = createLocalTunesApiClient({
        baseUrl: "https://music.example",
        fetchImpl,
        sessionFetchImpl: fetchImpl,
        now: () => NOW,
      });
      let outcome: unknown = "pending";
      void client.ensureIdentity().then(
        () => { outcome = "resolved"; },
        (error) => { outcome = error; },
      );
      await vi.advanceTimersByTimeAsync(4_500);

      expect(outcome).toMatchObject({ code: "AUTH_UNAVAILABLE", status: 503, retryable: false });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("enforces the same total deadline while decoding an ensure response", async () => {
    vi.useFakeTimers();
    try {
      const response = {
        status: 503,
        headers: new Headers({ "x-request-id": "decode-request", "retry-after": "1" }),
        json: () => new Promise<unknown>(() => undefined),
      } as Response;
      const client = createLocalTunesApiClient({
        baseUrl: "https://music.example",
        ...bothTransports(async () => response),
        now: () => NOW,
      });
      let outcome: unknown = "pending";
      void client.ensureIdentity().catch((error) => { outcome = error; });
      await vi.advanceTimersByTimeAsync(4_500);

      expect(outcome).toMatchObject({ code: "AUTH_UNAVAILABLE", status: 503, retryable: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it("settles an old authority promptly when account switch aborts an active retry wait", async () => {
    const delayEntered = deferred<void>();
    const releaseDelay = deferred<void>();
    const fetchImpl = vi.fn(async () => identityErrorResponse(503, "UPSTREAM_UNAVAILABLE", {
      retryable: true,
      action: "retry",
      retryAfter: "3600",
    }));
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl,
      sessionFetchImpl: fetchImpl,
      now: () => NOW,
      delay: async () => {
        delayEntered.resolve();
        await releaseDelay.promise;
      },
    });
    client.setAuthority("user-a:account-a");
    const oldResult = client.ensureIdentity().catch((error) => error);
    await delayEntered.promise;
    client.setAuthority("user-b:account-b");

    const promptlySettled = await Promise.race([
      oldResult.then((error) => ({ settled: true, error })),
      new Promise<{ settled: false }>((resolve) => setTimeout(() => resolve({ settled: false }), 75)),
    ]);
    releaseDelay.resolve();
    await oldResult;

    expect(promptlySettled).toMatchObject({ settled: true, error: { code: "AUTH_REQUIRED" } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("caps one composed coordinator entry at three ensure HTTP calls", async () => {
    const fetchImpl = vi.fn(async () => identityErrorResponse(503, "UPSTREAM_UNAVAILABLE", {
      retryable: true,
      action: "retry",
      retryAfter: "1",
    }));
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl,
      sessionFetchImpl: fetchImpl,
      now: () => NOW,
      delay: async () => undefined,
    });
    const coordinator = createMusicIdentityCoordinator({ ensureIdentity: () => client.ensureIdentity() });

    await coordinator.reconcile({
      provider: "email", authenticated: true, verified: true,
      userDocumentId: "user-1", account: { documentId: "account-1" },
    }).catch(() => undefined);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(coordinator.getSnapshot()).toBe("retryable");
  });

  it("contains typed identity errors for the state selector without leaking upstream messages", async () => {
    const fetchImpl = vi.fn(async () => json({
      version: "music-error/v1",
      error: {
        code: "IDENTITY_CONFLICT",
        message: "sensitive upstream detail",
        action: "contact_support",
        retryable: false,
        requestId: "request-conflict",
      },
    }, 409, { "x-request-id": "request-conflict" }));
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl,
      sessionFetchImpl: fetchImpl,
      now: () => NOW,
    });
    const error = await client.ensureIdentity().catch((cause) => cause);
    expect(error).toMatchObject({ code: "REQUEST_INVALID", upstreamCode: "IDENTITY_CONFLICT", retryable: false });
    expect(error.message).not.toContain("sensitive upstream detail");
  });

  it.each([
    ["GET", undefined, 2, 1, true],
    ["HEAD", undefined, 2, 1, true],
    ["POST", "operation-idempotency-1", 2, 1, true],
    ["POST", undefined, 1, 0, false],
  ] as const)("bounds expired replay for %s with key %s", async (method, idempotencyKey, localCalls, ensureCalls, succeeds) => {
    setMusicCredential(freshCredential);
    let localAttempt = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/ensure")) return ensureResponse(rotatedCredential);
      localAttempt += 1;
      return localAttempt === 1 ? expiredResponse() : json({ ok: true });
    });
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example", fetchImpl, sessionFetchImpl: fetchImpl, now: () => NOW,
    });
    const operation = client.request({ method, path: "/api/music/owner-action", idempotencyKey });
    if (succeeds) await expect(operation).resolves.toMatchObject({ status: 200 });
    else await expect(operation).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(fetchImpl.mock.calls.filter(([input]) => !String(input).endsWith("/ensure"))).toHaveLength(localCalls);
    expect(fetchImpl.mock.calls.filter(([input]) => String(input).endsWith("/ensure"))).toHaveLength(ensureCalls);
  });

  it("never loops after a second exact TOKEN_EXPIRED response", async () => {
    setMusicCredential(freshCredential);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("/ensure")
      ? ensureResponse(rotatedCredential) : expiredResponse());
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example", fetchImpl, sessionFetchImpl: fetchImpl, now: () => NOW,
    });
    await expect(client.request({ method: "GET", path: "/api/music/identity/current" }))
      .rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it.each(["TOKEN_EXPIRED", "TOKEN_INVALID", "TOKEN_REVOKED"] as const)(
    "refreshes once for refreshable %s and preserves the terminal upstream status and code",
    async (code) => {
      setMusicCredential(freshCredential);
      let localAttempt = 0;
      const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith("/ensure")) return ensureResponse(rotatedCredential);
        localAttempt += 1;
        return tokenResponse(code);
      });
      const client = createLocalTunesApiClient({
        baseUrl: "https://music.example", fetchImpl, sessionFetchImpl: fetchImpl, now: () => NOW,
      });

      await expect(client.request({ method: "GET", path: "/api/music/dashboard" })).rejects.toMatchObject({
        code: "AUTH_REQUIRED",
        status: 401,
        upstreamCode: code,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(getMusicCredential(NOW)).toBeUndefined();
    },
  );

  it("aborts and detaches authority A so authority B cannot join or receive A's late success", async () => {
    const a = deferred<Response>();
    const b = deferred<Response>();
    const signals: AbortSignal[] = [];
    const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).endsWith("/ensure")) return Promise.resolve(json({ ok: true }));
      signals.push(init?.signal as AbortSignal);
      return signals.length === 1 ? a.promise : b.promise;
    });
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example", fetchImpl, sessionFetchImpl: fetchImpl, now: () => NOW,
    });

    client.setAuthority("user-a:account-a");
    const aFlight = client.ensureIdentity();
    const aResult = aFlight.catch((error) => error);
    await Promise.resolve();
    await Promise.resolve();
    client.setAuthority("user-b:account-b");
    const bFlight = client.ensureIdentity();
    await Promise.resolve();
    await Promise.resolve();

    expect(signals[0]?.aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    a.resolve(ensureResponse(freshCredential));
    await expect(aResult).resolves.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(getMusicCredential(NOW)).toBeUndefined();
    b.resolve(ensureResponse(rotatedCredential));
    await expect(bFlight).resolves.toBeUndefined();
    expect(getMusicCredential(NOW)).toEqual(rotatedCredential);
  });

  it("prevents authority A's late failure from clearing authority B's committed credential", async () => {
    const a = deferred<Response>();
    const b = deferred<Response>();
    let ensureCall = 0;
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      ...bothTransports((input) => String(input).endsWith("/ensure") ? (++ensureCall === 1 ? a.promise : b.promise) : Promise.resolve(json({ ok: true }))),
      now: () => NOW,
    });
    client.setAuthority("user-a:account-a");
    const aFlight = client.ensureIdentity();
    const aResult = aFlight.catch((error) => error);
    await Promise.resolve();
    await Promise.resolve();
    client.setAuthority("user-b:account-b");
    const bFlight = client.ensureIdentity();
    await Promise.resolve();
    await Promise.resolve();
    b.resolve(ensureResponse(rotatedCredential));
    await bFlight;
    a.reject(new Error("late authority A failure"));
    await expect(aResult).resolves.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(getMusicCredential(NOW)).toEqual(rotatedCredential);
  });

  it("continues local reads through a Strapi outage until expiry, then performs zero mutation", async () => {
    setMusicCredential(freshCredential);
    const localFetch = vi.fn(async () => json({ ok: true }));
    const noGateway = vi.fn(async () => { throw new Error("upstream unavailable sentinel"); });
    const available = createLocalTunesApiClient({
      baseUrl: "https://music.example", fetchImpl: localFetch, sessionFetchImpl: localFetch, now: () => NOW,
    });
    await expect(available.request({ method: "GET", path: "/api/music/identity/current" })).resolves.toMatchObject({ status: 200 });
    expect(noGateway).not.toHaveBeenCalled();

    setMusicCredential({ token: "expired.music.credential", expiresAt: NOW });
    let mutations = 0;
    const unavailable = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl: async () => { mutations += 1; return json({ ok: true }); },
      sessionFetchImpl: async () => { throw new Error("canonical session unreachable"); },
      now: () => NOW,
    });
    const failure = unavailable.request({ method: "POST", path: "/api/music/owner-action", body: { action: "change" } });
    await expect(failure).rejects.toMatchObject({ code: "AUTH_UNAVAILABLE" });
    expect(mutations).toBe(0);
    await expect(failure.catch((error) => error)).resolves.not.toEqual(expect.objectContaining({ cause: expect.anything() }));
    expect(getMusicCredential(NOW)).toBeUndefined();
  });

  it("clears on logout and never exposes a credential in URL or sanitized errors", async () => {
    setMusicCredential(freshCredential);
    const urls: string[] = [];
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example",
      fetchImpl: async (input) => { urls.push(String(input)); throw new Error("network contained"); },
      now: () => NOW,
    });
    const error = await client.request({ method: "GET", path: "/api/music/identity/current" }).catch((caught) => caught);
    expect(error).toBeInstanceOf(MusicClientError);
    expect(JSON.stringify(error)).not.toContain(freshCredential.token);
    expect(urls.join(" ")).not.toContain(freshCredential.token);
    client.logout();
    expect(getMusicCredential(NOW)).toBeUndefined();
  });

  it("propagates a caller abort signal into an in-flight credentialed request", async () => {
    setMusicCredential(freshCredential);
    const pending = deferred<Response>(); let transportSignal: AbortSignal | undefined;
    const client = createLocalTunesApiClient({
      baseUrl: "https://music.example", now: () => NOW,
      fetchImpl: vi.fn((_input, init) => { transportSignal = init?.signal as AbortSignal; return pending.promise; }),
    });
    const controller = new AbortController();
    const operation = client.request({ method: "GET", path: "/api/music/features", signal: controller.signal } as never);
    for (let attempt = 0; attempt < 10 && !transportSignal; attempt += 1) await Promise.resolve();
    expect(transportSignal).toBeDefined();
    controller.abort(); pending.resolve(json({ ok: true }));
    await expect(operation).rejects.toBeInstanceOf(MusicClientError);
    expect(transportSignal?.aborted).toBe(true);
  });

  it("fails closed before transport when the caller signal is already aborted", async () => {
    setMusicCredential(freshCredential);
    const fetchImpl = vi.fn(async () => json({ ok: true }));
    const client = createLocalTunesApiClient({ baseUrl: "https://music.example", now: () => NOW, sessionFetchImpl: fetchImpl, fetchImpl });
    const controller = new AbortController(); controller.abort();
    await expect(client.request({ method: "GET", path: "/api/music/features", signal: controller.signal })).rejects.toBeInstanceOf(MusicClientError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
