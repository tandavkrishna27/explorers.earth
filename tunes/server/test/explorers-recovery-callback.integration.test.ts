import { randomUUID } from "node:crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanonicalApp } from "../auth/canonicalApp";
import { resolveExplorersAuthConfig } from "../auth/betterAuth";
import { ensureInitialAccount } from "../auth/initialAccount";
import { recoveryIntentCookie, recoveryProofCookie } from "../auth/recoveryCallback";
import { consumeRecoveryProof } from "../auth/recoveryProof";

const config = resolveExplorersAuthConfig({
  EXPLORERS_PUBLIC_ORIGIN: "http://127.0.0.1:51474",
  EXPLORERS_AUTH_SECRET: "fixture-recovery-secret-".repeat(3),
  GOOGLE_CLIENT_ID: "fixture-google-id",
  GOOGLE_CLIENT_SECRET: "fixture-google-secret",
});
let pool: pg.Pool;
let composed: ReturnType<typeof createCanonicalApp>;

function cookie(response: { headers: Record<string, unknown> }, name: string): string {
  const headers = response.headers["set-cookie"] as string[] | undefined;
  const found = headers?.filter((entry) => entry.startsWith(`${name}=`) && entry.split(";")[0].split("=")[1] !== "").at(-1);
  if (!found) throw new Error(`Missing ${name} cookie`);
  return found.split(";")[0];
}

async function seedIdentity(status: "suspended" | "active" = "suspended") {
  const userId = `callback-${randomUUID()}`;
  const subject = `google-${randomUUID()}`;
  const email = `${userId}@example.invalid`;
  await pool.query("INSERT INTO auth_user(id,name,email) VALUES ($1,'Recovery',$2)", [userId, email]);
  await pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES ($1,$2,'google',$3,now())",
    [randomUUID(), subject, userId]);
  const { accountId } = await ensureInitialAccount(pool, userId);
  if (status === "suspended") {
    await pool.query("UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1", [accountId]);
    await pool.query("UPDATE user_security_state SET blocked_at=now() WHERE user_id=$1", [userId]);
  }
  return { userId, subject, email, accountId };
}

async function simulateGoogleIdentity(identity: { subject: string; email: string }) {
  const context = await composed.auth.$context;
  const google = context.socialProviders.find((provider) => provider.id === "google");
  if (!google) throw new Error("Google provider unavailable");
  google.validateAuthorizationCode = async () => ({ accessToken: "fixture-access-token", tokenType: "Bearer" });
  google.getUserInfo = async () => ({
    user: { id: identity.subject, name: "Recovery", email: identity.email, emailVerified: true, image: null },
    data: { sub: identity.subject, email: identity.email, email_verified: true, name: "Recovery" },
  });
}

async function beginRecovery() {
  const started = await request(composed.app).post("/api/explorers/v1/recovery/start")
    .set("origin", config.baseURL);
  expect(started.status).toBe(204);
  const intent = cookie(started, recoveryIntentCookie);
  const signIn = await request(composed.app).post("/api/auth/sign-in/social")
    .set("origin", config.baseURL).set("cookie", intent)
    .send({ provider: "google", callbackURL: "/reactivate-confirm" });
  expect(signIn.status).toBe(200);
  const state = new URL(signIn.body.url).searchParams.get("state");
  if (!state) throw new Error("Google state missing");
  const stateCookies = ((signIn.headers["set-cookie"] as string[] | undefined) ?? []).map((entry) => entry.split(";")[0]);
  return { intent, state, callbackCookies: [intent, ...stateCookies].join("; ") };
}

function hasPositiveNormalAuthCookie(response: { headers: Record<string, unknown> }): boolean {
  const values = response.headers["set-cookie"] as string[] | undefined;
  return Boolean(values?.some((entry) => {
    const pair = entry.split(";")[0];
    return /^(?:__Secure-|__Host-)?better-auth\./i.test(pair) && pair.split("=")[1] !== "";
  }));
}

function hasPositiveRecoveryProofCookie(response: { headers: Record<string, unknown> }): boolean {
  const values = response.headers["set-cookie"] as string[] | undefined;
  return Boolean(values?.some((entry) => entry.startsWith(`${recoveryProofCookie}=`)
    && entry.split(";")[0].split("=")[1] !== ""));
}

