import { describe, expect, it } from "vitest";
import { assertMigratorPrincipal, parseTaxonomyApplyArguments, resolveTaxonomyApplyPlan } from "../../../scripts/apply-reviewed-taxonomy";

describe("reviewed taxonomy apply surface", () => {
  it("loads exactly the reviewed Places vocabulary", () => {
    // Break caught: the loader is pointed at a different directory or an edited
    // fixture and a partial vocabulary reaches production.
    const plan = resolveTaxonomyApplyPlan();
    expect(plan.places.category).toBe("places");
    expect(plan.places.terms).toHaveLength(335);
    expect(plan.places.terms.filter((term) => term.parentId === null)).toHaveLength(25);
    expect(plan.places.sourceMappings).toHaveLength(335);
  });

  it("does not apply the empty People vocabulary", () => {
    // Break caught: people-import.json has ZERO terms. Flipping that catalog to
    // CONFIGURED is worse than UNCONFIGURED, and 0053's CHECK forbids version>0
    // with no default_locale, so it would fail mid-transaction anyway.
    const plan = resolveTaxonomyApplyPlan();
    expect(plan.people.terms).toHaveLength(0);
    expect(plan.appliesPeople).toBe(false);
  });

  it("refuses to run as the runtime role", async () => {
    // Break caught: wired with the runtime login, the apply fails on a permission
    // mid-transaction. The refusal must come from the principal check itself, before
    // any host, name or credential file is consulted.
    await expect(assertMigratorPrincipal({ MUSIC_DATABASE_USER: "music_app",
      MUSIC_RUNTIME_DATABASE_USER: "music_app" })).rejects.toThrow(/must run as the database migrator/);
    await expect(assertMigratorPrincipal({ MUSIC_DATABASE_USER: "music_runtime",
      MUSIC_RUNTIME_DATABASE_USER: "music_app" })).rejects.toThrow(/must run as the database migrator/);
    await expect(assertMigratorPrincipal({ MUSIC_DATABASE_USER: "music_migrator" }))
      .rejects.toThrow(/MUSIC_RUNTIME_DATABASE_USER is required/);
  });

  it("requires an explicit mode and a reviewed operator for apply", () => {
    expect(parseTaxonomyApplyArguments(["--dry-run"])).toEqual({ mode: "dry-run" });
    expect(parseTaxonomyApplyArguments(["--apply", "--reviewed-by", "Ops Reviewer"]))
      .toEqual({ mode: "apply", reviewedBy: "Ops Reviewer" });
    for (const argv of [[], ["--apply"], ["--apply", "--reviewed-by"], ["--apply", "--reviewed-by", " "],
      ["--dry-run", "--apply"], ["--dry-run", "--reviewed-by", "x"], ["--apply", "--reviewed-by", "a\nb"], ["--people"]]) {
      expect(() => parseTaxonomyApplyArguments(argv), argv.join(" ")).toThrow(/Usage/);
    }
  });
});
