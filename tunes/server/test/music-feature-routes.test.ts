import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setupMusicFeatureRoutes } from "../routes/musicFeatureRoutes";
import { MusicPrincipalError } from "../middleware/musicPrincipal";
import { createLoopbackSupertestScope } from "./helpers/loopback-supertest";

const loopback = createLoopbackSupertestScope();
afterEach(async () => loopback.closeAll());

describe("GET /api/music/features", () => {
  it("requires a verified Music principal and passes only that principal to the decision service", async () => {
    const decide = vi.fn(() => ({ ownerWorkspace: false, guestWorkspace: false, playlistImports: false, exposureId: "opaque", expiresAt: "2026-08-26T00:00:00.000Z" }));
    const app = express();
    setupMusicFeatureRoutes(app, {
      resolvePrincipal: async (token) => {
        if (token !== "aaa.bbb.ccc") throw new Error("invalid");
        return { musicUserId: 11, subject: "subject", accountDocumentId: "account", sessionVersion: 2 };
      },
      decide,
      requestIdFactory: () => "feature-request",
      allowedOrigins: ["https://explorers.example"],
    });
    const { request } = await loopback.open({ app });
    expect((await request.get("/api/music/features").set("Origin", "https://explorers.example")).status).toBe(401);
    const response = await request.get("/api/music/features").set("Authorization", "Bearer aaa.bbb.ccc").set("Origin", "https://explorers.example");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ownerWorkspace: false, guestWorkspace: false, playlistImports: false, exposureId: "opaque", expiresAt: "2026-08-26T00:00:00.000Z" });
    expect(decide).toHaveBeenCalledWith(expect.objectContaining({ musicUserId: 11, accountDocumentId: "account" }));
  });

  it("does not misreport an unavailable decision service as an authentication failure", async () => {
    const app = express();
    setupMusicFeatureRoutes(app, {
      resolvePrincipal: async () => ({ musicUserId: 11, subject: "subject", accountDocumentId: "account", sessionVersion: 2 }),
      decide: () => { throw new Error("unavailable"); }, requestIdFactory: () => "feature-request",
      allowedOrigins: ["https://explorers.example"],
    });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/music/features").set("Authorization", "Bearer aaa.bbb.ccc").set("Origin", "https://explorers.example");
    expect(response.status).toBe(503);
    expect(response.body.error).toMatchObject({ code: "SERVICE_UNAVAILABLE", retryable: true, requestId: "feature-request" });
  });

  it("contains unexpected principal repository failures as retryable service unavailability", async () => {
    const app = express();
    setupMusicFeatureRoutes(app, {
      resolvePrincipal: async () => { throw new Error("database connection secret"); }, decide: vi.fn(),
      requestIdFactory: () => "feature-request", allowedOrigins: ["https://explorers.example"],
    });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/music/features").set("Authorization", "Bearer aaa.bbb.ccc").set("Origin", "https://explorers.example");
    expect(response.status).toBe(503);
    expect(response.body.error).toEqual({ code: "SERVICE_UNAVAILABLE", message: "Music features are temporarily unavailable.", action: "retry", retryable: true, requestId: "feature-request" });
    expect(JSON.stringify(response.body)).not.toContain("database connection secret");
  });

  it("preserves fail-closed lifecycle authority errors and never evaluates a decision", async () => {
    const decide = vi.fn(); const app = express();
    setupMusicFeatureRoutes(app, {
      resolvePrincipal: async () => { throw new MusicPrincipalError("IDENTITY_SUSPENDED", 403, "This Music identity is suspended."); },
      decide, requestIdFactory: () => "feature-request",
      allowedOrigins: ["https://explorers.example"],
    });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/music/features").set("Authorization", "Bearer aaa.bbb.ccc").set("Origin", "https://explorers.example");
    expect(response.status).toBe(403);
    expect(response.body.error).toMatchObject({ code: "IDENTITY_SUSPENDED", retryable: false });
    expect(decide).not.toHaveBeenCalled();
  });

  it("uses the canonical authenticate action for credential failures", async () => {
    const app = express();
    setupMusicFeatureRoutes(app, {
      resolvePrincipal: async () => { throw new MusicPrincipalError("TOKEN_INVALID", 401, "The Music credential is invalid."); },
      decide: vi.fn(), requestIdFactory: () => "feature-request",
      allowedOrigins: ["https://explorers.example"],
    });
    const { request } = await loopback.open({ app });
    const response = await request.get("/api/music/features")
      .set("Authorization", "Bearer aaa.bbb.ccc").set("Origin", "https://explorers.example");
    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({ code: "TOKEN_INVALID", action: "authenticate", retryable: false });
  });

  it.each([undefined, "https://attacker.example"])("rejects missing or forbidden exact Origin %s before evaluating a decision", async (origin) => {
    const decide = vi.fn(); const app = express();
    setupMusicFeatureRoutes(app, {
      resolvePrincipal: async () => ({ musicUserId: 11, subject: "subject", accountDocumentId: "account", sessionVersion: 2 }),
      decide, requestIdFactory: () => "feature-request", allowedOrigins: ["https://explorers.example"],
    });
    const { request } = await loopback.open({ app });
    let operation = request.get("/api/music/features").set("Authorization", "Bearer aaa.bbb.ccc");
    if (origin) operation = operation.set("Origin", origin);
    const response = await operation;
    expect(response.status).toBe(403);
    expect(response.body.error).toMatchObject({ code: "ORIGIN_FORBIDDEN", retryable: false, requestId: "feature-request" });
    expect(decide).not.toHaveBeenCalled();
  });
});
