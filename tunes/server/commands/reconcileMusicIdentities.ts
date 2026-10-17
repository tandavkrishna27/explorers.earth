import { randomBytes, randomUUID } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import { link, lstat, mkdir, open, realpath, rename, rm, stat, type FileHandle } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { z } from "zod";
import {
  MUSIC_RECONCILIATION_SCHEMA_VERSION,
  STRAPI_RECONCILIATION_SCHEMA_VERSION,
  type MusicReconciliationReport,
  type MusicReconciliationRunInput,
  type MusicReconciliationSource,
  type ReconciliationReview,
  type ReconciliationSourceMetadata,
} from "../services/musicReconciler";
import {
  inspectWindowsCheckpointSecurities,
  type WindowsCheckpointSecurity,
} from "./windowsCheckpointSecurity";
export { parseWindowsCheckpointSecurityOutput } from "./windowsCheckpointSecurity";

export const MUSIC_RECONCILIATION_CHECKPOINT_SCHEMA_VERSION = "music-reconciliation-checkpoint/v1" as const;

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const sourceSchema = z.object({
  schemaVersion: z.literal(STRAPI_RECONCILIATION_SCHEMA_VERSION),
  sourceSnapshot: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  sourceChecksum: hashSchema,
  total: z.number().int().nonnegative(),
  pageCount: z.number().int().positive(),
}).strict();
const thresholdsSchema = z.object({
  pageSize: z.number().int().min(1).max(1_000),
  maxRows: z.number().int().min(1).max(100_000),
  batchSize: z.number().int().min(1).max(1_000),
  maxChangeAbsolute: z.number().int().min(0).max(100_000),
  maxChangePercent: z.number().min(0).max(100),
  maxPages: z.number().int().min(1).max(1_000),
  scanTimeoutMs: z.number().int().min(1).max(1_800_000),
  requestTimeoutMs: z.number().int().min(1).max(120_000),
  maxResponseBytes: z.number().int().min(1).max(16 * 1024 * 1024),
  maxCanonicalBytes: z.number().int().min(1).max(16 * 1024 * 1024),
  databaseLockTimeoutMs: z.number().int().min(1).max(60_000),
  databaseStatementTimeoutMs: z.number().int().min(1).max(600_000),
  databaseIdleTransactionTimeoutMs: z.number().int().min(1).max(600_000),
}).strict();
const anomalySchema = z.object({ code: z.string().min(1).max(64), message: z.string().min(1).max(512) }).strict();
const reportSchema = z.object({
  schemaVersion: z.literal(MUSIC_RECONCILIATION_SCHEMA_VERSION),
  runId: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  scanNonce: hashSchema,
  status: z.enum(["success", "blocked"]),
  mode: z.enum(["dry-run", "apply"]),
  source: sourceSchema.optional(),
  local: z.object({ total: z.number().int().nonnegative(), eligible: z.number().int().nonnegative() }).strict().optional(),
  changes: z.object({
    matched: z.number().int().nonnegative(),
    missing: z.number().int().nonnegative(),
    firstMisses: z.number().int().nonnegative(),
    secondMisses: z.number().int().nonnegative(),
    projectedUpdates: z.number().int().nonnegative(),
    proposedChangePercent: z.number().min(0).max(100),
    suspended: z.number().int().nonnegative(),
    tombstoneConflicts: z.number().int().nonnegative(),
    applied: z.boolean(),
  }).strict().optional(),
  thresholds: z.object({
    maxChangeAbsolute: z.number().int().min(0).max(100_000),
    maxChangePercent: z.number().min(0).max(100),
  }).strict().optional(),
  metrics: z.object({
    pages: z.number().int().nonnegative(),
    databaseBatches: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
  }).strict(),
  anomalies: z.array(anomalySchema),
  planFingerprint: hashSchema.optional(),
  approvalToken: hashSchema.optional(),
}).strict();
const reviewSchema = z.object({
  scanNonce: hashSchema,
  source: sourceSchema,
  planFingerprint: hashSchema,
  approvalToken: hashSchema,
}).strict();
const checkpointSchema = z.object({
  schemaVersion: z.literal(MUSIC_RECONCILIATION_CHECKPOINT_SCHEMA_VERSION),
  state: z.enum(["scanning", "reviewed", "blocked", "applied", "interrupted"]),
  runId: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  scanNonce: hashSchema,
  commit: z.string().min(1).max(128),
  fixtureVersion: z.string().min(1).max(128),
  fixtureSchemaVersion: z.string().min(1).max(128),
  environment: z.enum(["fixture", "staging", "production"]),
  environmentFingerprint: z.string().min(1).max(256),
  gateValues: z.record(z.string().max(512)),
  thresholds: thresholdsSchema,
  source: sourceSchema.optional(),
  nextPage: z.number().int().positive(),
  review: reviewSchema.optional(),
  report: reportSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.state === "reviewed" && (!value.review || value.report?.mode !== "dry-run" || value.report.status !== "success")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "reviewed checkpoint requires a successful dry-run review" });
  }
  if (value.state === "applied" && (!value.review || value.report?.mode !== "apply" || value.report.status !== "success" || !value.report.changes?.applied)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "applied checkpoint requires a successful applied report" });
  }
  if (value.report && value.report.runId !== value.runId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "checkpoint and report run identifiers must match" });
  }
  if (value.report && value.report.scanNonce !== value.scanNonce) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "checkpoint and report scan identifiers must match" });
  }
  if (value.source && value.report?.source && JSON.stringify(value.source) !== JSON.stringify(value.report.source)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "checkpoint and report sources must match" });
  }
  if ((value.state === "reviewed" || value.state === "applied") && value.review && value.report) {
    if (!value.source
        || JSON.stringify(value.review.source) !== JSON.stringify(value.source)
        || JSON.stringify(value.review.source) !== JSON.stringify(value.report.source)
        || value.review.scanNonce !== value.scanNonce
        || value.review.scanNonce !== value.report.scanNonce
        || value.review.planFingerprint !== value.report.planFingerprint
        || value.review.approvalToken !== value.report.approvalToken) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "review evidence must match the visible report" });
    }
  }
});

