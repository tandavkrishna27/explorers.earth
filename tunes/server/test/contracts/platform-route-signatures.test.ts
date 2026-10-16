import { describe, expect, it } from "vitest";
import request from "supertest";

import { createCanonicalApp } from "../../auth/canonicalApp";
import type { ExplorersAuthConfig } from "../../auth/betterAuth";
import { CANONICAL_ROUTES } from "../../../../scripts/replatform-route-parity";

/**
 * Ticket 1.2's route-graph invariant, the half that stops it going stale.
 *
 * `platform-route-parity.test.ts` proves the *inventory* behaves correctly against
 * a synthetic ingress. It cannot prove the inventory's expectations are what the
 * application actually answers — and that was the real failure mode the 2026-10-05
 * review found: an inventory can be internally consistent and describe nothing.
 *
 * So this drives the canonical probe list against the real `createCanonicalApp`
 * and asserts each recorded status and body field is the one the app produces. A
 * probe whose expectation drifts from the application fails here, and a canonical
 * route that stops being mounted fails here too.
 *
 * No container, by measurement rather than by hope: none of the canonical probe
 * paths reaches the database. The stub pool below records every query it is asked
 * for, and the final case asserts that record is empty — so if a future route or
 * middleware starts touching the database on an unauthenticated request, this test
 * says so instead of hanging or passing against an accidental real connection.
 */
const FIXTURE_ORIGIN = "http://127.0.0.1:51474";

const config: ExplorersAuthConfig = {
  baseURL: FIXTURE_ORIGIN,
  googleCallbackURL: `${FIXTURE_ORIGIN}/api/auth/callback/google`,
  trustedOrigins: [FIXTURE_ORIGIN],
  // Not a credential: a syntactically valid, obviously inert fixture value. The
  // app is never asked to authenticate anybody here.
  secret: "contract-fixture-secret-contract-fixture-secret-0000000000000000",
  googleClientId: "contract-fixture-client-id",
  googleClientSecret: "contract-fixture-client-secret",
};

function stubPool() {
  const queries: string[] = [];
  const pool = {
    query: async (text: unknown) => {
      queries.push(String(text));
      return { rows: [], rowCount: 0 };
    },
    connect: async () => ({
      query: async (text: unknown) => {
        queries.push(String(text));
        return { rows: [], rowCount: 0 };
      },
      release: () => undefined,
    }),
  };
  return { pool: pool as never, queries };
}

function readField(body: unknown, field: string): unknown {
  return field.split(".").reduce<unknown>(
    (value, key) => (value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined),
    body,
  );
}

describe("canonical route signatures match the parity inventory", () => {
  it.each(CANONICAL_ROUTES.map((probe) => [probe.path, probe] as const))(
    "%s answers exactly what the inventory records",
    async (_path, probe) => {
      const { pool } = stubPool();
      const { app } = createCanonicalApp(pool, config);

      const response = probe.method === "POST"
        ? await request(app).post(probe.path)
        : await request(app).get(probe.path);

      expect(response.status).toBe(probe.status);
      const field = readField(response.body, probe.field);
      if (probe.value === "nonempty") {
        expect(typeof field).toBe("string");
        expect((field as string).length).toBeGreaterThan(0);
      } else {
        expect(field).toBe(probe.value);
      }
    },
  );

  it("reaches no database on any canonical probe, which is why this needs no container", async () => {
    const { pool, queries } = stubPool();
    const { app } = createCanonicalApp(pool, config);

    for (const probe of CANONICAL_ROUTES) {
      if (probe.method === "POST") await request(app).post(probe.path);
      else await request(app).get(probe.path);
    }

    expect(queries).toEqual([]);
  });

  it("covers every canonical route the inventory claims, so the list cannot be quietly emptied", () => {
    expect(CANONICAL_ROUTES.length).toBeGreaterThanOrEqual(5);
    expect(CANONICAL_ROUTES.map((probe) => probe.path)).toEqual([
      "/health/live",
      "/api/auth/sign-in/social",
      "/api/explorers/v1/me",
      "/api/explorers/v1/account/lifecycle",
      "/api/explorers/v1/collections",
    ]);
    // Every probe has to say what it proves; an unexplained probe is one nobody
    // can judge when it fails.
    for (const probe of CANONICAL_ROUTES) {
      expect(probe.proves.length).toBeGreaterThan(20);
    }
  });
});
