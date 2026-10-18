import { describe, expect, it } from "vitest";
import {
  backupManifestSchema,
  canonicalRecoveryDigest,
  drillReceiptSchema,
  verifyRecoveryEvidence,
} from "../../../shared/platformRecoveryContract";

const sha = (c: string) => c.repeat(64);
const digest = (c: string) => `sha256:${c.repeat(64)}`;

const manifest = () => ({
  version: "explorers-platform-backup/v1" as const,
  runId: "a".repeat(32),
  environment: "prod" as const,
  startedAt: "2026-10-18T02:00:00.000Z",
  completedAt: "2026-10-18T02:03:11.000Z",
  complete: true as const,
  reason: "scheduled" as const,
  sourceCommit: "c".repeat(40),
  imageDigest: digest("d"),
  migrationMarker: "0056_explorers_app_enrichment_jobs",
  journalChecksum: sha("e"),
  schemaChecksum: sha("f"),
  archive: { key: "prod/backups/20261018T020000Z-scheduled-aaaaaaaa/archive.tar.age", bytes: 4_194_304, sha256: sha("1") },
  members: [
    { name: "database/dump.pgc", bytes: 2_097_152, sha256: sha("2") },
    { name: "database/globals.sql", bytes: 8_192, sha256: sha("3") },
    { name: "host/configuration.tar", bytes: 32_768, sha256: sha("5") },
    { name: "media/inventory.jsonl", bytes: 1_024, sha256: sha("6") },
  ],
  roles: ["music_runtime", "app_enrichment_worker", "app_enrichment_worker_owner",
    "app_enrichment_retention", "app_enrichment_retention_owner"],
  migratorRole: "explorers_migrator",
  runtimeLoginRole: "explorers_runtime",
  databaseName: "explorers",
  media: { objects: 12, bytes: 1_048_576, prefix: "prod/backups/20261018T020000Z-scheduled-aaaaaaaa/media/" },
  tableRowCounts: { creator_accounts: 2, auth_user: 2, recommendations: 9 },
});

const receipt = () => ({
  version: "explorers-platform-restore-drill/v1" as const,
  runId: "b".repeat(32),
  result: "passed" as const,
  drilledAt: "2026-10-18T09:14:00.000Z",
  drillCommit: "c".repeat(40),
  manifestDigest: sha("7"),
  migrationMarker: "0056_explorers_app_enrichment_jobs",
  schemaChecksum: sha("f"),
  cleanup: "database-dropped-container-removed" as const,
  phases: [
    { phase: "download", milliseconds: 4_000 },
    { phase: "decrypt", milliseconds: 900 },
    { phase: "acquire-target", milliseconds: 21_000 },
    { phase: "bootstrap-roles", milliseconds: 300 },
    { phase: "pg-restore", milliseconds: 11_000 },
    { phase: "attest-schema", milliseconds: 2_400 },
    { phase: "attest-runtime-role", milliseconds: 7_100 },
    { phase: "boot", milliseconds: 1_800 },
    { phase: "probe", milliseconds: 5_500 },
  ],
  recoveryMilliseconds: 54_000,
  proofs: {
    journal: { rows: 56, currentId: "0056_explorers_app_enrichment_jobs" },
    identity: { authUsers: 2, authSessions: 1, creatorAccounts: 2 },
    categories: { places: 1, guides: 1, movies: 1, books: 2, games: 1, apps: 1, products: 1, people: 1 },
    media: { objects: 12, hashesMatched: 12, gatedRouteResolved: 7 },
    rowCountsMatched: true as const,
  },
});

const candidate = () => ({ digest: digest("d"), commit: "c".repeat(40), migrationMarker: "0056_explorers_app_enrichment_jobs" });

describe("platform recovery contract", () => {
  it("accepts a complete manifest and a passing receipt", () => {
    expect(backupManifestSchema.parse(manifest()).complete).toBe(true);
    expect(drillReceiptSchema.parse(receipt()).result).toBe("passed");
  });

  it("digests are stable under key reordering and change with content", () => {
    const a = canonicalRecoveryDigest(manifest());
    const reordered = Object.fromEntries(Object.entries(manifest()).reverse());
    expect(canonicalRecoveryDigest(reordered)).toBe(a);
    expect(canonicalRecoveryDigest({ ...manifest(), runId: "f".repeat(32) })).not.toBe(a);
  });

  it("rejects an incomplete manifest as a restore candidate", () => {
    const partial = { ...manifest(), complete: false };
    expect(() => backupManifestSchema.parse(partial)).toThrow();
  });

  it("rejects a manifest whose archive members do not include the database dump", () => {
    const without = { ...manifest(), members: manifest().members.filter(m => m.name !== "database/dump.pgc") };
    expect(() => backupManifestSchema.parse(without)).toThrow();
  });

  it("rejects a manifest whose archive or media prefix is outside its own environment's backups prefix", () => {
    expect(() => backupManifestSchema.parse({ ...manifest(), environment: "local" })).toThrow();
    expect(() => backupManifestSchema.parse({ ...manifest(),
      media: { ...manifest().media, prefix: "prod/11111111-1111-4111-8111-111111111111/" } })).toThrow();
  });

  it("admits a deploy only with a fresh backup and a marker-matched drill", () => {
    const now = Date.parse("2026-10-18T02:05:00.000Z");
    expect(verifyRecoveryEvidence({ manifest: manifest(), receipt: receipt(), candidate: candidate(), now }))
      .toEqual({ admitted: true });
  });

  it("admits a candidate that brings a newer migration than the database it backed up", () => {
    // Found during execution: the plan compared the backup's marker to the candidate's,
    // which refuses exactly the deploys a pre-deploy backup exists for - the ones that
    // migrate. The backup records the database as it was; the drill must have proven
    // that schema level restorable.
    expect(verifyRecoveryEvidence({ manifest: manifest(), receipt: receipt(),
      candidate: { ...candidate(), migrationMarker: "0057_explorers_next" },
      now: Date.parse("2026-10-18T02:05:00.000Z") })).toEqual({ admitted: true });
  });

  it.each([
    ["BACKUP_INVALID", { manifest: { ...manifest(), environment: "local",
      archive: { ...manifest().archive, key: "local/backups/x/archive.tar.age" },
      media: { ...manifest().media, prefix: "local/backups/x/media/" } } }],
    ["BACKUP_STALE", { now: Date.parse("2026-10-18T04:06:00.000Z") }],
    ["BACKUP_CANDIDATE_MISMATCH", { candidate: { ...candidate(), digest: digest("9") } }],
    ["BACKUP_CANDIDATE_MISMATCH", { candidate: { ...candidate(), commit: "9".repeat(40) } }],
    ["BACKUP_CANDIDATE_MISMATCH", { candidate: { ...candidate(), migrationMarker: "0055_explorers_app_enrichment" } }],
    ["DRILL_MARKER_MISMATCH", { receipt: { ...receipt(), migrationMarker: "0055_explorers_app_enrichment" } }],
    ["DRILL_FAILED", { receipt: { ...receipt(), result: "failed" as const } }],
    ["DRILL_STALE", { receipt: { ...receipt(), drilledAt: "2026-08-01T00:00:00.000Z" } }],
    ["DRILL_INVALID", { receipt: { ...receipt(), recoveryMilliseconds: -1 } }],
  ])("refuses with %s", (code, override) => {
    expect(verifyRecoveryEvidence({
      manifest: manifest(),
      receipt: receipt(),
      candidate: candidate(),
      now: Date.parse("2026-10-18T02:05:00.000Z"),
      ...override,
    })).toEqual({ admitted: false, code });
  });
});

