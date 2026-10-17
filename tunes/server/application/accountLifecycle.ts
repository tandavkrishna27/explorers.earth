import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Actor } from "./actor";
import type { RequestContext, RevisionInput } from "../../shared/explorersContract";
import { authorizeOperation } from "./authorization";
import { CONTENT_CATEGORIES, lockContentCategories } from "../db/explorers-content-lock";

export type AccountLifecycleDto = {
  accountId: string;
  status: "active" | "suspended" | "pending_deletion" | "deleted";
  operationId: string | null;
  revision: number;
};

export class AccountLifecycleFailure extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

const hash = (value: string) => createHash("sha256").update(value).digest();
const revisionIsValid = (value: number) => Number.isSafeInteger(value) && value > 0;

function commandKey(context: RequestContext): Buffer {
  if (!context.idempotencyKey || !/^[A-Za-z0-9._~-]{8,200}$/.test(context.idempotencyKey)) {
    throw new AccountLifecycleFailure(422, "INVALID_INPUT", "Idempotency key is required");
  }
  return hash(context.idempotencyKey);
}

async function accountRow(db: PoolClient, actor: Actor) {
  const result = await db.query<{ status: AccountLifecycleDto["status"]; revision: string }>(
    `SELECT a.status,a.revision::text FROM creator_accounts a
      JOIN account_memberships m ON m.account_id=a.id AND m.user_id=$2 AND m.role='owner'
      WHERE a.id=$1 FOR UPDATE OF a`, [actor.accountId, actor.userId]);
  if (!result.rows[0]) throw new AccountLifecycleFailure(404, "NOT_FOUND", "Account is unavailable");
  return result.rows[0];
}

