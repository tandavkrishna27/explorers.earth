import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import {
  MusicIdentityError,
  musicErrorEnvelope,
  parseMusicIdentityClientResponse,
} from "../../shared/musicError";
import { BoundedIdentityRateLimiter } from "../middleware/identityRateLimit";
import {
  MusicPrincipalError,
  MusicPrincipalService,
  assertMusicResourceOwner,
  createMusicPrincipalMiddleware,
  resolveMusicPrincipalRequest,
  type MusicPrincipal,
} from "../middleware/musicPrincipal";
import { MusicProjectionService } from "../services/musicProjectionService";
import {
  MusicTokenError,
  MusicTokenService,
  validateMusicTokenConfiguration,
  type MusicTokenConfiguration,
} from "../services/musicTokenService";
import { fingerprintStrapiProof } from "../services/proofFingerprint";

const NOW = 1_800_000_000_000;
const CURRENT_SECRET = Buffer.alloc(32, 0x41).toString("base64url");
const PREVIOUS_SECRET = Buffer.alloc(32, 0x42).toString("base64url");

const configuration = (overrides: Partial<MusicTokenConfiguration> = {}): MusicTokenConfiguration => ({
  current: { kid: "current", secret: CURRENT_SECRET },
  tokenLifetimeSeconds: 600,
  clockSkewSeconds: 15,
  ...overrides,
});

const activeIdentity = {
  id: 41,
  strapiUserDocumentId: "subject-41",
  strapiAccountDocumentId: "account-41",
  identityStatus: "active" as const,
  sessionVersion: 3,
};

const resolvedIdentity = {
  userDocumentId: "subject-41",
  accountDocumentId: "account-41",
  username: "astronaut",
  email: "safe@example.invalid",
  provider: "local" as const,
  accountName: "Moon Room",
  accountType: "Venue",
  accountMobile: "+15555550100",
};

function encodedRaw(raw: string): string {
  return Buffer.from(raw).toString("base64url");
}

function encoded(value: unknown): string {
  return encodedRaw(JSON.stringify(value));
}

function signedToken(headerPart: string, payloadPart: string, secret = CURRENT_SECRET): string {
  const unsigned = `${headerPart}.${payloadPart}`;
  const signature = createHmac("sha256", Buffer.from(secret, "base64url")).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: "explorers-tunes",
    aud: "music-api",
    sub: "subject-41",
    jti: "a".repeat(32),
    iat: NOW / 1_000,
    exp: NOW / 1_000 + 600,
    sessionVersion: 3,
    ...overrides,
  };
}

function tokenService(config = configuration()): MusicTokenService {
  return new MusicTokenService(config, {
    now: () => NOW,
    randomBytes: (size) => Buffer.alloc(size, 0x61),
  });
}

function safeErrorBody(requestId = "request-safe") {
  return musicErrorEnvelope(new MusicIdentityError(
    "UPSTREAM_UNAVAILABLE",
    503,
    "Music identity is temporarily unavailable.",
    "retry",
    true,
    2,
  ), requestId);
}