export interface MusicReconciliationThresholds {
  pageSize: number;
  maxRows: number;
  batchSize: number;
  maxChangeAbsolute: number;
  maxChangePercent: number;
  maxPages: number;
  scanTimeoutMs: number;
  requestTimeoutMs: number;
  maxResponseBytes: number;
  maxCanonicalBytes: number;
  databaseLockTimeoutMs: number;
  databaseStatementTimeoutMs: number;
  databaseIdleTransactionTimeoutMs: number;
}

export interface MusicReconciliationResumeContext {
  commit: string;
  fixtureVersion: string;
  fixtureSchemaVersion: string;
  environment: "fixture" | "staging" | "production";
  environmentFingerprint: string;
  gateValues: Record<string, string>;
  thresholds: MusicReconciliationThresholds;
}

export interface MusicReconciliationCheckpoint extends MusicReconciliationResumeContext {
  schemaVersion: typeof MUSIC_RECONCILIATION_CHECKPOINT_SCHEMA_VERSION;
  state: "scanning" | "reviewed" | "blocked" | "applied" | "interrupted";
  runId: string;
  scanNonce: string;
  source?: ReconciliationSourceMetadata;
  nextPage: number;
  review?: ReconciliationReview;
  report?: MusicReconciliationReport;
}

export class MusicReconciliationResumeError extends Error {
  constructor(message: string) {
    super(`Music reconciliation resume refused: ${message}`);
  }
}

export class HttpMusicReconciliationSource implements MusicReconciliationSource {
  private readonly endpoint: URL;

