import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureInitialAccount } from "../auth/initialAccount";
import { issueRecoveryProof, consumeRecoveryProof } from "../auth/recoveryProof";

let pool: pg.Pool;

async function recoveryIdentity(status: "suspended" | "deleted" = "suspended") {
  const userId = `recovery-${randomUUID()}`;
  const subject = `subject-${randomUUID()}`;
  await pool.query("INSERT INTO auth_user(id,name,email) VALUES ($1,'Recovery',$2)", [userId, `${userId}@example.invalid`]);
  await pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES ($1,$2,'google',$3,now())",
    [randomUUID(), subject, userId]);
  const { accountId } = await ensureInitialAccount(pool, userId);
  await pool.query(`UPDATE creator_accounts SET status=$2,suspended_at=CASE WHEN $2='suspended' THEN now() ELSE NULL END,
    deleted_at=CASE WHEN $2='deleted' THEN now() ELSE NULL END WHERE id=$1`, [accountId, status]);
  await pool.query("UPDATE user_security_state SET blocked_at=now() WHERE user_id=$1", [userId]);
  const sessionId = randomUUID();
  await pool.query(`INSERT INTO auth_session(id,expires_at,token,updated_at,user_id)
    VALUES ($1,now()+interval '1 hour',$2,now(),$3)`, [sessionId, randomUUID(), userId]);
  return { userId, subject, accountId, sessionId };
}

describe("Google callback recovery proof boundary", () => {
  beforeAll(() => { pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 4 }); });
  afterAll(async () => { await pool?.end(); });

  it("exchanges a fresh inactive Google session for a five-minute server-only proof", async () => {
    const identity = await recoveryIdentity();
    const proof = await issueRecoveryProof(pool, identity);
    expect(proof.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = (await pool.query("SELECT token_hash,expires_at-issued_at AS ttl FROM account_recovery_proofs WHERE id=$1", [proof.id])).rows[0];
    expect(row.token_hash).not.toEqual(Buffer.from(proof.token));
    expect(row.ttl).toMatchObject({ minutes: 5 });
    expect((await pool.query("SELECT count(*)::int AS count FROM auth_session WHERE id=$1", [identity.sessionId])).rows[0].count).toBe(0);
    expect((await pool.query("SELECT status FROM creator_accounts WHERE id=$1", [identity.accountId])).rows[0].status).toBe("suspended");
  });

  it("rejects a different provider subject and deletes its temporary normal session", async () => {
    const identity = await recoveryIdentity();
    await expect(issueRecoveryProof(pool, { ...identity, subject: `wrong-${identity.subject}` })).rejects.toThrow();
    expect((await pool.query("SELECT count(*)::int AS count FROM auth_session WHERE id=$1", [identity.sessionId])).rows[0].count).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS count FROM account_recovery_proofs WHERE user_id=$1", [identity.userId])).rows[0].count).toBe(0);
  });

  it("never issues a proof for a terminal account", async () => {
    const identity = await recoveryIdentity("deleted");
    await expect(issueRecoveryProof(pool, identity)).rejects.toThrow();
  });

  it("consumes once and reactivates the same account, rejecting replay", async () => {
    const identity = await recoveryIdentity();
    const proof = await issueRecoveryProof(pool, identity);
    await consumeRecoveryProof(pool, proof.token);
    expect((await pool.query("SELECT status FROM creator_accounts WHERE id=$1", [identity.accountId])).rows[0].status).toBe("active");
    await expect(consumeRecoveryProof(pool, proof.token)).rejects.toThrow();
  });

  it("rejects an expired proof without reactivating the account", async () => {
    const identity = await recoveryIdentity();
    const proof = await issueRecoveryProof(pool, identity);
    await pool.query(`UPDATE account_recovery_proofs SET issued_at=issued_at-interval '6 minutes',
      expires_at=expires_at-interval '6 minutes' WHERE id=$1`, [proof.id]);
    await expect(consumeRecoveryProof(pool, proof.token)).rejects.toThrow();
    expect((await pool.query("SELECT status FROM creator_accounts WHERE id=$1", [identity.accountId])).rows[0].status).toBe("suspended");
  });
});
