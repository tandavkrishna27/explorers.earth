import { describe, expect, it } from "vitest";
import { assertMigratorPrincipal, parseTaxonomyApplyArguments, resolveTaxonomyApplyInput, resolveTaxonomyApplyPlan } from "../../../scripts/apply-reviewed-taxonomy";

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

  it("applies the reviewed People sectors, not the empty Strapi People import", () => {
    // Break caught: --category people resolves to the empty Strapi file, or the
    // reviewed sector list is edited without re-pinning its hashes.
    const people = resolveTaxonomyApplyInput("people");
    expect(people.category).toBe("people");
    expect(people.terms).toHaveLength(20);
    expect(people.terms.every((term) => term.parentId === null && term.active)).toBe(true);
    expect([...people.terms].sort((a, b) => a.position - b.position).map((term) => term.labels.en)).toEqual(["Travel", "Food & Drink",
      "Tech", "Design", "Music", "Film & TV", "Books & Writing", "Sports & Fitness", "Fashion", "Photography", "Education", "Business",
      "Science", "Health & Wellness", "Gaming", "Art", "Comedy", "News & Politics", "Parenting", "Other"]);
    expect(resolveTaxonomyApplyInput("places").terms).toHaveLength(335);
  });

  it("does not apply the empty Strapi People vocabulary", () => {
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
    expect(parseTaxonomyApplyArguments(["--dry-run"])).toEqual({ mode: "dry-run", category: "places" });
    expect(parseTaxonomyApplyArguments(["--apply", "--reviewed-by", "Ops Reviewer"]))
      .toEqual({ mode: "apply", reviewedBy: "Ops Reviewer", category: "places" });
    expect(parseTaxonomyApplyArguments(["--category", "people", "--dry-run"])).toEqual({ mode: "dry-run", category: "people" });
    expect(parseTaxonomyApplyArguments(["--category", "people", "--apply", "--reviewed-by", "Ops"]))
      .toEqual({ mode: "apply", reviewedBy: "Ops", category: "people" });
    for (const argv of [[], ["--apply"], ["--apply", "--reviewed-by"], ["--apply", "--reviewed-by", " "],
      ["--dry-run", "--apply"], ["--dry-run", "--reviewed-by", "x"], ["--apply", "--reviewed-by", "a\nb"], ["--people"],
      ["--category"], ["--category", "books", "--dry-run"], ["--dry-run", "--category", "people"], ["--category", "people"]]) {
      expect(() => parseTaxonomyApplyArguments(argv), argv.join(" ")).toThrow(/Usage/);
    }
  });
});
