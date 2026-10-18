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

/* ------------------------------------------------------------------- media */

/** Derived from media_objects joined to media_assets (migrations/0024). Only
 *  `ready` assets are claimed: an `uploading` row older than ten minutes becomes
 *  pending_delete and its object is deleted, so claiming it would put a key in the
 *  manifest that the system is about to remove. Size and hash come from
 *  media_objects, where both are NOT NULL. Read inside the dump's snapshot. */
export const MEDIA_INVENTORY_QUERY = `
  SELECT json_build_object(
    'media_id', o.media_id,
    'object_key', o.object_key,
    'bytes', o.byte_size,
    'sha256', encode(o.content_sha256,'hex'),
    'version', o.storage_version_id
  )::text
  FROM media_objects o
  JOIN media_assets a ON a.id = o.media_id
  WHERE a.status = 'ready' AND o.variant = 'original' AND o.deleted_at IS NULL
  ORDER BY o.object_key;`;

export function parseMediaInventory(text, environment) {
  const rows = [];
  const key = new RegExp(`^${environment}/[0-9a-f-]{36}/[0-9a-f-]{36}$`);
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const row = JSON.parse(trimmed);
    if (!key.test(String(row.object_key))) throw new Error(`media inventory contains a key outside the ${environment} prefix`);
    if (!/^[a-f0-9]{64}$/.test(row.sha256)) throw new Error("media inventory row has no content hash");
    if (!Number.isSafeInteger(Number(row.bytes)) || Number(row.bytes) < 0) throw new Error("media inventory row has no size");
    rows.push({ ...row, bytes: Number(row.bytes) });
  }
  return rows;
}

const AWS_ENVIRONMENT = ["--env", "AWS_ACCESS_KEY_ID", "--env", "AWS_SECRET_ACCESS_KEY", "--env", "AWS_SESSION_TOKEN", "--env", "AWS_REGION"];

/** Credentials reach the aws-cli container by name from the docker CLI's own
 *  environment, never as values on a command line. */
export function awsEnvironment(values) {
  const environment = { ...process.env, AWS_REGION: values.get("EXPLORERS_MEDIA_S3_REGION") };
  for (const name of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"]) {
    const value = values.get(name);
    if (value) environment[name] = value;
  }
  return environment;
}

/** Keep the `<accountId>/<id>` tail so the restore can reconstruct the original
 *  key without a lookup table. */
export function backupMediaKey(sourceKey, destinationPrefix) {
  return `${destinationPrefix}${sourceKey.split("/").slice(1).join("/")}`;
}

export function buildMediaCopyCommand({ bucket, sourceKey, destinationPrefix }) {
  const destinationKey = backupMediaKey(sourceKey, destinationPrefix);
  return {
    file: "docker",
    args: ["run", "--rm", ...AWS_ENVIRONMENT, AWS_CLI_IMAGE,
      "s3", "cp", `s3://${bucket}/${sourceKey}`, `s3://${bucket}/${destinationKey}`, "--only-show-errors"],
    destinationKey,
  };
}

/** A list of live mutable URLs is not a media backup (ticket-8-5.md:45). If any
 *  referenced object failed to copy, the run is incomplete and its manifest's
 *  complete:false makes it unusable as a restore candidate. */
export function assertMediaInventoryComplete(inventory, outcome) {
  const copied = new Set(outcome.copied);
  const missing = inventory.filter(row => !copied.has(row.object_key));
  if (missing.length) throw new Error(`${missing.length} referenced object(s) did not copy into the backup prefix`);
  return true;
}

function copyMedia({ environment, values, inventory, prefix, run }) {
  const copied = [], failed = [];
  for (const row of inventory) {
    try {
      if (environment === "prod") {
        const command = buildMediaCopyCommand({ bucket: values.get("EXPLORERS_MEDIA_S3_BUCKET"), sourceKey: row.object_key, destinationPrefix: prefix });
        run(command.file, command.args, { encoding: "utf8", env: awsEnvironment(values) });
      } else {
        const source = join(values.get("EXPLORERS_MEDIA_LOCAL_ROOT"), ...row.object_key.split("/"));
        const destination = join(values.get("EXPLORERS_BACKUP_LOCAL_DESTINATION"), ...backupMediaKey(row.object_key, prefix).split("/"));
        mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
        copyFileSync(source, destination);
        if (sha256Hex(readFileSync(destination)) !== row.sha256) throw new Error("copied bytes do not match the recorded hash");
      }
      copied.push(row.object_key);
    } catch {
      failed.push(row.object_key);
    }
  }
  return { copied, failed };
}

