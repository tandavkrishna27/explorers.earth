import { createHash } from "node:crypto";
import { z } from "zod/v3";

/** Freshness budgets. A backup older than this cannot authorize a deploy; a drill
 *  older than this cannot either. Both are deliberately short enough that the
 *  owner notices the gate rather than the incident. */
export const BACKUP_FRESHNESS_MS = 2 * 60 * 60 * 1000;
export const DRILL_FRESHNESS_MS = 30 * 24 * 60 * 60 * 1000;

/** Members every restore candidate must carry. Host configuration and the media
 *  inventory are listed because a database-only archive cannot restore a working
 *  system. The music engine's signed authority directories are not a member: the
 *  canonical launch path (deploy/host/explorers-deploy.sh) has no signed ledger. */
export const REQUIRED_ARCHIVE_MEMBERS = [
  "database/dump.pgc",
  "database/globals.sql",
  "host/configuration.tar",
  "media/inventory.jsonl",
] as const;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.string().datetime({ offset: false }).refine(v => Number.isFinite(Date.parse(v)));
const roleName = z.string().regex(/^[a-z_][a-z0-9_]{1,62}$/);
const migrationMarker = z.string().regex(/^[0-9]{4}_[a-z0-9_]+$/);
const archiveMember = z.object({ name: z.string().min(1).max(256), bytes: z.number().int().nonnegative(), sha256 }).strict();

export const backupManifestSchema = z.object({
  version: z.literal("explorers-platform-backup/v1"),
  runId: z.string().regex(/^[a-f0-9]{32}$/),
  environment: z.enum(["prod", "local"]),
  startedAt: instant,
  completedAt: instant,
  // A partial capture is recorded with complete:false so it is auditable, and is
  // refused here so it can never become a restore candidate.
  complete: z.literal(true),
  reason: z.enum(["scheduled", "pre-deploy", "manual"]),
  /** The image the backup authorizes: the candidate for a pre-deploy backup, the
   *  running image otherwise. */
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
  imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  /** The database's own journal head at capture time - not the candidate's. */
  migrationMarker,
  journalChecksum: sha256,
  schemaChecksum: sha256,
  archive: z.object({ key: z.string().min(1), bytes: z.number().int().positive(), sha256 }).strict(),
  members: z.array(archiveMember).min(REQUIRED_ARCHIVE_MEMBERS.length),
  roles: z.array(roleName).min(1),
  migratorRole: roleName,
  runtimeLoginRole: roleName,
  databaseName: roleName,
  media: z.object({ objects: z.number().int().nonnegative(), bytes: z.number().int().nonnegative(), prefix: z.string().min(1) }).strict(),
  tableRowCounts: z.record(z.string().regex(/^[a-z_][a-z0-9_]*$/), z.number().int().nonnegative()),
}).strict()
  .refine(m => REQUIRED_ARCHIVE_MEMBERS.every(name => m.members.some(member => member.name === name)),
    { message: "archive is missing a required member" })
  .refine(m => m.archive.key.startsWith(`${m.environment}/backups/`) && m.media.prefix.startsWith(`${m.environment}/backups/`),
    { message: "archive and media copies must live under the environment's backups prefix" })
  .refine(m => m.migratorRole !== m.runtimeLoginRole, { message: "migrator and runtime login must differ" })
  .refine(m => Date.parse(m.completedAt) >= Date.parse(m.startedAt), { message: "completedAt precedes startedAt" });

export type BackupManifest = z.infer<typeof backupManifestSchema>;

