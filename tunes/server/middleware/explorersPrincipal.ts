import { fromNodeHeaders } from "#auth-runtime";
import type { Request, Response, NextFunction } from "express";
import type { Pool } from "pg";
import type { ExplorersAuth } from "../auth/betterAuth";
import type { Actor } from "../application/actor";
import { authorizeOperation, AuthorizationError } from "../application/authorization";
import { requestIdFor } from "../security-containment";

export async function requireActor(request: Request, auth: ExplorersAuth, db: Pick<Pool, "query">): Promise<Actor> {
  if (request.headers.authorization || request.headers["x-account-id"] || request.headers["x-user-id"]) {
    throw new AuthorizationError(401, "UNAUTHENTICATED", "Ambiguous credentials");
  }
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!session?.user?.id || !session.session?.id) throw new AuthorizationError(401, "UNAUTHENTICATED", "Sign in is required");
  const result = await db.query<{ account_id: string; session_version: string; current_version: string; status: string; blocked_at: Date | null }>(
    `SELECT b.account_id,s.session_version::text,security.session_version::text AS current_version,
            a.status,security.blocked_at
       FROM auth_session s
       JOIN user_security_state security ON security.user_id=s.user_id
       JOIN initial_account_bindings b ON b.user_id=s.user_id
       JOIN creator_accounts a ON a.id=b.account_id
       JOIN account_memberships m ON m.account_id=b.account_id AND m.user_id=s.user_id AND m.role='owner'
      WHERE s.id=$1 AND s.user_id=$2 AND s.expires_at>(clock_timestamp() AT TIME ZONE 'UTC')
        AND EXISTS (SELECT 1 FROM auth_account p WHERE p.user_id=s.user_id AND p.provider_id='google')`,
    [session.session.id, session.user.id]);
  const state = result.rows[0];
  if (!state) throw new AuthorizationError(401, "UNAUTHENTICATED", "Session is unavailable");
  if (state.blocked_at || state.status !== "active") throw new AuthorizationError(403, "FORBIDDEN", "Account access is unavailable");
  if (state.session_version !== state.current_version) throw new AuthorizationError(401, "UNAUTHENTICATED", "Session has expired");
  const actor: Actor = { userId: session.user.id, accountId: state.account_id, role: "owner",
    credential: { kind: "web-session", sessionId: session.session.id, sessionVersion: Number(state.session_version) } };
  await authorizeOperation(db, actor, "profile:read", actor.accountId);
  return actor;
}

export function sendActorError(request: Request, response: Response, error: unknown): void {
  const failure = error instanceof AuthorizationError ? error : new AuthorizationError(503, "FORBIDDEN", "Account service is unavailable");
  const requestId = requestIdFor(request);
  response.setHeader("X-Request-Id", requestId);
  response.status(failure.status).json({ error: { code: failure.code, message: failure.message, requestId } });
}

export function explorersPrincipal(auth: ExplorersAuth, db: Pick<Pool, "query">) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try { request.explorersActor = await requireActor(request, auth, db); next(); }
    catch (error) { sendActorError(request, response, error); }
  };
}
