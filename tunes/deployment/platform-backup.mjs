#!/usr/bin/env node
/**
 * Explorers platform backup. Runs on the explorers host as root (the same
 * authority deploy/host/explorers-deploy.sh runs with), with no dependency beyond
 * Node and Docker. `pg_dump` runs inside the already-running postgres:15-alpine
 * service, and `age` and the AWS CLI run from digest-pinned images, so nothing has
 * to be installed on the host.
 *
 * It captures three surfaces into one encrypted archive plus a media copy, because
 * a database-only archive cannot restore a working system:
 *   1. PostgreSQL         - custom-format dump WITH owners and ACLs, plus globals
 *   2. host configuration - production.env, production.compose.yml, the secret
 *                           files production.env names
 *   3. media              - a checksummed inventory derived from the dump's own
 *                           snapshot, plus a server-side copy of every byte
 *
 * The archive is encrypted to a public age key. The host does not hold the
 * private half, so neither host nor bucket compromise reveals the secrets inside.
 *
 * Usage:
 *   node platform-backup.mjs --environment prod --reason scheduled [--prune]
 *   node platform-backup.mjs --environment prod --reason pre-deploy \
 *        --candidate-digest sha256:... --candidate-commit <40 hex> [--output-manifest <path>]
 *
 * Exit 0 on a complete backup, 1 on a refusal or failure. A failed run records a
 * manifest with complete:false, which the recovery contract refuses as a restore
 * candidate.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  closeSync, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync,
  rmSync, statSync, writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.umask(0o077);

/** amazon/aws-cli:2.31.18, pinned by digest (owner decision 10, chosen 2026-10-18). */
export const AWS_CLI_IMAGE = "amazon/aws-cli@sha256:1a491b258590cc66866cd550f592edff80082f44daf1d903820daeca2f4954de";
/** alpine:3.20 by digest; `age` is installed from its package repository at an
 *  exact version into a locally tagged image, built once and reused. */
export const AGE_BASE_IMAGE = "alpine@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc";
export const AGE_PACKAGE = "age=1.2.1-r0";
export const AGE_IMAGE = "explorers-backup-age:1.2.1-r0-alpine3.20";
export const DEFAULT_COMPOSE_PROJECT = "explorers-canonical";

/** Secret-file variables production.env points at (deploy/production.env.example).
 *  Every other secret lives inline in production.env itself. */
export const SECRET_FILE_VARIABLES = ["DB_MIGRATOR_PASSWORD_FILE_HOST", "DB_RUNTIME_PASSWORD_FILE_HOST"];

export class BackupRefusal extends Error {}

function refuse(message) { throw new BackupRefusal(message); }

/** Never let a value reach stdout or stderr. Refusals name the variable, not its
 *  contents - the same discipline as replatform-local.ts's redacted diagnostics. */
function requireSafeRoot(root) {
  if (!root || !isAbsolute(root) || /^[\\/]+$/.test(root) || resolve(root) === resolve("/opt")) refuse("backup root is unsafe");
  if (!existsSync(root) || !statSync(root).isDirectory()) refuse("backup root is unsafe");
  return resolve(root);
}

function requireRegularPrivateFile(path, label) {
  if (!existsSync(path) && !isSymlink(path)) refuse(`${label} is absent`);
  const stat = lstatSync(path);
  if (!stat.isFile()) refuse(`${label} must be a regular file`);
  if (process.platform !== "win32") {
    const mode = stat.mode & 0o777;
    if (mode !== 0o600 && mode !== 0o400) refuse(`${label} mode must be 0600 or 0400`);
    if (stat.uid !== process.getuid()) refuse(`${label} has the wrong owner`);
  }
  return path;
}

function isSymlink(path) {
  try { return lstatSync(path).isSymbolicLink(); } catch { return false; }
}

export function parseEnvFile(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    values.set(line.slice(0, index).trim(), line.slice(index + 1).trim());
  }
  return values;
}

/** An age recipient is a public key. Refusing an identity here is the difference
 *  between "the host can encrypt" and "the host can also decrypt every backup". */
