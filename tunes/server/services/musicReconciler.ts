import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const MUSIC_RECONCILIATION_SCHEMA_VERSION = "music-reconciliation/v1" as const;
export const STRAPI_RECONCILIATION_SCHEMA_VERSION = "strapi-music-reconciliation/v1" as const;
export const MUSIC_RECONCILIATION_ORDER = "documentId:asc" as const;

const boundedText = z.string().trim().min(1).max(512);
const accountSchema = z.object({
  documentId: boundedText,
  Account_Name: z.string().trim().max(512).nullable().optional(),
  Account_Type: z.string().trim().max(128).nullable().optional(),
  mobile_number: z.string().trim().max(64).nullable().optional(),
}).strict();
const sourceIdentitySchema = z.object({
  documentId: boundedText,
  username: boundedText,
  email: z.string().email().max(320),
  provider: z.enum(["local", "google"]),
  confirmed: z.literal(true),
  blocked: z.literal(false),
  accounts: z.array(accountSchema).min(1).max(50),
}).strict();
const sourcePageSchema = z.object({
  data: z.array(sourceIdentitySchema),
  meta: z.object({
    pagination: z.object({
      page: z.number().int().positive(),
      pageSize: z.number().int().positive(),
      pageCount: z.number().int().positive(),
      total: z.number().int().nonnegative(),
    }).strict(),
    reconciliation: z.object({
      schemaVersion: z.literal(STRAPI_RECONCILIATION_SCHEMA_VERSION),
      sourceSnapshot: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
      sourceChecksum: z.string().regex(/^[a-f0-9]{64}$/),
      healthy: z.boolean(),
    }).strict(),
  }).strict(),
}).strict();

export interface MusicReconciliationIdentity {
  userDocumentId: string;
  accountDocumentId: string;
  username: string;
  email: string;
  provider: "local" | "google";
  accountName: string;
  accountType: string;
  accountMobile: string;
}

export interface ReconciliationSourceMetadata {
  schemaVersion: typeof STRAPI_RECONCILIATION_SCHEMA_VERSION;
  sourceSnapshot: string;
  sourceChecksum: string;
  total: number;
  pageCount: number;
}

export interface ReconciliationReview {
  scanNonce: string;
  source: ReconciliationSourceMetadata;
  planFingerprint: string;
  approvalToken: string;
}

export type ReconciliationAnomalyCode =
  | "LOCK_HELD"
  | "SOURCE_SCHEMA"
  | "SOURCE_UNHEALTHY"
  | "SOURCE_COUNT"
  | "SOURCE_TRUNCATED"
  | "SOURCE_DUPLICATE"
  | "SOURCE_REORDERED"
  | "SOURCE_DRIFT"
  | "SOURCE_CHECKSUM"
  | "SOURCE_UNAVAILABLE"
  | "APPLY_ENVIRONMENT_INELIGIBLE"
  | "APPLY_DISABLED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_INVALID"
  | "PLAN_DRIFT"
  | "CHANGE_THRESHOLD"
  | "TOMBSTONE_CONFLICT"
  | "LISTENER_UNAVAILABLE"
  | "DATABASE_UNAVAILABLE";

export interface ReconciliationAnomaly {
  code: ReconciliationAnomalyCode;
  message: string;
}

export interface ReconciliationDatabaseResult {
  status: "safe" | "anomaly";
  localTotal: number;
  eligibleTotal: number;
  matched: number;
  missing: number;
  firstMisses: number;
  secondMisses: number;
  projectedUpdates: number;
  proposedChangePercent: number;
  suspended: number;
  tombstoneConflicts: number;
  planFingerprint: string;
  databaseBatches: number;
  applied: boolean;
  anomalies: ReconciliationAnomaly[];
}

export interface ReconciliationDatabaseInput {
  runId: string;
  identities: MusicReconciliationIdentity[];
  source: ReconciliationSourceMetadata;
  observationVersion: string;
  batchSize: number;
  maxRows: number;
  maxChangeAbsolute: number;
  maxChangePercent: number;
  databaseLockTimeoutMs: number;
  databaseStatementTimeoutMs: number;
  databaseIdleTransactionTimeoutMs: number;
  requireSuspensionListener: boolean;
  apply: boolean;
  expectedPlanFingerprint?: string;
}

