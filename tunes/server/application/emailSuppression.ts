import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";

/**
 * Email suppression. Decision D2, 2026-10-08.
 *
 * Two things live here: the unsubscribe token, and the suppression writes that honour it.
 *
 * ## Why a signed token rather than a login
 *
 * An unsubscribe link is clicked from a mail client, often on a different device, by
 * somebody who may not have an account at all. Requiring a session would mean the people
 * most likely to want out are the least able to get out, and bulk-sender rules expect one
 * click to be enough.
 *
 * So the link carries its own authority: the address plus an HMAC over it, under a key
 * derived from the server secret and bound to this purpose. That means:
 *
 *  - It cannot be forged. Without the key an attacker cannot produce a tag for an address,
 *    so nobody can unsubscribe somebody else by guessing a URL.
 *  - It cannot be replayed into something else. The key is derived with its own purpose
 *    label, exactly as the public-content cursor key is, so a token minted here is not a
 *    valid anything anywhere else, and a secret rotation invalidates only these.
 *  - It carries no session and grants nothing. The only thing it authorises is adding one
 *    address to a do-not-contact list, which is the one direction that is safe to get
 *    wrong: a spurious unsubscribe costs a newsletter, a spurious failure costs compliance.
 *
 * Deliberately no expiry. An unsubscribe link in a two-year-old email must still work -
 * that is the whole point of it - and an expiring token would turn the oldest mail, which
 * is the most likely to be unwanted, into mail that cannot be escaped.
 *
 * ## Why the comparison is constant-time
 *
 * A byte-by-byte early return would let a caller recover a valid tag for an address they
 * choose. `timingSafeEqual` on equal-length buffers closes that.
 */

const TOKEN_PURPOSE = "explorers-email-unsubscribe/v1\0";

/** The one normalisation rule. Migration 0051 enforces the same shape as a CHECK. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * A plausible address, checked only as far as the column allows. This is not an attempt to
 * validate email syntax - RFC 5322 is not worth re-implementing here, and the provider is
 * the real authority - it is the same bound the migration's CHECKs enforce, applied before
 * the database so a bad request is a 400 rather than a constraint violation.
 */
export function isStorableEmail(email: string): boolean {
  if (email !== normalizeEmail(email)) return false;
  if (email.length < 3 || email.length > 320) return false;
  const at = email.indexOf("@");
  return at > 0 && at < email.length - 1 && email.indexOf("@", at + 1) === -1
    && !/[\s,;<>"\\]/.test(email);
}

function tokenKey(secret: string): Buffer {
  return createHash("sha256").update(TOKEN_PURPOSE).update(secret).digest();
}

function tag(secret: string, email: string): string {
  return createHmac("sha256", tokenKey(secret)).update(email, "utf8").digest("base64url");
}

/**
 * The token that goes in an email. `<base64url(address)>.<base64url(hmac)>` - the address
 * travels in the token because the click has nothing else to identify it by, and encoding
 * it keeps the URL safe without needing a lookup table of outstanding links.
 */
export function mintUnsubscribeToken(secret: string, rawEmail: string): string {
  const email = normalizeEmail(rawEmail);
  return `${Buffer.from(email, "utf8").toString("base64url")}.${tag(secret, email)}`;
}

/**
 * The address a token attests to, or null. Null covers every failure the same way on
 * purpose: a caller learns only that the token is not valid, never which part was wrong.
 */
export function readUnsubscribeToken(secret: string, token: unknown): string | null {
  if (typeof token !== "string" || token.length < 3 || token.length > 1024) return null;
  const separator = token.indexOf(".");
  if (separator <= 0 || separator === token.length - 1) return null;
  if (token.indexOf(".", separator + 1) !== -1) return null;

  let email: string;
  try {
    email = Buffer.from(token.slice(0, separator), "base64url").toString("utf8");
  } catch { return null; }
  if (!isStorableEmail(email)) return null;

  const presented = Buffer.from(token.slice(separator + 1), "utf8");
  const expected = Buffer.from(tag(secret, email), "utf8");
  if (presented.length !== expected.length) return null;
  return timingSafeEqual(presented, expected) ? email : null;
}

export type SuppressionReason = "unsubscribe" | "bounce" | "complaint" | "manual";

/**
 * Record a suppression. Idempotent by the table's unique index, so clicking an unsubscribe
 * link twice is a no-op rather than an error the person has to interpret.
 *
 * Returns whether this call was the one that created the row - useful for logging, and for
 * telling "you are now unsubscribed" from "you already were" without a second query.
 */
export async function suppressEmail(
  pool: Pool,
  input: { email: string; reason: SuppressionReason; source?: string | null },
): Promise<{ suppressed: true; alreadySuppressed: boolean }> {
  const email = normalizeEmail(input.email);
  if (!isStorableEmail(email)) throw new Error("EMAIL_NOT_STORABLE");
  const result = await pool.query(
    `INSERT INTO email_suppressions(email,reason,source) VALUES ($1,$2,$3)
       ON CONFLICT (email) DO NOTHING RETURNING id`,
    [email, input.reason, input.source ?? null],
  );
  return { suppressed: true, alreadySuppressed: result.rowCount === 0 };
}

/**
 * Whether an address must not be contacted.
 *
 * Throws rather than returning false when the lookup itself fails. The caller is about to
 * decide whether to send, and "the database was unreachable" is not evidence that somebody
 * consented - failing closed is the only answer that cannot violate an opt-out.
 */
export async function isEmailSuppressed(pool: Pool, rawEmail: string): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  if (!isStorableEmail(email)) return false;
  const result = await pool.query("SELECT 1 FROM email_suppressions WHERE email=$1 LIMIT 1", [email]);
  return (result.rowCount ?? 0) > 0;
}
