import type { Pool } from "pg";
import type { Actor } from "../application/actor";
import { authorizeOperation, AuthorizationError } from "../application/authorization";

export type CanonicalMusicPrincipal = { musicUserId: number; accountId: string; userId: string; sessionVersion: number };
export type ResolveCanonicalMusicPrincipal = (actor: Actor) => Promise<CanonicalMusicPrincipal>;

/** Mapping lookup only. Owner provisioning and socket credentials belong to 6.1. */
export function createCanonicalMusicPrincipalResolver(db: Pick<Pool, "query">): ResolveCanonicalMusicPrincipal {
  return async function resolveCanonicalMusicPrincipal(actor: Actor): Promise<CanonicalMusicPrincipal> {
  await authorizeOperation(db, actor, "music:owner", actor.accountId);
  if (actor.credential.kind !== "web-session") throw new AuthorizationError(403, "FORBIDDEN", "Music owner web session is required");
  const result = await db.query<{ music_user_id: number }>(
    "SELECT music_user_id FROM account_music_identity WHERE account_id=$1", [actor.accountId]);
  const musicUserId = result.rows[0]?.music_user_id;
  if (!Number.isSafeInteger(musicUserId) || musicUserId <= 0) throw new AuthorizationError(404, "NOT_FOUND", "Music account is unavailable");
  return { musicUserId, accountId: actor.accountId, userId: actor.userId,
    sessionVersion: actor.credential.sessionVersion };
  };
}
