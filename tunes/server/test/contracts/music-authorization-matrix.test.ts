import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { authorizationMatrixFromInventory,decisionForRoute } from "../../policies/musicSurfacePolicy";
import { inventoryRuntimeSurfaces } from "../../../scripts/inventory-runtime-surfaces";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");

describe("generated full Music authorization matrix", () => {
  it('classifies only the exact approved taxonomy GET and retains hostile-role denial',()=>{
    const route={method:'GET',path:'/api/explorers/v1/catalog/taxonomy',source:'tunes/server/routes/explorersCatalogRoutes.ts',classification:'handler-authorization-unknown'};
    expect(decisionForRoute(route)).toBe('explorers-owner');
    for(const changed of [{method:'POST'},{method:'ALL'},{source:'tunes/server/routes/unknown.ts'},{path:'/api/explorers/v1/catalog/taxonomy/other'}])expect(decisionForRoute({...route,...changed})).not.toBe('explorers-owner');
    const entry=authorizationMatrixFromInventory(inventoryRuntimeSurfaces(repositoryRoot)).routes.find(r=>r.method==='GET'&&r.path===route.path)!;
    expect(entry.allowed.owner).toBe(true);expect(Object.entries(entry.allowed).filter(([role])=>role!=='owner').every(([,allowed])=>allowed===false)).toBe(true);
  });
  it("matches every generated REST and socket inventory row", () => {
    // Break caught: a hand-maintained sample matrix omits a real runtime surface.
    const inventory = inventoryRuntimeSurfaces(repositoryRoot);
    const matrix = authorizationMatrixFromInventory(inventory);
    const committed = JSON.parse(readFileSync(
      resolve(repositoryRoot, "docs/architecture/music-authorization-matrix.json"),
      "utf8",
    ));
    expect(committed).toEqual(matrix);
    expect(matrix.routes).toHaveLength(inventory.routes.length);
    expect(matrix.events).toHaveLength(inventory.events.length);
    expect(matrix.routes).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: "POST", path: "/api/playlist/:guestUrl/requests", decision: "guest" }),
      expect.objectContaining({ method: "ALL", path: "/{*musicRetiredPath}", decision: "tombstone" }),
      expect.objectContaining({ method: "ALL", path: "/api/auth/*splat", decision: "explorers-auth" }),
      expect.objectContaining({ method: "POST", path: "/api/explorers/v1/recovery/start", decision: "explorers-recovery" }),
      expect.objectContaining({ method: "GET", path: "/api/explorers/v1/me", decision: "explorers-owner" }),
      expect.objectContaining({ method: "GET", path: "/api/explorers/v1/catalog/movie-genres", decision: "explorers-owner" }),
      expect.objectContaining({ method: "GET", path: "/api/explorers/v1/catalog/games", decision: "explorers-owner" }),
      expect.objectContaining({ method: "ALL", path: "/api/explorers/v1/catalog/games", decision: "tombstone" }),
      expect.objectContaining({ method: "POST", path: "/api/explorers/v1/collections/:id/memberships/:recommendationId", decision: "explorers-owner" }),
      expect.objectContaining({ method: "DELETE", path: "/api/explorers/v1/collections/:id/memberships/:recommendationId", decision: "explorers-owner" }),
      expect.objectContaining({ method: "ALL", path: "/api/explorers/v1/collections/:id/memberships/:recommendationId", decision: "tombstone" }),
      expect.objectContaining({ method: "ALL", path: "/api/explorers/v1/catalog/movie-genres", decision: "tombstone" }),
      expect.objectContaining({ method: "GET", path: "/api/explorers/v1/profiles/:username/recommendations/movies/genres/:genreSlug", decision: "public" }),
      expect.objectContaining({ method: "GET", path: "/api/explorers/v1/profiles/:username/recommendations/people/sectors/:sectorSlug", source: "tunes/server/routes/explorersPublicProfileRoutes.ts", decision: "public", allowed: { unauthenticated: true, owner: false, otherUser: false, suspended: false, pendingDeletion: false, staleEntitlement: false, guestValid: false, guestInvalid: false, guestRevoked: false, internalAdmin: false, nativeSession: false } }),
      expect.objectContaining({ method: "POST", path: "/api/explorers/v1/recommendations/:id/movie-media/import", decision: "explorers-owner" }),
      expect.objectContaining({ method: "ALL", path: "/api/explorers/v1/recommendations/:id/movie-media/import", decision: "tombstone" }),
    ]));
    expect(matrix.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ direction: "receive", event: "connection", decision: "owner-or-guest" }),
    ]));
    const retirementMatchers = (matrix as typeof matrix & { retirementMatchers?: unknown[] }).retirementMatchers;
    expect(retirementMatchers).toHaveLength(inventory.retirementMatchers.length);
    expect(retirementMatchers).toEqual(expect.arrayContaining(inventory.retirementMatchers.map((rule) => expect.objectContaining({
      family: rule.family,
      path: rule.path,
      match: rule.match,
      classification: rule.classification,
      decision: rule.classification,
    }))));
  });

  it("contains every required hostile role column and no permissive admin fallback", () => {
    const inventory = inventoryRuntimeSurfaces(repositoryRoot);
    const matrix = authorizationMatrixFromInventory(inventory);
    const retirementMatchers = (matrix as typeof matrix & { retirementMatchers: Array<{ allowed: Record<string, boolean>; decision: string }> }).retirementMatchers;
    for (const entry of [...matrix.routes, ...matrix.events, ...retirementMatchers]) {
      expect(Object.keys(entry.allowed).sort()).toEqual([
        "guestInvalid", "guestRevoked", "guestValid", "internalAdmin", "nativeSession", "otherUser",
        "owner", "pendingDeletion", "staleEntitlement", "suspended", "unauthenticated",
      ].sort());
      expect(entry.decision).not.toBe("unclassified");
    }
    expect(matrix.routes.filter((entry) => entry.decision === "admin-tombstone")
      .every((entry) => !entry.allowed.internalAdmin)).toBe(true);
  });
});