  constructor(private readonly options: {
    baseUrl: string;
    serviceToken: string;
    timeoutMs: number;
    maxResponseBytes: number;
    fetchImpl?: typeof fetch;
  }) {
    this.endpoint = new URL("/api/music-identities", options.baseUrl);
    if (!options.serviceToken || options.serviceToken.length > 4_096) throw new Error("A bounded reconciliation service token is required.");
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 120_000) throw new Error("The reconciliation timeout is invalid.");
    if (!Number.isSafeInteger(options.maxResponseBytes) || options.maxResponseBytes < 1 || options.maxResponseBytes > 16 * 1024 * 1024) throw new Error("The reconciliation response bound is invalid.");
  }

  async fetchPage(request: Parameters<MusicReconciliationSource["fetchPage"]>[0]): Promise<unknown> {
    const url = new URL(this.endpoint);
    url.searchParams.set("pagination[page]", String(request.page));
    url.searchParams.set("pagination[pageSize]", String(request.pageSize));
    url.searchParams.set("sort", request.order);
    if (request.sourceSnapshot) url.searchParams.set("sourceSnapshot", request.sourceSnapshot);
    const response = await (this.options.fetchImpl ?? fetch)(url, {
      method: "GET",
      redirect: "error",
      headers: { authorization: `Bearer ${this.options.serviceToken}`, accept: "application/json" },
      signal: AbortSignal.timeout(Math.min(this.options.timeoutMs, request.timeoutMs ?? this.options.timeoutMs)),
    });
    if (!response.ok) throw new Error("The reconciliation source returned a non-success response.");
    if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      throw new Error("The reconciliation source returned a non-JSON response.");
    }
    const advertisedLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(advertisedLength) && advertisedLength > this.options.maxResponseBytes) {
      throw new Error("The reconciliation source response exceeded its size limit.");
    }
    if (!response.body) throw new Error("The reconciliation source returned an empty response.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        totalBytes += next.value.byteLength;
        if (totalBytes > this.options.maxResponseBytes) {
          await reader.cancel();
          throw new Error("The reconciliation source response exceeded its size limit.");
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }
}

const MAX_CHECKPOINT_BYTES = 1024 * 1024;