export function assertAgeRecipient(recipient) {
  if (!recipient) refuse("EXPLORERS_BACKUP_AGE_RECIPIENT is required");
  if (/^AGE-SECRET-KEY-/i.test(recipient) || !/^age1[0-9a-z]{58}$/.test(recipient)) {
    refuse("EXPLORERS_BACKUP_AGE_RECIPIENT recipient must be a public age key");
  }
  return recipient;
}

export function parseBackupCommand(args) {
  const allowed = new Set(["--environment", "--reason", "--candidate-digest", "--candidate-commit", "--output-manifest", "--prune"]);
  const values = new Map();
  let prune = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!allowed.has(flag)) refuse("backup arguments rejected");
    if (flag === "--prune") { prune = true; continue; }
    const value = args[index += 1];
    if (!value || value.startsWith("--") || values.has(flag)) refuse("backup arguments rejected");
    values.set(flag, value);
  }
  const environment = values.get("--environment"), reason = values.get("--reason");
  const candidateDigest = values.get("--candidate-digest"), candidateCommit = values.get("--candidate-commit");
  if (!["prod", "local"].includes(environment)) refuse("backup arguments rejected");
  if (!["scheduled", "pre-deploy", "manual"].includes(reason)) refuse("backup arguments rejected");
  if ((candidateDigest !== undefined) !== (candidateCommit !== undefined)) refuse("backup arguments rejected");
  if (candidateDigest !== undefined && !(/^sha256:[a-f0-9]{64}$/.test(candidateDigest) && /^[a-f0-9]{40}$/.test(candidateCommit))) {
    refuse("backup arguments rejected");
  }
  if (reason === "pre-deploy" && candidateDigest === undefined) refuse("backup arguments rejected");
  const outputManifest = values.get("--output-manifest");
  if (outputManifest !== undefined && !isAbsolute(outputManifest)) refuse("backup arguments rejected");
  return { environment, reason, prune, candidateDigest, candidateCommit, outputManifest };
}

export function preflight(root, environment) {
  const safeRoot = requireSafeRoot(root);
  const environmentFile = requireRegularPrivateFile(join(safeRoot, "production.env"), "production.env");
  requireRegularPrivateFile(join(safeRoot, "production.compose.yml"), "production.compose.yml");
  const values = parseEnvFile(readFileSync(environmentFile, "utf8"));
  assertAgeRecipient(values.get("EXPLORERS_BACKUP_AGE_RECIPIENT"));
  for (const variable of ["DB_NAME", "DB_MIGRATOR_USER", "DB_RUNTIME_USER"]) {
    if (!/^[a-z_][a-z0-9_]{1,62}$/.test(values.get(variable) ?? "")) refuse(`${variable} is absent from production.env or malformed`);
  }
  for (const variable of SECRET_FILE_VARIABLES) {
    const path = values.get(variable);
    if (!path) refuse(`${variable} is absent from production.env`);
    if (!existsSync(path)) refuse(`${variable} points at an absent path`);
    requireRegularPrivateFile(path, variable);
  }
  if (environment === "prod") {
    for (const variable of ["EXPLORERS_MEDIA_S3_BUCKET", "EXPLORERS_MEDIA_S3_REGION"]) {
      if (!values.get(variable)) refuse(`${variable} is absent from production.env`);
    }
  } else {
    for (const variable of ["EXPLORERS_BACKUP_LOCAL_DESTINATION", "EXPLORERS_MEDIA_LOCAL_ROOT"]) {
      const path = values.get(variable);
      if (!path || !isAbsolute(path) || !existsSync(path)) refuse(`${variable} must name an existing absolute directory for a local backup`);
    }
  }
  if (existsSync(join(safeRoot, "backup.lock"))) {
    refuse("another backup is running (or one crashed: remove backup.lock after checking no backup process is alive)");
  }
  return { root: safeRoot, values };
}

/* ------------------------------------------------------------------ commands */

