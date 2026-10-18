import { createHash } from "node:crypto";
import type { Pool } from "pg";

/**
 * Legacy handle holds (launch plan Workstream A2).
 *
 * QR codes encode `/<handle>` and users print them. The relaunch starts on an empty database,
 * so each old handle is held for its original owner: claimable only by a signed-in Google user
 * whose VERIFIED email hashes to the value recorded from the old account. Only the digest is
 * stored, never the address, so the new database never holds the old user list readably.
 */

/** The one normalisation both the loader and the claim check use: trimmed, lower-cased, UTF-8. */
export function legacyHoldEmailDigest(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex");
}

const handleShape = /^[a-z][a-z0-9-]{2,29}$/;
/** The same shape `creator_accounts_handle_valid` enforces; anything else can never be claimed. */
export function isClaimableHandle(handle: string): boolean {
  return handleShape.test(handle) && !handle.includes("--") && !handle.endsWith("-");
}

/**
 * True when an unexpired hold stops this viewer claiming `handleKey`.
 *
 * `viewerUserId` null means an anonymous caller, whom a hold always stops. A viewer passes only
 * when their auth_user email is verified, they sign in with Google, and the digest matches. An
 * account that already owns the handle is never blocked by it, so re-saving a profile cannot fail.
 */
export async function legacyHandleHoldBlocks(db: Pick<Pool, "query">, handleKey: string,
  viewerUserId: string | null, viewerAccountId: string | null = null): Promise<boolean> {
  const hold = (await db.query<{ email_sha256: string; verified_email: string | null }>(
    `SELECT h.email_sha256,
            (SELECT u.email FROM auth_user u
              WHERE u.id=$2 AND u.email_verified
                AND EXISTS (SELECT 1 FROM auth_account p WHERE p.user_id=u.id AND p.provider_id='google')) AS verified_email
       FROM legacy_handle_holds h
      WHERE h.handle_key=$1 AND h.held_until>clock_timestamp()
        AND NOT EXISTS (SELECT 1 FROM creator_accounts a WHERE a.id=$3 AND a.handle_key=$1)`,
    [handleKey, viewerUserId, viewerAccountId])).rows[0];
  if (!hold) return false;
  if (hold.verified_email === null) return true;
  return legacyHoldEmailDigest(hold.verified_email) !== hold.email_sha256;
}

export type LegacyHoldRow = { handleKey: string; emailSha256: string };
export type ParsedLegacyHolds = { rows: LegacyHoldRow[]; skippedUnclaimableLines: number[]; duplicateLines: number[] };

/**
 * Parses the owner-held export: a header line `handle,email`, then one row per old account.
 *
 * Errors name a line number and never echo a value, so a failed run cannot print the list.
 * A handle the new stack cannot produce is skipped, not refused - no one can claim it anyway.
 * A malformed email, or one handle exported for two different emails, stops the whole load.
 */
export function parseLegacyHoldsCsv(text: string): ParsedLegacyHolds {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  while (lines.length && lines.at(-1)!.trim() === "") lines.pop();
  if (!lines.length || lines[0].replace(/[\s"]/g, "").toLowerCase() !== "handle,email") {
    throw new Error("Legacy hold CSV must start with the header handle,email");
  }
  const byHandle = new Map<string, LegacyHoldRow>();
  const skippedUnclaimableLines: number[] = [], duplicateLines: number[] = [];
  for (let index = 1; index < lines.length; index++) {
    const lineNumber = index + 1, line = lines[index];
    if (line.trim() === "") continue;
    const fields = line.split(",").map(field => field.trim().replace(/^"(.*)"$/, "$1").trim());
    if (fields.length !== 2 || fields.some(field => field.includes('"'))) throw new Error(`Legacy hold CSV line ${lineNumber} is not handle,email`);
    const handleKey = fields[0].toLowerCase(), email = fields[1].toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error(`Legacy hold CSV line ${lineNumber} has no valid email`);
    if (!isClaimableHandle(handleKey)) { skippedUnclaimableLines.push(lineNumber); continue; }
    const row = { handleKey, emailSha256: legacyHoldEmailDigest(email) };
    const previous = byHandle.get(handleKey);
    if (previous && previous.emailSha256 !== row.emailSha256) throw new Error(`Legacy hold CSV line ${lineNumber} repeats a handle for a different email`);
    if (previous) { duplicateLines.push(lineNumber); continue; }
    byHandle.set(handleKey, row);
  }
  return { rows: [...byHandle.values()], skippedUnclaimableLines, duplicateLines };
}

/** `--held-until` must be an explicit instant in the future; a past date would load holds that release at once. */
export function parseHeldUntil(value: string | undefined, now: Date = new Date()): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2}))?$/.test(value)) throw new Error("--held-until must be an ISO date such as 2027-04-30 or 2027-04-30T00:00:00Z");
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new Error("--held-until is not a real date");
  if (instant.getTime() <= now.getTime()) throw new Error("--held-until must be in the future");
  return instant;
}

export type LegacyHoldLoadResult = { inserted: number; updated: number; alreadyClaimed: number };

/** Upserts every hold in one transaction; a re-run with a new date extends the window. Counts only, no values. */
export async function applyLegacyHandleHolds(pool: Pick<Pool, "connect">, rows: readonly LegacyHoldRow[], heldUntil: Date): Promise<LegacyHoldLoadResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const written = await client.query<{ inserted: boolean }>(
      `INSERT INTO legacy_handle_holds(handle_key,email_sha256,held_until)
       SELECT handle_key,email_sha256,$3::timestamptz FROM unnest($1::text[],$2::text[]) AS input(handle_key,email_sha256)
       ON CONFLICT (handle_key) DO UPDATE SET email_sha256=EXCLUDED.email_sha256,held_until=EXCLUDED.held_until
       RETURNING (xmax = 0) AS inserted`,
      [rows.map(row => row.handleKey), rows.map(row => row.emailSha256), heldUntil.toISOString()]);
    // An account already holding a held handle was claimed before the holds existed. Reported
    // as a count so the operator can investigate; the hold does not displace that account.
    const claimed = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM creator_accounts WHERE handle_key = ANY($1::text[])", [rows.map(row => row.handleKey)]);
    await client.query("COMMIT");
    const inserted = written.rows.filter(row => row.inserted).length;
    return { inserted, updated: written.rows.length - inserted, alreadyClaimed: Number(claimed.rows[0]?.count ?? 0) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