interface MusicReconciliationCheckpointFileSystem {
  lstat(path: string): Promise<BigIntStats>;
  open(path: string, flags: number, mode?: number): Promise<FileHandle>;
  realpath(path: string): Promise<string>;
  mkdir(path: string, options: { mode: number }): Promise<unknown>;
  link(existingPath: string, newPath: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  rm(path: string, options: { force: boolean }): Promise<void>;
}

interface MusicReconciliationCheckpointFileOptions {
  fileSystem?: Partial<MusicReconciliationCheckpointFileSystem>;
  platform?: NodeJS.Platform;
  effectiveUserId?: number;
  requireAbsent?: boolean;
  inspectWindowsCheckpointSecurity?: (path: string) => Promise<WindowsCheckpointSecurity>;
}

const checkpointFileSystem: MusicReconciliationCheckpointFileSystem = {
  lstat: (path) => lstat(path, { bigint: true }),
  open,
  realpath,
  mkdir: (path, options) => mkdir(path, options),
  link,
  rename,
  rm,
};

export async function writeMusicReconciliationCheckpoint(
  path: string,
  checkpoint: MusicReconciliationCheckpoint,
  options: MusicReconciliationCheckpointFileOptions = {},
): Promise<void> {
  try {
    validateCheckpointPath(path);
    const validated = checkpointSchema.parse(checkpoint);
    const fileSystem = { ...checkpointFileSystem, ...options.fileSystem };
    await ensureCheckpointDirectory(dirname(path), fileSystem, options);
    const ancestorBefore = await checkpointAncestors(path, fileSystem, options);
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
    let handle: FileHandle | undefined;
    try {
      /* c8 ignore next -- the POSIX O_NOFOLLOW arm is exercised by the POSIX-only hostile-path test. */
      const noFollow = (options.platform ?? process.platform) === "win32" ? 0 : constants.O_NOFOLLOW;
      handle = await fileSystem.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600);
      const encoded = Buffer.from(`${JSON.stringify(validated, null, 2)}\n`, "utf8");
      /* c8 ignore next -- the strict checkpoint schema cannot serialize beyond this defense-in-depth bound. */
      if (encoded.byteLength > MAX_CHECKPOINT_BYTES) return invalidCheckpointFile();
      await handle.writeFile(encoded);
      await handle.sync();
      const temporaryMetadata = await handle.stat({ bigint: true });
      validateCheckpointMetadata(temporaryMetadata, options);
      await validateWindowsCheckpointSecurity(temporary, temporaryMetadata, options);
      /* c8 ignore next -- a successful descriptor write cannot report a different size without a broken filesystem. */
      if (temporaryMetadata.size !== BigInt(encoded.byteLength)) return invalidCheckpointFile();
      await handle.close();
      handle = undefined;

      await validateExistingCheckpointTarget(path, fileSystem, options);
      await revalidateCheckpointAncestors(path, ancestorBefore, fileSystem, options);
      if (options.requireAbsent) {
        await fileSystem.link(temporary, path);
        await fileSystem.rm(temporary, { force: true });
      } else {
        await fileSystem.rename(temporary, path);
      }
      const finalMetadata = await fileSystem.lstat(path);
      validateCheckpointMetadata(finalMetadata, options);
      if (!sameCheckpointIdentity(temporaryMetadata, finalMetadata)) return invalidCheckpointFile();
      await revalidateCheckpointAncestors(path, ancestorBefore, fileSystem, options);
    } catch (error) {
      /* c8 ignore next 2 -- cleanup failures are intentionally contained after the primary secure-write failure. */
      await handle?.close().catch(() => undefined);
      /* c8 ignore next 2 -- cleanup failures are intentionally contained after the primary secure-write failure. */
      await fileSystem.rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    if (error instanceof MusicReconciliationResumeError) throw error;
    throw new MusicReconciliationResumeError("checkpoint file is insecure or invalid");
  }
}

export async function readMusicReconciliationCheckpoint(
  path: string,
  options: MusicReconciliationCheckpointFileOptions = {},
): Promise<MusicReconciliationCheckpoint> {
  try {
    validateCheckpointPath(path);
    const fileSystem = { ...checkpointFileSystem, ...options.fileSystem };
    const ancestorBefore = await checkpointAncestors(path, fileSystem, options);
    const canonicalBefore = await fileSystem.realpath(path);
    if (!sameCheckpointPath(canonicalBefore, path, options.platform ?? process.platform)) return invalidCheckpointFile();
    const before = await fileSystem.lstat(path);
    validateCheckpointMetadata(before, options);
    /* c8 ignore next -- the POSIX O_NOFOLLOW arm is exercised by the POSIX-only hostile-path test. */
    const noFollow = (options.platform ?? process.platform) === "win32" ? 0 : constants.O_NOFOLLOW;
    const handle = await fileSystem.open(path, constants.O_RDONLY | noFollow);
    try {
      const opened = await handle.stat({ bigint: true });
      validateCheckpointMetadata(opened, options);
      if (!sameCheckpointIdentity(before, opened)) return invalidCheckpointFile();
      await validateWindowsCheckpointSecurity(path, opened, options);
      const buffer = Buffer.alloc(MAX_CHECKPOINT_BYTES + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const afterDescriptor = await handle.stat({ bigint: true });
      const afterPath = await fileSystem.lstat(path);
      const canonicalAfter = await fileSystem.realpath(path);
      validateCheckpointMetadata(afterDescriptor, options);
      validateCheckpointMetadata(afterPath, options);
      if (bytesRead !== Number(opened.size) || bytesRead > MAX_CHECKPOINT_BYTES
          || !sameCheckpointMetadata(opened, afterDescriptor)
          || !sameCheckpointMetadata(opened, afterPath)
          || !sameCheckpointPath(canonicalAfter, path, options.platform ?? process.platform)) {
        return invalidCheckpointFile();
      }
      await revalidateCheckpointAncestors(path, ancestorBefore, fileSystem, options);
      return checkpointSchema.parse(JSON.parse(buffer.subarray(0, bytesRead).toString("utf8"))) as MusicReconciliationCheckpoint;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error instanceof MusicReconciliationResumeError) throw error;
    throw new MusicReconciliationResumeError("checkpoint file is insecure or invalid");
  }
}

function validateCheckpointPath(path: string): void {
  if (!path || path.length > 1_024 || path.includes("\0") || !isAbsolute(path)) invalidCheckpointFile();
}

async function ensureCheckpointDirectory(
  directory: string,
  fileSystem: MusicReconciliationCheckpointFileSystem,
  options: MusicReconciliationCheckpointFileOptions,
): Promise<void> {
  for (const ancestor of ancestorPaths(join(directory, ".checkpoint-placeholder"))) {
    try {
      const metadata = await fileSystem.lstat(ancestor);
      validateCheckpointDirectory(metadata, ancestor, options);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await fileSystem.mkdir(ancestor, { mode: 0o700 });
      const metadata = await fileSystem.lstat(ancestor);
      validateCheckpointDirectory(metadata, ancestor, options, true);
    }
  }
}

async function checkpointAncestors(
  path: string,
  fileSystem: MusicReconciliationCheckpointFileSystem,
  options: MusicReconciliationCheckpointFileOptions,
  inspectSecurity = true,
): Promise<BigIntStats[]> {
  const paths = ancestorPaths(path);
  const metadata = await Promise.all(paths.map(async (ancestor) => {
    const metadata = await fileSystem.lstat(ancestor);
    validateCheckpointDirectory(metadata, ancestor, options);
    return metadata;
  }));
  if (inspectSecurity) {
    const immediateIndex = paths.length - 1;
    await validateWindowsCheckpointSecurities([{
      path: paths[immediateIndex],
      metadata: metadata[immediateIndex],
    }], options);
  }
  return metadata;
}

async function revalidateCheckpointAncestors(
  path: string,
  before: BigIntStats[],
  fileSystem: MusicReconciliationCheckpointFileSystem,
  options: MusicReconciliationCheckpointFileOptions,
): Promise<void> {
  const after = await checkpointAncestors(path, fileSystem, options, false);
  if (before.some((metadata, index) => !sameCheckpointDirectory(metadata, after[index]))) invalidCheckpointFile();
  const parent = dirname(path);
  const canonicalParent = await fileSystem.realpath(parent);
  if (!sameCheckpointPath(canonicalParent, parent, options.platform ?? process.platform)) invalidCheckpointFile();
}

function ancestorPaths(path: string): string[] {
  const root = parse(path).root;
  const result: string[] = [];
  let current = dirname(path);
  while (true) {
    result.push(current);
    if (current === root) break;
    const parent = dirname(current);
    /* c8 ignore next -- absolute paths terminate at the parsed root before dirname can become stationary. */
    if (parent === current) invalidCheckpointFile();
    current = parent;
  }
  return result.reverse();
}

function validateCheckpointDirectory(
  metadata: BigIntStats,
  path: string,
  options: MusicReconciliationCheckpointFileOptions,
  created = false,
): void {
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) invalidCheckpointFile();
  const platform = options.platform ?? process.platform;
  if (platform === "win32") return;
  /* c8 ignore start -- exercised by the POSIX-only owner/mode hostile tests. */
  const effectiveUserId = BigInt(options.effectiveUserId ?? process.geteuid?.() ?? -1);
  if (metadata.uid !== BigInt(0) && metadata.uid !== effectiveUserId) invalidCheckpointFile();
  const writableByOthers = (metadata.mode & BigInt(0o022)) !== BigInt(0);
  const trustedStickyRoot = metadata.uid === BigInt(0) && (metadata.mode & BigInt(0o1000)) !== BigInt(0);
  if (writableByOthers && !trustedStickyRoot) invalidCheckpointFile();
  if (created && (metadata.mode & BigInt(0o077)) !== BigInt(0)) invalidCheckpointFile();
  void path;
  /* c8 ignore stop */
}

function validateCheckpointMetadata(metadata: BigIntStats, options: MusicReconciliationCheckpointFileOptions): void {
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== BigInt(1)
      || metadata.size < BigInt(2) || metadata.size > BigInt(MAX_CHECKPOINT_BYTES)) invalidCheckpointFile();
  /* c8 ignore next -- the non-Windows branch is exercised by the POSIX-only owner/mode hostile tests. */
  if ((options.platform ?? process.platform) === "win32") return;
  /* c8 ignore start -- exercised by the POSIX-only owner/mode hostile tests. */
  if ((metadata.mode & BigInt(0o077)) !== BigInt(0)) invalidCheckpointFile();
  const effectiveUserId = BigInt(options.effectiveUserId ?? process.geteuid?.() ?? -1);
  if (metadata.uid !== BigInt(0) && metadata.uid !== effectiveUserId) invalidCheckpointFile();
  /* c8 ignore stop */
}

