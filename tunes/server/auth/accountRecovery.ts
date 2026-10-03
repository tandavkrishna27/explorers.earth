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
