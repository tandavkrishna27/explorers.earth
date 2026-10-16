import type { Pool } from "pg";
import type { Actor } from "./actor";

export class AuthorizationError extends Error {
  constructor(readonly status: 401 | 403 | 404 | 422 | 503, readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "INVALID_INPUT", message: string) {
    super(message);
  }
}

type Queryable = Pick<Pool, "query">;

/** Recheck the membership and lifecycle at the operation boundary, including MCP callers. */
export async function authorizeOperation(db: Queryable, actor: Actor, operation: string, targetAccountId: string): Promise<void> {
  if (!actor || actor.role !== "owner" || !actor.userId || !actor.accountId) {
    throw new AuthorizationError(401, "UNAUTHENTICATED", "Sign in is required");
  }
  if (actor.accountId !== targetAccountId) throw new AuthorizationError(404, "NOT_FOUND", "Resource is unavailable");
  if (actor.credential.kind === "oauth" && !actor.credential.scopes.includes(operation)) {
    throw new AuthorizationError(403, "FORBIDDEN", "Operation scope is required");
  }
  const current = await db.query<{ status: string; role: string; session_version: string; blocked_at: Date | null }>(
    `SELECT a.status,m.role,s.session_version::text,s.blocked_at
       FROM account_memberships m
       JOIN creator_accounts a ON a.id=m.account_id
       JOIN user_security_state s ON s.user_id=m.user_id
      WHERE m.account_id=$1 AND m.user_id=$2`, [actor.accountId, actor.userId]);
  const state = current.rows[0];
  if (!state || state.role !== "owner") throw new AuthorizationError(404, "NOT_FOUND", "Resource is unavailable");
  if (state.blocked_at || state.status !== "active") throw new AuthorizationError(403, "FORBIDDEN", "Account access is unavailable");
  if (actor.credential.kind === "web-session" && Number(state.session_version) !== actor.credential.sessionVersion) {
    throw new AuthorizationError(401, "UNAUTHENTICATED", "Session has expired");
  }
  if (actor.credential.kind === "web-session") {
    const session = await db.query<{ valid: boolean }>(`SELECT EXISTS (
      SELECT 1 FROM auth_session WHERE id=$1 AND user_id=$2
        AND session_version=$3 AND expires_at>(clock_timestamp() AT TIME ZONE 'UTC')
    ) AS valid`, [actor.credential.sessionId, actor.userId, actor.credential.sessionVersion]);
    if (!session.rows[0]?.valid) throw new AuthorizationError(401, "UNAUTHENTICATED", "Session has expired");
  }
}
