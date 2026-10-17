import { createHash } from "node:crypto";
import type { Request } from "express";
import type { Pool } from "pg";
import type { RequestContext, RevisionInput } from "../../shared/explorersContract";
import { AccountLifecycleFailure, type AccountLifecycleDto } from "../application/accountLifecycle";
import { recoveryProofCookie } from "./recoveryCallback";
import { CONTENT_CATEGORIES, lockContentCategories } from "../db/explorers-content-lock";

declare const recoveryBrand: unique symbol;
export type RecoveryPrincipal = { userId: string; accountId: string; purpose: "account-recovery"; proofId: string;
  readonly [recoveryBrand]: true };

export async function requireRecoveryPrincipal(request: Request, pool: Pool): Promise<RecoveryPrincipal> {
  const token = request.cookies?.[recoveryProofCookie];
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new AccountLifecycleFailure(403, "RECOVERY_INVALID", "Recovery proof is unavailable");
  }
  const digest = createHash("sha256").update(token).digest();
  const result = await pool.query<{ id: string; user_id: string; account_id: string }>(
    `SELECT p.id,p.user_id,p.account_id FROM account_recovery_proofs p
      JOIN creator_accounts a ON a.id=p.account_id
      WHERE p.token_hash=$1 AND p.purpose='account-recovery'
        AND p.consumed_at IS NULL AND p.revoked_at IS NULL
        AND p.expires_at>clock_timestamp() AND a.status IN ('suspended','pending_deletion')`, [digest]);
  const row = result.rows[0];
  if (!row) throw new AccountLifecycleFailure(403, "RECOVERY_INVALID", "Recovery proof is unavailable");
  return { userId: row.user_id, accountId: row.account_id, purpose: "account-recovery", proofId: row.id } as RecoveryPrincipal;
}

declare const observationBrand: unique symbol;
/**
 * Authority to LOOK at one account's lifecycle, and nothing else.
 *
 * Separate from RecoveryPrincipal and deliberately not assignable to it: it carries its own
 * brand and a different `purpose`, so it cannot be passed to recoverAccount or to anything
 * that takes an Actor. Observing is not transitioning.
 *
 * Ticket 2.4 package L0 requires lifecycle observation to distinguish a terminal outcome
 * from a pending one from an indeterminate one, and C3 notes that a client which lost its
 * response must be able to re-observe without replaying its proof. Neither is possible
 * through requireRecoveryPrincipal, which gates on `consumed_at IS NULL` and on the account
 * still being `suspended` or `pending_deletion`:
 *
 *  - A recovery that succeeded consumes the proof and makes the account active, so the
 *    client that lost that response is refused. The cookie is cleared only on delivered
 *    success precisely so this read can answer - and the read said 403.
 *  - A terminally deleted account is excluded by the status filter, so "terminal" could
 *    never be reported and a permanent deletion looked exactly like a transient failure.
 *
 * ## The boundary this widens, stated plainly
 *
 * Relative to requireRecoveryPrincipal this drops exactly two conditions: `consumed_at IS
 * NULL`, and the account-status filter. It keeps every other one - the token must match a
 * stored hash, carry the account-recovery purpose, not be revoked, and **still be within
 * its original five-minute expiry**. So the widening is: for the remainder of a proof's own
 * lifetime, the holder may read that one account's lifecycle status after using it.
 *
 * What it does not do: it performs no write, it resolves only the binding already stored on
 * the proof, it returns no profile or content, and it cannot be exchanged for a session. A
 * revoked or expired proof is refused here exactly as it is there.
 *
 * This is a security boundary change and it is called out in the commit rather than left
 * for a reader to notice. If the owner would rather a consumed proof read nothing, the
 * alternative is that the lost-response and terminal cases stay unreportable, which is the
 * defect L0 exists to remove.
 */
export type RecoveryObservationAuthority = {
  userId: string; accountId: string; purpose: "account-recovery-observation"; proofId: string;
  readonly [observationBrand]: true;
};

export async function requireRecoveryObservation(request: Request, pool: Pool): Promise<RecoveryObservationAuthority> {
  const token = request.cookies?.[recoveryProofCookie];
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new AccountLifecycleFailure(403, "RECOVERY_INVALID", "Recovery proof is unavailable");
  }
  const digest = createHash("sha256").update(token).digest();
  // No join to creator_accounts: a missing account row must reach the classifier as the
  // indeterminate case rather than be turned into a refusal here.
  const result = await pool.query<{ id: string; user_id: string; account_id: string }>(
    `SELECT p.id,p.user_id,p.account_id FROM account_recovery_proofs p
      WHERE p.token_hash=$1 AND p.purpose='account-recovery'
        AND p.revoked_at IS NULL AND p.expires_at>clock_timestamp()`, [digest]);
  const row = result.rows[0];
  if (!row) throw new AccountLifecycleFailure(403, "RECOVERY_INVALID", "Recovery proof is unavailable");
  return { userId: row.user_id, accountId: row.account_id,
    purpose: "account-recovery-observation", proofId: row.id } as RecoveryObservationAuthority;
}