export function runCommand(file, args, options = {}) {
  const result = spawnSync(file, args, { windowsHide: true, maxBuffer: 256 * 1024 * 1024, ...options });
  if (result.error) throw new Error(`${file} ${args[0]} could not start`);
  if (result.status !== 0) {
    const detail = String(result.stderr ?? "").split(/\r?\n/).filter(Boolean).slice(-3).join(" | ").slice(0, 400);
    throw new Error(`${file} ${args[0]} failed with status ${result.status}${detail ? `: ${detail}` : ""}`);
  }
  return options.encoding === "buffer" ? result.stdout : String(result.stdout ?? "");
}

/** The postgres service of the canonical compose project, found by its Compose
 *  labels. Exactly one container must match; anything else is a refusal. */
export function findPostgresContainer(project, run = runCommand) {
  const ids = run("docker", ["ps", "--no-trunc", "--quiet",
    "--filter", `label=com.docker.compose.project=${project}`,
    "--filter", "label=com.docker.compose.service=postgres"], { encoding: "utf8" })
    .split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (ids.length !== 1 || !/^[a-f0-9]{64}$/.test(ids[0])) {
    refuse(`expected exactly one running postgres container in compose project ${project}, found ${ids.length}`);
  }
  return ids[0];
}

const SNAPSHOT = /^[0-9A-F]{8}-[0-9A-F]{8}-[0-9]+$/i;

/** `pg_dump` runs inside the postgres service, which guarantees the client major
 *  matches the server and installs nothing on the host. The database is on an
 *  `internal: true` network with no published ports (deploy/production.compose.yml),
 *  so `exec` is the only route in. `--snapshot` binds the dump to the same
 *  exported snapshot the manifest's row counts and media inventory were read in. */
export function buildDumpCommand({ values, containerId, snapshot }) {
  const database = values.get("DB_NAME"), user = values.get("DB_MIGRATOR_USER");
  if (!database || !user) refuse("DB_NAME and DB_MIGRATOR_USER are required");
  if (!SNAPSHOT.test(snapshot ?? "")) throw new Error("exported snapshot identifier is malformed");
  return {
    file: "docker",
    args: ["exec", containerId, "pg_dump", "--format=custom", "--compress=9", "--no-password",
      `--snapshot=${snapshot}`, "--username", user, "--dbname", database],
  };
}

/** Roles are cluster-global and are never in a per-database dump. music_runtime
 *  comes from migration 0010 and the four Apps roles from prepareAppWorkerCustody
 *  around 0056, and `pg_restore` needs all of them to exist before it can assign
 *  ownership. */
export function buildGlobalsCommand({ values, containerId }) {
  const user = values.get("DB_MIGRATOR_USER");
  if (!user) refuse("DB_MIGRATOR_USER is required");
  return {
    file: "docker",
    args: ["exec", containerId, "pg_dumpall", "--globals-only", "--no-role-passwords", "--no-password", "--username", user],
  };
}

/** A pg_dump custom archive starts with the literal "PGDMP". Checking the magic
 *  is what distinguishes "the dump failed and we stored the error" from a real
 *  archive; without it a zero-byte file would ship as a backup. */
export function assertDumpIsRestorable(bytes) {
  if (!bytes || bytes.length === 0) throw new Error("database dump is empty");
  if (bytes.subarray(0, 5).toString("latin1") !== "PGDMP") throw new Error("database dump is not a custom-format archive");
  return true;
}

/* -------------------------------------------------------- snapshot session */

/** One psql session, held open across the whole capture. It exports a
 *  REPEATABLE READ snapshot that pg_dump then adopts, and reads the journal head,
 *  the exact per-table row counts and the media inventory inside that same
 *  snapshot - so the manifest describes exactly the bytes in the dump, even while
 *  the application keeps writing. */
