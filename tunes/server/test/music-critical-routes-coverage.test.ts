import express, { type Request, type Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MusicIdentityError } from "../../shared/musicError";
import { BoundedIdentityRateLimiter } from "../middleware/identityRateLimit";
import { MusicPrincipalError } from "../middleware/musicPrincipal";
import {
  setupMusicIdentityRoutes,
  type MusicIdentityRouteDependencies,
} from "../routes/musicIdentityRoutes";
import { createLoopbackSupertestScope } from "./helpers/loopback-supertest";

const loopback = createLoopbackSupertestScope();
afterEach(async () => loopback.closeAll());

const projection = {
  id: 41,
  strapiUserDocumentId: "user-document-41",
  strapiAccountDocumentId: "account-document-41",
  identityStatus: "active" as const,
  sessionVersion: 7,
};

const lifecycleStatus = {
  operationId: "e36d710f-a5d3-4476-9d2f-34226a2af4aa",
  musicUserId: 41,
  identityStatus: "pending_deletion" as const,
  phase: "prepared" as const,
  state: "completed" as const,
  boundaryCrossed: false,
  retryable: false,
  deadLetter: false,
  upstreamUserDocumentId: "user-document-41",
  upstreamAccountDocumentId: "account-document-41",
};

function dependencies(overrides: Partial<MusicIdentityRouteDependencies> = {}): MusicIdentityRouteDependencies {
  return {
    ensure: async () => projection,
    mintCredential: () => ({ token: `fixture.${"x".repeat(64)}`, expiresAt: 1_800_000_600_000 }),
    resolvePrincipal: async () => ({
      musicUserId: 41,
      subject: "user-document-41",
      accountDocumentId: "account-document-41",
      sessionVersion: 7,
    }),
    lifecycle: {
      prepareDeletion: async () => lifecycleStatus,
      status: async () => lifecycleStatus,
      markDeletionBoundary: async () => ({ ...lifecycleStatus, boundaryCrossed: true, state: "requested" as const }),
      cancelDeletion: async () => ({ ...lifecycleStatus, identityStatus: "suspended" as const, state: "cancelled" as const }),
      suspendFromProof: async () => ({ identityStatus: "suspended" as const }),
    } as never,
    limiter: new BoundedIdentityRateLimiter({ limit: 100, windowMs: 60_000, maxEntries: 200 }),
    logger: vi.fn(),
    fingerprint: () => "safe-fingerprint",
    requestIdFactory: () => "generated-request",
    ...overrides,
  };
}

function appFor(overrides: Partial<MusicIdentityRouteDependencies> = {}, preflight = false) {
  const app = express();
  if (preflight) {
    // Existing preflight behavior is covered in the primary route suite. These
    // tests intentionally reach the route-local bodyless assertions.
  }
  setupMusicIdentityRoutes(app, dependencies(overrides));
  return app;
}

function bearer(value = "b".repeat(32)) {
  return { Authorization: `Bearer ${value}` };
}

