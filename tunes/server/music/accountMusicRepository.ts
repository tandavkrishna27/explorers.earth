import { createHash, randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Actor } from "../application/actor";
import { authorizeOperation, AuthorizationError } from "../application/authorization";

/**
 * Ticket 6.1, under ADR-007. Provisions the Music venue profile owned by a canonical
 * account. A users row is a venue record, never an identity: nothing authenticates
 * against it, and the canonical account is the only principal.
 *
 * Provisioning is keyed on the account, not on any Strapi identifier, and is made
 * idempotent by the primary key on account_music_identity. A concurrent caller that
 * loses the mapping insert discards its own venue row and reads the winner's, so two
 * callers cannot produce two venues for one account.
 */
export type EnsureMusicAccountResult = {
  musicUserId: number;
  accountId: string;
  /** False when an existing mapping was reused, including after losing a race. */
  provisioned: boolean;
};

export type AccountMusicRepository = {
  ensureMusicAccount(actor: Actor): Promise<EnsureMusicAccountResult>;
};

/** Deterministic, so a retry derives the same name and cannot create a second venue. */
function internalUsernameFor(accountId: string): string {
  return `explorer-${createHash("sha256").update(accountId).digest("hex").slice(0, 24)}`;
}

/**
 * The venue's displayed name, derived from the account rather than stored twice.
 *
 * Extracted because it now has two callers - provisioning and convergence - and two inline
 * copies of a fallback chain is how the two paths come to disagree about what a venue with
 * no display name is called.
 */
function venueNameFor(account: { display_name: string | null; handle: string | null } | undefined): string {
  return account?.display_name || account?.handle || "Explorers Music";
}

function readMusicUserId(row: { music_user_id: number } | undefined): number | undefined {
  const musicUserId = row?.music_user_id;
  return Number.isSafeInteger(musicUserId) && Number(musicUserId) > 0 ? Number(musicUserId) : undefined;
}