describe("C4 projection critical coverage", () => {
  it.each([0, 129, 1.5])("rejects an unbounded max-inflight value %s", (maxInflight) => {
    expect(() => new MusicProjectionService(
      { resolve: vi.fn() },
      { ensureIdentity: vi.fn() },
      maxInflight,
    )).toThrow(/bounded integer/);
  });

  it("evicts authoritative proof cache only for identity conflicts", async () => {
    for (const [error, expectedClearCalls] of [
      [new MusicIdentityError("IDENTITY_CONFLICT", 409, "conflict", "contact_support", false), 1],
      [new MusicIdentityError("DATABASE_UNAVAILABLE", 503, "database", "retry", true), 0],
    ] as const) {
      const clear = vi.fn();
      const service = new MusicProjectionService(
        { resolve: async () => resolvedIdentity, clear },
        { ensureIdentity: async () => { throw error; } },
      );
      await expect(service.ensure("proof-with-entropy", "request-safe")).rejects.toBe(error);
      expect(clear).toHaveBeenCalledTimes(expectedClearCalls);
    }

    const withoutClear = new MusicProjectionService(
      { resolve: async () => resolvedIdentity },
      { ensureIdentity: async () => { throw new MusicIdentityError("IDENTITY_CONFLICT", 409, "conflict", "contact_support", false); } },
    );
    await expect(withoutClear.ensure("another-proof", "request-safe")).rejects.toMatchObject({ status: 409 });
  });

  it("does not let a stale completion delete a newer same-proof operation", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const service = new MusicProjectionService(
      { resolve: async () => { await blocked; return resolvedIdentity; } },
      { ensureIdentity: async () => activeIdentity },
    );
    const proof = "stale-proof-with-entropy";
    const original = service.ensure(proof, "request-old");
    const replacement = Promise.resolve({ ...activeIdentity, id: 42 });
    const inflight = (service as unknown as { inflight: Map<string, Promise<typeof activeIdentity>> }).inflight;
    inflight.set(fingerprintStrapiProof(proof), replacement);
    release();
    await expect(original).resolves.toMatchObject({ id: 41 });
    expect(inflight.get(fingerprintStrapiProof(proof))).toBe(replacement);
    inflight.clear();
  });
});

describe("C5 token critical coverage", () => {
  it.each([
    { ...activeIdentity, identityStatus: "suspended" as const },
    { ...activeIdentity, strapiUserDocumentId: " invalid" },
    { ...activeIdentity, sessionVersion: 1.5 },
    { ...activeIdentity, sessionVersion: 0 },
  ])("refuses minting for every invalid identity boundary", (identity) => {
    expect(() => tokenService().mint(identity)).toThrow(expect.objectContaining({ code: "TOKEN_INVALID" }));
  });

  it.each([
    ["lifetime", configuration({ tokenLifetimeSeconds: 599 })],
    ["fractional skew", configuration({ clockSkewSeconds: 1.5 })],
    ["negative skew", configuration({ clockSkewSeconds: -1 })],
    ["excessive skew", configuration({ clockSkewSeconds: 31 })],
    ["invalid current kid", configuration({ current: { kid: " bad", secret: CURRENT_SECRET } })],
    ["invalid current alphabet", configuration({ current: { kid: "current", secret: `${CURRENT_SECRET}=` } })],
    ["short current secret", configuration({ current: { kid: "current", secret: Buffer.alloc(31).toString("base64url") } })],
    ["non-canonical current secret", configuration({ current: { kid: "current", secret: `${CURRENT_SECRET.slice(0, -1)}F` } })],
    ["invalid previous kid", configuration({ previous: { kid: " bad", secret: PREVIOUS_SECRET, acceptUntil: NOW + 1 } })],
    ["duplicate kid", configuration({ previous: { kid: "current", secret: PREVIOUS_SECRET, acceptUntil: NOW + 1 } })],
    ["fractional previous cutoff", configuration({ previous: { kid: "previous", secret: PREVIOUS_SECRET, acceptUntil: NOW + 0.5 } })],
    ["unbounded previous cutoff", configuration({ previous: { kid: "previous", secret: PREVIOUS_SECRET, acceptUntil: NOW + 616_000 } })],
  ])("rejects %s token configuration", (_label, config) => {
    expect(() => validateMusicTokenConfiguration(config, NOW)).toThrow();
  });

  it("fails closed for malformed compact JSON representations", () => {
    const tokens = tokenService();
    const validHeader = encoded({ alg: "HS256", kid: "current" });
    const validClaims = encoded(validPayload());
    const invalidTokens = [
      undefined as unknown as string,
      "x".repeat(4_097),
      `${validHeader}.${validClaims}`,
      `${validHeader}..signature`,
      signedToken("invalid+alphabet", validClaims),
      signedToken(`${validHeader.slice(0, -1)}B`, validClaims),
      signedToken(encodedRaw('{"alg":"HS256","kid":"cur\\rent"}'), validClaims),
      signedToken(encoded(null), validClaims),
      signedToken(encoded([]), validClaims),
      signedToken(validHeader, encodedRaw('{"iss":"explorers-tunes","aud":"music-api","sub":"subject-41","jti":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","iat":1800000000,"exp":1800000600,"sessionVersion":3,"sub":"duplicate"}')),
      signedToken(validHeader, encoded({ ...validPayload(), extra: true })),
      signedToken(validHeader, encodedRaw("not-json")),
    ];
    for (const token of invalidTokens) {
      expect(() => tokens.verify(token)).toThrow(expect.objectContaining({ code: "TOKEN_INVALID" }));
    }
  });

  it("rejects malformed claim types at each short-circuit boundary", () => {
    const tokens = tokenService();
    const header = encoded({ alg: "HS256", kid: "current" });
    for (const overrides of [
      { sub: 41 },
      { sub: " invalid" },
      { jti: 41 },
      { jti: "g".repeat(32) },
      { iat: "now" },
      { exp: "later" },
      { sessionVersion: 1.5 },
    ]) {
      expect(() => tokens.verify(signedToken(header, encoded(validPayload(overrides)))))
        .toThrow(expect.objectContaining({ code: "TOKEN_INVALID" }));
    }
  });

  it("fails closed when a null session version reaches the nullish lower-bound check", () => {
    const original = Number.isSafeInteger;
    const safeInteger = vi.spyOn(Number, "isSafeInteger").mockImplementation((value) => (
      value === null ? true : original(value)
    ));
    try {
      const header = encoded({ alg: "HS256", kid: "current" });
      expect(() => tokenService().verify(signedToken(header, encoded(validPayload({ sessionVersion: null })))))
        .toThrow(expect.objectContaining({ code: "TOKEN_INVALID" }));
    } finally {
      safeInteger.mockRestore();
    }
  });
});