async function validateExistingCheckpointTarget(
  path: string,
  fileSystem: MusicReconciliationCheckpointFileSystem,
  options: MusicReconciliationCheckpointFileOptions,
): Promise<void> {
  try {
    const metadata = await fileSystem.lstat(path);
    validateCheckpointMetadata(metadata, options);
    await validateWindowsCheckpointSecurity(path, metadata, options);
    if (options.requireAbsent) invalidCheckpointFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function validateWindowsCheckpointSecurity(
  path: string,
  metadata: BigIntStats,
  options: MusicReconciliationCheckpointFileOptions,
): Promise<void> {
  await validateWindowsCheckpointSecurities([{ path, metadata }], options);
}

async function validateWindowsCheckpointSecurities(
  files: Array<{ path: string; metadata: BigIntStats }>,
  options: MusicReconciliationCheckpointFileOptions,
): Promise<void> {
  const inspectSecurity = options.inspectWindowsCheckpointSecurity
    ? (paths: string[]) => Promise.all(paths.map((path) => options.inspectWindowsCheckpointSecurity!(path)))
    : inspectWindowsCheckpointSecurities;
  /* c8 ignore next -- the POSIX bypass is exercised on the native POSIX worker. */
  if ((options.platform ?? process.platform) !== "win32") return;
  const securities = await inspectSecurity(files.map(({ path }) => path));
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const security = securities[index];
    if (!security) invalidCheckpointFile();
    if (!/^\d+$/.test(security.nativeDev)) invalidCheckpointFile();
    if (!/^\d+$/.test(security.nativeIno)) invalidCheckpointFile();
    if (BigInt(security.nativeDev) !== file.metadata.dev) invalidCheckpointFile();
    if (BigInt(security.nativeIno) !== file.metadata.ino) invalidCheckpointFile();
    if (security.ownerMatchesEffectiveUser !== true) invalidCheckpointFile();
    if (!Number.isSafeInteger(security.unsafeWritePrincipalCount)) invalidCheckpointFile();
    if (security.unsafeWritePrincipalCount !== 0) invalidCheckpointFile();
  }
}

function sameCheckpointPath(left: string, right: string, platform: NodeJS.Platform): boolean {
  const normalize = (value: string) => resolve(value).replace(/^\\\\\?\\/, "");
  const [leftPath, rightPath] = [normalize(left), normalize(right)];
  /* c8 ignore next -- both platform semantics are covered on their native CI workers. */
  return platform === "win32" ? leftPath.toLowerCase() === rightPath.toLowerCase() : leftPath === rightPath;
}

function sameCheckpointIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameCheckpointMetadata(left: BigIntStats, right: BigIntStats): boolean {
  return sameCheckpointIdentity(left, right) && left.mode === right.mode && left.uid === right.uid
    && left.gid === right.gid && left.nlink === right.nlink && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function sameCheckpointDirectory(left: BigIntStats, right: BigIntStats): boolean {
  return sameCheckpointIdentity(left, right) && left.mode === right.mode && left.uid === right.uid && left.gid === right.gid;
}

function invalidCheckpointFile(): never {
  throw new MusicReconciliationResumeError("checkpoint file is insecure or invalid");
}

export async function interruptMusicReconciliationCheckpoint(path: string): Promise<boolean> {
  try {
    const checkpoint = await readMusicReconciliationCheckpoint(path);
    if (checkpoint.state === "scanning") {
      await writeMusicReconciliationCheckpoint(path, { ...checkpoint, state: "interrupted" });
    }
    return true;
  } catch {
    return false;
  }
}

export function assertMusicReconciliationResume(
  checkpoint: MusicReconciliationCheckpoint,
  context: MusicReconciliationResumeContext,
  expectedSourceSnapshot?: string,
): void {
  for (const key of ["commit", "fixtureVersion", "fixtureSchemaVersion", "environment", "environmentFingerprint"] as const) {
    if (checkpoint[key] !== context[key]) throw new MusicReconciliationResumeError(`${key} changed`);
  }
  if (JSON.stringify(checkpoint.thresholds) !== JSON.stringify(context.thresholds)) {
    throw new MusicReconciliationResumeError("thresholds changed");
  }
  if (JSON.stringify(checkpoint.gateValues) !== JSON.stringify(context.gateValues)) {
    throw new MusicReconciliationResumeError("gate values changed");
  }
  if (expectedSourceSnapshot && checkpoint.source?.sourceSnapshot !== expectedSourceSnapshot) {
    throw new MusicReconciliationResumeError("source snapshot changed");
  }
}

interface ReconcilerLike {
  run(input: MusicReconciliationRunInput): Promise<MusicReconciliationReport>;
}

export async function reconcileMusicIdentities(options: {
  reconciler: ReconcilerLike;
  checkpointPath: string;
  resumePath?: string;
  context: MusicReconciliationResumeContext;
  run: MusicReconciliationRunInput;
}): Promise<MusicReconciliationReport> {
  const mode = options.run.requestedMode ?? "dry-run";
  if (options.resumePath) await assertDistinctReviewEvidence(options.resumePath, options.checkpointPath);
  if (JSON.stringify(options.context.thresholds) !== JSON.stringify({
    pageSize: options.run.pageSize,
    maxRows: options.run.maxRows,
    batchSize: options.run.batchSize,
    maxChangeAbsolute: options.run.maxChangeAbsolute,
    maxChangePercent: options.run.maxChangePercent,
    maxPages: options.run.maxPages ?? 1_000,
    scanTimeoutMs: options.run.scanTimeoutMs ?? 1_800_000,
    requestTimeoutMs: options.run.requestTimeoutMs ?? 120_000,
    maxResponseBytes: options.run.maxResponseBytes ?? 16 * 1024 * 1024,
    maxCanonicalBytes: options.run.maxCanonicalBytes ?? 16 * 1024 * 1024,
    databaseLockTimeoutMs: options.run.databaseLockTimeoutMs ?? 5_000,
    databaseStatementTimeoutMs: options.run.databaseStatementTimeoutMs ?? 120_000,
    databaseIdleTransactionTimeoutMs: options.run.databaseIdleTransactionTimeoutMs ?? 30_000,
  })) throw new MusicReconciliationResumeError("run thresholds do not match the checkpoint context");

  const resume = options.resumePath ? await readMusicReconciliationCheckpoint(options.resumePath) : undefined;
  if (resume) assertMusicReconciliationResume(resume, options.context);
  if (mode === "apply" && (!resume || resume.state !== "reviewed" || !resume.review)) {
    throw new MusicReconciliationResumeError("apply requires a reviewed dry-run checkpoint");
  }
  let lastSource = resume?.source;
  const scanNonce = mode === "apply" ? resume!.scanNonce : randomBytes(32).toString("hex");
  const baseCheckpoint = (): Omit<MusicReconciliationCheckpoint, "state" | "nextPage"> => ({
    schemaVersion: MUSIC_RECONCILIATION_CHECKPOINT_SCHEMA_VERSION,
    runId: options.run.runId,
    scanNonce,
    ...options.context,
    ...(lastSource ? { source: lastSource } : {}),
  });
  await writeMusicReconciliationCheckpoint(
    options.checkpointPath,
    { ...baseCheckpoint(), state: "scanning", nextPage: 1 },
    { requireAbsent: true },
  );

  const report = await options.reconciler.run({
    ...options.run,
    scanNonce,
    requestedMode: mode,
    expectedSource: resume?.source,
    review: mode === "apply" ? resume?.review : undefined,
    onSourceCheckpoint: async (sourceCheckpoint) => {
      const { nextPage, ...sourceMetadata } = sourceCheckpoint;
      if (sourceCheckpoint.schemaVersion && sourceCheckpoint.sourceSnapshot && sourceCheckpoint.sourceChecksum
          && sourceCheckpoint.total !== undefined && sourceCheckpoint.pageCount !== undefined) {
        lastSource = sourceMetadata as ReconciliationSourceMetadata;
      }
      await writeMusicReconciliationCheckpoint(options.checkpointPath, {
        ...baseCheckpoint(),
        state: "scanning",
        nextPage,
      });
    },
  });

  const review = mode === "dry-run" && report.status === "success" && report.source && report.planFingerprint && report.approvalToken
    ? { scanNonce, source: report.source, planFingerprint: report.planFingerprint, approvalToken: report.approvalToken }
    : resume?.review;
  const state: MusicReconciliationCheckpoint["state"] = report.status !== "success"
    ? "blocked"
    : mode === "apply" && report.changes?.applied
      ? "applied"
      : mode === "dry-run" && review
        ? "reviewed"
        : "blocked";
  await writeMusicReconciliationCheckpoint(options.checkpointPath, {
    ...baseCheckpoint(),
    ...(report.source ? { source: report.source } : {}),
    state,
    nextPage: (report.source?.pageCount ?? 0) + 1,
    ...(review ? { review } : {}),
    report,
  });
  return report;
}

async function assertDistinctReviewEvidence(resumePath: string, checkpointPath: string): Promise<void> {
  if (resolve(resumePath) === resolve(checkpointPath)) {
    throw new MusicReconciliationResumeError("apply checkpoint must be distinct from the reviewed checkpoint");
  }
  try {
    const [resumeIdentity, checkpointIdentity] = await Promise.all([stat(resumePath), stat(checkpointPath)]);
    if (resumeIdentity.dev === checkpointIdentity.dev && resumeIdentity.ino === checkpointIdentity.ino) {
      throw new MusicReconciliationResumeError("apply checkpoint must be distinct from the reviewed checkpoint");
    }
  } catch (error) {
    if (error instanceof MusicReconciliationResumeError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export function formatMusicReconciliationReport(report: MusicReconciliationReport, format: "human" | "json"): string {
  const aggregate = { ...report, approvalToken: undefined };
  if (format === "json") return JSON.stringify(aggregate);
  const changes = report.changes;
  const anomalies = report.anomalies.map((value) => value.code).join(",") || "none";
  return [
    `Music reconciliation ${report.status} (${report.mode})`,
    `sourceTotal=${report.source?.total ?? "unavailable"} localTotal=${report.local?.total ?? "unavailable"} eligibleTotal=${report.local?.eligible ?? "unavailable"}`,
    `matched=${changes?.matched ?? 0} missing=${changes?.missing ?? 0} firstMisses=${changes?.firstMisses ?? 0} secondMisses=${changes?.secondMisses ?? 0}`,
    `projectedUpdates=${changes?.projectedUpdates ?? 0} changePercent=${changes?.proposedChangePercent ?? 0} suspended=${changes?.suspended ?? 0} applied=${changes?.applied ?? false}`,
    `maxChangeAbsolute=${report.thresholds?.maxChangeAbsolute ?? "unavailable"} maxChangePercent=${report.thresholds?.maxChangePercent ?? "unavailable"}`,
    `anomalies=${anomalies}`,
  ].join("\n");
}
