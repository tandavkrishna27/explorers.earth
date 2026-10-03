import { describe, expect, it } from "vitest";
import { assertCanonicalPlatformRouteGraph } from "../../config/platform-route-graph";
import { verifyPlatformIngress } from "../../../../scripts/replatform-route-parity";

describe("platform fixture route parity", () => {
  it("requires actual auth, lifecycle, analytics, Music, and Strapi handler signatures at fixture ingress", async () => {
    const responses: Record<string, [number, Record<string, unknown>]> = {
      "/api/check": [401, { authenticated: false }],
      "/api/csrf-token": [200, { token: "fixture-csrf" }],
      "/api/user/reactivate": [400, { error: "Token is required" }],
      "/api/explorers/analytics/events": [400, { message: "Invalid analytics scope" }],
      "/api/music-fixture/readiness": [200, { status: "ready" }],
      "/api/users/me": [403, { error: "fixture identity authority denied" }],
    };
    const seen: string[] = [];
    const fixtureFetch = (async (input: string) => {
      const path = new URL(input).pathname;
      seen.push(path);
      const [status, body] = responses[path];
      return Response.json(body, { status });
    }) as typeof fetch;
    expect(await verifyPlatformIngress("http://127.0.0.1:51474", fixtureFetch)).toBe(6);
    expect(seen).toEqual(Object.keys(responses));
    responses["/api/user/reactivate"] = [403, { error: "fixture identity authority denied" }];
    await expect(verifyPlatformIngress("http://127.0.0.1:51474", fixtureFetch)).rejects.toThrow(/ingress mismatch/);
  });

  it("rejects the restricted Music profile for fixture platform runtime", () => {
    expect(() => assertCanonicalPlatformRouteGraph("fixture", { kind: "local-music" } as never)).toThrow(/route graph/i);
  });
});
