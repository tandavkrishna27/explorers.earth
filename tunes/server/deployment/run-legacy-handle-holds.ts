import { readFile } from "node:fs/promises";
import { resolveMusicDatabaseConnection } from "../config/music-database-config";
import { applyLegacyHandleHolds, parseHeldUntil, parseLegacyHoldsCsv } from "../application/legacyHandleHolds";

/**
 * One-shot loader for legacy handle holds (launch plan Workstream A2).
 *
 * Runs inside the production image on the `migrate` service, as the migrator, after 0057:
 *
 *   node dist/server/deployment/run-legacy-handle-holds.js --csv /run/holds/handles.csv --held-until 2027-04-30 [--dry-run]
 *
 * The CSV (`handle,email`) is the owner-held Strapi export. It is mounted at run time, read
 * once, and never copied: only sha256 digests of the emails reach the database, and nothing
 * printed here contains a handle or an address - counts and line numbers only.
 */
export function parseLoaderArguments(argv: readonly string[]): { csv: string; heldUntil: string | undefined; dryRun: boolean } {
  let csv: string | undefined, heldUntil: string | undefined, dryRun = false;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--dry-run") dryRun = true;
    else if (argument === "--csv" && index + 1 < argv.length) csv = argv[++index];
    else if (argument === "--held-until" && index + 1 < argv.length) heldUntil = argv[++index];
    else throw new Error(`Unsupported argument at position ${index + 1}`);
  }
  if (!csv) throw new Error("--csv <path> is required");
  return { csv, heldUntil, dryRun };
}

async function run(): Promise<void> {
  const options = parseLoaderArguments(process.argv.slice(2));
  const heldUntil = parseHeldUntil(options.heldUntil);
  const parsed = parseLegacyHoldsCsv(await readFile(options.csv, "utf8"));
  const summary = { rows: parsed.rows.length, skippedUnclaimableLines: parsed.skippedUnclaimableLines, duplicateLines: parsed.duplicateLines, heldUntil: heldUntil.toISOString() };
  if (options.dryRun) { console.log(JSON.stringify({ dryRun: true, ...summary })); return; }
  // The runtime role can only read holds; refuse to run as it rather than fail mid-transaction.
  const migrator = await resolveMusicDatabaseConnection(process.env, "migrator");
  if (migrator.user === "music_runtime" || migrator.user === process.env.MUSIC_RUNTIME_DATABASE_USER) {
    throw new Error("legacy handle holds must be loaded as the migrator, not the runtime role");
  }
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: migrator.connectionString, max: 1 });
  try {
    const result = await applyLegacyHandleHolds(pool, parsed.rows, heldUntil);
    console.log(JSON.stringify({ dryRun: false, ...summary, ...result }));
  } finally {
    await pool.end().catch(() => undefined);
  }
}

if (process.argv[1] && /run-legacy-handle-holds\.(js|ts)$/.test(process.argv[1])) {
  run().catch((error) => {
    console.error("Legacy handle hold load failed:", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  });
}
