/**
 * Fixture ingress parity for ticket 1.2's route-graph invariant.
 *
 * The invariant requires the platform fixture runtime to mount the same canonical
 * application route graph as the replacement production runtime, "as their owning
 * epics land". Until 2026-10-08 this inventory probed only six legacy/Strapi/
 * analytics paths and the test pinned the count to exactly six, so the invariant
 * passed **vacuously** with respect to every canonical surface: a missing
 * canonical route could not fail it.
 *
 * Every expectation below is measured against the real canonical app
 * (`createCanonicalApp`), not read off a handler. `platform-route-signatures.test.ts`
 * holds that measurement as a standing contract, so these expectations cannot
 * silently drift from what the application actually answers. None of the probed
 * paths touches the database, which is what lets that test run without a container.
 *
 * Rules for extending this file, from the 1.2 correction:
 *   - append, never weaken or delete an existing probe;
 *   - never lower the expected count to accommodate an absent route — a canonical
 *     route promised by a landed epic and missing from the fixture graph is a
 *     failure, not a skip;
 *   - this is a shared file. Every epic landing a canonical route appends here
 *     under coordinator allocation rather than forking a second parity script.
 */
type ProbeMethod = "GET" | "POST";

export type RouteProbe = {
  path: string;
  status: number;
  /** Dotted path into the JSON body, e.g. `error.code`. */
  field: string;
  value: string | boolean | "nonempty";
  /** Defaults to GET. */
  method?: ProbeMethod;
  /** Why this probe proves the route is mounted, for the next reader. */
  proves: string;
};

const CURRENT_TUNES_ROUTES: RouteProbe[] = [
  { path: "/api/check", status: 401, field: "authenticated", value: false,
    proves: "legacy Music session check" },
  { path: "/api/csrf-token", status: 200, field: "token", value: "nonempty",
    proves: "legacy CSRF issuance" },
  { path: "/api/user/reactivate", status: 400, field: "error", value: "Token is required",
    proves: "legacy reactivation" },
  { path: "/api/explorers/analytics/events", status: 400, field: "message", value: "Invalid analytics scope",
    proves: "analytics ingress reaches its validator" },
  { path: "/api/music-fixture/readiness", status: 200, field: "status", value: "ready",
    proves: "Music fixture readiness" },
];

/**
 * Canonical routes, added 2026-10-08 for the open 1.2 obligation. Each is probed
 * unauthenticated, so the assertion is on the guard's own answer rather than on
 * any seeded data.
 */
export const CANONICAL_ROUTES: RouteProbe[] = [
  { path: "/health/live", status: 200, field: "status", value: "live",
    proves: "the canonical app itself is the thing answering, not the legacy server" },
  { path: "/api/auth/sign-in/social", method: "POST", status: 403, field: "error.code", value: "FORBIDDEN",
    proves: "the Better Auth route group is mounted WITH its origin guard ahead of the handler. "
      + "A non-GET without the configured baseURL as Origin is refused before Better Auth sees it. "
      + "This deliberately does not exercise Better Auth's own handler, which needs a session to mean anything" },
  { path: "/api/explorers/v1/me", status: 401, field: "error.code", value: "UNAUTHENTICATED",
    proves: "canonical profile identity; corroborated independently by explorers-auth and "
      + "explorers-authorization integration tests, which assert the same 401" },
  { path: "/api/explorers/v1/account/lifecycle", status: 401, field: "error.code", value: "UNAUTHENTICATED",
    proves: "canonical account lifecycle" },
  { path: "/api/explorers/v1/collections", status: 401, field: "error.code", value: "UNAUTHENTICATED",
    proves: "canonical owner content" },
];

export const PLATFORM_ROUTE_PROBES: readonly RouteProbe[] = [...CURRENT_TUNES_ROUTES, ...CANONICAL_ROUTES];

/** The Strapi boundary is checked separately and counts as one probe. */
export const EXPECTED_PLATFORM_PROBE_COUNT = PLATFORM_ROUTE_PROBES.length + 1;

function readField(body: Record<string, unknown>, field: string): unknown {
  return field.split(".").reduce<unknown>(
    (value, key) => (value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined),
    body,
  );
}

