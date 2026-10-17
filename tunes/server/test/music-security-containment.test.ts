import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { request as rawHttpRequest } from "node:http";
import jwt from "jsonwebtoken";
import {
  openLoopbackSupertest,
  type LoopbackSupertestResponse,
  type LoopbackSupertestSession,
} from "./helpers/loopback-supertest";

vi.mock("dotenv", () => {
  throw new Error("DEFAULT_TEST_DOTENV_IMPORT_FORBIDDEN");
});

const databaseBoundary = vi.hoisted(() => {
  const unexpected: string[] = [];
  const reject = (operation: string) => (..._args: unknown[]): never => {
    unexpected.push(operation);
    throw new Error(`Unexpected database use: ${operation}`);
  };
  return {
    unexpected,
    pool: {
      query: reject("pool.query"),
      connect: reject("pool.connect"),
      end: reject("pool.end"),
    },
  };
});

vi.mock("../db", () => ({ pool: databaseBoundary.pool }));

const unexpectedFetch: string[] = [];
const rejectFetch = async () => {
  unexpectedFetch.push("fetch");
  throw new Error("Unexpected upstream fetch in containment test");
};

const TEST_JWT_SECRET = "containment-test-jwt-secret-with-sufficient-length";
const OWNER = {
  id: 41,
  username: "owner",
  email: "owner@example.test",
  password: "",
  guestUrl: "public-room-owner",
  isEmailVerified: true,
  isAdmin: false,
};

vi.mock("../storage", async () => {
  const session = (await import("express-session")).default;
  return { storage: {
    sessionStore: new session.MemoryStore(),
    getUser: vi.fn(async (id: number) => id === OWNER.id ? OWNER : undefined),
    getUserByUsername: vi.fn(async (username: string) => username === OWNER.username ? OWNER : undefined),
    getUserByEmail: vi.fn(async () => undefined),
    createUser: vi.fn(async () => { throw new Error("registration must remain unreachable"); }),
    createUserSession: vi.fn(async () => undefined),
  } };
});

vi.mock("../services/musicReconciliationSuspensionListener", () => ({
  startMusicReconciliationSuspensionListener: vi.fn(async () => ({ stop: vi.fn(async () => undefined) })),
}));
// This route-security suite is DB-free; the PostgreSQL notification transport
// has its own listener tests and must not connect during app composition here.
// DB-free HTTP containment has no background-retention database authority.
// Real immediate/non-overlapping retention and shutdown are tested separately.
vi.mock("../application/analyticsMaintenance", () => ({
  startAnalyticsMaintenance: vi.fn(() => vi.fn(async () => undefined)),
}));

vi.mock("../services/musicPublicChangeListener", () => ({
  startMusicPublicChangeListener: vi.fn(async () => ({ stop: vi.fn(async () => undefined) })),
}));

vi.mock("../repositories/musicPublicationOperationRepository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../repositories/musicPublicationOperationRepository")>();
  return {
    ...actual,
    MusicPublicationOperationRepository: class extends actual.MusicPublicationOperationRepository {
      override async verifyReplayReadiness(): Promise<void> {}
    },
  };
});

const { createValidatedApp } = await import("../config/music-startup");
const { storage } = await import("../storage");
const {
  consumeContainmentLimit,
  consumePublicSurfaceLimit,
  resetContainmentLimiters,
} = await import("../security-containment");

async function createApp() {
  const inheritedDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    return await createValidatedApp(process.env, {
      readSecretFile: async () => Buffer.alloc(32, 0x6d).toString("base64url"),
      verifyDatabaseConnection: async () => undefined,
    });
  } finally {
    if (inheritedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = inheritedDatabaseUrl;
  }
}

function expectRequestBoundError(response: LoopbackSupertestResponse, code: string) {
  expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/i);
  expect(response.body.error).toEqual(expect.objectContaining({
    code,
    message: expect.any(String),
    action: expect.any(String),
    retryable: expect.any(Boolean),
    requestId: response.headers["x-request-id"],
  }));
}

