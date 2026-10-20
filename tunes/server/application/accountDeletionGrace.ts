import type { Pool } from "pg";

/**
 * Account deletion grace period.
 *
 * A pending deletion is finalised only once `creator_accounts.deletion_requested_at` is at
 * least this many days old. Until then the account stays hidden but recoverable: signing in
 * leads to /reactivate, and Google recovery cancels the deletion.
 *
 * This is the single definition of that rule. Every query that selects due deletions in
 * accountLifecycleMaintenance.ts, and the scheduled date shown to the owner, are built from
 * these two helpers so they cannot drift apart. There is deliberately no environment
 * override: nothing may shorten the grace period in production.
 */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

/** SQL predicate: the deletion requested on `account.deletion_requested_at` is past its grace period. */
export const deletionGraceElapsedSql = (account = "a"): string =>
  `${account}.deletion_requested_at<=clock_timestamp()-interval '${ACCOUNT_DELETION_GRACE_DAYS} days'`;

/** SQL expression: when the pending deletion becomes eligible to be finalised. */
export const scheduledDeletionAtSql = (account = "a"): string =>
  `${account}.deletion_requested_at+interval '${ACCOUNT_DELETION_GRACE_DAYS} days'`;

/** How long free-text deletion feedback is kept before its reason and user are purged. */
export const DELETION_FEEDBACK_RETENTION_DAYS = 30;

/**
 * When the signed-in user's own account is due to be deleted, or null if it is not pending deletion.
 * Only ever returned to the holder of that user's own session.
 */
export async function pendingDeletionScheduleFor(db: Pick<Pool, "query">, userId: string): Promise<string | null> {
  const result = await db.query<{ scheduled: Date }>(`SELECT ${scheduledDeletionAtSql("a")} AS scheduled
    FROM initial_account_bindings b JOIN creator_accounts a ON a.id=b.account_id
    WHERE b.user_id=$1 AND a.status='pending_deletion'`, [userId]);
  return result.rows[0]?.scheduled ? result.rows[0].scheduled.toISOString() : null;
}