export interface MusicReconciliationSession {
  reconcileValidatedScan(input: ReconciliationDatabaseInput): Promise<ReconciliationDatabaseResult>;
}

export interface MusicReconciliationRepository {
  withAdvisoryLock<T>(work: (session: MusicReconciliationSession) => Promise<T>): Promise<
    { acquired: false } | { acquired: true; value: T }
  >;
}

export interface MusicReconciliationSource {
  fetchPage(request: {
    page: number;
    pageSize: number;
    order: typeof MUSIC_RECONCILIATION_ORDER;
    sourceSnapshot?: string;
    timeoutMs?: number;
  }): Promise<unknown>;
}

export interface MusicReconciliationRunInput {
  runId: string;
  scanNonce?: string;
  environment: "fixture" | "staging" | "production";
  applyEnabled: boolean;
  requestedMode?: "dry-run" | "apply";
  approvalToken?: string;
  review?: ReconciliationReview;
  expectedSource?: ReconciliationSourceMetadata;
  pageSize: number;
  maxRows: number;
  batchSize: number;
  maxChangeAbsolute: number;
  maxChangePercent: number;
  maxPages?: number;
  scanTimeoutMs?: number;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
  maxCanonicalBytes?: number;
  databaseLockTimeoutMs?: number;
  databaseStatementTimeoutMs?: number;
  databaseIdleTransactionTimeoutMs?: number;
  onSourceCheckpoint?: (source: Partial<ReconciliationSourceMetadata> & { nextPage: number }) => Promise<void> | void;
}

export interface MusicReconciliationReport {
  schemaVersion: typeof MUSIC_RECONCILIATION_SCHEMA_VERSION;
  runId: string;
  scanNonce: string;
  status: "success" | "blocked";
  mode: "dry-run" | "apply";
  source?: ReconciliationSourceMetadata;
  local?: { total: number; eligible: number };
  changes?: {
    matched: number;
    missing: number;
    firstMisses: number;
    secondMisses: number;
    projectedUpdates: number;
    proposedChangePercent: number;
    suspended: number;
    tombstoneConflicts: number;
    applied: boolean;
  };
  thresholds?: { maxChangeAbsolute: number; maxChangePercent: number };
  metrics: { pages: number; databaseBatches: number; durationMs: number };
  anomalies: ReconciliationAnomaly[];
  planFingerprint?: string;
  approvalToken?: string;
}

interface ValidatedScan {
  identities: MusicReconciliationIdentity[];
  source: ReconciliationSourceMetadata;
  pages: number;
}

class ScanFailure extends Error {
  constructor(readonly anomaly: ReconciliationAnomaly) {
    super(anomaly.message);
  }
}

export class MusicReconciler {
  constructor(
    private readonly source: MusicReconciliationSource,
    private readonly repository: MusicReconciliationRepository,
    private readonly now: () => number = Date.now,
  ) {}

