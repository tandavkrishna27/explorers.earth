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
  "/itunes-api/search",
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
  if (route.classification === "admin-tombstone") return "admin-tombstone";
  if (route.classification === "tombstone") return "tombstone";
  if(route.source==='tunes/server/routes/explorersPublicContentRoutes.ts' && route.method==='GET' && [
    '/api/explorers/v1/public/profiles/:username/collections/:category',
    '/api/explorers/v1/public/recommendations/search',
    '/api/explorers/v1/public/profiles/:username/collections/:category/:slug/recommendations',
    '/api/explorers/v1/public/profiles/:username/collections/:category/:slug/recommendations/:id',
  ].includes(route.path)) return 'public';
  if(route.source==='tunes/server/routes/explorersCatalogRoutes.ts'&&route.method==='GET'&&route.path==='/api/explorers/v1/catalog/books')return 'explorers-owner';
  if(route.source==='tunes/server/routes/explorersCatalogRoutes.ts'&&route.method==='GET'&&route.path==='/api/explorers/v1/catalog/movies')return 'explorers-owner';
  if (route.source === "tunes/server/routes/explorersRecommendationRoutes.ts"
      && [
        ["POST", "/api/explorers/v1/entities/resolve"],
        ["POST", "/api/explorers/v1/collections"],
        ["GET", "/api/explorers/v1/collections"],
        ["GET", "/api/explorers/v1/collections/:id"],
        ["GET", "/api/explorers/v1/collections/:id/editable"],
        ["GET", "/api/explorers/v1/recommendations"],
        ["GET", "/api/explorers/v1/recommendations/search"],
        ["GET", "/api/explorers/v1/recommendations/:id"],
        ["GET", "/api/explorers/v1/recommendations/:id/editable"],
        ["GET", "/api/explorers/v1/categories/:category/content-snapshot"],
        ["GET", "/api/explorers/v1/categories/:category/content-snapshot/validate"],
        ["GET", "/api/explorers/v1/categories/:category/memberships"],
        ["GET", "/api/explorers/v1/categories/:category/top-picks"],
         ["PUT", "/api/explorers/v1/categories/:category/top-picks"],
         ["PATCH", "/api/explorers/v1/categories/:category/top-picks/order"],
        ["PATCH", "/api/explorers/v1/collections/:id"],
        ["PATCH", "/api/explorers/v1/collections/:id/order"],
        ["DELETE", "/api/explorers/v1/collections/:id"],
        ["POST", "/api/explorers/v1/recommendations"],
        ["POST", "/api/explorers/v1/recommendations/:id/entity"], ["POST", "/api/explorers/v1/recommendations/:id/book-covers"],
        ["PATCH", "/api/explorers/v1/recommendations/:id"],
        ["DELETE", "/api/explorers/v1/recommendations/:id"],
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
    if (route.method === "DELETE" && route.path === "/api/explorers/v1/media/:id") return "explorers-owner";
    if (["GET", "HEAD"].includes(route.method) && route.path === "/api/explorers/v1/media/:id/content") return "public";
  }
  if (route.method === "GET" && PUBLIC_PROFILE_GET_PATHS.has(route.path)) return "public";
  if (route.path === "/api/music/identity/ensure" || route.path.startsWith("/api/music/identity/lifecycle/")) return "strapi-identity";
  if (route.path === "/api/music/identity/current") return "owner";
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
