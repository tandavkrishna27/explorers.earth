import { describe, expect, it } from "vitest";

import { PostgresPublicProfileGateway } from "../../publicProfile/postgresPublicProfileGateway";
import { PUBLIC_RECOMMENDATION_CATEGORIES } from "../../publicProfile/publicProfilePolicy";
import { parsePublicProfileRequest } from "../../publicProfile/publicProfileContract";

/**
 * Ticket 7.1's category-coverage obligation.
 *
 * The 2026-10-05 review found the public gateway dispatching only `games`,
 * `movies` and `books`, with every other category falling through to
 * `{ items: [], nextCursor: null }` — so an all-category pass would read
 * "category empty" rather than "unimplemented", masking the gate. It asked for
 * an explicit unsupported-category error, asserted by a test, so that removing
 * the error without landing the producer fails.
 *
 * Measured 2026-10-08, that finding has moved and the remedy has to move with it:
 *
 * - The gateway now dispatches **eight** categories to real projections —
 *   `games`, `movies`, `books`, `apps`, `products`, `people`, `places`, `guides`.
 *   The category migrations landed.
 * - There is no ninth public category to error on. `PUBLIC_RECOMMENDATION_CATEGORIES`
 *   holds exactly those eight, and the request contract validates with
 *   `z.enum(PUBLIC_RECOMMENDATION_CATEGORIES)`, so `music` — or anything else —
 *   is rejected by the parser and the route answers **400 BAD_REQUEST**, never an
 *   empty success. The gateway's empty fall-through is unreachable through the
 *   route.
 *
 * So the risk the review guarded against has inverted. It is no longer "a
 * category with no producer answers empty"; it is "a category is added to the
 * enum before its producer lands", which would route straight into that same
 * empty fall-through and reintroduce exactly the masking the review named. These
 * cases are written against that, which is why the first is driven by the enum
 * rather than by a hand-written list.
 */
/**
 * Records every statement, through either entry point. Some projections query the
 * pool directly and others check out a client for a REPEATABLE READ READ ONLY
 * transaction, so both have to be observable or a dispatched category would look
 * undispatched.
 */
function recordingDb() {
  const queries: string[] = [];
  const query = async (text: unknown) => {
    queries.push(String(text));
    return { rows: [], rowCount: 0 };
  };
  const db = {
    query,
    connect: async () => ({ query, release: () => undefined }),
  };
  return { db: db as never, queries };
}

describe("public category coverage", () => {
  it("dispatches every declared public category to a real projection", async () => {
    // Enum-driven on purpose: adding a category without a producer fails here
    // instead of silently answering an empty page.
    for (const category of PUBLIC_RECOMMENDATION_CATEGORIES) {
      const { db, queries } = recordingDb();
      const gateway = new PostgresPublicProfileGateway(db, "cursor-secret");

      const result = await gateway.resolveCategory("creator", category, 12);

      expect(queries.length, `${category} reached no projection`).toBeGreaterThan(0);
      expect(result, `${category} returned the empty fall-through`)
        .not.toStrictEqual({ items: [], nextCursor: null });
    }
  });

  it("dispatches every declared public category on the detail read too", async () => {
    for (const category of PUBLIC_RECOMMENDATION_CATEGORIES) {
      const { db, queries } = recordingDb();
      const gateway = new PostgresPublicProfileGateway(db, "cursor-secret");

      await gateway.resolveDetail("creator", category, "a-slug", 12);

      // Only dispatch is asserted here. `undefined` is the *correct* answer for a
      // detail read that finds nothing, and against an empty stub database every
      // category legitimately finds nothing — so the return value cannot tell a
      // dispatched projection from the fall-through. The statement record can.
      expect(queries.length, `${category} detail reached no projection`).toBeGreaterThan(0);
    }
  });

  it("rejects a category with no landed producer instead of serving an empty page", () => {
    // `music` is the concrete case: its producer is 6.3, which has not landed.
    // The contract must refuse it, because an empty success is indistinguishable
    // from a creator who has published nothing.
    for (const absent of ["music", "podcasts", "itineraries", "experiences"]) {
      expect(() => parsePublicProfileRequest({ username: "creator", category: absent, limit: 12 }))
        .toThrow();
    }
  });

  it("does not quietly admit a ninth category into the public enum", () => {
    // A guard on the list itself. Widening it is a deliberate act that lands with
    // a producer; this fails if the enum grows without this test being revisited.
    expect([...PUBLIC_RECOMMENDATION_CATEGORIES].sort()).toStrictEqual([
      "apps", "books", "games", "guides", "people", "places", "products", "movies",
    ].sort());
  });
});