describe("pinned Google callback recovery adapter", () => {
  beforeAll(() => {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 5 });
    composed = createCanonicalApp(pool, config);
    // This test-only endpoint has the same cookie path as the later lifecycle consumer.
    composed.app.get("/api/explorers/v1/recovery/probe", (req, res) => {
      const raw = req.get("cookie") ?? "";
      res.json({ hasProof: /(?:^|;\s*)explorers_recovery_proof=[A-Za-z0-9_-]{43}(?:;|$)/.test(raw) });
    });
  });
  afterAll(async () => { await pool?.end(); });

  it("requires an exact origin to issue a trusted recovery intent", async () => {
    const denied = await request(composed.app).post("/api/explorers/v1/recovery/start")
      .set("origin", "https://attacker.example");
    expect(denied.status).toBe(403);
    expect(denied.headers["set-cookie"]).toBeUndefined();
  });

  it("lets an inactive identity finish provider authentication without ordinary access or client-spoofed recovery", async () => {
    const identity = await seedIdentity();
    await simulateGoogleIdentity(identity);
    const signIn = await request(composed.app).post("/api/auth/sign-in/social")
      .set("origin", config.baseURL)
      .send({ provider: "google", callbackURL: "/reactivate-confirm", additionalData: { explorersRecoveryIntent: "spoofed" } });
    expect(signIn.status).toBe(200);
    const state = new URL(signIn.body.url).searchParams.get("state");
    if (!state) throw new Error("Google state missing");
    const stateCookies = ((signIn.headers["set-cookie"] as string[] | undefined) ?? []).map((entry) => entry.split(";")[0]);
    const response = await request(composed.app).get("/api/auth/callback/google")
      .query({ code: "fixture-code", state }).set("cookie", stateCookies.join("; "));
    expect(response.status).toBe(302);
    const authContext = await composed.auth.$context;
    const sessionCookie = cookie(response, authContext.authCookies.sessionToken.name);
    expect(sessionCookie.split("=")[1]).not.toBe("");
    expect((await request(composed.app).get("/api/explorers/v1/me").set("cookie", sessionCookie)).status).toBe(403);
    expect((await pool.query("SELECT count(*)::int AS count FROM account_recovery_proofs WHERE user_id=$1", [identity.userId])).rows[0].count).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS count FROM initial_account_bindings WHERE user_id=$1", [identity.userId])).rows[0].count).toBe(1);
  });

  it("exchanges an inactive Google callback session for only a HttpOnly recovery proof", async () => {
    const identity = await seedIdentity();
    await simulateGoogleIdentity(identity);
    const { state, callbackCookies } = await beginRecovery();
    const response = await request(composed.app).get("/api/auth/callback/google")
      .query({ code: "fixture-code", state }).set("cookie", callbackCookies);
    expect(response.status).toBe(302);
    expect(hasPositiveNormalAuthCookie(response)).toBe(false);
    const proof = (response.headers["set-cookie"] as string[]).find((entry) => entry.startsWith(`${recoveryProofCookie}=`));
    expect(proof).toMatch(/HttpOnly/i);
    expect(proof).toMatch(/SameSite=Lax/i);
    expect(proof).toMatch(/Path=\/api\/explorers\/v1\/recovery/i);
    expect((await pool.query("SELECT count(*)::int AS count FROM auth_session WHERE user_id=$1", [identity.userId])).rows[0].count).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS count FROM account_recovery_proofs WHERE user_id=$1", [identity.userId])).rows[0].count).toBe(1);
    expect((await request(composed.app).get("/api/explorers/v1/me").set("cookie", cookie(response, recoveryProofCookie))).status).toBe(401);
    expect((await pool.query("SELECT count(*)::int AS count FROM initial_account_bindings WHERE user_id=$1", [identity.userId])).rows[0].count).toBe(1);
  });

  it("cancellation leaves no normal or recovery credential", async () => {
    const identity = await seedIdentity();
    await simulateGoogleIdentity(identity);
    const { state, callbackCookies } = await beginRecovery();
    const response = await request(composed.app).get("/api/auth/callback/google")
      .query({ error: "access_denied", state }).set("cookie", callbackCookies);
    expect(hasPositiveNormalAuthCookie(response)).toBe(false);
    expect(hasPositiveRecoveryProofCookie(response)).toBe(false);
    expect((await pool.query("SELECT count(*)::int AS count FROM auth_session WHERE user_id=$1", [identity.userId])).rows[0].count).toBe(0);
  });

  it("mismatched round-trip intent discards the temporary normal session", async () => {
    const identity = await seedIdentity();
    await simulateGoogleIdentity(identity);
    const first = await beginRecovery();
    const second = await beginRecovery();
    const response = await request(composed.app).get("/api/auth/callback/google")
      .query({ code: "fixture-code", state: first.state })
      .set("cookie", [second.intent, ...first.callbackCookies.split("; ").slice(1)].join("; "));
    expect(response.headers.location).toBe(`${config.baseURL}/reactivate-confirm?error=recovery_unavailable`);
    expect(hasPositiveNormalAuthCookie(response)).toBe(false);
    expect(hasPositiveRecoveryProofCookie(response)).toBe(false);
    expect((await pool.query("SELECT count(*)::int AS count FROM auth_session WHERE user_id=$1", [identity.userId])).rows[0].count).toBe(0);
  });

  it("a different Google subject with the same email cannot recover the retained account", async () => {
    const identity = await seedIdentity();
    await simulateGoogleIdentity({ ...identity, subject: `other-${randomUUID()}` });
    const { state, callbackCookies } = await beginRecovery();
    const response = await request(composed.app).get("/api/auth/callback/google")
      .query({ code: "fixture-code", state }).set("cookie", callbackCookies);
    expect(hasPositiveNormalAuthCookie(response)).toBe(false);
    expect(hasPositiveRecoveryProofCookie(response)).toBe(false);
    expect((await pool.query("SELECT status FROM creator_accounts WHERE id=$1", [identity.accountId])).rows[0].status).toBe("suspended");
    expect((await pool.query("SELECT count(*)::int AS count FROM account_recovery_proofs WHERE user_id=$1", [identity.userId])).rows[0].count).toBe(0);
  });

  it("an ambiguous Google binding returns retryable recovery without any credential", async () => {
    const identity = await seedIdentity();
    await pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES ($1,$2,'google',$3,now())",
      [randomUUID(), `second-${randomUUID()}`, identity.userId]);
    await simulateGoogleIdentity(identity);
    const { state, callbackCookies } = await beginRecovery();
    const response = await request(composed.app).get("/api/auth/callback/google")
      .query({ code: "fixture-code", state }).set("cookie", callbackCookies);
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(`${config.baseURL}/reactivate-confirm?error=recovery_unavailable`);
    expect(hasPositiveNormalAuthCookie(response)).toBe(false);
    expect(hasPositiveRecoveryProofCookie(response)).toBe(false);
    expect((await pool.query("SELECT count(*)::int AS count FROM auth_session WHERE user_id=$1", [identity.userId])).rows[0].count).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS count FROM account_recovery_proofs WHERE user_id=$1", [identity.userId])).rows[0].count).toBe(0);
    expect((await pool.query("SELECT status FROM creator_accounts WHERE id=$1", [identity.accountId])).rows[0].status).toBe("suspended");
  });

  it("issuance failure for an active account discards the normal session and proof", async () => {
    const identity = await seedIdentity("active");
    await simulateGoogleIdentity(identity);
    const { state, callbackCookies } = await beginRecovery();
    const response = await request(composed.app).get("/api/auth/callback/google")
      .query({ code: "fixture-code", state }).set("cookie", callbackCookies);
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(`${config.baseURL}/reactivate-confirm?error=recovery_unavailable`);
    expect(hasPositiveNormalAuthCookie(response)).toBe(false);
    expect(hasPositiveRecoveryProofCookie(response)).toBe(false);
    expect((await pool.query("SELECT count(*)::int AS count FROM auth_session WHERE user_id=$1", [identity.userId])).rows[0].count).toBe(0);
  });

  it.each(["cancelled", "mismatched", "issuance-failed"] as const)(
    "expires and revokes a prior browser proof across a %s replacement flow",
    async (outcome) => {
      const identity = await seedIdentity();
      await simulateGoogleIdentity(identity);
      const agent = request.agent(composed.app);
      const begin = async () => {
        const started = await agent.post("/api/explorers/v1/recovery/start").set("origin", config.baseURL);
        expect(started.status).toBe(204);
        const signIn = await agent.post("/api/auth/sign-in/social").set("origin", config.baseURL)
          .send({ provider: "google", callbackURL: "/reactivate-confirm" });
        expect(signIn.status).toBe(200);
        const state = new URL(signIn.body.url).searchParams.get("state");
        if (!state) throw new Error("Google state missing");
        return state;
      };

      const firstState = await begin();
      const firstCallback = await agent.get("/api/auth/callback/google").query({ code: "fixture-code", state: firstState });
      const previousToken = cookie(firstCallback, recoveryProofCookie).split("=")[1];
      expect((await agent.get("/api/explorers/v1/recovery/probe")).body.hasProof).toBe(true);

      const restarted = await agent.post("/api/explorers/v1/recovery/start").set("origin", config.baseURL);
      expect(restarted.status).toBe(204);
      const clear = (restarted.headers["set-cookie"] as string[]).find((entry) => entry.startsWith(`${recoveryProofCookie}=`));
      expect(clear).toMatch(/Path=\/api\/explorers\/v1\/recovery/i);
      expect(clear).toMatch(/Expires=|Max-Age=0/i);
      expect((await agent.get("/api/explorers/v1/recovery/probe")).body.hasProof).toBe(false);
      const stored = await pool.query<{ revoked_at: Date | null }>(
        "SELECT revoked_at FROM account_recovery_proofs WHERE user_id=$1 ORDER BY issued_at DESC LIMIT 1", [identity.userId],
      );
      expect(stored.rows[0].revoked_at).not.toBeNull();
      await expect(consumeRecoveryProof(pool, previousToken)).rejects.toThrow();

      const signIn = await agent.post("/api/auth/sign-in/social").set("origin", config.baseURL)
        .send({ provider: "google", callbackURL: "/reactivate-confirm" });
      const state = new URL(signIn.body.url).searchParams.get("state");
      if (!state) throw new Error("Google state missing");
      if (outcome === "mismatched") {
        await agent.post("/api/explorers/v1/recovery/start").set("origin", config.baseURL);
      } else if (outcome === "issuance-failed") {
        await pool.query("UPDATE creator_accounts SET status='active',suspended_at=NULL WHERE id=$1", [identity.accountId]);
      }
      const failed = await agent.get("/api/auth/callback/google").query(
        outcome === "cancelled" ? { error: "access_denied", state } : { code: "fixture-code", state },
      );
      expect(hasPositiveNormalAuthCookie(failed)).toBe(false);
      expect((await agent.get("/api/explorers/v1/recovery/probe")).body.hasProof).toBe(false);
    },
  );
});