export const drillReceiptSchema = z.object({
  version: z.literal("explorers-platform-restore-drill/v1"),
  runId: z.string().regex(/^[a-f0-9]{32}$/),
  result: z.enum(["passed", "failed"]),
  drilledAt: instant,
  drillCommit: z.string().regex(/^[a-f0-9]{40}$/),
  manifestDigest: sha256,
  /** The marker of the backup that was restored. */
  migrationMarker,
  schemaChecksum: sha256,
  cleanup: z.enum(["database-dropped-container-removed", "leaked"]),
  phases: z.array(z.object({ phase: z.string().min(1), milliseconds: z.number().int().nonnegative() }).strict()).min(1),
  recoveryMilliseconds: z.number().int().nonnegative(),
  failure: z.string().max(500).optional(),
  proofs: z.object({
    journal: z.object({ rows: z.number().int().positive(), currentId: z.string() }).strict(),
    identity: z.object({ authUsers: z.number().int().nonnegative(), authSessions: z.number().int().nonnegative(), creatorAccounts: z.number().int().nonnegative() }).strict(),
    categories: z.record(z.string(), z.number().int().nonnegative()),
    media: z.object({ objects: z.number().int().nonnegative(), hashesMatched: z.number().int().nonnegative(), gatedRouteResolved: z.number().int().nonnegative() }).strict(),
    rowCountsMatched: z.boolean(),
  }).strict(),
}).strict();

export type DrillReceipt = z.infer<typeof drillReceiptSchema>;

/** Key-order-independent digest. Mirrors the `canonical()` + `digest()` pair in
 *  `scripts/replatform-e2e.mjs` so receipts here hash the same way the e2e ones do. */
export function canonicalRecoveryDigest(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical);
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.entries(input as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, entry]) => [key, canonical(entry)]));
    }
    return input;
  };
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export type RecoveryEvidenceCode =
  | "BACKUP_INVALID" | "BACKUP_STALE" | "BACKUP_CANDIDATE_MISMATCH"
  | "DRILL_INVALID" | "DRILL_FAILED" | "DRILL_STALE" | "DRILL_MARKER_MISMATCH";

const markerRank = (marker: string) => Number(marker.slice(0, 4));

/** The ticket-8.4 acceptance join, as a predicate rather than as prose. It fails
 *  closed: anything it cannot parse is a refusal, and no caller-supplied claim
 *  can substitute for a manifest and a receipt.
 *
 *  The backup must be a production backup taken for this exact candidate (digest
 *  and commit), and the candidate may not be older than the database it backed
 *  up. The drill must have restored a backup at the same schema level as this
 *  one - that is the level a restore would land on if this deploy goes wrong. */
export function verifyRecoveryEvidence(input: {
  manifest: unknown;
  receipt: unknown;
  candidate: { digest: string; commit: string; migrationMarker: string };
  now: number;
}): { admitted: true } | { admitted: false; code: RecoveryEvidenceCode } {
  const manifest = backupManifestSchema.safeParse(input.manifest);
  if (!manifest.success || manifest.data.environment !== "prod") return { admitted: false, code: "BACKUP_INVALID" };
  const receipt = drillReceiptSchema.safeParse(input.receipt);
  if (!receipt.success) return { admitted: false, code: "DRILL_INVALID" };
  if (input.now - Date.parse(manifest.data.completedAt) > BACKUP_FRESHNESS_MS) return { admitted: false, code: "BACKUP_STALE" };
  if (manifest.data.imageDigest !== input.candidate.digest
    || manifest.data.sourceCommit !== input.candidate.commit
    || !/^[0-9]{4}_[a-z0-9_]+$/.test(input.candidate.migrationMarker)
    || markerRank(input.candidate.migrationMarker) < markerRank(manifest.data.migrationMarker)) {
    return { admitted: false, code: "BACKUP_CANDIDATE_MISMATCH" };
  }
  if (receipt.data.result !== "passed") return { admitted: false, code: "DRILL_FAILED" };
  if (input.now - Date.parse(receipt.data.drilledAt) > DRILL_FRESHNESS_MS) return { admitted: false, code: "DRILL_STALE" };
  if (receipt.data.migrationMarker !== manifest.data.migrationMarker) return { admitted: false, code: "DRILL_MARKER_MISMATCH" };
  return { admitted: true };
}
