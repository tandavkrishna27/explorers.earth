/**
 * Restore drill. Takes a backup manifest, restores it into a disposable
 * PostgreSQL 15 the harness owns, and proves the result by booting the
 * canonical application against it.
 *
 * It can only ever write to a database named `explorers_restore_drill_<8 hex>`
 * on 127.0.0.1 in the owned ephemeral port range. Production is not a
 * configurable target: there is no flag that names one.
 *
 *   npm run platform:restore-drill -- --manifest <manifest.json> \
 *     --identity <age identity file> --receipt <fresh dir under the temp dir> [--keep-archive]
 */

/** Forbidden ambient authority. Mirrors `music-uat-database.ts` and
 *  `replatform-local.ts` so the drill cannot inherit a production handle from the
 *  shell that started it. */
const FORBIDDEN_AMBIENT = ["DATABASE_URL", "DATABASE_URL_TEST", "GATE_PROD", "DOCKER_HOST", "DOCKER_CONTEXT"] as const;
const FORBIDDEN_AMBIENT_PREFIXES = [/^MUSIC_DEPLOY_/i, /^MUSIC_C10_STANDALONE_POSTGRES_/i] as const;

const DRILL_DATABASE = /^explorers_restore_drill_[a-f0-9]{8}$/;
const OWNED_PORT_MIN = 56_000;
const OWNED_PORT_MAX = 60_999;

export interface DisposableRestoreTarget {
  connectionString: string;
  containerId: string;
  owned: true;
  port: number;
}

export function assertDisposableRestoreTarget(
  target: DisposableRestoreTarget,
  environment: Record<string, string | undefined>,
  observed: { existingTables?: readonly string[] } = {},
): { database: string; host: string; port: number } {
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) continue;
    const upper = key.toUpperCase();
    if ((FORBIDDEN_AMBIENT as readonly string[]).includes(upper) || FORBIDDEN_AMBIENT_PREFIXES.some(p => p.test(key))) {
      throw new Error(`ambient ${upper} is forbidden for the restore drill`);
    }
  }
  if (target.owned !== true) throw new Error("restore target is not harness-owned");
  if (!/^[a-f0-9]{64}$/.test(target.containerId)) throw new Error("restore target container identity is invalid");
  let url: URL;
  try { url = new URL(target.connectionString); }
  catch { throw new Error("restore target is unresolved"); }
  const database = url.pathname.slice(1);
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.search || url.hash
    || !DRILL_DATABASE.test(database) || Number(url.port) !== target.port
    || target.port < OWNED_PORT_MIN || target.port > OWNED_PORT_MAX) {
    throw new Error("restore target is outside the disposable allowlist");
  }
  const existing = (observed.existingTables ?? []).filter(name => name !== "music_schema_migrations");
  if (existing.length) throw new Error(`restore target namespace is populated: ${existing.length} tables`);
  return { database, host: url.hostname, port: target.port };
}

export interface DrillCommand { manifest: string; identity: string; receipt: string; keepArchive: boolean }

export function parseDrillCommand(args: string[]): DrillCommand {
  const allowed = new Set(["--manifest", "--identity", "--receipt", "--keep-archive"]);
  const values = new Map<string, string>();
  let keepArchive = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!allowed.has(flag)) throw new Error("restore drill arguments rejected");
    if (flag === "--keep-archive") { keepArchive = true; continue; }
    const value = args[index += 1];
    if (!value || value.startsWith("--") || values.has(flag)) throw new Error("restore drill arguments rejected");
    values.set(flag, value);
  }
  const manifest = values.get("--manifest"), identity = values.get("--identity"), receipt = values.get("--receipt");
  if (!manifest || !identity || !receipt) throw new Error("restore drill arguments rejected");
  return { manifest, identity, receipt, keepArchive };
}
