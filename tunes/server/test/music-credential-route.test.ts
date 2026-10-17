import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoundedIdentityRateLimiter } from "../middleware/identityRateLimit";
import { MusicPrincipalError, type MusicPrincipal } from "../middleware/musicPrincipal";
import { setupMusicIdentityBodylessPreflight, setupMusicIdentityRoutes } from "../routes/musicIdentityRoutes";
import {
  MusicIdentityError,
  musicEnsureResponseSchema,
  musicErrorEnvelopeSchema,
  musicPrincipalOpenApi,
  musicPrincipalResponseSchema,
} from "../../shared/musicError";
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
const principal: MusicPrincipal = {
  musicUserId: 41,
  subject: "user-document-41",
  accountDocumentId: "account-document-41",
  sessionVersion: 7,
};
const responseToken = `sentinel.${"x".repeat(60)}`;

function appFor(overrides: {
  ensure?: () => Promise<typeof projection>;
  mintCredential?: (identity: typeof projection) => { token: string; expiresAt: number };
  resolvePrincipal?: (token: string) => Promise<MusicPrincipal>;
} = {}) {
  const app = express();
  setupMusicIdentityBodylessPreflight(app);
  app.use(express.json());
  const logs: unknown[] = [];
  const metrics: unknown[] = [];
  const mintCredential = vi.fn(overrides.mintCredential ?? (() => ({
    token: responseToken,
    expiresAt: 1_800_000_600_000,
  })));
  const ensure = vi.fn(overrides.ensure ?? (async () => projection));
  const resolvePrincipal = vi.fn(overrides.resolvePrincipal ?? (async (token: string) => {
    if (token !== "valid.music.credential") {
      throw new MusicPrincipalError("TOKEN_INVALID", 401, "The Music credential is invalid.");
    }
    return principal;
  }));
  setupMusicIdentityRoutes(app, {
    ensure,
    mintCredential,
    resolvePrincipal,
    limiter: new BoundedIdentityRateLimiter({ limit: 20, windowMs: 60_000, maxEntries: 100 }),
    logger: (entry) => logs.push(entry),
    fingerprint: () => "safe-fingerprint",
    requestIdFactory: () => "generated-request-id",
    telemetry: () => ({
      upstreamCalls: 1, retries: 0, circuitState: "closed", cacheHits: 0, cacheMisses: 1, coalesced: 0,
    }),
    metrics: (entry) => metrics.push(entry),
  });
  return { app, ensure, mintCredential, resolvePrincipal, logs, metrics };
}

describe("C5 Music credential routes", () => {
  it("mints only after successful projection and returns the token only in the explicit response field", async () => {
    const { app, mintCredential, logs, metrics } = appFor();
    const { request } = await loopback.open({ app });
    const response = await request.post("/api/music/identity/ensure")
      .set("authorization", "Bearer authoritative-strapi-proof")
      .set("x-request-id", "credential-request");
    expect(response.status).toBe(200);
    expect(musicEnsureResponseSchema.parse(response.body)).toEqual({
      version: "music-identity/v1",
      identity: { musicUserId: 41, status: "active" },
      credential: { token: responseToken, expiresAt: 1_800_000_600_000 },
    });
    expect(mintCredential).toHaveBeenCalledWith(projection);
    expect(response.body.credential.token).toBe(responseToken);
    expect(JSON.stringify(response.body).split(responseToken)).toHaveLength(2);
    const nonCredentialResponseSurfaces = JSON.stringify({ headers: response.headers, logs, metrics });
    expect(nonCredentialResponseSurfaces).not.toContain(responseToken);
    expect(nonCredentialResponseSurfaces).not.toContain("user-document-41");
    expect(nonCredentialResponseSurfaces).not.toContain("account-document-41");
  });

  it.each([
    new MusicIdentityError("AUTH_INVALID", 401, "Invalid proof.", "authenticate", false),
    new MusicIdentityError("IDENTITY_INELIGIBLE", 403, "Ineligible.", "complete_onboarding", false),
    new MusicIdentityError("IDENTITY_CONFLICT", 409, "Conflict.", "contact_support", false),
    new MusicIdentityError("DATABASE_UNAVAILABLE", 503, "Unavailable.", "retry", true, 2),
  ])("never mints after a failed projection: $code", async (failure) => {
    const { app, mintCredential } = appFor({ ensure: async () => { throw failure; } });
    const { request } = await loopback.open({ app });
    await request.post("/api/music/identity/ensure")
      .set("authorization", "Bearer rejected-strapi-proof")
      .expect(failure.status);
    expect(mintCredential).not.toHaveBeenCalled();
  });

  it("accepts only a single local Music bearer on the protected endpoint", async () => {
    const { app, resolvePrincipal } = appFor();
    const { request } = await loopback.open({ app });
    const accepted = await request.get("/api/music/identity/current")
      .set("authorization", "Bearer valid.music.credential")
      .set("cookie", "cosmic.sid=native-session")
      .set("x-request-id", "local-current-request");
    expect(accepted.status).toBe(200);
    expect(accepted.headers["x-request-id"]).toBe("local-current-request");
    expect(musicPrincipalResponseSchema.parse(accepted.body)).toEqual({
      version: "music-principal/v1",
      identity: { musicUserId: 41, status: "active" },
    });
    expect(resolvePrincipal).toHaveBeenCalledWith("valid.music.credential");

    const denied = [
      request.get("/api/music/identity/current"),
      request.get("/api/music/identity/current").set("cookie", "cosmic.sid=native-session"),
      request.get("/api/music/identity/current").set("authorization", "Bearer authoritative-strapi-proof"),
      request.get("/api/music/identity/current").set("authorization", ["Bearer valid.music.credential", "Bearer other.music.credential"]),
    ];
    for (const operation of denied) {
      const response = await operation;
      expect(response.status).toBe(401);
      expect(musicErrorEnvelopeSchema.safeParse(response.body).success).toBe(true);
      expect(response.headers["x-request-id"]).toBeTruthy();
    }
  });

  it("publishes the protected endpoint's exact credential and response header contract", () => {
    expect(musicPrincipalOpenApi.path).toBe("/api/music/identity/current");
    expect(musicPrincipalOpenApi.operation.get.security).toEqual([{ musicBearer: [] }]);
    expect(Object.keys(musicPrincipalOpenApi.operation.get.responses).sort()).toEqual(["200", "401", "403", "409", "500", "503"]);
    for (const response of Object.values(musicPrincipalOpenApi.operation.get.responses)) {
      expect(response.headers).toHaveProperty("X-Request-Id");
    }
    expect(musicPrincipalOpenApi.operation.get.responses["503"].headers).toHaveProperty("Retry-After");
  });

  it("maps immediate local revocation/status errors without exposing credentials", async () => {
    const { app, logs } = appFor({
      resolvePrincipal: async () => {
        throw new MusicPrincipalError("TOKEN_REVOKED", 401, "The Music credential has been revoked.");
      },
    });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/music/identity/current")
      .set("authorization", "Bearer revoked.sentinel.credential");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("TOKEN_REVOKED");
    expect(JSON.stringify({ logs, body: response.body })).not.toContain("revoked.sentinel.credential");
  });
});
