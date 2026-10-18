import { describe, expect, it } from "vitest";
import { parseSuppressPersonArguments } from "../../../scripts/suppress-person";

const id = "0b5f7a0e-3a51-4e0b-9a7c-2f4c1c3b9d11";

describe("suppress-person operator surface", () => {
  it("parses show, suppress and restore with an explicit reason and operator", () => {
    expect(parseSuppressPersonArguments(["--show", id])).toEqual({ mode: "show", entityId: id });
    expect(parseSuppressPersonArguments(["--suppress", id, "--reason", "Asked to be removed (ticket 42)", "--operator", "Ops Reviewer"]))
      .toEqual({ mode: "apply", entityId: id, action: "suppress", reason: "Asked to be removed (ticket 42)", operator: "Ops Reviewer" });
    expect(parseSuppressPersonArguments(["--restore", id.toUpperCase(), "--operator", "Ops", "--reason", "Request withdrawn"]))
      .toEqual({ mode: "apply", entityId: id, action: "restore", reason: "Request withdrawn", operator: "Ops" });
  });

  it("refuses an unattributed or malformed takedown before connecting", () => {
    // Break caught: a takedown with no reason or operator is exactly the unaudited
    // hand-written SQL this command replaces.
    for (const argv of [[], ["--suppress", id], ["--suppress", id, "--reason", "x"], ["--suppress", "not-a-uuid", "--reason", "x", "--operator", "o"],
      ["--suppress", id, "--reason", " ", "--operator", "o"], ["--suppress", id, "--reason", "x", "--operator", "a\nb"],
      ["--suppress", id, "--reason", "x", "--reason", "y"], ["--delete", id, "--reason", "x", "--operator", "o"], ["--show"]]) {
      expect(() => parseSuppressPersonArguments(argv), argv.join(" ")).toThrow(/Usage/);
    }
  });
});

describe("suppress-person bundle isolation", () => {
  it("refuses the runtime role and does not import another command's entry point", async () => {
    const { assertOperatorMigratorPrincipal } = await import("../../../scripts/operator-migrator-principal");
    await expect(assertOperatorMigratorPrincipal({ MUSIC_DATABASE_USER: "music_runtime", MUSIC_RUNTIME_DATABASE_USER: "music_app" }, "person suppression"))
      .rejects.toThrow(/person suppression must run as the database migrator/);
    // esbuild inlines an imported module's import.meta.url main guard into this bundle,
    // so importing apply-reviewed-taxonomy would run the taxonomy apply as well.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../../../scripts/suppress-person.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from "\.\/apply-reviewed-taxonomy"/);
  });
});
