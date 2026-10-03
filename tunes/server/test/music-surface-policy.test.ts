import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  authorizationMatrixFromInventory,
  createGuestCapability,
  decisionForRoute,
  entitlementDecision,
  hashGuestCapability,
  verifyGuestCapability,
} from "../policies/musicSurfacePolicy";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

describe("Music surface authorization policy", () => {
  it.each([
    ['POST','/api/explorers/analytics/events','tunes/server/routes/explorersAnalyticsRoutes.ts','public'],
    ['GET','/api/explorers/analytics/summary','tunes/server/routes/explorersCanonicalAnalyticsRoutes.ts','explorers-owner'],
    ['GET','/api/explorers/analytics/events','tunes/server/routes/explorersAnalyticsRoutes.ts','strapi-identity'],
  ])('classifies only exact analytics source and method: %s %s',(method,path,source,decision)=>{
    const route={method,path,source,classification:'private'};expect(decisionForRoute(route)).toBe(decision);
    for(const changed of [{source:'legacy.ts'},{method:'DELETE'},{path:path+'/internal'},{classification:'tombstone'}])expect(decisionForRoute({...route,...changed})).toBe('tombstone');
  });
  it.each([
    ['POST','/api/explorers/v1/entities/resolve'],['POST','/api/explorers/v1/collections'],
    ['PATCH','/api/explorers/v1/collections/:id'],['PATCH','/api/explorers/v1/collections/:id/order'],
    ['DELETE','/api/explorers/v1/collections/:id'],['POST','/api/explorers/v1/recommendations'],
    ['PATCH','/api/explorers/v1/recommendations/:id'],['DELETE','/api/explorers/v1/recommendations/:id'],
    ['POST','/api/explorers/v1/recommendations/:id/entity'], ['POST','/api/explorers/v1/recommendations/:id/book-covers'],
    ['GET','/api/explorers/v1/collections'],['GET','/api/explorers/v1/collections/:id'],
    ['GET','/api/explorers/v1/recommendations'],['GET','/api/explorers/v1/recommendations/:id'],
    ['GET','/api/explorers/v1/recommendations/search'],
    ['GET','/api/explorers/v1/categories/:category/content-snapshot'],
    ['GET','/api/explorers/v1/categories/:category/content-snapshot/validate'],
    ['GET','/api/explorers/v1/categories/:category/memberships'],
  ])('classifies only the implemented recommendation command %s %s', (method,path)=>{
    const route={source:'tunes/server/routes/explorersRecommendationRoutes.ts',method,path,classification:'private'};
    expect(decisionForRoute(route)).toBe('explorers-owner');
    expect(decisionForRoute({...route,source:'legacy.ts'})).toBe('tombstone');
    expect(decisionForRoute({...route,method:'PUT'})).toBe('tombstone');
    expect(decisionForRoute({...route,method:'ALL'})).toBe('tombstone');
    expect(decisionForRoute({...route,path:`${path}/admin`})).toBe('tombstone');
    expect(decisionForRoute({...route,classification:'tombstone'})).toBe('tombstone');
  });
  it.each([
    ["explorersCatalogRoutes", "GET", "/api/explorers/v1/catalog/books", "explorers-owner"],
    ["explorersCatalogRoutes", "GET", "/api/explorers/v1/catalog/movies", "explorers-owner"],
    ["explorersAccountRoutes", "PATCH", "/api/explorers/v1/account", "explorers-owner"],
    ["explorersMediaRoutes", "POST", "/api/explorers/v1/media", "explorers-owner"],
    ["explorersMediaRoutes", "DELETE", "/api/explorers/v1/media/:id", "explorers-owner"],
    ["explorersMediaRoutes", "GET", "/api/explorers/v1/media/:id/content", "public"],
    ["explorersMediaRoutes", "HEAD", "/api/explorers/v1/media/:id/content", "public"],
  ])("classifies the exact canonical profile/media route %s %s %s", (file, method, path, decision) => {
    const route = { source: `tunes/server/routes/${file}.ts`, method, path, classification: "private" };
    expect(decisionForRoute(route)).toBe(decision);
    expect(decisionForRoute({ ...route, source: "legacy.ts" })).toBe("tombstone");
    expect(decisionForRoute({ ...route, method: "PUT" })).toBe("tombstone");
    expect(decisionForRoute({ ...route, path: `${path}/admin` })).toBe("tombstone");
    expect(decisionForRoute({ ...route, classification: "tombstone" })).toBe("tombstone");
  });
  it.each([
    ["POST", "/api/explorers/v1/account/deletion", "explorers-owner"],
    ["GET", "/api/explorers/v1/recovery/status", "explorers-recovery"],
    ["POST", "/api/explorers/v1/recovery/complete", "explorers-recovery"],
  ] as const)("classifies the lifecycle route %s %s only at its registered source", (method, path, decision) => {
    const route = { source: "tunes/server/routes/explorersLifecycleRoutes.ts", method, path, classification: "private" };
    expect(decisionForRoute(route)).toBe(decision);
    expect(decisionForRoute({ ...route, source: "legacy.ts" })).toBe("tombstone");
    expect(decisionForRoute({ ...route, path: "/api/explorers/v1/recovery/unknown" })).toBe("tombstone");
  });

  it.each([
    "/api/explorers/v1/profiles/:username",
    "/api/explorers/v1/profiles/:username/recommendations/:category",
    "/api/explorers/v1/profiles/:username/recommendations/:category/:slug",
  ])("classifies only the implemented GET public profile surface: %s", (path) => {
    expect(decisionForRoute({ method: "GET", path, classification: "private" })).toBe("public");
    expect(decisionForRoute({ method: "POST", path, classification: "private" })).toBe("tombstone");
    expect(decisionForRoute({ method: "GET", path, classification: "tombstone" })).toBe("tombstone");
    expect(decisionForRoute({ method: "GET", path, classification: "admin-tombstone" })).toBe("admin-tombstone");
  });

  it.each([
    '/api/explorers/v1/public/profiles/:username/collections/:category',
    '/api/explorers/v1/public/recommendations/search',
    '/api/explorers/v1/public/profiles/:username/collections/:category/:slug/recommendations',
  ])('recognizes only the exact public content GET source and path %s',path=>{
    const route={method:'GET',path,source:'tunes/server/routes/explorersPublicContentRoutes.ts',classification:'private'};
    expect(decisionForRoute(route)).toBe('public');
    for(const changed of [{source:'other.ts'},{method:'POST'},{method:'ALL'},{path:path+'/internal'},{classification:'tombstone'}]) expect(decisionForRoute({...route,...changed})).toBe('tombstone');
  });
  it("does not make unknown public profile paths public", () => {
    expect(decisionForRoute({ method: "GET", path: "/api/explorers/v1/profiles/:username/admin", classification: "private" })).toBe("tombstone");
    expect(decisionForRoute({ method: "GET", path: "/api/explorers/v1/profiles", classification: "private" })).toBe("tombstone");
  });

  it("classifies canonical auth only at its registered source and retains the legacy auth tombstone", () => {
    const route = { method: "ALL", path: "/api/auth/*splat", classification: "private" };
    expect(decisionForRoute({ ...route, source: "tunes/server/auth/canonicalApp.ts" })).toBe("explorers-auth");
    expect(decisionForRoute({ ...route, source: "tunes/server/auth.ts" })).toBe("tombstone");
    expect(decisionForRoute({ ...route, source: "tunes/server/auth/canonicalApp.ts", path: "/api/auth/legacy" }))
      .toBe("tombstone");
    expect(decisionForRoute({ ...route, source: "tunes/server/auth/canonicalApp.ts", method: "POST", path: "/api/explorers/v1/me" }))
      .toBe("tombstone");
    expect(decisionForRoute({ ...route, source: "tunes/server/auth/canonicalApp.ts", method: "GET", path: "/api/explorers/v1/recovery/start" }))
      .toBe("tombstone");
  });

  it.each([
    ["entitled", "2026-08-14T09:50:00.000Z", "2026-08-14T10:00:00.000Z", true],
    ["entitled", "2026-08-14T09:49:59.999Z", "2026-08-14T10:00:00.000Z", false],
    ["included", "2026-08-14T09:59:00.000Z", "2026-08-14T10:00:00.000Z", false],
    ["eligible", "2026-08-14T09:59:00.000Z", "2026-08-14T10:00:00.000Z", false],
    ["revoked", "2026-08-14T09:59:00.000Z", "2026-08-14T10:00:00.000Z", false],
    ["unknown", undefined, "2026-08-14T10:00:00.000Z", false],
    ["entitled", "2026-08-14T10:00:00.001Z", "2026-08-14T10:00:00.000Z", false],
  ] as const)("allows paid mutation only for a fresh entitled server state", (state, updatedAt, now, allowed) => {
    // Break caught: treating unknown/future/older-than-600-second state as paid authority.
    expect(entitlementDecision({ state, sourceUpdatedAt: updatedAt && new Date(updatedAt) }, new Date(now))).toEqual({
      coreRead: true,
      coreMutation: true,
      paidMutation: allowed,
    });
  });

  it("rejects entitlement states outside the canonical database contract", () => {
    // Break caught: a new/typoed repository value silently inherits universal core authority and reaches clients undocumented.
    expect(() => entitlementDecision({ state: "paused" as never }, new Date("2026-08-14T10:00:00.000Z")))
      .toThrow("Unsupported Music entitlement state.");
  });

  it("creates a 256-bit capability and verifies only its SHA-256 hash", () => {
    // Break caught: persisting a plaintext/short capability or accepting a changed capability.
    const capability = createGuestCapability();
    expect(capability).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const hash = hashGuestCapability(capability);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(capability);
    expect(verifyGuestCapability(capability, hash)).toBe(true);
    const differentCapability = `${capability.slice(0, -1)}${capability.endsWith("A") ? "B" : "A"}`;
    expect(verifyGuestCapability(differentCapability, hash)).toBe(false);
    expect(verifyGuestCapability(capability, "0".repeat(64))).toBe(false);
    expect(verifyGuestCapability("short", hash)).toBe(false);
  });

  it("generates one fail-closed role decision for every inventory route and socket event", () => {
    // Break caught: adding a runtime surface without an explicit owner/guest/public/admin/tombstone policy.
    const inventory = JSON.parse(readFileSync(
      resolve(repositoryRoot, "docs/architecture/music-runtime-surface-inventory.json"),
      "utf8",
    ));
    const matrix = authorizationMatrixFromInventory(inventory);
    expect(matrix.routes).toHaveLength(inventory.routes.length);
    expect(matrix.events).toHaveLength(inventory.events.length);
    expect(matrix.routes.every((entry) => entry.decision !== "unclassified")).toBe(true);
    expect(matrix.events.every((entry) => entry.decision !== "unclassified")).toBe(true);
    expect(matrix.routes.filter((entry) => entry.decision === "owner").every((entry) =>
      entry.allowed.owner && !entry.allowed.unauthenticated && !entry.allowed.otherUser && !entry.allowed.nativeSession,
    )).toBe(true);
    expect(matrix.routes.filter((entry) => entry.decision === "admin-tombstone").every((entry) =>
      !entry.allowed.internalAdmin,
    )).toBe(true);
  });

  it("fails closed for a non-exempt guest POST surface", () => {
    const matrix = authorizationMatrixFromInventory({
      routes: [{ method: "POST", path: "/api/playlist/:guestUrl", source: "fixture", classification: "private" }],
      events: [],
    });
    expect(matrix.routes[0]).toMatchObject({
      decision: "guest",
      allowed: { guestValid: true, unauthenticated: false },
    });
  });

  it.each([
    ["/api/music/identity/ensure", "private", "strapi-identity"],
    ["/api/music/identity/current", "private", "owner"],
    ["/api/playlist/:guestUrl", "private", "guest"],
    ["/api/playlist/:guestUrl/requests", "private", "guest"],
    ["/api/explorers/analytics/music/:publicSlug/events", "private", "guest"],
    ["/api/explorers/analytics/music-account/:accountDocumentId/events", "private", "public"],
    ["/api/music/guest/request", "tombstone", "tombstone"],
    ["/health/live", "private", "public"],
    ["/new-public", "public", "public"],
    ["/api/admin/users", "private", "admin-tombstone"],
    ["/not-a-route", "admin-tombstone", "admin-tombstone"],
    ["/graphql", "private", "tombstone"],
    ["/api/strapi/graphql", "private", "tombstone"],
    ["/api/strapi/config", "private", "tombstone"],
    ["/api/debug/strapi", "private", "tombstone"],
    ["/api/auth/legacy", "private", "tombstone"],
    ["/api/register", "private", "tombstone"],
    ["/api/connect/google", "private", "tombstone"],
    ["/api", "private", "tombstone"],
    ["/api/login", "private", "native-session"],
    ["/api/logout", "private", "native-session"],
    ["/api/check", "private", "native-session"],
    ["/api/csrf-token", "private", "native-session"],
    ["/api/payments/order", "private", "paid-owner"],
    ["/api/subscriptions/change", "private", "paid-owner"],
    ["/api/gemini/generate", "private", "paid-owner"],
    ["/api/playlist/import-youtube", "private", "paid-owner"],
    ["/api/music/paid/quota", "private", "paid-owner"],
    ["/api/playlists", "private", "owner"],
    ["/api/playlists/4", "private", "owner"],
    ["/api/playlist/", "private", "owner"],
    ["/api/playlist/song", "private", "owner"],
    ["/api/user", "private", "owner"],
    ["/api/user/profile", "private", "owner"],
    ["/api/system-settings/", "private", "owner"],
    ["/api/system-settings/app", "private", "owner"],
    ["/api/youtube/", "private", "owner"],
    ["/api/youtube/search", "private", "owner"],
    ["/api/instagram/", "private", "owner"],
    ["/api/instagram/profile", "private", "owner"],
    ["/apps/", "private", "owner"],
    ["/apps/scrape", "private", "owner"],
    ["/products/", "private", "owner"],
    ["/products/scrape", "private", "owner"],
    ["/people/", "private", "owner"],
    ["/people/scrape", "private", "owner"],
    ["/proxy-image", "private", "owner"],
    ["/proxy-image/file", "private", "owner"],
    ["/api/email/", "private", "owner"],
    ["/api/email/send", "private", "owner"],
    ["/api/seo", "private", "owner"],
    ["/api/seo/settings", "private", "owner"],
    ["/api/music/guest-capability/", "private", "tombstone"],
    ["/api/music/guest-capability/rotate", "private", "tombstone"],
    ["/api/music/publication/", "private", "tombstone"],
    ["/api/music/publication/publish", "private", "tombstone"],
    ["/api/music/publication", "private", "owner"],
    ["/new-authenticated", "authenticated", "owner"],
    ["/unknown", "private", "tombstone"],
  ] as const)("classifies %s without implicit authority", (path, classification, expected) => {
    expect(decisionForRoute({ method: "GET", path, classification })).toBe(expected);
  });

  it("honors explicit tombstones before legacy owner prefixes and recognizes live owner endpoints", () => {
    expect(decisionForRoute({ method: "ALL", path: "/api/user/*", classification: "tombstone" })).toBe("tombstone");
    expect(decisionForRoute({ method: "ALL", path: "/api/playlist/import-*", classification: "tombstone" })).toBe("tombstone");
    expect(decisionForRoute({ method: "GET", path: "/api/music/entitlement", classification: "private" })).toBe("owner");
    expect(decisionForRoute({ method: "GET", path: "/api/music/dashboard", classification: "private" })).toBe("owner");
  });

  it("exercises every socket decision branch with fail-closed role columns", () => {
    const events = [
      { direction: "receive" as const, event: "guest_request", source: "test" },
      { direction: "receive" as const, event: "connection", source: "test" },
      { direction: "receive" as const, event: "disconnect", source: "test" },
      { direction: "emit" as const, event: "queue_changed", source: "test" },
      { direction: "receive" as const, event: "player_state", source: "test" },
      { direction: "receive" as const, event: "unknown", source: "test" },
    ];
    const matrix = authorizationMatrixFromInventory({ routes: [], events });
    expect(matrix.events.map(({ decision }) => decision)).toEqual([
      "guest", "owner-or-guest", "public", "public", "owner", "tombstone",
    ]);
  });
});

it('admits Movies catalog only through its exact canonical source and GET while preserving retired guards',()=>{const r={source:'tunes/server/routes/explorersCatalogRoutes.ts',method:'GET',path:'/api/explorers/v1/catalog/movies',classification:'private'};expect(decisionForRoute(r)).toBe('explorers-owner');for(const change of [{method:'ALL'},{method:'POST'},{source:'tunes/server/routes/legacyMovies.ts'},{path:'/api/explorers/v1/catalog/movies/internal'},{path:'/api/movies'},{classification:'tombstone'}])expect(decisionForRoute({...r,...change})).toBe('tombstone');});