import { assertDisposableRestoreTarget, parseDrillCommand } from "../../../../scripts/platform-restore-drill";

const target = () => ({
  connectionString: "postgresql://music_migrator:pw@127.0.0.1:57421/explorers_restore_drill_aaaaaaaa",
  containerId: "a".repeat(64),
  owned: true as const,
  port: 57421,
});

describe("disposable restore target", () => {
  it("accepts an owned loopback target in the drill database namespace", () => {
    expect(assertDisposableRestoreTarget(target(), {}).database).toBe("explorers_restore_drill_aaaaaaaa");
  });

  it.each([
    ["a non-loopback host", { connectionString: "postgresql://music_migrator:pw@db.example.com:5432/explorers_restore_drill_aaaaaaaa" }],
    ["a database outside the drill namespace", { connectionString: "postgresql://music_migrator:pw@127.0.0.1:57421/explorers" }],
    ["a port outside the owned range", { connectionString: "postgresql://music_migrator:pw@127.0.0.1:5432/explorers_restore_drill_aaaaaaaa", port: 5432 }],
    ["a target the harness does not own", { owned: false as unknown as true }],
    ["a query string", { connectionString: "postgresql://music_migrator:pw@127.0.0.1:57421/explorers_restore_drill_aaaaaaaa?sslmode=require" }],
    ["a mismatched container", { containerId: "short" }],
  ])("refuses %s", (_name, override) => {
    expect(() => assertDisposableRestoreTarget({ ...target(), ...override }, {})).toThrow(/restore target/);
  });

  it.each(["DATABASE_URL", "DATABASE_URL_TEST", "GATE_PROD", "DOCKER_HOST", "DOCKER_CONTEXT", "MUSIC_DEPLOY_PRODUCTION"])(
    "refuses an ambient %s", (key) => {
      expect(() => assertDisposableRestoreTarget(target(), { [key]: "anything" })).toThrow(/ambient/);
    });

  it("refuses a populated namespace", () => {
    expect(() => assertDisposableRestoreTarget(target(), {}, { existingTables: ["creator_accounts"] }))
      .toThrow(/populated/);
  });
});

describe("drill command", () => {
  it("requires a manifest, an identity and a receipt directory", () => {
    expect(parseDrillCommand(["--manifest", "m.json", "--identity", "k.age", "--receipt", "r"]))
      .toEqual({ manifest: "m.json", identity: "k.age", receipt: "r", keepArchive: false });
  });

  it.each([
    [[]],
    [["--manifest", "m.json"]],
    [["--manifest", "m.json", "--identity", "k.age"]],
    [["--manifest", "m.json", "--identity", "k.age", "--receipt", "r", "--target", "postgresql://prod/db"]],
  ])("rejects %j", (args) => expect(() => parseDrillCommand(args)).toThrow(/arguments rejected/));
});

import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  assertDumpIsRestorable, buildConfigurationEntries, buildDumpCommand, buildGlobalsCommand, readTar, writeTar,
} from "../../../deployment/platform-backup.mjs";

const backupScript = resolve(import.meta.dirname, "../../../deployment/platform-backup.mjs");
// A throwaway, syntactically valid age recipient. It is generated material for the
// shape check only; nothing is ever encrypted to it.
const RECIPIENT = `age1${"q".repeat(58)}`;

/** A host-shaped root: what deploy/host/explorers-deploy.sh leaves in /opt/explorers. */
function hostRoot(overrides: Record<string, string | null> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "platform-backup-host-"));
  mkdirSync(join(root, "secrets"));
  const secretMigrator = join(root, "secrets", "db-migrator"), secretRuntime = join(root, "secrets", "db-runtime");
  writeFileSync(secretMigrator, "throwaway", { mode: 0o600 });
  writeFileSync(secretRuntime, "throwaway", { mode: 0o600 });
  const variables: Record<string, string> = {
    DB_NAME: "explorers",
    DB_MIGRATOR_USER: "explorers_migrator",
    DB_RUNTIME_USER: "explorers_runtime",
    DB_MIGRATOR_PASSWORD_FILE_HOST: secretMigrator,
    DB_RUNTIME_PASSWORD_FILE_HOST: secretRuntime,
    EXPLORERS_MEDIA_S3_BUCKET: "explorers-media",
    EXPLORERS_MEDIA_S3_REGION: "ap-south-1",
    EXPLORERS_BACKUP_AGE_RECIPIENT: RECIPIENT,
  };
  for (const [key, value] of Object.entries(overrides)) if (!key.includes(".") && value !== null) variables[key] = value;
  const files: Record<string, string> = {
    "production.compose.yml": "name: explorers-canonical\n",
    "production.env": Object.entries(variables).map(([key, value]) => `${key}=${value}`).join("\n") + "\n",
  };
  for (const [name, body] of Object.entries(files)) {
    if (overrides[name] === null) continue;
    writeFileSync(join(root, name), body, { mode: 0o600 });
  }
  return root;
}