/* -------------------------------------------------------- encrypt, publish */

/** Builds the pinned age image once; later runs reuse the local tag. */
export function ensureAgeImage(run = runCommand) {
  try { run("docker", ["image", "inspect", "--format", "{{.Id}}", AGE_IMAGE], { encoding: "utf8" }); return; }
  catch { /* build below */ }
  run("docker", ["build", "--tag", AGE_IMAGE, "-"], {
    encoding: "utf8",
    input: `FROM ${AGE_BASE_IMAGE}\nRUN apk add --no-cache ${AGE_PACKAGE}\nENTRYPOINT ["age"]\n`,
  });
}

export function buildEncryptCommand({ recipient, directory, inputName, outputName }) {
  assertAgeRecipient(recipient);
  return {
    file: "docker",
    args: ["run", "--rm", "--network", "none", "--volume", `${directory}:/work`, AGE_IMAGE,
      "--encrypt", "--recipient", recipient, "--output", `/work/${outputName}`, `/work/${inputName}`],
  };
}

export function buildDecryptCommand({ identityPath, directory, inputName, outputName }) {
  return {
    file: "docker",
    args: ["run", "--rm", "--network", "none", "--volume", `${directory}:/work`,
      "--volume", `${identityPath}:/identity/key.age:ro`, AGE_IMAGE,
      "--decrypt", "--identity", "/identity/key.age", "--output", `/work/${outputName}`, `/work/${inputName}`],
  };
}

export function buildUploadCommand({ bucket, localPath, key }) {
  if (!/^(prod|local)\/backups\/[^/]+\/[^/]+$/.test(key) && !/^(prod|local)\/backups\/LATEST\.json$/.test(key)) {
    throw new Error("backup objects may only be written under a backups prefix");
  }
  return {
    file: "docker",
    args: ["run", "--rm", ...AWS_ENVIRONMENT, "--volume", `${dirname(localPath)}:/payload:ro`, AWS_CLI_IMAGE,
      "s3", "cp", `/payload/${basename(localPath)}`, `s3://${bucket}/${key}`, "--only-show-errors"],
  };
}

function publish({ environment, values, localPath, key, run }) {
  if (environment === "prod") {
    const command = buildUploadCommand({ bucket: values.get("EXPLORERS_MEDIA_S3_BUCKET"), localPath, key });
    run(command.file, command.args, { encoding: "utf8", env: awsEnvironment(values) });
    return;
  }
  buildUploadCommand({ bucket: "local", localPath, key });
  const destination = join(values.get("EXPLORERS_BACKUP_LOCAL_DESTINATION"), ...key.split("/"));
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  copyFileSync(localPath, destination);
}

const REQUIRED_MEMBERS = ["database/dump.pgc", "database/globals.sql", "host/configuration.tar", "media/inventory.jsonl"];

/** The required-member check lives here as well as in the zod schema on purpose:
 *  the host script does not import zod, so it would otherwise be able to write a
 *  manifest claiming complete:true that only the drill would later reject. */
export function buildManifest(input) {
  const names = new Set((input.members ?? []).map(member => member.name));
  const absent = REQUIRED_MEMBERS.filter(name => !names.has(name));
  if (absent.length) throw new Error(`archive is missing a required member: ${absent.join(", ")}`);
  return { version: "explorers-platform-backup/v1", complete: true, ...input };
}

export function writeJson(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  renameSync(temporary, path);
  return path;
}

export function runIdentifier() { return randomBytes(16).toString("hex"); }

/** `<UTC start>-<reason>-<first 8 of run id>`. Retention plans from a listing of
 *  these names alone, so pruning never has to download a manifest. */
export function runFolderName(startedAt, reason, runId) {
  const stamp = startedAt.toISOString().replace(/\.\d{3}Z$/, "Z").replaceAll("-", "").replaceAll(":", "");
  return `${stamp}-${reason}-${runId.slice(0, 8)}`;
}

export function parseRunFolder(name) {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-(scheduled|pre-deploy|manual)-[a-f0-9]{8}$/.exec(name);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second, reason] = match;
  return { completedAt: `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`, reason };
}

/* --------------------------------------------------------------- retention */

/** Engineering defaults proposed by ticket-8-5.md:40 ("a daily backup schedule
 *  and 14-day retention as initial engineering defaults"), with two additions:
 *  pre-deploy backups live longer because they are the only migration safety
 *  net, and one backup a month is kept for a year. Owner decision 3. */
