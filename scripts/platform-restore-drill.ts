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
 *
 * A local backup is read from the directory its manifest sits in. A production
 * backup is downloaded with the operator's own AWS credentials from
 * EXPLORERS_BACKUP_S3_BUCKET.
 */
import { spawnSync } from "node:child_process";
import { createHmac, randomBytes, randomInt } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve as resolvePath, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import {
  backupManifestSchema, canonicalRecoveryDigest, drillReceiptSchema,
  type BackupManifest, type DrillReceipt,
} from "../tunes/shared/platformRecoveryContract";
import { PUBLIC_RECOMMENDATION_CATEGORIES } from "../tunes/server/publicProfile/publicProfilePolicy";
import type { ObjectStorage, StorageEnvironment } from "../tunes/server/services/objectStorage";
import {
  AWS_CLI_IMAGE, buildDecryptCommand, ensureAgeImage, parseEnvFile, readTar, runCommand, sha256Hex,
} from "../tunes/deployment/platform-backup.mjs";

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

export function assertNoAmbientAuthority(environment: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) continue;
    const upper = key.toUpperCase();
    if ((FORBIDDEN_AMBIENT as readonly string[]).includes(upper) || FORBIDDEN_AMBIENT_PREFIXES.some(p => p.test(key))) {
      throw new Error(`ambient ${upper} is forbidden for the restore drill`);
    }
  }
}

