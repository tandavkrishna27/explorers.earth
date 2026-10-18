import { describe, expect, it } from "vitest";
import { assertCanonicalPlatformRouteGraph } from "../../config/platform-route-graph";
import {
  CANONICAL_ROUTES,
  EXPECTED_PLATFORM_PROBE_COUNT,
  PLATFORM_ROUTE_PROBES,
  verifyCanonicalIngress,
  verifyPlatformIngress,
} from "../../../../scripts/replatform-route-parity";

/**
 * Ticket 1.2's route-graph invariant. Before 2026-10-08 the expected count was
 * the literal `6`, pinned to the legacy/Strapi/analytics probes, so a missing
 * canonical route could not fail this test. The canonical probes are now part of
 * the inventory and the count is derived from it rather than typed in — a probe
 * added without a response here fails loudly instead of silently raising a
 * number nobody re-checked.
 */
describe("platform fixture route parity", () => {
  const responses: Record<string, [number, Record<string, unknown>]> = {
    "/api/check": [401, { authenticated: false }],
    "/api/csrf-token": [200, { token: "fixture-csrf" }],
    "/api/user/reactivate": [400, { error: "Token is required" }],
    "/api/explorers/analytics/events": [400, { message: "Invalid analytics scope" }],
    "/api/music-fixture/readiness": [200, { status: "ready" }],
    "/health/live": [200, { status: "live" }],
    "/api/auth/sign-in/social": [403, { error: { code: "FORBIDDEN", message: "Auth request origin is not trusted" } }],
    "/api/explorers/v1/me": [401, { error: { code: "UNAUTHENTICATED", message: "Sign in is required" } }],
    "/api/explorers/v1/account/lifecycle": [401, { error: { code: "UNAUTHENTICATED", message: "Sign in is required" } }],
    "/api/explorers/v1/collections": [401, { error: { code: "UNAUTHENTICATED", message: "Sign in is required" } }],
    "/api/users/me": [403, { error: "fixture identity authority denied" }],
  };

  function fixtureIngress() {
    const seen: string[] = [];
    const fetchImpl = (async (input: string, init?: { method?: string }) => {
      const path = new URL(input).pathname;
      seen.push(`${init?.method ?? "GET"} ${path}`);
      const [status, body] = responses[path];
      return Response.json(body, { status });
    }) as typeof fetch;
    return { seen, fetchImpl };
  }

  it("requires actual auth, profile, content, lifecycle, analytics, Music and Strapi handler signatures at fixture ingress", async () => {
    const ingress = fixtureIngress();
    expect(await verifyPlatformIngress("http://127.0.0.1:51474", ingress.fetchImpl))
      .toBe(EXPECTED_PLATFORM_PROBE_COUNT);
    expect(ingress.seen).toEqual([
      "GET /api/check",
      "GET /api/csrf-token",
      "GET /api/user/reactivate",
      "GET /api/explorers/analytics/events",
      "GET /api/music-fixture/readiness",
      "GET /health/live",
      "POST /api/auth/sign-in/social",
      "GET /api/explorers/v1/me",
      "GET /api/explorers/v1/account/lifecycle",
      "GET /api/explorers/v1/collections",
      "GET /api/users/me",
    ]);
  });

  it("counts the canonical routes, so an absent one cannot pass as a skip", () => {
    // The guard the 1.2 correction asks for in prose: the count must not be
    // lowered to accommodate a missing canonical route.
    expect(EXPECTED_PLATFORM_PROBE_COUNT).toBe(11);
    const paths = PLATFORM_ROUTE_PROBES.map((probe) => probe.path);
    for (const canonical of [
      "/health/live",
      "/api/auth/sign-in/social",
      "/api/explorers/v1/me",
      "/api/explorers/v1/account/lifecycle",
      "/api/explorers/v1/collections",
    ]) {
      expect(paths).toContain(canonical);
    }
    // And the original six are not weakened away.
    for (const legacy of [
      "/api/check",
      "/api/csrf-token",
      "/api/user/reactivate",
      "/api/explorers/analytics/events",
      "/api/music-fixture/readiness",
    ]) {
      expect(paths).toContain(legacy);
    }
  });

  it("fails when a probed route answers with the wrong status", async () => {
    const ingress = fixtureIngress();
    responses["/api/user/reactivate"] = [403, { error: "fixture identity authority denied" }];
    await expect(verifyPlatformIngress("http://127.0.0.1:51474", ingress.fetchImpl))
      .rejects.toThrow(/ingress mismatch/);
    responses["/api/user/reactivate"] = [400, { error: "Token is required" }];
  });

  it("fails when a canonical route answers with the wrong error code", async () => {
    // The nested-field case the legacy probes never exercised: a canonical route
    // that is mounted but refuses for the wrong reason is still a parity failure.
    const ingress = fixtureIngress();
    responses["/api/explorers/v1/collections"] = [401, { error: { code: "FORBIDDEN", message: "wrong reason" } }];
    await expect(verifyPlatformIngress("http://127.0.0.1:51474", ingress.fetchImpl))
      .rejects.toThrow(/canonical handler mismatch: \/api\/explorers\/v1\/collections is mounted but error\.code was not UNAUTHENTICATED/);
    responses["/api/explorers/v1/collections"] = [401, { error: { code: "UNAUTHENTICATED", message: "Sign in is required" } }];
  });

  it("explains itself when a canonical route is absent, instead of failing cryptically", async () => {
    // This is the failure CI will actually hit while the fixture runs
    // legacy-music, so the message has to carry its own diagnosis.
    const ingress = fixtureIngress();
    responses["/api/explorers/v1/me"] = [404, { error: { code: "NOT_FOUND", message: "Cannot GET" } }];
    await expect(verifyPlatformIngress("http://127.0.0.1:51474", ingress.fetchImpl))
      .rejects.toThrow(/canonical route absent from the fixture route graph: \/api\/explorers\/v1\/me/);
    await expect(verifyPlatformIngress("http://127.0.0.1:51474", fixtureIngress().fetchImpl))
      .rejects.toThrow(/EXPLORERS_API_MODE=legacy-music/);
    await expect(verifyPlatformIngress("http://127.0.0.1:51474", fixtureIngress().fetchImpl))
      .rejects.toThrow(/failure, not a skip/);
    responses["/api/explorers/v1/me"] = [401, { error: { code: "UNAUTHENTICATED", message: "Sign in is required" } }];
  });

  it("names the SPA shell rather than failing as a JSON parse error", async () => {
    // Regression: the content-type test carried a literal 0x08 byte where `\b` was
    // meant, so the shell always surfaced as a SyntaxError instead.
    const shell = (async () => new Response("<!doctype html>", {
      status: 401, headers: { "content-type": "text/html; charset=utf-8" },
    })) as typeof fetch;
    await expect(verifyPlatformIngress("http://127.0.0.1:51474", shell))
      .rejects.toThrow(/^ingress served the application shell where JSON was expected$/);
  });

  it("rejects the restricted Music profile for fixture platform runtime", () => {
    expect(() => assertCanonicalPlatformRouteGraph("fixture", { kind: "local-music" } as never)).toThrow(/route graph/i);
  });
});