export const RETENTION = { scheduledDays: 14, preDeployDays: 30, monthlyCount: 12 };

const runPrefixOf = key => {
  const match = /^((?:prod|local)\/backups\/[^/]+\/)/.exec(key);
  if (!match) throw new Error("retention candidate is outside the backups prefix");
  return match[1];
};

export function planRetention(runs, { now }) {
  for (const entry of runs) runPrefixOf(entry.key);
  const monthly = new Set();
  const keep = [], remove = [];
  const ordered = [...runs].sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
  ordered.forEach((entry, index) => {
    const ageDays = (now - Date.parse(entry.completedAt)) / 86_400_000;
    const month = entry.completedAt.slice(0, 7);
    const withinWindow = entry.reason === "pre-deploy" ? ageDays <= RETENTION.preDeployDays : ageDays <= RETENTION.scheduledDays;
    const monthlyKeeper = !monthly.has(month) && monthly.size < RETENTION.monthlyCount;
    if (index === 0 || withinWindow || monthlyKeeper) { monthly.add(month); keep.push(entry); }
    else remove.push(entry);
  });
  return { keep, delete: remove };
}

/** ticket-8-5.md:41 says to inspect existing IAM rather than assume deletion
 *  authority. A denial is reported as a named gate, never swallowed and never
 *  fatal, because a backup that succeeded must not be failed by a prune. */
export function applyRetention(plan, { remove }) {
  let pruned = 0;
  for (const entry of plan.delete) {
    try { remove(runPrefixOf(entry.key)); pruned += 1; }
    catch { return { pruned, gate: "BACKUP_DELETE_PERMISSION_UNAVAILABLE" }; }
  }
  return { pruned };
}

function listRuns({ environment, values, run }) {
  let folders;
  if (environment === "prod") {
    const output = run("docker", ["run", "--rm", ...AWS_ENVIRONMENT, AWS_CLI_IMAGE, "s3api", "list-objects-v2",
      "--bucket", values.get("EXPLORERS_MEDIA_S3_BUCKET"), "--prefix", "prod/backups/", "--delimiter", "/",
      "--query", "CommonPrefixes[].Prefix", "--output", "json"], { encoding: "utf8", env: awsEnvironment(values) });
    folders = (JSON.parse(output || "null") ?? []).map(prefix => prefix.split("/")[2]);
  } else {
    const directory = join(values.get("EXPLORERS_BACKUP_LOCAL_DESTINATION"), "local", "backups");
    folders = existsSync(directory) ? readdirSync(directory) : [];
  }
  return folders.flatMap(folder => {
    const parsed = parseRunFolder(folder);
    return parsed ? [{ key: `${environment}/backups/${folder}/`, ...parsed }] : [];
  });
}

function removeRun({ environment, values, run }) {
  return prefix => {
    if (environment === "prod") {
      run("docker", ["run", "--rm", ...AWS_ENVIRONMENT, AWS_CLI_IMAGE, "s3", "rm",
        `s3://${values.get("EXPLORERS_MEDIA_S3_BUCKET")}/${prefix}`, "--recursive", "--only-show-errors"],
      { encoding: "utf8", env: awsEnvironment(values) });
      return;
    }
    const root = resolve(values.get("EXPLORERS_BACKUP_LOCAL_DESTINATION"));
    const target = resolve(root, ...prefix.split("/").filter(Boolean));
    if (!target.startsWith(join(root, "local", "backups") + (process.platform === "win32" ? "\\" : "/"))) throw new Error("refusing to prune outside the destination");
    rmSync(target, { recursive: true, force: true });
  };
}

/* ---------------------------------------------------------- image identity */

/** For a scheduled or manual backup, the image a backup authorizes is the one
 *  serving: the api container of the compose project, by digest and by the
 *  revision label tunes.yml stamps on it. */
export function resolveRunningImage(project, run = runCommand) {
  const ids = run("docker", ["ps", "--no-trunc", "--quiet",
    "--filter", `label=com.docker.compose.project=${project}`, "--filter", "label=com.docker.compose.service=api"],
  { encoding: "utf8" }).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (ids.length !== 1) refuse("no single running api container; pass --candidate-digest and --candidate-commit");
  const [image, revision] = run("docker", ["inspect", "--format",
    "{{.Config.Image}}|{{index .Config.Labels \"org.opencontainers.image.revision\"}}", ids[0]], { encoding: "utf8" }).trim().split("|");
  const digest = /@(sha256:[a-f0-9]{64})$/.exec(image ?? "")?.[1];
  if (!digest || !/^[a-f0-9]{40}$/.test(revision ?? "")) refuse("the running api image has no digest or revision label");
  return { digest, commit: revision };
}