  async run(input: MusicReconciliationRunInput): Promise<MusicReconciliationReport> {
    const started = this.now();
    const mode = input.requestedMode ?? "dry-run";
    const configurationAnomaly = validateRunInput(input, mode);
    if (configurationAnomaly) return blocked(input.runId, input.scanNonce ?? "", mode, started, this.now(), configurationAnomaly);

    let locked: { acquired: false } | { acquired: true; value: MusicReconciliationReport };
    try {
      locked = await this.repository.withAdvisoryLock(async (session) => {
      let scan: ValidatedScan;
      try {
        scan = await scanSource(this.source, input);
      } catch (error) {
        const scanAnomaly = error instanceof ScanFailure
          ? error.anomaly
          : anomaly("SOURCE_UNAVAILABLE", "The authoritative identity source is unavailable.");
        return blocked(input.runId, input.scanNonce!, mode, started, this.now(), scanAnomaly);
      }
      if ((input.review && !sameSource(input.review.source, scan.source))
          || (input.expectedSource && !sameSource(input.expectedSource, scan.source))) {
        return blocked(input.runId, input.scanNonce!, mode, started, this.now(), anomaly(
          "SOURCE_DRIFT",
          "The authoritative source no longer matches the reviewed scan.",
        ), scan.source, scan.pages);
      }

      let database: ReconciliationDatabaseResult;
      try {
        database = await session.reconcileValidatedScan({
          runId: input.runId,
          identities: scan.identities,
          source: scan.source,
          observationVersion: observationVersion(input.scanNonce!),
          batchSize: input.batchSize,
          maxRows: input.maxRows,
          maxChangeAbsolute: input.maxChangeAbsolute,
          maxChangePercent: input.maxChangePercent,
          databaseLockTimeoutMs: input.databaseLockTimeoutMs ?? 5_000,
          databaseStatementTimeoutMs: input.databaseStatementTimeoutMs ?? 120_000,
          databaseIdleTransactionTimeoutMs: input.databaseIdleTransactionTimeoutMs ?? 30_000,
          requireSuspensionListener: mode === "apply" && input.environment === "staging",
          apply: mode === "apply",
          expectedPlanFingerprint: mode === "apply" ? input.review?.planFingerprint : undefined,
        });
      } catch {
        return blocked(input.runId, input.scanNonce!, mode, started, this.now(), anomaly(
          "DATABASE_UNAVAILABLE",
          "The Music identity database is unavailable.",
        ), scan.source, scan.pages);
      }
      const approvalToken = mode === "dry-run"
        ? createApprovalToken(input, scan.source, database.planFingerprint)
        : input.review?.approvalToken;
      return databaseReport(input, mode, started, this.now(), scan, database, approvalToken);
      });
    } catch {
      return blocked(input.runId, input.scanNonce!, mode, started, this.now(), anomaly(
        "DATABASE_UNAVAILABLE",
        "The Music identity database is unavailable.",
      ));
    }

    if (!locked.acquired) {
      return blocked(input.runId, input.scanNonce!, mode, started, this.now(), anomaly(
        "LOCK_HELD",
        "Another Music identity reconciliation is already running.",
      ));
    }
    return locked.value;
  }
}

