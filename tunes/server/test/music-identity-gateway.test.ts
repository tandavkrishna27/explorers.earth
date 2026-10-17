import { describe, expect, it, vi } from "vitest";
import {
  MusicIdentityError,
  musicEnsureResponseSchema,
  musicEnsureRequestSchema,
  musicErrorEnvelopeSchema,
  musicIdentityOpenApi,
} from "../../shared/musicError";
import {
  StrapiIdentityGateway,
  parseRetryAfterMs,
  type ResolvedStrapiIdentity,
} from "../services/strapiIdentityGateway";
import { BoundedIdentityRateLimiter } from "../middleware/identityRateLimit";

const user = {
  documentId: "user-doc-1",
  username: "astronaut",
  email: "sentinel-email@example.invalid",
  provider: "local",
  confirmed: true,
  blocked: false,
};

const completeAccount = {
  documentId: "account-doc-1",
  Account_Name: "Moon Room",
  Account_Type: "Venue",
  mobile_number: "+15555550100",
};

function response(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function accountsResponse(accounts: unknown[]): Response {
  return response({
    data: accounts,
    meta: { pagination: { page: 1, pageSize: 50, pageCount: accounts.length === 0 ? 0 : 1, total: accounts.length } },
  });
}

function gateway(fetchImpl: typeof fetch, overrides: Partial<ConstructorParameters<typeof StrapiIdentityGateway>[0]> = {}) {
  return new StrapiIdentityGateway({
    baseUrl: "https://strapi.invalid",
    fetchImpl,
    maxConcurrency: 2,
    maxPending: 4,
    retries: 1,
    connectTimeoutMs: 100,
    readTimeoutMs: 100,
    overallTimeoutMs: 300,
    cacheTtlMs: 1_000,
    circuitFailureThreshold: 2,
    circuitOpenMs: 100,
    ...overrides,
  });
}

describe("Strapi identity gateway", () => {
  it("emits sanitized upstream stage diagnostics without URL, proof, or response data", async () => {
    const diagnostics: unknown[] = [];
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("contains-sensitive-transport-detail"));
    await expect(gateway(fetchImpl, { retries: 0, diagnostic: (entry) => diagnostics.push(entry) }).resolve("secret-proof-value", "request-safe"))
      .rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(diagnostics).toEqual([{ endpoint: "user", attempt: 1, outcome: "transport_error" }]);
    expect(JSON.stringify(diagnostics)).not.toContain("secret-proof-value");
    expect(JSON.stringify(diagnostics)).not.toContain("contains-sensitive");

    const successDiagnostics: unknown[] = [];
    const successfulFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(user))
      .mockResolvedValueOnce(accountsResponse([completeAccount]));
    await expect(gateway(successfulFetch, {
      diagnostic: (entry) => successDiagnostics.push(entry),
    }).resolve("successful-proof-value", "request-success")).resolves.toMatchObject({
      userDocumentId: user.documentId,
      accountDocumentId: completeAccount.documentId,
    });
    expect(successDiagnostics).toEqual([
      { endpoint: "user", attempt: 1, outcome: "ok" },
      { endpoint: "account", attempt: 1, outcome: "ok" },
    ]);

    const httpDiagnostics: unknown[] = [];
    await expect(gateway(vi.fn<typeof fetch>().mockResolvedValue(response({}, 401)), {
      retries: 0,
      diagnostic: (entry) => httpDiagnostics.push(entry),
    }).resolve("invalid-proof-value", "request-http-error")).rejects.toMatchObject({ code: "AUTH_INVALID" });
    expect(httpDiagnostics).toEqual([
      { endpoint: "user", attempt: 1, outcome: "http_error", status: 401 },
    ]);
  });

  it("reads every authoritative Account page before selecting a sole completed identity", async () => {
    const incomplete = { ...completeAccount, documentId: "account-doc-incomplete", mobile_number: null };
    const firstPage = Array.from({ length: 50 }, (_, index) => ({ ...incomplete, documentId: `incomplete-${index}` }));
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/users/me") return response(user);
      expect(url.searchParams.get("filters[users_permissions_users][documentId][$eq]")).toBe(user.documentId);
      expect(url.searchParams.has("filters[users_permissions_user][documentId][$eq]")).toBe(false);
      const page = Number(url.searchParams.get("pagination[page]"));
      expect(url.searchParams.get("sort[0]")).toBe("documentId:asc");
      if (page === 1) return response({
        data: firstPage,
        meta: { pagination: { page: 1, pageSize: 50, pageCount: 2, total: 51 } },
      });
      return response({
        data: [completeAccount],
        meta: { pagination: { page: 2, pageSize: 50, pageCount: 2, total: 51 } },
      });
    });

    await expect(gateway(fetchImpl).resolve("all-pages-proof-with-entropy", "all-pages-request"))
      .resolves.toMatchObject({ accountDocumentId: completeAccount.documentId });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("rejects cross-page ambiguity and incoherent pagination metadata", async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => ({
      ...completeAccount,
      documentId: `account-doc-${index}`,
      ...(index === 0 ? {} : { mobile_number: null }),
    }));
    for (const secondPage of [
      {
        data: [{ ...completeAccount, documentId: "account-doc-second-page" }],
        meta: { pagination: { page: 2, pageSize: 50, pageCount: 2, total: 51 } },
      },
      {
        data: [completeAccount],
        meta: { pagination: { page: 2, pageSize: 50, pageCount: 3, total: 101 } },
      },
    ]) {
      const fetchImpl = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(response(user))
        .mockResolvedValueOnce(response({
          data: firstPage,
          meta: { pagination: { page: 1, pageSize: 50, pageCount: 2, total: 51 } },
        }))
        .mockResolvedValueOnce(response(secondPage));
      const failure = gateway(fetchImpl).resolve("ambiguous-pages-proof", "ambiguous-pages-request");
      if (secondPage.meta.pagination.total === 51) await expect(failure).rejects.toMatchObject({ code: "ACCOUNT_AMBIGUOUS" });
      else await expect(failure).rejects.toMatchObject({ code: "UPSTREAM_MALFORMED" });
    }
  });

  it("settles error and oversized response streams before returning", async () => {
    let errorCancelled = false;
    const errorBody = new ReadableStream<Uint8Array>({
      pull() {},
      cancel() { errorCancelled = true; },
    });
    const errorFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(errorBody, { status: 503 }));
    await expect(gateway(errorFetch, { retries: 0 }).resolve("error-body-proof", "error-body-request"))
      .rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(errorCancelled).toBe(true);

    let oversizedCancelled = false;
    const oversizedBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(128 * 1024));
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() { oversizedCancelled = true; },
    });
    const oversizedFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(oversizedBody, { status: 200 }));
    await expect(gateway(oversizedFetch, { retries: 0 }).resolve("oversized-body-proof", "oversized-body-request"))
      .rejects.toMatchObject({ code: "UPSTREAM_MALFORMED" });
    expect(oversizedCancelled).toBe(true);
  });

  it.each([
    [{ ...user, confirmed: false }, "IDENTITY_INELIGIBLE"],
    [{ ...user, provider: "password" }, "IDENTITY_INELIGIBLE"],
    [{ ...user, provider: "google", confirmed: false }, undefined],
    [{ ...user, blocked: true }, "IDENTITY_INELIGIBLE"],
  ])("enforces authoritative provider eligibility", async (candidate, expectedCode) => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(candidate))
      .mockResolvedValueOnce(accountsResponse([completeAccount]));
    const operation = gateway(fetchImpl).resolve("proof-with-enough-entropy", "request-1");
    if (expectedCode) await expect(operation).rejects.toMatchObject({ code: expectedCode });
    else await expect(operation).resolves.toMatchObject({ provider: "google" });
  });

  it("selects the sole completed account independent of array order", async () => {
    const incomplete = { ...completeAccount, documentId: "incomplete", mobile_number: null };
    for (const accounts of [[incomplete, completeAccount], [completeAccount, incomplete]]) {
      const fetchImpl = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(response(user))
        .mockResolvedValueOnce(accountsResponse(accounts));
      await expect(gateway(fetchImpl).resolve("proof-with-enough-entropy", "request-2"))
        .resolves.toMatchObject({ accountDocumentId: "account-doc-1" });
    }
  });

  it.each([
    [[], "ONBOARDING_INCOMPLETE"],
    [[completeAccount, { ...completeAccount, documentId: "account-doc-2" }], "ACCOUNT_AMBIGUOUS"],
    [[{ nonsense: true }], "UPSTREAM_MALFORMED"],
  ])("fails closed for zero, ambiguous, or malformed Accounts", async (accounts, code) => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(user))
      .mockResolvedValueOnce(accountsResponse(accounts));
    await expect(gateway(fetchImpl).resolve("proof-with-enough-entropy", "request-3"))
      .rejects.toMatchObject({ code });
  });

  it("propagates request ID, never sends proof in URL, retries 503 once, and honors Retry-After", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({}, 503, { "retry-after": "0" }))
      .mockResolvedValueOnce(response(user))
      .mockResolvedValueOnce(accountsResponse([completeAccount]));
    await gateway(fetchImpl).resolve("sentinel-bearer-proof", "safe-request-id");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    for (const [url, init] of fetchImpl.mock.calls) {
      expect(String(url)).not.toContain("sentinel-bearer-proof");
      expect(new Headers(init?.headers).get("x-request-id")).toBe("safe-request-id");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer sentinel-bearer-proof");
    }
  });

  it("retries a transient fetch TypeError instead of classifying it as malformed JSON", async () => {
    // Break caught: Node fetch reports DNS/TCP failures as TypeError, which the
    // gateway confused with its bounded response decoder's malformed-body error.
    const fetchImpl = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(response(user))
      .mockResolvedValueOnce(accountsResponse([completeAccount]));
    await expect(gateway(fetchImpl).resolve("network-retry-proof-with-entropy", "network-retry-request"))
      .resolves.toMatchObject({ userDocumentId: user.documentId, accountDocumentId: completeAccount.documentId });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry/cache invalid proofs and caches only complete successful resolutions", async () => {
    const invalid = vi.fn<typeof fetch>().mockResolvedValue(response({}, 401));
    const badGateway = gateway(invalid);
    await expect(badGateway.resolve("invalid-proof-with-entropy", "request-4")).rejects.toMatchObject({ code: "AUTH_INVALID" });
    await expect(badGateway.resolve("invalid-proof-with-entropy", "request-5")).rejects.toMatchObject({ code: "AUTH_INVALID" });
    expect(invalid).toHaveBeenCalledTimes(2);

    const valid = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(user))
      .mockResolvedValueOnce(accountsResponse([completeAccount]));
    const cachedGateway = gateway(valid);
    const first = await cachedGateway.resolve("valid-proof-with-entropy", "request-6");
    const second = await cachedGateway.resolve("valid-proof-with-entropy", "request-7");
    expect(second).toEqual(first);
    expect(valid).toHaveBeenCalledTimes(2);
    expect(cachedGateway.stats().cacheEntries).toBe(1);
  });

  it("enforces connect and read deadlines and never exposes an upstream body", async () => {
    const neverConnects = gateway((() => new Promise<Response>(() => undefined)) as typeof fetch, {
      retries: 0, connectTimeoutMs: 10, overallTimeoutMs: 30,
    });
    await expect(neverConnects.resolve("timeout-proof-with-entropy", "request-timeout"))
      .rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });

    const sentinelBody = "sentinel-upstream-body";
    const slowBody = gateway((async () => new Response(new ReadableStream<Uint8Array>({ pull() {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch, { retries: 0, readTimeoutMs: 10, overallTimeoutMs: 30 });
    const failure = await slowBody.resolve("read-timeout-proof-with-entropy", "request-read-timeout").catch((error) => error);
    expect(failure).toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(JSON.stringify(failure)).not.toContain(sentinelBody);
  });

  it("bounds upstream concurrency and opens/half-opens its circuit", async () => {
    let now = 1_800_000_000_000;
    let active = 0;
    let peak = 0;
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return response({}, 503);
    });
    const bounded = gateway(fetchImpl, {
      retries: 0, maxConcurrency: 2, circuitFailureThreshold: 2, circuitOpenMs: 20, now: () => now,
    });
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) =>
      bounded.resolve(`proof-${index}-with-enough-entropy`, `request-${index}`)));
    expect(results.every((item) => item.status === "rejected")).toBe(true);
    expect(peak).toBeLessThanOrEqual(2);
    expect(bounded.stats().circuitState).toBe("open");
    const calls = fetchImpl.mock.calls.length;
    await expect(bounded.resolve("new-proof-with-enough-entropy", "request-open"))
      .rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(fetchImpl).toHaveBeenCalledTimes(calls);
    now += 21;
    await expect(bounded.resolve("probe-proof-with-enough-entropy", "request-probe"))
      .rejects.toBeInstanceOf(MusicIdentityError);
    expect(fetchImpl.mock.calls.length).toBe(calls + 1);
  });

  it("hard-caps active plus waiting distinct work and never starts a fetch after the overall deadline", async () => {
    let active = 0;
    let peak = 0;
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 35));
      active -= 1;
      return response({}, 401);
    });
    const bounded = gateway(fetchImpl, {
      maxConcurrency: 2,
      maxPending: 3,
      retries: 0,
      connectTimeoutMs: 100,
      overallTimeoutMs: 100,
    });
    const work = Array.from({ length: 20 }, (_, index) =>
      bounded.resolve(`rotating-proof-${index}-with-entropy`, `bounded-${index}`));
    const settledWork = Promise.allSettled(work);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(bounded.stats()).toMatchObject({ active: 2, pending: 3 });
    const results = await settledWork;
    expect(results.every((item) => item.status === "rejected")).toBe(true);
    expect(peak).toBeLessThanOrEqual(2);
    expect(bounded.stats().peakPending).toBeLessThanOrEqual(3);

    vi.useFakeTimers();
    try {
      const queuedFetch = vi.fn<typeof fetch>(async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return response({}, 401);
      });
      const deadlineBounded = gateway(queuedFetch, {
        maxConcurrency: 1,
        maxPending: 2,
        retries: 0,
        connectTimeoutMs: 100,
        overallTimeoutMs: 15,
      });
      const first = deadlineBounded.resolve("first-deadline-proof", "deadline-1");
      const second = deadlineBounded.resolve("second-deadline-proof", "deadline-2");
      const deadlineResults = Promise.allSettled([first, second]);
      await vi.advanceTimersByTimeAsync(15);
      await vi.advanceTimersByTimeAsync(25);
      await deadlineResults;
      expect(queuedFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps an opened circuit generation closed to stale success and stale failure races", async () => {
    let releaseLateBody!: (body: string) => void;
    let lateController!: ReadableStreamDefaultController<Uint8Array>;
    const lateBody = new ReadableStream<Uint8Array>({ start(controller) { lateController = controller; } });
    releaseLateBody = (body) => {
      lateController.enqueue(new TextEncoder().encode(body));
      lateController.close();
    };
    const raceFetch = vi.fn<typeof fetch>(async (url, init) => {
      const proof = new Headers(init?.headers).get("authorization") ?? "";
      if (proof.includes("late-success")) {
        if (String(url).includes("/users/me")) return response(user);
        return new Response(lateBody, { status: 200 });
      }
      return response({}, 503);
    });
    const raced = gateway(raceFetch, {
      maxConcurrency: 4,
      maxPending: 8,
      retries: 0,
      circuitFailureThreshold: 2,
      circuitOpenMs: 1_000,
    });
    const late = raced.resolve("late-success-proof", "late-request");
    while (raceFetch.mock.calls.length < 2) await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.allSettled([
      raced.resolve("threshold-failure-one", "failure-1"),
      raced.resolve("threshold-failure-two", "failure-2"),
    ]);
    expect(raced.stats().circuitState).toBe("open");
    releaseLateBody(JSON.stringify({ data: [completeAccount], meta: {
      pagination: { page: 1, pageSize: 50, pageCount: 1, total: 1 },
    } }));
    await late;
    expect(raced.stats().circuitState).toBe("open");

    let now = 10_000;
    let releaseStaleFailure!: (value: Response) => void;
    const staleFailure = new Promise<Response>((resolve) => { releaseStaleFailure = resolve; });
    const staleFetch = vi.fn<typeof fetch>(async (url, init) => {
      const proof = new Headers(init?.headers).get("authorization") ?? "";
      if (proof.includes("stale-failure")) return staleFailure;
      if (proof.includes("open-now")) return response({}, 503);
      return String(url).includes("/users/me") ? response(user) : accountsResponse([completeAccount]);
    });
    const generations = gateway(staleFetch, {
      maxConcurrency: 4,
      maxPending: 8,
      retries: 0,
      circuitFailureThreshold: 1,
      circuitOpenMs: 10,
      now: () => now,
    });
    const stale = generations.resolve("stale-failure-proof", "stale-request");
    while (staleFetch.mock.calls.length < 1) await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(generations.resolve("open-now-proof", "open-request")).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    now += 11;
    const probes = await Promise.allSettled(Array.from({ length: 5 }, (_, index) =>
      generations.resolve(`probe-proof-${index}`, `probe-${index}`)));
    expect(probes.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(staleFetch.mock.calls.filter(([url]) => String(url).includes("/users/me"))).toHaveLength(3);
    expect(generations.stats().circuitState).toBe("closed");
    releaseStaleFailure(response({}, 503));
    await Promise.allSettled([stale]);
    expect(generations.stats().circuitState).toBe("closed");
  });

  it("does not close a half-open circuit when its designated probe expires before fetching", async () => {
    let clock = 0;
    let advanceOnRead = false;
    const fetchImpl = vi.fn<typeof fetch>(async () => response({}, 503));
    const bounded = gateway(fetchImpl, {
      retries: 0,
      circuitFailureThreshold: 1,
      circuitOpenMs: 100,
      overallTimeoutMs: 100,
      now: () => {
        const current = clock;
        if (advanceOnRead) clock += 50;
        return current;
      },
    });
    await expect(bounded.resolve("open-circuit-proof", "open-request"))
      .rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    clock = 101;
    advanceOnRead = true;
    await expect(bounded.resolve("expired-probe-proof", "probe-request"))
      .rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(bounded.stats().circuitState).toBe("open");
  });

  it("does not retry before delta-seconds or HTTP-date Retry-After and refuses waits beyond its deadline", async () => {
    vi.useFakeTimers();
    try {
      const start = Date.UTC(2026, 7, 14, 0, 0, 0);
      vi.setSystemTime(start);
      for (const retryAfter of ["2", new Date(start + 2_000).toUTCString()]) {
        const calls: number[] = [];
        const fetchImpl = vi.fn<typeof fetch>(async (url) => {
          calls.push(Date.now());
          if (calls.length === 1) return response({}, 503, { "retry-after": retryAfter });
          return String(url).includes("/users/me") ? response(user) : accountsResponse([completeAccount]);
        });
        const operation = gateway(fetchImpl, { overallTimeoutMs: 5_000, connectTimeoutMs: 500 }).resolve("retry-proof-with-entropy", "retry-request");
        await vi.advanceTimersByTimeAsync(1_999);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        await expect(operation).resolves.toMatchObject({ userDocumentId: "user-doc-1" });
        expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(2_000);
        vi.setSystemTime(start);
      }

      const beyond = vi.fn<typeof fetch>().mockResolvedValue(response({}, 503, { "retry-after": "120" }));
      let rejected: MusicIdentityError | undefined;
      gateway(beyond, { overallTimeoutMs: 1_000, connectTimeoutMs: 500 }).resolve("beyond-proof-with-entropy", "beyond-request")
        .catch((error) => { rejected = error; });
      await vi.advanceTimersByTimeAsync(0);
      expect(rejected).toMatchObject({ code: "UPSTREAM_UNAVAILABLE", retryAfterSeconds: 120 });
      expect(beyond).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("parses Retry-After safely and uses injected time/sleep without violating the lower bound", async () => {
    const start = Date.UTC(2026, 7, 14, 0, 0, 0);
    expect(parseRetryAfterMs("2", start)).toBe(2_000);
    expect(parseRetryAfterMs(new Date(start + 3_000).toUTCString(), start)).toBe(3_000);
    expect(parseRetryAfterMs(new Date(start - 3_000).toUTCString(), start)).toBe(0);
    expect(parseRetryAfterMs("-1", start)).toBeUndefined();
    expect(parseRetryAfterMs("not-a-date", start)).toBeUndefined();
    expect(parseRetryAfterMs("999999999999999999999", start)).toBe(Number.MAX_SAFE_INTEGER);

    let now = start;
    const sleeps: number[] = [];
    const callTimes: number[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      callTimes.push(now);
      if (callTimes.length === 1) return response({}, 503, { "retry-after": "2" });
      return String(url).includes("/users/me") ? response(user) : accountsResponse([completeAccount]);
    });
    await gateway(fetchImpl, {
      now: () => now,
      random: () => 0,
      sleep: async (milliseconds) => { sleeps.push(milliseconds); now += milliseconds; },
      overallTimeoutMs: 5_000,
      connectTimeoutMs: 500,
    }).resolve("injected-time-proof", "injected-time-request");
    expect(sleeps).toEqual([2_000]);
    expect(callTimes[1] - callTimes[0]).toBeGreaterThanOrEqual(2_000);

    const huge = vi.fn<typeof fetch>().mockResolvedValue(response({}, 503, { "retry-after": "999999999999999999999" }));
    await expect(gateway(huge, { overallTimeoutMs: 1_000, connectTimeoutMs: 500 })
      .resolve("huge-retry-proof", "huge-retry-request"))
      .rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE", retryAfterSeconds: 3_600 });
    expect(huge).toHaveBeenCalledTimes(1);
  });

  it("exposes exact shared success and versioned safe error contracts", () => {
    expect(musicEnsureRequestSchema.parse(undefined)).toBeUndefined();
    expect(() => musicEnsureRequestSchema.parse({})).toThrow();
    expect(musicEnsureResponseSchema.parse({
      version: "music-identity/v1",
      identity: { musicUserId: 7, status: "active" },
      credential: { token: `fixture.${"x".repeat(64)}`, expiresAt: 1_800_000_600_000 },
    }).identity.musicUserId).toBe(7);
    expect(musicErrorEnvelopeSchema.parse({
      version: "music-error/v1",
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Music identity is temporarily unavailable.",
        action: "retry",
        retryable: true,
        requestId: "request-safe",
      },
    }).error.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(Object.keys(musicIdentityOpenApi.operation.post.responses).sort()).toEqual([
      "200", "400", "401", "403", "409", "429", "500", "502", "503",
    ]);
    expect(musicIdentityOpenApi.operation.post).not.toHaveProperty("requestBody");
    for (const [status, contract] of Object.entries(musicIdentityOpenApi.operation.post.responses)) {
      expect(contract.headers).toHaveProperty("X-Request-Id");
      if (["429", "503"].includes(status)) expect(contract.headers).toHaveProperty("Retry-After");
      else expect(contract.headers).not.toHaveProperty("Retry-After");
    }
  });
});

