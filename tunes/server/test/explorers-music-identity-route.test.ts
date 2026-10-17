import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "../application/authorization";
import type { Actor } from "../application/actor";

const actorStub = vi.hoisted(() => ({ resolve: async (): Promise<unknown> => ({}) }));

// requireActor reads a Better Auth session and the database. The route's own
// behaviour is what is under test here, so the Actor is supplied directly while
// sendActorError stays real - it is what turns these failures into responses.
vi.mock("../middleware/explorersPrincipal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/explorersPrincipal")>();
  return { ...actual, requireActor: () => actorStub.resolve() };
});

const { setupExplorersMusicIdentityRoutes } = await import("../routes/explorersMusicIdentityRoutes");

const BASE_URL = "https://explorers.test";
const ACCOUNT = "6f1a9c42-0d3b-4f27-9d61-2e8c5b7a4411";
const actor = {
  accountId: ACCOUNT, userId: "auth-user-a", role: "owner",
  credential: { kind: "web-session", sessionVersion: 9 },
} as unknown as Actor;

const activeVenue = { musicUserId: 41, sessionVersion: 3, identityStatus: "active" as const };

function harness(overrides: {
  venue?: typeof activeVenue;
  tombstoned?: boolean;
  ensure?: () => Promise<{ musicUserId: number; accountId: string; provisioned: boolean }>;
} = {}) {
  const calls: { ensured: number; minted: unknown[] } = { ensured: 0, minted: [] };
  const app = express();
  setupExplorersMusicIdentityRoutes(app, {
    pool: {} as never,
    auth: {} as never,
    config: { baseURL: BASE_URL } as never,
    accounts: {
      ensureMusicAccount: overrides.ensure ?? (async () => {
        calls.ensured += 1;
        return { musicUserId: 41, accountId: ACCOUNT, provisioned: true };
      }),
    },
    resolveCanonicalSubject: async () => ({
      venue: "venue" in overrides ? overrides.venue : activeVenue,
      tombstoned: overrides.tombstoned === true,
    }),
    mintCanonical: async (input) => {
      calls.minted.push(input);
      return { token: "canonical.music.token", expiresAt: 1_800_000_600_000 };
    },
  });
  return { app, calls };
}

describe("canonical Music identity route", () => {
  beforeEach(() => { actorStub.resolve = async () => actor; });

  it("provisions the owner and issues a credential for the Actor's own account", async () => {
    const { app, calls } = harness();
    const response = await request(app)
      .post("/api/explorers/v1/music/identity/ensure")
      .set("origin", BASE_URL);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      version: "music-identity/v1",
      identity: { musicUserId: 41, status: "active" },
      credential: { token: "canonical.music.token", expiresAt: 1_800_000_600_000 },
    });
    expect(calls.ensured).toBe(1);
    // The venue's own session version, not the Actor's 9. That is the counter Music
    // credential revocation bumps, so using the session's would leave canonical
    // credentials un-revokable.
    expect(calls.minted).toEqual([{ accountId: ACCOUNT, musicUserId: 41, sessionVersion: 3 }]);
  });

  it("refuses an untrusted origin before provisioning anything", async () => {
    const { app, calls } = harness();
    const response = await request(app)
      .post("/api/explorers/v1/music/identity/ensure")
      .set("origin", "https://attacker.test");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(calls.ensured).toBe(0);
    expect(calls.minted).toEqual([]);
  });

  it.each([
    ["an absent mapping", { venue: undefined }, 404, "NOT_FOUND"],
    ["a tombstoned venue", { tombstoned: true }, 404, "NOT_FOUND"],
    ["a suspended venue", { venue: { ...activeVenue, identityStatus: "suspended" as const } }, 403, "FORBIDDEN"],
    ["a venue pending deletion", { venue: { ...activeVenue, identityStatus: "pending_deletion" as const } }, 403, "FORBIDDEN"],
  ])("issues no credential for %s", async (_label, overrides, status, code) => {
    const { app, calls } = harness(overrides as Parameters<typeof harness>[0]);
    const response = await request(app)
      .post("/api/explorers/v1/music/identity/ensure")
      .set("origin", BASE_URL);
    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
    expect(calls.minted).toEqual([]);
  });

  it("keeps an authorization refusal's own status", async () => {
    actorStub.resolve = async () => { throw new AuthorizationError(401, "UNAUTHENTICATED", "Session required"); };
    const { app } = harness();
    const response = await request(app)
      .post("/api/explorers/v1/music/identity/ensure")
      .set("origin", BASE_URL);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("reports an internal provisioning fault as unavailable without leaking it", async () => {
    const { app } = harness({
      ensure: async () => { throw new Error("venue insert returned no usable id"); },
    });
    const response = await request(app)
      .post("/api/explorers/v1/music/identity/ensure")
      .set("origin", BASE_URL);
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("venue insert");
  });
});