const PERMITTED_GLOBAL_ROLES = ["music_runtime", "app_enrichment_worker", "app_enrichment_worker_owner",
  "app_enrichment_retention", "app_enrichment_retention_owner"];

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

export async function main(argv, { run = runCommand, now = () => new Date() } = {}) {
  const command = parseBackupCommand(argv);
  const context = preflight(process.env.EXPLORERS_BACKUP_ROOT ?? "/opt/explorers", command.environment);
  const { values } = context;
  const startedAt = now();
  const runId = runIdentifier();
  const folder = runFolderName(startedAt, command.reason, runId);
  const prefix = `${command.environment}/backups/${folder}/`;
  const project = values.get("EXPLORERS_BACKUP_COMPOSE_PROJECT") ?? DEFAULT_COMPOSE_PROJECT;
  const lockPath = join(context.root, "backup.lock");
  try { writeFileSync(lockPath, `${process.pid}\n`, { mode: 0o600, flag: "wx" }); }
  catch { refuse("another backup is running"); }
  const work = join(context.root, "backup-work", runId);
  let session;
  let stage = "start";
  const log = event => process.stdout.write(`${JSON.stringify({ runId, ...event })}\n`);
  try {
    mkdirSync(join(work, "members", "database"), { recursive: true, mode: 0o700 });
    mkdirSync(join(work, "members", "host"), { recursive: true, mode: 0o700 });
    mkdirSync(join(work, "members", "media"), { recursive: true, mode: 0o700 });

    stage = "identity";
    const image = command.candidateDigest
      ? { digest: command.candidateDigest, commit: command.candidateCommit }
      : resolveRunningImage(project, run);

    stage = "snapshot";
    const containerId = findPostgresContainer(project, run);
    session = new SnapshotSession(containerId, values);
    await session.query("BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY;");
    const snapshot = await session.query("SELECT pg_export_snapshot();");
    const journal = JSON.parse((await session.query(JOURNAL_HEAD_QUERY)) || "{}");
    if (!journal.id) refuse("the database has no migration journal; there is nothing to back up");
    const tableRowCounts = Object.fromEntries(Object.entries(JSON.parse(await session.query(ROW_COUNT_QUERY)))
      .map(([table, rows]) => [table, Number(rows)]));
    const inventoryText = await session.query(MEDIA_INVENTORY_QUERY);
    log({ stage: "snapshot", migrationMarker: journal.id, tables: Object.keys(tableRowCounts).length });

    stage = "dump";
    const dumpPath = join(work, "members", "database", "dump.pgc");
    const dump = buildDumpCommand({ values, containerId, snapshot });
    const descriptor = openSync(dumpPath, "wx", 0o600);
    try { run(dump.file, dump.args, { stdio: ["ignore", descriptor, "pipe"] }); }
    finally { closeSync(descriptor); }
    assertDumpIsRestorable(readFileSync(dumpPath));
    await session.close();
    session = undefined;

    stage = "globals";
    const globals = buildGlobalsCommand({ values, containerId });
    const globalsText = run(globals.file, globals.args, { encoding: "utf8" });
    if (/SCRAM-SHA-256|PASSWORD\s+'/i.test(globalsText)) throw new Error("globals capture contains a password verifier");
    const declared = [...globalsText.matchAll(/^CREATE ROLE ([a-z_][a-z0-9_]*);?/gm)].map(match => match[1]);
    if (!declared.includes("music_runtime")) throw new Error("globals capture does not contain music_runtime");
    writeFileSync(join(work, "members", "database", "globals.sql"), globalsText, { mode: 0o600, flag: "wx" });

    stage = "configuration";
    writeTar(join(work, "members", "host", "configuration.tar"), readHostEntries(buildConfigurationEntries({ root: context.root, values })));

    stage = "media";
    const inventory = parseMediaInventory(inventoryText, command.environment);
    writeFileSync(join(work, "members", "media", "inventory.jsonl"),
      inventory.map(row => JSON.stringify(row)).join("\n") + (inventory.length ? "\n" : ""), { mode: 0o600, flag: "wx" });
    const mediaPrefix = `${prefix}media/`;
    assertMediaInventoryComplete(inventory, copyMedia({ environment: command.environment, values, inventory, prefix: mediaPrefix, run }));
    log({ stage: "media", objects: inventory.length });

    stage = "archive";
    const members = REQUIRED_MEMBERS.map(name => {
      const bytes = readFileSync(join(work, "members", ...name.split("/")));
      return { name, bytes, sha256: sha256Hex(bytes) };
    });
    writeTar(join(work, "archive.tar"), members.map(member => ({ name: member.name, bytes: member.bytes, mode: 0o600, uid: 0, gid: 0 })));

    stage = "encrypt";
    ensureAgeImage(run);
    const encrypt = buildEncryptCommand({ recipient: values.get("EXPLORERS_BACKUP_AGE_RECIPIENT"), directory: work, inputName: "archive.tar", outputName: "archive.tar.age" });
    run(encrypt.file, encrypt.args, { encoding: "utf8" });
    const ciphertext = readFileSync(join(work, "archive.tar.age"));
    if (!ciphertext.subarray(0, 21).toString("latin1").startsWith("age-encryption.org/v1")) throw new Error("encrypted archive is not an age file");
    rmSync(join(work, "archive.tar"));

    stage = "publish";
    const archiveKey = `${prefix}archive.tar.age`;
    publish({ environment: command.environment, values, localPath: join(work, "archive.tar.age"), key: archiveKey, run });
    const manifest = buildManifest({
      runId, environment: command.environment, startedAt: startedAt.toISOString(), completedAt: now().toISOString(),
      reason: command.reason, sourceCommit: image.commit, imageDigest: image.digest,
      migrationMarker: journal.id, journalChecksum: journal.checksum, schemaChecksum: journal.schemaChecksum,
      archive: { key: archiveKey, bytes: ciphertext.length, sha256: sha256Hex(ciphertext) },
      members: members.map(({ name, bytes, sha256 }) => ({ name, bytes: bytes.length, sha256 })),
      roles: PERMITTED_GLOBAL_ROLES.filter(role => declared.includes(role)),
      migratorRole: values.get("DB_MIGRATOR_USER"), runtimeLoginRole: values.get("DB_RUNTIME_USER"), databaseName: values.get("DB_NAME"),
      media: { objects: inventory.length, bytes: inventory.reduce((total, row) => total + row.bytes, 0), prefix: mediaPrefix },
      tableRowCounts,
    });
    const manifestPath = writeJson(join(work, "manifest.json"), manifest);
    publish({ environment: command.environment, values, localPath: manifestPath, key: `${prefix}manifest.json`, run });
    const latestPath = writeJson(join(work, "LATEST.json"), { runId, manifestKey: `${prefix}manifest.json`, completedAt: manifest.completedAt });
    publish({ environment: command.environment, values, localPath: latestPath, key: `${command.environment}/backups/LATEST.json`, run });
    writeJson(join(context.root, "backup-last-success.json"), { runId, completedAt: manifest.completedAt, manifestKey: `${prefix}manifest.json`, reason: command.reason });
    if (command.outputManifest) copyFileSync(manifestPath, command.outputManifest);
    log({ stage: "published", manifestKey: `${prefix}manifest.json`, archiveBytes: ciphertext.length,
      seconds: Math.round((Date.parse(manifest.completedAt) - startedAt.getTime()) / 1000) });

    if (command.prune) {
      stage = "prune";
      const plan = planRetention(listRuns({ environment: command.environment, values, run }), { now: now().getTime() });
      log({ stage: "prune", ...applyRetention(plan, { remove: removeRun({ environment: command.environment, values, run }) }) });
    }
    return manifest;
  } catch (error) {
    // A failed run is evidence too. It is recorded with complete:false, which the
    // recovery contract refuses as a restore candidate.
    const message = (error instanceof Error ? error.message : "failed").slice(0, 400);
    try {
      mkdirSync(join(context.root, "backup-failures"), { recursive: true, mode: 0o700 });
      const failure = writeJson(join(context.root, "backup-failures", `${folder}.json`),
        { version: "explorers-platform-backup/v1", runId, environment: command.environment, reason: command.reason,
          startedAt: startedAt.toISOString(), failedAt: now().toISOString(), complete: false, stage, error: message });
      try { publish({ environment: command.environment, values, localPath: failure, key: `${prefix}manifest.incomplete.json`, run }); }
      catch { /* the local record stands */ }
    } catch { /* never mask the original failure */ }
    throw new Error(`${stage}: ${message}`);
  } finally {
    if (session) await session.close().catch(() => undefined);
    rmSync(work, { recursive: true, force: true });
    rmSync(lockPath, { force: true });
  }
}
