import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setupMusicIdentityBodylessPreflight, setupMusicIdentityRoutes } from "../routes/musicIdentityRoutes";
import {
  MUSIC_IDENTITY_RESPONSE_STATUSES,
  MusicIdentityError,
  musicErrorEnvelopeSchema,
  parseMusicIdentityClientResponse,
} from "../../shared/musicError";
import { BoundedIdentityRateLimiter } from "../middleware/identityRateLimit";
import { createLoopbackSupertestScope } from "./helpers/loopback-supertest";

const loopback = createLoopbackSupertestScope();
afterEach(async () => loopback.closeAll());

const routeCredentialDependencies = {
  mintCredential: () => ({ token: `fixture.${"x".repeat(64)}`, expiresAt: 1_800_000_600_000 }),
  resolvePrincipal: async () => ({
    musicUserId: 41, subject: "user-doc", accountDocumentId: "account-doc", sessionVersion: 1,
  }),
};

function appFor(ensure = vi.fn(async () => ({
  id: 41,
  strapiUserDocumentId: "user-doc",
  strapiAccountDocumentId: "account-doc",
  identityStatus: "active" as const,
  sessionVersion: 1,
})), entryEnabled = true) {
  const app = express();
  setupMusicIdentityBodylessPreflight(app);
  app.use(express.json({ limit: "1kb" }));
  const logs: unknown[] = [];
  setupMusicIdentityRoutes(app, {
    ...routeCredentialDependencies,
    ensure,
    limiter: new BoundedIdentityRateLimiter({ limit: 20, windowMs: 1_000, maxEntries: 100 }),
    logger: (entry) => logs.push(entry),
    fingerprint: () => "safe-fingerprint",
    requestIdFactory: () => "generated-request-id",
    entryEnabled: () => entryEnabled,
  });
  return { app, ensure, logs };
}

function appWithClock(now: () => number) {
  const app = express();
  setupMusicIdentityBodylessPreflight(app);
  const logs: unknown[] = [];
  const dependencies = {
    ...routeCredentialDependencies,
    ensure: vi.fn(async () => ({
      id: 41, strapiUserDocumentId: "user-doc", strapiAccountDocumentId: "account-doc",
      identityStatus: "active" as const, sessionVersion: 1,
    })),
    limiter: new BoundedIdentityRateLimiter({ limit: 20, windowMs: 1_000, maxEntries: 100 }),
    logger: (entry: unknown) => logs.push(entry),
    now,
  };
  setupMusicIdentityRoutes(app, dependencies);
  return { app, logs };
}

function proxyAppFor(ensure: ReturnType<typeof vi.fn>) {
  const app = express();
  const isTrustedProxy = (peer: string | undefined) => peer === "127.0.0.1" || peer === "::ffff:127.0.0.1" || peer === "::1";
  app.set("trust proxy", isTrustedProxy);
  setupMusicIdentityBodylessPreflight(app);
  setupMusicIdentityRoutes(app, {
    ...routeCredentialDependencies,
    ensure,
    trustedProxyHops: 1,
    isTrustedProxy,
    limiter: new BoundedIdentityRateLimiter({
      limit: 1,
      globalLimit: 10,
      windowMs: 60_000,
      maxEntries: 16,
    }),
  });
  return app;
}

