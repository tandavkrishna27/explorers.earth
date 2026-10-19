import { createHmac, randomUUID } from "node:crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanonicalApp } from "../auth/canonicalApp";
import { resolveExplorersAuthConfig } from "../auth/betterAuth";
import { HANDLE_CHANGE_COOLDOWN_DAYS } from "../../shared/explorersContract";

const config = resolveExplorersAuthConfig({
  EXPLORERS_PUBLIC_ORIGIN: "http://127.0.0.1:51474",
  EXPLORERS_AUTH_SECRET: "integration-secret-".repeat(4),
  GOOGLE_CLIENT_ID: "fixture-google-id", GOOGLE_CLIENT_SECRET: "fixture-google-secret",
});
let pool: pg.Pool;
let composed: ReturnType<typeof createCanonicalApp>;
const DAY = 24 * 60 * 60 * 1000;
const handleName = () => `h${randomUUID().replaceAll("-", "").slice(0, 12)}`;

async function persona() {
  const userId = `handle-${randomUUID()}`;
  await pool.query("INSERT INTO auth_user(id,name,email) VALUES ($1,'Owner',$2)", [userId, `${userId}@example.invalid`]);
  await pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES ($1,$2,'google',$3,now())",
    [randomUUID(), `google-${userId}`, userId]);
  const context = await composed.auth.$context;
  const session = await context.internalAdapter.createSession(userId, false);
  const signature = createHmac("sha256", config.secret).update(session.token).digest("base64");
  const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${signature}`;
  const response = await request(composed.app).get("/api/explorers/v1/me").set("cookie", cookie);
  expect(response.status).toBe(200);
  return { accountId: response.body.account.id as string, cookie };
}
const me = async (owner: { cookie: string }) =>
  (await request(composed.app).get("/api/explorers/v1/me").set("cookie", owner.cookie)).body.account;
const patch = (owner: { cookie: string }, body: Record<string, unknown>) =>
  request(composed.app).patch("/api/explorers/v1/account").set("cookie", owner.cookie).set("origin", config.baseURL).send(body);
/** A public, onboarded account at `handle`. */
async function publicOwner(handle: string) {
  const owner = await persona();
  const saved = await patch(owner, { expectedRevision: 1, handle, displayName: "Public", accountType: "Creator",
    onboardingStatus: "complete", publicProfile: true });
  expect(saved.status).toBe(200);
  return owner;
}
/** Moves the clock for one hold: the change happened `daysAgo` days ago. */
const ageHold = (handle: string, daysAgo: number) => pool.query(
  `UPDATE account_handle_holds SET created_at=now()-make_interval(days=>$2),held_until=now()-make_interval(days=>$2)+make_interval(days=>$3) WHERE handle_key=$1`,
  [handle, daysAgo, HANDLE_CHANGE_COOLDOWN_DAYS]);

describe("handle changes", () => {
  beforeAll(() => { pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 4 }); composed = createCanonicalApp(pool, config); });
  afterAll(async () => { await pool?.end(); });

  it("lets an account claim its first handle without any cooldown or hold", async () => {
    const owner = await persona();
    const first = handleName();
    const saved = await patch(owner, { expectedRevision: 1, handle: first });
    expect(saved.status).toBe(200);
    expect(saved.body.account.handleChangeAllowedAt).toBeNull();
    expect((await pool.query("SELECT 1 FROM account_handle_holds WHERE account_id=$1", [owner.accountId])).rowCount).toBe(0);
  });

  it("allows one change, holds the old handle, and reports when the next change is allowed", async () => {
    const owner = await publicOwner(handleName());
    const before = await me(owner);
    const next = handleName();
    const before2 = Date.now();
    const changed = await patch(owner, { expectedRevision: before.revision, handle: next });
    expect(changed.status).toBe(200);
    expect(changed.body.account.handle).toBe(next);
    const allowedAt = Date.parse(changed.body.account.handleChangeAllowedAt);
    expect(allowedAt).toBeGreaterThan(before2 + HANDLE_CHANGE_COOLDOWN_DAYS * DAY - 60_000);
    expect(allowedAt).toBeLessThan(Date.now() + HANDLE_CHANGE_COOLDOWN_DAYS * DAY + 60_000);
    expect((await me(owner)).handleChangeAllowedAt).toBe(changed.body.account.handleChangeAllowedAt);
    const hold = await pool.query("SELECT handle_key,account_id,held_until>now() AS live FROM account_handle_holds WHERE account_id=$1", [owner.accountId]);
    expect(hold.rows).toEqual([{ handle_key: before.handle, account_id: owner.accountId, live: true }]);
  });

  it("refuses a second change inside the cooldown with the next-allowed date, and changes nothing else", async () => {
    const owner = await publicOwner(handleName());
    const first = await patch(owner, { expectedRevision: (await me(owner)).revision, handle: handleName() });
    expect(first.status).toBe(200);
    const current = await me(owner);
    const second = await patch(owner, { expectedRevision: current.revision, handle: handleName(), bioPlain: "Not saved" });
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({ code: "HANDLE_COOLDOWN", nextAllowedAt: current.handleChangeAllowedAt });
    expect(second.body.error.message).toContain(String(current.handleChangeAllowedAt).slice(0, 10));
    expect(await me(owner)).toMatchObject({ handle: current.handle, revision: current.revision, bioPlain: current.bioPlain });
    // Saving the handle it already has, with other changes, is not a change.
    const same = await patch(owner, { expectedRevision: current.revision, handle: current.handle, bioPlain: "Saved" });
    expect(same.status).toBe(200);
  });

  it("keeps another account off a held handle, in the write and in the availability answer", async () => {
    const original = handleName();
    const owner = await publicOwner(original);
    expect((await patch(owner, { expectedRevision: (await me(owner)).revision, handle: handleName() })).status).toBe(200);
    const stranger = await persona();
    const claim = await patch(stranger, { expectedRevision: 1, handle: original });
    expect(claim.status).toBe(409);
    expect(claim.body.error.message).toBe("Handle is unavailable");
    const free = await request(composed.app).get(`/api/explorers/v1/public/handles/${original}/available`);
    expect(free.body).toEqual({ available: false });
  });

  it("redirects public requests for the old handle to the new one while it is held", async () => {
    const original = handleName();
    const owner = await publicOwner(original);
    const moved = handleName();
    expect((await patch(owner, { expectedRevision: (await me(owner)).revision, handle: moved })).status).toBe(200);
    const shell = await request(composed.app).get(`/api/explorers/v1/profiles/${original.toUpperCase()}`).redirects(0);
    expect(shell.status).toBe(308);
    expect(shell.headers.location).toBe(`/api/explorers/v1/profiles/${moved}`);
    const category = await request(composed.app).get(`/api/explorers/v1/profiles/${original}/recommendations/places?limit=5`).redirects(0);
    expect(category.status).toBe(308);
    expect(category.headers.location).toBe(`/api/explorers/v1/profiles/${moved}/recommendations/places?limit=5`);
    const detail = await request(composed.app).get(`/api/explorers/v1/profiles/${original}/recommendations/places/some-list`).redirects(0);
    expect(detail.headers.location).toBe(`/api/explorers/v1/profiles/${moved}/recommendations/places/some-list`);
    // Following it reaches the new profile.
    expect((await request(composed.app).get(shell.headers.location)).body.username).toBe(moved);
    // The new handle itself is never redirected.
    expect((await request(composed.app).get(`/api/explorers/v1/profiles/${moved}`).redirects(0)).status).toBe(200);
  });

  it("does not redirect to an account that is not public, or for a handle that was never held", async () => {
    const original = handleName();
    const owner = await publicOwner(original);
    expect((await patch(owner, { expectedRevision: (await me(owner)).revision, handle: handleName(), publicProfile: false })).status).toBe(200);
    expect((await request(composed.app).get(`/api/explorers/v1/profiles/${original}`).redirects(0)).status).toBe(404);
    expect((await request(composed.app).get(`/api/explorers/v1/profiles/${handleName()}`).redirects(0)).status).toBe(404);
  });

  it("releases the handle and the cooldown once the 30 days are over", async () => {
    const original = handleName();
    const owner = await publicOwner(original);
    const moved = handleName();
    expect((await patch(owner, { expectedRevision: (await me(owner)).revision, handle: moved })).status).toBe(200);
    await ageHold(original, HANDLE_CHANGE_COOLDOWN_DAYS + 1);
    expect((await me(owner)).handleChangeAllowedAt).toBeNull();
    expect((await request(composed.app).get(`/api/explorers/v1/profiles/${original}`).redirects(0)).status).toBe(404);
    expect((await request(composed.app).get(`/api/explorers/v1/public/handles/${original}/available`)).body).toEqual({ available: true });
    const stranger = await persona();
    expect((await patch(stranger, { expectedRevision: 1, handle: original })).status).toBe(200);
    // The first owner may change again; the handle it leaves is now the one held.
    const again = handleName();
    expect((await patch(owner, { expectedRevision: (await me(owner)).revision, handle: again })).status).toBe(200);
    expect((await pool.query("SELECT handle_key FROM account_handle_holds WHERE account_id=$1 ORDER BY created_at", [owner.accountId])).rows
      .map((row) => row.handle_key)).toContain(moved);
  });

  it("lets only one of two accounts take a handle that is being released at the same moment", async () => {
    const original = handleName();
    const owner = await publicOwner(original);
    const stranger = await persona();
    const [change, claim] = await Promise.all([
      patch(owner, { expectedRevision: (await me(owner)).revision, handle: handleName() }),
      patch(stranger, { expectedRevision: 1, handle: original }),
    ]);
    expect(change.status).toBe(200);
    // The claim cannot win: it either found the handle still taken, or found it held.
    expect(claim.status).toBe(409);
    expect((await pool.query("SELECT count(*)::int AS n FROM creator_accounts WHERE handle_key=$1", [original])).rows[0].n).toBe(0);
  });

  it("lets an account take its own held handle back once the cooldown is over", async () => {
    const original = handleName();
    const owner = await publicOwner(original);
    expect((await patch(owner, { expectedRevision: (await me(owner)).revision, handle: handleName() })).status).toBe(200);
    // Inside the cooldown the account's own claim is refused for the cooldown, not for the hold.
    const early = await patch(owner, { expectedRevision: (await me(owner)).revision, handle: original });
    expect(early.body.error.code).toBe("HANDLE_COOLDOWN");
    await pool.query("UPDATE account_handle_holds SET created_at=now()-interval '31 days' WHERE account_id=$1", [owner.accountId]);
    await pool.query("UPDATE account_handle_holds SET held_until=now()+interval '1 day' WHERE account_id=$1", [owner.accountId]);
    const back = await patch(owner, { expectedRevision: (await me(owner)).revision, handle: original });
    expect(back.status).toBe(200);
    expect(back.body.account.handle).toBe(original);
  });
});
