import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoundedIdentityRateLimiter } from "../middleware/identityRateLimit";
import { setupMusicIdentityBodylessPreflight, setupMusicIdentityRoutes } from "../routes/musicIdentityRoutes";
import { decisionForRoute } from "../policies/musicSurfacePolicy";
import { MusicIdentityError } from "../../shared/musicError";
import { createLoopbackSupertestScope } from "./helpers/loopback-supertest";

const loopback = createLoopbackSupertestScope();
afterEach(async () => loopback.closeAll());

const status = {
  operationId: "e36d710f-a5d3-4476-9d2f-34226a2af4aa",
  musicUserId: 12,
  identityStatus: "pending_deletion" as const,
  phase: "prepared" as const,
  state: "completed" as const,
  boundaryCrossed: false,
  retryable: false,
  deadLetter: false,
  upstreamUserDocumentId: "user-document-a",
  upstreamAccountDocumentId: "account-document-a",
};

function appFor(overrides: Record<string, unknown> = {}, routeOverrides: Record<string, unknown> = {}) {
  const app = express();
  setupMusicIdentityBodylessPreflight(app);
  app.use(express.json());
  const lifecycle = {
    prepareDeletion: vi.fn(async () => status),
    status: vi.fn(async () => status),
    markDeletionBoundary: vi.fn(async () => ({ ...status, boundaryCrossed: true, state: "requested" as const })),
    cancelDeletion: vi.fn(async () => ({ ...status, identityStatus: "suspended" as const, state: "cancelled" as const })),
    suspendFromProof: vi.fn(async () => ({ identityStatus: "suspended" as const })),
    reactivateFromProof: vi.fn(async () => ({ identityStatus: "active" as const })),
    ...overrides,
  };
  setupMusicIdentityRoutes(app, {
    ensure: vi.fn(),
    mintCredential: vi.fn(),
    resolvePrincipal: vi.fn(),
    lifecycle,
    limiter: new BoundedIdentityRateLimiter({ limit: 20, globalLimit: 100, windowMs: 60_000, maxEntries: 100 }),
    fingerprint: () => "safe-fingerprint",
    isMusicCredential: (token: string) => token.startsWith("music."),
    requestIdFactory: () => "generated-request",
    logger: vi.fn(),
    ...routeOverrides,
  } as never);
  return { app, lifecycle };
}

