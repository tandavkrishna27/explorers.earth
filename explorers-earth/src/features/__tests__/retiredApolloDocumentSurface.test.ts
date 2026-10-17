/**
 * Why this file exists.
 *
 * Retiring Strapi means deleting `gql` documents, and 51 of 60 in the surviving Apollo
 * modules were deleted once measured unreachable. The nine that remain are **not**
 * unreachable, and the reasons are invisible to every tool you would reach for first:
 *
 * - Four are named only by Playwright specs under `e2e/` — one of them through a dynamic
 *   `await import('/src/features/.../query.ts')`, which no import graph resolves.
 * - Four are required by *source scanners* that read the module as text and match on the
 *   GraphQL **operation name**, insisting on exactly one document per operation.
 *
 * Neither kind is visible to `tsc`, and the e2e lanes that would catch the first kind run
 * only on pull requests targeting `main` (`ci.yml` is
 * `pull_request: branches: [main, develop]`, and the qualification workflow is
 * schedule-only). So on a feature branch, deleting one of these is silent.
 *
 * I did exactly that during the retirement and caught it by accident: three documents were
 * reported as "named only in a ticket" because the analysis stopped at the first match and
 * markdown sorted ahead of `e2e/`. This test turns that accident into a gate, on the unit
 * lane, which `test.yml` runs for every pull request against any base.
 *
 * **If a pair below is genuinely retired, delete the consumer and the entry together.**
 * The point is to make it a decision instead of a surprise.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "../../..");

const read = (relative: string): string => readFileSync(resolve(appRoot, relative), "utf8");

/** Documents kept alive solely by a Playwright spec, which no feature-branch lane runs. */
const E2E_REFERENCED = [
  // Dynamically imported by path, so neither `tsc` nor an import-graph sweep sees it.
  { module: "src/features/AppsAndTools/api/query.ts", document: "PUBLIC_APP_DATA", consumer: "e2e/public-shell-continuity.spec.ts" },
  { module: "src/features/Games/api/query.ts", document: "GAME_LISTS_BY_ACCOUNT", consumer: "e2e/games.spec.ts" },
  { module: "src/features/Movies/api/query.ts", document: "MOVIE_LISTS_BY_ACCOUNT", consumer: "e2e/movies.spec.ts" },
  { module: "src/features/Products/api/query.ts", document: "PRODUCT_LISTS_BY_ACCOUNT", consumer: "e2e/products.spec.ts" },
] as const;

/**
 * There was a third table here, `ORPHANED`, holding one entry: `APP_LISTS_BY_ACCOUNT` in
 * `src/features/AppsAndTools/api/query.ts`. It had been listed in `E2E_REFERENCED` as kept
 * alive by `e2e/apps.spec.ts`; that spec moved to `e2e/replatform/apps.spec.ts` and, because
 * Apps moved off Apollo in the same change, the replatformed spec dropped the GraphQL
 * interception that named the document at all. The table recorded that orphan state in both
 * directions so either resolution would fail loudly.
 *
 * The owner resolved it by **deleting the document** (2026-10-13), and the entry went with
 * it in the same change - exactly the "delete the consumer and the entry together" rule
 * above. Verified first: the identifier and its operation name `AppListsByAccount` appear in
 * no live consumer. The one surviving mention of the operation name, in
 * `src/features/navigation/__tests__/categoryNavigationSurfaces.test.tsx`, asserts the native
 * Apps refresh issues *no* such request, so it is a negative assertion that the deletion
 * only reinforces.
 *
 * Nothing is left to assert about that document, so there is no empty table to guard. The
 * four `E2E_REFERENCED` pairs and the four `SCANNER_REQUIRED` operations below are unchanged,
 * and the path-existence vacuity guard that caught the silent `apps.spec.ts` move still
 * covers every remaining consumer.
 */

/**
 * Operations a source scanner requires, each **exactly once**. The scanners are
 * `tunes/scripts/music-fixture-profile.ts`,
 * `tunes/server/test/contracts/music-fixture-services.test.ts`,
 * `e2e/music-harness-contract.spec.ts`, `e2e/contained-auth-session.spec.ts` and
 * `scripts/music-public-prebrowser-qualification.mjs`. They throw on a count other than
 * one, so a *duplicate* is as much a failure as an absence - hence the exact count here.
 */
