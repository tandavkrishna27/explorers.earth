import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertMusicMigratorAuthority } from "../server/db/music-runtime-role";
import { applyPersonSuppression, readPersonSuppression, validatePersonSuppressionCommand,
  type PersonSuppressionCommand } from "../server/services/personSuppression";
import { assertOperatorMigratorPrincipal } from "./operator-migrator-principal";

/**
 * Operator entry for a People takedown (P5-9). Production runs the compiled bundle as
 *   node dist/suppress-person.js --show <entity-id>
 *   node dist/suppress-person.js --suppress <entity-id> --reason <text> --operator <name>
 *   node dist/suppress-person.js --restore <entity-id> --reason <text> --operator <name>
 * with the migrator's MUSIC_DATABASE_* variables and MUSIC_RUNTIME_DATABASE_USER, exactly
 * as apply-reviewed-taxonomy is configured. The runtime role cannot set suppressed_at.
 *
 * It must not import apply-reviewed-taxonomy: esbuild would inline that module's
 * import.meta.url main guard into this bundle and run the taxonomy apply as well.
 */
type Environment = Record<string, string | undefined>;

export type SuppressPersonArguments = { mode: "show"; entityId: string } | ({ mode: "apply" } & PersonSuppressionCommand);

const usage = "Usage: suppress-person --show <entity-id> | (--suppress|--restore) <entity-id> --reason <text> --operator <name>";

export function parseSuppressPersonArguments(argv: readonly string[]): SuppressPersonArguments {
  try {
    if (argv.length === 2 && argv[0] === "--show") {
      validatePersonSuppressionCommand({ entityId: argv[1], action: "suppress", reason: "show", operator: "show" });
      return { mode: "show", entityId: argv[1].toLowerCase() };
    }
    if (argv.length === 6 && (argv[0] === "--suppress" || argv[0] === "--restore")) {
      const flags = new Map([[argv[2], argv[3]], [argv[4], argv[5]]]);
      const reason = flags.get("--reason"), operator = flags.get("--operator");
      if (flags.size === 2 && reason !== undefined && operator !== undefined) {
        return { mode: "apply", ...validatePersonSuppressionCommand({ entityId: argv[1],
          action: argv[0] === "--suppress" ? "suppress" : "restore", reason, operator }) };
      }
    }
  } catch { /* fall through to usage */ }
  throw new Error(usage);
}

async function run(argv: readonly string[], environment: Environment): Promise<void> {
  const args = parseSuppressPersonArguments(argv);
  const { migrator, runtimeLoginRole } = await assertOperatorMigratorPrincipal(environment, "person suppression");
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: migrator.connectionString, max: 1 });
  try {
    await assertMusicMigratorAuthority(pool, { runtimeLoginRole });
    if (args.mode === "show") {
      process.stdout.write(`${JSON.stringify({ mode: "show", entityId: args.entityId, ...await readPersonSuppression(pool, args.entityId) })}\n`);
      return;
    }
    const { mode: _mode, ...command } = args;
    process.stdout.write(`${JSON.stringify({ mode: "apply", ...await applyPersonSuppression(pool, command) })}\n`);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  run(process.argv.slice(2), process.env).catch((error: unknown) => {
    console.error("Person suppression failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
