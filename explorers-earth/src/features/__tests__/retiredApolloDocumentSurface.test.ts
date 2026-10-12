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
 * Documents whose last named consumer is **gone**, and which are therefore now orphaned
 * pending an owner decision.
 *
 * `APP_LISTS_BY_ACCOUNT` was listed above as kept alive by `e2e/apps.spec.ts`. That spec was
 * moved to `e2e/replatform/apps.spec.ts`, and because Apps moved off Apollo in the same
 * change, the replatformed spec dropped the GraphQL interception that named this document
 * altogether. The stale path meant the pair above silently stopped asserting; pointing it at
 * the real file does not restore it, because the real file does not reference the document.
 * A repo-wide search finds the identifier only in its own declaration and in this file.
 *
 * This is recorded rather than deleted on purpose. Deleting the entry would remove the only
 * remaining assertion about the document; deleting the `gql` document itself is an owner
 * decision outside this test's reach. So the audited orphan state is asserted in both
 * directions: the document still exists, and **nothing under `e2e/` names it**. Either
 * resolution - deleting the document, or giving it a real consumer again - makes this fail
 * and forces the entry to be updated.
 */
const ORPHANED = [
  { module: "src/features/AppsAndTools/api/query.ts", document: "APP_LISTS_BY_ACCOUNT", retiredConsumer: "e2e/apps.spec.ts", movedTo: "e2e/replatform/apps.spec.ts" },
] as const;

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
    for (const { module } of [...E2E_REFERENCED, ...ORPHANED, ...SCANNER_REQUIRED]) {
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
    // The retired consumer must stay gone; if it reappears, the ORPHANED verdict is stale.
    for (const { retiredConsumer, movedTo } of ORPHANED) {
      expect(existsSync(resolve(appRoot, retiredConsumer)), `${retiredConsumer} reappeared`).toBe(false);
      expect(existsSync(resolve(appRoot, movedTo)), movedTo).toBe(true);
    }
  });

  describe("documents whose last consumer disappeared are recorded, not forgotten", () => {
    for (const { module, document, retiredConsumer } of ORPHANED) {
      it(`${document} is still declared although ${retiredConsumer.split("/").pop()} no longer names it`, () => {
        expect(read(module)).toContain(`export const ${document}`);
      });

      it(`${document} is named by no spec under e2e/, so the pair above would be vacuous`, () => {
        const e2eRoot = resolve(appRoot, "e2e");
        expect(existsSync(e2eRoot), "e2e/ missing").toBe(true);
        const specs = readdirSync(e2eRoot, { recursive: true, encoding: "utf8" })
          .filter(entry => entry.endsWith(".ts") || entry.endsWith(".tsx") || entry.endsWith(".mjs"));
        // VACUITY GUARD (non-empty): an empty sweep would make the claim below meaningless.
        expect(specs.length, "no specs found under e2e/").toBeGreaterThan(0);
        const naming = specs.filter(entry => read(`e2e/${entry}`).includes(document));
        expect(naming, `${document} has a consumer again - move it back into E2E_REFERENCED`).toEqual([]);
      });
    }
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
