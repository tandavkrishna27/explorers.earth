import { describe, expect, it } from "vitest";
import { assertCanonicalPlatformRouteGraph } from "../../config/platform-route-graph";
import {
  EXPECTED_PLATFORM_PROBE_COUNT,
  PLATFORM_ROUTE_PROBES,
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

  it("rejects the restricted Music profile for fixture platform runtime", () => {
    expect(() => assertCanonicalPlatformRouteGraph("fixture", { kind: "local-music" } as never)).toThrow(/route graph/i);
  });
});
