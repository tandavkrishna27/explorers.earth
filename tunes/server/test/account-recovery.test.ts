import { randomUUID } from "node:crypto";
import type { Request } from "express";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureInitialAccount } from "../auth/initialAccount";
import { issueRecoveryProof } from "../auth/recoveryProof";
import { recoverAccount, requireRecoveryPrincipal } from "../auth/accountRecovery";

let pool: pg.Pool;
async function inactiveIdentity() {
  const userId = `recovery-domain-${randomUUID()}`;
  const subject = `google-${randomUUID()}`;
  await pool.query("INSERT INTO auth_user(id,name,email) VALUES($1,'Recovery',$2)", [userId, `${userId}@example.invalid`]);
  await pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES($1,$2,'google',$3,now())",
    [randomUUID(), subject, userId]);
  const { accountId } = await ensureInitialAccount(pool, userId);
  await pool.query("UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1", [accountId]);
  await pool.query("UPDATE user_security_state SET blocked_at=now() WHERE user_id=$1", [userId]);
  const sessionId = randomUUID();
  await pool.query("INSERT INTO auth_session(id,expires_at,token,updated_at,user_id) VALUES($1,now()+interval '1 hour',$2,now(),$3)",
    [sessionId, randomUUID(), userId]);
  const proof = await issueRecoveryProof(pool, { userId, subject, sessionId });
  return { accountId, userId, proof };
}
const requestWithProof = (token: string) => ({ cookies: { explorers_recovery_proof: token } }) as Request;

describe("purpose-bound account recovery service", () => {
  beforeAll(() => { pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST }); });
  afterAll(async () => { await pool?.end(); });
  it("resolves only the bound identity and consumes the revision-bound authority once", async () => {
    const first = await inactiveIdentity();
    const second = await inactiveIdentity();
    const principal = await requireRecoveryPrincipal(requestWithProof(first.proof.token), pool);
    expect(principal).toMatchObject({ userId: first.userId, accountId: first.accountId, purpose: "account-recovery" });
    expect(principal.accountId).not.toBe(second.accountId);
    await expect(recoverAccount(pool, principal, { expectedRevision: 2 }, { requestId: randomUUID() })).rejects.toMatchObject({ status: 409 });
    expect((await pool.query("SELECT status FROM creator_accounts WHERE id=$1", [first.accountId])).rows[0].status).toBe("suspended");
    const recovered = await recoverAccount(pool, principal, { expectedRevision: 1 }, { requestId: randomUUID() });
    expect(recovered).toMatchObject({ accountId: first.accountId, status: "active", revision: 2 });
    await expect(recoverAccount(pool, principal, { expectedRevision: 1 }, { requestId: randomUUID() })).rejects.toMatchObject({ status: 403 });
    await expect(requireRecoveryPrincipal(requestWithProof(first.proof.token), pool)).rejects.toMatchObject({ status: 403 });
  });
});