/**
 * P2 Task 6: the same probe, pointed at a deployed canonical-only host. The
 * fixture invariant above keeps its eleven probes until P3 retires `combined`;
 * this is a second, canonical-only function rather than an edit of that set.
 */
describe("deployed canonical ingress", () => {
  const origin = "https://explorers.example";
  const hidden = { handle: "owner-a", category: "games" };
  const hiddenPath = "/api/explorers/v1/profiles/owner-a/recommendations/games";
  const spaShell = () => new Response("<!doctype html><div id=\"root\"></div>", {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });

  type Answer = () => Response;
  function canonicalHost(overrides: Record<string, Answer> = {}) {
    const answers: Record<string, Answer> = {
      "/health/live": () => Response.json({ status: "live" }),
      "/api/auth/sign-in/social": () => Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 }),
      "/api/explorers/v1/me": () => Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 }),
      "/api/explorers/v1/account/lifecycle": () => Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 }),
      "/api/explorers/v1/collections": () => Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 }),
      // Better Auth 1.7.6 `getSession`: anonymous answers the literal `null` with no-store.
      "/api/auth/get-session": () => new Response("null", {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      }),
      [hiddenPath]: () => Response.json(
        { version: "explorers-public-error/v1", error: { code: "NOT_FOUND" } },
        { status: 404, headers: { "cache-control": "no-store" } },
      ),
      ...overrides,
    };
    const seen: string[] = [];
    const fetchImpl = (async (input: string, init?: { method?: string }) => {
      const url = new URL(input);
      expect(url.origin).toBe(origin);
      seen.push(`${init?.method ?? "GET"} ${url.pathname}`);
      const answer = answers[url.pathname];
      if (!answer) throw new Error(`unexpected probe ${url.pathname}`);
      return answer();
    }) as typeof fetch;
    return { seen, fetchImpl };
  }

  it("probes the canonical routes plus session, database-backed identity and the privacy gate", async () => {
    const host = canonicalHost();
    expect(await verifyCanonicalIngress(origin, hidden, host.fetchImpl)).toBe(CANONICAL_ROUTES.length + 2);
    expect(host.seen).toEqual([
      "GET /health/live",
      "POST /api/auth/sign-in/social",
      "GET /api/explorers/v1/me",
      "GET /api/explorers/v1/account/lifecycle",
      "GET /api/explorers/v1/collections",
      "GET /api/auth/get-session",
      `GET ${hiddenPath}`,
    ]);
  });

  it("probes no legacy Music or Strapi path", async () => {
    const host = canonicalHost();
    await verifyCanonicalIngress(origin, hidden, host.fetchImpl);
    const canonical = new Set(CANONICAL_ROUTES.map((probe) => probe.path));
    const legacy = [
      ...PLATFORM_ROUTE_PROBES.map((probe) => probe.path).filter((path) => !canonical.has(path)),
      "/api/users/me",
    ];
    expect(legacy.length).toBeGreaterThan(0);
    for (const probe of host.seen) {
      const path = probe.split(" ")[1];
      expect(legacy).not.toContain(path);
      expect(path).not.toMatch(/music|strapi|graphql|csrf|\/api\/check$/i);
    }
  });

  it("rejects the SPA shell answering where JSON was expected", async () => {
    const everything = canonicalHost(Object.fromEntries(
      ["/health/live", "/api/auth/get-session"].map((path) => [path, spaShell]),
    ));
    await expect(verifyCanonicalIngress(origin, hidden, everything.fetchImpl))
      .rejects.toThrow(/application shell where JSON was expected/);
    // The nginx fallback is a 200 — exactly the status get-session is meant to answer.
    const session = canonicalHost({ "/api/auth/get-session": spaShell });
    await expect(verifyCanonicalIngress(origin, hidden, session.fetchImpl))
      .rejects.toThrow(/application shell where JSON was expected/);
  });

  it.each([
    ["Better Auth not answering", () => Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } })],
    ["the fixture stub's shape", () => new Response("{\"session\":null}", { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } })],
    ["a cacheable anonymous session", () => new Response("null", { status: 200, headers: { "content-type": "application/json", "cache-control": "public, max-age=60" } })],
    ["no cache directive at all", () => new Response("null", { status: 200, headers: { "content-type": "application/json" } })],
  ])("rejects an anonymous get-session that is %s", async (_label, answer) => {
    const host = canonicalHost({ "/api/auth/get-session": answer });
    await expect(verifyCanonicalIngress(origin, hidden, host.fetchImpl)).rejects.toThrow(/\/api\/auth\/get-session/);
  });

  it("rejects /me answering 503, which means the database is not reachable", async () => {
    const host = canonicalHost({
      "/api/explorers/v1/me": () => Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 }),
    });
    await expect(verifyCanonicalIngress(origin, hidden, host.fetchImpl)).rejects.toThrow(/\/api\/explorers\/v1\/me/);
  });

  it("rejects a hidden category answering like an empty public one", async () => {
    // An empty *public* category correctly answers 200 {items:[]}; seeing it for a
    // category the owner hid means the privacy gate is not live.
    const host = canonicalHost({ [hiddenPath]: () => Response.json({ items: [] }) });
    await expect(verifyCanonicalIngress(origin, hidden, host.fetchImpl)).rejects.toThrow(/privacy gate/);
  });

  it("rejects a 404 that did not come from the public read model", async () => {
    const host = canonicalHost({
      [hiddenPath]: () => new Response("<html>Not Found</html>", { status: 404, headers: { "content-type": "text/html" } }),
    });
    await expect(verifyCanonicalIngress(origin, hidden, host.fetchImpl))
      .rejects.toThrow(/application shell where JSON was expected/);
  });

  it("encodes the handle and category rather than letting them reshape the path", async () => {
    const host = canonicalHost();
    await expect(verifyCanonicalIngress(origin, { handle: "../me", category: "games" }, host.fetchImpl))
      .rejects.toThrow(/unexpected probe \/api\/explorers\/v1\/profiles\/..%2Fme\/recommendations\/games/);
  });
});