export function createAccountMusicRepository(
  pool: Pick<Pool, "query" | "connect">,
): AccountMusicRepository {
  async function existingMapping(db: Pick<Pool, "query">, accountId: string): Promise<number | undefined> {
    const found = await db.query<{ music_user_id: number }>(
      "SELECT music_user_id FROM account_music_identity WHERE account_id=$1", [accountId]);
    return readMusicUserId(found.rows[0]);
  }

  async function provision(client: PoolClient, actor: Actor): Promise<EnsureMusicAccountResult> {
    await client.query("BEGIN");
    try {
      // Lock the account row so a concurrent caller for the same account serialises
      // here rather than racing to the mapping insert.
      const account = await client.query<{ display_name: string | null; handle: string | null }>(
        "SELECT display_name,handle FROM creator_accounts WHERE id=$1 FOR UPDATE", [actor.accountId]);
      if (account.rowCount === 0) throw new AuthorizationError(404, "NOT_FOUND", "Music account is unavailable");

      const alreadyMapped = await existingMapping(client, actor.accountId);
      if (alreadyMapped !== undefined) {
        await client.query("COMMIT");
        return { musicUserId: alreadyMapped, accountId: actor.accountId, provisioned: false };
      }

      const guestSecret = randomBytes(32).toString("base64url");
      // password and both Strapi document ids stay NULL. ADR-007 decision 4 forbids
      // populating a password to satisfy a constraint, and migration 0039 made that
      // possible; the legacy path stored random filler here, which this does not.
      // lifecycle_operation_id is left unset too. Migration 0040 relaxed it and keeps a
      // canonical venue out of the Strapi-keyed lifecycle operations table, so there is
      // no operation for it to reference; its foreign key would reject any value this
      // path could invent.
      const venue = await client.query<{ id: number }>(
        `INSERT INTO users(username,password,email,guest_url,venue_name,
           strapi_user_document_id,strapi_account_document_id,guest_capability_hash)
         VALUES ($1,NULL,NULL,$2,$3,NULL,NULL,$4) RETURNING id`,
        [
          internalUsernameFor(actor.accountId),
          randomBytes(24).toString("base64url"),
          venueNameFor(account.rows[0]),
          createHash("sha256").update(guestSecret).digest("hex"),
        ]);
      const musicUserId = venue.rows[0]?.id;
      if (!Number.isSafeInteger(musicUserId) || Number(musicUserId) <= 0) {
        // Not an AuthorizationError: the actor is permitted, the insert misbehaved.
        // AuthorizationError carries only 401/403/404/422/503 and four refusal codes.
        throw new Error("Music venue profile could not be created");
      }

      // The primary key is the idempotency key. A loser inserts nothing and is told so.
      const mapped = await client.query<{ account_id: string }>(
        `INSERT INTO account_music_identity(account_id,music_user_id) VALUES ($1,$2)
         ON CONFLICT (account_id) DO NOTHING RETURNING account_id`,
        [actor.accountId, musicUserId]);
      if (mapped.rowCount === 0) {
        // Another transaction provisioned this account first. Discard our venue row
        // rather than leaving it unowned, then read the winner's mapping.
        await client.query("ROLLBACK");
        const winner = await existingMapping(pool, actor.accountId);
        if (winner === undefined) {
          // A lost race whose winner we then cannot read is transient, not a refusal.
          throw new Error("Music account provisioning conflicted");
        }
        return { musicUserId: winner, accountId: actor.accountId, provisioned: false };
      }

      // The deferred ownership triggers from 0039 validate here: a venue row with no
      // Strapi document id and no mapping is rejected at COMMIT, not silently kept.
      await client.query("COMMIT");
      return { musicUserId: Number(musicUserId), accountId: actor.accountId, provisioned: true };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }

  /**
   * Bring an already-provisioned venue's name back in line with its account.
   *
   * venue_name was written once, at provision, and nothing updated it afterwards: a creator
   * who renamed their profile kept the old name on the Music surface indefinitely. The
   * provisioning path returns early for a mapped account, which is where the name stopped
   * following the account.
   *
   * Converging here rather than from the account update path is deliberate. This is the one
   * place that already holds the mapping, and it is reached on every identity refresh -
   * including the one the profile save triggers - so the explorers account write does not
   * have to reach into a Music table to keep a display string current.
   *
   * `IS DISTINCT FROM` makes the ordinary refresh a no-op rather than a write, and handles
   * a NULL venue_name without a second branch. A failure is not swallowed: this is a
   * primary-key update on a row the caller owns, so if it cannot run then neither could the
   * mapping read above, and a silent catch would turn a database outage into a name that is
   * quietly wrong.
   */
  async function convergeVenueName(accountId: string, musicUserId: number): Promise<void> {
    const account = await pool.query<{ display_name: string | null; handle: string | null }>(
      "SELECT display_name,handle FROM creator_accounts WHERE id=$1", [accountId]);
    if (account.rowCount === 0) return;
    await pool.query("UPDATE users SET venue_name=$2 WHERE id=$1 AND venue_name IS DISTINCT FROM $2",
      [musicUserId, venueNameFor(account.rows[0])]);
  }

  return {
    async ensureMusicAccount(actor: Actor): Promise<EnsureMusicAccountResult> {
      await authorizeOperation(pool, actor, "music:owner", actor.accountId);
      if (actor.credential.kind !== "web-session") {
        // An OAuth grant cannot acquire web-session authority by any route.
        throw new AuthorizationError(403, "FORBIDDEN", "Music owner web session is required");
      }

      const existing = await existingMapping(pool, actor.accountId);
      if (existing !== undefined) {
        await convergeVenueName(actor.accountId, existing);
        return { musicUserId: existing, accountId: actor.accountId, provisioned: false };
      }

      const client = await pool.connect();
      try {
        return await provision(client, actor);
      } finally {
        client.release();
      }
    },
  };
}
