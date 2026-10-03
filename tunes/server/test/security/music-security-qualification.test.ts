import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { authorizationMatrixFromInventory } from "../../policies/musicSurfacePolicy";
import { inventoryRuntimeSurfaces } from "../../../scripts/inventory-runtime-surfaces";
import { sanitizeQualificationText } from "../../../scripts/music-qualification";

const root = resolve(import.meta.dirname, "../../../..");

describe("complete C10 REST, GraphQL, and socket security qualification", () => {
  it("gives every discovered surface a fail-closed hostile-role decision", () => {
    const inventory = inventoryRuntimeSurfaces(root);
    const matrix = authorizationMatrixFromInventory(inventory);
    expect(matrix.routes.length).toBeGreaterThanOrEqual(50);
    expect(matrix.events.length).toBeGreaterThanOrEqual(10);
    expect(matrix.jobs.length).toBeGreaterThanOrEqual(11);

    const expectedRoles = [
      "guestInvalid", "guestRevoked", "guestValid", "internalAdmin", "nativeSession", "otherUser",
      "owner", "pendingDeletion", "staleEntitlement", "suspended", "unauthenticated",
    ].sort();
    for (const surface of [...matrix.routes, ...matrix.events, ...matrix.retirementMatchers]) {
      expect(Object.keys(surface.allowed).sort()).toEqual(expectedRoles);
      expect(surface.decision).not.toBe("unclassified");
      expect(surface.allowed.otherUser).toBe(false);
      const identityFlow = surface.decision === "explorers-auth" || surface.decision === "explorers-recovery";
      expect(surface.allowed.suspended).toBe(identityFlow);
      expect(surface.allowed.pendingDeletion).toBe(identityFlow);
      if (identityFlow) expect(surface).toMatchObject({ flowAccess: { grantsApplicationAuthority: false } });
      else expect(surface).not.toHaveProperty("flowAccess");
      expect(surface.allowed.internalAdmin).toBe(false);
    }
  });

  it("pins GraphQL retirement, REST ownership, guest capability, and socket authority", () => {
    const matrix = authorizationMatrixFromInventory(inventoryRuntimeSurfaces(root));
    expect(matrix.routes).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: "GET", path: "/api/playlists", decision: "owner" }),
      expect.objectContaining({ method: "POST", path: "/api/music/identity/ensure", decision: "strapi-identity" }),
      expect.objectContaining({ method: "GET", path: "/api/music/public-profile/:accountDocumentId", decision: "public" }),
      expect.objectContaining({ method: "GET", path: "/api/music/public-resource/v1/:publicSlug", decision: "public" }),
      expect.objectContaining({ method: "GET", path: "/api/playlist/:guestUrl", decision: "guest" }),
      expect.objectContaining({ method: "POST", path: "/api/explorers/analytics/music/:publicSlug/events", decision: "guest" }),
    ]));
    const descriptor = matrix.routes.find(({ method, path }) => method === "GET" && path === "/api/music/public-profile/:accountDocumentId");
    expect(descriptor?.allowed).toMatchObject({
      unauthenticated: true,
      owner: false,
      otherUser: false,
      suspended: false,
      pendingDeletion: false,
      internalAdmin: false,
    });
    const publicResource = matrix.routes.find(({ method, path }) => method === "GET" && path === "/api/music/public-resource/v1/:publicSlug");
    expect(publicResource?.allowed).toMatchObject({ unauthenticated: true, owner: false, otherUser: false });
    expect(matrix.retirementMatchers).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "/graphql", match: "exact", decision: "tombstone" }),
    ]));
    expect(matrix.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ direction: "receive", event: "connection", decision: "owner-or-guest" }),
      expect.objectContaining({ direction: "receive", event: "guest_request", decision: "guest" }),
      expect.objectContaining({ direction: "receive", event: "player_state", decision: "owner" }),
    ]));
  });

  it("allows inactive identities into only canonical auth and recovery initiation without granting application authority", () => {
    const matrix = authorizationMatrixFromInventory(inventoryRuntimeSurfaces(root));
    const flowRoutes = matrix.routes.filter(({ decision }) => decision === "explorers-auth" || decision === "explorers-recovery");
    expect(flowRoutes.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "USE /api/auth",
      "ALL /api/auth",
      "ALL /api/auth/*splat",
      "POST /api/explorers/v1/recovery/start",
      "GET /api/explorers/v1/recovery/status",
      "POST /api/explorers/v1/recovery/complete",
    ]);
    for (const route of flowRoutes) {
      expect(route.allowed).toMatchObject({ suspended: true, pendingDeletion: true });
      expect(route).toMatchObject({ flowAccess: {
        purpose: route.decision === "explorers-auth" ? "provider-authentication"
          : route.path.endsWith("/start") ? "recovery-intent-issuance" : "recovery-proof-consumption",
        grantsApplicationAuthority: false,
      } });
    }
    for (const path of ["/api/explorers/v1/me", "/api/playlists"]) {
      const route = matrix.routes.find((candidate) => candidate.path === path);
      expect(route?.allowed).toMatchObject({ suspended: false, pendingDeletion: false });
      expect(route).not.toHaveProperty("flowAccess");
    }
    expect(matrix.retirementMatchers).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "/api/auth", match: "prefix", allowed: expect.objectContaining({ suspended: false, pendingDeletion: false }) }),
    ]));
  });

  it("redacts forbidden authority from bounded security evidence", () => {
    const evidence = sanitizeQualificationText(
      "authorization=private Bearer header.payload.signature postgresql://owner:private@localhost/music",
    );
    expect(evidence).not.toContain("private");
    expect(evidence).not.toContain("header.payload.signature");
    expect(evidence).toContain("[REDACTED]");
  });
});