describe("C1 containment floor under the C6 principal boundary", () => {
  let server: Awaited<ReturnType<typeof createApp>>["server"];
  let session!: LoopbackSupertestSession;
  let baselineRequestTimeout: number;

  beforeAll(async () => {
    vi.stubGlobal("fetch", vi.fn(rejectFetch));
    const { hashPassword } = await import("../auth");
    OWNER.password = await hashPassword("correct horse battery staple");
    process.env.STRAPI_JWT_SECRET = TEST_JWT_SECRET;
    process.env.ALLOWED_ORIGINS = "https://explorers.example.test";
    vi.stubEnv("STRAPI_ANALYTICS_ACCESS_TOKEN", "containment-test-analytics-token");
    ({ server } = await createApp());
    baselineRequestTimeout = server.requestTimeout;
    session = await openLoopbackSupertest({ server });
  });

  afterAll(async () => {
    const failures: unknown[] = [];
    try {
      try { expect(databaseBoundary.unexpected).toEqual([]); } catch (error) { failures.push(error); }
      try { expect(unexpectedFetch).toEqual([]); } catch (error) { failures.push(error); }
    } finally {
      try {
        if (session) await session.close();
      } catch (error) {
        failures.push(error);
      } finally {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, "containment cleanup failed");
  }, 5_000);

  beforeEach(() => {
    resetContainmentLimiters();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    global.fetch = vi.fn(rejectFetch) as typeof fetch;
  });

  afterEach(() => {
    expect(databaseBoundary.unexpected).toEqual([]);
    expect(unexpectedFetch).toEqual([]);
  });

  it.each([
    ["POST", "/api/auth/sync"],
    ["GET", "/api/auth/user-data?username=victim"],
    ["GET", "/api/auth/onboarding-status?username=victim"],
  ])("tombstones the legacy browser identity bridge: %s %s", async (method, path) => {
    const response = await session.request[method.toLowerCase() as "get"](path).send({ strapiUser: { username: "victim" } });
    expect(response.status).toBe(410);
    expectRequestBoundError(response, "SURFACE_REMOVED");
  });

  it("keeps native registration unreachable before storage", async () => {
    const response = await session.request.post("/api/register").send({ username: "new", password: "secret" });
    expect(response.status).toBe(410);
    expectRequestBoundError(response, "LEGACY_IDENTITY_ROUTE_REMOVED");
    expect(storage.createUser).not.toHaveBeenCalled();
  });

  it.each([
    ["POST", "/graphql"],
    ["POST", "/api/strapi/graphql"],
    ["GET", "/api/strapi/config"],
    ["GET", "/api/debug/strapi"],
  ])("tombstones every GraphQL/service-token proxy before fetch: %s %s", async (method, path) => {
    const response = await session.request[method.toLowerCase() as "get"](path).send({ query: "mutation { deleteUsers }" });
    expect(response.status).toBe(410);
    expectRequestBoundError(response, "SURFACE_REMOVED");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("serves a minimal OpenAPI document containing only live canonical Music endpoints", async () => {
    const response = await session.request.get("/api-docs");
    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.body.openapi).toBe("3.1.0");
    expect(response.body.paths).toHaveProperty("/api/playlists");
    expect(response.body.paths).toHaveProperty("/api/music/identity/ensure");
    expect(response.body.paths).not.toHaveProperty("/graphql");
    expect(Object.keys(response.body.paths)).not.toEqual(expect.arrayContaining([expect.stringMatching(/^\/api\/admin/)]));
  });

  it("keeps representative live failure statuses and bodies in OpenAPI parity", async () => {
    const { musicErrorEnvelopeSchema } = await import("../../shared/musicError");
    const ownerFailure = await session.request.get("/api/playlists").set("X-Request-Id", "openapi-owner-failure");
    const guestFailure = await session.request.post("/api/playlist/public-room-owner/requests")
      .set("Origin", "https://explorers.example.test")
      .set("X-Music-Guest-Capability", "invalid");
    const specification = (await session.request.get("/api-docs")).body;

    expect(specification.paths["/api/playlists"].get.responses).toHaveProperty(String(ownerFailure.status));
    expect(specification.paths["/api/playlist/{guestUrl}/requests"].post.responses).toHaveProperty(String(guestFailure.status));
    expect(musicErrorEnvelopeSchema.parse(ownerFailure.body).error.requestId).toBe(ownerFailure.headers["x-request-id"]);
    expect(musicErrorEnvelopeSchema.parse(guestFailure.body).error.requestId).toBe(guestFailure.headers["x-request-id"]);
  });

  it.each([
    ["GET", "/api/admin/stats"],
    ["POST", "/api/email/send"],
    ["POST", "/api/gemini/generate"],
    ["POST", "/api/instagram/profile"],
    ["GET", "/api/page-contents/privacy"],
    ["POST", "/api/payments/create-order"],
    ["PATCH", "/api/playlists/9/reorder"],
    ["POST", "/api/resend-verification"],
    ["GET", "/api/seo"],
    ["GET", "/api/subscriptions/plans"],
    ["GET", "/api/system-settings/app_url"],
    ["GET", "/api/user/analytics"],
    ["POST", "/api/youtube/search"],
    ["POST", "/api/apps/scrape-url"],
    ["POST", "/api/people/scrape-profile"],
    ["POST", "/api/products/scrape-link"],
    ["GET", "/api/proxy-image"],
    ["GET", "/itunes-api/search"],
    ["GET", "/api"],
    ["GET", "/api/verify-email?token=removed"],
  ])("never leaves a removed family as an unregistered 404: %s %s", async (method, path) => {
    const response = await session.request[method.toLowerCase() as "get"](path).set("Origin", "https://explorers.example.test");
    expect([401, 410]).toContain(response.status);
    expect(response.status).not.toBe(404);
    expectRequestBoundError(response, response.status === 410 ? "SURFACE_REMOVED" : "TOKEN_INVALID");
  });

  it.each([
    ["GET", "/GraphQL/"],
    ["PATCH", "/API/%61UTH"],
    ["DELETE", "/api/admin/"],
    ["PUT", "/API/PAGE-CONTENTS/privacy/"],
    ["POST", "/api/system-settings/"],
    ["GET", "/API/USER/DEVICE/"],
    ["GET", "/api/user/analytics/"],
    ["OPTIONS", "/API/SUBSCRIPTIONS/"],
    ["POST", "/api/youtube/refresh/"],
    ["PATCH", "/API/USER/VENUE/"],
    ["POST", "/api/payments/"],
    ["POST", "/APPS/scrape-url/"],
    ["GET", "/PRODUCTS/scrape-link/"],
    ["POST", "/PEOPLE/scrape-profile/"],
    ["GET", "/PROXY-IMAGE/"],
    ["POST", "/api/instagram/"],
    ["POST", "/API/GEMINI/"],
    ["POST", "/api/email/"],
    ["GET", "/API/SEO/"],
    ["POST", "/api/playlist/import-youtube/"],
  ])("normalizes every retired family and HTTP method to the typed boundary: %s %s", async (method, path) => {
    // Break caught: a case, trailing-slash, encoded, root, or method alias falls through to SPA/plain 404.
    const response = await session.request[method.toLowerCase() as "get"](path)
      .set("Origin", "https://explorers.example.test");
    expect(response.status).toBe(410);
    expect(response.body.version).toBe("music-error/v1");
    expectRequestBoundError(response, "SURFACE_REMOVED");
  });

  it("mounts both public reactivation handlers ahead of the broad user retirement boundary", async () => {
    // Break caught: inventory says these routes are public while the mounted catch-all returns 410 first.
    const requestMissingEmail = await session.request.post("/api/user/request-reactivation").send({});
    const confirmMissingToken = await session.request.get("/api/user/reactivate");
    expect(requestMissingEmail.status).toBe(400);
    expect(requestMissingEmail.body).toEqual({ message: "Email is required" });
    expect(confirmMissingToken.status).toBe(400);
    expect(confirmMissingToken.body).toEqual({ success: false, error: "Token is required" });

    for (const [method, path] of [
      ["get", "/API/%75SER/DEVICE/"],
      ["post", "/api/user/reactivate/extra"],
      ["patch", "/api/user/analytics"],
    ] as const) {
      const retired = await session.request[method](path).set("Origin", "https://explorers.example.test");
      expect(retired.status).toBe(410);
      expect(retired.body.version).toBe("music-error/v1");
      expectRequestBoundError(retired, "SURFACE_REMOVED");
    }
  });

  it("rejects native-session and Strapi bearer substitution on owner surfaces", async () => {
    const strapi = jwt.sign({ id: 9001 }, TEST_JWT_SECRET, { expiresIn: "5m" });
    const sessionOnly = await session.request.get("/api/playlists").set("Cookie", "cosmic.sid=fake-native-session");
    const strapiBearer = await session.request.get("/api/playlists").set("Authorization", `Bearer ${strapi}`);
    expect(sessionOnly.status).toBe(401);
    expect(strapiBearer.status).toBe(401);
    expectRequestBoundError(sessionOnly, "TOKEN_INVALID");
    expectRequestBoundError(strapiBearer, "TOKEN_INVALID");
  });

  it.each([
    ["GET", "/api/subscriptions/user-plans/caller-target"],
    ["GET", "/api/subscriptions/song-limits/caller-target"],
    ["POST", "/api/subscriptions/user-plans"],
    ["POST", "/api/payments/create-order"],
  ])("retires legacy paid caller targets before any upstream access: %s %s", async (method, path) => {
    const response = await session.request[method.toLowerCase() as "get"](path).send({ userId: 999, username: "victim", entitlement: "paid" });
    expect(response.status).toBe(410);
    expectRequestBoundError(response, "SURFACE_REMOVED");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("tombstones admin surfaces because no internal Music admin principal exists", async () => {
    const response = await session.request.get("/api/admin/user/41");
    expect(response.status).toBe(410);
    expectRequestBoundError(response, "SURFACE_REMOVED");
  });

  it("retains exact origin and double-submit CSRF on native session mutations", async () => {
    const missingOrigin = await session.request.post("/api/login").send({ username: OWNER.username, password: "wrong" });
    expect(missingOrigin.status).toBe(403);
    expectRequestBoundError(missingOrigin, "ORIGIN_FORBIDDEN");

    const missingCsrf = await session.request.post("/api/login")
      .set("Origin", "https://explorers.example.test")
      .send({ username: OWNER.username, password: "wrong" });
    expect(missingCsrf.status).toBe(403);
    expectRequestBoundError(missingCsrf, "CSRF_INVALID");
  });

  it("retains bounded payload rejection without reflecting sensitive input", async () => {
    const sentinel = "do-not-reflect-this-password";
    const response = await session.request.post("/api/subscriptions/user-plans")
      .set("Content-Type", "application/json")
      .send({ password: sentinel, padding: "x".repeat(1_000_000) });
    expect(response.status).toBe(413);
    expectRequestBoundError(response, "PAYLOAD_TOO_LARGE");
    expect(JSON.stringify(response.body)).not.toContain(sentinel);
  });

  it("returns the shared Music envelope for malformed JSON without reflecting parser input", async () => {
    const sentinel = "malformed-sensitive-sentinel";
    const response = await session.request.post("/api/playlist/songs")
      .send(`{"title":"${sentinel}"`)
      .set("Content-Type", "application/json")
      .set("X-Request-Id", "parser-request-id")
      ;

    expect(response.status).toBe(400);
    expect(response.headers["x-request-id"]).toBe("parser-request-id");
    expect(response.body).toEqual({
      version: "music-error/v1",
      error: {
        code: "REQUEST_INVALID",
        message: "The Music request body is invalid.",
        action: "none",
        retryable: false,
        requestId: "parser-request-id",
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(sentinel);
  });

  it.each([
    ["JSON", "application/json", JSON.stringify({ password: "oversize-sensitive-sentinel", padding: "x".repeat(70_000) })],
    ["form", "application/x-www-form-urlencoded", `password=oversize-sensitive-sentinel&padding=${"x".repeat(70_000)}`],
  ])("returns a request-bound shared 413 for oversized %s bodies", async (_kind, contentType, body) => {
    const response = await session.request.post("/api/playlist/songs")
      .set("Content-Type", contentType)
      .set("X-Request-Id", "oversize-request-id")
      .send(body);

    expect(response.status).toBe(413);
    expect(response.headers["x-request-id"]).toBe("oversize-request-id");
    expect(response.body.version).toBe("music-error/v1");
    expect(response.body.error).toEqual(expect.objectContaining({
      code: "PAYLOAD_TOO_LARGE",
      requestId: "oversize-request-id",
    }));
    expect(JSON.stringify(response.body)).not.toContain("oversize-sensitive-sentinel");
  });

  it("rejects a declared oversized prefix promptly without awaiting attacker-controlled end", async () => {
    // Break caught: Content-Length is known excessive, but the server waits forever for the peer to finish.
    expect(server.requestTimeout).toBe(baselineRequestTimeout);
    const startedAt = performance.now();
    const result = await new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
      const client = rawHttpRequest({
        host: "127.0.0.1",
        port: session.address.port,
        method: "POST",
        path: "/api/playlist/songs",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(1024 * 1024),
          "X-Request-Id": "raw-oversize-request-id",
        },
      }, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => { body += chunk; });
        response.on("end", () => { clearTimeout(timeout); resolve({ status: response.statusCode ?? 0, headers: response.headers, body }); });
      });
      const timeout = setTimeout(() => { client.destroy(); reject(new Error("oversized prefix response exceeded 500ms")); }, 500);
      timeout.unref();
      client.on("error", reject);
      client.write('{"password":"never-reflect');
    });

    expect(server.requestTimeout).toBe(baselineRequestTimeout);
    expect(performance.now() - startedAt).toBeLessThan(500);
    expect(result.status).toBe(413);
    expect(result.headers["x-request-id"]).toBe("raw-oversize-request-id");
    expect(result.headers.connection).toBe("close");
    expect(JSON.parse(result.body)).toEqual({
      version: "music-error/v1",
      error: expect.objectContaining({ code: "PAYLOAD_TOO_LARGE", requestId: "raw-oversize-request-id" }),
    });
    expect(result.body).not.toContain("never-reflect");
  });

  it("does not reflect an unsafe caller request id", async () => {
    const response = await session.request.post("/api/playlist/songs")
      .send("{")
      .set("Content-Type", "application/json")
      .set("X-Request-Id", "unsafe/request/id")
      ;
    expect(response.status).toBe(400);
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.headers["x-request-id"]).not.toBe("unsafe/request/id");
    expect(response.body.error.requestId).toBe(response.headers["x-request-id"]);
  });

  it("rate-limits repeated legacy identity probes without trusting forwarding headers", async () => {
    let response!: LoopbackSupertestResponse;
    for (let index = 0; index < 31; index += 1) {
      response = await session.request.post("/api/auth/sync").set("X-Forwarded-For", `203.0.113.${index}`);
    }
    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBe("60");
    expectRequestBoundError(response, "RATE_LIMITED");
  });

  it("isolates limiter namespaces and fails closed instead of evicting live authority buckets", () => {
    // Break caught: rotating public keys evict an exhausted authentication bucket from one shared map.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      expect(consumeContainmentLimit("auth:trusted-source", 30, 60_000)).toBe(false);
    }
    for (let key = 0; key < 1_024; key += 1) {
      expect(consumeContainmentLimit(`c6-public-resource:${key}`, 60, 60_000)).toBe(false);
    }
    expect(consumeContainmentLimit("c6-public-resource:saturated", 60, 60_000)).toBe(true);
    expect(consumeContainmentLimit("auth:trusted-source", 30, 60_000)).toBe(true);
  });

  it("layers public global, source, and source-resource limits without sharing one slug budget", () => {
    // Break caught: one visitor exhausts the shared slug bucket for every other legitimate visitor.
    for (let attempt = 0; attempt < 60; attempt += 1) {
      expect(consumePublicSurfaceLimit({ source: "visitor-a", resource: "shared-public-page" })).toBe(false);
    }
    expect(consumePublicSurfaceLimit({ source: "visitor-a", resource: "shared-public-page" })).toBe(true);
    expect(consumePublicSurfaceLimit({ source: "visitor-b", resource: "shared-public-page" })).toBe(false);

    for (let resource = 0; resource < 120; resource += 1) {
      expect(consumePublicSurfaceLimit({ source: "rotating-visitor", resource: `missing-${resource}` })).toBe(false);
    }
    expect(consumePublicSurfaceLimit({ source: "rotating-visitor", resource: "missing-overflow" })).toBe(true);
  });

  it("does not charge source-denied public requests to the global admission budget", () => {
    // Break caught: the global limiter runs before the source limiter, so one
    // denied source can make every other public playlist return 429.
    for (let attempt = 0; attempt < 601; attempt += 1) {
      consumePublicSurfaceLimit({ source: "hostile-source", resource: `rotating-${attempt}` });
    }
    expect(consumePublicSurfaceLimit({ source: "legitimate-source", resource: "public-playlist" })).toBe(false);
  });

  it("does not advertise X-Username through CORS", async () => {
    const response = await session.request.options("/api/playlists")
      .set("Origin", "https://explorers.example.test")
      .set("Access-Control-Request-Method", "GET");
    expect(response.headers["access-control-allow-headers"]?.toLowerCase()).not.toContain("x-username");
    expect(response.headers["access-control-allow-headers"]?.toLowerCase()).toContain("idempotency-key");
    expect(response.headers["access-control-allow-headers"]?.toLowerCase()).toContain("x-music-guest-capability");
    expect(response.headers["access-control-expose-headers"]?.toLowerCase()).toContain("retry-after");
  });
});
