import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { authorizationMatrixFromInventory } from "../../policies/musicSurfacePolicy";
import { inventoryRuntimeSurfaces } from "../../../scripts/inventory-runtime-surfaces";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");

describe("generated full Music authorization matrix", () => {
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