async function scanSource(source: MusicReconciliationSource, input: MusicReconciliationRunInput): Promise<ValidatedScan> {
  validateBound("pageSize", input.pageSize, 1, 1_000);
  validateBound("maxRows", input.maxRows, 1, 100_000);
  validateBound("batchSize", input.batchSize, 1, 1_000);
  const maxPages = input.maxPages ?? 1_000;
  const scanTimeoutMs = input.scanTimeoutMs ?? 1_800_000;
  const maxCanonicalBytes = input.maxCanonicalBytes ?? 16 * 1024 * 1024;
  validateBound("maxPages", maxPages, 1, 1_000);
  validateBound("scanTimeoutMs", scanTimeoutMs, 1, 1_800_000);
  validateBound("maxCanonicalBytes", maxCanonicalBytes, 1, 16 * 1024 * 1024);
  const deadline = performance.now() + scanTimeoutMs;
  const identities: MusicReconciliationIdentity[] = [];
  const userIds = new Set<string>();
  const accountIds = new Set<string>();
  let metadata: ReconciliationSourceMetadata | undefined;
  let previousUserDocumentId: string | undefined;
  let pageNumber = 1;
  let canonicalBytes = 0;

  while (true) {
    let raw: unknown;
    try {
      const remainingMs = Math.floor(deadline - performance.now());
      if (remainingMs < 1) throw new Error("scan deadline elapsed");
      raw = await source.fetchPage({
        page: pageNumber,
        pageSize: input.pageSize,
        order: MUSIC_RECONCILIATION_ORDER,
        sourceSnapshot: metadata?.sourceSnapshot ?? input.expectedSource?.sourceSnapshot ?? input.review?.source.sourceSnapshot,
        timeoutMs: remainingMs,
      });
      if (performance.now() > deadline) throw new Error("scan deadline elapsed");
    } catch {
      throw new ScanFailure(anomaly("SOURCE_UNAVAILABLE", "The authoritative identity source is unavailable."));
    }
    const parsed = sourcePageSchema.safeParse(raw);
    if (!parsed.success) throw new ScanFailure(anomaly("SOURCE_SCHEMA", "The authoritative identity schema changed."));
    const response = parsed.data;
    const pagination = response.meta.pagination;
    const reconciliation = response.meta.reconciliation;
    if (!reconciliation.healthy) {
      throw new ScanFailure(anomaly("SOURCE_UNHEALTHY", "The authoritative identity source did not report healthy."));
    }
    if (pagination.page !== pageNumber || pagination.pageSize !== input.pageSize) {
      throw new ScanFailure(anomaly("SOURCE_DRIFT", "The authoritative pagination cursor changed."));
    }
    const expectedPageCount = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
    if (pagination.pageCount !== expectedPageCount || pagination.pageCount > maxPages || pagination.total > input.maxRows) {
      throw new ScanFailure(anomaly("SOURCE_COUNT", "The authoritative identity count breached its validated bounds."));
    }
    if (!metadata) {
      metadata = {
        schemaVersion: reconciliation.schemaVersion,
        sourceSnapshot: reconciliation.sourceSnapshot,
        sourceChecksum: reconciliation.sourceChecksum,
        total: pagination.total,
        pageCount: pagination.pageCount,
      };
    } else if (metadata.sourceSnapshot !== reconciliation.sourceSnapshot
        || metadata.sourceChecksum !== reconciliation.sourceChecksum
        || metadata.total !== pagination.total
        || metadata.pageCount !== pagination.pageCount) {
      throw new ScanFailure(anomaly("SOURCE_DRIFT", "The authoritative source changed between pages."));
    }
    const expectedRows = pageNumber < pagination.pageCount
      ? pagination.pageSize
      : pagination.total - pagination.pageSize * (pagination.pageCount - 1);
    if (response.data.length !== expectedRows) {
      throw new ScanFailure(anomaly("SOURCE_TRUNCATED", "The authoritative identity scan was truncated."));
    }
    for (const value of response.data) {
      const completedAccounts = value.accounts.filter((account) => account.Account_Name && account.Account_Type && account.mobile_number);
      if (completedAccounts.length !== 1) {
        throw new ScanFailure(anomaly("SOURCE_SCHEMA", "The authoritative Account selection is ambiguous."));
      }
      const account = completedAccounts[0];
      if (userIds.has(value.documentId) || accountIds.has(account.documentId)) {
        throw new ScanFailure(anomaly("SOURCE_DUPLICATE", "The authoritative identity scan contains a duplicate."));
      }
      if (previousUserDocumentId !== undefined && value.documentId <= previousUserDocumentId) {
        throw new ScanFailure(anomaly("SOURCE_REORDERED", "The authoritative identity order changed."));
      }
      userIds.add(value.documentId);
      accountIds.add(account.documentId);
      previousUserDocumentId = value.documentId;
      const normalized: MusicReconciliationIdentity = {
        userDocumentId: value.documentId,
        accountDocumentId: account.documentId,
        username: value.username,
        email: value.email,
        provider: value.provider,
        accountName: account.Account_Name!,
        accountType: account.Account_Type!,
        accountMobile: account.mobile_number!,
      };
      canonicalBytes += Buffer.byteLength(JSON.stringify(normalized), "utf8") + (identities.length === 0 ? 0 : 1);
      if (canonicalBytes > maxCanonicalBytes) {
        throw new ScanFailure(anomaly("SOURCE_COUNT", "The authoritative identity scan exceeded its canonical size bound."));
      }
      identities.push(normalized);
    }
    await input.onSourceCheckpoint?.({ ...metadata, nextPage: pageNumber + 1 });
    if (performance.now() > deadline) {
      throw new ScanFailure(anomaly("SOURCE_UNAVAILABLE", "The authoritative identity source is unavailable."));
    }
    if (pageNumber >= pagination.pageCount) break;
    pageNumber += 1;
  }

  // Every page's exact row count is checked above, so reaching the loop exit
  // proves metadata exists and the accumulated row count equals its total.
  const completeMetadata = metadata as ReconciliationSourceMetadata;
  if (checksum(identities) !== completeMetadata.sourceChecksum) {
    throw new ScanFailure(anomaly("SOURCE_CHECKSUM", "The authoritative identity checksum did not validate."));
  }
  if (performance.now() > deadline) {
    throw new ScanFailure(anomaly("SOURCE_UNAVAILABLE", "The authoritative identity source is unavailable."));
  }
  return { identities, source: completeMetadata, pages: pageNumber };
}

