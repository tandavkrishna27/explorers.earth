import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { CONTENT_CATEGORIES, lockContentCategories } from "../db/explorers-content-lock";

interface VerifiedGoogleCallback {
  userId: string;
  subject: string;
  sessionId: string;
}

function digest(token: string): Buffer { return createHash("sha256").update(token).digest(); }

/** Starting a new recovery flow invalidates any earlier browser-held proof. */
export async function revokeRecoveryProof(pool: Pick<Pool, "query">, token: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return;
  await pool.query(`UPDATE account_recovery_proofs SET revoked_at=clock_timestamp()
    WHERE token_hash=$1 AND consumed_at IS NULL AND revoked_at IS NULL`, [digest(token)]);
}

/** Called only by the verified Better Auth Google callback after-hook. Never a public route. */
export async function issueRecoveryProof(
  pool: Pick<Pool, "connect" | "query">,
  callback: VerifiedGoogleCallback,
): Promise<{ id: string; token: string }> {
  if (!callback.userId || !callback.subject || !callback.sessionId) throw new Error("Verified Google callback is required");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const identity = await client.query<{ account_id: string; status: string }>(`SELECT b.account_id,a.status
      FROM auth_session s JOIN auth_account p ON p.user_id=s.user_id
      JOIN initial_account_bindings b ON b.user_id=s.user_id
      JOIN creator_accounts a ON a.id=b.account_id
      WHERE s.id=$1 AND s.user_id=$2 AND s.expires_at>(clock_timestamp() AT TIME ZONE 'UTC')
        AND s.created_at>=(clock_timestamp() AT TIME ZONE 'UTC')-interval '2 minutes'
        AND p.provider_id='google' AND p.account_id=$3
      FOR UPDATE OF s,a`, [callback.sessionId, callback.userId, callback.subject]);
    const account = identity.rows[0];
    if (!account || !["suspended", "pending_deletion"].includes(account.status)) throw new Error("Recovery identity is unavailable");
    const token = randomBytes(32).toString("base64url");
    const proof = await client.query<{ id: string }>(`WITH issuance AS (SELECT clock_timestamp() AS issued)
      INSERT INTO account_recovery_proofs(user_id,account_id,token_hash,authenticated_at,issued_at,expires_at)
      SELECT $1,$2,$3,s.created_at AT TIME ZONE 'UTC',issuance.issued,issuance.issued+interval '5 minutes'
      FROM auth_session s CROSS JOIN issuance WHERE s.id=$4 AND s.user_id=$1 RETURNING id`,
    [callback.userId, account.account_id, digest(token), callback.sessionId]);
    if (!proof.rows[0]) throw new Error("Fresh Google session is unavailable");
    await client.query("DELETE FROM auth_session WHERE id=$1 AND user_id=$2", [callback.sessionId, callback.userId]);
    await client.query("COMMIT");
    return { id: proof.rows[0].id, token };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    // The library's temporary normal session must never survive proof failure.
    await pool.query("DELETE FROM auth_session WHERE id=$1 AND user_id=$2", [callback.sessionId, callback.userId]).catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

/** The proof is one-use and never authorizes ordinary account or content requests. */
export async function consumeRecoveryProof(pool: Pick<Pool, "connect">, token: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Recovery proof is invalid");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Resolve without tuple locks, lock the account first, then revalidate the
    // one-use proof below. Never hold a proof lock while waiting for its account.
    const scope=await client.query<{account_id:string}>("SELECT account_id FROM account_recovery_proofs WHERE token_hash=$1",[digest(token)]);
    if(!scope.rows[0]) throw new Error("Recovery proof is invalid or expired");
    await client.query("SELECT id FROM creator_accounts WHERE id=$1 FOR UPDATE",[scope.rows[0].account_id]);
    await lockContentCategories(client,scope.rows[0].account_id,CONTENT_CATEGORIES);
    const proof = await client.query<{ id: string; user_id: string; account_id: string }>(`SELECT p.id,p.user_id,p.account_id
      FROM account_recovery_proofs p JOIN creator_accounts a ON a.id=p.account_id
      WHERE p.token_hash=$1 AND p.purpose='account-recovery' AND p.consumed_at IS NULL
        AND p.revoked_at IS NULL AND p.expires_at>clock_timestamp() AND a.status IN ('suspended','pending_deletion')
      FOR UPDATE OF p,a`, [digest(token)]);
    const row = proof.rows[0];
    if (!row) throw new Error("Recovery proof is invalid or expired");
    await client.query(`UPDATE creator_accounts SET status='active',suspended_at=NULL,
      deletion_requested_at=NULL,revision=revision+1,updated_at=now() WHERE id=$1`, [row.account_id]);
    await client.query(`UPDATE user_security_state SET blocked_at=NULL,session_version=session_version+1,
      updated_at=now() WHERE user_id=$1`, [row.user_id]);
    await client.query("UPDATE account_recovery_proofs SET consumed_at=clock_timestamp() WHERE id=$1", [row.id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}
