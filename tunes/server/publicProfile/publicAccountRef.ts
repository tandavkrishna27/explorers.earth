import { createHash } from "node:crypto";
import { z } from "zod/v3";

/**
 * A stable, non-reversible stand-in for an account id wherever a public artifact must bind to
 * the account (continuation cursors are signed but readable base64). The internal account UUID
 * never leaves the server on an anonymous read (SEC-03); a SHA-256 of a random UUID cannot be
 * inverted, and the domain prefix keeps it from matching any other hash of the same id.
 */
export const publicAccountRef = (accountId: string): string =>
  createHash("sha256").update("explorers-public-account-ref/v1\n").update(accountId).digest("base64url");

export const publicAccountRefSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/**
 * Drops internal account ids from an anonymous public payload: the profile shell's own
 * `documentId` and every nested `account.documentId`. The handle (`username`) stays as the
 * public identifier. Returns a copy; the input (which callers use for authority checks) is untouched.
 */
export function withoutAccountIds<T>(value: T, shell = false): T {
  const walk = (node: unknown, key?: string): unknown => {
    if (Array.isArray(node)) return node.map((item) => walk(item));
    if (!node || typeof node !== "object") return node;
    const proto = Object.getPrototypeOf(node);
    if (proto !== Object.prototype && proto !== null) return node; // Date and friends serialize themselves
    const out: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(node)) {
      if (key === "account" && childKey === "documentId") continue;
      out[childKey] = walk(child, childKey);
    }
    return out;
  };
  const copy = walk(value) as Record<string, unknown>;
  if (shell && copy && typeof copy === "object" && !Array.isArray(copy)) delete copy.documentId;
  return copy as T;
}