async function receipt(db: PoolClient, actor: Actor, operation: string, input: unknown, context: RequestContext) {
  const key = commandKey(context);
  const requestHash = hash(JSON.stringify(input));
  const prior = await db.query<{ id: string; request_hash: Buffer; response: unknown; status: string; replayable: boolean }>(
    `SELECT id,request_hash,response,status,replay_until>clock_timestamp() AS replayable FROM application_command_receipts
      WHERE account_id=$1 AND operation=$2 AND idempotency_key_hash=$3 FOR UPDATE`,
    [actor.accountId, operation, key]);
  if (prior.rows[0]) {
    if (!prior.rows[0].request_hash.equals(requestHash) || prior.rows[0].status !== "completed" || !prior.rows[0].replayable) {
      throw new AccountLifecycleFailure(409, "CONFLICT", "Request key has already been used");
    }
    return { id: prior.rows[0].id, previous: prior.rows[0].response };
  }
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO application_command_receipts(account_id,operation,idempotency_key_hash,request_hash,response)
      VALUES($1,$2,$3,$4,'{}'::jsonb) RETURNING id`, [actor.accountId, operation, key, requestHash]);
  return { id: inserted.rows[0].id, previous: null };
}

async function saveReceipt(db: PoolClient, id: string, response: unknown) {
  await db.query("UPDATE application_command_receipts SET response=$2 WHERE id=$1", [id, JSON.stringify(response)]);
}

export class AccountLifecycleService {
  constructor(private readonly pool: Pool) {}

  async getAccountLifecycle(actor: Actor): Promise<AccountLifecycleDto> {
    const result = await this.pool.query<{ status: AccountLifecycleDto["status"]; revision: string; operation_id: string | null }>(
      `SELECT a.status,a.revision::text,
        (SELECT id FROM account_lifecycle_operations WHERE account_id=a.id ORDER BY created_at DESC,id DESC LIMIT 1) AS operation_id
       FROM creator_accounts a JOIN account_memberships m ON m.account_id=a.id AND m.user_id=$2
       WHERE a.id=$1`, [actor.accountId, actor.userId]);
    const row = result.rows[0];
    if (!row) throw new AccountLifecycleFailure(404, "NOT_FOUND", "Account is unavailable");
    return { accountId: actor.accountId, status: row.status, revision: Number(row.revision), operationId: row.operation_id };
  }

  async recordDeletionFeedback(actor: Actor, input: { reason: string }, context: RequestContext): Promise<{ id: string }> {
    const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
    if (!reason || reason.length > 2000) throw new AccountLifecycleFailure(422, "INVALID_INPUT", "Reason must be 1–2,000 characters");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const account = await accountRow(client, actor);
      await authorizeOperation(client, actor, "lifecycle:feedback", actor.accountId);
      if (account.status !== "active") throw new AccountLifecycleFailure(403, "FORBIDDEN", "Account is unavailable");
      const saved = await receipt(client, actor, "deletion-feedback", { reason }, context);
      if (saved.previous) { await client.query("COMMIT"); return saved.previous as { id: string }; }
      const result = await client.query<{ id: string }>(
        "INSERT INTO deletion_feedback(account_id,user_id,reason) VALUES($1,$2,$3) RETURNING id",
        [actor.accountId, actor.userId, reason]);
      const response = { id: result.rows[0].id };
      await saveReceipt(client, saved.id, response);
      await client.query("COMMIT");
      return response;
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
  }

  async requestAccountDeactivation(actor: Actor, input: RevisionInput, context: RequestContext): Promise<AccountLifecycleDto> {
    return this.transition(actor, input, context, "deactivate");
  }

  async requestAccountDeletion(actor: Actor, input: RevisionInput & { feedbackId: string }, context: RequestContext): Promise<AccountLifecycleDto> {
    return this.transition(actor, input, context, "delete");
  }

  private async transition(actor: Actor, input: RevisionInput & { feedbackId?: string }, context: RequestContext,
    operation: "deactivate" | "delete"): Promise<AccountLifecycleDto> {
    if (!revisionIsValid(input?.expectedRevision)) throw new AccountLifecycleFailure(422, "INVALID_INPUT", "Expected revision is required");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const account = await accountRow(client, actor);
      await authorizeOperation(client, actor, `lifecycle:${operation}`, actor.accountId);
      await lockContentCategories(client,actor.accountId,CONTENT_CATEGORIES);
      const saved = await receipt(client, actor, operation, input, context);
      if (saved.previous) { await client.query("COMMIT"); return saved.previous as AccountLifecycleDto; }
      if (account.status !== "active") throw new AccountLifecycleFailure(403, "FORBIDDEN", "Account is unavailable");
      if (Number(account.revision) !== input.expectedRevision) throw new AccountLifecycleFailure(409, "CONFLICT", "Account changed");
      if (operation === "delete") {
        if (typeof input.feedbackId !== "string") throw new AccountLifecycleFailure(422, "INVALID_INPUT", "Feedback is required");
        const feedback = await client.query("SELECT id FROM deletion_feedback WHERE id=$1 AND account_id=$2 AND reason IS NOT NULL",
          [input.feedbackId, actor.accountId]);
        if (!feedback.rows[0]) throw new AccountLifecycleFailure(404, "NOT_FOUND", "Feedback is unavailable");
      }
      const nextStatus = operation === "delete" ? "pending_deletion" : "suspended";
      const changed = await client.query<{ revision: string }>(`UPDATE creator_accounts SET status=$2,
        suspended_at=CASE WHEN $2='suspended' THEN now() ELSE NULL END,
        deletion_requested_at=CASE WHEN $2='pending_deletion' THEN now() ELSE NULL END,
        revision=revision+1,updated_at=now() WHERE id=$1 RETURNING revision::text`, [actor.accountId, nextStatus]);
      const record = await client.query<{ id: string }>(`INSERT INTO account_lifecycle_operations
        (account_id,requested_by_user_id,kind,state,expected_revision,feedback_id,receipt_id,completed_at)
        VALUES($1,$2,$3,$7,$4,$5,$6,CASE WHEN $3='delete' THEN NULL ELSE now() END) RETURNING id`,
      [actor.accountId, actor.userId, operation, input.expectedRevision, input.feedbackId ?? null, saved.id,
        operation === "delete" ? "pending" : "succeeded"]);
      await client.query("UPDATE user_security_state SET blocked_at=now(),session_version=session_version+1,updated_at=now() WHERE user_id=$1", [actor.userId]);
      await client.query("DELETE FROM auth_session WHERE user_id=$1", [actor.userId]);
      const response: AccountLifecycleDto = { accountId: actor.accountId, status: nextStatus,
        operationId: record.rows[0].id, revision: Number(changed.rows[0].revision) };
      await saveReceipt(client, saved.id, response);
      await client.query("COMMIT");
      return response;
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
  }
}