/** A fake `docker` first on PATH, so a refusal that leaks past preflight is visible
 *  as a recorded call instead of a real container. Plain Node, so it works on Windows. */
function shimDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "platform-backup-shims-"));
  const log = JSON.stringify(join(directory, "calls.log"));
  const body = `#!/usr/bin/env node\nrequire("fs").appendFileSync(${log}, process.argv.slice(2).join(" ") + "\\n");\nprocess.exit(97);\n`;
  writeFileSync(join(directory, "docker"), body, { mode: 0o755 });
  writeFileSync(join(directory, "docker.cmd"), `@node "%~dp0docker" %*\n`, { mode: 0o755 });
  return directory;
}

function runBackup(root: string, extra: string[] = [], environment: Record<string, string> = {}) {
  const shims = shimDirectory();
  try {
    const result = spawnSync(process.execPath, [backupScript, "--environment", "prod", "--reason", "manual", ...extra], {
      encoding: "utf8",
      windowsHide: true,
      env: { ...process.env, PATH: `${shims}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`,
        EXPLORERS_BACKUP_ROOT: root, ...environment },
    });
    let calls = "";
    try { calls = readFileSync(join(shims, "calls.log"), "utf8"); } catch { /* no docker call */ }
    return { ...result, calls };
  } finally { rmSync(shims, { recursive: true, force: true }); }
}