describe("C5 principal critical coverage", () => {
  const principal: MusicPrincipal = {
    musicUserId: 41,
    subject: "subject-41",
    accountDocumentId: "account-41",
    sessionVersion: 3,
  };

  it("normalizes non-token verifier failures and rejects subject substitution", async () => {
    const verifierFailure = new MusicPrincipalService(
      {
        verifyContext: () => { throw new Error("unsafe dependency detail"); },
        acceptsSigningKey: () => true,
      } as never,
      { resolveCredentialSubject: async () => ({ identity: activeIdentity, tombstoned: false }) },
    );
    await expect(verifierFailure.resolve("token")).rejects.toEqual(expect.objectContaining({ code: "TOKEN_INVALID" }));

    const subjectMismatch = new MusicPrincipalService(
      {
        verifyContext: () => ({ claims: { ...validPayload(), sub: "subject-claims" }, kid: "current" }),
        acceptsSigningKey: () => true,
      } as never,
      { resolveCredentialSubject: async () => ({ identity: activeIdentity, tombstoned: false }) },
    );
    await expect(subjectMismatch.resolve("token")).rejects.toEqual(expect.objectContaining({ code: "TOKEN_REVOKED" }));
  });

  it("requires one canonical bearer header and forwards only its compact token", async () => {
    const compact = `${"a".repeat(8)}.${"b".repeat(8)}.${"c".repeat(8)}`;
    const resolve = vi.fn(async () => principal);
    await expect(resolveMusicPrincipalRequest(
      { rawHeaders: ["AUTHORIZATION", `Bearer ${compact}`] },
      resolve,
    )).resolves.toEqual(principal);
    expect(resolve).toHaveBeenCalledWith(compact);

    for (const rawHeaders of [
      [] as string[],
      [undefined as unknown as string, "ignored"],
      ["authorization"],
      ["authorization", "Basic credential"],
      ["authorization", `Bearer ${compact}`, "Authorization", `Bearer ${compact}`],
    ]) {
      await expect(resolveMusicPrincipalRequest({ rawHeaders }, resolve))
        .rejects.toEqual(expect.objectContaining({ code: "TOKEN_INVALID" }));
    }
  });

  it("middleware stores a resolved principal and forwards safe failures", async () => {
    const successNext = vi.fn();
    const successRequest = { rawHeaders: ["authorization", "Bearer aaaaaaaa.bbbbbbbb.cccccccc"] } as Request;
    await createMusicPrincipalMiddleware(async () => principal)(successRequest, {} as never, successNext);
    expect(successRequest.musicPrincipal).toEqual(principal);
    expect(successNext).toHaveBeenCalledWith();

    const failure = new MusicPrincipalError("TOKEN_INVALID", 401, "invalid");
    const failureNext = vi.fn();
    await createMusicPrincipalMiddleware(async () => { throw failure; })(successRequest, {} as never, failureNext);
    expect(failureNext).toHaveBeenCalledWith(failure);
  });

  it.each([0, Number.NaN, 42])("rejects invalid or foreign resource owner %s", (musicUserId) => {
    expect(() => assertMusicResourceOwner(principal, musicUserId)).toThrow(expect.objectContaining({ code: "RESOURCE_FORBIDDEN" }));
  });
});

