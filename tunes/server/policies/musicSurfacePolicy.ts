import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const MUSIC_ENTITLEMENT_MAX_AGE_SECONDS = 600;

export type MusicEntitlementState = "unknown" | "included" | "eligible" | "entitled" | "revoked";

const MUSIC_ENTITLEMENT_STATES = new Set<MusicEntitlementState>([
  "unknown", "included", "eligible", "entitled", "revoked",
]);

export function isMusicEntitlementState(value: unknown): value is MusicEntitlementState {
  return typeof value === "string" && MUSIC_ENTITLEMENT_STATES.has(value as MusicEntitlementState);
}

export function entitlementDecision(
  entitlement: { state: MusicEntitlementState; sourceUpdatedAt?: Date },
  now = new Date(),
): { coreRead: true; coreMutation: true; paidMutation: boolean } {
  if (!isMusicEntitlementState(entitlement.state)) throw new Error("Unsupported Music entitlement state.");
  const timestamp = entitlement.sourceUpdatedAt?.getTime();
  const ageMilliseconds = timestamp === undefined ? Number.POSITIVE_INFINITY : now.getTime() - timestamp;
  return {
    coreRead: true,
    coreMutation: true,
    paidMutation: entitlement.state === "entitled"
      && Number.isFinite(ageMilliseconds)
      && ageMilliseconds >= 0
      && ageMilliseconds <= MUSIC_ENTITLEMENT_MAX_AGE_SECONDS * 1_000,
  };
}

export function createGuestCapability(): string {
  return randomBytes(32).toString("base64url");
}

export function hashGuestCapability(capability: string): string {
  return createHash("sha256").update(capability, "utf8").digest("hex");
}