export function assertDisposableRestoreTarget(
  target: DisposableRestoreTarget,
  environment: Record<string, string | undefined>,
  observed: { existingTables?: readonly string[] } = {},
): { database: string; host: string; port: number } {
  assertNoAmbientAuthority(environment);
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

/* ------------------------------------------------------------ role bootstrap */

/** The only capability roles a restore may create. Five NOLOGIN roles, nothing
 *  more: music_runtime from migrations/0010, and the four Apps roles that
 *  prepareAppWorkerCustody creates around 0056 and that 0056 then asserts exist
 *  with exact attributes. */
export const PERMITTED_RESTORE_ROLES = [
  "music_runtime",
  "app_enrichment_worker",
  "app_enrichment_worker_owner",
  "app_enrichment_retention",
  "app_enrichment_retention_owner",
] as const;

/** prepareAppWorkerCustody creates the four Apps roles NOINHERIT; 0010 creates
 *  music_runtime with INHERIT. Getting this wrong fails the Apps capability matrix. */
const ROLE_INHERITANCE: Record<string, "INHERIT" | "NOINHERIT"> = {
  music_runtime: "INHERIT",
  app_enrichment_worker: "NOINHERIT",
  app_enrichment_worker_owner: "NOINHERIT",
  app_enrichment_retention: "NOINHERIT",
  app_enrichment_retention_owner: "NOINHERIT",
};

export function planRoleBootstrap(
  globals: string,
  manifest: { roles: readonly string[]; migratorRole: string; runtimeLoginRole: string },
  observed: { existingRoles: readonly string[] },
): { create: string[]; statements: string[] } {
  for (const role of manifest.roles) {
    if (!(PERMITTED_RESTORE_ROLES as readonly string[]).includes(role)) throw new Error(`${role} is not a permitted restore role`);
  }
  const declared = [...globals.matchAll(/^CREATE ROLE ([a-z_][a-z0-9_]*)/gm)].map(match => match[1]);
  for (const role of manifest.roles) {
    if (!declared.includes(role)) throw new Error(`${role} is declared in the manifest but absent from the globals capture`);
  }
  if (!/^[a-z_][a-z0-9_]{1,62}$/.test(manifest.migratorRole)) throw new Error("migrator role name is invalid");
  const existing = new Set(observed.existingRoles);
  const create: string[] = [], statements: string[] = [];
  for (const role of PERMITTED_RESTORE_ROLES) {
    if (!manifest.roles.includes(role) || existing.has(role)) continue;
    create.push(role);
    statements.push(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE ${ROLE_INHERITANCE[role]} NOREPLICATION NOBYPASSRLS`);
  }
  // The dump assigns ownership to the production migrator by name, and
  // provision_music_runtime_login is SECURITY DEFINER (migrations/0010), so it runs
  // with its owner's attributes. The stand-in therefore carries exactly the
  // attributes the globals capture records for the production migrator - read from
  // the backup, never guessed - but never a login and never a password: the drill
  // connects as the disposable container's own superuser.
  if (!existing.has(manifest.migratorRole)) {
    create.push(manifest.migratorRole);
    statements.push(`CREATE ROLE ${manifest.migratorRole} NOLOGIN ${migratorAttributes(globals, manifest.migratorRole).join(" ")}`);
  }
  return { create, statements };
}

const ROLE_ATTRIBUTE_PAIRS = [["SUPERUSER", "NOSUPERUSER"], ["INHERIT", "NOINHERIT"], ["CREATEROLE", "NOCREATEROLE"],
  ["CREATEDB", "NOCREATEDB"], ["REPLICATION", "NOREPLICATION"], ["BYPASSRLS", "NOBYPASSRLS"]] as const;

function migratorAttributes(globals: string, role: string): string[] {
  const line = new RegExp(`^ALTER ROLE ${role} WITH ([A-Z ]+);?$`, "m").exec(globals);
  if (!line) throw new Error(`the globals capture does not record the attributes of ${role}`);
  const tokens = new Set(line[1].trim().split(/\s+/));
  return ROLE_ATTRIBUTE_PAIRS.map(([granted, denied]) => {
    if (tokens.has(granted) === tokens.has(denied)) throw new Error(`the globals capture is ambiguous about ${role} ${granted}`);
    return tokens.has(granted) ? granted : denied;
  });
}

/** Owners and ACLs are retained deliberately: music-runtime-role.ts attests the
 *  owner of every table, sequence and function, so a --no-owner restore produces a
 *  database the application refuses to boot on. --clean is omitted because the
 *  target is required to be empty. */
export function buildRestoreCommand(input: { containerId: string; database: string; user: string; dumpPath: string }) {
  if (!DRILL_DATABASE.test(input.database)) throw new Error("pg_restore target is outside the drill namespace");
  return {
    file: "docker",
    args: ["exec", input.containerId,
      "pg_restore", "--exit-on-error", "--single-transaction", "--no-password",
      "--username", input.user, "--dbname", input.database, input.dumpPath],
  };
}

/* ------------------------------------------------- known restore deparse drift */

/** Found by the first restore ever executed against this schema: three CHECK
 *  constraints on `character varying` columns do not survive a dump/restore
 *  textually. PostgreSQL stores `x IN ('a','b')` on a varchar column as
 *  `x::text = ANY (ARRAY['a'::varchar,'b'::varchar]::text[])`; pg_dump prints that,
 *  and re-parsing it pushes the cast into each element
 *  (`ARRAY['a'::varchar::text,...]`). The constraint means the same thing, but
 *  pg_get_constraintdef differs, so the schema fingerprint the journal recorded no
 *  longer matches and the application refuses to boot (`schema drift after <id>`).
 *
 *  The repair re-declares exactly these constraints from their original migration
 *  text (0011 and 0015), which reproduces the original stored expression. It is
 *  not a way to make a lossy restore pass: the fingerprint oracle runs after it
 *  and must still equal the journal's value exactly. */
export const RESTORE_DEPARSE_REPAIRS = [
  { table: "music_publication_operations", constraint: "music_publication_operations_request_mode_check",
    check: "request_mode IN ('private','unlisted','public')", source: "0011_durable_publication_idempotency.sql" },
  { table: "music_publication_operations", constraint: "music_publication_operations_operation_state_check",
    check: "operation_state IN ('completed','replay_expired')", source: "0011_durable_publication_idempotency.sql" },
  { table: "music_publication_operation_archive", constraint: "music_publication_operation_archive_request_mode_check",
    check: "request_mode IN ('private','unlisted','public')", source: "0015_publication_operation_archive.sql" },
] as const;

export function buildDeparseRepairStatements(existingConstraints: ReadonlySet<string>): string[] {
  return RESTORE_DEPARSE_REPAIRS.filter(repair => existingConstraints.has(`${repair.table}.${repair.constraint}`)).map(repair =>
    `ALTER TABLE public.${repair.table} DROP CONSTRAINT ${repair.constraint}, ADD CONSTRAINT ${repair.constraint} CHECK (${repair.check})`);
}

export async function repairRestoreDeparseDrift(pool: Pool): Promise<number> {
  const existing = new Set((await pool.query<{ name: string }>(
    `SELECT c.relname || '.' || x.conname AS name FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND x.contype='c'`)).rows.map(row => row.name));
  const statements = buildDeparseRepairStatements(existing);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const statement of statements) await client.query(statement);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
  return statements.length;
}

/* --------------------------------------------------------- fidelity oracle */

export interface RestoredMigrationState {
  ready: boolean; currentId?: string; currentChecksum?: string; schemaChecksum?: string;
  appliedIds: readonly string[]; pendingIds: readonly string[];
}

/** The dump carries its own witness. music_schema_migrations stores a
 *  per-migration schema_checksum computed from the live catalog at apply time, and
 *  inspectMusicDatabase recomputes that fingerprint and throws `schema drift after
 *  <id>` when it no longer matches. Comparing both against the manifest closes the
 *  loop: the restore is faithful to what production had, not merely internally
 *  consistent. Pending migrations are returned, not refused: restore-forward is
 *  the only recovery there is. */
export function assertRestoredSchema(
  state: RestoredMigrationState,
  manifest: { migrationMarker: string; journalChecksum: string; schemaChecksum: string },
): { rows: number; currentId: string; pending: string[] } {
  if (!state.ready && !state.pendingIds.length) throw new Error("restored schema is not ready");
  if (state.currentId !== manifest.migrationMarker) throw new Error(`restored schema is at ${state.currentId}, not ${manifest.migrationMarker}`);
  if (state.currentChecksum !== manifest.journalChecksum) throw new Error("restored schema migration checksum does not match the manifest");
  if (state.schemaChecksum !== manifest.schemaChecksum) throw new Error("restored schema fingerprint does not match the manifest");
  return { rows: state.appliedIds.length, currentId: state.currentId, pending: [...state.pendingIds] };
}

export function assertRowCounts(actual: Record<string, number>, expected: Record<string, number>): true {
  for (const [table, count] of Object.entries(expected)) {
    if (!(table in actual)) throw new Error(`restored database has no table ${table}`);
    if (actual[table] !== count) throw new Error(`restored ${table} has ${actual[table]} rows, manifest recorded ${count}`);
  }
  return true;
}

export async function proveRestoredDatabase(pool: Pool, manifest: Pick<BackupManifest,
  "migrationMarker" | "journalChecksum" | "schemaChecksum" | "tableRowCounts">): Promise<{ rows: number; currentId: string; pending: string[] }> {
  const { inspectMusicDatabase } = await import("../tunes/server/db/migrate");
  const state = await inspectMusicDatabase(pool);
  if (state.conflictTables?.length) throw new Error("restored schema has unversioned conflicting tables");
  const proof = assertRestoredSchema(state as RestoredMigrationState, manifest);
  const counts: Record<string, number> = {};
  for (const table of Object.keys(manifest.tableRowCounts)) {
    if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error("unsafe catalog identifier in manifest row counts");
    const exists = await pool.query<{ present: boolean }>("SELECT to_regclass($1) IS NOT NULL AS present", [`public.${table}`]);
    if (!exists.rows[0]?.present) continue;
    const result = await pool.query<{ rows: number }>(`SELECT count(*)::int AS rows FROM public."${table}"`);
    counts[table] = result.rows[0]?.rows ?? 0;
  }
  assertRowCounts(counts, manifest.tableRowCounts);
  return proof;
}

/* --------------------------------------------------------- restored system */

/** A read-only ObjectStorage over the restored media directory, reporting the
 *  backup's own environment so media.ts admits the restored rows unchanged. This
 *  is why the drill calls createCanonicalApp (which accepts options.mediaStorage)
 *  rather than startCanonicalServer, which does not forward it - and why the drill
 *  never starts the maintenance loops. Writes throw: a drill must never be able to
 *  mutate what it is verifying. */
export class RestoredMediaStore implements ObjectStorage {
  readonly environment: StorageEnvironment;
  private readonly root: string;
  constructor(root: string, environment: StorageEnvironment) {
    this.root = resolvePath(root);
    this.environment = environment;
  }
  private path(key: string): string {
    if (!new RegExp(`^${this.environment}/[0-9a-f-]{36}/[0-9a-f-]{36}$`).test(key)) throw new Error("restored media key is invalid");
    const path = resolvePath(this.root, ...key.split("/"));
    if (!path.startsWith(this.root + sep)) throw new Error("restored media key escapes the drill root");
    return path;
  }
  async get(key: string): Promise<Buffer> { return readFile(this.path(key)); }
  async put(): Promise<void> { throw new Error("the restored media store is read-only"); }
  async delete(): Promise<void> { throw new Error("the restored media store is read-only"); }
}

export interface DrillProbe { path: string; expect: number[]; category?: string }

/** A category answers 200 when the account shows it and 404 when the account hides
 *  it (canReadPublicCategory); anything else - a 5xx, a 401 - is a broken restore. */
export function drillProbePlan(input: { handle: string | undefined }): DrillProbe[] {
  return [
    { path: "/health/live", expect: [200] },
    { path: "/health/ready", expect: [200] },
    { path: "/api/explorers/v1/me", expect: [401] },
    ...(input.handle ? PUBLIC_RECOMMENDATION_CATEGORIES.map(category => ({
      path: `/api/explorers/v1/profiles/${encodeURIComponent(input.handle!)}/recommendations/${category}`,
      expect: [200, 404],
      category,
    })) : []),
  ];
}

/** Better Auth's signed session cookie, as the integration suites build it. The
 *  restored EXPLORERS_AUTH_SECRET signing a restored auth_session token is the
 *  proof that sessions survive a restore - a rotated secret leaves every row intact
 *  and every browser signed out. */
export function signSessionCookie(name: string, token: string, secret: string): string {
  return `${name}=${token}.${createHmac("sha256", secret).update(token).digest("base64")}`;
}

/* ----------------------------------------------------------------- receipt */

const RECEIPT_NAME = /^platform-restore-drill-[A-Za-z0-9-]{8,64}$/;

/** The e2e runner's receipt discipline (scripts/replatform-e2e.mjs), for the same
 *  reasons: absolute, a direct child of the real system temp directory, a
 *  recognisable name, and NOT already existing - a pre-existing directory could
 *  hold another run's receipt that a reader would attribute to this one. The
 *  repository lives under a OneDrive path, so receipts must not be written inside
 *  the worktree: a reparse point breaks realpath identity. */
export function assertReceiptDirectory(path: string): string {
  if (!isAbsolute(path)) throw new Error("receipt directory must be absolute");
  const resolved = resolvePath(path);
  if (existsSync(resolved)) throw new Error("receipt directory must not exist");
  const parent = dirname(resolved);
  if (!existsSync(parent) || realpathSync(parent) !== realpathSync(tmpdir())) {
    throw new Error("receipt directory must be a direct child of the system temp directory");
  }
  if (!RECEIPT_NAME.test(basename(resolved))) throw new Error("receipt directory name is rejected");
  return resolved;
}

export function buildDrillReceipt(input: Omit<DrillReceipt, "version" | "recoveryMilliseconds">): DrillReceipt {
  return {
    version: "explorers-platform-restore-drill/v1" as const,
    ...input,
    recoveryMilliseconds: input.phases.reduce((total, phase) => total + phase.milliseconds, 0),
  };
}

export function writeDrillReceipt(directory: string, receipt: unknown): string {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "receipt.json");
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  return path;
}

/* -------------------------------------------------------------------- main */

const requireFromTunes = createRequire(fileURLToPath(new URL("../tunes/package.json", import.meta.url)));

function drillCommit(): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true });
  const commit = result.stdout.trim();
  if (result.status !== 0 || !/^[a-f0-9]{40}$/.test(commit)) throw new Error("the drill must run from a git checkout");
  return commit;
}

type Phase = { phase: string; milliseconds: number };

export async function runRestoreDrill(argv: string[], environment: Record<string, string | undefined> = process.env): Promise<{ receiptPath: string; receipt: DrillReceipt }> {
  const command = parseDrillCommand(argv);
  assertNoAmbientAuthority(environment);
  const receiptDirectory = assertReceiptDirectory(command.receipt);
  const manifestPath = resolvePath(command.manifest);
  const manifest = backupManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
  const manifestDigest = canonicalRecoveryDigest(manifest);
  const identityPath = resolvePath(command.identity);
  if (!existsSync(identityPath) || !statSync(identityPath).isFile()) throw new Error("the age identity file is absent");
  const commit = drillCommit();
  const runId = randomBytes(16).toString("hex");
  mkdirSync(receiptDirectory, { mode: 0o700 });
  const work = join(receiptDirectory, "work");
  mkdirSync(work, { mode: 0o700 });

  const phases: Phase[] = [];
  const timed = async <T>(phase: string, action: () => Promise<T> | T): Promise<T> => {
    const started = performance.now();
    try { return await action(); }
    finally { phases.push({ phase, milliseconds: Math.round(performance.now() - started) }); }
  };
  const log = (event: Record<string, unknown>) => process.stdout.write(`${JSON.stringify({ drill: runId, ...event })}\n`);

  let result: "passed" | "failed" = "failed";
  let failure: string | undefined;
  let cleanup: DrillReceipt["cleanup"] = "database-dropped-container-removed";
  const proofs: DrillReceipt["proofs"] = {
    journal: { rows: 1, currentId: manifest.migrationMarker },
    identity: { authUsers: 0, authSessions: 0, creatorAccounts: 0 },
    categories: {},
    media: { objects: manifest.media.objects, hashesMatched: 0, gatedRouteResolved: 0 },
    rowCountsMatched: false,
  };
  let authority: import("../tunes/scripts/music-uat-database").OwnedUatDatabaseAuthority | undefined;
  let adminPool: Pool | undefined, ownerPool: Pool | undefined, runtimePool: Pool | undefined;
  let server: Server | undefined;
  const drillDatabase = `explorers_restore_drill_${runId.slice(0, 8)}`;
  const pg = requireFromTunes("pg") as typeof import("pg");

  try {
    // 1. The archive and the media copy, from wherever the backup lives.
    const media = join(work, "media-source");
    await timed("download", () => {
      if (manifest.environment === "local") {
        const folder = basename(dirname(manifestPath));
        if (manifest.archive.key !== `local/backups/${folder}/archive.tar.age` || manifest.media.prefix !== `local/backups/${folder}/media/`) {
          throw new Error("the local manifest does not describe the directory it was read from");
        }
        copyFileSync(join(dirname(manifestPath), "archive.tar.age"), join(work, "archive.tar.age"));
        return;
      }
      const bucket = environment.EXPLORERS_BACKUP_S3_BUCKET;
      if (!bucket) throw new Error("EXPLORERS_BACKUP_S3_BUCKET is required to drill a production backup");
      const aws = ["run", "--rm", "--env", "AWS_ACCESS_KEY_ID", "--env", "AWS_SECRET_ACCESS_KEY", "--env", "AWS_SESSION_TOKEN",
        "--env", "AWS_REGION", "--volume", `${work}:/work`, AWS_CLI_IMAGE, "s3", "cp", "--only-show-errors"];
      runCommand("docker", [...aws, `s3://${bucket}/${manifest.archive.key}`, "/work/archive.tar.age"], { encoding: "utf8" });
      if (manifest.media.objects) runCommand("docker", [...aws, "--recursive", `s3://${bucket}/${manifest.media.prefix}`, "/work/media-source/"], { encoding: "utf8" });
    });
    const ciphertext = readFileSync(join(work, "archive.tar.age"));
    if (ciphertext.length !== manifest.archive.bytes || sha256Hex(ciphertext) !== manifest.archive.sha256) {
      throw new Error("the downloaded archive does not match the manifest checksum");
    }
    if (command.keepArchive) {
      // Decision R11: every drill leaves an off-provider copy of the backup.
      mkdirSync(join(receiptDirectory, "retained"), { mode: 0o700 });
      copyFileSync(join(work, "archive.tar.age"), join(receiptDirectory, "retained", "archive.tar.age"));
      copyFileSync(manifestPath, join(receiptDirectory, "retained", "manifest.json"));
    }

    // 2. Decrypt with the operator's identity, then verify every member.
    const members = await timed("decrypt", () => {
      ensureAgeImage();
      const decrypt = buildDecryptCommand({ identityPath, directory: work, inputName: "archive.tar.age", outputName: "archive.tar" });
      runCommand(decrypt.file, decrypt.args, { encoding: "utf8" });
      const entries = readTar(readFileSync(join(work, "archive.tar")));
      rmSync(join(work, "archive.tar"));
      for (const expected of manifest.members) {
        const entry = entries.find(candidate => candidate.name === expected.name);
        if (!entry || entry.bytes.length !== expected.bytes || sha256Hex(entry.bytes) !== expected.sha256) {
          throw new Error(`archive member ${expected.name} does not match the manifest`);
        }
      }
      return new Map(entries.map(entry => [entry.name, entry.bytes]));
    });
    const dumpPath = join(work, "dump.pgc");
    writeFileSync(dumpPath, members.get("database/dump.pgc")!, { mode: 0o600 });
    const globals = members.get("database/globals.sql")!.toString("utf8");
    const configuration = readTar(members.get("host/configuration.tar")!);
    const productionEnvironment = configuration.find(entry => entry.name.endsWith("/production.env"));
    if (!productionEnvironment) throw new Error("host configuration does not contain production.env");
    // explorers-deploy.sh refuses production.env unless it is 0600, so a production
    // archive that lost the mode would restore a host that refuses its next deploy.
    // A local rehearsal captured on Windows has no POSIX modes to keep.
    if (manifest.environment === "prod" && productionEnvironment.mode !== 0o600 && productionEnvironment.mode !== 0o400) {
      throw new Error("restored production.env lost its 0600 mode");
    }
    const restoredValues = parseEnvFile(productionEnvironment.bytes.toString("utf8"));
    const inventory = members.get("media/inventory.jsonl")!.toString("utf8").split(/\r?\n/).filter(Boolean)
      .map(line => JSON.parse(line) as { media_id: string; object_key: string; sha256: string; bytes: number });
    if (inventory.length !== manifest.media.objects) throw new Error("media inventory does not match the manifest's object count");

    // 3. A disposable PostgreSQL 15 the harness owns.
    const passwordFile = join(work, "pg-password");
    const password = randomBytes(24).toString("hex");
    writeFileSync(passwordFile, password, { mode: 0o600 });
    const uat = await import("../tunes/scripts/music-uat-database");
    authority = await timed("acquire-target", () => uat.startOwnedUatDatabase({
      runId, database: `music_uat_${runId}`, commit, port: randomInt(OWNED_PORT_MIN, OWNED_PORT_MAX + 1), passwordFile,
    }));
    const base = `postgresql://music_migrator:${password}@127.0.0.1:${authority.port}`;
    adminPool = new pg.Pool({ connectionString: `${base}/${authority.database}`, max: 2 });
    await adminPool.query(`CREATE DATABASE ${drillDatabase}`);
    ownerPool = new pg.Pool({ connectionString: `${base}/${drillDatabase}`, max: 4 });
    const existingTables = (await ownerPool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows.map(row => row.table_name);
    assertDisposableRestoreTarget({ connectionString: `${base}/${drillDatabase}`, containerId: authority.containerId, owned: true, port: authority.port },
      environment, { existingTables });

    // 4. Roles, then the restore.
    await timed("bootstrap-roles", async () => {
      const existingRoles = (await adminPool!.query<{ rolname: string }>("SELECT rolname FROM pg_roles")).rows.map(row => row.rolname);
      for (const statement of planRoleBootstrap(globals, manifest, { existingRoles }).statements) await adminPool!.query(statement);
      // In production the database is owned by POSTGRES_USER, which is the migrator
      // (deploy/production.compose.yml), and the runtime attestation requires exactly
      // that owner.
      await adminPool!.query(`ALTER DATABASE ${drillDatabase} OWNER TO ${manifest.migratorRole}`);
    });
    await timed("pg-restore", () => {
      const inContainer = `/tmp/explorers-restore-${runId}.pgc`;
      runCommand("docker", ["cp", dumpPath, `${authority!.containerId}:${inContainer}`], { encoding: "utf8" });
      const restore = buildRestoreCommand({ containerId: authority!.containerId, database: drillDatabase, user: "music_migrator", dumpPath: inContainer });
      runCommand(restore.file, restore.args, { encoding: "utf8" });
    });
    rmSync(dumpPath);
    await timed("repair-known-drift", () => repairRestoreDeparseDrift(ownerPool!));

    // 5. The oracle: the journal, the live fingerprint, every row count.
    const schema = await timed("attest-schema", () => proveRestoredDatabase(ownerPool!, manifest));
    proofs.journal = { rows: schema.rows, currentId: schema.currentId };
    proofs.rowCountsMatched = true;
    if (schema.pending.length) {
      await timed("migrate-forward", async () => {
        const { migrateMusicDatabase } = await import("../tunes/server/db/migrate");
        await migrateMusicDatabase(ownerPool!);
      });
    }

    // 6. The restricted-role attestation the application runs before it creates its pool.
    const runtimePassword = randomBytes(32).toString("base64url");
    await timed("attest-runtime-role", async () => {
      const roles = await import("../tunes/server/db/music-runtime-role");
      await roles.provisionMusicRuntimeLogin(ownerPool!, { loginRole: manifest.runtimeLoginRole, password: runtimePassword });
      const connectionString = `postgresql://${manifest.runtimeLoginRole}:${runtimePassword}@127.0.0.1:${authority!.port}/${drillDatabase}`;
      try {
        await roles.verifyMusicRuntimeDatabaseConnection({ connectionString, user: manifest.runtimeLoginRole } as never, manifest.migratorRole);
      } catch (error) {
        // The attestation reports one generic failure; name the divergent flags so a
        // failed drill says why.
        const probe = new pg.Pool({ connectionString, max: 1 });
        const flags = await probe.query(`SELECT has_database_privilege(current_user,current_database(),'CONNECT') AS connect,
            has_database_privilege(current_user,current_database(),'CREATE') AS create_in_database,
            has_database_privilege(current_user,current_database(),'TEMP') AS temp,
            has_schema_privilege(current_user,'public','USAGE') AS schema_usage,
            has_schema_privilege(current_user,'public','CREATE') AS schema_create`).then(result => result.rows[0]).catch(() => ({}))
          .finally(() => probe.end());
        throw new Error(`${error instanceof Error ? error.message : "runtime attestation failed"} ${JSON.stringify(flags)}`);
      }
    });

    // 7. Boot the canonical application against the restore, as the runtime login,
    //    with the restored production auth configuration.
    const storeRoot = join(work, "media-store");
    const store = new RestoredMediaStore(storeRoot, manifest.environment as StorageEnvironment);
    const { baseUrl, auth } = await timed("boot", async () => {
      for (const row of inventory) {
        const source = manifest.environment === "local"
          ? join(dirname(manifestPath), "media", ...row.object_key.split("/").slice(1))
          : join(media, ...row.object_key.split("/").slice(1));
        const destination = join(storeRoot, ...row.object_key.split("/"));
        mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
        copyFileSync(source, destination);
      }
      runtimePool = new pg.Pool({ connectionString: `postgresql://${manifest.runtimeLoginRole}:${runtimePassword}@127.0.0.1:${authority!.port}/${drillDatabase}`, max: 4 });
      const { createCanonicalApp } = await import("../tunes/server/auth/canonicalApp");
      const { resolveExplorersAuthConfig } = await import("../tunes/server/auth/betterAuth");
      const config = resolveExplorersAuthConfig(Object.fromEntries(restoredValues));
      const composed = createCanonicalApp(runtimePool, config, { mediaStorage: store });
      const listening = createServer(composed.app);
      await new Promise<void>((done, failed) => {
        listening.once("error", failed);
        listening.listen(0, "127.0.0.1", () => { listening.off("error", failed); done(); });
      });
      server = listening;
      const address = listening.address();
      if (!address || typeof address === "string") throw new Error("restored system did not bind a port");
      return { baseUrl: `http://127.0.0.1:${address.port}`, auth: { context: await composed.auth.$context, secret: config.secret } };
    });

    // 8. Probe: health, the unauthenticated principal, every public category, and
    //    a restored session authenticating with the restored secret.
    await timed("probe", async () => {
      const handle = (await ownerPool!.query<{ handle: string }>(`
        SELECT a.handle FROM creator_accounts a
        WHERE a.status='active' AND a.public_profile AND a.onboarding_status='complete' AND a.handle IS NOT NULL
        ORDER BY (SELECT count(*) FROM recommendations r WHERE r.account_id=a.id AND r.publication_state='published') DESC, a.id
        LIMIT 1`)).rows[0]?.handle;
      for (const probe of drillProbePlan({ handle })) {
        const response = await fetch(`${baseUrl}${probe.path}`, { signal: AbortSignal.timeout(15_000) });
        await response.arrayBuffer();
        if (!probe.expect.includes(response.status)) throw new Error(`probe ${probe.path} answered ${response.status}`);
        if (probe.category && response.status === 200) {
          proofs.categories[probe.category] = (await ownerPool!.query<{ count: number }>(
            `SELECT count(*)::int AS count FROM recommendations r JOIN creator_accounts a ON a.id=r.account_id
             WHERE a.handle=$1 AND r.category=$2 AND r.publication_state='published'`, [handle, probe.category])).rows[0].count;
        }
      }
      const counts = (await ownerPool!.query<{ users: number; sessions: number; accounts: number }>(
        `SELECT (SELECT count(*)::int FROM auth_user) AS users, (SELECT count(*)::int FROM auth_session) AS sessions,
           (SELECT count(*)::int FROM creator_accounts) AS accounts`)).rows[0];
      proofs.identity = { authUsers: counts.users, authSessions: counts.sessions, creatorAccounts: counts.accounts };
      const session = (await ownerPool!.query<{ token: string }>(
        "SELECT token FROM auth_session WHERE expires_at > now() ORDER BY updated_at DESC LIMIT 1")).rows[0];
      if (session) {
        const cookie = signSessionCookie(auth.context.authCookies.sessionToken.name, session.token, auth.secret);
        const me = await fetch(`${baseUrl}/api/explorers/v1/me`, { headers: { cookie }, signal: AbortSignal.timeout(15_000) });
        await me.arrayBuffer();
        if (me.status !== 200) throw new Error(`a restored session did not authenticate with the restored secret: ${me.status}`);
        log({ phase: "probe", restoredSessionAuthenticated: true });
      } else {
        log({ phase: "probe", restoredSessionAuthenticated: false, reason: "the backup holds no unexpired session" });
      }
    });

    // 9. Media: hash every restored object; fetch each through the gated route too.
    proofs.media = await timed("media", () => proveRestoredMedia({ baseUrl, store, inventory }));
    result = "passed";
  } catch (error) {
    failure = (error instanceof Error ? error.message : "failed").slice(0, 500);
  } finally {
    if (server) await new Promise<void>(done => server!.close(() => done()));
    await runtimePool?.end().catch(() => undefined);
    await ownerPool?.end().catch(() => undefined);
    if (authority) {
      try {
        const uat = await import("../tunes/scripts/music-uat-database");
        await uat.stopOwnedUatDatabase(authority, {
          dropDatabase: async () => {
            await adminPool!.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [drillDatabase]);
            await adminPool!.query(`DROP DATABASE IF EXISTS ${drillDatabase}`);
            await adminPool!.end();
            adminPool = undefined;
          },
        });
      } catch { cleanup = "leaked"; }
    }
    await adminPool?.end().catch(() => undefined);
    // The decrypted plaintext (dump, production.env, secrets) never outlives the drill.
    rmSync(work, { recursive: true, force: true });
  }

  const receipt = buildDrillReceipt({
    runId, result, drilledAt: new Date().toISOString(), drillCommit: commit, manifestDigest,
    migrationMarker: manifest.migrationMarker, schemaChecksum: manifest.schemaChecksum,
    cleanup, phases, ...(failure ? { failure } : {}), proofs,
  });
  drillReceiptSchema.parse(receipt);
  const receiptPath = writeDrillReceipt(receiptDirectory, receipt);
  log({ result, recoveryMilliseconds: receipt.recoveryMilliseconds, receipt: receiptPath, ...(failure ? { failure } : {}) });
  return { receiptPath, receipt };
}