describe("mounted Music lifecycle identity boundary", () => {
  it("returns the durable server operation without exposing local owner IDs", async () => {
    // Break caught: a lifecycle route accepts owner input or leaks numeric/local identity authority.
    const { app, lifecycle } = appFor();
    const { request } = await loopback.open({ app });
    const response = await request
      .post("/api/music/identity/lifecycle/prepare")
      .set("Authorization", `Bearer ${"b".repeat(32)}`)
      .set("X-Request-Id", "request-prepare")
      .expect(200);
    expect(response.headers["x-request-id"]).toBe("request-prepare");
    expect(response.body).toEqual({
      version: "music-lifecycle/v1",
      operation: {
        operationId: status.operationId,
        status: "pending_deletion",
        phase: "prepared",
        state: "completed",
        boundaryCrossed: false,
        retryable: false,
        deadLetter: false,
        upstreamUserDocumentId: "user-document-a",
        upstreamAccountDocumentId: "account-document-a",
      },
    });
    expect(JSON.stringify(response.body)).not.toContain("musicUserId");
    expect(lifecycle.prepareDeletion).toHaveBeenCalledWith("b".repeat(32), "request-prepare");
  });

  it("mounts bodyless authoritative suspension for the real Explorer deactivation flow", async () => {
    // Break caught: Settings blocks Strapi while Music remains active and old C5/socket/public authority survives.
    const { app, lifecycle } = appFor();
    const { request } = await loopback.open({ app });
    const response = await request.post("/api/music/identity/lifecycle/suspend")
      .set("Authorization", `Bearer ${"b".repeat(32)}`)
      .set("X-Request-Id", "request-suspend")
      .expect(200);
    expect(response.body).toEqual({ version: "music-lifecycle/v1", identity: { status: "suspended" } });
    expect(lifecycle.suspendFromProof).toHaveBeenCalledWith("b".repeat(32), "request-suspend");
  });

  it("returns the exact no-local acknowledgement for a never-provisioned Explorer identity", async () => {
    const { app, lifecycle } = appFor({
      suspendFromProof: vi.fn(async () => ({ identityStatus: "not_present" as const })),
    });
    const { request } = await loopback.open({ app });
    const response = await request.post("/api/music/identity/lifecycle/suspend")
      .set("Authorization", `Bearer ${"b".repeat(32)}`)
      .expect(200);
    expect(response.body).toEqual({ version: "music-lifecycle/v1", identity: { status: "not_present" } });
    expect(lifecycle.suspendFromProof).toHaveBeenCalledOnce();
  });

  it("mounts a bodyless authoritative resume for failed Explorer-block compensation", async () => {
    const { app, lifecycle } = appFor();
    const { request } = await loopback.open({ app });
    const response = await request.post("/api/music/identity/lifecycle/resume")
      .set("Authorization", `Bearer ${"b".repeat(32)}`)
      .set("X-Request-Id", "request-resume")
      .expect(200);
    expect(response.body).toEqual({ version: "music-lifecycle/v1", identity: { status: "active" } });
    expect(lifecycle.reactivateFromProof).toHaveBeenCalledWith("b".repeat(32), "request-resume");
  });

  it("returns typed pending-deletion conflict instead of a suspension acknowledgement", async () => {
    // Break caught: a stale Settings suspension proceeds to Strapi block while durable Music deletion is pending.
    const { app } = appFor({
      suspendFromProof: vi.fn(async () => {
        throw new MusicIdentityError(
          "IDENTITY_PENDING_DELETION", 409, "This Music identity is pending deletion.",
          "contact_support", false, undefined, "pending_deletion",
        );
      }),
    });
    const { request } = await loopback.open({ app });
    const response = await request.post("/api/music/identity/lifecycle/suspend")
      .set("Authorization", `Bearer ${"b".repeat(32)}`).expect(409);
    expect(response.body).toMatchObject({ error: {
      code: "IDENTITY_PENDING_DELETION", retryable: false,
    } });
    expect(response.body).not.toHaveProperty("identity");
  });

  it("rejects bodies, query owner hints, and Music credentials on every mutation", async () => {
    // Break caught: lifecycle authority falls back to browser-supplied identity or a C5 token.
    const { app } = appFor();
    const { request } = await loopback.open({ app });
    await request.post("/api/music/identity/lifecycle/prepare?userId=12")
      .set("Authorization", `Bearer ${"b".repeat(32)}`).expect(400);
    await request.post("/api/music/identity/lifecycle/boundary")
      .set("Authorization", `Bearer ${"b".repeat(32)}`).send({ operationId: status.operationId }).expect(400);
    await request.post("/api/music/identity/lifecycle/cancel")
      .set("Authorization", "Bearer music.local.owner.token").expect(401);
  });

  it("serves reload-safe status and a typed dead-letter escalation", async () => {
    // Break caught: reload loses the durable state or an exhausted operation looks healthy.
    const { app } = appFor({
      status: vi.fn(async () => ({ ...status, state: "failed", boundaryCrossed: true, deadLetter: true })),
    });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/music/identity/lifecycle/status")
      .set("Authorization", `Bearer ${"b".repeat(32)}`).expect(200);
    expect(response.body.operation).toMatchObject({ state: "failed", deadLetter: true, retryable: false });
  });

  it("serves the exact cancelled no-local terminal DTO after a lost cancel response", async () => {
    const cancelled = {
      ...status,
      musicUserId: null,
      identityStatus: "not_present" as const,
      state: "cancelled" as const,
    };
    const { app, lifecycle } = appFor({
      status: vi.fn(async () => cancelled),
      cancelDeletion: vi.fn(async () => cancelled),
    });
    const headers = { Authorization: `Bearer ${"b".repeat(32)}` };

    const { request } = await loopback.open({ app });
    const cancelledResponse = await request.post("/api/music/identity/lifecycle/cancel")
      .set(headers).expect(200);
    const reloadResponse = await request.get("/api/music/identity/lifecycle/status")
      .set(headers).expect(200);
    const expected = {
      version: "music-lifecycle/v1",
      operation: {
        operationId: status.operationId,
        status: "not_present",
        phase: "prepared",
        state: "cancelled",
        boundaryCrossed: false,
        retryable: false,
        deadLetter: false,
        upstreamUserDocumentId: "user-document-a",
        upstreamAccountDocumentId: "account-document-a",
      },
    };
    expect(cancelledResponse.body).toEqual(expected);
    expect(reloadResponse.body).toEqual(expected);
    expect(lifecycle.cancelDeletion).toHaveBeenCalledOnce();
    expect(lifecycle.status).toHaveBeenCalledOnce();
  });

  it("applies new-entry admission to prepare without blocking durable recovery", async () => {
    // Break caught: a disabled cohort can start deletion, or the kill switch strands an existing operation.
    const { app, lifecycle } = appFor({}, { entryEnabled: () => false });
    const { request } = await loopback.open({ app });
    await request.post("/api/music/identity/lifecycle/prepare")
      .set("Authorization", `Bearer ${"b".repeat(32)}`).expect(503);
    await request.get("/api/music/identity/lifecycle/status")
      .set("Authorization", `Bearer ${"b".repeat(32)}`).expect(200);
    expect(lifecycle.prepareDeletion).not.toHaveBeenCalled();
    expect(lifecycle.status).toHaveBeenCalledOnce();
  });

  it("classifies every lifecycle route as the Explorer identity boundary", () => {
    // Break caught: generated authorization falls back to a retired/owner CRUD classification.
    for (const path of ["prepare", "status", "boundary", "cancel", "suspend", "resume"]) {
      expect(decisionForRoute({ method: path === "status" ? "GET" : "POST", path: `/api/music/identity/lifecycle/${path}`, classification: "private" }))
        .toBe("strapi-identity");
    }
  });
});
