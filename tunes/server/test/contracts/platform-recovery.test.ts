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