/** Media proof. Hashing the bytes ourselves is the point: the gated route's ETag
 *  is media_assets.content_sha256 read from the database (media.ts), never a hash
 *  of what storage returned, so trusting the ETag would prove nothing about the
 *  restored bytes. Every object is hashed; every object is also requested through
 *  the gate, where a public one must serve identical bytes and a private one
 *  answers 404 (explorersMediaRoutes.ts collapses every denial to 404). */
export async function proveRestoredMedia(input: {
  baseUrl: string;
  store: RestoredMediaStore;
  inventory: ReadonlyArray<{ object_key: string; sha256: string; media_id: string }>;
}): Promise<{ objects: number; hashesMatched: number; gatedRouteResolved: number }> {
  let hashesMatched = 0, gatedRouteResolved = 0;
  for (const row of input.inventory) {
    const bytes = await input.store.get(row.object_key);
    if (sha256Hex(bytes) !== row.sha256) throw new Error(`restored object ${row.object_key} does not match its recorded content hash`);
    hashesMatched += 1;
    const response = await fetch(`${input.baseUrl}/api/explorers/v1/media/${row.media_id}/content`, { signal: AbortSignal.timeout(15_000) });
    const served = Buffer.from(await response.arrayBuffer());
    if (response.status === 404) continue;
    if (response.status !== 200) throw new Error(`gated media route answered ${response.status} after restore`);
    if (sha256Hex(served) !== row.sha256) throw new Error(`gated media route served different bytes for ${row.object_key}`);
    gatedRouteResolved += 1;
  }
  return { objects: input.inventory.length, hashesMatched, gatedRouteResolved };
}

function isEntryPoint(): boolean {
  try { return resolvePath(process.argv[1] ?? "") === resolvePath(fileURLToPath(import.meta.url)); } catch { return false; }
}

if (isEntryPoint()) {
  runRestoreDrill(process.argv.slice(2)).then(
    ({ receipt }) => { process.exitCode = receipt.result === "passed" ? 0 : 1; },
    error => { process.stderr.write(`platform-restore-drill: ${error instanceof Error ? error.message : "failed"}\n`); process.exitCode = 1; },
  );
}