function validateRunInput(
  input: MusicReconciliationRunInput,
  mode: "dry-run" | "apply",
): ReconciliationAnomaly | undefined {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(input.runId)) {
    return anomaly("SOURCE_SCHEMA", "The reconciliation run identifier is invalid.");
  }
  if (!/^[a-f0-9]{64}$/.test(input.scanNonce ?? "")) {
    return anomaly("SOURCE_SCHEMA", "The reconciliation scan identifier is invalid.");
  }
  try {
    validateBound("pageSize", input.pageSize, 1, 1_000);
    validateBound("maxRows", input.maxRows, 1, 100_000);
    validateBound("batchSize", input.batchSize, 1, 1_000);
    validateBound("maxPages", input.maxPages ?? 1_000, 1, 1_000);
    validateBound("scanTimeoutMs", input.scanTimeoutMs ?? 1_800_000, 1, 1_800_000);
    validateBound("requestTimeoutMs", input.requestTimeoutMs ?? 120_000, 1, 120_000);
    validateBound("maxResponseBytes", input.maxResponseBytes ?? 16 * 1024 * 1024, 1, 16 * 1024 * 1024);
    validateBound("maxCanonicalBytes", input.maxCanonicalBytes ?? 16 * 1024 * 1024, 1, 16 * 1024 * 1024);
    validateBound("databaseLockTimeoutMs", input.databaseLockTimeoutMs ?? 5_000, 1, 60_000);
    validateBound("databaseStatementTimeoutMs", input.databaseStatementTimeoutMs ?? 120_000, 1, 600_000);
    validateBound("databaseIdleTransactionTimeoutMs", input.databaseIdleTransactionTimeoutMs ?? 30_000, 1, 600_000);
    validateBound("maxChangeAbsolute", input.maxChangeAbsolute, 0, 100_000);
    if (!Number.isFinite(input.maxChangePercent) || input.maxChangePercent < 0 || input.maxChangePercent > 100) throw new Error();
  } catch {
    return anomaly("SOURCE_COUNT", "The reconciliation thresholds are invalid.");
  }
  if (mode !== "apply") return undefined;
  if (!(["fixture", "staging"] as const).includes(input.environment as "fixture" | "staging")) {
    return anomaly("APPLY_ENVIRONMENT_INELIGIBLE", "This environment is permanently report-only for this release.");
  }
  if (!input.applyEnabled) return anomaly("APPLY_DISABLED", "Reconciliation apply is disabled by environment policy.");
  if (!input.review || !input.approvalToken) {
    return anomaly("APPROVAL_REQUIRED", "Apply requires a reviewed dry-run checkpoint and approval token.");
  }
  if (!secureEqual(input.scanNonce!, input.review.scanNonce)) {
    return anomaly("APPROVAL_INVALID", "The approval token does not match the reviewed dry-run.");
  }
  if (!secureEqual(input.approvalToken, input.review.approvalToken)) {
    return anomaly("APPROVAL_INVALID", "The approval token does not match the reviewed dry-run.");
  }
  return undefined;
}

