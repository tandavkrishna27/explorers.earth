/**
 * Launch plan Workstream A2: legacy handle holds, against real PostgreSQL.
 *
 * The product shares QR codes that encode `/<handle>`, and users print them. The new stack
 * starts on an empty database, so without a hold a stranger could claim an old user's handle
 * and every code that user printed would advertise the stranger. A hold keeps the handle for
 * the original owner, identified only by a sha256 of their old account's email.
 *
 * Every case is asserted through BOTH decision points a creator meets:
 *   - the availability hint the three username inputs call while typing, and
 *   - the account write that actually claims the handle.
 * They must agree. A hint that says "taken" while the write would accept strands the real
 * owner at the onboarding form; a hint that says "free" while the write refuses sends a
 * creator through the whole form to a refusal.
 *
 * The digest here is computed independently with node:crypto rather than through the
 * application helper, so a change to the normalisation cannot pass by moving both sides.
 */
import { createHash, createHmac, randomUUID } from "node:crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createCanonicalApp } from "../auth/canonicalApp";
import { resolveExplorersAuthConfig } from "../auth/betterAuth";
import { applyLegacyHandleHolds, parseLegacyHoldsCsv } from "../application/legacyHandleHolds";

const config = resolveExplorersAuthConfig({ EXPLORERS_PUBLIC_ORIGIN: "http://127.0.0.1:51474",
  EXPLORERS_AUTH_SECRET: "legacy-hold-secret-".repeat(4), GOOGLE_CLIENT_ID: "fixture", GOOGLE_CLIENT_SECRET: "fixture" });
let pool: pg.Pool, composed: ReturnType<typeof createCanonicalApp>;
beforeAll(() => { pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 4 }); composed = createCanonicalApp(pool, config); });
afterAll(async () => { await pool.end(); });

const digest = (email: string) => createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex");
const freshHandle = (prefix: string) => `${prefix}${randomUUID().replaceAll("-", "").slice(0, 16)}`;