export function verifyGuestCapability(capability: string, expectedHash: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(capability) || !/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  const actual = Buffer.from(hashGuestCapability(capability), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export type MusicSurfaceDecision =
  | "public"
  | "strapi-identity"
  | "owner"
  | "paid-owner"
  | "guest"
  | "native-session"
  | "tombstone"
  | "admin-tombstone"
  | "owner-or-guest"
  | "explorers-auth"
  | "explorers-owner"
  | "explorers-recovery"
  | "unclassified";

export interface RuntimeRouteSurface {
  method: string;
  path: string;
  classification: string;
  source: string;
}

export interface RuntimeEventSurface {
  direction: "receive" | "emit";
  event: string;
  source: string;
}

const PUBLIC_PATHS = new Set([
  "/health/live",
  "/health/ready",
  "/api/music-entry/status",
  "/api/music/public-profile/:accountDocumentId",
  "/api/music/public-resource/v1/:publicSlug",
  "/api/explorers/analytics/music-account/:accountDocumentId/events",
  "/robots.txt",
  "/sitemap.xml",
  "/api/explorers-sitemap.xml",
  "/api/explorers/v1/share-page",
  "/api/user/request-reactivation",
  "/api/user/reactivate",
  "/api/music-fixture/readiness",
  "/api-docs",
]);

const PUBLIC_PROFILE_GET_PATHS = new Set([
  "/api/explorers/v1/profiles/:username",
  "/api/explorers/v1/profiles/:username/recommendations/:category",
  "/api/explorers/v1/profiles/:username/recommendations/:category/:slug",
]);

const PAID_PREFIXES = [
  "/api/payments/",
  "/api/subscriptions/",
  "/api/gemini/",
  "/api/playlist/import-",
  "/api/music/paid/",
];

const OWNER_PREFIXES = [
  "/api/playlists",
  "/api/playlist/",
  "/api/user",
  "/api/system-settings/",
  "/api/youtube/",
  "/api/instagram/",
  "/apps/",
  "/products/",
  "/people/",
  "/proxy-image",
  "/api/email/",
  "/api/seo",
];

export function decisionForRoute(route: Pick<RuntimeRouteSurface, "method" | "path" | "classification"> & Partial<Pick<RuntimeRouteSurface, "source">>): MusicSurfaceDecision {
  const peopleSectorPath = '/api/explorers/v1/profiles/:username/recommendations/people/sectors/:sectorSlug';
  if (route.path === peopleSectorPath || route.path.startsWith(peopleSectorPath + '/')) {
    return route.classification !== 'tombstone' && route.classification !== 'admin-tombstone'
      && route.source === 'tunes/server/routes/explorersPublicProfileRoutes.ts'
      && route.method === 'GET' && route.path === peopleSectorPath ? 'public' : 'tombstone';
  }
  const movieGenrePath='/api/explorers/v1/profiles/:username/recommendations/movies/genres/:genreSlug';
  const movieImportPath='/api/explorers/v1/recommendations/:id/movie-media/import';
  if(route.path===movieGenrePath||route.path.startsWith(movieGenrePath+'/'))return route.classification!=='tombstone'&&route.classification!=='admin-tombstone'&&route.source==='tunes/server/routes/explorersPublicProfileRoutes.ts'&&route.method==='GET'&&route.path===movieGenrePath?'public':'tombstone';
  if(route.path===movieImportPath||route.path.startsWith(movieImportPath+'/'))return route.classification!=='tombstone'&&route.classification!=='admin-tombstone'&&route.source==='tunes/server/routes/explorersRecommendationRoutes.ts'&&route.method==='POST'&&route.path===movieImportPath?'explorers-owner':'tombstone';
  if(route.classification!=='tombstone'&&route.classification!=='admin-tombstone'){
    if(route.source==='tunes/server/routes/explorersAnalyticsRoutes.ts'&&route.path==='/api/explorers/analytics/events'){
      if(route.method==='POST')return 'public';
      if(route.method==='GET')return 'strapi-identity'; // Historical GET only, until Epic7.2.
    }
    if(route.source==='tunes/server/routes/explorersCanonicalAnalyticsRoutes.ts'&&route.method==='GET'&&route.path==='/api/explorers/analytics/summary')return 'explorers-owner';
  }
  if (route.source === "tunes/server/auth/canonicalApp.ts") {
    if (["USE", "ALL"].includes(route.method) && (route.path === "/api/auth" || route.path === "/api/auth/*splat")) return "explorers-auth";
    if (route.method === "POST" && route.path === "/api/explorers/v1/recovery/start") return "explorers-recovery";
    if (route.method === "GET" && route.path === "/api/explorers/v1/me") return "explorers-owner";
  }
  // ADR-006 and ADR-008. Canonical Music owner provisioning and credential issue:
  // the subject is the verified Actor's own account, so this is a canonical owner
  // surface. Without this it falls through to the fail-closed tombstone default,
  // which would record an owner-authenticated route as having no owner source.
  if (route.source === "tunes/server/routes/explorersMusicIdentityRoutes.ts"
      && route.method === "POST" && route.path === "/api/explorers/v1/music/identity/ensure") return "explorers-owner";
  if (route.classification === "admin-tombstone") return "admin-tombstone";
  if (route.classification === "tombstone") return "tombstone";
  if(route.source==='tunes/server/routes/explorersPublicContentRoutes.ts' && route.method==='GET' && [
    '/api/explorers/v1/public/profiles/:username/collections/:category',
    '/api/explorers/v1/public/recommendations/search',
    '/api/explorers/v1/public/profiles/:username/collections/:category/:slug/recommendations',
    '/api/explorers/v1/public/profiles/:username/collections/:category/:slug/recommendations/:id',
    // Public by parity with what it replaces: the Strapi availability query it supersedes
    // was reachable unauthenticated from the landing page, and a handle is public by
    // construction since it is the profile URL. Declared here because the allowlist is
    // fail-closed - an undeclared route classifies as a tombstone.
    '/api/explorers/v1/public/handles/:handle/available',
    // Email unsubscribe, GET half (decision D2). GET only reports which address the token
    // is for and must not write, because mail clients and scanners prefetch links.
    '/api/explorers/v1/public/email/unsubscribe',
  ].includes(route.path)) return 'public';
  // Email unsubscribe, POST half (decision D2). Its own arm rather than widening the list
  // above to admit POST: those paths are GET-only reads, and admitting POST for all of
  // them would turn their fail-closed tombstoned POST into a public surface. This is the
  // one public-content route that performs a write, and RFC 8058 one-click unsubscribe is
  // a POST. Authority is the purpose-bound HMAC in the token, never the caller.
  if(route.source==='tunes/server/routes/explorersPublicContentRoutes.ts'
     && route.method==='POST'
     && route.path==='/api/explorers/v1/public/email/unsubscribe') return 'public';
  if(route.source==='tunes/server/routes/explorersCatalogRoutes.ts'&&route.method==='GET'&&route.path==='/api/explorers/v1/catalog/movie-genres')return 'explorers-owner';
  if(route.source==='tunes/server/routes/explorersCatalogRoutes.ts'&&route.method==='GET'&&route.path==='/api/explorers/v1/catalog/books')return 'explorers-owner';
  if(route.source==='tunes/server/routes/explorersCatalogRoutes.ts'&&route.method==='GET'&&route.path==='/api/explorers/v1/catalog/movies')return 'explorers-owner';
  if(route.source==='tunes/server/routes/explorersCatalogRoutes.ts'&&route.method==='GET'&&route.path==='/api/explorers/v1/catalog/games')return 'explorers-owner';
  if(route.source==='tunes/server/routes/explorersCatalogRoutes.ts'&&route.method==='GET'&&route.path==='/api/explorers/v1/catalog/taxonomy')return 'explorers-owner';
  // WP8. Owner-initiated link preview (URL in the POST body only, trusted origin), its
  // owned image copy, and the Apple app search read. Every other method stays tombstoned.
  if(route.source==='tunes/server/routes/explorersCatalogRoutes.ts'&&route.method==='POST'&&['/api/explorers/v1/catalog/link-preview','/api/explorers/v1/catalog/link-preview/image'].includes(route.path))return 'explorers-owner';
  if(route.source==='tunes/server/routes/explorersCatalogRoutes.ts'&&route.method==='GET'&&route.path==='/api/explorers/v1/catalog/apps')return 'explorers-owner';
  if(route.source==='tunes/server/routes/explorersPlacesRoutes.ts'&&route.method==='GET'&&route.path==='/api/explorers/v1/places/nearby')return 'explorers-owner';
  if (route.source === 'tunes/server/routes/explorersAppEnrichmentRoutes.ts'
      && [
        ['PUT', '/api/explorers/v1/recommendations/:id/app-enrichment/binding'],
        ['DELETE', '/api/explorers/v1/recommendations/:id/app-enrichment/binding'],
        ['GET', '/api/explorers/v1/recommendations/:id/app-enrichment/binding'],
        ['POST', '/api/explorers/v1/recommendations/:id/app-enrichment/acceptances'],
        ['GET', '/api/explorers/v1/recommendations/:id/app-enrichment/suggestions'],
        ['GET', '/api/explorers/v1/recommendations/:id/app-enrichment/sources'],
      ].some(([method, path]) => route.method === method && route.path === path)) return 'explorers-owner';
  if (route.source === "tunes/server/routes/explorersRecommendationRoutes.ts"
      && [
        ["POST", "/api/explorers/v1/entities/resolve"],
        ["POST", "/api/explorers/v1/collections"],
        ["POST", "/api/explorers/v1/collections/:id/memberships/:recommendationId"],
        ["DELETE", "/api/explorers/v1/collections/:id/memberships/:recommendationId"],
        ["POST", "/api/explorers/v1/collections/:id/links"],
        ["PATCH", "/api/explorers/v1/collections/:id/links/:linkId"],
        ["DELETE", "/api/explorers/v1/collections/:id/links/:linkId"],
        ["GET", "/api/explorers/v1/collections"],
        ["GET", "/api/explorers/v1/collections/:id"],
        ["GET", "/api/explorers/v1/collections/:id/editable"],
        ["GET", "/api/explorers/v1/recommendations"],
        ["GET", "/api/explorers/v1/recommendations/search"],
        ["GET", "/api/explorers/v1/content-summary"],
        ["GET", "/api/explorers/v1/recommendations/:id"],
        ["GET", "/api/explorers/v1/recommendations/:id/editable"],
        ["GET", "/api/explorers/v1/categories/:category/content-snapshot"],
        ["GET", "/api/explorers/v1/categories/:category/content-snapshot/validate"],
        ["GET", "/api/explorers/v1/categories/:category/memberships"],
        ["GET", "/api/explorers/v1/categories/:category/top-picks"],
         ["PUT", "/api/explorers/v1/categories/:category/top-picks"],
         ["PATCH", "/api/explorers/v1/categories/:category/top-picks/order"],
        ["PATCH", "/api/explorers/v1/categories/:category/lists/order"],
        ["PATCH", "/api/explorers/v1/collections/:id"],
        ["PATCH", "/api/explorers/v1/collections/:id/order"],
        ["DELETE", "/api/explorers/v1/collections/:id"],
        ["POST", "/api/explorers/v1/collections/:id/make-it-mine"],
        ["POST", "/api/explorers/v1/collections/:id/restore"],
        ["POST", "/api/explorers/v1/collections/:id/purge"],
        ["POST", "/api/explorers/v1/recommendations"],
        ["POST", "/api/explorers/v1/recommendations/:id/movie-media/import"], ["POST", "/api/explorers/v1/recommendations/:id/entity"], ["POST", "/api/explorers/v1/recommendations/:id/book-covers"],
        ["PATCH", "/api/explorers/v1/recommendations/:id"],
        ["DELETE", "/api/explorers/v1/recommendations/:id"],
        // Ticket 5.3. The guide aggregate. Listed one method and path at a time because
        // this allowlist is fail-closed: an unlisted route classifies as a tombstone, so a
        // new category surface must be declared rather than inheriting owner authority
        // from the /collections/:id prefix it happens to sit under.
        ["GET", "/api/explorers/v1/collections/:id/guide"],
        ["PUT", "/api/explorers/v1/collections/:id/guide"],
        ["POST", "/api/explorers/v1/collections/:id/guide/sections"],
        ["PATCH", "/api/explorers/v1/collections/:id/guide/sections/order"],
        ["PATCH", "/api/explorers/v1/collections/:id/guide/sections/:sectionId"],
        ["DELETE", "/api/explorers/v1/collections/:id/guide/sections/:sectionId"],
        ["PUT", "/api/explorers/v1/collections/:id/guide/cover"],
        // WP9 (GD-24..30). Day and day-item commands, declared one at a time for the same reason.
        ["POST", "/api/explorers/v1/collections/:id/guide/days"],
        ["PATCH", "/api/explorers/v1/collections/:id/guide/days/:sectionId/position"],
        ["POST", "/api/explorers/v1/collections/:id/guide/days/:sectionId/duplicate"],
        ["POST", "/api/explorers/v1/collections/:id/guide/days/:sectionId/clear"],
        ["DELETE", "/api/explorers/v1/collections/:id/guide/days/:sectionId"],
        ["POST", "/api/explorers/v1/collections/:id/guide/days/:sectionId/items"],
        ["PATCH", "/api/explorers/v1/collections/:id/guide/days/:sectionId/items/:localId/position"],
        ["PUT", "/api/explorers/v1/collections/:id/guide/days/:sectionId/items/:localId/time-label"],
        ["PUT", "/api/explorers/v1/collections/:id/guide/days/:sectionId/items/:localId/note"],
        ["DELETE", "/api/explorers/v1/collections/:id/guide/days/:sectionId/items/:localId"],
      ].some(([method,path])=>route.method===method && route.path===path)) return "explorers-owner";
  if (route.source === "tunes/server/routes/explorersAccountRoutes.ts"
      && route.method === "PATCH" && route.path === "/api/explorers/v1/account") return "explorers-owner";
  if (route.source === "tunes/server/routes/explorersLifecycleRoutes.ts") {
    if (route.path.startsWith("/api/explorers/v1/account/")) return "explorers-owner";
    if (route.path === "/api/explorers/v1/recovery/status" || route.path === "/api/explorers/v1/recovery/complete")
      return "explorers-recovery";
  }
  if (route.source === "tunes/server/routes/explorersMediaRoutes.ts") {
    if (route.method === "POST" && route.path === "/api/explorers/v1/media") return "explorers-owner";
    if (route.method === "POST" && route.path === "/api/explorers/v1/media/provider-avatar") return "explorers-owner";
    if (route.method === "POST" && route.path === "/api/explorers/v1/media/place-photo") return "explorers-owner";
    if (route.method === "DELETE" && route.path === "/api/explorers/v1/media/:id") return "explorers-owner";
    if (["GET", "HEAD"].includes(route.method) && route.path === "/api/explorers/v1/media/:id/content") return "public";
  }
  if (route.method === "GET" && PUBLIC_PROFILE_GET_PATHS.has(route.path)) return "public";
  if (route.path === "/api/music/identity/ensure" || route.path.startsWith("/api/music/identity/lifecycle/")) return "strapi-identity";
  if (route.path === "/api/music/identity/current") return "owner";
  // Ticket 6.3. Owner-authenticated like the rest of this group: a handshake ticket
  // is minted only for a caller who already proved a credential on the request.
  if (route.path === "/api/music/socket-ticket") return "owner";
  if (route.path === "/api/music/entitlement" || route.path === "/api/music/dashboard" || route.path === "/api/music/features" || route.path === "/api/music/guest-controls") return "owner";
  if (route.path === "/api/music/publication" || route.path === "/api/music/queue/replace" || route.path === "/api/music/queue/append") return "owner";
  if (route.path === "/api/playlist/:guestUrl") return "guest";
  if (route.path === "/api/playlist/:guestUrl/requests") return "guest";
  if (route.path === "/api/explorers/analytics/music/:publicSlug/events") return "guest";
  if (route.path === "/api/playlist/:guestUrl/youtube/search" || route.path === "/api/playlist/:guestUrl/youtube/video-from-url") return "public";
  if (PUBLIC_PATHS.has(route.path) || route.classification === "public") return "public";
  if (route.path.startsWith("/api/admin/")) return "admin-tombstone";
  if (route.path === "/graphql" || route.path === "/api/strapi/graphql"
      || route.path === "/api/strapi/config" || route.path === "/api/debug/strapi"
      || route.path.startsWith("/api/auth/") || route.path === "/api/register"
      || route.path === "/api/connect/google" || route.path === "/api") return "tombstone";
  if (["/api/login", "/api/logout", "/api/check", "/api/csrf-token"].includes(route.path)) return "native-session";
  if (PAID_PREFIXES.some((prefix) => route.path.startsWith(prefix))) return "paid-owner";
  if (OWNER_PREFIXES.some((prefix) => route.path === prefix || route.path.startsWith(prefix))) return "owner";
  if (route.classification === "authenticated") return "owner";
  return "tombstone";
}

function allowedFor(decision: MusicSurfaceDecision) {
  const identityFlow = decision === "explorers-auth" || decision === "explorers-recovery";
  return {
    unauthenticated: decision === "public" || decision === "guest" || decision === "native-session" || decision === "explorers-auth" || decision === "explorers-recovery",
    owner: decision === "owner" || decision === "paid-owner" || decision === "owner-or-guest" || decision === "explorers-owner" || decision === "explorers-auth",
    otherUser: false,
    suspended: identityFlow,
    pendingDeletion: identityFlow,
    staleEntitlement: decision === "owner",
    guestValid: decision === "guest" || decision === "owner-or-guest",
    guestInvalid: false,
    guestRevoked: false,
    internalAdmin: false,
    nativeSession: decision === "native-session",
  };
}

export function authorizationMatrixFromInventory(inventory: {
  routes: RuntimeRouteSurface[];
  events: RuntimeEventSurface[];
  jobs?: Array<{ kind: string; lifecycle: string; source: string; line: number }>;
  retirementMatchers?: Array<{
    family: string;
    path: string;
    match: "exact" | "prefix";
    classification: "tombstone" | "admin-tombstone";
    exclusions?: readonly string[];
  }>;
}) {
  return {
    routes: inventory.routes.map((route) => {
      const decision = decisionForRoute(route);
      const allowed = allowedFor(decision);
      if (decision === "guest" && route.method !== "GET"
          && route.path !== "/api/playlist/:guestUrl/requests"
          && route.path !== "/api/explorers/analytics/music/:publicSlug/events") allowed.unauthenticated = false;
      const flowAccess = decision === "explorers-auth"
        ? { purpose: "provider-authentication", grantsApplicationAuthority: false }
        : decision === "explorers-recovery"
          ? { purpose: route.path.endsWith("/start") ? "recovery-intent-issuance" : "recovery-proof-consumption", grantsApplicationAuthority: false }
          : undefined;
      return {
        method: route.method, path: route.path, source: route.source, decision, allowed,
        ...(flowAccess ? { flowAccess } : {}),
      };
    }),
    events: inventory.events.map((event) => {
      const decision: MusicSurfaceDecision = event.direction === "emit" && event.event === "guest_request" ? "owner"
        : event.direction === "emit" && event.event === "player_state" ? "guest"
        : event.event === "guest_request" ? "guest"
        : event.event === "connection" ? "owner-or-guest"
          : event.event === "disconnect" || event.direction === "emit" ? "public"
          : event.event === "player_state" ? "owner" : "tombstone";
      return { direction: event.direction, event: event.event, source: event.source, decision, allowed: allowedFor(decision) };
    }),
    jobs: (inventory.jobs ?? []).map(({ line: _line, ...job }) => ({
      ...job,
      decision: "internal-service" as const,
      allowed: { internalService: true, browser: false, public: false },
    })),
    retirementMatchers: (inventory.retirementMatchers ?? []).map((rule) => ({
      ...rule,
      decision: rule.classification,
      allowed: allowedFor(rule.classification),
    })),
  };
}
