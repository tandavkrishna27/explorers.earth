import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { MusicDatabaseConnection } from "../server/config/music-database-config";
import { assertOperatorMigratorPrincipal } from "./operator-migrator-principal";
import { assertMusicMigratorAuthority } from "../server/db/music-runtime-role";
import { applyTaxonomyCatalogImport, dryRunTaxonomyCatalogImport, type TaxonomyImportPlan } from "../server/services/taxonomyCatalogImport";
import type { TaxonomyImport } from "../shared/explorersTaxonomyContract";
import { loadReviewedTaxonomyInputs, reviewedTaxonomyInputDirectory } from "./taxonomy-owned-import";
import { loadReviewedPeopleSectors } from "./people-sector-reviewed-import";

/**
 * Operator entry for the reviewed taxonomy vocabulary. Production runs the compiled
 * bundle as `node dist/apply-reviewed-taxonomy.js --dry-run` or
 * `--apply --reviewed-by <operator>`, with the migrator's MUSIC_DATABASE_* variables
 * and MUSIC_RUNTIME_DATABASE_USER, exactly as the migration gate is configured.
 * Places is the default. `--category people` applies the reviewed People sectors
 * (people-sector-reviewed-import.ts), never the empty Strapi people-import.json.
 */
type Environment = Record<string, string | undefined>;

// Pinned with the same value as public-parity-owned-composition.ts and the loader's tests.
export const reviewedTaxonomyManifestHash = "0087cf143b6f8ae68f60087539083bd0f7992c50c846b4c98a02dc1e9155ccff";

export type TaxonomyApplyCategory = "places" | "people";
export type TaxonomyApplyArguments = { mode: "dry-run"; category: TaxonomyApplyCategory } | { mode: "apply"; reviewedBy: string; category: TaxonomyApplyCategory };

const usage = "Usage: apply-reviewed-taxonomy [--category places|people] --dry-run | --apply --reviewed-by <operator>";

export function parseTaxonomyApplyArguments(argv: readonly string[]): TaxonomyApplyArguments {
  let category: TaxonomyApplyCategory = "places";
  if (argv[0] === "--category") {
    if (argv[1] !== "places" && argv[1] !== "people") throw new Error(usage);
    category = argv[1];
    argv = argv.slice(2);
  }
  if (argv.length === 1 && argv[0] === "--dry-run") return { mode: "dry-run", category };
  if (argv.length === 3 && argv[0] === "--apply" && argv[1] === "--reviewed-by") {
    const reviewedBy = argv[2];
    // Same rule applyTaxonomyCatalogImport enforces, checked before connecting.
    if (reviewedBy.length >= 1 && reviewedBy.length <= 200 && reviewedBy.trim() && !/[\u0000-\u001f\u007f]/.test(reviewedBy)) {
      return { mode: "apply", reviewedBy, category };
    }
  }
  throw new Error(usage);
}

export function resolveTaxonomyApplyPlan(): { places: TaxonomyImport; people: TaxonomyImport; appliesPeople: false } {
  const inputs = loadReviewedTaxonomyInputs({ fixedDirectory: reviewedTaxonomyInputDirectory, expectedManifestHash: reviewedTaxonomyManifestHash });
  return { places: inputs.places, people: inputs.people, appliesPeople: false };
}

export function resolveTaxonomyApplyInput(category: TaxonomyApplyCategory): TaxonomyImport {
  return category === "people" ? loadReviewedPeopleSectors().people : resolveTaxonomyApplyPlan().places;
}

export async function assertMigratorPrincipal(environment: Environment): Promise<{ migrator: MusicDatabaseConnection; runtimeLoginRole: string }> {
  return assertOperatorMigratorPrincipal(environment, "taxonomy apply");
}

function summarize(plan: TaxonomyImportPlan) {
  const operations: Record<string, number> = {};
  for (const change of plan.changes) {
    const kind = change.split(":").slice(0, 2).join(":");
    operations[kind] = (operations[kind] ?? 0) + 1;
  }
  return { category: plan.category, inputHash: plan.inputHash, observedCatalogVersion: plan.observedCatalogVersion,
    catalogVersion: plan.catalogVersion, changed: plan.changed, operations, conflicts: plan.conflicts };
}

async function run(argv: readonly string[], environment: Environment): Promise<void> {
  const args = parseTaxonomyApplyArguments(argv);
  const input = resolveTaxonomyApplyInput(args.category);
  const { migrator, runtimeLoginRole } = await assertMigratorPrincipal(environment);
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: migrator.connectionString, max: 1 });
  try {
    await assertMusicMigratorAuthority(pool, { runtimeLoginRole });
    if (args.mode === "dry-run") {
      const result = await dryRunTaxonomyCatalogImport(pool, input);
      process.stdout.write(`${JSON.stringify({ mode: "dry-run", ...summarize(result) })}\n`);
      if (result.conflicts.length) process.exitCode = 1;
      return;
    }
    const receipt = await applyTaxonomyCatalogImport(pool, input, args.reviewedBy);
    process.stdout.write(`${JSON.stringify({ mode: "apply", receiptId: receipt.receiptId, reviewedBy: receipt.reviewedBy, ...summarize(receipt) })}\n`);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  run(process.argv.slice(2), process.env).catch((error: unknown) => {
    console.error("Reviewed taxonomy apply failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