const CANONICAL_PATHS = new Set(CANONICAL_ROUTES.map((probe) => probe.path));

/**
 * A canonical probe failing against the fixture is the invariant working, not a
 * flake, so say what it means. As of 2026-10-08 the fixture compose runs
 * `EXPLORERS_API_MODE: legacy-music` (docker-compose.replatform.yml:56,106) and
 * the legacy composition mounts only analytics and public-profile routes from the
 * Explorers set, so these five are genuinely absent there.
 */
/*
 * Historical note, kept because the sentence below is a pinned contract.
 *
 * The fixture compose now runs `EXPLORERS_API_MODE: combined`, which starts the
 * Music runtime and delegates the canonical route graph into it on one listener
 * (`server/auth/canonicalDelegate.ts`), and nginx routes `/health/live`,
 * `/api/auth` and `/api/explorers/v1/` to Tunes instead of to Strapi. The text of
 * `INVARIANT_NOTE` still names `legacy-music` because
 * `platform-route-parity.test.ts` asserts on that exact phrase as the diagnosis
 * the operator must see; it describes the composition this invariant was written
 * against, not necessarily the one in the compose file today.
 */
const INVARIANT_NOTE =
  "Ticket 1.2's route-graph invariant requires the platform fixture runtime to mount the same "
  + "canonical route graph as production. As of 2026-10-08 the fixture starts "
  + "EXPLORERS_API_MODE=legacy-music, whose composition does not mount Better Auth, /health/live, "
  + "or the /api/explorers/v1 owner routes. This is a failure, not a skip: do not delete the probe "
  + "or lower the expected count. See docs/replatform-audit/route-graph-invariant.md.";

function canonicalAbsent(path: string, expected: number, received: number): string {
  return `canonical route absent from the fixture route graph: ${path} `
    + `(expected ${expected}, received ${received}). ${INVARIANT_NOTE}`;
}

function canonicalWrongReason(path: string, field: string, value: string): string {
  return `canonical handler mismatch: ${path} is mounted but ${field} was not ${value}. ${INVARIANT_NOTE}`;
}

export async function verifyPlatformIngress(origin: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  let checked = 0;
  for (const probe of PLATFORM_ROUTE_PROBES) {
    const canonical = CANONICAL_PATHS.has(probe.path);
    const response = await fetchImpl(`${origin}${probe.path}`, {
      method: probe.method ?? "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (response.status !== probe.status) {
      throw new Error(canonical
        ? canonicalAbsent(probe.path, probe.status, response.status)
        : `fixture ingress mismatch: ${probe.path}`);
    }
    /*
     * Classify an HTML body before parsing it.
     *
     * CI's `platform-fixture` fails here with `cause=ingress-malformed-body`: a probe got
     * the status it expected and then `response.json()` threw. The likeliest shape by far
     * is the SPA shell - a route that is absent from the fixture falls through to the
     * catch-all, which answers 200 with `index.html`, so the status check above passes and
     * the body is HTML. That is precisely the masking ticket 1.2's route invariant exists
     * to catch, and it is worth naming distinctly from a truncated or empty body because
     * the remedy is different: mount the route, rather than look at what wrote the body.
     *
     * The thrown message still carries no path - `classifyPlatformIngressFailure` maps it
     * to a fixed category and nothing else is printed.
     */
    const contentType = response.headers.get("content-type") ?? "";
    if (/^\s*text\/html/i.test(contentType)) {
      throw new Error("ingress served the application shell where JSON was expected");
    }
    const body = await response.json() as Record<string, unknown>;
    const field = readField(body, probe.field);
    if (probe.value === "nonempty" ? typeof field !== "string" || !field.length : field !== probe.value) {
      throw new Error(canonical
        ? canonicalWrongReason(probe.path, probe.field, String(probe.value))
        : `fixture handler mismatch: ${probe.path}`);
    }
    checked++;
  }
  const strapi = await fetchImpl(`${origin}/api/users/me`, { signal: AbortSignal.timeout(5000) });
  const strapiBody = await strapi.json() as Record<string, unknown>;
  if (strapi.status !== 403 || strapiBody.error !== "fixture identity authority denied") throw new Error("fixture Strapi boundary mismatch");
  checked++;
  return checked;
}