const SCANNER_REQUIRED = [
  { module: "src/features/Settings/api/mutation.ts", operation: "UpdateAccount" },
  { module: "src/features/Settings/api/mutation.ts", operation: "UsersPermissionsUser" },
  { module: "src/features/PublicHome/api/query.ts", operation: "PublicCategoryListCounts" },
  { module: "src/features/navigation/categoryNavigationApi.ts", operation: "CategoryNavigationAccount" },
] as const;

describe("retired Apollo document surface", () => {
  it("scans real files, so nothing below can pass vacuously", () => {
    // VACUITY GUARD (non-empty): emptying a table must fail, not quietly assert nothing.
    expect(E2E_REFERENCED.length, "E2E_REFERENCED emptied").toBeGreaterThan(0);
    expect(SCANNER_REQUIRED.length, "SCANNER_REQUIRED emptied").toBeGreaterThan(0);
    for (const { module } of [...E2E_REFERENCED, ...SCANNER_REQUIRED]) {
      expect(existsSync(resolve(appRoot, module)), module).toBe(true);
      // VACUITY GUARD (non-empty): a truncated module would satisfy nothing below either.
      expect(read(module).length, `${module} is empty`).toBeGreaterThan(0);
    }
    // VACUITY GUARD (path): the whole point of this gate is the consumer half of each pair.
    // `e2e/apps.spec.ts` was moved without updating its entry and the pair went silently
    // vacuous for several commits. An existence assertion makes the next move fail by name.
    for (const { consumer } of E2E_REFERENCED) {
      expect(existsSync(resolve(appRoot, consumer)), consumer).toBe(true);
      expect(read(consumer).length, `${consumer} is empty`).toBeGreaterThan(0);
    }
  });

  it("the deleted APP_LISTS_BY_ACCOUNT stays deleted rather than quietly returning", () => {
    // The owner deleted this document; a revival would resurrect the retired Apollo path
    // that the replatform removed, so it is asserted gone in both directions here.
    const module = "src/features/AppsAndTools/api/query.ts";
    expect(read(module)).not.toContain("export const APP_LISTS_BY_ACCOUNT");
    const e2eRoot = resolve(appRoot, "e2e");
    expect(existsSync(e2eRoot), "e2e/ missing").toBe(true);
    const specs = readdirSync(e2eRoot, { recursive: true, encoding: "utf8" })
      .filter(entry => entry.endsWith(".ts") || entry.endsWith(".tsx") || entry.endsWith(".mjs"));
    // VACUITY GUARD (non-empty): an empty sweep would make the claim below meaningless.
    expect(specs.length, "no specs found under e2e/").toBeGreaterThan(0);
    const naming = specs.filter(entry => read(`e2e/${entry}`).includes("APP_LISTS_BY_ACCOUNT"));
    expect(naming, "APP_LISTS_BY_ACCOUNT has a consumer again - re-declare it deliberately").toEqual([]);
  });

  describe("documents named by a Playwright spec stay in place", () => {
    for (const { module, document, consumer } of E2E_REFERENCED) {
      it(`${document} is exported by ${module.split("/features/")[1]} for ${consumer.split("/").pop()}`, () => {
        expect(read(module)).toContain(`export const ${document}`);
      });

      it(`${consumer.split("/").pop()} still needs ${document}`, () => {
        // The other half of the pair. If the spec stopped using it, this entry and the
        // document should both go - that is the decision this test exists to force.
        expect(read(consumer)).toContain(document);
      });
    }
  });

  describe("operations a source scanner requires exist exactly once", () => {
    for (const { module, operation } of SCANNER_REQUIRED) {
      it(`${module.split("/features/")[1]} declares ${operation} exactly once`, () => {
        // Mirrors the scanners' own rule. They live in `tunes/` and in `e2e/`, neither of
        // which this app's unit lane runs, so the rule is restated here rather than
        // trusted to them.
        const matches = read(module).match(new RegExp(`\\b(?:query|mutation)\\s+${operation}\\b`, "g")) ?? [];
        expect(matches).toHaveLength(1);
      });
    }
  });
});