describe("bounded identity rate limiter", () => {
  it("limits both source and proof fingerprint with bounded TTL/cardinality", () => {
    let now = 1_000;
    const limiter = new BoundedIdentityRateLimiter({ limit: 2, windowMs: 100, maxEntries: 3, now: () => now });
    expect(limiter.check("ip:a", "fp:a").allowed).toBe(true);
    expect(limiter.check("ip:a", "fp:a").allowed).toBe(true);
    expect(limiter.check("ip:a", "fp:a")).toMatchObject({ allowed: false });
    limiter.check("ip:b", "fp:b");
    limiter.check("ip:c", "fp:c");
    limiter.check("ip:d", "fp:d");
    expect(limiter.size()).toBeLessThanOrEqual(3);
    now += 101;
    expect(limiter.check("ip:a", "fp:a").allowed).toBe(true);
  });

  it("has a global attempt budget and refuses saturated new keys without evicting/resetting existing buckets", () => {
    const limiter = new BoundedIdentityRateLimiter({
      limit: 1,
      globalLimit: 4,
      windowMs: 60_000,
      maxEntries: 4,
    });
    expect(limiter.check("ip:a", "fp:a").allowed).toBe(true);
    expect(limiter.check("ip:b", "fp:b").allowed).toBe(true);
    expect(limiter.check("ip:c", "fp:c")).toMatchObject({ allowed: false, saturated: true });
    expect(limiter.size()).toBe(4);
    expect(limiter.check("ip:a", "fp:a").allowed).toBe(false);
    expect(limiter.check("ip:d", "fp:d").allowed).toBe(false);
  });

  it("refills the server-wide global token bucket continuously", () => {
    let now = 10_000;
    const limiter = new BoundedIdentityRateLimiter({
      limit: 10,
      globalLimit: 2,
      windowMs: 1_000,
      maxEntries: 20,
      now: () => now,
    });
    expect(limiter.check("ip:a", "fp:a").allowed).toBe(true);
    expect(limiter.check("ip:b", "fp:b").allowed).toBe(true);
    expect(limiter.check("ip:c", "fp:c").allowed).toBe(false);
    now += 500;
    expect(limiter.check("ip:c", "fp:c").allowed).toBe(true);
  });

  it("does not spend global capacity when an already-throttled source is denied", () => {
    const limiter = new BoundedIdentityRateLimiter({ limit: 1, globalLimit: 2, windowMs: 60_000, maxEntries: 20 });
    expect(limiter.check("ip:attacker", "fp:first").allowed).toBe(true);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(limiter.check("ip:attacker", `fp:rotate-${attempt}`).allowed).toBe(false);
    }
    expect(limiter.check("ip:legitimate", "fp:legitimate").allowed).toBe(true);
    expect(limiter.check("ip:third", "fp:third").allowed).toBe(false);
  });

  it("rolls back local reservations and new cardinality when the global tier refuses", () => {
    let now = 0;
    const limiter = new BoundedIdentityRateLimiter({
      limit: 2,
      globalLimit: 2,
      windowMs: 1_000,
      maxEntries: 20,
      now: () => now,
    });
    expect(limiter.check("ip:a", "fp:a").allowed).toBe(true);
    expect(limiter.check("ip:b", "fp:b").allowed).toBe(true);
    expect(limiter.size()).toBe(4);
    expect(limiter.check("ip:a", "fp:a").allowed).toBe(false);
    expect(limiter.check("ip:new", "fp:new").allowed).toBe(false);
    expect(limiter.size()).toBe(4);
    now = 500;
    expect(limiter.check("ip:a", "fp:a").allowed).toBe(true);
    expect(limiter.check("ip:a", "fp:a").allowed).toBe(false);
  });

  it("admits no more than the global cap under concurrent rotating keys", async () => {
    const limiter = new BoundedIdentityRateLimiter({ limit: 10, globalLimit: 7, windowMs: 60_000, maxEntries: 200 });
    const results = await Promise.all(Array.from({ length: 50 }, async (_unused, index) =>
      limiter.check(`ip:${index}`, `fp:${index}`)));
    expect(results.filter(({ allowed }) => allowed)).toHaveLength(7);
    expect(limiter.size()).toBe(14);
  });
});
