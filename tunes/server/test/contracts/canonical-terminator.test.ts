import { describe, expect, it } from "vitest";
import request from "supertest";
import { canonicalErrorHandler, resolveTrustedProxy } from "../../middleware/canonicalTerminator";
import { createCanonicalApp } from "../../auth/canonicalApp";
import { apiErrorSchema } from "../../../shared/explorersContract";
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

describe("canonical trust proxy", () => {
  it("trusts exactly one configured address, never every upstream", () => {
    // Break caught: `trust proxy: true` ships and X-Forwarded-For becomes
    // attacker-controlled for anything keyed on request.ip.
    const trusted = resolveTrustedProxy({ EXPLORERS_TRUSTED_PROXY_IP: "172.31.250.2" });
    expect(typeof trusted).toBe("function");
    expect((trusted as (peer: string) => boolean)("172.31.250.2")).toBe(true);
    expect((trusted as (peer: string) => boolean)("::ffff:172.31.250.2")).toBe(true);
    expect((trusted as (peer: string) => boolean)("[172.31.250.2]")).toBe(true);
    expect((trusted as (peer: string) => boolean)("172.31.250.3")).toBe(false);
  });

  it("still reads the variable the running compose file sets today", () => {
    // Break caught: the rename lands before docker-compose.yml is updated and
    // the deployed app silently stops trusting its only reverse proxy.
    const trusted = resolveTrustedProxy({ MUSIC_TRUSTED_PROXY_IP: "172.31.250.2" });
    expect((trusted as (peer: string) => boolean)("172.31.250.2")).toBe(true);
  });

  it("refuses a non-IP value and trusts nothing when unset", () => {
    expect(() => resolveTrustedProxy({ EXPLORERS_TRUSTED_PROXY_IP: "traefik" })).toThrow();
    expect(resolveTrustedProxy({})).toBe(false);
  });

  it("answers an unmatched path with JSON, never Express HTML", async () => {
    const { pool } = stubPool();
    const { app } = createCanonicalApp(pool, config);
    const response = await request(app).get("/api/explorers/v1/no-such-route");
    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(response.text).not.toContain("<html");
  });

  it("emits an envelope apiErrorSchema accepts, with no extra fields", async () => {
    // Break caught: `retryable` is copied over from the containment envelope.
    // apiErrorSchema is .strict(), so the extra key is a contract violation that
    // a loose toMatchObject assertion would never notice.
    const { pool } = stubPool();
    const { app } = createCanonicalApp(pool, config);
    const response = await request(app).get("/api/explorers/v1/no-such-route");
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(Object.keys(response.body.error).sort()).toEqual(["code", "message", "requestId"]);
  });

  it("turns a body-parser failure into a canonical 400, not an HTML 500", async () => {
    // Break caught: contentBodyParser calls next(error) and nothing handles it,
    // so Express renders HTML and, outside production, a stack trace.
    const { pool } = stubPool();
    const { app } = createCanonicalApp(pool, config);
    const response = await request(app).post("/api/explorers/v1/recovery/start")
      .set("origin", FIXTURE_ORIGIN).set("content-type", "application/json").send("{ not json");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_INPUT");
    expect(response.text).not.toContain("SyntaxError");
  });

  it("is registered as a real error handler, not demoted middleware", () => {
    // Break caught: a rest parameter or a default value makes fn.length !== 4.
    // Express and canonicalHandlerCustody.ts:61 both identify error handlers by
    // arity, so the handler silently never runs and only the 404 path still works.
    expect(canonicalErrorHandler).toHaveLength(4);
  });

  it("does not shadow any mounted route", async () => {
    const { pool } = stubPool();
    const { app } = createCanonicalApp(pool, config);
    expect((await request(app).get("/health/live")).status).toBe(200);
    expect((await request(app).get("/robots.txt")).status).toBe(200);
    expect((await request(app).get("/api/explorers/v1/me")).status).toBe(401);
  });
});
