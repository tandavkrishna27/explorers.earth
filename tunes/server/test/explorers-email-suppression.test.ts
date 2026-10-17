import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isStorableEmail,
  mintUnsubscribeToken,
  normalizeEmail,
  readUnsubscribeToken,
} from "../application/emailSuppression";

/**
 * Email suppression, decision D2 (2026-10-08). Token authority and the normalisation rule.
 *
 * The database behaviour (the unique index, the CHECKs, ON CONFLICT DO NOTHING) is proved
 * against PostgreSQL in the migration integration suite; this file covers the parts that
 * need no database and are the parts an attacker touches.
 */

const SECRET = "test-secret-not-a-real-one";
const OTHER_SECRET = "a-different-secret";

describe("unsubscribe token authority", () => {
  it("round-trips the address it was minted for", () => {
    const token = mintUnsubscribeToken(SECRET, "Reader@Example.COM");
    expect(readUnsubscribeToken(SECRET, token)).toBe("reader@example.com");
  });

  it("normalises before signing, so one mailbox has one token", () => {
    // Otherwise two spellings produce two tokens and the suppression row written by one
    // would not match the lookup done for the other.
    expect(mintUnsubscribeToken(SECRET, "  Reader@Example.com "))
      .toBe(mintUnsubscribeToken(SECRET, "reader@example.com"));
  });

  it("refuses a token signed with a different secret", () => {
    // This is the whole point: without the key nobody can unsubscribe somebody else.
    const forged = mintUnsubscribeToken(OTHER_SECRET, "victim@example.com");
    expect(readUnsubscribeToken(SECRET, forged)).toBeNull();
  });

  it("refuses a token whose address was swapped but whose tag was kept", () => {
    const token = mintUnsubscribeToken(SECRET, "reader@example.com");
    const tag = token.slice(token.indexOf(".") + 1);
    const swapped = `${Buffer.from("victim@example.com", "utf8").toString("base64url")}.${tag}`;
    expect(readUnsubscribeToken(SECRET, swapped)).toBeNull();
  });

  it("refuses a tampered tag", () => {
    const token = mintUnsubscribeToken(SECRET, "reader@example.com");
    const broken = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(readUnsubscribeToken(SECRET, broken)).toBeNull();
  });

  it("refuses malformed, absent and oversized tokens without throwing", () => {
    for (const token of [
      undefined, null, 27, {}, [], "", ".", "a.", ".b", "no-separator",
      "two.separators.here", "!!!.###", "a".repeat(2000),
      Buffer.from("not-an-email", "utf8").toString("base64url") + ".tag",
    ]) expect(readUnsubscribeToken(SECRET, token as unknown)).toBeNull();
  });

  it("produces a URL-safe token", () => {
    // It travels in a query string in an email; +, / and = would be mangled or escaped.
    for (const address of ["a+tag@example.com", "someone.very.long.name@subdomain.example.co.uk"]) {
      expect(mintUnsubscribeToken(SECRET, address)).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    }
  });

  it("has no expiry, deliberately", () => {
    // An unsubscribe link in a two-year-old email must still work - that is the point of
    // it. This pins the decision: if an expiry is ever added, this fails and whoever adds
    // it has to argue for making the oldest mail the hardest to escape.
    const source = readFileSync(resolve(__dirname, "../application/emailSuppression.ts"), "utf8");
    expect(source).toContain("Deliberately no expiry");
    const token = mintUnsubscribeToken(SECRET, "reader@example.com");
    expect(readUnsubscribeToken(SECRET, token)).toBe("reader@example.com");
  });
});

describe("suppression address normalisation", () => {
  it("lowercases and trims, matching the migration's CHECK", () => {
    expect(normalizeEmail("  Reader@Example.COM  ")).toBe("reader@example.com");
  });

  it("accepts what the column accepts", () => {
    for (const address of [
      "a@b.c", "reader@example.com", "a+tag@example.co.uk", "x".repeat(300) + "@e.co",
    ]) expect(isStorableEmail(address), address).toBe(true);
  });

  it("refuses what the migration's CHECKs would refuse", () => {
    for (const address of [
      "", "a", "ab", "noatsign", "@example.com", "reader@", "two@at@signs.com",
      "Reader@Example.com",          // not normalised: would never match the lookup
      " reader@example.com",         // ditto
      "reader@example.com ",
      "a".repeat(320) + "@e.co",     // over the length bound
      "reader example@e.co", "reader<@e.co", 'reader"@e.co', "reader,@e.co", "reader;@e.co",
    ]) expect(isStorableEmail(address), JSON.stringify(address)).toBe(false);
  });

  it("agrees with the shared normalisation helper the storage layer uses", async () => {
    // Two copies of a normalisation rule is how they come to disagree about what one
    // address is. This asserts the two entry points produce the same answer.
    const { normalizeSuppressionEmail } = await import("../../shared/schema");
    for (const address of ["  Reader@Example.COM ", "a@b.c", "A+Tag@Example.Co.UK"]) {
      expect(normalizeSuppressionEmail(address)).toBe(normalizeEmail(address));
    }
  });
});

describe("migration 0051 storage rules", () => {
  const sql = readFileSync(
    resolve(__dirname, "../../migrations/0051_explorers_launch_controls.sql"), "utf8",
  );

  it("enforces the normalisation in the database, not only in code", () => {
    // Without this CHECK the unique index only enforces uniqueness of spelling.
    expect(sql).toContain("CHECK(email = lower(btrim(email)))");
  });

  it("makes one address one row", () => {
    expect(sql).toContain("CREATE UNIQUE INDEX email_suppressions_email_uq");
  });

  it("grants the runtime no way to un-suppress an address", () => {
    // SELECT and INSERT only. Un-suppressing is the one operation here that can cause mail
    // to reach somebody who asked for none.
    expect(sql).toContain("GRANT SELECT,INSERT ON public.email_suppressions TO music_runtime");
    expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*email_suppressions/);
    expect(sql).not.toMatch(/GRANT[^;]*UPDATE[^;]*email_suppressions/);
  });

  it("records why an address was suppressed", () => {
    expect(sql).toContain("reason text NOT NULL CHECK(reason IN ('unsubscribe','bounce','complaint','manual'))");
  });
});
