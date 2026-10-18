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
