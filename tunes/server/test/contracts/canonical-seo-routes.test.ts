import { describe, expect, it } from "vitest";
import request from "supertest";
import { createCanonicalApp } from "../../auth/canonicalApp";
import { PUBLIC_PROFILE_SITEMAP_SQL } from "../../routes/explorersSeoRoutes";
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

function sitemapPool(rows: unknown[], fail = false) {
  const queries: string[] = [];
  const answer = async (text: unknown) => {
    queries.push(String(text));
    if (fail) throw new Error("database unavailable");
    return { rows, rowCount: rows.length };
  };
  const pool = { query: answer, connect: async () => ({ query: answer, release: () => undefined }) };
  return { pool: pool as never, queries };
}

describe("canonical SEO routes", () => {
  it("registers without querying at construction time", () => {
    // Break caught: a warm-on-mount cache fires a query during composition and
    // platform-route-signatures.test.ts, which asserts zero queries across its
    // probes, fails for a reason that looks unrelated.
    const { pool, queries } = sitemapPool([]);
    createCanonicalApp(pool, config);
    expect(queries).toEqual([]);
  });

  it("serves robots.txt with no database read", async () => {
    const { pool, queries } = sitemapPool([]);
    const { app } = createCanonicalApp(pool, config);
    const response = await request(app).get("/robots.txt");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/plain/);
    expect(response.text).toContain("Sitemap: https://explorers.earth/sitemap.xml");
    expect(queries).toEqual([]);
  });

  it("builds the sitemap from creator_accounts, never from Strapi", async () => {
    const { pool, queries } = sitemapPool([
      { handle: "ada", updated_at: new Date("2026-08-14T00:00:00Z"), public_categories: ["places", "books"] },
    ]);
    const { app } = createCanonicalApp(pool, config);
    const response = await request(app).get("/api/explorers-sitemap.xml");
    expect(response.status).toBe(200);
    expect(response.text).toContain("<loc>https://explorers.earth/ada</loc>");
    expect(response.text).toContain("<loc>https://explorers.earth/ada/places</loc>");
    expect(response.text).toContain("<lastmod>2026-08-14</lastmod>");
    expect(response.text).not.toContain("localqr.earth");
    expect(response.text).not.toContain("/playlist/");
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("FROM creator_accounts");
  });

  it("applies every predicate the public profile reader applies", () => {
    // Break caught: the sitemap advertises profiles the reader 404s for.
    // Derived from PostgresPublicProfileGateway.resolveAccount
    // (publicProfile/postgresPublicProfileGateway.ts:26-32) — if that query
    // changes, this test is the thing that notices.
    for (const predicate of [
      "a.status = 'active'", "a.onboarding_status = 'complete'",
      "a.public_profile = true", "JOIN account_presentation",
    ]) expect(PUBLIC_PROFILE_SITEMAP_SQL).toContain(predicate);
  });

  it("never reads a column account_category_settings does not have", () => {
    // Break caught: `s.updated_at` is written from habit. That table has only
    // account_id, category, is_public, display_order, pinned_order
    // (migrations/0022_explorers_identity.sql:121-130) and the query errors at
    // runtime — invisibly, because the fallback below answers 200.
    expect(PUBLIC_PROFILE_SITEMAP_SQL).not.toContain("s.updated_at");
  });

  it("answers 200 with static pages when the database is unavailable, and says so", async () => {
    // Break caught: a transient fault turns the sitemap into a 5xx and teaches
    // crawlers the document is broken. The header is what distinguishes a
    // degraded answer from a healthy one — without it a permanently broken
    // query looks exactly like an empty site.
    const { pool } = sitemapPool([], true);
    const { app } = createCanonicalApp(pool, config);
    const response = await request(app).get("/api/explorers-sitemap.xml");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-sitemap-degraded"]).toBe("true");
    expect(response.text).toContain("<loc>https://explorers.earth/</loc>");
  });
});
