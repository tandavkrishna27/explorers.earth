import { createHmac, randomUUID } from "node:crypto";
import pg from "pg";
import request from "supertest";
import { expect } from "vitest";
import { createCanonicalApp } from "../../auth/canonicalApp";
import { resolveExplorersAuthConfig } from "../../auth/betterAuth";

/**
 * A media fixture harness that owns its own pool and app.
 *
 * It is a factory rather than a set of exported functions because `persona` needs
 * `composed.auth.$context` and `composed.authCookies` as well as the pool, and those are
 * assigned per file. Each caller owning its own pool also means one file's `afterAll`
 * cannot end another file's connections - with two sets of module-level state sharing a
 * pool, whichever finished first would kill the other's.
 *
 * `explorers-media.integration.test.ts` predates this and keeps its own copies. Folding it
 * in is worth doing, but it is a large mechanical diff across a file with 27 passing cases,
 * so it is deliberately left for its own change rather than ridden along with a fix.
 */
export function createMediaHarness() {
  const config = resolveExplorersAuthConfig({ EXPLORERS_PUBLIC_ORIGIN: "http://127.0.0.1:51474",
    EXPLORERS_AUTH_SECRET: "integration-secret-".repeat(4), GOOGLE_CLIENT_ID: "fixture-google-id", GOOGLE_CLIENT_SECRET: "fixture-google-secret" });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==", "base64");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 4 });
  const composed = createCanonicalApp(pool, config);

  async function persona() {
    const userId = `media-${randomUUID()}`;
    await pool.query("INSERT INTO auth_user(id,name,email) VALUES ($1,'Owner',$2)", [userId, `${userId}@example.invalid`]);
    await pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES ($1,$2,'google',$3,now())",
      [randomUUID(), `google-${userId}`, userId]);
    const context = await composed.auth.$context;
    const session = await context.internalAdapter.createSession(userId, false);
    const signature = createHmac("sha256", config.secret).update(session.token).digest("base64");
    const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${signature}`;
    const initial = await request(composed.app).get("/api/explorers/v1/me").set("cookie", cookie);
    expect(initial.status).toBe(200);
    return { cookie, userId, accountId: initial.body.account.id as string, revision: initial.body.account.revision as number };
  }

  async function upload(cookie: string, bytes = png, mime = "image/png", purpose = "profile") {
    return request(composed.app).post("/api/explorers/v1/media").set("cookie", cookie).set("origin", config.baseURL)
      .set("content-type", mime).set("x-media-purpose", purpose).set("x-file-name", "avatar.png").send(bytes);
  }

  /** Publishable account with the category public, plus a published public list. */
  async function publicList(category: string) {
    const owner = await persona();
    const handle = `m${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    await pool.query("UPDATE creator_accounts SET handle=$2,display_name='Cover creator',account_type='Creator',onboarding_status='complete',status='active',public_profile=true WHERE id=$1", [owner.accountId, handle]);
    await pool.query("INSERT INTO account_category_settings(account_id,category,is_public,display_order) VALUES($1,$2,true,(SELECT coalesce(max(display_order),-1)+1 FROM account_category_settings WHERE account_id=$1)) ON CONFLICT(account_id,category) DO UPDATE SET is_public=true", [owner.accountId, category]);
    const collection = (await pool.query("INSERT INTO collections(account_id,category,title,slug,visibility,publication_state,display_order) VALUES($1,$2,'Cover list',$3,'public','published',0) RETURNING id", [owner.accountId, category, `cover-${randomUUID()}`])).rows[0].id as string;
    return { owner, handle, collection };
  }

  return { pool, composed, config, png, persona, upload, publicList, end: () => pool.end() };
}
