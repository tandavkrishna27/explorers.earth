import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { legacyHoldEmailDigest, parseHeldUntil, parseLegacyHoldsCsv } from "../application/legacyHandleHolds";
import { parseLoaderArguments } from "../deployment/run-legacy-handle-holds";

// Synthetic rows only. The real export is owner-held and never enters the repository.
const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

describe("legacy handle hold loader input", () => {
  it("hashes the trimmed, lower-cased email and never keeps the address", () => {
    const parsed = parseLegacyHoldsCsv("handle,email\r\nAlice-Maps, Alice@Example.Invalid \n");
    expect(parsed.rows).toEqual([{ handleKey: "alice-maps", emailSha256: sha("alice@example.invalid") }]);
    expect(JSON.stringify(parsed)).not.toContain("example.invalid");
    expect(legacyHoldEmailDigest("  ALICE@example.INVALID")).toBe(sha("alice@example.invalid"));
  });

  it("accepts a BOM, quoted fields and blank lines", () => {
    const parsed = parseLegacyHoldsCsv('﻿"handle","email"\n\n"bob-food","bob@example.invalid"\n\n');
    expect(parsed.rows.map(row => row.handleKey)).toEqual(["bob-food"]);
  });

  it("skips handles the new stack can never produce, by line number", () => {
    const parsed = parseLegacyHoldsCsv("handle,email\nok-handle,a@example.invalid\nab,b@example.invalid\nhas_underscore,c@example.invalid\n9lives,d@example.invalid\n");
    expect(parsed.rows.map(row => row.handleKey)).toEqual(["ok-handle"]);
    expect(parsed.skippedUnclaimableLines).toEqual([3, 4, 5]);
  });

  it("collapses an exact duplicate but refuses one handle exported for two emails", () => {
    expect(parseLegacyHoldsCsv("handle,email\ncarol,c@example.invalid\nCarol,C@example.invalid\n").duplicateLines).toEqual([3]);
    expect(() => parseLegacyHoldsCsv("handle,email\ncarol,c@example.invalid\ncarol,other@example.invalid\n"))
      .toThrow("line 3 repeats a handle for a different email");
  });

  it("fails closed on a wrong header, wrong arity or a malformed email without echoing the value", () => {
    expect(() => parseLegacyHoldsCsv("username,email\nx,y@z.invalid")).toThrow("header handle,email");
    expect(() => parseLegacyHoldsCsv("handle,email\ndave,d@example.invalid,extra")).toThrow("line 2 is not handle,email");
    let message = "";
    try { parseLegacyHoldsCsv("handle,email\ndave,secret-not-an-email"); } catch (error) { message = (error as Error).message; }
    expect(message).toBe("Legacy hold CSV line 2 has no valid email");
  });

  it("takes the CSV path and date at run time, and refuses anything else", () => {
    expect(parseLoaderArguments(["--csv", "/run/holds/handles.csv", "--held-until", "2027-04-30", "--dry-run"]))
      .toEqual({ csv: "/run/holds/handles.csv", heldUntil: "2027-04-30", dryRun: true });
    expect(() => parseLoaderArguments(["--held-until", "2027-04-30"])).toThrow("--csv <path> is required");
    expect(() => parseLoaderArguments(["--csv"])).toThrow("Unsupported argument at position 1");
    expect(() => parseLoaderArguments(["--csv", "a.csv", "--apply"])).toThrow("Unsupported argument at position 3");
  });

  it("requires an explicit future --held-until", () => {
    const now = new Date("2026-10-18T00:00:00Z");
    expect(parseHeldUntil("2027-04-30", now).toISOString()).toBe("2027-04-30T00:00:00.000Z");
    expect(parseHeldUntil("2027-04-30T12:00:00+05:30", now).toISOString()).toBe("2027-04-30T06:30:00.000Z");
    for (const bad of [undefined, "", "next year", "2026-10-17", "2027-02-30T00:00:00Z1"]) expect(() => parseHeldUntil(bad, now)).toThrow();
  });
});