describe("C4 identity rate-limit critical coverage", () => {
  it.each([
    { limit: 1.5, windowMs: 1, maxEntries: 2 },
    { limit: 0, windowMs: 1, maxEntries: 2 },
    { limit: 1, globalLimit: 0, windowMs: 1, maxEntries: 2 },
    { limit: 1, windowMs: 0, maxEntries: 2 },
    { limit: 1, windowMs: 1, maxEntries: 1 },
  ])("rejects invalid limiter bounds", (options) => {
    expect(() => new BoundedIdentityRateLimiter(options)).toThrow(/bounds/);
  });

  it("rolls back a source reservation when proof cardinality is saturated", () => {
    const limiter = new BoundedIdentityRateLimiter({ limit: 3, globalLimit: 10, windowMs: 60_000, maxEntries: 2, now: () => 0 });
    expect(limiter.check("source:a", "proof:a").allowed).toBe(true);
    expect(limiter.check("source:a", "proof:b")).toMatchObject({ allowed: false, saturated: true });
    expect(limiter.check("source:a", "proof:a").allowed).toBe(true);
  });

  it("a stale reservation rollback cannot mutate its replacement bucket", () => {
    const limiter = new BoundedIdentityRateLimiter({ limit: 3, globalLimit: 10, windowMs: 60_000, maxEntries: 4, now: () => 0 });
    const internals = limiter as unknown as {
      sourceBuckets: Map<string, { count: number; resetAt: number; touchedAt: number }>;
      reserve: (buckets: Map<string, { count: number; resetAt: number; touchedAt: number }>, key: string, now: number, capacity: number) => { allowed: true; rollback: () => void };
    };
    const reservation = internals.reserve(internals.sourceBuckets, "source:a", 0, 2);
    const replacement = { count: 2, resetAt: 60_000, touchedAt: 1 };
    internals.sourceBuckets.set("source:a", replacement);
    reservation.rollback();
    expect(internals.sourceBuckets.get("source:a")).toBe(replacement);
  });
});

describe("shared Music identity error critical coverage", () => {
  it("rejects undocumented statuses and missing, excessive, or mismatched request IDs", () => {
    expect(() => parseMusicIdentityClientResponse(201, { "x-request-id": "request" }, {})).toThrow(/undocumented/);
    expect(() => parseMusicIdentityClientResponse(503, new Headers(), safeErrorBody())).toThrow(/X-Request-Id/);
    expect(() => parseMusicIdentityClientResponse(503, { "x-request-id": "x".repeat(65) }, safeErrorBody())).toThrow(/X-Request-Id/);
    expect(() => parseMusicIdentityClientResponse(500, { "x-request-id": "request-other" }, safeErrorBody())).toThrow(/must equal/);
  });

  it("normalizes case-insensitive scalar and array headers for retryable and terminal errors", () => {
    expect(parseMusicIdentityClientResponse(503, {
      "X-Request-Id": ["request-safe", "ignored"],
      "Retry-After": ["2", "ignored"],
    }, safeErrorBody())).toMatchObject({ status: 503, requestId: "request-safe", retryAfterSeconds: 2 });
    expect(parseMusicIdentityClientResponse(500, new Headers({ "x-request-id": "request-safe" }), safeErrorBody()))
      .toMatchObject({ status: 500, requestId: "request-safe" });
  });
});