describe("POST /api/music/identity/ensure", () => {
  it("fails closed before proof resolution while the server entry kill switch is active", async () => {
    const { app, ensure } = appFor(undefined, false);
    const { request } = await loopback.open({ app });
    const response = await request
      .post("/api/music/identity/ensure")
      .set("authorization", "Bearer proof-with-enough-entropy");
    expect(response.status).toBe(503);
    expect(response.headers["retry-after"]).toBe("60");
    expect(response.body.error.code).toBe("ENTRY_DISABLED");
    expect(ensure).not.toHaveBeenCalled();
  });

  it("awaits proof-bound cohort admission before provisioning an identity", async () => {
    const app = express();
    const ensure = vi.fn(async () => ({
      id: 41,
      strapiUserDocumentId: "member-doc",
      strapiAccountDocumentId: "account-doc",
      identityStatus: "active" as const,
      sessionVersion: 1,
    }));
    const entryEnabled = vi.fn(async (proof: string, requestId: string) => {
      await Promise.resolve();
      return proof === "member-proof-with-entropy" && requestId === "cohort-request";
    });
    setupMusicIdentityRoutes(app, {
      ...routeCredentialDependencies,
      ensure,
      entryEnabled,
      limiter: new BoundedIdentityRateLimiter({ limit: 20, windowMs: 1_000, maxEntries: 100 }),
    });

    const { request } = await loopback.open({ app });
    const rejected = await request.post("/api/music/identity/ensure")
      .set("authorization", "Bearer outsider-proof-with-entropy")
      .set("x-request-id", "cohort-request");
    expect(rejected.status).toBe(503);
    expect(rejected.body.error.code).toBe("ENTRY_DISABLED");
    expect(ensure).not.toHaveBeenCalled();
    expect(entryEnabled).toHaveBeenCalledWith("outsider-proof-with-entropy", "cohort-request");

    const admitted = await request.post("/api/music/identity/ensure")
      .set("authorization", "Bearer member-proof-with-entropy")
      .set("x-request-id", "cohort-request");
    expect(admitted.status).toBe(200);
    expect(ensure).toHaveBeenCalledOnce();
  });

  it("accepts only one strict bearer and an absent body/query/owner identity", async () => {
    const { app, ensure } = appFor();
    const { request } = await loopback.open({ app });
    const ok = await request
      .post("/api/music/identity/ensure")
      .set("authorization", "Bearer proof-with-enough-entropy")
      .set("x-request-id", "bounded-request-1");
    expect(ok.status).toBe(200);
    expect(ok.headers["x-request-id"]).toBe("bounded-request-1");
    expect(ok.body).toEqual({
      version: "music-identity/v1",
      identity: { musicUserId: 41, status: "active" },
      credential: routeCredentialDependencies.mintCredential(),
    });
    expect(ensure).toHaveBeenCalledWith("proof-with-enough-entropy", "bounded-request-1");

    const invalidRequests = [
      request.post("/api/music/identity/ensure"),
      request.post("/api/music/identity/ensure").set("cookie", "cosmic.sid=forged-native-session"),
      request.post("/api/music/identity/ensure").set("authorization", "bearer proof-with-enough-entropy"),
      request.post("/api/music/identity/ensure").set("authorization", "Bearer proof one two"),
      request.post("/api/music/identity/ensure").set("authorization", "Bearer proof-with-enough-entropy").send({}),
      request.post("/api/music/identity/ensure").set("authorization", "Bearer proof-with-enough-entropy").set("content-type", "application/json").send('{"unterminated"'),
      request.post("/api/music/identity/ensure?username=forged").set("authorization", "Bearer proof-with-enough-entropy"),
      request.post("/api/music/identity/ensure").set("authorization", "Bearer proof-with-enough-entropy").set("x-owner-id", "forged"),
      request.post("/api/music/identity/ensure").set("authorization", "Bearer proof-with-enough-entropy").set("x-username", "forged"),
    ];
    for (const operation of invalidRequests) {
      const response = await operation;
      expect([400, 401]).toContain(response.status);
      expect(musicErrorEnvelopeSchema.safeParse(response.body).success).toBe(true);
      expect(response.headers["x-request-id"]).toBeTruthy();
    }
    expect(ensure).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate Authorization fields and non-exact path aliases", async () => {
    const { app, ensure } = appFor();
    const { request } = await loopback.open({ app });
    const duplicate = await request
      .post("/api/music/identity/ensure")
      .set("authorization", ["Bearer proof-with-enough-entropy", "Bearer second-proof-with-entropy"]);
    expect(duplicate.status).toBe(401);
    await request.post("/api/music/identity/ensure/").set("authorization", "Bearer proof-with-enough-entropy").expect(404);
    await request.post("/API/music/identity/ensure").set("authorization", "Bearer proof-with-enough-entropy").expect(404);
    expect(ensure).not.toHaveBeenCalled();
  });

  it("replaces unsafe request IDs and emits safe 429/503 responses with Retry-After", async () => {
    const unavailable = vi.fn(async () => {
      throw new MusicIdentityError("UPSTREAM_UNAVAILABLE", 503, "Music identity is temporarily unavailable.", "retry", true, 3);
    });
    const { app, logs } = appFor(unavailable);
    const { request } = await loopback.open({ app });
    const response = await request
      .post("/api/music/identity/ensure")
      .set("authorization", "Bearer sentinel-secret-proof")
      .set("x-request-id", "unsafe/value");
    expect(response.status).toBe(503);
    expect(response.headers["retry-after"]).toBe("3");
    expect(response.headers["x-request-id"]).toBe("generated-request-id");
    const serialized = JSON.stringify({ body: response.body, logs });
    expect(serialized).not.toContain("sentinel-secret-proof");
    expect(serialized).not.toContain("unsafe");
    expect(serialized).not.toContain("stack");
  });

  it("emits deterministic SLO evidence with only sanitized correlation metadata", async () => {
    const timestamps = [10_000, 10_037];
    const { app, logs } = appWithClock(() => timestamps.shift() ?? 10_037);

    const { request } = await loopback.open({ app });
    await request.post("/api/music/identity/ensure")
      .set("authorization", "Bearer sentinel-secret-proof")
      .set("x-request-id", "qualified-request-1")
      .expect(200);

    expect(logs).toEqual([{
      event: "music_identity_ensure",
      outcome: "success",
      status: 200,
      latencyMs: 37,
      requestId: "qualified-request-1",
    }]);
    expect(Object.keys(logs[0] as object).sort()).toEqual([
      "event", "latencyMs", "outcome", "requestId", "status",
    ]);
    expect(JSON.stringify(logs)).not.toContain("sentinel-secret-proof");
  });

  it("keeps every runtime status, body, and mandatory header in shared/OpenAPI client parity", async () => {
    const cases: Array<[number, () => Promise<never>]> = [
      [400, async () => { throw new MusicIdentityError("REQUEST_INVALID", 400, "Invalid request.", "none", false); }],
      [401, async () => { throw new MusicIdentityError("AUTH_INVALID", 401, "Invalid proof.", "authenticate", false); }],
      [403, async () => { throw new MusicIdentityError("IDENTITY_INELIGIBLE", 403, "Ineligible.", "complete_onboarding", false); }],
      [409, async () => { throw new MusicIdentityError("IDENTITY_CONFLICT", 409, "Conflict.", "contact_support", false); }],
      [429, async () => { throw new MusicIdentityError("RATE_LIMITED", 429, "Rate limited.", "retry", true, 7); }],
      [502, async () => { throw new MusicIdentityError("UPSTREAM_MALFORMED", 502, "Malformed upstream.", "retry", true); }],
      [503, async () => { throw new MusicIdentityError("UPSTREAM_UNAVAILABLE", 503, "Unavailable.", "retry", true, 9); }],
    ];
    const successHarness = appFor();
    const { request: successRequest } = await loopback.open({ app: successHarness.app });
    const success = await successRequest.post("/api/music/identity/ensure")
      .set("authorization", "Bearer parity-proof-with-entropy");
    expect(parseMusicIdentityClientResponse(success.status, success.headers, success.body).status).toBe(200);
    for (const [status, operation] of cases) {
      const statusHarness = appFor(vi.fn(operation));
      const { request: statusRequest } = await loopback.open({ app: statusHarness.app });
      const response = await statusRequest.post("/api/music/identity/ensure")
        .set("authorization", `Bearer parity-proof-${status}-with-entropy`);
      expect(response.status).toBe(status);
      expect(parseMusicIdentityClientResponse(response.status, response.headers, response.body).status).toBe(status);
    }
    const internalHarness = appFor(vi.fn(async () => { throw new Error("sentinel stack"); }));
    const { request: internalRequest } = await loopback.open({ app: internalHarness.app });
    const internal = await internalRequest
      .post("/api/music/identity/ensure").set("authorization", "Bearer parity-internal-proof");
    expect(internal.status).toBe(500);
    expect(parseMusicIdentityClientResponse(internal.status, internal.headers, internal.body).status).toBe(500);
    const undocumentedHarness = appFor(vi.fn(async () => {
      throw new MusicIdentityError("REQUEST_INVALID", 418, "Undocumented.", "none", false);
    }));
    const { request: undocumentedRequest } = await loopback.open({ app: undocumentedHarness.app });
    const undocumented = await undocumentedRequest.post("/api/music/identity/ensure").set("authorization", "Bearer undocumented-proof-with-entropy");
    expect(undocumented.status).toBe(500);
    expect(MUSIC_IDENTITY_RESPONSE_STATUSES).toEqual([200, 400, 401, 403, 409, 429, 500, 502, 503]);
    expect(() => parseMusicIdentityClientResponse(503, { "x-request-id": "request" }, {
      version: "music-error/v1",
      error: { code: "UPSTREAM_UNAVAILABLE", message: "Unavailable.", action: "retry", retryable: true, requestId: "request" },
    })).toThrow(/Retry-After/);
  });

  it("coalesces the whole 50-way operation for one proof", async () => {
    let calls = 0;
    const ensure = vi.fn(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        id: 9,
        strapiUserDocumentId: "user-doc",
        strapiAccountDocumentId: "account-doc",
        identityStatus: "active" as const,
        sessionVersion: 1,
      };
    });
    const { MusicProjectionService } = await import("../services/musicProjectionService");
    const service = new MusicProjectionService({ resolve: async () => ({
      userDocumentId: "user-doc",
      accountDocumentId: "account-doc",
      username: "astronaut",
      email: "safe@example.invalid",
      provider: "local" as const,
      accountName: "Moon Room",
      accountType: "Venue",
      accountMobile: "+15555550100",
    }) }, { ensureIdentity: ensure } as never);
    const results = await Promise.all(Array.from({ length: 50 }, (_, index) =>
      service.ensure("one-shared-proof", `request-${index}`)));
    expect(new Set(results.map((item) => item.id))).toEqual(new Set([9]));
    expect(calls).toBe(1);
    expect(service.stats().inflight).toBe(0);
  });

  it("hard-caps distinct whole-operation single-flight entries", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const { MusicProjectionService } = await import("../services/musicProjectionService");
    const service = new MusicProjectionService({
      resolve: async () => {
        await blocked;
        throw new MusicIdentityError("AUTH_INVALID", 401, "The Explorer proof is invalid or expired.", "authenticate", false);
      },
    }, { ensureIdentity: vi.fn() } as never, 2);
    const work = [
      service.ensure("distinct-proof-one", "request-one"),
      service.ensure("distinct-proof-two", "request-two"),
      service.ensure("distinct-proof-three", "request-three"),
    ];
    expect(service.stats()).toMatchObject({ inflight: 2, peakInflight: 2 });
    await expect(work[2]).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE", status: 503 });
    release();
    await Promise.allSettled(work.slice(0, 2));
  });

  it("keeps the exact upstream budget at two calls for a 50-way same-proof load", async () => {
    const { StrapiIdentityGateway } = await import("../services/strapiIdentityGateway");
    const fetchImpl = vi.fn<typeof fetch>()
      .mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 15));
        return new Response(JSON.stringify({
          documentId: "load-user", username: "load", email: "load@example.invalid",
          provider: "local", confirmed: true, blocked: false,
        }), { status: 200 });
      })
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{
        documentId: "load-account", Account_Name: "Load", Account_Type: "Venue", mobile_number: "+15555550111",
      }], meta: { pagination: { page: 1, pageSize: 50, pageCount: 1, total: 1 } } }), { status: 200 }));
    const gateway = new StrapiIdentityGateway({
      baseUrl: "https://strapi.invalid", fetchImpl, maxConcurrency: 2, retries: 0,
      maxPending: 4,
      connectTimeoutMs: 100, readTimeoutMs: 100, overallTimeoutMs: 500, cacheTtlMs: 1_000,
      circuitFailureThreshold: 2, circuitOpenMs: 100,
    });
    const ensureIdentity = vi.fn(async () => ({
      id: 77, strapiUserDocumentId: "load-user", strapiAccountDocumentId: "load-account",
      identityStatus: "active" as const, sessionVersion: 1,
    }));
    const { MusicProjectionService } = await import("../services/musicProjectionService");
    const service = new MusicProjectionService(gateway, { ensureIdentity });
    const results = await Promise.all(Array.from({ length: 50 }, (_, index) => service.ensure("same-load-proof-with-entropy", `load-${index}`)));
    expect(new Set(results.map(({ id }) => id))).toEqual(new Set([77]));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(ensureIdentity).toHaveBeenCalledTimes(1);
    expect(service.stats().coalesced).toBe(49);
  });

  it("bounds a same-source invalid-proof storm before upstream amplification", async () => {
    const ensure = vi.fn(async () => {
      throw new MusicIdentityError("AUTH_INVALID", 401, "The Explorer proof is invalid or expired.", "authenticate", false);
    });
    const app = express();
    setupMusicIdentityBodylessPreflight(app);
    setupMusicIdentityRoutes(app, {
      ...routeCredentialDependencies,
      ensure,
      limiter: new BoundedIdentityRateLimiter({ limit: 3, windowMs: 60_000, maxEntries: 8 }),
      fingerprint: (proof) => proof,
    });
    const { request } = await loopback.open({ app });
    const responses = await Promise.all(Array.from({ length: 20 }, (_, index) => request
      .post("/api/music/identity/ensure")
      .set("authorization", `Bearer invalid-proof-${index}-with-entropy`)));
    expect(ensure).toHaveBeenCalledTimes(3);
    expect(responses.filter(({ status }) => status === 429)).toHaveLength(17);
    expect(responses.every(({ body }) => musicErrorEnvelopeSchema.safeParse(body).success)).toBe(true);
  });

  it("uses only the rightmost client set by one trusted proxy hop and ignores forged XFF prefixes", async () => {
    const ensure = vi.fn(async () => ({
      id: 52,
      strapiUserDocumentId: "proxy-user",
      strapiAccountDocumentId: "proxy-account",
      identityStatus: "active" as const,
      sessionVersion: 1,
    }));
    const app = proxyAppFor(ensure);
    const { request } = await loopback.open({ app });
    const bearer = "Bearer proof-with-proxy-entropy";
    await request.post("/api/music/identity/ensure")
      .set("authorization", bearer).set("x-forwarded-for", "192.0.2.10, 203.0.113.20").expect(200);
    const forged = await request.post("/api/music/identity/ensure")
      .set("authorization", bearer).set("x-forwarded-for", "198.51.100.99, 203.0.113.20");
    expect(forged.status).toBe(429);
    expect(forged.headers["retry-after"]).toBeTruthy();
    await request.post("/api/music/identity/ensure")
      .set("authorization", "Bearer second-proof-with-proxy-entropy")
      .set("x-forwarded-for", "192.0.2.10, 203.0.113.21").expect(200);
    expect(ensure).toHaveBeenCalledTimes(2);
  });

  it("ignores all forwarded addresses when the direct peer is not the configured proxy", async () => {
    const ensure = vi.fn(async () => ({
      id: 53,
      strapiUserDocumentId: "direct-user",
      strapiAccountDocumentId: "direct-account",
      identityStatus: "active" as const,
      sessionVersion: 1,
    }));
    const app = express();
    app.set("trust proxy", 1);
    setupMusicIdentityRoutes(app, {
      ...routeCredentialDependencies,
      ensure,
      trustedProxyHops: 1,
      isTrustedProxy: () => false,
      limiter: new BoundedIdentityRateLimiter({ limit: 1, windowMs: 60_000, maxEntries: 10 }),
    });
    const { request } = await loopback.open({ app });
    await request.post("/api/music/identity/ensure")
      .set("authorization", "Bearer direct-proof-with-enough-entropy")
      .set("x-forwarded-for", "203.0.113.10").expect(200);
    await request.post("/api/music/identity/ensure")
      .set("authorization", "Bearer direct-proof-with-enough-entropy")
      .set("x-forwarded-for", "203.0.113.11").expect(429);
  });

  it("bounds multi-source rotating proofs behind one trusted proxy across limiter, inflight map, queue, and fetch", async () => {
    const { StrapiIdentityGateway } = await import("../services/strapiIdentityGateway");
    const { MusicProjectionService } = await import("../services/musicProjectionService");
    let activeFetches = 0;
    let peakFetches = 0;
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      activeFetches += 1;
      peakFetches = Math.max(peakFetches, activeFetches);
      await new Promise((resolve) => setTimeout(resolve, 50));
      activeFetches -= 1;
      return new Response("{}", { status: 401 });
    });
    const gateway = new StrapiIdentityGateway({
      baseUrl: "https://strapi.invalid",
      fetchImpl,
      maxConcurrency: 2,
      maxPending: 4,
      retries: 0,
      connectTimeoutMs: 100,
      readTimeoutMs: 100,
      overallTimeoutMs: 200,
      cacheTtlMs: 0,
      circuitFailureThreshold: 100,
      circuitOpenMs: 100,
    });
    const service = new MusicProjectionService(gateway, { ensureIdentity: vi.fn() }, 5);
    const app = express();
    const isTrustedProxy = (peer: string | undefined) => peer === "127.0.0.1" || peer === "::ffff:127.0.0.1" || peer === "::1";
    app.set("trust proxy", isTrustedProxy);
    setupMusicIdentityBodylessPreflight(app);
    setupMusicIdentityRoutes(app, {
      ...routeCredentialDependencies,
      ensure: (proof, requestId) => service.ensure(proof, requestId),
      trustedProxyHops: 1,
      isTrustedProxy,
      limiter: new BoundedIdentityRateLimiter({ limit: 100, globalLimit: 100, windowMs: 60_000, maxEntries: 100 }),
    });
    const { request } = await loopback.open({ app });
    const responses = await Promise.all(Array.from({ length: 20 }, (_, index) => request
      .post("/api/music/identity/ensure")
      .set("authorization", `Bearer rotating-proxy-proof-${index}-entropy`)
      .set("x-forwarded-for", `192.0.2.${index + 1}, 203.0.113.${index + 1}`)));
    expect(responses.every(({ status }) => status === 401 || status === 503)).toBe(true);
    expect(responses.filter(({ status }) => status === 503)
      .every(({ headers }) => /^[1-9][0-9]*$/.test(headers["retry-after"]))).toBe(true);
    expect(gateway.stats().peakPending).toBeLessThanOrEqual(4);
    expect(service.stats().peakInflight).toBeLessThanOrEqual(5);
    expect(peakFetches).toBeLessThanOrEqual(2);
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(4);
  });
});