/** A signed-in Google creator with a provisioned (incomplete) account and a real session cookie. */
async function creator(options: { email?: string; verified: boolean }) {
  const userId = `hold-${randomUUID()}`;
  const email = options.email ?? `${userId}@example.invalid`;
  await pool.query("INSERT INTO auth_user(id,name,email,email_verified) VALUES($1,'Creator',$2,$3)", [userId, email, options.verified]);
  await pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES($1,$2,'google',$3,now())", [randomUUID(), userId, userId]);
  const context = await composed.auth.$context, session = await context.internalAdapter.createSession(userId, false);
  const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${createHmac("sha256", config.secret).update(session.token).digest("base64")}`;
  const me = await request(composed.app).get("/api/explorers/v1/me").set("cookie", cookie);
  expect(me.status, JSON.stringify(me.body)).toBe(200);
  return { userId, email, cookie, revision: me.body.account.revision as number };
}

async function hold(handle: string, email: string, heldUntil: string) {
  await pool.query("INSERT INTO legacy_handle_holds(handle_key,email_sha256,held_until) VALUES($1,$2,$3::timestamptz)", [handle, digest(email), heldUntil]);
}

const availability = (handle: string, cookie?: string) => {
  const call = request(composed.app).get(`/api/explorers/v1/public/handles/${handle}/available`);
  return cookie ? call.set("cookie", cookie) : call;
};
const claim = (who: { cookie: string; revision: number }, handle: string) =>
  request(composed.app).patch("/api/explorers/v1/account").set("cookie", who.cookie).set("origin", config.baseURL)
    .send({ handle, expectedRevision: who.revision });

/** Asserts hint and write agree, and returns the shared answer. */
async function decide(who: { cookie: string; revision: number }, handle: string): Promise<boolean> {
  const hint = await availability(handle, who.cookie);
  expect(hint.status).toBe(200);
  const write = await claim(who, handle);
  expect([200, 422]).toContain(write.status);
  if (write.status === 422) expect(write.body.error.message).toBe("Handle is unavailable");
  expect(hint.body.available, `hint ${JSON.stringify(hint.body)} vs write ${write.status}`).toBe(write.status === 200);
  return write.status === 200;
}

const future = "2099-01-01T00:00:00Z";

it("lets the original owner claim a held handle with the same verified Google email", async () => {
  const handle = freshHandle("held"), owner = await creator({ verified: true });
  // Stored as the loader would store it from an export that spelled the address differently.
  await hold(handle, `  ${owner.email.toUpperCase()} `, future);
  expect(await decide(owner, handle)).toBe(true);
  expect((await pool.query("SELECT 1 FROM creator_accounts WHERE handle_key=$1", [handle])).rowCount).toBe(1);
});

it("refuses a different account, exactly like a reserved word, and anonymous callers see it as taken", async () => {
  const handle = freshHandle("held"), owner = await creator({ verified: true }), stranger = await creator({ verified: true });
  await hold(handle, owner.email, future);
  expect((await availability(handle)).body).toEqual({ available: false });
  expect(await decide(stranger, handle)).toBe(false);
  // The refusal must not be distinguishable from a reserved word's.
  const reserved = await claim(stranger, "settings");
  const held = await claim(stranger, handle);
  expect(held.status).toBe(reserved.status);
  expect(held.body.error.code).toBe(reserved.body.error.code);
  expect(held.body.error.message).toBe(reserved.body.error.message);
  expect((await pool.query("SELECT 1 FROM creator_accounts WHERE handle_key=$1", [handle])).rowCount).toBe(0);
});

it("releases the handle to anyone once held_until has passed", async () => {
  const handle = freshHandle("gone"), stranger = await creator({ verified: true });
  await hold(handle, "someone-else@example.invalid", "2000-01-01T00:00:00Z");
  expect((await availability(handle)).body).toEqual({ available: true });
  expect(await decide(stranger, handle)).toBe(true);
});

it("never matches an unverified email, even when the address is identical", async () => {
  const handle = freshHandle("unver"), unverified = await creator({ verified: false });
  await hold(handle, unverified.email, future);
  expect(await decide(unverified, handle)).toBe(false);
});

it("leaves handles without a hold to the ordinary rules", async () => {
  const stranger = await creator({ verified: true });
  expect(await decide(stranger, freshHandle("free"))).toBe(true);
});

it("loads holds from a synthetic export, then extends them on a re-run, and the loaded hold protects the handle", async () => {
  const first = freshHandle("load"), second = freshHandle("load"), claimed = freshHandle("load");
  const owner = await creator({ verified: true }), stranger = await creator({ verified: true });
  expect(await decide(stranger, claimed)).toBe(true);
  const csv = `handle,email\n${first.toUpperCase()},${owner.email}\n${second},other@example.invalid\n${claimed},x@example.invalid\nno_such_shape,y@example.invalid\n`;
  const parsed = parseLegacyHoldsCsv(csv);
  expect(parsed.skippedUnclaimableLines).toEqual([5]);
  expect(await applyLegacyHandleHolds(pool, parsed.rows, new Date("2098-01-01T00:00:00Z"))).toEqual({ inserted: 3, updated: 0, alreadyClaimed: 1 });
  expect(await applyLegacyHandleHolds(pool, parsed.rows, new Date(future))).toEqual({ inserted: 0, updated: 3, alreadyClaimed: 1 });
  const stored = (await pool.query("SELECT handle_key,email_sha256,held_until FROM legacy_handle_holds WHERE handle_key=$1", [first])).rows[0];
  expect(stored).toEqual({ handle_key: first, email_sha256: digest(owner.email), held_until: new Date(future) });
  const other = await creator({ verified: true });
  expect(await decide(other, first)).toBe(false);
  expect(await decide(owner, first)).toBe(true);
  // The account that already held a handle before the load keeps it and can re-save it.
  const resaved = await claim({ cookie: stranger.cookie, revision: stranger.revision + 1 }, claimed);
  expect(resaved.status, JSON.stringify(resaved.body)).toBe(200);
});

it("gives the runtime role read access only", async () => {
  const grants = (await pool.query(
    `SELECT has_table_privilege('music_runtime','legacy_handle_holds','SELECT') AS can_select,
            has_table_privilege('music_runtime','legacy_handle_holds','INSERT') AS can_insert,
            has_table_privilege('music_runtime','legacy_handle_holds','UPDATE') AS can_update,
            has_table_privilege('music_runtime','legacy_handle_holds','DELETE') AS can_delete`)).rows[0];
  expect(grants).toEqual({ can_select: true, can_insert: false, can_update: false, can_delete: false });
});
