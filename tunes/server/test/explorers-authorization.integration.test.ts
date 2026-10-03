import { createHmac, randomUUID } from "node:crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanonicalApp } from "../auth/canonicalApp";
import { resolveExplorersAuthConfig } from "../auth/betterAuth";
import { authorizeOperation } from "../application/authorization";

const config = resolveExplorersAuthConfig({
  EXPLORERS_PUBLIC_ORIGIN: "http://127.0.0.1:51474",
  EXPLORERS_AUTH_SECRET: "integration-secret-".repeat(4),
  GOOGLE_CLIENT_ID: "fixture-google-id", GOOGLE_CLIENT_SECRET: "fixture-google-secret",
});
let pool: pg.Pool;
let composed: ReturnType<typeof createCanonicalApp>;

async function persona() {
  const userId = `authz-${randomUUID()}`;
  await pool.query("INSERT INTO auth_user(id,name,email) VALUES ($1,'Owner',$2)", [userId, `${userId}@example.invalid`]);
  await pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES ($1,$2,'google',$3,now())",
    [randomUUID(), `google-${userId}`, userId]);
  const context = await composed.auth.$context;
  const session = await context.internalAdapter.createSession(userId, false);
  const signature = createHmac("sha256", config.secret).update(session.token).digest("base64");
  const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${signature}`;
  const initial = await request(composed.app).get("/api/explorers/v1/me").set("cookie", cookie);
  expect(initial.status).toBe(200);
  return { userId, accountId: initial.body.account.id as string, cookie, sessionId: session.id };
}

describe("canonical owner request boundary", () => {
  beforeAll(() => { pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 4 }); composed = createCanonicalApp(pool, config); });
  afterAll(async () => { await pool?.end(); });

  it("rejects anonymous and duplicate credentials and ignores forged account selection", async () => {
    expect((await request(composed.app).get("/api/explorers/v1/me")).status).toBe(401);
    const owner = await persona();
    const forged = await request(composed.app).get("/api/explorers/v1/me?accountId=22222222-2222-4222-8222-222222222222").set("cookie", owner.cookie);
    expect(forged.status).toBe(422);
    expect(forged.body.error).toMatchObject({ code: "INVALID_INPUT" });
    const duplicate = await request(composed.app).get("/api/explorers/v1/me").set("cookie", owner.cookie).set("authorization", "Bearer forged");
    expect(duplicate.status).toBe(401);
  });

  it("denies a foreign account through the application service", async () => {
    const owner = await persona();
    const other = await persona();
    await expect(authorizeOperation(pool, { userId: owner.userId, accountId: owner.accountId, role: "owner",
      credential: { kind: "web-session", sessionId: owner.sessionId, sessionVersion: 1 } }, "profile:read", other.accountId))
      .rejects.toMatchObject({ status: 404 });
  });

  it("rechecks a membership removed after the session was issued", async () => {
    const owner = await persona();
    const member = await persona();
    await pool.query("INSERT INTO account_memberships(account_id,user_id) VALUES ($1,$2)", [owner.accountId, member.userId]);
    const actor = { userId: member.userId, accountId: owner.accountId, role: "owner" as const,
      credential: { kind: "web-session" as const, sessionId: member.sessionId, sessionVersion: 1 } };
    await expect(authorizeOperation(pool, actor, "profile:read", owner.accountId)).resolves.toBeUndefined();
    await pool.query("DELETE FROM account_memberships WHERE account_id=$1 AND user_id=$2", [owner.accountId, member.userId]);
    await expect(authorizeOperation(pool, actor, "profile:read", owner.accountId)).rejects.toMatchObject({ status: 404 });
  });

  it("reads status and security generation on every subsequent request", async () => {
    const owner = await persona();
    await pool.query("UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1", [owner.accountId]);
    expect((await request(composed.app).get("/api/explorers/v1/me").set("cookie", owner.cookie)).status).toBe(403);
    await pool.query("UPDATE creator_accounts SET status='active',suspended_at=NULL WHERE id=$1", [owner.accountId]);
    await pool.query("UPDATE user_security_state SET session_version=session_version+1 WHERE user_id=$1", [owner.userId]);
    expect((await request(composed.app).get("/api/explorers/v1/me").set("cookie", owner.cookie)).status).toBe(401);
  });

  it("rejects pending deletion and removed membership", async () => {
    const owner = await persona();
    await pool.query("UPDATE creator_accounts SET status='pending_deletion',deletion_requested_at=now() WHERE id=$1", [owner.accountId]);
    expect((await request(composed.app).get("/api/explorers/v1/me").set("cookie", owner.cookie)).status).toBe(403);
  });
});