export class SnapshotSession {
  constructor(containerId, values) {
    this.child = spawn("docker", ["exec", "-i", containerId, "psql", "-X", "-q", "-A", "-t",
      "-v", "ON_ERROR_STOP=1", "--username", values.get("DB_MIGRATOR_USER"), "--dbname", values.get("DB_NAME")],
    { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    this.buffer = "";
    this.errors = "";
    this.sequence = 0;
    this.waiting = undefined;
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", chunk => { this.buffer += chunk; this.settle(); });
    this.child.stderr.on("data", chunk => { this.errors += chunk; });
    this.exited = new Promise(done => this.child.once("close", code => {
      if (this.waiting) this.waiting.failed(new Error(`snapshot session ended (${code}): ${this.errors.trim().slice(0, 300)}`));
      done(code);
    }));
  }

  settle() {
    if (!this.waiting) return;
    const index = this.buffer.indexOf(this.waiting.marker);
    if (index < 0) return;
    const output = this.buffer.slice(0, index);
    this.buffer = this.buffer.slice(index + this.waiting.marker.length).replace(/^\r?\n/, "");
    const { done } = this.waiting;
    this.waiting = undefined;
    done(output.trim());
  }

  query(sql) {
    if (this.waiting) throw new Error("snapshot session is busy");
    const marker = `__explorers_backup_${this.sequence += 1}__`;
    return new Promise((done, failed) => {
      this.waiting = { marker, done, failed };
      this.child.stdin.write(`${sql.trim()}\n\\echo ${marker}\n`);
      this.settle();
    });
  }

  async close() {
    try { await this.query("COMMIT;"); } catch { /* the session may already be gone */ }
    this.child.stdin.end();
    await this.exited;
  }
}

/** Exact counts for every table in `public`, as one JSON object. */
export const ROW_COUNT_QUERY = `
  SELECT coalesce(json_object_agg(table_name, rows ORDER BY table_name), '{}'::json)::text FROM (
    SELECT c.relname AS table_name,
      (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text::bigint AS rows
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r') counted;`;

export const JOURNAL_HEAD_QUERY = `
  SELECT CASE WHEN to_regclass('public.music_schema_migrations') IS NULL THEN '{}'
    ELSE coalesce((SELECT json_build_object('id', id, 'checksum', checksum, 'schemaChecksum', schema_checksum, 'rows', (SELECT count(*) FROM music_schema_migrations))
      FROM music_schema_migrations ORDER BY id DESC LIMIT 1)::text, '{}') END;`;

/* ------------------------------------------------------ host configuration */

/** Member names are the absolute host paths without the leading slash, so a
 *  rebuild knows where each file goes. Members carry mode and numeric owner:
 *  explorers-deploy.sh refuses production.env unless it is root-owned 0600, and
 *  secure-music-secret-file rejects a group- or world-readable secret. */
export function buildConfigurationEntries({ root, values }) {
  const entries = [
    { path: join(root, "production.env"), name: hostMemberName(join(root, "production.env")) },
    { path: join(root, "production.compose.yml"), name: hostMemberName(join(root, "production.compose.yml")) },
  ];
  for (const variable of SECRET_FILE_VARIABLES) {
    const path = values.get(variable);
    if (!path) continue;
    const posix = path.replaceAll("\\", "/");
    if (!isAbsolute(path) || posix.split("/").some(segment => segment === ".." || segment === ".")
      || resolve(path).replaceAll("\\", "/").replace(/^[A-Za-z]:/, "") !== posix.replace(/^[A-Za-z]:/, "")) {
      throw new Error(`secret path for ${variable} is not a normalized absolute path`);
    }
    entries.push({ path, name: hostMemberName(path) });
  }
  return entries;
}

function hostMemberName(path) {
  return path.replaceAll("\\", "/").replace(/^[A-Za-z]:/, "").replace(/^\/+/, "");
}

export function readHostEntries(entries) {
  return entries.map(({ path, name }) => {
    const stat = lstatSync(path);
    if (!stat.isFile()) throw new Error(`${name} must be a regular file`);
    return { name, bytes: readFileSync(path), mode: stat.mode & 0o7777, uid: stat.uid, gid: stat.gid };
  });
}

/* ------------------------------------------------------------- tar (ustar) */

/** A minimal POSIX ustar writer and reader for regular files only. Written here
 *  rather than shelling out because GNU tar on the host and bsdtar on a Windows
 *  drill machine disagree on flags, and the archive must carry exact mode and
 *  numeric ownership both ways. */
export function writeTar(path, entries) {
  const blocks = [];
  for (const entry of entries) {
    if (!/^[A-Za-z0-9._/-]+$/.test(entry.name) || entry.name.split("/").includes("..")) throw new Error(`archive member name ${entry.name} is unsafe`);
    const header = Buffer.alloc(512, 0);
    let name = entry.name, prefix = "";
    if (Buffer.byteLength(name) > 100) {
      const cut = name.lastIndexOf("/", 155);
      if (cut <= 0 || Buffer.byteLength(name.slice(cut + 1)) > 100) throw new Error(`archive member name ${entry.name} is too long`);
      prefix = name.slice(0, cut); name = name.slice(cut + 1);
    }
    const octal = (value, width) => value.toString(8).padStart(width - 1, "0") + "\0";
    header.write(name, 0, 100, "utf8");
    header.write(octal(entry.mode ?? 0o600, 8), 100, 8, "latin1");
    header.write(octal(entry.uid ?? 0, 8), 108, 8, "latin1");
    header.write(octal(entry.gid ?? 0, 8), 116, 8, "latin1");
    header.write(octal(entry.bytes.length, 12), 124, 12, "latin1");
    header.write(octal(entry.mtime ?? 0, 12), 136, 12, "latin1");
    header.write("        ", 148, 8, "latin1");
    header.write("0", 156, 1, "latin1");
    header.write("ustar\0", 257, 6, "latin1");
    header.write("00", 263, 2, "latin1");
    header.write(prefix, 345, 155, "utf8");
    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "latin1");
    blocks.push(header, entry.bytes);
    const padding = (512 - (entry.bytes.length % 512)) % 512;
    if (padding) blocks.push(Buffer.alloc(padding, 0));
  }
  blocks.push(Buffer.alloc(1024, 0));
  writeFileSync(path, Buffer.concat(blocks), { mode: 0o600, flag: "wx" });
  return path;
}

export function readTar(bytes) {
  const entries = [];
  let offset = 0;
  const field = (header, start, length) => header.subarray(start, start + length).toString("utf8").replace(/\0.*$/s, "");
  const number = (header, start, length) => Number.parseInt(field(header, start, length).trim() || "0", 8);
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) return entries;
    if (field(header, 257, 6) !== "ustar") throw new Error("archive is not a ustar archive");
    let sum = 0;
    for (let index = 0; index < 512; index += 1) sum += index >= 148 && index < 156 ? 32 : header[index];
    if (sum !== number(header, 148, 8)) throw new Error("archive header checksum mismatch");
    if (field(header, 156, 1) !== "0") throw new Error("archive holds a non-regular member");
    const prefix = field(header, 345, 155), name = field(header, 0, 100);
    const size = number(header, 124, 12);
    const fullName = prefix ? `${prefix}/${name}` : name;
    if (fullName.split("/").includes("..") || fullName.startsWith("/")) throw new Error("archive member escapes its root");
    if (offset + 512 + size > bytes.length) throw new Error("archive is truncated");
    entries.push({ name: fullName, mode: number(header, 100, 8), uid: number(header, 108, 8), gid: number(header, 116, 8),
      bytes: Buffer.from(bytes.subarray(offset + 512, offset + 512 + size)) });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error("archive has no end-of-archive marker");
}

export const sha256Hex = bytes => createHash("sha256").update(bytes).digest("hex");

/* --------------------------------------------------------------- entry point */

function isEntryPoint() {
  try { return resolve(process.argv[1] ?? "") === resolve(fileURLToPath(import.meta.url)); } catch { return false; }
}

if (isEntryPoint()) {
  main(process.argv.slice(2)).then(
    () => { process.exitCode = 0; },
    error => {
      process.stderr.write(`platform-backup: ${error instanceof Error ? error.message : "failed"}\n`);
      process.exitCode = 1;
    },
  );
}

export async function main(argv) {
  const command = parseBackupCommand(argv);
  const context = preflight(process.env.EXPLORERS_BACKUP_ROOT ?? "/opt/explorers", command.environment);
  return { command, context };
}
