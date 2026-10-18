import { describe, expect, it } from "vitest";
import request from "supertest";
import { createCanonicalApp } from "../../auth/canonicalApp";
import type { ExplorersAuthConfig } from "../../auth/betterAuth";

const FIXTURE_ORIGIN = "http://127.0.0.1:51474";

const config: ExplorersAuthConfig = {
  baseURL: FIXTURE_ORIGIN,
  googleCallbackURL: `${FIXTURE_ORIGIN}/api/auth/callback/google`,
  trustedOrigins: [FIXTURE_ORIGIN],
  secret: "contract-fixture-secret-contract-fixture-secret-0000000000000000",
  googleClientId: "contract-fixture-client-id",
  googleClientSecret: "contract-fixture-client-secret",
};

function stubPool() {
  const queries: string[] = [];
  const answer = async (text: unknown) => { queries.push(String(text)); return { rows: [], rowCount: 0 }; };
  const pool = { query: answer, connect: async () => ({ query: answer, release: () => undefined }) };
  return { pool: pool as never, queries };
}

describe("canonical retired-surface boundary", () => {
  it("leaves the Better Auth route group entirely alone", async () => {
    // Break caught: musicRetirementPolicy's `/api/auth` PREFIX rule is ported
    // verbatim and every Better Auth route answers 410. This is the single most
    // destructive way this ticket can fail and nothing else would catch it.
    // 403 (not 410) is the correct answer here: the origin guard at
    // canonicalApp.ts:70 rejects a POST with no matching Origin header.
    // The code is FORBIDDEN, an apiErrorCodes member: that guard answers through
    // errorResponse(), which emits the apiErrorSchema envelope. ORIGIN_FORBIDDEN
    // is a ContainmentCode and cannot be produced on this path.
    const { pool } = stubPool();
    const { app } = createCanonicalApp(pool, config);
    const social = await request(app).post("/api/auth/sign-in/social");
    expect(social.status).toBe(403);
    expect(social.body.error.code).toBe("FORBIDDEN");
  });

  it.each([
    ["post", "/api/auth/sync", "LEGACY_IDENTITY_ROUTE_REMOVED"],
    ["post", "/graphql", "GRAPHQL_PROXY_REMOVED"],
    ["get", "/api/strapi/config", "GRAPHQL_PROXY_REMOVED"],
    ["get", "/api/playlists", "LEGACY_OWNER_ROUTE_REMOVED"],
  ] as const)("tombstones %s %s", async (method, path, code) => {
    // Break caught: a retired path falls through to the JSON 404 and old clients
    // get no signal that the surface was deliberately removed.
    const { pool, queries } = stubPool();
    const { app } = createCanonicalApp(pool, config);
    const response = await request(app)[method](path);
    expect(response.status).toBe(410);
    expect(response.body.error.code).toBe(code);
    expect(response.body.error.retryable).toBe(false);
    expect(queries).toEqual([]);
  });

  it("normalizes traversal and case before matching", async () => {
    const { pool } = stubPool();
    const { app } = createCanonicalApp(pool, config);
    for (const path of ["/GraphQL", "/api/x/../subscriptions/user-plans/hostile"]) {
      expect((await request(app).get(path)).status).toBe(410);
    }
  });

  it("refuses a retired POST without parsing its body", async () => {
    // Break caught: mounted after contentBodyParser(), so a hostile oversized
    // body on a dead path is still read into memory.
    const { pool } = stubPool();
    const { app } = createCanonicalApp(pool, config);
    const response = await request(app).post("/graphql")
      .set("content-type", "application/json").send("{".repeat(40_000));
    expect(response.status).toBe(410);
  });

  it("does not tombstone any surface this plan adds or the app already serves", async () => {
    // Break caught: a rule such as `/api` or `/api/seo` is read as a prefix and
    // silently kills /health/live, the sitemap, or the canonical v1 routes.
    const { pool } = stubPool();
    const { app } = createCanonicalApp(pool, config);
    for (const path of ["/health/live", "/health/ready", "/robots.txt",
                        "/sitemap.xml", "/api/explorers-sitemap.xml",
                        "/api/explorers/v1/me", "/api/auth/callback/google"]) {
      expect((await request(app).get(path)).status).not.toBe(410);
    }
  });
});
