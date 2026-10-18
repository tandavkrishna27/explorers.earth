import { RETIRED_MUSIC_ROUTE_RULES, normalizeMusicRoutePath,
  type RetiredMusicRouteRule } from "./musicRetirementPolicy";

/**
 * The canonical application OWNS `/api/auth/*` — it is Better Auth's route group
 * (canonicalApp.ts:77-78), not a retired surface. musicRetirementPolicy.ts:18
 * retires that whole prefix, which was correct inside the Music composition and
 * is fatal here. The three legacy bridges are re-declared as EXACT paths and the
 * prefix rule is dropped.
 *
 * Verified safe to tombstone: none of the three is a Better Auth route, and the
 * only reference in explorers-earth/src is
 * features/music/__tests__/legacyMusicBoundary.test.ts:28, which asserts the
 * legacy path is NOT used.
 */
const RETIRED_LEGACY_IDENTITY_BRIDGES: readonly RetiredMusicRouteRule[] = [
  { family: "legacy-browser-identity", path: "/api/auth/sync", match: "exact", classification: "tombstone" },
  { family: "legacy-browser-identity", path: "/api/auth/user-data", match: "exact", classification: "tombstone" },
  { family: "legacy-browser-identity", path: "/api/auth/onboarding-status", match: "exact", classification: "tombstone" },
] as const;

/**
 * P3-5 removed the canonical app's own Music routes. Old clients get a deliberate 410
 * rather than the JSON 404. Canonical-only: the legacy composition still mounts the
 * analytics pair until P3-7 deletes it, so these are not added to the shared policy.
 * Both analytics prefixes are listed because prefix matching is segment-wise, so
 * `/api/explorers/analytics/music` does not cover `.../music-account/...`.
 */
const RETIRED_CANONICAL_MUSIC_ROUTES: readonly RetiredMusicRouteRule[] = [
  { family: "music-identity", path: "/api/explorers/v1/music/identity/ensure", match: "exact", classification: "tombstone" },
  { family: "analytics", path: "/api/explorers/analytics/music-account", match: "prefix", classification: "tombstone" },
  { family: "analytics", path: "/api/explorers/analytics/music", match: "prefix", classification: "tombstone" },
] as const;

export const CANONICAL_RETIRED_ROUTE_RULES: readonly RetiredMusicRouteRule[] = [
  ...RETIRED_MUSIC_ROUTE_RULES.filter((rule) => !(rule.path === "/api/auth" && rule.match === "prefix")),
  ...RETIRED_LEGACY_IDENTITY_BRIDGES,
  ...RETIRED_CANONICAL_MUSIC_ROUTES,
] as const;

/** Verbatim copy of matchRetiredMusicSurface (musicRetirementPolicy.ts:74-77). */
export function matchCanonicalRetiredSurface(rawPath: string): RetiredMusicRouteRule | undefined {
  const path = normalizeMusicRoutePath(rawPath);
  if (!path) return undefined;
  return CANONICAL_RETIRED_ROUTE_RULES.find((rule) => {
    if (rule.exclusions?.includes(path)) return false;
    return rule.match === "exact" ? path === rule.path : path === rule.path || path.startsWith(`${rule.path}/`);
  });
}