describe("host backup preflight", () => {
  it("refuses a root that is not absolute, is / or is /opt", () => {
    for (const root of ["relative/path", "/", "/opt"]) {
      expect(runBackup(root).stderr).toMatch(/backup root is unsafe/);
    }
  });

  it("refuses a missing production.env", () => {
    const root = hostRoot({ "production.env": null });
    try { expect(runBackup(root).stderr).toMatch(/production\.env/); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("refuses a missing production.compose.yml", () => {
    const root = hostRoot({ "production.compose.yml": null });
    try { expect(runBackup(root).stderr).toMatch(/production\.compose\.yml/); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("refuses when no age recipient is configured", () => {
    const root = hostRoot();
    writeFileSync(join(root, "production.env"), "DB_NAME=explorers\n", { mode: 0o600 });
    try { expect(runBackup(root).stderr).toMatch(/EXPLORERS_BACKUP_AGE_RECIPIENT/); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("refuses an age private identity pasted into the recipient variable, without echoing it", () => {
    const root = hostRoot({ EXPLORERS_BACKUP_AGE_RECIPIENT: `AGE-SECRET-KEY-1${"Q".repeat(58)}` });
    try {
      const result = runBackup(root);
      expect(result.stderr).toMatch(/recipient must be a public age key/);
      expect(`${result.stdout}${result.stderr}`).not.toMatch(/AGE-SECRET-KEY/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("refuses a secret file variable that points nowhere", () => {
    const root = hostRoot({ DB_RUNTIME_PASSWORD_FILE_HOST: "/nonexistent/db-runtime" });
    try { expect(runBackup(root).stderr).toMatch(/DB_RUNTIME_PASSWORD_FILE_HOST/); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("refuses a world-readable secret-bearing file", () => {
    if (process.platform === "win32") return;
    const root = hostRoot();
    chmodSync(join(root, "production.env"), 0o644);
    try { expect(runBackup(root).stderr).toMatch(/mode must be 0600 or 0400/); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("refuses a symlinked production.env", () => {
    if (process.platform === "win32") return;
    const root = hostRoot();
    rmSync(join(root, "production.env"));
    symlinkSync("/etc/hostname", join(root, "production.env"));
    try { expect(runBackup(root).stderr).toMatch(/production\.env must be a regular file/); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("refuses while another backup holds the lock", () => {
    const root = hostRoot();
    writeFileSync(join(root, "backup.lock"), "12345\n", { mode: 0o600 });
    try { expect(runBackup(root).stderr).toMatch(/another backup is running/); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("refuses a pre-deploy backup without the candidate identity", () => {
    const root = hostRoot();
    try { expect(runBackup(root, ["--reason", "pre-deploy"]).stderr).toMatch(/arguments rejected/); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("never prints a secret value or starts a container on any refusal path", () => {
    const root = hostRoot({ DB_RUNTIME_PASSWORD_FILE_HOST: "/nonexistent/db-runtime" });
    try {
      const result = runBackup(root);
      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).not.toMatch(/age1q{10}/);
      expect(result.calls).toBe("");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("database capture", () => {
  const values = new Map([["DB_NAME", "explorers"], ["DB_MIGRATOR_USER", "explorers_migrator"]]);
  const containerId = "a".repeat(64);

  it("dumps custom format with owners and ACLs retained, inside the exported snapshot", () => {
    const command = buildDumpCommand({ values, containerId, snapshot: "00000003-00000002-1" });
    expect(command.args.slice(0, 3)).toEqual(["exec", containerId, "pg_dump"]);
    expect(command.args).toContain("--format=custom");
    expect(command.args).toContain("--no-password");
    expect(command.args).toContain("--snapshot=00000003-00000002-1");
    // Ownership is attested at boot (music-runtime-role.ts), so a dump that drops it
    // produces a database the application refuses to start on.
    expect(command.args).not.toContain("--no-owner");
    expect(command.args).not.toContain("--no-acl");
    expect(command.args).not.toContain("--data-only");
  });

  it("refuses a malformed snapshot identifier", () => {
    expect(() => buildDumpCommand({ values, containerId, snapshot: "x; rm -rf /" })).toThrow(/snapshot/);
  });

  it("captures globals without role passwords", () => {
    const command = buildGlobalsCommand({ values, containerId });
    expect(command.args).toContain("--globals-only");
    // SCRAM verifiers are secrets we do not need: the migration gate re-sets the
    // runtime login password from the secret file on every deploy
    // (run-migration-gate.ts provisionMusicRuntimeLogin), so the hash is never the authority.
    expect(command.args).toContain("--no-role-passwords");
  });

  it("refuses a dump that is empty or not a pg_dump custom archive", () => {
    expect(() => assertDumpIsRestorable(Buffer.alloc(0))).toThrow(/dump is empty/);
    expect(() => assertDumpIsRestorable(Buffer.from("-- plain sql\n"))).toThrow(/custom-format/);
    expect(assertDumpIsRestorable(Buffer.concat([Buffer.from("PGDMP"), Buffer.alloc(64)]))).toBe(true);
  });
});

describe("host configuration capture", () => {
  it("captures production.env, the compose file and every secret file production.env names", () => {
    const values = new Map([
      ["DB_MIGRATOR_PASSWORD_FILE_HOST", "/opt/explorers/secrets/db-migrator"],
      ["DB_RUNTIME_PASSWORD_FILE_HOST", "/opt/explorers/secrets/db-runtime"],
    ]);
    const entries = buildConfigurationEntries({ root: "/opt/explorers", values });
    expect(entries.map(entry => entry.name)).toEqual([
      "opt/explorers/production.env",
      "opt/explorers/production.compose.yml",
      "opt/explorers/secrets/db-migrator",
      "opt/explorers/secrets/db-runtime",
    ]);
  });

  it("refuses a secret path that is not a normalized absolute path", () => {
    const values = new Map([["DB_RUNTIME_PASSWORD_FILE_HOST", "/srv/secrets/../../etc/shadow"]]);
    expect(() => buildConfigurationEntries({ root: "/opt/explorers", values })).toThrow(/secret path/);
  });

  it("round-trips bytes, mode and numeric ownership through the archive format", () => {
    // explorers-deploy.sh refuses production.env unless it is root-owned 0600, so a
    // restore that loses either is refused on the very next deploy.
    const directory = mkdtempSync(join(tmpdir(), "platform-backup-tar-"));
    try {
      const path = join(directory, "a.tar");
      writeTar(path, [
        { name: "opt/explorers/production.env", bytes: Buffer.from("A=1\n"), mode: 0o600, uid: 0, gid: 0 },
        { name: "database/dump.pgc", bytes: Buffer.alloc(1500, 7), mode: 0o600, uid: 1000, gid: 1000 },
      ]);
      const read = readTar(readFileSync(path));
      expect(read.map(entry => [entry.name, entry.mode, entry.uid, entry.gid, entry.bytes.length]))
        .toEqual([["opt/explorers/production.env", 0o600, 0, 0, 4], ["database/dump.pgc", 0o600, 1000, 1000, 1500]]);
      expect(read[1].bytes.equals(Buffer.alloc(1500, 7))).toBe(true);
      expect(() => readTar(Buffer.alloc(100))).toThrow(/archive/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});

import {
  MEDIA_INVENTORY_QUERY, applyRetention, assertMediaInventoryComplete, buildDecryptCommand, buildEncryptCommand,
  buildManifest, buildMediaCopyCommand, buildUploadCommand, parseMediaInventory, parseRunFolder, planRetention,
  RETENTION, runFolderName,
} from "../../../deployment/platform-backup.mjs";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const MEDIA = "22222222-2222-4222-8222-222222222222";

describe("media capture", () => {
  it("inventories ready objects with key, version, size and content hash", () => {
    // Only `ready` rows have bytes that must exist; `uploading` and `pending_delete`
    // rows are excluded, because the sweeper deletes their objects
    // (mediaRepository.ts abandoned/pending) and a backup must not claim them.
    expect(MEDIA_INVENTORY_QUERY).toContain("media_objects");
    expect(MEDIA_INVENTORY_QUERY).toContain("media_assets");
    expect(MEDIA_INVENTORY_QUERY).toMatch(/status\s*=\s*'ready'/);
    expect(MEDIA_INVENTORY_QUERY).toContain("object_key");
    expect(MEDIA_INVENTORY_QUERY).toContain("content_sha256");
    expect(MEDIA_INVENTORY_QUERY).toContain("storage_version_id");
  });

  it("parses the inventory and rejects a key outside the environment prefix", () => {
    const row = (key: string) => JSON.stringify({ media_id: MEDIA, object_key: key, bytes: 10, sha256: "a".repeat(64), version: null });
    expect(parseMediaInventory(`${row(`prod/${ACCOUNT}/${MEDIA}`)}\n`, "prod")).toHaveLength(1);
    expect(() => parseMediaInventory(`${row(`qa/${ACCOUNT}/${MEDIA}`)}\n`, "prod")).toThrow(/outside the prod prefix/);
    // A key with extra segments is one no application path could have written.
    expect(() => parseMediaInventory(`${row(`prod/backups/x/${MEDIA}`)}\n`, "prod")).toThrow(/outside the prod prefix/);
  });

  it("copies bytes server-side into the backup prefix", () => {
    const command = buildMediaCopyCommand({
      bucket: "explorers-media",
      sourceKey: `prod/${ACCOUNT}/${MEDIA}`,
      destinationPrefix: "prod/backups/20261018T020000Z-scheduled-aaaaaaaa/media/",
    });
    const rendered = command.args.join(" ");
    expect(command.args).toContain(command.args.find(arg => arg.startsWith("amazon/aws-cli@sha256:")));
    // Server-side: no egress, no host disk, and the copy inherits the bucket's
    // existing encryption posture.
    expect(rendered).toContain(`s3 cp s3://explorers-media/prod/${ACCOUNT}/${MEDIA} s3://explorers-media/prod/backups/20261018T020000Z-scheduled-aaaaaaaa/media/${ACCOUNT}/${MEDIA}`);
    // Credentials pass by name only; values never appear on a command line.
    expect(rendered).not.toMatch(/AWS_SECRET_ACCESS_KEY=/);
    // The destination has more than three path segments, so assertObjectKey
    // (objectStorage.ts) rejects it on every application path.
    expect(command.destinationKey.split("/").length).toBeGreaterThan(3);
  });

  it("marks the backup incomplete when a referenced object did not copy", () => {
    const inventory = [{ object_key: "prod/a/b", bytes: 10, sha256: "a".repeat(64), version: null }];
    expect(() => assertMediaInventoryComplete(inventory, { copied: [], failed: ["prod/a/b"] }))
      .toThrow(/1 referenced object/);
    expect(assertMediaInventoryComplete(inventory, { copied: ["prod/a/b"], failed: [] })).toBe(true);
  });
});

describe("archive, encrypt and publish", () => {
  it("encrypts to a recipient from a pinned image with no network, and never to a passphrase", () => {
    const command = buildEncryptCommand({ recipient: RECIPIENT, directory: "/work", inputName: "a.tar", outputName: "a.tar.age" });
    expect(command.args).toEqual(["run", "--rm", "--network", "none", "--volume", "/work:/work",
      "explorers-backup-age:1.2.1-r0-alpine3.20", "--encrypt", "--recipient", RECIPIENT, "--output", "/work/a.tar.age", "/work/a.tar"]);
    // A passphrase would have to live on the host, which is the thing we are
    // protecting against.
    expect(command.args).not.toContain("--passphrase");
  });

  it("decrypts only with an identity file mounted read-only", () => {
    const command = buildDecryptCommand({ identityPath: "/keys/identity.age", directory: "/work", inputName: "a.tar.age", outputName: "a.tar" });
    expect(command.args.join(" ")).toContain("/keys/identity.age:/identity/key.age:ro");
    expect(command.args).toContain("--decrypt");
    expect(command.args).toContain("none");
  });

  it("uploads the ciphertext under prod/backups/ with no ACL change", () => {
    const command = buildUploadCommand({ bucket: "explorers-media", localPath: "/tmp/a.tar.age",
      key: "prod/backups/20261018T020000Z-scheduled-aaaaaaaa/archive.tar.age" });
    expect(command.args.join(" ")).toContain("s3://explorers-media/prod/backups/20261018T020000Z-scheduled-aaaaaaaa/archive.tar.age");
    expect(command.args).not.toContain("--acl");
    expect(() => buildUploadCommand({ bucket: "explorers-media", localPath: "/tmp/a", key: `prod/${ACCOUNT}/${MEDIA}` }))
      .toThrow(/backups prefix/);
  });

  const manifestInput = () => ({
    runId: "a".repeat(32), environment: "prod", reason: "pre-deploy",
    startedAt: "2026-10-18T02:00:00.000Z", completedAt: "2026-10-18T02:03:11.000Z",
    sourceCommit: "c".repeat(40), imageDigest: `sha256:${"d".repeat(64)}`,
    migrationMarker: "0056_explorers_app_enrichment_jobs",
    journalChecksum: "e".repeat(64), schemaChecksum: "f".repeat(64),
    archive: { key: "prod/backups/20261018T020000Z-pre-deploy-aaaaaaaa/archive.tar.age", bytes: 4096, sha256: "1".repeat(64) },
    members: [
      { name: "database/dump.pgc", bytes: 2048, sha256: "2".repeat(64) },
      { name: "database/globals.sql", bytes: 64, sha256: "3".repeat(64) },
      { name: "host/configuration.tar", bytes: 64, sha256: "5".repeat(64) },
      { name: "media/inventory.jsonl", bytes: 64, sha256: "6".repeat(64) },
    ],
    roles: ["music_runtime", "app_enrichment_worker", "app_enrichment_worker_owner",
      "app_enrichment_retention", "app_enrichment_retention_owner"],
    migratorRole: "explorers_migrator", runtimeLoginRole: "explorers_runtime", databaseName: "explorers",
    media: { objects: 1, bytes: 10, prefix: "prod/backups/20261018T020000Z-pre-deploy-aaaaaaaa/media/" },
    tableRowCounts: { creator_accounts: 2 },
  });

  it("builds a manifest that the recovery contract accepts", () => {
    expect(() => backupManifestSchema.parse(buildManifest(manifestInput()))).not.toThrow();
  });

  it("refuses to build a complete manifest when a required member is absent", () => {
    expect(() => buildManifest({ ...manifestInput(), members: [{ name: "database/dump.pgc", bytes: 1, sha256: "2".repeat(64) }] }))
      .toThrow(/required member/);
  });
});

describe("retention", () => {
  const run = (day: number, reason: string) => ({
    key: `prod/backups/${runFolderName(new Date(Date.UTC(2026, 9, day, 2, 0, 0)), reason, "a".repeat(32))}/archive.tar.age`,
    completedAt: new Date(Date.UTC(2026, 9, day, 2, 0, 0)).toISOString(),
    reason,
  });

  it("keeps the documented windows", () => {
    expect(RETENTION).toEqual({ scheduledDays: 14, preDeployDays: 30, monthlyCount: 12 });
  });

  it("names run folders so a listing alone can plan retention", () => {
    const name = runFolderName(new Date(Date.UTC(2026, 9, 18, 2, 17, 5)), "pre-deploy", "0123456789abcdef0123456789abcdef");
    expect(name).toBe("20261018T021705Z-pre-deploy-01234567");
    expect(parseRunFolder(name)).toEqual({ completedAt: "2026-10-18T02:17:05.000Z", reason: "pre-deploy" });
    expect(parseRunFolder("not-a-run")).toBeUndefined();
  });

  it("keeps 14 dailies and deletes the rest", () => {
    const runs = Array.from({ length: 20 }, (_, index) => run(20 - index, "scheduled"));
    const plan = planRetention(runs, { now: Date.parse("2026-10-20T03:00:00.000Z") });
    expect(plan.keep).toHaveLength(14);
    expect(plan.delete).toHaveLength(6);
  });

  it("keeps a pre-deploy backup for longer than a scheduled one", () => {
    const plan = planRetention([run(1, "pre-deploy"), run(1, "scheduled")],
      { now: Date.parse("2026-10-20T03:00:00.000Z") });
    expect(plan.keep.map(entry => entry.reason)).toEqual(["pre-deploy"]);
  });

  it("never deletes the newest backup, however old", () => {
    const plan = planRetention([run(1, "scheduled")], { now: Date.parse("2027-10-20T03:00:00.000Z") });
    expect(plan.delete).toEqual([]);
  });

  it("never plans a delete outside the backups prefix", () => {
    expect(() => planRetention([{ key: "prod/aaaa/bbbb", completedAt: run(1, "scheduled").completedAt, reason: "scheduled" }],
      { now: Date.parse("2026-10-20T03:00:00.000Z") })).toThrow(/outside the backups prefix/);
  });

  it("reports a named gate rather than failing when deletion is denied", () => {
    const outcome = applyRetention({ delete: [run(1, "scheduled")], keep: [] },
      { remove: () => { throw new Error("AccessDenied"); } });
    expect(outcome).toEqual({ pruned: 0, gate: "BACKUP_DELETE_PERMISSION_UNAVAILABLE" });
  });

  it("removes whole run folders, never a single member", () => {
    const removed: string[] = [];
    expect(applyRetention({ delete: [run(1, "scheduled")], keep: [] }, { remove: (prefix: string) => { removed.push(prefix); } }))
      .toEqual({ pruned: 1 });
    expect(removed).toEqual([`prod/backups/${runFolderName(new Date(Date.UTC(2026, 9, 1, 2)), "scheduled", "a".repeat(32))}/`]);
  });
});

import {
  PERMITTED_RESTORE_ROLES, RESTORE_DEPARSE_REPAIRS, RestoredMediaStore, assertReceiptDirectory, buildDeparseRepairStatements, assertRestoredSchema, assertRowCounts,
  buildDrillReceipt, buildRestoreCommand, drillProbePlan, planRoleBootstrap, signSessionCookie, writeDrillReceipt,
} from "../../../../scripts/platform-restore-drill";
import { PUBLIC_RECOMMENDATION_CATEGORIES } from "../../../server/publicProfile/publicProfilePolicy";
import { createHmac, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";

describe("role bootstrap", () => {
  const globals = [
    "CREATE ROLE music_runtime;",
    "ALTER ROLE music_runtime WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION NOBYPASSRLS;",
    "CREATE ROLE app_enrichment_worker;",
    "ALTER ROLE app_enrichment_worker WITH NOSUPERUSER NOINHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION NOBYPASSRLS;",
    "CREATE ROLE app_enrichment_worker_owner;",
    "CREATE ROLE app_enrichment_retention;",
    "CREATE ROLE app_enrichment_retention_owner;",
    "CREATE ROLE explorers_migrator;",
    "ALTER ROLE explorers_migrator WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS;",
    "CREATE ROLE explorers_runtime;",
  ].join("\n");

  const manifest = { roles: [...PERMITTED_RESTORE_ROLES], migratorRole: "explorers_migrator", runtimeLoginRole: "explorers_runtime" };

  it("creates exactly the five capability roles plus a stand-in for the production migrator", () => {
    const plan = planRoleBootstrap(globals, manifest, { existingRoles: ["music_migrator"] });
    expect(plan.create).toEqual([
      "music_runtime", "app_enrichment_worker", "app_enrichment_worker_owner",
      "app_enrichment_retention", "app_enrichment_retention_owner", "explorers_migrator",
    ]);
    // prepareAppWorkerCustody creates the four Apps roles NOINHERIT and 0056 asserts it.
    expect(plan.statements.join("\n")).toContain("CREATE ROLE app_enrichment_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS");
    expect(plan.statements.join("\n")).toContain("CREATE ROLE music_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS");
  });

  it("gives the migrator stand-in the attributes the backup recorded, because SECURITY DEFINER functions run as it", () => {
    // provision_music_runtime_login (migrations/0010) creates the runtime login with
    // its owner's authority. Found during execution: an unprivileged stand-in fails
    // with "permission denied to create role".
    expect(planRoleBootstrap(globals, manifest, { existingRoles: ["music_migrator"] }).statements.at(-1))
      .toBe("CREATE ROLE explorers_migrator NOLOGIN SUPERUSER INHERIT CREATEROLE CREATEDB REPLICATION BYPASSRLS");
    expect(() => planRoleBootstrap(globals.replace(/^ALTER ROLE explorers_migrator.*$/m, ""), manifest, { existingRoles: [] }))
      .toThrow(/does not record the attributes/);
  });

  it("never creates a login or a password, and never privileges a capability role", () => {
    const statements = planRoleBootstrap(globals, manifest, { existingRoles: ["music_migrator"] }).statements;
    const rendered = statements.join("\n");
    expect(rendered).not.toMatch(/PASSWORD/);
    expect(rendered).not.toMatch(/ LOGIN/);
    expect(statements.slice(0, 5).join("\n")).not.toMatch(/ SUPERUSER| CREATEROLE| CREATEDB| BYPASSRLS/);
    // 0056 refuses if app_enrichment_worker has any member.
    expect(rendered).not.toMatch(/GRANT /);
  });

  it("refuses a role the manifest declares that is not a permitted capability role", () => {
    expect(() => planRoleBootstrap(`${globals}\nCREATE ROLE attacker;`,
      { ...manifest, roles: [...manifest.roles, "attacker"] }, { existingRoles: [] }))
      .toThrow(/not a permitted restore role/);
    expect(PERMITTED_RESTORE_ROLES).toEqual(["music_runtime", "app_enrichment_worker",
      "app_enrichment_worker_owner", "app_enrichment_retention", "app_enrichment_retention_owner"]);
  });

  it("refuses a manifest role the globals capture does not declare", () => {
    expect(() => planRoleBootstrap("CREATE ROLE music_runtime;", manifest, { existingRoles: [] }))
      .toThrow(/absent from the globals capture/);
  });

  it("skips a role the disposable cluster already has", () => {
    const plan = planRoleBootstrap(globals, manifest, { existingRoles: ["music_migrator", "music_runtime"] });
    expect(plan.create).not.toContain("music_runtime");
  });
});

describe("pg_restore invocation", () => {
  it("restores with owners and ACLs into a single transaction and stops on error", () => {
    const command = buildRestoreCommand({ containerId: "a".repeat(64), database: "explorers_restore_drill_aaaaaaaa",
      user: "music_migrator", dumpPath: "/restore/dump.pgc" });
    expect(command.args.slice(0, 3)).toEqual(["exec", "a".repeat(64), "pg_restore"]);
    expect(command.args).toContain("--exit-on-error");
    expect(command.args).toContain("--single-transaction");
    expect(command.args).not.toContain("--no-owner");
    expect(command.args).not.toContain("--no-acl");
    expect(command.args).not.toContain("--clean");
  });

  it("refuses a database outside the drill namespace", () => {
    expect(() => buildRestoreCommand({ containerId: "a".repeat(64), database: "explorers", user: "music_migrator", dumpPath: "/r" }))
      .toThrow(/drill namespace/);
  });
});

describe("known restore deparse drift", () => {
  it("re-declares each constraint from text that appears verbatim in its source migration", () => {
    for (const repair of RESTORE_DEPARSE_REPAIRS) {
      const source = readFileSync(resolve(import.meta.dirname, "../../../migrations", repair.source), "utf8");
      expect(source).toContain(`CHECK (${repair.check})`);
    }
  });

  it("repairs only constraints that exist, keeping their names", () => {
    const statements = buildDeparseRepairStatements(new Set(["music_publication_operations.music_publication_operations_request_mode_check"]));
    expect(statements).toEqual([
      "ALTER TABLE public.music_publication_operations DROP CONSTRAINT music_publication_operations_request_mode_check, " +
      "ADD CONSTRAINT music_publication_operations_request_mode_check CHECK (request_mode IN ('private','unlisted','public'))",
    ]);
    expect(buildDeparseRepairStatements(new Set())).toEqual([]);
  });
});

describe("restore fidelity oracle", () => {
  const state = {
    ready: true, currentId: "0056_explorers_app_enrichment_jobs",
    currentChecksum: "e".repeat(64), schemaChecksum: "f".repeat(64),
    appliedIds: Array.from({ length: 56 }, (_, index) => `${String(index + 1).padStart(4, "0")}_x`),
    pendingIds: [] as string[],
  };
  const manifest = { migrationMarker: "0056_explorers_app_enrichment_jobs",
    journalChecksum: "e".repeat(64), schemaChecksum: "f".repeat(64) };

  it("accepts a restore whose journal and live fingerprint both match the manifest", () => {
    expect(assertRestoredSchema(state, manifest)).toEqual({ rows: 56, currentId: state.currentId, pending: [] });
  });

  it("reports pending migrations for migrate-forward instead of refusing them", () => {
    // Found during execution: restore-forward is the only recovery (see the plan's
    // migration constraint), so a backup older than the drill's code must restore
    // and then migrate forward, not be refused.
    expect(assertRestoredSchema({ ...state, ready: false, pendingIds: ["0057_x"] }, manifest).pending).toEqual(["0057_x"]);
  });

  it.each([
    ["a different chain tip", { currentId: "0055_explorers_app_enrichment" }],
    ["a different migration checksum", { currentChecksum: "0".repeat(64) }],
    // This is the case that catches a lossy dump: the journal row inside the dump
    // records the fingerprint the migration produced, and inspectMusicDatabase
    // recomputes it live (migrate.ts inspectWithClient). If pg_restore dropped a
    // default, a trigger, an index or a function body, the two disagree.
    ["a drifted schema fingerprint", { schemaChecksum: "0".repeat(64) }],
    ["an unready journal with nothing pending", { ready: false }],
  ])("refuses %s", (_name, override) => {
    expect(() => assertRestoredSchema({ ...state, ...override }, manifest)).toThrow(/restored schema/);
  });

  it("compares every table's row count against the manifest and names the first divergence", () => {
    expect(assertRowCounts({ creator_accounts: 2, auth_user: 2 }, { creator_accounts: 2, auth_user: 2 })).toBe(true);
    expect(() => assertRowCounts({ creator_accounts: 1, auth_user: 2 }, { creator_accounts: 2, auth_user: 2 }))
      .toThrow(/creator_accounts/);
    expect(() => assertRowCounts({ creator_accounts: 2 }, { creator_accounts: 2, auth_user: 2 }))
      .toThrow(/auth_user/);
  });
});

describe("restored media store", () => {
  it("reports the backup's environment so resolveMediaContent admits its keys unchanged", () => {
    // media.ts refuses any row whose storage_environment differs from the store's.
    // LocalObjectStorage hard-codes "local", so a prod-keyed restore cannot be served
    // through it without mutating data.
    expect(new RestoredMediaStore(tmpdir(), "prod").environment).toBe("prod");
  });

  it("serves bytes by the original key", async () => {
    const root = mkdtempSync(join(tmpdir(), "restored-media-"));
    const key = `prod/${ACCOUNT}/${MEDIA}`;
    try {
      mkdirSync(join(root, "prod", ACCOUNT), { recursive: true });
      writeFileSync(join(root, "prod", ACCOUNT, MEDIA), Buffer.from("bytes"));
      const store = new RestoredMediaStore(root, "prod");
      expect((await store.get(key)).toString()).toBe("bytes");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("refuses a key outside the environment prefix and refuses every write", async () => {
    const store = new RestoredMediaStore(tmpdir(), "prod");
    await expect(store.get(`local/${ACCOUNT}/${MEDIA}`)).rejects.toThrow(/key/);
    await expect(store.put(`prod/${ACCOUNT}/${MEDIA}`, Buffer.alloc(0))).rejects.toThrow(/read-only/);
    await expect(store.delete(`prod/${ACCOUNT}/${MEDIA}`)).rejects.toThrow(/read-only/);
  });
});

describe("drill probe plan", () => {
  it("covers liveness, readiness, an unauthenticated principal and every public category", () => {
    const plan = drillProbePlan({ handle: "owner" });
    expect(plan.map(probe => probe.path)).toContain("/health/live");
    expect(plan.map(probe => probe.path)).toContain("/health/ready");
    expect(plan.find(probe => probe.path === "/api/explorers/v1/me")?.expect).toEqual([401]);
    for (const category of PUBLIC_RECOMMENDATION_CATEGORIES) {
      expect(plan.map(probe => probe.path)).toContain(`/api/explorers/v1/profiles/owner/recommendations/${category}`);
    }
  });

  it("derives categories from the public policy rather than a literal list", () => {
    // Found during execution: the plan probed categoryKeys, which still includes music
    // and has no public route. PUBLIC_RECOMMENDATION_CATEGORIES is what the route serves.
    expect(drillProbePlan({ handle: "owner" }).filter(probe => probe.category).length).toBe(PUBLIC_RECOMMENDATION_CATEGORIES.length);
  });

  it("probes only health when the restored database has no public profile", () => {
    expect(drillProbePlan({ handle: undefined }).some(probe => probe.category)).toBe(false);
  });
});

describe("restored session authentication", () => {
  it("signs a restored session token exactly as Better Auth's cookie signer does", () => {
    // The format the existing integration suites authenticate with
    // (book-catalog.integration.test.ts persona()).
    const secret = randomBytes(32).toString("hex");
    expect(signSessionCookie("better-auth.session_token", "tok", secret))
      .toBe(`better-auth.session_token=tok.${createHmac("sha256", secret).update("tok").digest("base64")}`);
  });
});

describe("drill receipt", () => {
  const receiptInput = () => ({
    runId: "b".repeat(32), result: "passed" as const, drilledAt: "2026-10-18T09:14:00.000Z",
    drillCommit: "c".repeat(40), manifestDigest: "7".repeat(64),
    migrationMarker: "0056_explorers_app_enrichment_jobs", schemaChecksum: "f".repeat(64),
    cleanup: "database-dropped-container-removed" as const,
    phases: [{ phase: "pg-restore", milliseconds: 1000 }, { phase: "boot", milliseconds: 500 }],
    proofs: {
      journal: { rows: 56, currentId: "0056_explorers_app_enrichment_jobs" },
      identity: { authUsers: 2, authSessions: 1, creatorAccounts: 2 },
      categories: { books: 2 }, media: { objects: 1, hashesMatched: 1, gatedRouteResolved: 1 },
      rowCountsMatched: true,
    },
  });

  it("requires a fresh directory directly under the system temp directory", () => {
    const parent = tmpdir();
    const fresh = join(parent, `platform-restore-drill-${randomBytes(4).toString("hex")}`);
    expect(assertReceiptDirectory(fresh)).toBe(resolve(fresh));
    // The e2e runner's rule, for the same reason: a pre-existing directory could
    // already hold a receipt someone would read as this run's evidence.
    const existing = mkdtempSync(join(parent, "platform-restore-drill-exists-"));
    try { expect(() => assertReceiptDirectory(existing)).toThrow(/must not exist/); }
    finally { rmSync(existing, { recursive: true, force: true }); }
    expect(() => assertReceiptDirectory("relative/dir")).toThrow(/absolute/);
    expect(() => assertReceiptDirectory(join(parent, "nested", "platform-restore-drill-aaaaaaaa"))).toThrow(/temp/);
    expect(() => assertReceiptDirectory(join(parent, "wrong-prefix-aaaaaaaa"))).toThrow(/name/);
  });

  it("sums phase timings into the recovery measurement", () => {
    const receipt = buildDrillReceipt(receiptInput());
    expect(receipt.recoveryMilliseconds).toBe(1500);
    expect(() => drillReceiptSchema.parse(receipt)).not.toThrow();
  });

  it("writes the receipt owner-only and refuses to overwrite one", () => {
    const directory = join(tmpdir(), `platform-restore-drill-${randomBytes(4).toString("hex")}`);
    try {
      const receipt = buildDrillReceipt(receiptInput());
      const path = writeDrillReceipt(directory, receipt);
      expect(existsSync(path)).toBe(true);
      expect(JSON.parse(readFileSync(path, "utf8")).version).toBe("explorers-platform-restore-drill/v1");
      expect(() => writeDrillReceipt(directory, receipt)).toThrow();
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("records a failed drill rather than throwing it away", () => {
    const receipt = buildDrillReceipt({ ...receiptInput(), result: "failed", cleanup: "leaked", failure: "pg-restore: exit 1" });
    expect(drillReceiptSchema.parse(receipt).result).toBe("failed");
  });
});

import { evaluateGate, parseGateCommand } from "../../../../scripts/platform-recovery-gate";

describe("recovery evidence gate", () => {
  const args = ["--manifest", "m.json", "--receipt", "r.json",
    "--candidate-digest", `sha256:${"d".repeat(64)}`, "--candidate-commit", "c".repeat(40),
    "--candidate-marker", "0056_explorers_app_enrichment_jobs"];

  it("requires both documents and the candidate identity", () => {
    expect(parseGateCommand(args).candidate).toEqual({ digest: `sha256:${"d".repeat(64)}`, commit: "c".repeat(40),
      migrationMarker: "0056_explorers_app_enrichment_jobs" });
  });

  it.each([
    [["--manifest", "m.json"]],
    [["--manifest", "m.json", "--receipt", "r.json"]],
    [[...args.slice(0, 4), "--candidate-digest", "latest", ...args.slice(6)]],
    // There is deliberately no --assume-verified, --force or --skip flag: the ticket
    // requires the step "cannot be satisfied by a manually asserted input"
    // (ticket-8-4.md:69).
    [[...args, "--assume-verified", "true"]],
    [[...args, "--force"]],
  ])("rejects %j", (input) => expect(() => parseGateCommand(input)).toThrow(/arguments rejected/));

  it("exits non-zero with the refusal code on unusable evidence", () => {
    const outcome = evaluateGate({ manifest: {}, receipt: {},
      candidate: { digest: `sha256:${"d".repeat(64)}`, commit: "c".repeat(40), migrationMarker: "0056_x" },
      now: Date.now() });
    expect(outcome).toEqual({ exitCode: 1, code: "BACKUP_INVALID" });
  });

  it("admits a fresh production backup with a marker-matched passing drill", () => {
    expect(evaluateGate({ manifest: manifest(), receipt: receipt(), candidate: candidate(),
      now: Date.parse("2026-10-18T02:05:00.000Z") })).toEqual({ exitCode: 0 });
  });

  it("ships a committed drill receipt the deploy gate can read", () => {
    // docs/replatform/evidence/recovery-receipt.json is what explorers.yml's gate reads.
    const committed = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../../docs/replatform/evidence/recovery-receipt.json"), "utf8"));
    expect(drillReceiptSchema.parse(committed).result).toBe("passed");
    expect(committed.cleanup).toBe("database-dropped-container-removed");
    expect(committed.proofs.rowCountsMatched).toBe(true);
    expect(committed.proofs.media.hashesMatched).toBe(committed.proofs.media.objects);
  });
});
