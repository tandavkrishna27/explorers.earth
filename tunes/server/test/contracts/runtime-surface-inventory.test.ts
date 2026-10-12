import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assertNoUnclassifiedSensitiveSurfaces, inventoryRuntimeSurfaces } from "../../../scripts/inventory-runtime-surfaces.ts";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");

describe("runtime route/event/job inventory", () => {
  it("generates classifications and ownership for registered surfaces", () => {
    // Production break caught: an authorization migration misses a route,
    // Socket event, or scheduled lifecycle job that was hand-summarized only.
    const inventory = inventoryRuntimeSurfaces(repositoryRoot);
    // 189 = 177 + the 12 Places pin-storage surfaces registered by
    // tunes/server/routes/explorersPlacePinsRoutes.ts (6 operations plus their 6 ALL
    // method-guard siblings), added by 82d64b79 "Complete reviewed Places taxonomy and
    // pin storage foundations". Six of them classify as `tombstone` only because
    // musicSurfacePolicy's fail-closed owner allowlist has not yet declared them; see the
    // note in that allowlist. That is an authorization-declaration gap, not an extra
    // surface, and the count pin is honest about the surfaces that exist.
    expect(inventory.routes).toHaveLength(189);
    expect(inventory.events).toHaveLength(15);
    expect(inventory.jobs).toHaveLength(29);
    expect(inventory.routes.filter(route => route.path === '/api/explorers/v1/profiles/:username/recommendations/people/sectors/:sectorSlug')).toEqual([
      expect.objectContaining({method:'GET',classification:'public',source:'tunes/server/routes/explorersPublicProfileRoutes.ts',policy:'explicit-public-contract',ownerSource:'none'}),
    ]);
    expect(inventory.routes).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: "POST", path: "/api/music/identity/ensure", ownerSource: "authoritative-strapi-user+selected-account", classification: "strapi-identity-boundary" }),
      expect.objectContaining({ method: "GET", path: "/api/music/identity/current", ownerSource: "req.musicPrincipal.musicUserId", classification: "local-music-owner" }),
      expect.objectContaining({ method: "GET", path: "/api/playlists", ownerSource: "req.musicPrincipal.musicUserId", classification: "local-music-owner" }),
      expect.objectContaining({ method: "GET", path: "/api/playlist/:guestUrl", classification: "guest-capability", ownerSource: "hashed-guest-capability-or-explicit-publication" }),
    ]));
    expect(inventory.retiredSurfaces).toEqual(expect.arrayContaining([
      expect.objectContaining({ family: "legacy-browser-identity", disposition: "typed-410-boundary" }),
      expect.objectContaining({ family: "graphql-service-proxy", disposition: "typed-410-boundary" }),
      expect.objectContaining({ family: "legacy-admin", disposition: "typed-410-boundary" }),
      expect.objectContaining({ family: "legacy-mixed-auth-owner-handlers", disposition: "canonical-replacement-or-typed-410" }),
    ]));
    expect(inventory.retiredSurfaces.map(({ family }) => family)).toEqual(expect.arrayContaining([
      "request", "queue", "playlist", "settings", "device", "analytics", "subscription",
      "youtube", "playback", "venue", "public", "admin", "payment", "scrape", "instagram", "gemini",
    ]));
    expect(inventory.routes).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: "ALL", path: "/{*musicRetiredPath}", classification: "tombstone", policy: "normalized-executable-retirement-matcher" }),
      expect.objectContaining({ method: "USE", path: "/api/auth", classification: "canonical-explorers-auth", policy: "better-auth-handler+trusted-origin-for-mutations" }),
      expect.objectContaining({ method: "ALL", path: "/api/auth/*splat", classification: "canonical-explorers-auth" }),
      expect.objectContaining({ method: "POST", path: "/api/explorers/v1/recovery/start", classification: "canonical-explorers-recovery", ownerSource: "trusted-origin+signed-short-lived-recovery-intent", policy: "trusted-origin+signed-short-lived-recovery-intent" }),
      expect.objectContaining({ method: "GET", path: "/api/explorers/v1/me", classification: "canonical-explorers-owner", ownerSource: "verified-google-session+active-initial-account-binding" }),
      expect.objectContaining({ method: "GET", path: "/api/explorers/v1/account/lifecycle", classification: "canonical-explorers-owner" }),
      expect.objectContaining({ method: "POST", path: "/api/explorers/v1/account/deletion-feedback", classification: "canonical-explorers-owner" }),
      expect.objectContaining({ method: "POST", path: "/api/explorers/v1/account/deactivation", classification: "canonical-explorers-owner" }),
      expect.objectContaining({ method: "POST", path: "/api/explorers/v1/account/deletion", classification: "canonical-explorers-owner" }),
      // Read-only observation, bound to the proof but not single-use - see ownerFor. The
      // transition route on the next line is where single-use still holds, and the two
      // being different labels is the point.
      expect.objectContaining({ method: "GET", path: "/api/explorers/v1/recovery/status", classification: "canonical-explorers-recovery", ownerSource: "google-bound-recovery-proof-within-expiry-read-only" }),
      expect.objectContaining({ method: "POST", path: "/api/explorers/v1/recovery/complete", classification: "canonical-explorers-recovery", policy: "google-bound-five-minute-proof+origin-on-mutation" }),
      // Public by parity with the Strapi availability query it replaces, which was
      // reachable unauthenticated from the landing page.
      expect.objectContaining({ method: "GET", path: "/api/explorers/v1/public/handles/:handle/available", classification: "public" }),
      expect.objectContaining({ method: "GET", path: "/api/music/entitlement", classification: "local-music-owner" }),
      expect.objectContaining({ method: "GET", path: "/api/music/dashboard", classification: "local-music-owner" }),
    ]));
    // Taxonomy adds the eleventh fallback outside recommendation routes; the Places
    // pin-storage routes add the twelfth through seventeenth, one ALL guard per pin
    // operation, each answering 405 INVALID_INPUT with no actor resolution.
    // Pin the count so every new surface receives an explicit method-boundary review.
    expect(inventory.routes.filter((route) => route.method === "ALL"
      && route.source !== "tunes/server/routes/explorersRecommendationRoutes.ts")).toHaveLength(17);
    // Decision D2. GET reports the address and must not write; POST performs it, which is
    // also what RFC 8058 one-click unsubscribe sends. Both are public: the authority is
    // the purpose-bound HMAC in the token, not the caller.
    expect(inventory.routes).toContainEqual(expect.objectContaining({ method: "GET", path: "/api/explorers/v1/public/email/unsubscribe", classification: "public" }));
    expect(inventory.routes).toContainEqual(expect.objectContaining({ method: "POST", path: "/api/explorers/v1/public/email/unsubscribe", classification: "public" }));
    expect(inventory.routes).toContainEqual(expect.objectContaining({ method: "ALL", path: "/api/explorers/v1/public/email/unsubscribe", classification: "tombstone" }));
    expect(inventory.routes).toContainEqual(expect.objectContaining({method:'GET',path:'/api/explorers/v1/catalog/games',classification:'canonical-explorers-owner'}));
    expect(inventory.routes).toContainEqual(expect.objectContaining({method:'ALL',path:'/api/explorers/v1/catalog/games',classification:'tombstone'}));
    expect(inventory.routes).toContainEqual(expect.objectContaining({method:'GET',path:'/api/explorers/v1/catalog/movie-genres',classification:'canonical-explorers-owner'}));
    expect(inventory.routes).toContainEqual(expect.objectContaining({method:'ALL',path:'/api/explorers/v1/catalog/movie-genres',classification:'tombstone'}));
    expect(inventory.routes).toContainEqual(expect.objectContaining({method:'GET',path:'/api/explorers/v1/catalog/movies',classification:'canonical-explorers-owner'}));
    expect(inventory.routes).toContainEqual(expect.objectContaining({method:'ALL',path:'/api/explorers/v1/catalog/movies',classification:'tombstone'}));
    expect(inventory.routes).toContainEqual(expect.objectContaining({method:'GET',path:'/api/explorers/v1/catalog/books',classification:'canonical-explorers-owner'}));
    expect(inventory.routes).toContainEqual(expect.objectContaining({method:'GET',path:'/api/explorers/v1/catalog/taxonomy',classification:'canonical-explorers-owner'}));
    expect(inventory.routes).toContainEqual(expect.objectContaining({method:'ALL',path:'/api/explorers/v1/catalog/taxonomy',classification:'tombstone',ownerSource:'none-fail-closed'}));
    expect(inventory.routes).toContainEqual(expect.objectContaining({method:'ALL',path:'/api/explorers/v1/public/recommendations/search',classification:'tombstone'}));
    expect(inventory.routes).toContainEqual(expect.objectContaining({method:'GET',path:'/api/explorers/v1/public/recommendations/search',classification:'public',policy:'explicit-public-contract'}));
    expect(inventory.routes.every((route) => route.line > 0)).toBe(true);
    expect(inventory.routes.filter((route) => route.policy === "none").every((route) => route.classification !== "public")).toBe(true);
    expect(inventory.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ direction: "receive", event: "player_state", policy: "sender-event-time-recheck+role-allowlist" }),
      expect.objectContaining({ direction: "emit", event: "player_state", policy: "recipient-lifecycle+capability-recheck-before-delivery" }),
      expect.objectContaining({ direction: "emit", event: "guest_request", policy: "recipient-lifecycle+capability-recheck-before-delivery" }),
    ]));
    expect(inventory.routes.some((route) => [
      "handler-authorization-unknown", "owner-handler-review-required", "admin-handler-review-required", "service-token-proxy",
    ].includes(route.classification))).toBe(false);
    expect(inventory.events.every((event) => event.classification !== "unclassified")).toBe(true);
    expect(inventory.jobs).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "setTimeout", lifecycle: "reactivation-token-cleanup" })]));
  });

  it("discovers every bounded recommendation owner command and fail-closed method boundary", () => {
    const routes=inventoryRuntimeSurfaces(repositoryRoot).routes.filter(route=>route.source === "tunes/server/routes/explorersRecommendationRoutes.ts");
    const ownerCommands=[
      ['POST','/api/explorers/v1/collections/:id/memberships/:recommendationId'],
      ['DELETE','/api/explorers/v1/collections/:id/memberships/:recommendationId'],
      ['POST','/api/explorers/v1/collections/:id/location'],
      ['DELETE','/api/explorers/v1/collections/:id/location'],
      ['POST','/api/explorers/v1/entities/resolve'], ['POST','/api/explorers/v1/collections'],
      ['PATCH','/api/explorers/v1/collections/:id'], ['PATCH','/api/explorers/v1/collections/:id/order'],
      ['DELETE','/api/explorers/v1/collections/:id'], ['POST','/api/explorers/v1/recommendations'],
      ['PATCH','/api/explorers/v1/recommendations/:id'], ['DELETE','/api/explorers/v1/recommendations/:id'],
      ['POST','/api/explorers/v1/recommendations/:id/entity'], ['POST','/api/explorers/v1/recommendations/:id/movie-media/import'], ['POST','/api/explorers/v1/recommendations/:id/book-covers'],
      ['GET','/api/explorers/v1/collections'], ['GET','/api/explorers/v1/collections/:id'],
      ['GET','/api/explorers/v1/recommendations'], ['GET','/api/explorers/v1/recommendations/:id'],
      ['GET','/api/explorers/v1/recommendations/search'],
      ['GET','/api/explorers/v1/collections/:id/editable'], ['GET','/api/explorers/v1/recommendations/:id/editable'],
      ['GET','/api/explorers/v1/categories/:category/content-snapshot'],
      ['GET','/api/explorers/v1/categories/:category/content-snapshot/validate'],
      ['GET','/api/explorers/v1/categories/:category/memberships'],
      ['GET','/api/explorers/v1/categories/:category/top-picks'],
      ['PUT','/api/explorers/v1/categories/:category/top-picks'],
      ['PATCH','/api/explorers/v1/categories/:category/top-picks/order'],
      // Ticket 5.3. The guide aggregate.
      ['GET','/api/explorers/v1/collections/:id/guide'],
      ['PUT','/api/explorers/v1/collections/:id/guide'],
      ['POST','/api/explorers/v1/collections/:id/guide/sections'],
      ['PATCH','/api/explorers/v1/collections/:id/guide/sections/order'],
      ['PATCH','/api/explorers/v1/collections/:id/guide/sections/:sectionId'],
      ['DELETE','/api/explorers/v1/collections/:id/guide/sections/:sectionId'],
      ['PUT','/api/explorers/v1/collections/:id/guide/cover'],
    ];
    const methodBoundaries=['/api/explorers/v1/entities/resolve','/api/explorers/v1/collections',
      '/api/explorers/v1/collections/:id/memberships/:recommendationId',
      '/api/explorers/v1/collections/:id/location',
      '/api/explorers/v1/collections/:id','/api/explorers/v1/collections/:id/order',
      '/api/explorers/v1/collections/:id/editable','/api/explorers/v1/recommendations/:id/editable',
      '/api/explorers/v1/recommendations','/api/explorers/v1/recommendations/:id','/api/explorers/v1/recommendations/search',
      '/api/explorers/v1/categories/:category/content-snapshot','/api/explorers/v1/categories/:category/content-snapshot/validate','/api/explorers/v1/categories/:category/memberships',
      '/api/explorers/v1/categories/:category/top-picks','/api/explorers/v1/categories/:category/top-picks/order','/api/explorers/v1/recommendations/:id/entity','/api/explorers/v1/recommendations/:id/book-covers','/api/explorers/v1/recommendations/:id/movie-media/import',
      '/api/explorers/v1/collections/:id/guide','/api/explorers/v1/collections/:id/guide/sections',
      '/api/explorers/v1/collections/:id/guide/sections/order','/api/explorers/v1/collections/:id/guide/sections/:sectionId',
      '/api/explorers/v1/collections/:id/guide/cover'];
    expect(routes).toHaveLength(ownerCommands.length+methodBoundaries.length);
    for(const [method,path] of ownerCommands) expect(routes).toContainEqual(expect.objectContaining({
      method,path,classification:'canonical-explorers-owner',ownerSource:'verified-google-session+active-initial-account-binding',
      policy:'better-auth-session+google-provider+active-initial-account-binding',
    }));
    expect(routes.filter(route=>route.method==='ALL').map(route=>route.path).sort()).toEqual(methodBoundaries.sort());
    expect(routes.filter(route=>route.method==='ALL').every(route=>route.classification==='tombstone' && route.ownerSource==='none-fail-closed')).toBe(true);
  });

  it("fails closed on an unclassified admin or owner surface", () => {
    // Production break caught: absent route middleware was called public even
    // when an admin check lived in or was missing from the handler.
    expect(() => assertNoUnclassifiedSensitiveSurfaces([{
      method: "DELETE",
      path: "/api/admin/users/:userId",
      classification: "handler-authorization-unknown",
      ownerSource: "handler-derived-or-none",
      policy: "handler-level-unverified",
      lifecycle: "delete",
      source: "server/example.ts",
      line: 1,
    }])).toThrow("unclassified sensitive surface");
  });

  it("matches the committed generated matrix", () => {
    const generated = inventoryRuntimeSurfaces(repositoryRoot);
    const committed = JSON.parse(readFileSync(resolve(repositoryRoot, "docs/architecture/music-runtime-surface-inventory.json"), "utf8"));
    expect(generated).toEqual(committed);
  });
});
