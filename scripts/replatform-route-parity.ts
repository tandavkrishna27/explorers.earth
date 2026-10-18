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
 *
 * One deliberate redefinition, 2026-10-18 (P3-2, Music removal): the fixture now
 * runs `EXPLORERS_API_MODE=canonical`, so it proves the canonical route graph
 * only. Five probes left the invariant with the product they described - the four
 * legacy Music paths (`/api/check`, `/api/csrf-token`, `/api/user/reactivate`,
 * `/api/music-fixture/readiness`) and the Strapi boundary (`/api/users/me`) -
 * because nothing in a canonical-only fixture answers them. That is a change to
 * what the fixture proves, not an accommodation of an absent route, and the rules
 * above still apply to every probe that remains.
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

/**
 * Probed at fixture ingress but not part of `CANONICAL_ROUTES`. The canonical app
 * mounts the analytics routes (`setupCanonicalAnalyticsRoutes`), so this probe
 * survived the P3-2 redefinition; `platform-route-signatures.test.ts` measures it
 * against `createCanonicalApp` alongside the canonical set.
 */
const CURRENT_TUNES_ROUTES: RouteProbe[] = [
  { path: "/api/explorers/analytics/events", status: 400, field: "message", value: "Invalid analytics scope",
    proves: "analytics ingress reaches its validator" },
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

export const EXPECTED_PLATFORM_PROBE_COUNT = PLATFORM_ROUTE_PROBES.length;

function readField(body: Record<string, unknown>, field: string): unknown {
  return field.split(".").reduce<unknown>(
    (value, key) => (value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined),
    body,
  );
}

const CANONICAL_PATHS = new Set(CANONICAL_ROUTES.map((probe) => probe.path));

/**
 * A canonical probe failing against the fixture is the invariant working, not a
 * flake, so say what it means.
 */
const INVARIANT_NOTE =
  "Ticket 1.2's route-graph invariant requires the platform fixture runtime to mount the same "
  + "canonical route graph as production. The fixture starts EXPLORERS_API_MODE=canonical "
  + "(docker-compose.replatform.yml), so an absent route means the fixture composition or its "
  + "nginx ingress has drifted from the canonical app. This is a failure, not a skip: do not "
  + "delete the probe or lower the expected count. See docs/replatform-audit/route-graph-invariant.md.";

function canonicalAbsent(path: string, expected: number, received: number): string {
  return `canonical route absent from the fixture route graph: ${path} `
    + `(expected ${expected}, received ${received}). ${INVARIANT_NOTE}`;
}

function canonicalWrongReason(path: string, field: string, value: string): string {
  return `canonical handler mismatch: ${path} is mounted but ${field} was not ${value}. ${INVARIANT_NOTE}`;
}

/*
 * Until 2026-10-18 this test carried a literal backspace byte (0x08) where `\b` was
 * meant, so it could never match: every SPA-shell answer surfaced as a JSON
 * SyntaxError (`ingress-malformed-body`) instead of `ingress-html-shell`.
 */
function assertNotApplicationShell(response: Response): void {
  const contentType = response.headers.get("content-type") ?? "";
  if (/^\s*text\/html\b/i.test(contentType)) {
    throw new Error("ingress served the application shell where JSON was expected");
  }
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
    assertNotApplicationShell(response);
    const body = await response.json() as Record<string, unknown>;
    const field = readField(body, probe.field);
    if (probe.value === "nonempty" ? typeof field !== "string" || !field.length : field !== probe.value) {
      throw new Error(canonical
        ? canonicalWrongReason(probe.path, probe.field, String(probe.value))
        : `fixture handler mismatch: ${probe.path}`);
    }
    checked++;
  }
  return checked;
}

/** A category the probed owner has hidden. Only a hidden one proves the privacy gate. */
export type HiddenCategoryTarget = { handle: string; category: string };

/**
 * The ingress probe for a deployed canonical-only host (P2 Task 6).
 *
 * `verifyPlatformIngress` is the local fixture's invariant: since P3-2 retired `combined`
 * it probes `CANONICAL_ROUTES` plus the analytics ingress, at the fixture's loopback
 * origin with its stable expectations. This runs only
 * `CANONICAL_ROUTES` - whose anonymous `/api/explorers/v1/me` -> 401 is the probe that
 * reaches the database, so a 503 there fails - plus two probes that tell a working
 * deployment from a plausible-looking one:
 *
 *   - anonymous `GET /api/auth/get-session` must be 200, `Cache-Control: no-store`, body
 *     literally `null` (Better Auth 1.7.6 `getSession`). A 401 means Better Auth is not
 *     answering, `{"session":null}` is the fixture stub, and a `text/html` 200 is the
 *     nginx SPA fallback;
 *   - a hidden category on a public profile must be 404 from the public read model. An
 *     empty but public category correctly answers 200, so only a hidden one proves the
 *     privacy gate is live.
 *
 * Unlike the fixture probe, failures name the path: a deployed host has no secret paths.
 */
export async function verifyCanonicalIngress(
  origin: string,
  hidden: HiddenCategoryTarget,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const get = (path: string, method: ProbeMethod = "GET") =>
    fetchImpl(`${origin}${path}`, { method, signal: AbortSignal.timeout(5000) });
  let checked = 0;
  for (const probe of CANONICAL_ROUTES) {
    const response = await get(probe.path, probe.method);
    if (response.status !== probe.status) {
      throw new Error(`canonical ingress mismatch: ${probe.path} answered ${response.status}, expected ${probe.status}`);
    }
    assertNotApplicationShell(response);
    const field = readField(await response.json() as Record<string, unknown>, probe.field);
    if (probe.value === "nonempty" ? typeof field !== "string" || !field.length : field !== probe.value) {
      throw new Error(`canonical handler mismatch: ${probe.path} is mounted but ${probe.field} was not ${probe.value}`);
    }
    checked++;
  }

  const sessionPath = "/api/auth/get-session";
  const session = await get(sessionPath);
  if (session.status !== 200) {
    throw new Error(`canonical ingress mismatch: ${sessionPath} answered ${session.status}, expected 200`);
  }
  assertNotApplicationShell(session);
  const directives = (session.headers.get("cache-control") ?? "").split(",").map((value) => value.trim().toLowerCase());
  if (!directives.includes("no-store")) {
    throw new Error(`canonical ingress mismatch: ${sessionPath} is cacheable (Cache-Control must be no-store)`);
  }
  let anonymous: unknown;
  try { anonymous = JSON.parse(await session.text()); } catch { anonymous = undefined; }
  if (anonymous !== null) {
    throw new Error(`canonical handler mismatch: ${sessionPath} did not answer the anonymous session as null`);
  }
  checked++;

  const hiddenPath = `/api/explorers/v1/profiles/${encodeURIComponent(hidden.handle)}`
    + `/recommendations/${encodeURIComponent(hidden.category)}`;
  const gated = await get(hiddenPath);
  assertNotApplicationShell(gated);
  if (gated.status !== 404) {
    throw new Error(`canonical privacy gate not live: ${hiddenPath} answered ${gated.status}, expected 404 for a hidden category`);
  }
  if (readField(await gated.json() as Record<string, unknown>, "error.code") !== "NOT_FOUND") {
    throw new Error(`canonical privacy gate not live: ${hiddenPath} 404 did not come from the public read model`);
  }
  checked++;
  return checked;
}