describe("C4/C5 identity route critical coverage", () => {
  it.each(["suspended", "pending_deletion"] as const)("refuses projected %s identity before minting", async (identityStatus) => {
    const mintCredential = vi.fn();
    const app = appFor({ ensure: async () => ({ ...projection, identityStatus }), mintCredential });
    const { request } = await loopback.open({ app });
    const response = await request.post("/api/music/identity/ensure").set(bearer());
    expect(response.status).toBe(identityStatus === "suspended" ? 403 : 409);
    expect(response.body.error.code).toBe(identityStatus === "suspended" ? "IDENTITY_SUSPENDED" : "IDENTITY_PENDING_DELETION");
    expect(mintCredential).not.toHaveBeenCalled();
  });

  it("executes the lifecycle boundary operation and rejects Music proof on suspension", async () => {
    const lifecycle = dependencies().lifecycle!;
    const app = appFor({ lifecycle, isMusicCredential: (proof) => proof.startsWith("music.") });
    const { request } = await loopback.open({ app });
    const boundary = await request.post("/api/music/identity/lifecycle/boundary").set(bearer()).expect(200);
    expect(boundary.body.operation).toMatchObject({ boundaryCrossed: true, state: "requested" });
    const rejected = await request.post("/api/music/identity/lifecycle/suspend")
      .set(bearer("music.local.credential.with.entropy"));
    expect(rejected.status).toBe(401);
    expect(rejected.body.error.code).toBe("AUTH_INVALID");
  });

  it("rate-limits ordinary and suspension lifecycle work with a bounded default retry", async () => {
    const limiter = { check: vi.fn(() => ({ allowed: false, retryAfterSeconds: undefined })) };
    const app = appFor({ limiter: limiter as never });
    const { request } = await loopback.open({ app });
    for (const path of ["identity/ensure", "identity/lifecycle/prepare", "identity/lifecycle/suspend"]) {
      const response = await request.post(`/api/music/${path}`).set(bearer());
      expect(response.status).toBe(429);
      expect(response.headers["retry-after"]).toBe("1");
    }
    expect(limiter.check).toHaveBeenCalledTimes(3);
  });

  it("maps database-shaped failures for ensure, lifecycle, suspension, and current principal", async () => {
    const unavailable = Object.assign(new Error("unsafe database detail"), { code: "ECONNREFUSED" });
    const lifecycle = {
      ...dependencies().lifecycle!,
      prepareDeletion: async () => { throw unavailable; },
      suspendFromProof: async () => { throw unavailable; },
    };
    const app = appFor({
      ensure: async () => { throw unavailable; },
      lifecycle,
      resolvePrincipal: async () => { throw unavailable; },
    });
    const { request } = await loopback.open({ app });
    for (const operation of [
      request.post("/api/music/identity/ensure").set(bearer()),
      request.post("/api/music/identity/lifecycle/prepare").set(bearer()),
      request.post("/api/music/identity/lifecycle/suspend").set(bearer()),
      request.get("/api/music/identity/current").set("Authorization", "Bearer valid.music.credential"),
    ]) {
      const response = await operation;
      expect(response.status).toBe(503);
      expect(response.headers["retry-after"]).toBe("2");
      expect(response.body.error.code).toBe("DATABASE_UNAVAILABLE");
    }
  });

  it.each([
    [new MusicPrincipalError("IDENTITY_SUSPENDED", 403, "Suspended"), "IDENTITY_SUSPENDED"],
    [new MusicPrincipalError("IDENTITY_PENDING_DELETION", 409, "Pending"), "IDENTITY_PENDING_DELETION"],
  ] as const)("maps principal state %s", async (failure, code) => {
    const app = appFor({ resolvePrincipal: async () => { throw failure; } });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/music/identity/current")
      .set("Authorization", "Bearer valid.music.credential");
    expect(response.status).toBe(failure.status);
    expect(response.body.error.code).toBe(code);
    expect(response.body.error.action).toBe("contact_support");
  });

  it("contains invalid-status Music errors as internal failures", async () => {
    const app = appFor({
      ensure: async () => { throw new MusicIdentityError("INTERNAL_ERROR", 200, "unsafe", "retry", true); },
    });
    const { request } = await loopback.open({ app });
    const response = await request.post("/api/music/identity/ensure").set(bearer());
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
    expect(response.body.error.message).not.toContain("unsafe");
  });

  it("rejects route-local transfer encoding and owner input", async () => {
    const app = appFor();
    const { request } = await loopback.open({ app });
    await request.post("/api/music/identity/ensure").set(bearer()).set("Transfer-Encoding", "chunked").send("x").expect(400);
    await request.post("/api/music/identity/ensure").set(bearer()).set("X-Owner-Id", "41").expect(400);
  });

  it("defaults missing retry metadata on every retryable route response", async () => {
    const unavailable = new MusicIdentityError(
      "UPSTREAM_UNAVAILABLE", 503, "Unavailable", "retry", true,
    );
    const lifecycle = {
      ...dependencies().lifecycle!,
      prepareDeletion: async () => { throw unavailable; },
      suspendFromProof: async () => { throw unavailable; },
    };
    const app = appFor({
      ensure: async () => { throw unavailable; },
      lifecycle,
      resolvePrincipal: async () => { throw unavailable; },
    });
    const { request } = await loopback.open({ app });
    for (const operation of [
      request.post("/api/music/identity/ensure").set(bearer()),
      request.post("/api/music/identity/lifecycle/prepare").set(bearer()),
      request.post("/api/music/identity/lifecycle/suspend").set(bearer()),
      request.get("/api/music/identity/current").set("Authorization", "Bearer valid.music.credential"),
    ]) {
      const response = await operation;
      expect(response.status).toBe(503);
      expect(response.headers["retry-after"]).toBe("1");
    }
  });

  it("uses unknown as the bounded source when a trusted peer has no derived address", async () => {
    const posts = new Map<string, Array<(req: Request, res: Response) => Promise<unknown>>>();
    const fakeApp = {
      post: (path: string, ...handlers: Array<(req: Request, res: Response) => Promise<unknown>>) => posts.set(path, handlers),
      get: vi.fn(),
    } as unknown as express.Express;
    const check = vi.fn(() => ({ allowed: true }));
    setupMusicIdentityRoutes(fakeApp, dependencies({
      limiter: { check } as never,
      trustedProxyHops: 1,
      isTrustedProxy: () => true,
    }));

    const makeResponse = () => {
      const headers: Record<string, string> = {};
      const response = {
        setHeader: (name: string, value: string) => { headers[name] = value; },
        status: vi.fn(function status(this: object) { return this; }),
        json: vi.fn(function json(this: object) { return this; }),
      };
      return response as unknown as Response;
    };
    const makeRequest = () => ({
      path: "/api/music/identity/ensure",
      rawHeaders: ["authorization", `Bearer ${"b".repeat(32)}`],
      get: () => undefined,
      query: {},
      socket: { remoteAddress: undefined },
      ip: undefined,
    } as unknown as Request);

    await posts.get("/api/music/identity/ensure")![0](makeRequest(), makeResponse());
    await posts.get("/api/music/identity/lifecycle/prepare")![0](makeRequest(), makeResponse());
    await posts.get("/api/music/identity/lifecycle/suspend")![0](makeRequest(), makeResponse());
    const directPosts = new Map<string, Array<(req: Request, res: Response) => Promise<unknown>>>();
    const directApp = {
      post: (path: string, ...handlers: Array<(req: Request, res: Response) => Promise<unknown>>) => directPosts.set(path, handlers),
      get: vi.fn(),
    } as unknown as express.Express;
    setupMusicIdentityRoutes(directApp, dependencies({ limiter: { check } as never }));
    await directPosts.get("/api/music/identity/ensure")![0](makeRequest(), makeResponse());
    await directPosts.get("/api/music/identity/lifecycle/prepare")![0](makeRequest(), makeResponse());
    await directPosts.get("/api/music/identity/lifecycle/suspend")![0](makeRequest(), makeResponse());
    expect(check).toHaveBeenCalledTimes(6);
    expect(check.mock.calls.every(([source]) => source === "unknown")).toBe(true);
  });

  it("contains a direct route body and a missing raw header name", async () => {
    let ensureHandler!: (req: Request, res: Response) => Promise<unknown>;
    const fakeApp = {
      post: (path: string, handler: typeof ensureHandler) => {
        if (path === "/api/music/identity/ensure") ensureHandler = handler;
      },
      get: vi.fn(),
    } as unknown as express.Express;
    setupMusicIdentityRoutes(fakeApp, dependencies({ lifecycle: undefined }));
    const bodies: unknown[] = [];
    const response = {
      setHeader: vi.fn(),
      status: vi.fn(function status(this: object) { return this; }),
      json: vi.fn((body: unknown) => { bodies.push(body); return response; }),
    } as unknown as Response;

    await ensureHandler({
      path: "/api/music/identity/ensure",
      rawHeaders: ["authorization", `Bearer ${"b".repeat(32)}`],
      get: (name: string) => name === "content-length" ? "1" : undefined,
      query: {},
    } as unknown as Request, response);
    await ensureHandler({
      path: "/api/music/identity/ensure",
      rawHeaders: [undefined as unknown as string, "ignored"],
      get: () => undefined,
      query: {},
    } as unknown as Request, response);
    await ensureHandler({
      path: "/api/music/identity/ensure",
      rawHeaders: ["authorization"],
      get: () => undefined,
      query: {},
    } as unknown as Request, response);
    expect(bodies).toHaveLength(3);
    expect(bodies).toEqual(expect.arrayContaining([
      expect.objectContaining({ error: expect.objectContaining({ code: "REQUEST_INVALID" }) }),
      expect.objectContaining({ error: expect.objectContaining({ code: "AUTH_REQUIRED" }) }),
    ]));
  });

  it("emits every bounded telemetry classification without identity material", async () => {
    const cases = [
      {
        before: undefined,
        after: { upstreamCalls: 2, retries: 1, circuitState: "open" as const, cacheHits: 0, cacheMisses: 0, coalesced: 0 },
        ensure: async () => projection,
        expected: { singleFlight: "leader", cache: "none", conflict: "none" },
      },
      {
        before: { upstreamCalls: 1, retries: 0, circuitState: "closed" as const, cacheHits: 0, cacheMisses: 0, coalesced: 0 },
        after: { upstreamCalls: 2, retries: 1, circuitState: "closed" as const, cacheHits: 1, cacheMisses: 0, coalesced: 1 },
        ensure: async () => { throw new MusicIdentityError("IDENTITY_CONFLICT", 409, "conflict", "contact_support", false, undefined, "account"); },
        expected: { singleFlight: "coalesced", cache: "hit", conflict: "account" },
      },
      {
        before: { upstreamCalls: 1, retries: 0, circuitState: "closed" as const, cacheHits: 0, cacheMisses: 0, coalesced: 0 },
        after: { upstreamCalls: 1, retries: 0, circuitState: "closed" as const, cacheHits: 0, cacheMisses: 1, coalesced: 0 },
        ensure: async () => projection,
        expected: { singleFlight: "leader", cache: "miss", conflict: "none" },
      },
    ];
    for (const item of cases) {
      const telemetry = vi.fn().mockReturnValueOnce(item.before).mockReturnValueOnce(item.after);
      const metrics = vi.fn();
      const app = appFor({ telemetry, metrics, ensure: item.ensure });
      const { request } = await loopback.open({ app });
      await request.post("/api/music/identity/ensure").set(bearer());
      expect(metrics).toHaveBeenCalledWith(expect.objectContaining(item.expected));
    }
  });

  it("uses safe default logger, fingerprint, and request-id dependencies", async () => {
    const logger = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const app = express();
    const values = dependencies();
    delete values.logger;
    delete values.fingerprint;
    delete values.requestIdFactory;
    setupMusicIdentityRoutes(app, values);
    const { request } = await loopback.open({ app });
    const response = await request.post("/api/music/identity/ensure").set(bearer());
    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(logger).toHaveBeenCalledOnce();
    logger.mockRestore();
  });

  it("returns 404 if a captured ensure request path no longer matches exactly", async () => {
    let ensureHandler!: (req: Request, res: Response) => Promise<unknown>;
    const fakeApp = {
      post: (path: string, handler: typeof ensureHandler) => {
        if (path === "/api/music/identity/ensure") ensureHandler = handler;
      },
      get: vi.fn(),
    } as unknown as express.Express;
    setupMusicIdentityRoutes(fakeApp, dependencies({ lifecycle: undefined }));
    const end = vi.fn();
    const status = vi.fn(() => ({ end }));
    await ensureHandler({ path: "/api/music/identity/other" } as Request, { status } as unknown as Response);
    expect(status).toHaveBeenCalledWith(404);
    expect(end).toHaveBeenCalledOnce();
  });
});
