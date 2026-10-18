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

function pool(fail = false) {
  const answer = async () => { if (fail) throw new Error("db down"); return { rows: [], rowCount: 0 }; };
  return { query: answer, connect: async () => ({ query: answer, release: () => undefined }) } as never;
}

describe("canonical readiness", () => {
  it("refuses when the database is unreachable", async () => {
    // Break caught: the pipeline declares a deploy successful against a container
    // that cannot reach PostgreSQL.
    const { app } = createCanonicalApp(pool(true), config);
    const response = await request(app).get("/health/ready");
    expect(response.status).toBe(503);
    expect(response.body.ready).toBe(false);
    expect(response.body.reason).toBe("database-unreachable");
  });

  it("refuses when migrations have not reached the expected marker", async () => {
    // checkMusicDatabaseReadiness returns {ready:false,reason:"migration-state-invalid"}
    // against the stub pool, which has no schema_migrations rows.
    const { app } = createCanonicalApp(pool(), config);
    const response = await request(app).get("/health/ready");
    expect(response.status).toBe(503);
    expect(response.body.reason).toBe("migration-state-invalid");
  });

  it("keeps liveness on its canonical shape", async () => {
    const { app } = createCanonicalApp(pool(), config);
    const liveness = await request(app).get("/health/live");
    expect(liveness.body).toEqual({ status: "live" });
  });
});