export async function recoverAccount(pool: Pool, principal: RecoveryPrincipal, input: RevisionInput,
  _context: RequestContext): Promise<AccountLifecycleDto> {
  if (principal.purpose !== "account-recovery" || !Number.isSafeInteger(input?.expectedRevision) || input.expectedRevision < 1) {
    throw new AccountLifecycleFailure(422, "INVALID_INPUT", "Expected revision is required");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM creator_accounts WHERE id=$1 FOR UPDATE", [principal.accountId]);
    await lockContentCategories(client,principal.accountId,CONTENT_CATEGORIES);
    const proof = await client.query<{ id: string; revision: string; status: string }>(
      `SELECT p.id,a.revision::text,a.status FROM account_recovery_proofs p
        JOIN creator_accounts a ON a.id=p.account_id
        JOIN account_memberships m ON m.account_id=p.account_id AND m.user_id=p.user_id AND m.role='owner'
       WHERE p.id=$1 AND p.user_id=$2 AND p.account_id=$3 AND p.purpose='account-recovery'
         AND p.consumed_at IS NULL AND p.revoked_at IS NULL AND p.expires_at>clock_timestamp()
         AND a.status IN ('suspended','pending_deletion') FOR UPDATE OF p,a`, [principal.proofId, principal.userId, principal.accountId]);
    if (!proof.rows[0]) throw new AccountLifecycleFailure(403, "RECOVERY_INVALID", "Recovery proof is unavailable");
    if (Number(proof.rows[0].revision) !== input.expectedRevision) {
      throw new AccountLifecycleFailure(409, "CONFLICT", "Account changed");
    }
    if (proof.rows[0].status === "pending_deletion") {
      const finalizing = await client.query(`SELECT 1 FROM account_lifecycle_operations
        WHERE account_id=$1 AND kind='delete' AND state='running'`, [principal.accountId]);
      if (finalizing.rowCount) throw new AccountLifecycleFailure(409, "CONFLICT", "Deletion is finalizing");
      await client.query(`UPDATE account_lifecycle_operations SET state='cancelled',completed_at=clock_timestamp(),
        updated_at=clock_timestamp() WHERE account_id=$1 AND kind='delete' AND state IN ('pending','running')`,
      [principal.accountId]);
    }
    const changed = await client.query<{ revision: string }>(`UPDATE creator_accounts SET status='active',suspended_at=NULL,
      deletion_requested_at=NULL,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING revision::text`, [principal.accountId]);
    await client.query("UPDATE user_security_state SET blocked_at=NULL,session_version=session_version+1,updated_at=now() WHERE user_id=$1", [principal.userId]);
    await client.query("UPDATE account_recovery_proofs SET consumed_at=clock_timestamp() WHERE id=$1", [principal.proofId]);
    const receipt = await client.query<{ id: string }>(`INSERT INTO application_command_receipts
      (account_id,operation,idempotency_key_hash,request_hash,response)
      VALUES($1,'recover',$2,$3,'{}'::jsonb) RETURNING id`,
    [principal.accountId, createHash("sha256").update(principal.proofId).digest(),
      createHash("sha256").update(String(input.expectedRevision)).digest()]);
    const operation = await client.query<{ id: string }>(`INSERT INTO account_lifecycle_operations
      (account_id,requested_by_user_id,kind,state,expected_revision,receipt_id,completed_at)
      VALUES($1,$2,$3,'succeeded',$4,$5,now()) RETURNING id`,
    [principal.accountId, principal.userId, proof.rows[0].status === "pending_deletion" ? "cancel_deletion" : "reactivate",
      input.expectedRevision, receipt.rows[0].id]);
    const response: AccountLifecycleDto = { accountId: principal.accountId, status: "active",
      operationId: operation.rows[0].id, revision: Number(changed.rows[0].revision) };
    await client.query("UPDATE application_command_receipts SET response=$2 WHERE id=$1", [receipt.rows[0].id, JSON.stringify(response)]);
    await client.query("COMMIT");
    return response;
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { client.release(); }
}
