export type RetiredMusicClassification = "tombstone" | "admin-tombstone";

export interface RetiredMusicRouteRule {
  family: string;
  path: string;
  match: "exact" | "prefix";
  classification: RetiredMusicClassification;
  exclusions?: readonly string[];
}

/** Executable source of truth for legacy paths mounted behind canonical routes. */
export const RETIRED_MUSIC_ROUTE_RULES: readonly RetiredMusicRouteRule[] = [
  { family: "graphql-service-proxy", path: "/graphql", match: "exact", classification: "tombstone" },
  { family: "graphql-service-proxy", path: "/api/strapi/graphql", match: "exact", classification: "tombstone" },
  { family: "graphql-service-proxy", path: "/api/strapi/config", match: "exact", classification: "tombstone" },
  { family: "graphql-service-proxy", path: "/api/debug/strapi", match: "exact", classification: "tombstone" },
  { family: "legacy-browser-identity", path: "/api", match: "exact", classification: "tombstone" },
  { family: "legacy-browser-identity", path: "/api/auth", match: "prefix", classification: "tombstone" },
  { family: "legacy-browser-identity", path: "/api/register", match: "exact", classification: "tombstone" },
  { family: "legacy-browser-identity", path: "/api/connect/google", match: "exact", classification: "tombstone" },
  { family: "legacy-admin", path: "/api/admin", match: "prefix", classification: "admin-tombstone" },
  { family: "swagger", path: "/api-docs", match: "prefix", classification: "tombstone" },
  { family: "settings", path: "/api/page-contents", match: "prefix", classification: "tombstone" },
  { family: "legacy-browser-identity", path: "/api/verify-email", match: "prefix", classification: "tombstone" },
  { family: "legacy-browser-identity", path: "/api/resend-verification", match: "exact", classification: "tombstone" },
  {
    family: "venue", path: "/api/user", match: "prefix", classification: "tombstone",
    exclusions: ["/api/user/request-reactivation", "/api/user/reactivate"],
  },
  { family: "settings", path: "/api/system-settings", match: "prefix", classification: "tombstone" },
  { family: "youtube", path: "/api/youtube", match: "prefix", classification: "tombstone" },
  { family: "instagram", path: "/api/instagram", match: "prefix", classification: "tombstone" },
  { family: "payment", path: "/api/payments", match: "prefix", classification: "tombstone" },
  { family: "subscription", path: "/api/subscriptions", match: "prefix", classification: "tombstone" },
  { family: "gemini", path: "/api/gemini", match: "prefix", classification: "tombstone" },
  { family: "settings", path: "/api/email", match: "prefix", classification: "tombstone" },
  { family: "analytics", path: "/api/seo", match: "prefix", classification: "tombstone" },
  { family: "scrape", path: "/api/apps", match: "prefix", classification: "tombstone" },
  { family: "scrape", path: "/api/products", match: "prefix", classification: "tombstone" },
  { family: "scrape", path: "/api/people", match: "prefix", classification: "tombstone" },
  { family: "scrape", path: "/api/proxy-image", match: "prefix", classification: "tombstone" },
  { family: "itunes", path: "/itunes-api", match: "prefix", classification: "tombstone" },
  { family: "scrape", path: "/apps", match: "prefix", classification: "tombstone" },
  { family: "scrape", path: "/products", match: "prefix", classification: "tombstone" },
  { family: "scrape", path: "/people", match: "prefix", classification: "tombstone" },
  { family: "scrape", path: "/proxy-image", match: "prefix", classification: "tombstone" },
  { family: "playlist", path: "/api/playlists", match: "prefix", classification: "tombstone" },
  { family: "playlist", path: "/api/playlist", match: "prefix", classification: "tombstone" },
  { family: "request", path: "/api/music/guest/request", match: "exact", classification: "tombstone" },
  { family: "publication", path: "/api/music/guest-capability", match: "prefix", classification: "tombstone" },
  { family: "publication", path: "/api/music/publication/publish", match: "exact", classification: "tombstone" },
  { family: "publication", path: "/api/music/publication/unpublish", match: "exact", classification: "tombstone" },
] as const;

export function normalizeMusicRoutePath(rawPath: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath.split(/[?#]/, 1)[0]);
  } catch {
    return undefined;
  }
  const segments: string[] = [];
  for (const segment of decoded.replace(/\\/g, "/").split(/\/+/)) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment.toLowerCase());
  }
  return `/${segments.join("/")}`;
}

export function matchRetiredMusicSurface(rawPath: string): RetiredMusicRouteRule | undefined {
  const path = normalizeMusicRoutePath(rawPath);
  if (!path) return undefined;
  return RETIRED_MUSIC_ROUTE_RULES.find((rule) => {
    if (rule.exclusions?.includes(path)) return false;
    return rule.match === "exact" ? path === rule.path : path === rule.path || path.startsWith(`${rule.path}/`);
  });
}
