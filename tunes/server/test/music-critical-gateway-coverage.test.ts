import { describe, expect, it, vi } from "vitest";
import { MusicIdentityError } from "../../shared/musicError";
import {
  StrapiIdentityGateway,
  parseRetryAfterMs,
  type ResolvedStrapiIdentity,
  type StrapiIdentityGatewayOptions,
} from "../services/strapiIdentityGateway";
// Ticket 8.1a: these four are no longer the gateway's; the closure imported them and
// that is the only reason a Strapi-named file was inside it.
import { cancelResponseBody, readBoundedResponseBody } from "../services/upstreamResponseBody";
import { fingerprintStrapiProof } from "../services/proofFingerprint";

const user = {
  documentId: "user-doc-1",
  username: "astronaut",
  email: "safe@example.invalid",
  provider: "local",
  confirmed: true,
  blocked: false,
};

const account = {
  documentId: "account-doc-1",
  Account_Name: "Moon Room",
  Account_Type: "Venue",
  mobile_number: "+15555550100",
};

const resolvedIdentity: ResolvedStrapiIdentity = {
  userDocumentId: user.documentId,
  accountDocumentId: account.documentId,
  username: user.username,
  email: user.email,
  provider: "local",
  accountName: account.Account_Name,
  accountType: account.Account_Type,
  accountMobile: account.mobile_number,
};

function response(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers,
  });
}

function accountResponse(): Response {
  return response({
    data: [account],
    meta: { pagination: { page: 1, pageSize: 50, pageCount: 1, total: 1 } },
  });
}

function options(overrides: Partial<StrapiIdentityGatewayOptions> = {}): StrapiIdentityGatewayOptions {
  return {
    baseUrl: "https://strapi.invalid",
    fetchImpl: vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(user))
      .mockResolvedValueOnce(accountResponse()),
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
  };
}

function gateway(overrides: Partial<StrapiIdentityGatewayOptions> = {}): StrapiIdentityGateway {
  return new StrapiIdentityGateway(options(overrides));
}

type GatewayInternals = StrapiIdentityGateway & {
  cache: Map<string, { value: ResolvedStrapiIdentity; expiresAt: number }>;
  circuitState: "closed" | "open" | "half-open";
  circuitGeneration: number;
  probeActive: boolean;
  openedUntil: number;
  assertAdmissionCurrent(admission: { generation: number; probe: boolean }): void;
  recordFailure(admission: { generation: number; probe: boolean }): boolean;
  recordSuccess(admission: { generation: number; probe: boolean }): boolean;
  pruneCache(): void;
};

