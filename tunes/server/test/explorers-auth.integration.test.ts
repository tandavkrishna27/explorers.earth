import { createHmac, randomUUID } from "node:crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanonicalApp } from "../auth/canonicalApp";
import { startCanonicalServer } from "../auth/canonicalStartup";
import { resolveExplorersAuthConfig } from "../auth/betterAuth";

const config = resolveExplorersAuthConfig({
  EXPLORERS_PUBLIC_ORIGIN: "http://127.0.0.1:51474",
  EXPLORERS_AUTH_SECRET: "integration-secret-".repeat(4),
  GOOGLE_CLIENT_ID: "fixture-google-id",
  GOOGLE_CLIENT_SECRET: "fixture-google-secret",
});
let pool: pg.Pool;
let composed: ReturnType<typeof createCanonicalApp>;

async function signedSession(userId: string): Promise<string> {
  const authContext = await composed.auth.$context;
  const session = await authContext.internalAdapter.createSession(userId, false);
  const signature = createHmac("sha256", config.secret).update(session.token).digest("base64");
  return `${authContext.authCookies.sessionToken.name}=${session.token}.${signature}`;
}

describe("canonical Google session application", () => {
  beforeAll(() => {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 4 });
    composed = createCanonicalApp(pool, config);
  });
  afterAll(async () => { await pool?.end(); });

  it("boots and serves auth/me without contacting Strapi", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("Strapi network forbidden"); });
    try {
      expect((await request(composed.app).get("/api/auth/ok")).status).toBe(200);
      expect((await request(composed.app).get("/api/explorers/v1/me")).status).toBe(401);
      expect(network).not.toHaveBeenCalled();
    } finally { network.mockRestore(); }
  });

  it("starts the API with no legacy Music or Strapi configuration", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("Strapi network forbidden"); });
    const server = await startCanonicalServer({
      EXPLORERS_PUBLIC_ORIGIN: config.baseURL,
      EXPLORERS_AUTH_SECRET: config.secret,
      GOOGLE_CLIENT_ID: config.googleClientId,
      GOOGLE_CLIENT_SECRET: config.googleClientSecret,
    }, { pool, host: "127.0.0.1", port: 0 });
    try {
      const response = await request(server.httpServer).get("/api/explorers/v1/me");
      expect(response.status).toBe(401);
      expect(network).not.toHaveBeenCalled();
    } finally {
      await server.shutdown();
      network.mockRestore();
    }
  });

  it("rejects a cross-origin social sign-in before a callback can establish a session", async () => {
    const before = (await pool.query("SELECT count(*)::int AS count FROM auth_session")).rows[0].count;
    const response = await request(composed.app).post("/api/auth/sign-in/social")
      .set("origin", "https://attacker.example")
      .send({ provider: "google", callbackURL: "https://attacker.example/return" });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await pool.query("SELECT count(*)::int AS count FROM auth_session")).rows[0].count).toBe(before);
  });

  it("rejects a cross-site callback URL even with a trusted request origin", async () => {
    const response = await request(composed.app).post("/api/auth/sign-in/social")
      .set("origin", config.baseURL)
      .send({ provider: "google", callbackURL: "https://attacker.example/return" });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("provisions only an active verified session and retains incomplete onboarding", async () => {
    const userId = `web-${randomUUID()}`;
    await pool.query("INSERT INTO auth_user(id,name,email) VALUES ($1,'Person',$2)", [userId, `${userId}@example.invalid`]);
    await pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES ($1,$2,'google',$3,now())",
      [randomUUID(), `google-${userId}`, userId]);
    const cookie = await signedSession(userId);
    const response = await request(composed.app).get("/api/explorers/v1/me").set("cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body.account).toMatchObject({ onboardingStatus: "incomplete", handle: null, displayName: null, status: "active" });
    expect(response.body.account).not.toHaveProperty("accessToken");
    const second = await request(composed.app).get("/api/explorers/v1/me").set("cookie", cookie);
    expect(second.body.account.id).toBe(response.body.account.id);
    await pool.query("DELETE FROM auth_session WHERE user_id=$1", [userId]);
    expect((await request(composed.app).get("/api/explorers/v1/me").set("cookie", cookie)).status).toBe(401);
  });

  it("denies an inactive identity without provisioning or ordinary access", async () => {
    const userId = `inactive-${randomUUID()}`;
    await pool.query("INSERT INTO auth_user(id,name,email) VALUES ($1,'Inactive',$2)", [userId, `${userId}@example.invalid`]);
    await pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES ($1,$2,'google',$3,now())",
      [randomUUID(), `google-${userId}`, userId]);
    await pool.query("INSERT INTO user_security_state(user_id,blocked_at) VALUES ($1,now())", [userId]);
    const cookie = await signedSession(userId);
    const response = await request(composed.app).get("/api/explorers/v1/me").set("cookie", cookie);
    expect(response.status).toBe(403);
    expect((await pool.query("SELECT count(*)::int AS count FROM initial_account_bindings WHERE user_id=$1", [userId])).rows[0].count).toBe(0);
  });
});
