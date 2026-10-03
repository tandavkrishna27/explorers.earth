import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { ensureInitialAccount } from "../auth/initialAccount";

const connectionString = process.env.DATABASE_URL_TEST;
let pool: pg.Pool;

describe("initial creator account provisioning", () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString, max: 8 });
  });
  afterAll(async () => { await pool?.end(); });

  it("returns one account and one owner membership under concurrent callbacks", async () => {
    const userId = `provision-${crypto.randomUUID()}`;
    await pool.query("INSERT INTO auth_user(id,name,email) VALUES ($1,$2,$3)", [userId, "One", `${userId}@example.invalid`]);
    const results = await Promise.all(Array.from({ length: 8 }, () => ensureInitialAccount(pool, userId)));
    expect(new Set(results.map((result) => result.accountId)).size).toBe(1);
    const rows = await pool.query(`SELECT b.account_id,m.role FROM initial_account_bindings b
      JOIN account_memberships m ON m.account_id=b.account_id AND m.user_id=b.user_id WHERE b.user_id=$1`, [userId]);
    expect(rows.rows).toEqual([{ account_id: results[0].accountId, role: "owner" }]);
  });

  it("rolls back the account when a later insert fails", async () => {
    const userId = `rollback-${crypto.randomUUID()}`;
    const countBefore = (await pool.query("SELECT count(*)::int AS count FROM creator_accounts")).rows[0].count;
    await expect(ensureInitialAccount(pool, userId)).rejects.toThrow();
    expect((await pool.query("SELECT count(*)::int AS count FROM creator_accounts")).rows[0].count).toBe(countBefore);
    expect((await pool.query("SELECT count(*)::int AS count FROM initial_account_bindings WHERE user_id=$1", [userId])).rows[0].count).toBe(0);
  });

  it("keeps provider subjects distinct despite matching display names", async () => {
    const first = `subject-${crypto.randomUUID()}`;
    const second = `subject-${crypto.randomUUID()}`;
    const firstSubject = `google-${crypto.randomUUID()}`;
    const secondSubject = `google-${crypto.randomUUID()}`;
    for (const [id, email] of [[first, `${first}@example.invalid`], [second, `${second}@example.invalid`]]) {
      await pool.query("INSERT INTO auth_user(id,name,email) VALUES ($1,'Same',$2)", [id, email]);
    }
    await pool.query(`INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at)
      VALUES ($1,$2,'google',$3,now()),($4,$5,'google',$6,now())`,
      [crypto.randomUUID(), firstSubject, first, crypto.randomUUID(), secondSubject, second]);
    expect((await pool.query("SELECT count(DISTINCT user_id)::int AS count FROM auth_account WHERE provider_id='google' AND account_id=ANY($1)", [[firstSubject, secondSubject]])).rows[0].count).toBe(2);
    await expect(pool.query(`INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at)
      VALUES ($1,$2,'google',$3,now())`, [crypto.randomUUID(), firstSubject, second])).rejects.toMatchObject({ code: "23505" });
    await expect(pool.query("INSERT INTO auth_user(id,name,email) VALUES ($1,'Same',$2)",
      [`collision-${crypto.randomUUID()}`, `${first}@example.invalid`])).rejects.toMatchObject({ code: "23505" });
  });
});