describe("C4 authoritative gateway critical coverage", () => {
  it("rejects every invalid bounded gateway dimension", () => {
    const invalid: Partial<StrapiIdentityGatewayOptions>[] = [
      { baseUrl: "not-a-url" },
      { baseUrl: "ftp://strapi.invalid" },
      { baseUrl: "https://strapi.invalid/path" },
      { maxConcurrency: 1.5 },
      { maxConcurrency: 0 },
      { maxConcurrency: 65 },
      { maxPending: 1 },
      { maxPending: 129 },
      { retries: -1 },
      { retries: 4 },
      { connectTimeoutMs: 0 },
      { readTimeoutMs: 0 },
      { overallTimeoutMs: 0 },
      { cacheTtlMs: -1 },
      { cacheTtlMs: 30_001 },
      { circuitFailureThreshold: 0 },
      { circuitOpenMs: 0 },
    ];
    for (const override of invalid) {
      expect(() => new StrapiIdentityGateway(options(override))).toThrow(/invalid bounded/);
    }
  });

  it("supports default platform dependencies without widening configured bounds", () => {
    const defaults = options();
    delete defaults.fetchImpl;
    delete defaults.now;
    delete defaults.random;
    delete defaults.sleep;
    expect(new StrapiIdentityGateway(defaults).stats()).toMatchObject({
      cacheEntries: 0,
      circuitState: "closed",
      active: 0,
      pending: 0,
    });
  });

  it("expires cached resolutions and clears one or all proof fingerprints", async () => {
    let now = 1_000;
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(user))
      .mockResolvedValueOnce(accountResponse())
      .mockResolvedValueOnce(response(user))
      .mockResolvedValueOnce(accountResponse())
      .mockResolvedValueOnce(response(user))
      .mockResolvedValueOnce(accountResponse());
    const cached = gateway({ fetchImpl, now: () => now, cacheTtlMs: 10 });
    await cached.resolve("proof-a-with-entropy", "request-a");
    now += 11;
    await cached.resolve("proof-a-with-entropy", "request-b");
    cached.clear(fingerprintStrapiProof("proof-a-with-entropy"));
    await cached.resolve("proof-a-with-entropy", "request-c");
    cached.clear();
    expect(cached.stats().cacheEntries).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("resolves eligible users independently and classifies each failure for circuit accounting", async () => {
    await expect(gateway({
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response(user)),
    }).resolveUser("proof", "request")).resolves.toEqual({ userDocumentId: user.documentId });

    await expect(gateway({
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response({ malformed: true })),
      retries: 0,
    }).resolveUser("proof", "request")).rejects.toMatchObject({ code: "UPSTREAM_MALFORMED" });

    await expect(gateway({
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response({}, 401)),
      retries: 0,
    }).resolveUser("proof", "request")).rejects.toMatchObject({ code: "AUTH_INVALID" });

    let clock = 0;
    const reads = [0, 0, 0, 300];
    await expect(gateway({
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response(user)),
      retries: 0,
      now: () => reads.shift() ?? clock,
      overallTimeoutMs: 300,
    }).resolveUser("proof", "request")).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    clock += 1;
  });

  it("fails before or immediately after semaphore admission when the overall deadline is spent", async () => {
    const beforeReads = [0, 300];
    const beforeFetch = vi.fn<typeof fetch>();
    await expect(gateway({
      fetchImpl: beforeFetch,
      retries: 0,
      overallTimeoutMs: 300,
      now: () => beforeReads.shift() ?? 300,
    }).resolve("before-deadline-proof", "request-before")).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(beforeFetch).not.toHaveBeenCalled();

    const afterReads = [0, 0, 0, 0, 300];
    const afterFetch = vi.fn<typeof fetch>();
    await expect(gateway({
      fetchImpl: afterFetch,
      retries: 0,
      overallTimeoutMs: 300,
      now: () => afterReads.shift() ?? 300,
    }).resolve("after-deadline-proof", "request-after")).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(afterFetch).not.toHaveBeenCalled();
  });

  it("fails closed for terminal upstream client errors and malformed response bodies", async () => {
    for (const fetchImpl of [
      vi.fn<typeof fetch>().mockResolvedValue(response({}, 418)),
      vi.fn<typeof fetch>().mockResolvedValue(response("x".repeat(128 * 1_024 + 1))),
      vi.fn<typeof fetch>().mockResolvedValue(response("not-json")),
      vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([0xff]), { status: 200 })),
      vi.fn<typeof fetch>().mockResolvedValue({
        status: 200,
        headers: new Headers(),
        text: async () => undefined as unknown as string,
      } as Response),
    ]) {
      await expect(gateway({ fetchImpl, retries: 0 }).resolve("malformed-proof", "request-malformed"))
        .rejects.toMatchObject({ code: "UPSTREAM_MALFORMED" });
    }
  });

  it("retries a transient transport exception with bounded injected backoff", async () => {
    const sleeps: number[] = [];
    const fetchImpl = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(response(user))
      .mockResolvedValueOnce(accountResponse());
    await expect(gateway({
      fetchImpl,
      random: () => 0,
      sleep: async (milliseconds) => { sleeps.push(milliseconds); },
      overallTimeoutMs: 500,
    }).resolve("retry-proof", "request-retry")).resolves.toEqual(resolvedIdentity);
    expect(sleeps).toEqual([10]);
  });

  it("refuses a retry when injected sleep crosses the overall deadline", async () => {
    let now = 0;
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({}, 503));
    await expect(gateway({
      fetchImpl,
      retries: 1,
      now: () => now,
      random: () => 0,
      sleep: async (milliseconds) => { now += milliseconds + 501; },
      overallTimeoutMs: 500,
    }).resolve("late-backoff-proof", "request-late")).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects stale and invalid circuit admissions without mutating a newer generation", () => {
    const bounded = gateway() as GatewayInternals;
    bounded.circuitGeneration = 2;
    expect(() => bounded.assertAdmissionCurrent({ generation: 1, probe: false }))
      .toThrow(expect.objectContaining({ code: "UPSTREAM_UNAVAILABLE" }));

    expect(bounded.recordFailure({ generation: 1, probe: false })).toBe(false);
    bounded.circuitState = "open";
    expect(bounded.recordFailure({ generation: 2, probe: false })).toBe(false);
    expect(bounded.recordSuccess({ generation: 2, probe: false })).toBe(false);

    bounded.circuitState = "closed";
    expect(bounded.recordSuccess({ generation: 2, probe: true })).toBe(false);
    bounded.circuitState = "half-open";
    bounded.probeActive = false;
    expect(bounded.recordSuccess({ generation: 2, probe: true })).toBe(false);
  });

  it("prunes expired and oldest cache entries to the hard cardinality cap", () => {
    let now = 1_000;
    const bounded = gateway({ now: () => now }) as GatewayInternals;
    bounded.cache.set("expired", { value: resolvedIdentity, expiresAt: now });
    bounded.pruneCache();
    expect(bounded.cache.has("expired")).toBe(false);

    now += 1;
    for (let index = 0; index < 1_025; index += 1) {
      bounded.cache.set(`proof-${index}`, { value: resolvedIdentity, expiresAt: now + 1_000 });
    }
    bounded.pruneCache();
    expect(bounded.cache.size).toBe(1_024);
    expect(bounded.cache.has("proof-0")).toBe(false);
  });

  it("keeps a dequeued semaphore waiter stable if its already-cleared timer callback races", async () => {
    const callbacks: Array<() => void> = [];
    const timer = vi.spyOn(globalThis, "setTimeout").mockImplementation((callback) => {
      callbacks.push(callback as () => void);
      return {} as NodeJS.Timeout;
    });
    const clear = vi.spyOn(globalThis, "clearTimeout").mockImplementation(() => undefined);
    try {
      const semaphore = (gateway({ maxConcurrency: 1, maxPending: 2 }) as unknown as {
        semaphore: { use<T>(operation: () => Promise<T>, deadline: number, now: () => number): Promise<T> };
      }).semaphore;
      let release!: () => void;
      const blocked = new Promise<void>((resolve) => { release = resolve; });
      const first = semaphore.use(async () => { await blocked; return "first"; }, 100, () => 0);
      await Promise.resolve();
      const second = semaphore.use(async () => "second", 100, () => 0);
      await Promise.resolve();
      release();
      await expect(first).resolves.toBe("first");
      await expect(second).resolves.toBe("second");
      expect(callbacks).toHaveLength(1);
      callbacks[0]();
    } finally {
      clear.mockRestore();
      timer.mockRestore();
    }
  });

  it("removes a still-queued semaphore waiter when its deadline fires", async () => {
    const callbacks: Array<() => void> = [];
    const timer = vi.spyOn(globalThis, "setTimeout").mockImplementation((callback) => {
      callbacks.push(callback as () => void);
      return {} as NodeJS.Timeout;
    });
    const clear = vi.spyOn(globalThis, "clearTimeout").mockImplementation(() => undefined);
    try {
      const semaphore = (gateway({ maxConcurrency: 1, maxPending: 2 }) as unknown as {
        semaphore: { use<T>(operation: () => Promise<T>, deadline: number, now: () => number): Promise<T> };
      }).semaphore;
      let release!: () => void;
      const blocked = new Promise<void>((resolve) => { release = resolve; });
      const first = semaphore.use(async () => { await blocked; return "first"; }, 100, () => 0);
      await Promise.resolve();
      const second = semaphore.use(async () => "second", 100, () => 0);
      await Promise.resolve();
      expect(callbacks).toHaveLength(1);
      callbacks[0]();
      await expect(second).rejects.toThrow("bounded upstream admission refused");
      release();
      await expect(first).resolves.toBe("first");
    } finally {
      clear.mockRestore();
      timer.mockRestore();
    }
  });

  it("does not clear an absent deadline timer handle", async () => {
    const timer = vi.spyOn(globalThis, "setTimeout").mockImplementation(() => undefined as unknown as NodeJS.Timeout);
    try {
      await expect(gateway({
        fetchImpl: vi.fn<typeof fetch>()
          .mockResolvedValueOnce(response(user))
          .mockResolvedValueOnce(accountResponse()),
      }).resolve("timer-proof", "timer-request")).resolves.toEqual(resolvedIdentity);
    } finally {
      timer.mockRestore();
    }
  });

  it("rejects duplicate immutable account document IDs across an authoritative page", async () => {
    const duplicate = { ...account };
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(user))
      .mockResolvedValueOnce(response({
        data: [account, duplicate],
        meta: { pagination: { page: 1, pageSize: 50, pageCount: 1, total: 2 } },
      }));
    await expect(gateway({ fetchImpl, retries: 0 }).resolve("duplicate-account-proof", "duplicate-account-request"))
      .rejects.toMatchObject({ code: "UPSTREAM_MALFORMED" });
  });

  it("covers empty, locked, failed-cancel, and expired bounded response bodies", async () => {
    await expect(readBoundedResponseBody(new Response(null), 10, 10, new AbortController())).resolves.toBe("");

    const lockedResponse = new Response("locked");
    const reader = lockedResponse.body!.getReader();
    await expect(cancelResponseBody(lockedResponse)).resolves.toBeUndefined();
    reader.releaseLock();

    await expect(cancelResponseBody({ body: {
      locked: false,
      cancel: async () => { throw new Error("cancel failed"); },
    } } as unknown as Response)).resolves.toBeUndefined();

    const now = vi.spyOn(Date, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(11);
    try {
      await expect(readBoundedResponseBody(new Response("late"), 10, 10, new AbortController()))
        .rejects.toThrow("deadline exceeded");
    } finally {
      now.mockRestore();
    }
  });

  it("returns undefined for a syntactically shaped but impossible HTTP date", () => {
    expect(parseRetryAfterMs("Mon, 99 Jan 9999 99:99:99 GMT", 1_800_000_000_000)).toBeUndefined();
  });

});