function databaseReport(
  input: MusicReconciliationRunInput,
  mode: "dry-run" | "apply",
  started: number,
  finished: number,
  scan: ValidatedScan,
  database: ReconciliationDatabaseResult,
  approvalToken: string | undefined,
): MusicReconciliationReport {
  return {
    schemaVersion: MUSIC_RECONCILIATION_SCHEMA_VERSION,
    runId: input.runId,
    scanNonce: input.scanNonce!,
    status: database.status === "safe" ? "success" : "blocked",
    mode,
    source: scan.source,
    local: { total: database.localTotal, eligible: database.eligibleTotal },
    changes: {
      matched: database.matched,
      missing: database.missing,
      firstMisses: database.firstMisses,
      secondMisses: database.secondMisses,
      projectedUpdates: database.projectedUpdates,
      proposedChangePercent: database.proposedChangePercent,
      suspended: database.suspended,
      tombstoneConflicts: database.tombstoneConflicts,
      applied: database.applied,
    },
    thresholds: {
      maxChangeAbsolute: input.maxChangeAbsolute,
      maxChangePercent: input.maxChangePercent,
    },
    metrics: { pages: scan.pages, databaseBatches: database.databaseBatches, durationMs: Math.max(0, finished - started) },
    anomalies: database.anomalies,
    planFingerprint: database.planFingerprint,
    approvalToken,
  };
}

function blocked(
  runId: string,
  scanNonce: string,
  mode: "dry-run" | "apply",
  started: number,
  finished: number,
  value: ReconciliationAnomaly,
  source?: ReconciliationSourceMetadata,
  pages = 0,
): MusicReconciliationReport {
  return {
    schemaVersion: MUSIC_RECONCILIATION_SCHEMA_VERSION,
    runId,
    scanNonce,
    status: "blocked",
    mode,
    source,
    metrics: { pages, databaseBatches: 0, durationMs: Math.max(0, finished - started) },
    anomalies: [value],
  };
}

function createApprovalToken(
  input: MusicReconciliationRunInput,
  source: ReconciliationSourceMetadata,
  planFingerprint: string,
): string {
  return createHash("sha256").update(JSON.stringify({
    schemaVersion: MUSIC_RECONCILIATION_SCHEMA_VERSION,
    runId: input.runId,
    scanNonce: input.scanNonce,
    environment: input.environment,
    source,
    planFingerprint,
    thresholds: {
      maxRows: input.maxRows,
      maxChangeAbsolute: input.maxChangeAbsolute,
      maxChangePercent: input.maxChangePercent,
      maxPages: input.maxPages ?? 1_000,
      scanTimeoutMs: input.scanTimeoutMs ?? 1_800_000,
      requestTimeoutMs: input.requestTimeoutMs ?? 120_000,
      maxResponseBytes: input.maxResponseBytes ?? 16 * 1024 * 1024,
      maxCanonicalBytes: input.maxCanonicalBytes ?? 16 * 1024 * 1024,
      databaseLockTimeoutMs: input.databaseLockTimeoutMs ?? 5_000,
      databaseStatementTimeoutMs: input.databaseStatementTimeoutMs ?? 120_000,
      databaseIdleTransactionTimeoutMs: input.databaseIdleTransactionTimeoutMs ?? 30_000,
    },
  })).digest("hex");
}

function checksum(identities: MusicReconciliationIdentity[]): string {
  return createHash("sha256").update(identities.map((identity) => JSON.stringify(identity)).join("\n")).digest("hex");
}

function observationVersion(scanNonce: string): string {
  const digest = createHash("sha256").update(scanNonce).digest("hex").slice(0, 13);
  return BigInt(`0x${digest}`).toString(10);
}

function sameSource(left: ReconciliationSourceMetadata, right: ReconciliationSourceMetadata): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.sourceSnapshot === right.sourceSnapshot
    && left.sourceChecksum === right.sourceChecksum
    && left.total === right.total
    && left.pageCount === right.pageCount;
}

function secureEqual(left: string, right: string): boolean {
  const leftValue = Buffer.from(left);
  const rightValue = Buffer.from(right);
  return leftValue.length === rightValue.length && timingSafeEqual(leftValue, rightValue);
}

function validateBound(name: string, value: number, minimum: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${name} is out of bounds`);
}

function anomaly(code: ReconciliationAnomalyCode, message: string): ReconciliationAnomaly {
  return { code, message };
}
