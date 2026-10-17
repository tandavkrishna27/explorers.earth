import { createHash, randomBytes as secureRandomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  ftruncateSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  readdirSync,
  renameSync,
  writeSync,
  type BigIntStats,
} from "node:fs";
import { basename, dirname, join, parse, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURE_MUSIC_TOKEN_SECRET_DIRECTORY_RELATIVE_PATH = join(".artifacts", "music-token-secrets");
export const FIXTURE_MUSIC_ENVIRONMENT_DIRECTORY_RELATIVE_PATH = join(".artifacts", "music-environment-generations");
const fixtureTokenName = /^current-[a-f0-9]{32}$/;
const fixtureEnvironmentTemporaryName = /^\.env\.music\.test\.[a-f0-9]{32}\.tmp$/;
const fixtureEnvironmentGenerationName = /^generation-[a-f0-9]{32}$/;
const fixtureEnvironmentReferenceTemporaryName = /^\.env\.music\.test\.reference-[a-f0-9]{32}\.tmp$/;
const fixtureEnvironmentReferenceHeader = "music-fixture-env/v1";
const fixtureRotationJournalName = /^rotation-[a-f0-9]{32}\.json$/;
const fixtureRotationJournalTemporaryName = /^\.rotation-(?:update|intent)-[a-f0-9]{32}\.tmp$/;

export class FixtureSecretCleanupError extends Error {
  readonly code = "MUSIC_FIXTURE_SECRET_CLEANUP_FAILED";
  constructor(readonly targetId: string) {
    super(`Fixture secret cleanup failed for target ${targetId}`);
    this.name = "FixtureSecretCleanupError";
  }
}

export class FixtureEnvironmentPersistenceError extends Error {
  readonly code = "MUSIC_FIXTURE_ENVIRONMENT_PUBLISH_FAILED";
  constructor(readonly targetId: string) {
    super(`Fixture environment publish failed for target ${targetId}`);
    this.name = "FixtureEnvironmentPersistenceError";
  }
}

export class FixtureUnsupportedLegacyEnvironmentError extends Error {
  readonly code = "MUSIC_FIXTURE_LEGACY_ENVIRONMENT_UNSUPPORTED";
  constructor() {
    super("MUSIC_FIXTURE_LEGACY_ENVIRONMENT_UNSUPPORTED: raw fixture authority is unsupported; no application command will interpret, erase, or convert it. Commit and push source changes according to operator policy, then discard and recreate the entire disposable worktree from a clean checkout");
    this.name = "FixtureUnsupportedLegacyEnvironmentError";
  }
}

export interface FixtureDurableReplaceDependencies {
  platform?: NodeJS.Platform;
  rename?: typeof renameSync;
  syncDirectory?: (path: string) => void;
  runWindowsHelper?: (source: string, destination: string) => { status: number | null; error?: Error };
  beforeWindowsReplace?: () => void;
  inspectWindowsIdentity?: (path: string) => FixtureWindowsNativeIdentity;
}

export interface FixtureReplaceDestinationAuthority {
  stat: BigIntStats;
  sha256: string;
  windows?: FixtureWindowsNativeIdentity;
}

type FixtureDurableReplace = (
  source: string,
  destination: string,
  expectedDestination?: FixtureReplaceDestinationAuthority,
) => void;

export interface FixtureWindowsNativeIdentity {
  volumeSerial: string;
  fileId: string;
  attributes: number;
  linkCount: number;
  size: number;
  sha256: string;
}

export function replaceFixtureMetadataDurably(
  sourcePath: string,
  destinationPath: string,
  dependencies: FixtureDurableReplaceDependencies = {},
  expectedDestination?: FixtureReplaceDestinationAuthority,
): void {
  const source = resolve(sourcePath);
  const destination = resolve(destinationPath);
  if (dirname(source) !== dirname(destination) || sameResolvedPath(source, destination)
      || /[\0\r\n]/.test(source) || /[\0\r\n]/.test(destination)) {
    throw fixtureEnvironmentError("metadata-replace");
  }
  assertNoLinkedAncestors(source);
  assertNoLinkedAncestors(destination);
  const before = lstatSync(source, { bigint: true });
  assertOwnedRegularFile(before);
  const platform = dependencies.platform ?? process.platform;
  if (platform === "win32") {
    const inspect = dependencies.inspectWindowsIdentity ?? inspectWindowsNativeIdentity;
    const sourceParentBefore = lstatSync(dirname(source), { bigint: true });
    const destinationBefore = expectedDestination?.stat
      ?? (existsSync(destination) ? lstatSync(destination, { bigint: true }) : undefined);
    const sourceIdentity = inspect(source);
    const parentIdentity = inspect(dirname(source));
    const destinationIdentity = expectedDestination?.windows
      ?? (destinationBefore ? inspect(destination) : undefined);
    if (expectedDestination && !expectedDestination.windows) throw fixtureEnvironmentError("metadata-replace");
    if (destinationBefore) assertOwnedRegularFile(destinationBefore);
    if (!sameIdentity(before, lstatSync(source, { bigint: true }))
        || !sameIdentity(sourceParentBefore, lstatSync(dirname(source), { bigint: true }))
        || (!expectedDestination && destinationBefore && (!existsSync(destination)
          || !sameReplaceDestinationStat(destinationBefore, lstatSync(destination, { bigint: true }))))) {
      throw fixtureEnvironmentError("metadata-replace");
    }
    dependencies.beforeWindowsReplace?.();
    const result = dependencies.runWindowsHelper
      ? dependencies.runWindowsHelper(source, destination)
      : runWindowsWriteThroughHelper(source, destination, sourceIdentity, parentIdentity, destinationIdentity);
    const committed = windowsDestinationMatches(source, destination, before, sourceIdentity, inspect);
    if (result.error || result.status !== 0) {
      if (committed) return;
      throw fixtureEnvironmentError("metadata-replace");
    }
    if (!committed) throw fixtureEnvironmentError("metadata-replace");
    return;
  } else {
    if (expectedDestination) assertReplaceDestinationAuthority(destination, expectedDestination);
    (dependencies.rename ?? renameSync)(source, destination);
    (dependencies.syncDirectory ?? syncDirectory)(dirname(destination));
  }
  const after = lstatSync(destination, { bigint: true });
  if (!sameIdentity(before, after) || existsSync(source)) throw fixtureEnvironmentError("metadata-replace");
}

function runWindowsWriteThroughHelper(
  source: string,
  destination: string,
  sourceIdentity: FixtureWindowsNativeIdentity,
  parentIdentity: FixtureWindowsNativeIdentity,
  destinationIdentity: FixtureWindowsNativeIdentity | undefined,
): { status: number | null; error?: Error } {
  return runWindowsNativeHelper([
    "replace",
    source,
    destination,
    ...encodeWindowsNativeIdentity(sourceIdentity, true),
    ...encodeWindowsNativeIdentity(parentIdentity, false),
    destinationIdentity ? "1" : "0",
    ...(destinationIdentity ? encodeWindowsNativeIdentity(destinationIdentity, true) : ["none", "none", "none", "none", "none", "none"]),
  ]);
}

function inspectWindowsNativeIdentity(path: string): FixtureWindowsNativeIdentity {
  const result = runWindowsNativeHelper(["inspect", path]);
  if (result.error || result.status !== 0 || !result.stdout) throw fixtureEnvironmentError("metadata-inspect");
  try {
    const parsed = JSON.parse(result.stdout.trim()) as FixtureWindowsNativeIdentity;
    if (!/^[a-f0-9]{8}$/.test(parsed.volumeSerial)
        || !/^[a-f0-9]{16}$/.test(parsed.fileId)
        || !Number.isSafeInteger(parsed.attributes) || parsed.attributes < 0
        || !Number.isSafeInteger(parsed.linkCount) || parsed.linkCount < 1
        || !Number.isSafeInteger(parsed.size) || parsed.size < 0
        || !(parsed.sha256 === "-" || (/^[a-f0-9]{64}$/.test(parsed.sha256) && parsed.size <= 131_072))) {
      throw fixtureEnvironmentError("metadata-inspect");
    }
    return parsed;
  } catch {
    throw fixtureEnvironmentError("metadata-inspect");
  }
}

function runWindowsNativeHelper(arguments_: string[]): { status: number | null; error?: Error; stdout?: string } {
  const helper = join(dirname(fileURLToPath(import.meta.url)), "windows-write-through.ps1");
  if (!existsSync(helper)) return { status: null, error: new Error("helper unavailable") };
  const result = spawnSync("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    helper,
    ...arguments_,
  ], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 15_000,
  });
  return { status: result.status, error: result.error, stdout: result.stdout };
}

function encodeWindowsNativeIdentity(identity: FixtureWindowsNativeIdentity, includeContent: boolean): string[] {
  const base = [identity.volumeSerial, identity.fileId, String(identity.attributes), String(identity.linkCount)];
  return includeContent ? [...base, String(identity.size), identity.sha256] : base;
}

function sameWindowsNativeIdentity(left: FixtureWindowsNativeIdentity, right: FixtureWindowsNativeIdentity): boolean {
  return left.volumeSerial === right.volumeSerial
    && left.fileId === right.fileId
    && left.attributes === right.attributes
    && left.linkCount === right.linkCount
    && left.size === right.size
    && left.sha256 === right.sha256;
}

function sameReplaceDestinationStat(expected: BigIntStats, actual: BigIntStats): boolean {
  return sameIdentity(expected, actual)
    && expected.mode === actual.mode
    && expected.nlink === actual.nlink
    && expected.size === actual.size;
}

function assertReplaceDestinationAuthority(path: string, expected: FixtureReplaceDestinationAuthority): void {
  const opened = openAndReadOwnedFile(path, 131_072, true);
  try {
    if (!sameReplaceDestinationStat(expected.stat, opened.stat)
        || createHash("sha256").update(opened.bytes).digest("hex") !== expected.sha256
        || !descriptorStillContains(opened.descriptor, opened.stat, opened.bytes)
        || !sameReplaceDestinationStat(expected.stat, lstatSync(path, { bigint: true }))) {
      throw fixtureEnvironmentError("metadata-replace");
    }
  } finally {
    closeDescriptor(opened.descriptor, {}, basename(path));
  }
}

function windowsDestinationMatches(
  source: string,
  destination: string,
  sourceNodeIdentity: BigIntStats,
  expected: FixtureWindowsNativeIdentity,
  inspect: (path: string) => FixtureWindowsNativeIdentity,
): boolean {
  if (existsSync(source) || !existsSync(destination)) return false;
  try {
    const destinationNodeIdentity = lstatSync(destination, { bigint: true });
    return sameIdentity(sourceNodeIdentity, destinationNodeIdentity)
      && sameWindowsNativeIdentity(expected, inspect(destination));
  } catch {
    return false;
  }
}

export interface FixtureMusicTokenSecretDependencies {
  randomNameBytes?: (size: number) => Buffer;
  open?: (path: string, flags: number, mode: number) => number;
  write?: typeof writeSync;
  sync?: typeof fsyncSync;
  truncate?: typeof ftruncateSync;
  close?: typeof closeSync;
  beforeErase?: () => void;
  syncDirectory?: (path: string) => void;
  durableReplace?: FixtureDurableReplace;
}

export interface FixtureEnvironmentPersistenceDependencies extends FixtureMusicTokenSecretDependencies {
  rename?: typeof renameSync;
  beforePublish?: () => void;
  syncDirectory?: (path: string) => void;
  afterReferenceCommit?: () => void;
  beforeReferenceCommit?: (state: FixtureEnvironmentCommitState) => void;
  afterReferenceRename?: () => void;
  retainPreviousAuthority?: boolean;
  prewrittenGeneration?: { path: string; stat: BigIntStats };
}

export interface FixtureEnvironmentReadDependencies {
  afterReferenceRead?: () => void;
  afterGenerationOpen?: () => void;
}

export interface FixtureAuthoritySnapshot {
  kind: "environment" | "credential";
  relativePath: string;
  directoryDev: string;
  directoryIno: string;
  fileDev: string;
  fileIno: string;
  size: number;
  sha256: string;
}

export interface FixtureEnvironmentCommitState {
  targetReference: string;
  candidate: FixtureAuthoritySnapshot;
  previous?: FixtureAuthoritySnapshot;
}

export interface FixtureAuthorityPaths {
  tokenPath: string;
  migratorPasswordPath: string;
  runtimePasswordPath: string;
}

export interface FixtureAuthorityRotationDependencies {
  operationIdBytes?: () => Buffer;
  credentialNameBytes?: (index: number) => Buffer;
  credentialSecretBytes?: (index: number) => Buffer;
  candidateWrite?: typeof writeSync;
  candidateSync?: typeof fsyncSync;
  candidateClose?: typeof closeSync;
  beforeCandidateCreate?: (kind: "credential" | "environment", index: number) => void;
  afterCandidateAllocatedBeforeWrite?: (kind: "credential" | "environment", index: number) => void;
  afterCandidateWriteBeforeSync?: (kind: "credential" | "environment", index: number) => void;
  afterCandidateSyncBeforeClose?: (kind: "credential" | "environment", index: number) => void;
  afterCandidateCloseBeforeComplete?: (kind: "credential" | "environment", index: number) => void;
  afterCandidateCreatedBeforeJournalUpdate?: (kind: "credential" | "environment", index: number) => void;
  afterJournalCommit?: () => void;
  syncCandidateDirectory?: (path: string) => void;
  persistence?: FixtureEnvironmentPersistenceDependencies;
  syncJournalDirectory?: (path: string) => void;
  journal?: {
    randomNameBytes?: (size: number) => Buffer;
    write?: typeof writeSync;
    sync?: typeof fsyncSync;
    close?: typeof closeSync;
    rename?: typeof renameSync;
  };
  durableReplace?: FixtureDurableReplace;
}

export function prepareFixtureMusicTokenSecret(
  repositoryRoot: string,
  randomBytes: (size: number) => Buffer = secureRandomBytes,
  dependencies: FixtureMusicTokenSecretDependencies = {},
): string {
  const { root, artifactDirectory, tokenDirectory } = fixtureDirectories(repositoryRoot);
  assertNoLinkedAncestors(root);
  assertOwnedDirectory(root);
  ensureOwnedDirectory(artifactDirectory);
  ensureOwnedDirectory(tokenDirectory);
  assertNoLinkedAncestors(tokenDirectory);

  const nameBytes = (dependencies.randomNameBytes ?? secureRandomBytes)(16);
  if (!Buffer.isBuffer(nameBytes) || nameBytes.length !== 16) throw fixtureSecretError();
  const tokenPath = join(tokenDirectory, `current-${nameBytes.toString("hex")}`);
  const creationPath = process.platform === "win32"
    ? join(tokenDirectory, `.standalone-create-${nameBytes.toString("hex")}.tmp`)
    : tokenPath;
  assertExactTokenPath(root, tokenPath);
  const secret = randomBytes(32);
  if (!Buffer.isBuffer(secret) || secret.length < 32) throw fixtureSecretError();
  const encoded = Buffer.from(secret).toString("base64url");
  const directoryBefore = lstatSync(tokenDirectory, { bigint: true });
  const noFollow = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow;
  const openFile = dependencies.open ?? openSync;
  const writeFile = dependencies.write ?? writeSync;
  const syncFile = dependencies.sync ?? fsyncSync;
  let descriptor: number | undefined;
  let opened: BigIntStats | undefined;
  try {
    descriptor = openFile(creationPath, flags, 0o600);
    opened = fstatSync(descriptor, { bigint: true });
    assertOwnedRegularFile(opened);
    if (!sameIdentity(directoryBefore, lstatSync(tokenDirectory, { bigint: true }))) throw fixtureSecretError();
    assertNoLinkedAncestors(tokenPath);
    fchmodSync(descriptor, 0o600);
    if (process.platform === "win32") {
      // Publish only an empty, non-secret inode by pathname. Secret material is
      // written through the descriptor reopened on that exact durable inode.
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      (dependencies.durableReplace ?? replaceFixtureMetadataDurably)(creationPath, tokenPath);
      descriptor = openFile(tokenPath, constants.O_RDWR, 0o600);
      const reopened = fstatSync(descriptor, { bigint: true });
      if (!sameIdentity(opened, reopened) || reopened.size !== BigInt(0)) throw fixtureSecretError();
    }
    const bytes = Buffer.from(encoded, "ascii");
    if (writeFile(descriptor, bytes, 0, bytes.length, 0) !== bytes.length) throw fixtureSecretError();
    syncFile(descriptor);
    const afterWrite = fstatSync(descriptor, { bigint: true });
    assertOwnedRegularFile(afterWrite);
    if (!sameIdentity(opened, afterWrite) || afterWrite.size !== BigInt(bytes.length)) throw fixtureSecretError();
    closeDescriptor(descriptor, dependencies, basename(tokenPath));
    descriptor = undefined;
  } catch {
    if (descriptor !== undefined) eraseAndCloseDescriptor(descriptor, dependencies, basename(tokenPath));
    throw fixtureSecretError();
  }
  const final = lstatSync(tokenPath, { bigint: true });
  assertOwnedRegularFile(final);
  if (!opened || !sameIdentity(opened, final)
      || !sameIdentity(directoryBefore, lstatSync(tokenDirectory, { bigint: true }))) throw fixtureSecretError();
  if (process.platform !== "win32" && (final.mode & BigInt(0o077)) !== BigInt(0)) throw fixtureSecretError();
  if (dependencies.syncDirectory) dependencies.syncDirectory(tokenDirectory);
  else if (process.platform !== "win32") syncDirectory(tokenDirectory);
  return tokenPath;
}

export function cleanupFixtureMusicTokenSecret(
  repositoryRoot: string,
  exactTokenPath: string,
  dependencies: FixtureMusicTokenSecretDependencies = {},
): void {
  const { root, artifactDirectory, tokenDirectory } = fixtureDirectories(repositoryRoot);
  assertExactTokenPath(root, exactTokenPath);
  assertNoLinkedAncestors(root);
  assertOwnedDirectory(root);
  if (!existsSync(artifactDirectory) || !existsSync(tokenDirectory) || !existsSync(exactTokenPath)) return;
  assertOwnedDirectory(artifactDirectory);
  assertOwnedDirectory(tokenDirectory);
  assertNoLinkedAncestors(exactTokenPath);
  if (!sameResolvedPath(realpathSync(exactTokenPath), exactTokenPath)) throw fixtureSecretError();
  const directoryBefore = lstatSync(tokenDirectory, { bigint: true });
  const before = lstatSync(exactTokenPath, { bigint: true });
  assertOwnedRegularFile(before);
  const noFollow = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
  let descriptor: number;
  try {
    descriptor = (dependencies.open ?? openSync)(exactTokenPath, constants.O_RDWR | noFollow, 0o600);
  } catch {
    throw fixtureSecretError();
  }
  let failed = false;
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    assertOwnedRegularFile(opened);
    if (!sameIdentity(before, opened)
        || !sameIdentity(directoryBefore, lstatSync(tokenDirectory, { bigint: true }))) throw fixtureSecretError();
    dependencies.beforeErase?.();
    eraseDescriptor(descriptor, dependencies);
  } catch {
    failed = true;
  }
  try {
    (dependencies.close ?? closeSync)(descriptor);
  } catch {
    failed = true;
  }
  if (failed) throw new FixtureSecretCleanupError(basename(exactTokenPath));
}

export type FixtureAggregateCleanupPhase = "credentials" | "other-generations" | "journals" | "temporaries" | "current-generation" | "pointer";

export interface FixtureAggregateCleanupDependencies {
  afterAuthenticated?: () => void;
  beforePhase?: (phase: FixtureAggregateCleanupPhase) => void;
  targetDependencies?: (phase: FixtureAggregateCleanupPhase, path: string) => FixtureMusicTokenSecretDependencies;
}

interface FixtureAggregateCleanupTarget {
  path: string;
  targetId: string;
  phase: FixtureAggregateCleanupPhase;
  stat: BigIntStats;
  bytes: Buffer;
}

interface FixtureAggregateCleanupAuthority {
  state: "empty" | "supported";
  targets: FixtureAggregateCleanupTarget[];
  currentGenerationName?: string;
}

export interface RetiredFixtureMusicAuthorityAttestation {
  schemaVersion: "music-fixture-authority-attestation/v1";
  state: "absent" | "tombstone";
  safeToBootstrap: true;
  usableRecords: 0;
}

function fixtureAggregateCleanupError(targetId = "aggregate-authority"): FixtureSecretCleanupError {
  return new FixtureSecretCleanupError(targetId);
}

function listAggregateCleanupTargets(root: string, currentGenerationName?: string): Array<{
  path: string;
  targetId: string;
  phase: FixtureAggregateCleanupPhase;
}> {
  const targets: Array<{ path: string; targetId: string; phase: FixtureAggregateCleanupPhase }> = [];
  const addDirectory = (directory: string, matcher: RegExp, phase: FixtureAggregateCleanupPhase): void => {
    if (!existsSync(directory)) return;
    assertNoLinkedAncestors(directory);
    assertOwnedDirectory(directory);
    for (const name of readdirSync(directory).sort()) {
      if (!matcher.test(name)) continue;
      const path = join(directory, name);
      // Only regular files can be authenticated fixture authority. A stale or
      // hostile directory using the filename pattern is never followed and
      // must not prevent recovery of exact labeled disposable resources.
      if (!lstatSync(path, { bigint: true }).isFile()) continue;
      targets.push({ path, targetId: name, phase });
    }
  };
  addDirectory(join(root, FIXTURE_MUSIC_TOKEN_SECRET_DIRECTORY_RELATIVE_PATH), fixtureTokenName, "credentials");
  const generationDirectory = join(root, FIXTURE_MUSIC_ENVIRONMENT_DIRECTORY_RELATIVE_PATH);
  if (existsSync(generationDirectory)) {
    assertNoLinkedAncestors(generationDirectory);
    assertOwnedDirectory(generationDirectory);
    for (const name of readdirSync(generationDirectory).sort()) {
      if (!fixtureEnvironmentGenerationName.test(name)) continue;
      targets.push({
        path: join(generationDirectory, name),
        targetId: name,
        phase: name === currentGenerationName ? "current-generation" : "other-generations",
      });
    }
  }
  const journalMatcher = /^(?:rotation-[a-f0-9]{32}\.json|\.rotation-(?:update|intent)-[a-f0-9]{32}\.tmp)$/;
  addDirectory(join(root, ".artifacts", "music-rotation-journals"), journalMatcher, "journals");
  assertNoLinkedAncestors(root);
  assertOwnedDirectory(root);
  for (const name of readdirSync(root).sort()) {
    if (!fixtureEnvironmentTemporaryName.test(name) && !fixtureEnvironmentReferenceTemporaryName.test(name)) continue;
    targets.push({ path: join(root, name), targetId: name, phase: "temporaries" });
  }
  const pointerPath = join(root, ".env.music.test");
  if (existsSync(pointerPath)) targets.push({ path: pointerPath, targetId: ".env.music.test", phase: "pointer" });
  return targets.sort((left, right) => left.path.localeCompare(right.path));
}

function captureAggregateCleanupTarget(target: { path: string; targetId: string; phase: FixtureAggregateCleanupPhase }): FixtureAggregateCleanupTarget {
  try {
    const opened = openAndReadOwnedFileAllowEmpty(target.path, target.phase === "pointer" ? 512 : 65_536, target.phase !== "journals");
    try { return { ...target, stat: opened.stat, bytes: Buffer.from(opened.bytes) }; }
    finally { closeDescriptor(opened.descriptor, {}, target.targetId); }
  } catch (error) {
    if (error instanceof FixtureSecretCleanupError) throw error;
    throw fixtureAggregateCleanupError(target.targetId);
  }
}

function captureAggregateCleanupTargets(root: string, currentGenerationName?: string): FixtureAggregateCleanupTarget[] {
  return listAggregateCleanupTargets(root, currentGenerationName).map(captureAggregateCleanupTarget);
}

function revalidateAggregateCleanupAuthority(root: string, authority: FixtureAggregateCleanupAuthority): void {
  const listed = listAggregateCleanupTargets(root, authority.currentGenerationName);
  if (listed.length !== authority.targets.length
      || listed.some((target, index) => target.path !== authority.targets[index]!.path || target.phase !== authority.targets[index]!.phase)) {
    throw fixtureAggregateCleanupError();
  }
  for (const expected of authority.targets) {
    const observed = captureAggregateCleanupTarget(expected);
    if (!sameIdentity(expected.stat, observed.stat) || !expected.bytes.equals(observed.bytes)) {
      throw fixtureAggregateCleanupError(expected.targetId);
    }
  }
}

function authenticateAggregateCleanupAuthority(root: string): FixtureAggregateCleanupAuthority {
  const authorityState = inspectFixtureEnvironmentAuthority(root);
  if (authorityState === "unsupported") throw new FixtureUnsupportedLegacyEnvironmentError();
  if (authorityState === "missing" || authorityState === "tombstone") {
    const targets = captureAggregateCleanupTargets(root);
    if (targets.some((target) => target.bytes.length > 0)) throw fixtureAggregateCleanupError();
    return { state: "empty", targets };
  }

  let currentEnvironment: FixtureEnvironmentReference | undefined;
  try {
    const referenceBytes = readCurrentPointerBytes(root);
    currentEnvironment = parseFixtureEnvironmentReference(referenceBytes.toString("ascii"));
    const contents = readFixtureMusicEnvironment(root);
    const referencedCredentials = fixtureCredentialPaths({ contents }).map((path) => resolve(root, path));
    const targets = captureAggregateCleanupTargets(root, currentEnvironment.generationName);
    const pointer = targets.find((target) => target.phase === "pointer");
    const currentGeneration = targets.find((target) => target.phase === "current-generation");
    const referencedSet = new Set(referencedCredentials);
    if (!pointer || !pointer.bytes.equals(referenceBytes)) throw fixtureAggregateCleanupError(".env.music.test");
    if (!currentGeneration) throw fixtureAggregateCleanupError(currentEnvironment.generationName);
    if (currentGeneration.bytes.length !== currentEnvironment.size) throw fixtureAggregateCleanupError(currentEnvironment.generationName);
    if (createHash("sha256").update(currentGeneration.bytes).digest("hex") !== currentEnvironment.digest) {
      throw fixtureAggregateCleanupError(currentEnvironment.generationName);
    }
    if (referencedCredentials.length !== 3) throw fixtureAggregateCleanupError("credential-authority");
    for (const path of referencedCredentials) {
      const target = targets.find((candidate) => candidate.path === path && candidate.phase === "credentials");
      if (!target || target.bytes.length === 0) throw fixtureAggregateCleanupError(basename(path));
    }
    const additionalCredential = targets.find((target) => target.phase === "credentials" && target.bytes.length > 0 && !referencedSet.has(target.path));
    if (additionalCredential) throw fixtureAggregateCleanupError(additionalCredential.targetId);
    const additionalGeneration = targets.find((target) => target.phase === "other-generations" && target.bytes.length > 0);
    if (additionalGeneration) throw fixtureAggregateCleanupError(additionalGeneration.targetId);
    const authority: FixtureAggregateCleanupAuthority = { state: "supported", targets, currentGenerationName: currentEnvironment.generationName };
    revalidateAggregateCleanupAuthority(root, authority);
    return authority;
  } catch (error) {
    if (error instanceof FixtureUnsupportedLegacyEnvironmentError || error instanceof FixtureSecretCleanupError) throw error;
    if (error instanceof FixtureEnvironmentPersistenceError) throw fixtureAggregateCleanupError(error.targetId);
    if (inspectFixtureEnvironmentAuthority(root) === "unsupported") throw new FixtureUnsupportedLegacyEnvironmentError();
    throw fixtureAggregateCleanupError(currentEnvironment?.generationName);
  }
}

function assertRetiredFixtureAuthorityInventoryShapes(root: string): void {
  const observed = (path: string): BigIntStats | undefined => {
    try { return lstatSync(path, { bigint: true }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw fixtureAggregateCleanupError();
    }
  };
  const directory = (path: string, matcher?: RegExp): void => {
    const stat = observed(path);
    if (!stat) return;
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw fixtureAggregateCleanupError();
    assertNoLinkedAncestors(path);
    assertOwnedDirectory(path);
    if (!matcher) return;
    for (const name of readdirSync(path)) {
      if (!matcher.test(name)) continue;
      const leaf = observed(join(path, name));
      if (!leaf?.isFile() || leaf.isSymbolicLink()) throw fixtureAggregateCleanupError();
    }
  };
  assertNoLinkedAncestors(root);
  assertOwnedDirectory(root);
  directory(join(root, ".artifacts"));
  directory(join(root, FIXTURE_MUSIC_TOKEN_SECRET_DIRECTORY_RELATIVE_PATH), fixtureTokenName);
  directory(join(root, FIXTURE_MUSIC_ENVIRONMENT_DIRECTORY_RELATIVE_PATH), fixtureEnvironmentGenerationName);
  directory(
    join(root, ".artifacts", "music-rotation-journals"),
    /^(?:rotation-[a-f0-9]{32}\.json|\.rotation-(?:update|intent)-[a-f0-9]{32}\.tmp)$/,
  );
  for (const name of readdirSync(root)) {
    if (name !== ".env.music.test"
        && !fixtureEnvironmentTemporaryName.test(name)
        && !fixtureEnvironmentReferenceTemporaryName.test(name)) continue;
    const leaf = observed(join(root, name));
    if (!leaf?.isFile() || leaf.isSymbolicLink()) throw fixtureAggregateCleanupError();
  }
}

export function attestRetiredFixtureMusicAuthority(
  repositoryRoot: string,
): RetiredFixtureMusicAuthorityAttestation {
  const root = resolve(repositoryRoot);
  assertRetiredFixtureAuthorityInventoryShapes(root);
  const state = inspectFixtureEnvironmentAuthority(root);
  if (state === "unsupported") throw new FixtureUnsupportedLegacyEnvironmentError();
  if (state === "reference") throw fixtureAggregateCleanupError();
  const authority = authenticateAggregateCleanupAuthority(root);
  if (authority.state !== "empty") throw fixtureAggregateCleanupError();
  revalidateAggregateCleanupAuthority(root, authority);
  if (inspectFixtureEnvironmentAuthority(root) !== state) throw fixtureAggregateCleanupError();
  assertRetiredFixtureAuthorityInventoryShapes(root);
  revalidateAggregateCleanupAuthority(root, authority);
  return {
    schemaVersion: "music-fixture-authority-attestation/v1",
    state: state === "missing" ? "absent" : "tombstone",
    safeToBootstrap: true,
    usableRecords: 0,
  };
}

function retireAggregateCleanupTarget(
  root: string,
  authority: FixtureAggregateCleanupAuthority,
  target: FixtureAggregateCleanupTarget,
  dependencies: FixtureMusicTokenSecretDependencies,
): void {
  if (target.bytes.length === 0) return;
  revalidateAggregateCleanupAuthority(root, authority);
  assertNoLinkedAncestors(target.path);
  const before = lstatSync(target.path, { bigint: true });
  if (!sameIdentity(before, target.stat)) throw fixtureAggregateCleanupError(target.targetId);
  const noFollow = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
  let descriptor: number;
  try { descriptor = (dependencies.open ?? openSync)(target.path, constants.O_RDWR | noFollow, 0o600); }
  catch { throw fixtureAggregateCleanupError(target.targetId); }
  let failed = false;
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    if (!sameIdentity(target.stat, opened) || !target.bytes.equals(bytes)
        || !sameIdentity(opened, lstatSync(target.path, { bigint: true }))) throw fixtureSecretError();
    dependencies.beforeErase?.();
    eraseDescriptor(descriptor, dependencies);
  } catch { failed = true; }
  try { (dependencies.close ?? closeSync)(descriptor); } catch { failed = true; }
  if (failed) throw fixtureAggregateCleanupError(target.targetId);
  target.bytes = Buffer.alloc(0);
  const retired = captureAggregateCleanupTarget(target);
  if (!sameIdentity(target.stat, retired.stat) || retired.bytes.length !== 0) throw fixtureAggregateCleanupError(target.targetId);
}

export function cleanupAllFixtureMusicTokenSecrets(
  repositoryRoot: string,
  dependencies: FixtureAggregateCleanupDependencies = {},
): void {
  const root = resolve(repositoryRoot);
  const authority = authenticateAggregateCleanupAuthority(root);
  if (authority.state === "empty") return;
  revalidateAggregateCleanupAuthority(root, authority);
  dependencies.afterAuthenticated?.();
  const phases: FixtureAggregateCleanupPhase[] = [
    "credentials",
    "other-generations",
    "journals",
    "temporaries",
    "current-generation",
    "pointer",
  ];
  for (const phase of phases) {
    dependencies.beforePhase?.(phase);
    revalidateAggregateCleanupAuthority(root, authority);
    for (const target of authority.targets.filter((candidate) => candidate.phase === phase)) {
      retireAggregateCleanupTarget(root, authority, target, dependencies.targetDependencies?.(phase, target.path) ?? {});
    }
  }
  const retired = authenticateAggregateCleanupAuthority(root);
  if (retired.state !== "empty") throw fixtureAggregateCleanupError();
}

export function cleanupFixtureEnvironmentTemporary(
  repositoryRoot: string,
  exactTemporaryPath: string,
  dependencies: FixtureMusicTokenSecretDependencies = {},
): void {
  const root = resolve(repositoryRoot);
  const absolute = resolve(exactTemporaryPath);
  const targetId = basename(absolute);
  const recognized = fixtureEnvironmentTemporaryName.test(targetId) || fixtureEnvironmentReferenceTemporaryName.test(targetId);
  if (dirname(absolute) !== root || !recognized) {
    throw new FixtureSecretCleanupError(recognized ? targetId : "unknown");
  }
  assertNoLinkedAncestors(absolute);
  assertOwnedDirectory(root);
  if (!existsSync(absolute)) return;
  if (!sameResolvedPath(realpathSync(absolute), absolute)) throw new FixtureSecretCleanupError(targetId);
  const directoryBefore = lstatSync(root, { bigint: true });
  const before = lstatSync(absolute, { bigint: true });
  assertOwnedRegularFile(before);
  const noFollow = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
  let descriptor: number;
  try {
    descriptor = (dependencies.open ?? openSync)(absolute, constants.O_RDWR | noFollow, 0o600);
  } catch {
    throw new FixtureSecretCleanupError(targetId);
  }
  let failed = false;
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    assertOwnedRegularFile(opened);
    if (!sameIdentity(before, opened) || !sameIdentity(directoryBefore, lstatSync(root, { bigint: true }))) {
      throw new FixtureSecretCleanupError(targetId);
    }
    dependencies.beforeErase?.();
    eraseDescriptor(descriptor, dependencies);
  } catch {
    failed = true;
  }
  try {
    (dependencies.close ?? closeSync)(descriptor);
  } catch {
    failed = true;
  }
  if (failed) throw new FixtureSecretCleanupError(targetId);
}

export async function withFixtureMusicTokenSecretCleanup<T>(
  repositoryRoot: string,
  exactTokenPath: string,
  action: () => Promise<T>,
  dependencies: FixtureMusicTokenSecretDependencies = {},
): Promise<T> {
  try {
    return await action();
  } finally {
    cleanupFixtureMusicTokenSecret(repositoryRoot, exactTokenPath, dependencies);
  }
}

export function rotateFixtureMusicAuthority(
  repositoryRoot: string,
  buildEnvironment: (paths: FixtureAuthorityPaths) => string,
  dependencies: FixtureAuthorityRotationDependencies = {},
): string {
  const root = resolve(repositoryRoot);
  assertSupportedFixtureEnvironmentAuthority(root);
  recoverFixtureAuthorityRotations(root);
  const { artifactDirectory, tokenDirectory } = fixtureDirectories(root);
  const generationDirectory = join(root, FIXTURE_MUSIC_ENVIRONMENT_DIRECTORY_RELATIVE_PATH);
  ensureOwnedDirectory(artifactDirectory);
  ensureOwnedDirectory(tokenDirectory);
  ensureOwnedDirectory(generationDirectory);
  const operationBytes = dependencies.operationIdBytes?.()
    ?? dependencies.credentialNameBytes?.(0)
    ?? secureRandomBytes(16);
  if (!Buffer.isBuffer(operationBytes) || operationBytes.length !== 16) throw fixtureSecretError();
  const operationId = Buffer.from(operationBytes).toString("hex");
  const priorEnvironment = readFixtureEnvironmentForRotation(root);
  const priorCredentials = priorEnvironment?.contents
    ? fixtureCredentialPaths({ contents: priorEnvironment.contents }).map((path) => captureFixtureAuthority(root, path, "credential"))
    : [];
  const priorPointer = readCurrentPointerBytes(root);
  const priorReference = parseOptionalFixtureReference(priorPointer);
  const priorGeneration = captureReferencedEnvironmentAuthority(root, priorReference);
  const credentialSecrets = Array.from({ length: 3 }, (_, index) => {
    const bytes = dependencies.credentialSecretBytes?.(index) ?? secureRandomBytes(32);
    if (!Buffer.isBuffer(bytes) || bytes.length < 32) throw fixtureSecretError();
    return Buffer.from(bytes);
  });
  const roles: FixtureAuthorityRole[] = ["token", "migrator", "runtime", "environment"];
  const candidatePaths = roles.slice(0, 3).map((role) => join(tokenDirectory, `current-${operationBoundLeafId(operationId, role)}`));
  const paths: FixtureAuthorityPaths = {
    tokenPath: candidatePaths[0]!,
    migratorPasswordPath: candidatePaths[1]!,
    runtimePasswordPath: candidatePaths[2]!,
  };
  const contents = buildEnvironment(paths);
  const referencedCredentials = fixtureCredentialPaths({ contents }).map((value) => resolve(root, value));
  if (referencedCredentials.length !== candidatePaths.length
      || referencedCredentials.some((value, index) => !sameResolvedPath(value, candidatePaths[index]!))) {
    throw fixtureEnvironmentError("rotation-environment");
  }
  assertFixturePublicationAuthoritySeparation(contents, credentialSecrets);
  const environmentBytes = Buffer.from(contents, "utf8");
  if (!environmentBytes.length || environmentBytes.length > 65_536) throw fixtureEnvironmentError("rotation-environment");
  const generationId = operationBoundLeafId(operationId, "environment");
  const generationRandom = Buffer.from(generationId, "hex");
  const generationName = `generation-${generationId}`;
  const generationPath = join(generationDirectory, generationName);
  const targetReference = encodeFixtureEnvironmentReference({
    generationName,
    digest: createHash("sha256").update(environmentBytes).digest("hex"),
    size: environmentBytes.length,
  });
  const candidatePlans: FixtureAuthorityIntent[] = [
    ...candidatePaths.map((path, index) => plannedFixtureAuthority(
      root,
      path,
      "credential",
      roles[index]!,
      Buffer.from(credentialSecrets[index]!).toString("base64url"),
    )),
    plannedFixtureAuthority(root, generationPath, "environment", "environment", environmentBytes),
  ];
  let journal: FixtureRotationJournal = {
    schemaVersion: "music-fixture-rotation/v3",
    operationId,
    phase: "intent",
    rootDev: lstatSync(root, { bigint: true }).dev.toString(),
    rootIno: lstatSync(root, { bigint: true }).ino.toString(),
    targetReference,
    priorReference,
    priorPointerSha256: createHash("sha256").update(priorPointer).digest("hex"),
    prior: [...priorCredentials, ...(priorGeneration ? [priorGeneration] : [])],
    candidate: candidatePlans,
  };
  let journalName: string | undefined;
  try {
    journalName = writeFixtureRotationJournal(root, journal, dependencies.syncJournalDirectory, dependencies.journal, dependencies.durableReplace);
    const candidateBytes = [
      ...credentialSecrets.map((secret) => Buffer.from(secret).toString("base64url")).map((secret) => Buffer.from(secret, "ascii")),
      environmentBytes,
    ];
    const durableReplace: FixtureDurableReplace = dependencies.durableReplace
      ?? ((source, destination, expectedDestination) => {
        replaceFixtureMetadataDurably(source, destination, {}, expectedDestination);
      });
    for (let index = 0; index < 4; index += 1) {
      const kind = index === 3 ? "environment" : "credential";
      dependencies.beforeCandidateCreate?.(kind, index);
      const allocated = allocateFixtureCandidate(
        root,
        journal.candidate[index]!,
        operationId,
        durableReplace,
        dependencies.syncCandidateDirectory,
      );
      const allocatedCandidates = journal.candidate.slice();
      allocatedCandidates[index] = allocated.snapshot;
      journal = { ...journal, candidate: allocatedCandidates };
      replaceFixtureRotationJournal(root, journalName, journal, dependencies.syncJournalDirectory, dependencies.journal, dependencies.durableReplace);
      dependencies.afterCandidateAllocatedBeforeWrite?.(kind, index);
      const completed = completeFixtureCandidate(root, allocated, candidateBytes[index]!, kind, index, dependencies);
      dependencies.afterCandidateCreatedBeforeJournalUpdate?.(kind, index);
      const completedCandidates = journal.candidate.slice();
      completedCandidates[index] = completed;
      journal = {
        ...journal,
        candidate: completedCandidates,
        phase: index < 3 ? `credential-${index + 1}` as FixtureRotationPhase : "ready",
      };
      replaceFixtureRotationJournal(root, journalName, journal, dependencies.syncJournalDirectory, dependencies.journal, dependencies.durableReplace);
    }
    const callerBeforeCommit = dependencies.persistence?.beforeReferenceCommit;
    const callerAfterCommit = dependencies.persistence?.afterReferenceCommit;
    const persistence: FixtureEnvironmentPersistenceDependencies = {
      ...dependencies.persistence,
      randomNameBytes: () => generationRandom,
      retainPreviousAuthority: true,
      prewrittenGeneration: {
        path: generationPath,
        stat: lstatSync(generationPath, { bigint: true }),
      },
      durableReplace: dependencies.persistence?.durableReplace
        ?? (dependencies.persistence?.rename ? undefined : durableReplace),
      beforeReferenceCommit: (state) => {
        if (state.targetReference !== targetReference) throw fixtureEnvironmentError("rotation-reference");
        callerBeforeCommit?.(state);
        validateRotationCandidates(root, journal);
      },
      afterReferenceCommit: () => {
        let callbackError: unknown;
        try { callerAfterCommit?.(); } catch (error) { callbackError = error; }
        try {
          validateRotationCandidates(root, journal);
        } catch {
          restorePriorFixtureReference(root, journal);
          throw new FixtureSecretCleanupError(journalName!);
        }
        journal.phase = "committed";
        replaceFixtureRotationJournal(root, journalName!, journal, dependencies.syncJournalDirectory, dependencies.journal, dependencies.durableReplace);
        dependencies.afterJournalCommit?.();
        if (callbackError) throw callbackError;
      },
    };
    const result = persistFixtureMusicEnvironment(root, contents, persistence);
    recoverFixtureAuthorityRotations(root);
    return result;
  } catch (error) {
    if (journalName) {
      try { recoverFixtureAuthorityRotations(root); }
      catch (cleanupError) { throw cleanupError; }
    }
    throw error;
  }
}

export function recoverFixtureAuthorityRotations(repositoryRoot: string): void {
  const root = resolve(repositoryRoot);
  const journalDirectory = join(root, ".artifacts", "music-rotation-journals");
  if (!existsSync(journalDirectory)) return;
  assertNoLinkedAncestors(journalDirectory);
  assertOwnedDirectory(journalDirectory);
  for (const name of readdirSync(journalDirectory).sort()) {
    if (!fixtureRotationJournalTemporaryName.test(name)) continue;
    const path = join(journalDirectory, name);
    const opened = openAndReadOwnedFileAllowEmpty(path, 32_768, false);
    if (opened.bytes.length === 0) {
      closeDescriptor(opened.descriptor, {}, name);
      continue;
    }
    zeroOpenedRotationJournal(path, opened.descriptor, opened.stat, opened.bytes, name);
  }
  for (const name of readdirSync(journalDirectory).sort()) {
    if (!fixtureRotationJournalName.test(name)) continue;
    const path = join(journalDirectory, name);
    const opened = openAndReadOwnedFileAllowEmpty(path, 32_768, false);
    if (opened.bytes.length === 0) {
      closeDescriptor(opened.descriptor, {}, name);
      continue;
    }
    try {
      let journal = parseFixtureRotationJournal(opened.bytes.toString("utf8"));
      if (name !== `rotation-${journal.operationId}.json`) throw new FixtureSecretCleanupError(name);
      const journalRoot = lstatSync(root, { bigint: true });
      if (journalRoot.dev.toString() !== journal.rootDev || journalRoot.ino.toString() !== journal.rootIno) {
        throw new FixtureSecretCleanupError(name);
      }
      const pointer = readCurrentPointerBytes(root);
      validateFixtureRotationGraph(root, journal);
      const committed = pointer.toString("ascii") === journal.targetReference;
      const precommit = createHash("sha256").update(pointer).digest("hex") === journal.priorPointerSha256;
      if (!committed && !precommit) throw new FixtureSecretCleanupError(name);
      if (precommit) {
        if (journal.priorReference !== null && pointer.toString("ascii") !== journal.priorReference) {
          throw new FixtureSecretCleanupError(name);
        }
        validatePriorFixtureBundle(root, journal, false);
        cleanupRotationCandidates(root, journal);
      } else {
        try {
          validateRotationCandidates(root, journal);
        } catch {
          restorePriorFixtureReference(root, journal);
          throw new FixtureSecretCleanupError(name);
        }
        if (journal.phase !== "committed") {
          if (process.platform !== "win32") {
            syncDirectory(root);
            const candidateDirectories = journal.candidate.map((candidate) => dirname(resolve(root, candidate.relativePath)));
            for (let index = 0; index < candidateDirectories.length; index += 1) {
              const directory = candidateDirectories[index]!;
              if (candidateDirectories.indexOf(directory) !== index) continue;
              syncDirectory(directory);
            }
          }
          validateRotationCandidates(root, journal);
          journal = { ...journal, phase: "committed" };
          closeDescriptor(opened.descriptor, {}, name);
          replaceFixtureRotationJournal(root, name, journal);
          const replaced = openAndReadOwnedFile(path, 32_768, false);
          opened.descriptor = replaced.descriptor;
          opened.stat = replaced.stat;
          opened.bytes = replaced.bytes;
        }
        validatePriorFixtureBundle(root, journal, true);
        for (const authority of journal.prior) cleanupFixtureAuthority(root, authority);
      }
      zeroOpenedRotationJournal(path, opened.descriptor, opened.stat, opened.bytes, name);
    } catch (error) {
      try { closeSync(opened.descriptor); } catch { /* the typed cleanup failure below is authoritative */ }
      throw error instanceof FixtureSecretCleanupError ? error : new FixtureSecretCleanupError(name);
    }
  }
}

export function persistFixtureMusicEnvironment(
  repositoryRoot: string,
  contents: string,
  dependencies: FixtureEnvironmentPersistenceDependencies = {},
): string {
  const root = resolve(repositoryRoot);
  const referencePath = join(root, ".env.music.test");
  const generationDirectory = join(root, FIXTURE_MUSIC_ENVIRONMENT_DIRECTORY_RELATIVE_PATH);
  assertSupportedFixtureEnvironmentAuthority(root);
  assertNoLinkedAncestors(referencePath);
  assertOwnedDirectory(root);
  ensureOwnedDirectory(join(root, ".artifacts"));
  ensureOwnedDirectory(generationDirectory);
  assertNoLinkedAncestors(generationDirectory);
  const rootBefore = lstatSync(root, { bigint: true });
  const generationDirectoryBefore = lstatSync(generationDirectory, { bigint: true });
  const previous = readPreviousFixtureEnvironmentAuthority(root, referencePath);
  const random = (dependencies.randomNameBytes ?? secureRandomBytes)(16);
  if (!Buffer.isBuffer(random) || random.length !== 16) throw fixtureEnvironmentError("unknown");
  const generationName = `generation-${random.toString("hex")}`;
  if (!fixtureEnvironmentGenerationName.test(generationName)) throw fixtureEnvironmentError("unknown");
  const generationPath = join(generationDirectory, generationName);
  const generationCreationPath = !dependencies.prewrittenGeneration && process.platform === "win32"
    ? join(generationDirectory, `.generation-create-${random.toString("hex")}.tmp`)
    : generationPath;
  const referenceTemporaryName = `.env.music.test.reference-${random.toString("hex")}.tmp`;
  const referenceTemporaryPath = join(root, referenceTemporaryName);
  const bytes = Buffer.from(contents, "utf8");
  if (!bytes.length || bytes.length > 65_536) throw fixtureEnvironmentError(generationName);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const reference = encodeFixtureEnvironmentReference({ generationName, digest, size: bytes.length });
  const referenceBytes = Buffer.from(reference, "ascii");
  const noFollow = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow;
  let generationDescriptor: number | undefined;
  let authorityDescriptor: number | undefined;
  let referenceDescriptor: number | undefined;
  let generationOpened: BigIntStats | undefined;
  let referenceCommitted = false;
  try {
    if (dependencies.prewrittenGeneration) {
      if (!sameResolvedPath(dependencies.prewrittenGeneration.path, generationPath)) throw fixtureEnvironmentError(generationName);
      generationOpened = dependencies.prewrittenGeneration.stat;
      assertFixtureEnvironmentGeneration(lstatSync(generationPath, { bigint: true }), generationOpened, bytes.length, generationName);
    } else {
      generationDescriptor = (dependencies.open ?? openSync)(generationCreationPath, flags, 0o600);
      generationOpened = fstatSync(generationDescriptor, { bigint: true });
      assertOwnedRegularFile(generationOpened);
      if (!sameIdentity(generationDirectoryBefore, lstatSync(generationDirectory, { bigint: true }))) {
        throw fixtureEnvironmentError(generationName);
      }
      fchmodSync(generationDescriptor, 0o600);
      if (process.platform === "win32") {
        // As with credential generations, publish a durable zero-byte inode
        // first and put secret bytes only through its verified descriptor.
        fsyncSync(generationDescriptor);
        closeSync(generationDescriptor);
        generationDescriptor = undefined;
        (dependencies.durableReplace ?? replaceFixtureMetadataDurably)(generationCreationPath, generationPath);
        generationDescriptor = (dependencies.open ?? openSync)(generationPath, constants.O_RDWR, 0o600);
        const reopened = fstatSync(generationDescriptor, { bigint: true });
        if (!sameIdentity(generationOpened, reopened) || reopened.size !== BigInt(0)) {
          throw fixtureEnvironmentError(generationName);
        }
      }
      if ((dependencies.write ?? writeSync)(generationDescriptor, bytes, 0, bytes.length, 0) !== bytes.length) {
        throw fixtureEnvironmentError(generationName);
      }
      (dependencies.sync ?? fsyncSync)(generationDescriptor);
      const afterWrite = fstatSync(generationDescriptor, { bigint: true });
      assertOwnedRegularFile(afterWrite);
      if (!sameIdentity(generationOpened, afterWrite) || afterWrite.size !== BigInt(bytes.length)) {
        throw fixtureEnvironmentError(generationName);
      }
      closeDescriptor(generationDescriptor, dependencies, generationName);
      generationDescriptor = undefined;
    }

    const closedGeneration = lstatSync(generationPath, { bigint: true });
    assertFixtureEnvironmentGeneration(closedGeneration, generationOpened, bytes.length, generationName);
    authorityDescriptor = (dependencies.open ?? openSync)(generationPath, constants.O_RDWR | noFollow, 0o600);
    const authority = fstatSync(authorityDescriptor, { bigint: true });
    assertFixtureEnvironmentGeneration(authority, generationOpened, bytes.length, generationName);
    if (createHash("sha256").update(readFileSync(authorityDescriptor)).digest("hex") !== digest) {
      throw fixtureEnvironmentError(generationName);
    }
    if (!dependencies.prewrittenGeneration) {
      if (dependencies.syncDirectory) dependencies.syncDirectory(generationDirectory);
      else if (process.platform !== "win32") syncDirectory(generationDirectory);
    }
    const afterGenerationSync = lstatSync(generationPath, { bigint: true });
    assertFixtureEnvironmentGeneration(afterGenerationSync, generationOpened, bytes.length, generationName);

    referenceDescriptor = (dependencies.open ?? openSync)(referenceTemporaryPath, flags, 0o600);
    const referenceOpened = fstatSync(referenceDescriptor, { bigint: true });
    assertOwnedRegularFile(referenceOpened);
    fchmodSync(referenceDescriptor, 0o600);
    if ((dependencies.write ?? writeSync)(referenceDescriptor, referenceBytes, 0, referenceBytes.length, 0) !== referenceBytes.length) {
      throw fixtureEnvironmentError(referenceTemporaryName);
    }
    (dependencies.sync ?? fsyncSync)(referenceDescriptor);
    const referenceAfterWrite = fstatSync(referenceDescriptor, { bigint: true });
    if (!sameIdentity(referenceOpened, referenceAfterWrite) || referenceAfterWrite.size !== BigInt(referenceBytes.length)) {
      throw fixtureEnvironmentError(referenceTemporaryName);
    }
    closeDescriptor(referenceDescriptor, dependencies, referenceTemporaryName);
    referenceDescriptor = undefined;
    const closedReference = lstatSync(referenceTemporaryPath, { bigint: true });
    if (!sameIdentity(referenceOpened, closedReference) || closedReference.size !== BigInt(referenceBytes.length)) {
      throw fixtureEnvironmentError(referenceTemporaryName);
    }
    dependencies.beforeReferenceCommit?.({
      targetReference: reference,
      candidate: captureFixtureAuthority(root, generationPath, "environment"),
      previous: previous.generation ? environmentAuthoritySnapshot(root, previous.generation) : undefined,
    });
    dependencies.beforePublish?.();
    if (!sameIdentity(rootBefore, lstatSync(root, { bigint: true }))) throw fixtureEnvironmentError(referenceTemporaryName);
    assertFixtureEnvironmentGeneration(lstatSync(generationPath, { bigint: true }), generationOpened, bytes.length, generationName);
    const durableReferenceReplace: FixtureDurableReplace = dependencies.durableReplace
      ?? (dependencies.rename ? ((source: string, destination: string, expectedDestination) => {
        if (expectedDestination) assertReplaceDestinationAuthority(destination, expectedDestination);
        dependencies.rename!(source, destination);
        if (process.platform !== "win32") (dependencies.syncDirectory ?? syncDirectory)(dirname(destination));
      }) : ((source, destination, expectedDestination) => {
        replaceFixtureMetadataDurably(source, destination, {}, expectedDestination);
      }));
    try { durableReferenceReplace(referenceTemporaryPath, referencePath); }
    catch (renameError) {
      if (!referenceMatches(referencePath, reference, generationPath, generationOpened, { generationName, digest, size: bytes.length })) throw renameError;
    }
    dependencies.afterReferenceRename?.();
    if (!referenceMatches(referencePath, reference, generationPath, generationOpened, { generationName, digest, size: bytes.length })) {
      throw fixtureEnvironmentError(referenceTemporaryName);
    }
    referenceCommitted = true;
    dependencies.afterReferenceCommit?.();
    if (!descriptorStillContains(authorityDescriptor, generationOpened, bytes)
        || !referenceMatches(referencePath, reference, generationPath, generationOpened, { generationName, digest, size: bytes.length })) {
      throw fixtureEnvironmentError(generationName);
    }
    closeDescriptor(authorityDescriptor, dependencies, generationName);
    authorityDescriptor = undefined;
    if (previous.generation && !dependencies.retainPreviousAuthority) cleanupFixtureEnvironmentGeneration(
      root,
      previous.generation.reference.generationName,
      previous.generation.stat,
      previous.generation.reference,
      previous.generation.directoryStat,
    );
    return referencePath;
  } catch (error) {
    let cleanupFailure: unknown;
    if (referenceCommitted) {
      // The pointer is the single authority switch. Once committed, the new
      // referenced generation must never enter an erasure path, even when
      // reconciliation, descriptor close, or prior-authority cleanup fails.
      for (const descriptor of [referenceDescriptor, authorityDescriptor, generationDescriptor]) {
        if (descriptor === undefined) continue;
        try { closeSync(descriptor); } catch { cleanupFailure ??= new FixtureSecretCleanupError(generationName); }
      }
      throw cleanupFailure instanceof FixtureSecretCleanupError
        ? cleanupFailure
        : new FixtureSecretCleanupError(generationName);
    }
    for (const descriptor of [referenceDescriptor, authorityDescriptor, generationDescriptor]) {
      if (descriptor === undefined) continue;
      try { eraseAndCloseDescriptor(descriptor, dependencies, generationName); }
      catch (cleanupError) { cleanupFailure ??= cleanupError; }
    }
    if (generationOpened && authorityDescriptor === undefined && generationDescriptor === undefined) {
      try { cleanupFixtureEnvironmentGeneration(root, generationName, generationOpened); }
      catch (cleanupError) { cleanupFailure ??= cleanupError; }
    }
    if (cleanupFailure) throw cleanupFailure;
    if (error instanceof FixtureSecretCleanupError) throw error;
    throw fixtureEnvironmentError(referenceCommitted ? generationName : referenceTemporaryName);
  }
}

export function readFixtureMusicEnvironment(
  repositoryRoot: string,
  dependencies: FixtureEnvironmentReadDependencies = {},
): string {
  const root = resolve(repositoryRoot);
  const referencePath = join(root, ".env.music.test");
  const reference = openAndReadOwnedFile(referencePath, 512, false);
  try {
    const parsed = parseFixtureEnvironmentReference(reference.bytes.toString("ascii"));
    dependencies.afterReferenceRead?.();
    const generationDirectory = join(root, FIXTURE_MUSIC_ENVIRONMENT_DIRECTORY_RELATIVE_PATH);
    assertNoLinkedAncestors(generationDirectory);
    assertOwnedDirectory(generationDirectory);
    const generationPath = join(generationDirectory, parsed.generationName);
    const generation = openAndReadOwnedFile(generationPath, 65_536, true);
    try {
      dependencies.afterGenerationOpen?.();
      if (generation.bytes.length !== parsed.size
          || createHash("sha256").update(generation.bytes).digest("hex") !== parsed.digest
          || !descriptorStillContains(reference.descriptor, reference.stat, reference.bytes)
          || !descriptorStillContains(generation.descriptor, generation.stat, generation.bytes)
          || !sameIdentity(reference.stat, lstatSync(referencePath, { bigint: true }))
          || !sameIdentity(generation.stat, lstatSync(generationPath, { bigint: true }))) {
        throw fixtureEnvironmentError(parsed.generationName);
      }
      return generation.bytes.toString("utf8");
    } finally {
      closeDescriptor(generation.descriptor, {}, parsed.generationName);
    }
  } finally {
    closeDescriptor(reference.descriptor, {}, basename(referencePath));
  }
}

interface FixtureEnvironmentReference {
  generationName: string;
  digest: string;
  size: number;
}

interface FixtureEnvironmentGenerationAuthority {
  reference: FixtureEnvironmentReference;
  stat: BigIntStats;
  directoryStat: BigIntStats;
}

type FixtureRotationPhase = "intent" | "credential-1" | "credential-2" | "credential-3" | "ready" | "committed";
type FixtureAuthorityRole = "token" | "migrator" | "runtime" | "environment";
type FixtureAuthorityState = "planned" | "allocated" | "complete";

interface FixtureAuthorityIntent {
  kind: "environment" | "credential";
  role: FixtureAuthorityRole;
  state: FixtureAuthorityState;
  relativePath: string;
  directoryDev: string;
  directoryIno: string;
  fileDev?: string;
  fileIno?: string;
  size: number;
  sha256: string;
}

interface FixtureRotationJournal {
  schemaVersion: "music-fixture-rotation/v3";
  operationId: string;
  phase: FixtureRotationPhase;
  rootDev: string;
  rootIno: string;
  targetReference: string;
  priorReference: string | null;
  priorPointerSha256: string;
  prior: FixtureAuthoritySnapshot[];
  candidate: FixtureAuthorityIntent[];
}

function encodeFixtureEnvironmentReference(reference: FixtureEnvironmentReference): string {
  return `${fixtureEnvironmentReferenceHeader}\ngeneration=${reference.generationName}\nsha256=${reference.digest}\nsize=${reference.size}\n`;
}

function parseFixtureEnvironmentReference(contents: string): FixtureEnvironmentReference {
  const match = contents.match(/^music-fixture-env\/v1\ngeneration=(generation-[a-f0-9]{32})\nsha256=([a-f0-9]{64})\nsize=([1-9][0-9]{0,4})\n$/);
  if (!match) throw fixtureEnvironmentError("reference");
  const size = Number.parseInt(match[3]!, 10);
  if (!Number.isSafeInteger(size) || size > 65_536) throw fixtureEnvironmentError("reference");
  return { generationName: match[1]!, digest: match[2]!, size };
}

function openAndReadOwnedFile(path: string, maximumSize: number, secret: boolean): { descriptor: number; stat: BigIntStats; bytes: Buffer } {
  return openAndReadOwnedFileWithEmptyPolicy(path, maximumSize, secret, false);
}

function openAndReadOwnedFileAllowEmpty(path: string, maximumSize: number, secret: boolean): { descriptor: number; stat: BigIntStats; bytes: Buffer } {
  return openAndReadOwnedFileWithEmptyPolicy(path, maximumSize, secret, true);
}

function openAndReadOwnedFileWithEmptyPolicy(path: string, maximumSize: number, secret: boolean, allowEmpty: boolean): { descriptor: number; stat: BigIntStats; bytes: Buffer } {
  assertNoLinkedAncestors(path);
  const before = lstatSync(path, { bigint: true });
  assertOwnedRegularFile(before);
  const noFollow = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
  const descriptor = openSync(path, constants.O_RDONLY | noFollow);
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    assertOwnedRegularFile(opened);
    if (!sameIdentity(before, opened) || (!allowEmpty && opened.size < BigInt(1)) || opened.size > BigInt(maximumSize)
        || (secret && process.platform !== "win32" && (opened.mode & BigInt(0o077)) !== BigInt(0))) {
      throw fixtureEnvironmentError(basename(path));
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (!sameIdentity(opened, after) || after.size !== BigInt(bytes.length)
        || !sameIdentity(opened, lstatSync(path, { bigint: true }))) {
      throw fixtureEnvironmentError(basename(path));
    }
    return { descriptor, stat: opened, bytes };
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function descriptorStillContains(descriptor: number, expectedStat: BigIntStats, expectedBytes: Buffer): boolean {
  const current = fstatSync(descriptor, { bigint: true });
  if (!sameIdentity(expectedStat, current) || current.size !== BigInt(expectedBytes.length)) return false;
  const observed = Buffer.alloc(expectedBytes.length);
  let offset = 0;
  while (offset < observed.length) {
    const count = readSync(descriptor, observed, offset, observed.length - offset, offset);
    if (count < 1) return false;
    offset += count;
  }
  const afterRead = fstatSync(descriptor, { bigint: true });
  return observed.equals(expectedBytes)
    && sameIdentity(current, afterRead)
    && afterRead.size === BigInt(expectedBytes.length);
}

type FixtureEnvironmentAuthorityState = "missing" | "tombstone" | "reference" | "unsupported";

export function inspectFixtureEnvironmentAuthority(repositoryRoot: string): FixtureEnvironmentAuthorityState {
  const root = resolve(repositoryRoot);
  const pointerPath = join(root, ".env.music.test");
  if (!existsSync(pointerPath)) return "missing";
  let opened: ReturnType<typeof openAndReadOwnedFileAllowEmpty> | undefined;
  try {
    opened = openAndReadOwnedFileAllowEmpty(pointerPath, 65_536, false);
    if (opened.bytes.length === 0) return "tombstone";
    parseFixtureEnvironmentReference(opened.bytes.toString("ascii"));
    return "reference";
  } catch {
    return "unsupported";
  } finally {
    if (opened) closeDescriptor(opened.descriptor, {}, basename(pointerPath));
  }
}

function assertSupportedFixtureEnvironmentAuthority(root: string): void {
  if (inspectFixtureEnvironmentAuthority(root) === "unsupported") {
    throw new FixtureUnsupportedLegacyEnvironmentError();
  }
}

function readFixtureEnvironmentForRotation(root: string): { contents?: string } | undefined {
  const state = inspectFixtureEnvironmentAuthority(root);
  if (state === "missing") return undefined;
  if (state === "tombstone") return {};
  if (state === "unsupported") throw new FixtureUnsupportedLegacyEnvironmentError();
  try {
    const contents = readFixtureMusicEnvironment(root);
    if (readFixtureMusicEnvironment(root) !== contents) throw fixtureEnvironmentError("rotation-authority");
    return { contents };
  } catch (strictError) {
    const pointer = readCurrentPointerBytes(root);
    const parsed = parseFixtureEnvironmentReference(pointer.toString("ascii"));
    const generationPath = join(root, FIXTURE_MUSIC_ENVIRONMENT_DIRECTORY_RELATIVE_PATH, parsed.generationName);
    if (existsSync(generationPath)) {
      const stat = lstatSync(generationPath, { bigint: true });
      assertOwnedRegularFile(stat);
      if (stat.size === BigInt(0)) return {};
    }
    throw strictError;
  }
}

function fixtureCredentialPaths(environment: { contents: string }): string[] {
  const values = new Map(environment.contents.split(/\r?\n/).filter(Boolean).map((line) => {
    const separator = line.indexOf("=");
    if (separator < 1) throw fixtureEnvironmentError("rotation-environment");
    return [line.slice(0, separator), line.slice(separator + 1)] as const;
  }));
  const paths = ["MUSIC_TOKEN_SECRET_FILE_HOST", "MUSIC_DB_MIGRATOR_SECRET_FILE_HOST", "MUSIC_DB_RUNTIME_SECRET_FILE_HOST"]
    .map((key) => values.get(key));
  if (paths.some((value) => !value) || new Set(paths).size !== 3) throw fixtureEnvironmentError("rotation-environment");
  return paths as string[];
}

function assertFixturePublicationAuthoritySeparation(contents: string, credentialSecrets: readonly Buffer[]): void {
  const values = new Map<string, string>();
  for (const line of contents.split(/\r?\n/).filter(Boolean)) {
    const separator = line.indexOf("=");
    const key = line.slice(0, separator);
    if (separator < 1 || values.has(key)) throw fixtureEnvironmentError("publication-authority");
    values.set(key, line.slice(separator + 1));
  }
  const encoded = values.get("MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY");
  if (!encoded) return;
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) throw fixtureEnvironmentError("publication-authority");
  const publication = Buffer.from(encoded, "base64url");
  if (publication.length !== 32 || publication.toString("base64url") !== encoded) {
    throw fixtureEnvironmentError("publication-authority");
  }
  if (credentialSecrets.some((secret) => publication.equals(secret) || encoded === secret.toString("base64url"))) {
    throw fixtureEnvironmentError("publication-authority");
  }
  for (const name of [
    "SESSION_SECRET", "COOKIE_SECRET", "MUSIC_SIGNING_KEY_CURRENT_SECRET", "MUSIC_SIGNING_KEY_PREVIOUS_SECRET",
    "STRAPI_ACCESS_TOKEN", "STRAPI_JWT_SECRET", "STRAPI_LIFECYCLE_PROOF_TOKEN", "STRAPI_RECONCILIATION_TOKEN",
    "MUSIC_GATE_ATTESTATION_KEY",
  ]) {
    const authority = values.get(name);
    if (authority && (authority === encoded || publication.equals(Buffer.from(authority, "utf8")))) {
      throw fixtureEnvironmentError("publication-authority");
    }
  }
}

function parseOptionalFixtureReference(bytes: Buffer): string | null {
  if (bytes.length === 0) return null;
  try {
    const value = bytes.toString("ascii");
    return encodeFixtureEnvironmentReference(parseFixtureEnvironmentReference(value)) === value ? value : null;
  } catch {
    return null;
  }
}

function captureReferencedEnvironmentAuthority(root: string, reference: string | null): FixtureAuthoritySnapshot | undefined {
  if (!reference) return undefined;
  try {
    const parsed = parseFixtureEnvironmentReference(reference);
    return captureFixtureAuthority(
      root,
      join(root, FIXTURE_MUSIC_ENVIRONMENT_DIRECTORY_RELATIVE_PATH, parsed.generationName),
      "environment",
    );
  } catch {
    return undefined;
  }
}

function plannedFixtureAuthority(
  root: string,
  path: string,
  kind: FixtureAuthorityIntent["kind"],
  role: FixtureAuthorityRole,
  contents: Buffer | string,
): FixtureAuthorityIntent {
  const absolute = resolve(path);
  assertFixtureAuthorityPath(root, absolute, kind);
  const directory = dirname(absolute);
  assertNoLinkedAncestors(directory);
  const directoryStat = lstatSync(directory, { bigint: true });
  assertOwnedDirectory(directory);
  const bytes = Buffer.isBuffer(contents) ? contents : Buffer.from(contents, "ascii");
  if (!bytes.length || bytes.length > 65_536) throw fixtureEnvironmentError("rotation-candidate");
  return {
    kind,
    role,
    state: "planned",
    relativePath: relative(root, absolute).replace(/\\/g, "/"),
    directoryDev: directoryStat.dev.toString(),
    directoryIno: directoryStat.ino.toString(),
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function operationBoundLeafId(operationId: string, role: FixtureAuthorityRole): string {
  if (!/^[a-f0-9]{32}$/.test(operationId)) throw fixtureEnvironmentError("rotation-operation");
  return createHash("sha256").update(`music-fixture-authority/v1\0${operationId}\0${role}`, "utf8").digest("hex").slice(0, 32);
}

interface AllocatedFixtureCandidate {
  descriptor: number;
  snapshot: FixtureAuthorityIntent;
}

function allocateFixtureCandidate(
  root: string,
  intent: FixtureAuthorityIntent,
  operationId: string,
  durableReplace: (source: string, destination: string) => void,
  candidateDirectoryBarrier?: (path: string) => void,
): AllocatedFixtureCandidate {
  const path = resolve(root, intent.relativePath);
  assertFixtureAuthorityPath(root, path, intent.kind);
  const directory = dirname(path);
  const noFollow = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
  const flags = constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | noFollow;
  if (process.platform === "win32") {
    const temporary = join(directory, `.allocate-${operationId}-${intent.role}.tmp`);
    const temporaryDescriptor = openSync(temporary, flags, 0o600);
    let failed = false;
    try {
      const opened = fstatSync(temporaryDescriptor, { bigint: true });
      assertOwnedRegularFile(opened);
      fchmodSync(temporaryDescriptor, 0o600);
      fsyncSync(temporaryDescriptor);
      if (fstatSync(temporaryDescriptor, { bigint: true }).size !== BigInt(0)) throw fixtureEnvironmentError("rotation-allocation");
    } catch { failed = true; }
    try { closeSync(temporaryDescriptor); } catch { failed = true; }
    if (failed) throw fixtureEnvironmentError("rotation-allocation");
    durableReplace(temporary, path);
  }
  const descriptor = openSync(path, process.platform === "win32" ? constants.O_RDWR : flags, 0o600);
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    assertOwnedRegularFile(opened);
    fchmodSync(descriptor, 0o600);
    fsyncSync(descriptor);
    const currentDirectory = lstatSync(directory, { bigint: true });
    if (currentDirectory.dev.toString() !== intent.directoryDev || currentDirectory.ino.toString() !== intent.directoryIno
        || opened.size !== BigInt(0) || !sameIdentity(opened, lstatSync(path, { bigint: true }))) {
      throw fixtureEnvironmentError("rotation-allocation");
    }
    if (candidateDirectoryBarrier) candidateDirectoryBarrier(directory);
    else if (process.platform !== "win32") syncDirectory(directory);
    return {
      descriptor,
      snapshot: {
        ...intent,
        state: "allocated",
        fileDev: opened.dev.toString(),
        fileIno: opened.ino.toString(),
      },
    };
  } catch (error) {
    try { closeSync(descriptor); } catch { /* typed allocation failure below */ }
    throw error;
  }
}

function completeFixtureCandidate(
  root: string,
  allocated: AllocatedFixtureCandidate,
  bytes: Buffer,
  kind: "credential" | "environment",
  index: number,
  dependencies: FixtureAuthorityRotationDependencies,
): FixtureAuthorityIntent {
  const { descriptor, snapshot } = allocated;
  let closed = false;
  try {
    const write = dependencies.candidateWrite ?? writeSync;
    if (write(descriptor, bytes, 0, bytes.length, 0) !== bytes.length) throw fixtureEnvironmentError("rotation-write");
    dependencies.afterCandidateWriteBeforeSync?.(kind, index);
    (dependencies.candidateSync ?? fsyncSync)(descriptor);
    dependencies.afterCandidateSyncBeforeClose?.(kind, index);
    const after = fstatSync(descriptor, { bigint: true });
    if (after.dev.toString() !== snapshot.fileDev || after.ino.toString() !== snapshot.fileIno
        || after.size !== BigInt(bytes.length)
        || createHash("sha256").update(readFileSync(descriptor)).digest("hex") !== snapshot.sha256) {
      throw fixtureEnvironmentError("rotation-write");
    }
    (dependencies.candidateClose ?? closeSync)(descriptor);
    closed = true;
    dependencies.afterCandidateCloseBeforeComplete?.(kind, index);
    const observed = captureFixtureAuthority(root, resolve(root, snapshot.relativePath), snapshot.kind);
    if (!authorityMatchesIntent(observed, snapshot)) throw fixtureEnvironmentError("rotation-write");
    return { ...observed, role: snapshot.role, state: "complete" };
  } catch (error) {
    if (!closed) {
      try { closeSync(descriptor); } catch { /* recovery owns the journal-bound inode */ }
    }
    throw error;
  }
}

function materializeRotationCandidate(root: string, journal: FixtureRotationJournal, index: number): FixtureRotationJournal {
  const intent = journal.candidate[index];
  if (!intent) throw fixtureEnvironmentError("rotation-candidate");
  const observed = captureFixtureAuthority(root, resolve(root, intent.relativePath), intent.kind);
  if (!authorityMatchesIntent(observed, intent)) throw fixtureEnvironmentError("rotation-candidate");
  const candidate = journal.candidate.slice();
  candidate[index] = { ...observed, role: intent.role, state: "complete" };
  return { ...journal, candidate };
}

function authorityMatchesIntent(
  observed: FixtureAuthoritySnapshot,
  intent: FixtureAuthorityIntent | FixtureAuthoritySnapshot,
): boolean {
  return observed.kind === intent.kind
    && observed.relativePath === intent.relativePath
    && observed.directoryDev === intent.directoryDev
    && observed.directoryIno === intent.directoryIno
    && observed.size === intent.size
    && observed.sha256 === intent.sha256
    && (intent.fileDev === undefined || observed.fileDev === intent.fileDev)
    && (intent.fileIno === undefined || observed.fileIno === intent.fileIno);
}

function validateRotationCandidates(root: string, journal: FixtureRotationJournal): FixtureAuthoritySnapshot[] {
  const observed = journal.candidate.map((intent) => {
    if (intent.state !== "complete" || !intent.fileDev || !intent.fileIno) {
      throw new FixtureSecretCleanupError(basename(intent.relativePath));
    }
    const observed = captureFixtureAuthority(root, resolve(root, intent.relativePath), intent.kind);
    if (!authorityMatchesIntent(observed, intent)) throw new FixtureSecretCleanupError(basename(intent.relativePath));
    return observed;
  });
  const environment = journal.candidate[3]!;
  const environmentContents = readFileSync(resolve(root, environment.relativePath), "utf8");
  const referenced = fixtureCredentialPaths({ contents: environmentContents })
    .map((path) => relative(root, resolve(root, path)).replace(/\\/g, "/"));
  if (referenced.some((path, index) => path !== journal.candidate[index]!.relativePath)) {
    throw new FixtureSecretCleanupError("rotation-candidate-graph");
  }
  return observed;
}

function validateFixtureRotationGraph(root: string, journal: FixtureRotationJournal): void {
  const roles: FixtureAuthorityRole[] = ["token", "migrator", "runtime", "environment"];
  const expectedPaths = [
    ...roles.slice(0, 3).map((role) => relative(
      root,
      join(root, FIXTURE_MUSIC_TOKEN_SECRET_DIRECTORY_RELATIVE_PATH, `current-${operationBoundLeafId(journal.operationId, role)}`),
    ).replace(/\\/g, "/")),
    relative(
      root,
      join(root, FIXTURE_MUSIC_ENVIRONMENT_DIRECTORY_RELATIVE_PATH, `generation-${operationBoundLeafId(journal.operationId, "environment")}`),
    ).replace(/\\/g, "/"),
  ];
  for (let index = 0; index < journal.candidate.length; index += 1) {
    const candidate = journal.candidate[index]!;
    const expectedKind = index === 3 ? "environment" : "credential";
    if (candidate.role !== roles[index] || candidate.kind !== expectedKind || candidate.relativePath !== expectedPaths[index]) {
      throw new FixtureSecretCleanupError("rotation-candidate-graph");
    }
  }
  const candidatePaths = journal.candidate.map((candidate) => candidate.relativePath);
  const priorPaths = journal.prior.map((prior) => prior.relativePath);
  const authorityIdentities = [...journal.candidate, ...journal.prior]
    .filter((authority) => authority.fileDev !== undefined && authority.fileIno !== undefined)
    .map((authority) => `${authority.fileDev}:${authority.fileIno}`);
  if (candidatePaths.some((path, index) => candidatePaths.indexOf(path) !== index)
      || priorPaths.some((path, index) => priorPaths.indexOf(path) !== index)
      || candidatePaths.some((path) => priorPaths.includes(path))
      || authorityIdentities.some((identity, index) => authorityIdentities.indexOf(identity) !== index)) {
    throw new FixtureSecretCleanupError("rotation-authority-overlap");
  }
  const target = parseFixtureEnvironmentReference(journal.targetReference);
  const candidateEnvironment = journal.candidate[3]!;
  if (basename(candidateEnvironment.relativePath) !== target.generationName
      || candidateEnvironment.size !== target.size || candidateEnvironment.sha256 !== target.digest) {
    throw new FixtureSecretCleanupError("rotation-reference-graph");
  }
  const expectedPriorHash = createHash("sha256")
    .update(journal.priorReference === null ? Buffer.alloc(0) : Buffer.from(journal.priorReference, "ascii"))
    .digest("hex");
  if (journal.priorPointerSha256 !== expectedPriorHash) throw new FixtureSecretCleanupError("rotation-prior-reference");
  if (![0, 4].includes(journal.prior.length)
      || journal.prior.slice(0, 3).some((authority) => authority.kind !== "credential")
      || (journal.prior.length === 4 && journal.prior[3]!.kind !== "environment")) {
    throw new FixtureSecretCleanupError("rotation-prior-graph");
  }
  if (journal.prior.length === 4) {
    if (journal.priorReference === null) throw new FixtureSecretCleanupError("rotation-prior-reference");
    const priorReference = parseFixtureEnvironmentReference(journal.priorReference);
    if (basename(journal.prior[3]!.relativePath) !== priorReference.generationName
        || journal.prior[3]!.size !== priorReference.size
        || journal.prior[3]!.sha256 !== priorReference.digest) {
      throw new FixtureSecretCleanupError("rotation-prior-reference");
    }
  }
}

function validatePriorFixtureBundle(root: string, journal: FixtureRotationJournal, allowRetired: boolean): void {
  if (journal.prior.length === 0) return;
  const live: boolean[] = [];
  for (const authority of journal.prior) {
    validateFixtureAuthoritySnapshot(authority);
    const path = resolve(root, authority.relativePath);
    assertFixtureAuthorityPath(root, path, authority.kind);
    const current = lstatSync(path, { bigint: true });
    if (current.dev.toString() !== authority.fileDev || current.ino.toString() !== authority.fileIno) {
      throw new FixtureSecretCleanupError(basename(path));
    }
    if (current.size === BigInt(0)) {
      if (!allowRetired) throw new FixtureSecretCleanupError(basename(path));
      live.push(false);
      continue;
    }
    const observed = captureFixtureAuthority(root, path, authority.kind);
    if (!authorityMatchesIntent(observed, authority)) throw new FixtureSecretCleanupError(basename(path));
    live.push(true);
  }
  if (journal.prior.length !== 4) return;
  if (!live[3]) {
    if (live.some(Boolean)) throw new FixtureSecretCleanupError("rotation-prior-graph");
    return;
  }
  const environmentContents = readFileSync(resolve(root, journal.prior[3]!.relativePath), "utf8");
  const referenced = fixtureCredentialPaths({ contents: environmentContents })
    .map((path) => relative(root, resolve(root, path)).replace(/\\/g, "/"));
  if (referenced.some((path, index) => path !== journal.prior[index]!.relativePath)) {
    throw new FixtureSecretCleanupError("rotation-prior-graph");
  }
}

function restorePriorFixtureReference(root: string, journal: FixtureRotationJournal): void {
  validateFixtureRotationGraph(root, journal);
  validatePriorFixtureBundle(root, journal, false);
  if (journal.priorReference === null) throw new FixtureSecretCleanupError("rotation-prior-reference");
  const parsed = parseFixtureEnvironmentReference(journal.priorReference);
  const priorEnvironment = journal.prior.find((authority) => authority.kind === "environment"
    && basename(authority.relativePath) === parsed.generationName);
  if (!priorEnvironment) throw new FixtureSecretCleanupError("rotation-prior-reference");
  validateFixtureAuthoritySnapshot(priorEnvironment);
  const observed = captureFixtureAuthority(root, resolve(root, priorEnvironment.relativePath), "environment");
  if (!authorityMatchesIntent(observed, priorEnvironment)) throw new FixtureSecretCleanupError("rotation-prior-reference");
  publishFixtureReference(root, journal.priorReference, `restore-${journal.operationId}`);
}

function captureFixtureAuthority(root: string, pathValue: string, kind: FixtureAuthoritySnapshot["kind"]): FixtureAuthoritySnapshot {
  const path = resolve(root, pathValue);
  assertFixtureAuthorityPath(root, path, kind);
  const directory = dirname(path);
  const directoryStat = lstatSync(directory, { bigint: true });
  assertOwnedDirectory(directory);
  const opened = openAndReadOwnedFile(path, 65_536, true);
  try {
    if (!sameIdentity(directoryStat, lstatSync(directory, { bigint: true }))) throw fixtureSecretError();
    return {
      kind,
      relativePath: relative(root, path).replace(/\\/g, "/"),
      directoryDev: directoryStat.dev.toString(),
      directoryIno: directoryStat.ino.toString(),
      fileDev: opened.stat.dev.toString(),
      fileIno: opened.stat.ino.toString(),
      size: opened.bytes.length,
      sha256: createHash("sha256").update(opened.bytes).digest("hex"),
    };
  } finally {
    closeDescriptor(opened.descriptor, {}, basename(path));
  }
}

function environmentAuthoritySnapshot(root: string, authority: FixtureEnvironmentGenerationAuthority): FixtureAuthoritySnapshot {
  return {
    kind: "environment",
    relativePath: relative(root, join(root, FIXTURE_MUSIC_ENVIRONMENT_DIRECTORY_RELATIVE_PATH, authority.reference.generationName)).replace(/\\/g, "/"),
    directoryDev: authority.directoryStat.dev.toString(),
    directoryIno: authority.directoryStat.ino.toString(),
    fileDev: authority.stat.dev.toString(),
    fileIno: authority.stat.ino.toString(),
    size: authority.reference.size,
    sha256: authority.reference.digest,
  };
}

function cleanupFixtureAuthority(root: string, snapshot: FixtureAuthoritySnapshot): void {
  validateFixtureAuthoritySnapshot(snapshot);
  const path = resolve(root, snapshot.relativePath);
  assertFixtureAuthorityPath(root, path, snapshot.kind);
  const targetId = basename(path);
  const directory = dirname(path);
  const expectedDirectory = { dev: BigInt(snapshot.directoryDev), ino: BigInt(snapshot.directoryIno) };
  const currentDirectory = lstatSync(directory, { bigint: true });
  if (currentDirectory.dev !== expectedDirectory.dev || currentDirectory.ino !== expectedDirectory.ino) {
    throw new FixtureSecretCleanupError(targetId);
  }
  if (!existsSync(path)) throw new FixtureSecretCleanupError(targetId);
  const before = lstatSync(path, { bigint: true });
  assertOwnedRegularFile(before);
  if (before.dev !== BigInt(snapshot.fileDev) || before.ino !== BigInt(snapshot.fileIno)) {
    throw new FixtureSecretCleanupError(targetId);
  }
  if (before.size === BigInt(0)) {
    if (process.platform !== "win32") syncDirectory(directory);
    return;
  }
  const noFollow = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
  const descriptor = openSync(path, constants.O_RDWR | noFollow, 0o600);
  let failed = false;
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    if (opened.dev !== BigInt(snapshot.fileDev) || opened.ino !== BigInt(snapshot.fileIno)
        || bytes.length !== snapshot.size
        || createHash("sha256").update(bytes).digest("hex") !== snapshot.sha256
        || !sameIdentity(opened, lstatSync(path, { bigint: true }))
        || currentDirectory.dev !== lstatSync(directory, { bigint: true }).dev
        || currentDirectory.ino !== lstatSync(directory, { bigint: true }).ino) throw fixtureSecretError();
    eraseDescriptor(descriptor, {});
  } catch { failed = true; }
  try { closeSync(descriptor); } catch { failed = true; }
  if (process.platform !== "win32") {
    try { syncDirectory(directory); } catch { failed = true; }
  }
  if (failed) throw new FixtureSecretCleanupError(targetId);
}

function cleanupRotationCandidates(root: string, journal: FixtureRotationJournal): void {
  let failure: unknown;
  for (const intent of journal.candidate) {
    const path = resolve(root, intent.relativePath);
    try {
      if (!existsSync(path)) continue;
      const current = lstatSync(path, { bigint: true });
      const directory = lstatSync(dirname(path), { bigint: true });
      if (intent.state === "planned") {
        if (current.size !== BigInt(0)) throw new FixtureSecretCleanupError(basename(path));
        continue;
      }
      if (current.size === BigInt(0)) {
        if (directory.dev.toString() !== intent.directoryDev || directory.ino.toString() !== intent.directoryIno
            || (intent.fileDev !== undefined && current.dev.toString() !== intent.fileDev)
            || (intent.fileIno !== undefined && current.ino.toString() !== intent.fileIno)) {
          throw new FixtureSecretCleanupError(basename(path));
        }
        if (process.platform !== "win32") syncDirectory(dirname(path));
        continue;
      }
      if (intent.state === "allocated") {
        cleanupAllocatedFixtureAuthority(root, intent);
        continue;
      }
      const observed = captureFixtureAuthority(root, path, intent.kind);
      if (!authorityMatchesIntent(observed, intent)) throw new FixtureSecretCleanupError(basename(path));
      cleanupFixtureAuthority(root, observed);
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) throw failure;
}

function cleanupAllocatedFixtureAuthority(root: string, intent: FixtureAuthorityIntent): void {
  if (intent.state !== "allocated" || !intent.fileDev || !intent.fileIno) {
    throw new FixtureSecretCleanupError("rotation-allocated");
  }
  const path = resolve(root, intent.relativePath);
  assertFixtureAuthorityPath(root, path, intent.kind);
  const directory = dirname(path);
  const directoryStat = lstatSync(directory, { bigint: true });
  const before = lstatSync(path, { bigint: true });
  assertOwnedRegularFile(before);
  if (directoryStat.dev.toString() !== intent.directoryDev || directoryStat.ino.toString() !== intent.directoryIno
      || before.dev.toString() !== intent.fileDev || before.ino.toString() !== intent.fileIno) {
    throw new FixtureSecretCleanupError(basename(path));
  }
  const noFollow = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
  const descriptor = openSync(path, constants.O_RDWR | noFollow, 0o600);
  let failed = false;
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    assertOwnedRegularFile(opened);
    if (opened.dev.toString() !== intent.fileDev || opened.ino.toString() !== intent.fileIno
        || !sameIdentity(opened, lstatSync(path, { bigint: true }))) throw fixtureSecretError();
    eraseDescriptor(descriptor, {});
  } catch { failed = true; }
  try { closeSync(descriptor); } catch { failed = true; }
  if (failed) throw new FixtureSecretCleanupError(basename(path));
}

function assertFixtureAuthorityPath(root: string, path: string, kind: FixtureAuthoritySnapshot["kind"]): void {
  const absolute = resolve(path);
  if (kind === "credential") {
    assertExactTokenPath(root, absolute);
    return;
  }
  const directory = resolve(root, FIXTURE_MUSIC_ENVIRONMENT_DIRECTORY_RELATIVE_PATH);
  if (dirname(absolute) !== directory || !fixtureEnvironmentGenerationName.test(basename(absolute))) throw fixtureSecretError();
}

function validateFixtureAuthoritySnapshot(value: FixtureAuthoritySnapshot): void {
  if (!value || !["environment", "credential"].includes(value.kind)
      || typeof value.relativePath !== "string" || value.relativePath.includes("..") || value.relativePath.includes(":")
      || !/^\d+$/.test(value.directoryDev) || !/^\d+$/.test(value.directoryIno)
      || !/^\d+$/.test(value.fileDev) || !/^\d+$/.test(value.fileIno)
      || !Number.isSafeInteger(value.size) || value.size < 1 || value.size > 65_536
      || !/^[a-f0-9]{64}$/.test(value.sha256)) throw fixtureEnvironmentError("rotation-journal");
}

function writeFixtureRotationJournal(
  root: string,
  journal: FixtureRotationJournal,
  syncJournalDirectory: (path: string) => void = syncDirectory,
  dependencies: NonNullable<FixtureAuthorityRotationDependencies["journal"]> = {},
  durableReplace?: (source: string, destination: string) => void,
): string {
  const artifactDirectory = join(root, ".artifacts");
  const directory = join(artifactDirectory, "music-rotation-journals");
  ensureOwnedDirectory(artifactDirectory);
  ensureOwnedDirectory(directory);
  assertNoLinkedAncestors(directory);
  const name = `rotation-${journal.operationId}.json`;
  const path = join(directory, name);
  const temporary = join(directory, `.rotation-intent-${journal.operationId}.tmp`);
  const bytes = Buffer.from(JSON.stringify(journal), "utf8");
  const noFollow = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
  const descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600);
  let failed = false;
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    assertOwnedRegularFile(opened);
    fchmodSync(descriptor, 0o600);
    if ((dependencies.write ?? writeSync)(descriptor, bytes, 0, bytes.length, 0) !== bytes.length) throw fixtureEnvironmentError(name);
    (dependencies.sync ?? fsyncSync)(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (!sameIdentity(opened, after) || after.size !== BigInt(bytes.length)) throw fixtureEnvironmentError(name);
  } catch { failed = true; }
  if (failed) {
    try { eraseDescriptor(descriptor, {}); } catch { /* recovery remains fail-closed if erasure is uncertain */ }
  }
  try { (dependencies.close ?? closeSync)(descriptor); } catch { failed = true; }
  if (failed) throw fixtureEnvironmentError(name);
  durableReplaceWithTestSeams(temporary, path, durableReplace, dependencies.rename, syncJournalDirectory);
  return name;
}

function replaceFixtureRotationJournal(
  root: string,
  name: string,
  journal: FixtureRotationJournal,
  syncJournalDirectory: (path: string) => void = syncDirectory,
  dependencies: NonNullable<FixtureAuthorityRotationDependencies["journal"]> = {},
  durableReplace?: (source: string, destination: string) => void,
): void {
  if (!fixtureRotationJournalName.test(name)) throw fixtureEnvironmentError("rotation-journal");
  const directory = join(root, ".artifacts", "music-rotation-journals");
  assertNoLinkedAncestors(directory);
  assertOwnedDirectory(directory);
  const target = join(directory, name);
  const randomBytes = (dependencies.randomNameBytes ?? secureRandomBytes)(16);
  if (!Buffer.isBuffer(randomBytes) || randomBytes.length !== 16) throw fixtureEnvironmentError(name);
  const temporaryName = `.rotation-update-${randomBytes.toString("hex")}.tmp`;
  const temporary = join(directory, temporaryName);
  const bytes = Buffer.from(JSON.stringify(journal), "utf8");
  const noFollow = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
  const descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600);
  let failed = false;
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    assertOwnedRegularFile(opened);
    fchmodSync(descriptor, 0o600);
    if ((dependencies.write ?? writeSync)(descriptor, bytes, 0, bytes.length, 0) !== bytes.length) throw fixtureEnvironmentError(name);
    (dependencies.sync ?? fsyncSync)(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (!sameIdentity(opened, after) || after.size !== BigInt(bytes.length)) throw fixtureEnvironmentError(name);
  } catch { failed = true; }
  try { (dependencies.close ?? closeSync)(descriptor); } catch { failed = true; }
  if (failed) throw fixtureEnvironmentError(name);
  durableReplaceWithTestSeams(temporary, target, durableReplace, dependencies.rename, syncJournalDirectory);
}

function durableReplaceWithTestSeams(
  source: string,
  destination: string,
  durableReplace: ((source: string, destination: string) => void) | undefined,
  rename: typeof renameSync | undefined,
  directoryBarrier: (path: string) => void,
): void {
  if (rename || directoryBarrier !== syncDirectory) {
    (rename ?? renameSync)(source, destination);
    directoryBarrier(dirname(destination));
    return;
  }
  if (durableReplace) {
    durableReplace(source, destination);
    return;
  }
  replaceFixtureMetadataDurably(source, destination);
}

function parseFixtureRotationJournal(contents: string): FixtureRotationJournal {
  const value = JSON.parse(contents) as FixtureRotationJournal;
  if (value?.schemaVersion !== "music-fixture-rotation/v3"
      || !/^[a-f0-9]{32}$/.test(value.operationId)
      || !["intent", "credential-1", "credential-2", "credential-3", "ready", "committed"].includes(value.phase)
      || !/^\d+$/.test(value.rootDev) || !/^\d+$/.test(value.rootIno)
      || typeof value.targetReference !== "string"
      || encodeFixtureEnvironmentReference(parseFixtureEnvironmentReference(value.targetReference)) !== value.targetReference
      || !(value.priorReference === null || (typeof value.priorReference === "string"
        && encodeFixtureEnvironmentReference(parseFixtureEnvironmentReference(value.priorReference)) === value.priorReference))
      || !/^[a-f0-9]{64}$/.test(value.priorPointerSha256)
      || !Array.isArray(value.prior) || !Array.isArray(value.candidate)
      || value.prior.length > 4 || value.candidate.length !== 4) throw fixtureEnvironmentError("rotation-journal");
  for (const snapshot of value.prior) validateFixtureAuthoritySnapshot(snapshot);
  for (const intent of value.candidate) validateFixtureAuthorityIntent(intent);
  const completed = value.candidate.filter((candidate) => candidate.state === "complete").length;
  const minimum = value.phase === "intent" ? 0
    : value.phase === "credential-1" ? 1
      : value.phase === "credential-2" ? 2
        : value.phase === "credential-3" ? 3
          : 4;
  if (completed < minimum) throw fixtureEnvironmentError("rotation-journal");
  return value;
}

function validateFixtureAuthorityIntent(value: FixtureAuthorityIntent): void {
  if (!value || !["environment", "credential"].includes(value.kind)
      || !["token", "migrator", "runtime", "environment"].includes(value.role)
      || !["planned", "allocated", "complete"].includes(value.state)
      || typeof value.relativePath !== "string" || value.relativePath.includes("..") || value.relativePath.includes(":")
      || !/^\d+$/.test(value.directoryDev) || !/^\d+$/.test(value.directoryIno)
      || !Number.isSafeInteger(value.size) || value.size < 1 || value.size > 65_536
      || !/^[a-f0-9]{64}$/.test(value.sha256)
      || !((value.state === "planned" && value.fileDev === undefined && value.fileIno === undefined)
        || (value.state !== "planned"
          && typeof value.fileDev === "string" && /^\d+$/.test(value.fileDev)
          && typeof value.fileIno === "string" && /^\d+$/.test(value.fileIno))
      )) {
    throw fixtureEnvironmentError("rotation-journal");
  }
}

function publishFixtureReference(root: string, reference: string, targetId: string): void {
  const bytes = Buffer.from(reference, "ascii");
  const random = secureRandomBytes(16).toString("hex");
  const temporary = join(root, `.env.music.test.reference-${random}.tmp`);
  const target = join(root, ".env.music.test");
  const noFollow = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
  const descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600);
  let failed = false;
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    assertOwnedRegularFile(opened);
    fchmodSync(descriptor, 0o600);
    if (writeSync(descriptor, bytes, 0, bytes.length, 0) !== bytes.length) throw fixtureEnvironmentError(targetId);
    fsyncSync(descriptor);
  } catch { failed = true; }
  try { closeSync(descriptor); } catch { failed = true; }
  if (failed) throw new FixtureSecretCleanupError(targetId);
  replaceFixtureMetadataDurably(temporary, target);
  if (!readCurrentPointerBytes(root).equals(bytes)) throw new FixtureSecretCleanupError(targetId);
}

function readCurrentPointerBytes(root: string): Buffer {
  const path = join(root, ".env.music.test");
  if (!existsSync(path)) return Buffer.alloc(0);
  const opened = openAndReadOwnedFileAllowEmpty(path, 65_536, false);
  try { return Buffer.from(opened.bytes); }
  finally { closeDescriptor(opened.descriptor, {}, basename(path)); }
}

function zeroOpenedRotationJournal(path: string, readDescriptor: number, expected: BigIntStats, expectedBytes: Buffer, targetId: string): void {
  closeDescriptor(readDescriptor, {}, targetId);
  const noFollow = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
  const descriptor = openSync(path, constants.O_RDWR | noFollow, 0o600);
  let failed = false;
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    if (!sameIdentity(opened, expected) || !bytes.equals(expectedBytes) || !sameIdentity(opened, lstatSync(path, { bigint: true }))) {
      throw fixtureSecretError();
    }
    eraseDescriptor(descriptor, {});
  } catch { failed = true; }
  try { closeSync(descriptor); } catch { failed = true; }
  if (process.platform !== "win32") {
    try { syncDirectory(dirname(path)); } catch { failed = true; }
  }
  if (failed) throw new FixtureSecretCleanupError(targetId);
}

function readPreviousFixtureEnvironmentAuthority(root: string, referencePath: string): {
  generation?: FixtureEnvironmentGenerationAuthority;
} {
  if (!existsSync(referencePath)) return {};
  const opened = openAndReadOwnedFileAllowEmpty(referencePath, 65_536, false);
  if (opened.bytes.length === 0) {
    closeDescriptor(opened.descriptor, {}, basename(referencePath));
    return {};
  }
  const contents = opened.bytes.toString("utf8");
  if (!contents.startsWith(`${fixtureEnvironmentReferenceHeader}\n`)) {
    closeDescriptor(opened.descriptor, {}, basename(referencePath));
    throw new FixtureUnsupportedLegacyEnvironmentError();
  }
  let parsed: FixtureEnvironmentReference;
  try {
    parsed = parseFixtureEnvironmentReference(contents);
  } catch {
    closeDescriptor(opened.descriptor, {}, basename(referencePath));
    throw new FixtureUnsupportedLegacyEnvironmentError();
  }
  try {
    closeDescriptor(opened.descriptor, {}, basename(referencePath));
    const generationDirectory = join(root, FIXTURE_MUSIC_ENVIRONMENT_DIRECTORY_RELATIVE_PATH);
    const directoryStat = lstatSync(generationDirectory, { bigint: true });
    assertOwnedDirectory(generationDirectory);
    const generationPath = join(generationDirectory, parsed.generationName);
    const generation = openAndReadOwnedFile(generationPath, 65_536, true);
    try {
      if (generation.bytes.length !== parsed.size || createHash("sha256").update(generation.bytes).digest("hex") !== parsed.digest) {
        throw fixtureEnvironmentError(parsed.generationName);
      }
      if (!sameIdentity(directoryStat, lstatSync(generationDirectory, { bigint: true }))) {
        throw fixtureEnvironmentError(parsed.generationName);
      }
      return { generation: { reference: parsed, stat: generation.stat, directoryStat } };
    } finally {
      closeDescriptor(generation.descriptor, {}, parsed.generationName);
    }
  } catch (error) {
    try { closeDescriptor(opened.descriptor, {}, basename(referencePath)); } catch { /* already closed */ }
    // A nonsecret pointer whose generation is missing, zeroed by down/reset,
    // or attacker-swapped is not authority. Bootstrap may replace the pointer
    // but never mutates the unverified referenced path.
    return {};
  }
}

function assertFixtureEnvironmentGeneration(stat: BigIntStats, expected: BigIntStats, size: number, targetId: string): void {
  assertOwnedRegularFile(stat);
  if (!sameIdentity(stat, expected) || stat.size !== BigInt(size)
      || (process.platform !== "win32" && (stat.mode & BigInt(0o077)) !== BigInt(0))) {
    throw fixtureEnvironmentError(targetId);
  }
}

function referenceMatches(
  referencePath: string,
  expectedReference: string,
  generationPath: string,
  generation: BigIntStats,
  expectedGeneration: FixtureEnvironmentReference,
): boolean {
  try {
    const reference = openAndReadOwnedFile(referencePath, 512, false);
    try {
      if (reference.bytes.toString("ascii") !== expectedReference) return false;
    } finally {
      closeDescriptor(reference.descriptor, {}, basename(referencePath));
    }
    assertFixtureEnvironmentGeneration(lstatSync(generationPath, { bigint: true }), generation, expectedGeneration.size, basename(generationPath));
    const observed = openAndReadOwnedFile(generationPath, 65_536, true);
    try {
      if (!sameIdentity(observed.stat, generation)
          || observed.bytes.length !== expectedGeneration.size
          || createHash("sha256").update(observed.bytes).digest("hex") !== expectedGeneration.digest) return false;
    } finally {
      closeDescriptor(observed.descriptor, {}, basename(generationPath));
    }
    return true;
  } catch {
    return false;
  }
}

function cleanupFixtureEnvironmentGeneration(
  repositoryRoot: string,
  generationName: string,
  expected?: BigIntStats,
  expectedReference?: FixtureEnvironmentReference,
  expectedDirectory?: BigIntStats,
): void {
  const root = resolve(repositoryRoot);
  if (!fixtureEnvironmentGenerationName.test(generationName)) throw new FixtureSecretCleanupError("generation-unknown");
  const generationDirectory = join(root, FIXTURE_MUSIC_ENVIRONMENT_DIRECTORY_RELATIVE_PATH);
  const path = join(generationDirectory, generationName);
  if (!existsSync(path)) {
    if (expected || expectedReference || expectedDirectory) throw new FixtureSecretCleanupError(generationName);
    return;
  }
  assertNoLinkedAncestors(path);
  const directoryBefore = lstatSync(generationDirectory, { bigint: true });
  if (expectedDirectory && !sameIdentity(directoryBefore, expectedDirectory)) throw new FixtureSecretCleanupError(generationName);
  const before = lstatSync(path, { bigint: true });
  assertOwnedRegularFile(before);
  if (expected && !sameIdentity(before, expected)) throw new FixtureSecretCleanupError(generationName);
  if (before.size === BigInt(0)) return;
  const noFollow = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
  const descriptor = openSync(path, constants.O_RDWR | noFollow, 0o600);
  let failed = false;
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameIdentity(before, opened)
        || (expected && !sameIdentity(expected, opened))
        || !sameIdentity(directoryBefore, lstatSync(generationDirectory, { bigint: true }))) throw fixtureSecretError();
    if (expectedReference) {
      const bytes = readFileSync(descriptor);
      const afterRead = fstatSync(descriptor, { bigint: true });
      if (bytes.length !== expectedReference.size
          || createHash("sha256").update(bytes).digest("hex") !== expectedReference.digest
          || !sameIdentity(opened, afterRead)
          || afterRead.size !== BigInt(bytes.length)
          || !sameIdentity(opened, lstatSync(path, { bigint: true }))) {
        throw fixtureSecretError();
      }
    }
    eraseDescriptor(descriptor, {});
  } catch { failed = true; }
  try { closeSync(descriptor); } catch { failed = true; }
  if (failed) throw new FixtureSecretCleanupError(generationName);
}

export async function withAllFixtureMusicSecretsCleanup<T>(
  repositoryRoot: string,
  action: () => Promise<T>,
  dependencies: FixtureAggregateCleanupDependencies = {},
): Promise<T> {
  const root = resolve(repositoryRoot);
  const entryAuthority = authenticateAggregateCleanupAuthority(root);
  revalidateAggregateCleanupAuthority(root, entryAuthority);
  let result: T | undefined;
  let actionError: unknown;
  try {
    result = await action();
  } catch (error) {
    actionError = error;
  }
  try {
    cleanupAllFixtureMusicTokenSecrets(repositoryRoot, dependencies);
  } catch (error) {
    const cleanupError = error instanceof FixtureSecretCleanupError || error instanceof FixtureUnsupportedLegacyEnvironmentError
      ? error
      : fixtureAggregateCleanupError();
    if (actionError !== undefined) Object.defineProperty(cleanupError, "cause", { value: { name: "fixture-action-failed" }, enumerable: false });
    throw cleanupError;
  }
  if (actionError !== undefined) throw actionError;
  return result as T;
}

export async function withRetiredFixtureMusicAuthority<T>(
  repositoryRoot: string,
  action: () => Promise<T>,
  dependencies: FixtureAggregateCleanupDependencies = {},
): Promise<T> {
  const result = await withAllFixtureMusicSecretsCleanup(repositoryRoot, action, dependencies);
  attestRetiredFixtureMusicAuthority(repositoryRoot);
  return result;
}

function fixtureDirectories(repositoryRoot: string) {
  const root = resolve(repositoryRoot);
  const artifactDirectory = join(root, ".artifacts");
  const tokenDirectory = join(root, FIXTURE_MUSIC_TOKEN_SECRET_DIRECTORY_RELATIVE_PATH);
  const expectedPrefix = `${root}${process.platform === "win32" ? "\\" : "/"}`;
  if (!tokenDirectory.startsWith(expectedPrefix)) throw fixtureSecretError();
  return { root, artifactDirectory, tokenDirectory };
}

function assertExactTokenPath(root: string, tokenPath: string): void {
  const expectedDirectory = resolve(root, FIXTURE_MUSIC_TOKEN_SECRET_DIRECTORY_RELATIVE_PATH);
  const absolute = resolve(tokenPath);
  if (dirname(absolute) !== expectedDirectory || !fixtureTokenName.test(basename(absolute)) || relative(expectedDirectory, absolute).startsWith("..")) {
    throw fixtureSecretError();
  }
}

function ensureOwnedDirectory(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { mode: 0o700 });
  assertOwnedDirectory(path);
}

function assertOwnedDirectory(path: string): void {
  const stat = lstatSync(path, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink() || !ownedByCurrentUser(stat.uid)) throw fixtureSecretError();
}

function assertNoLinkedAncestors(path: string): void {
  const absolute = resolve(path);
  const filesystemRoot = parse(absolute).root;
  const paths: string[] = [];
  let current = dirname(absolute);
  while (true) {
    paths.push(current);
    if (current === filesystemRoot) break;
    const parent = dirname(current);
    if (parent === current) throw fixtureSecretError();
    current = parent;
  }
  for (const ancestor of paths.reverse()) {
    const stat = lstatSync(ancestor, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw fixtureSecretError();
  }
}

function assertOwnedRegularFile(stat: BigIntStats): void {
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== BigInt(1) || !ownedByCurrentUser(stat.uid)) throw fixtureSecretError();
}

function ownedByCurrentUser(uid: bigint): boolean {
  if (process.platform === "win32") return true;
  const effectiveUserId = process.geteuid?.();
  return effectiveUserId !== undefined && uid === BigInt(effectiveUserId);
}

function sameIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameResolvedPath(left: string, right: string): boolean {
  const normalize = (value: string) => resolve(value).replace(/^\\\\\?\\/, "");
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function eraseDescriptor(descriptor: number, dependencies: FixtureMusicTokenSecretDependencies): void {
  (dependencies.truncate ?? ftruncateSync)(descriptor, 0);
  (dependencies.sync ?? fsyncSync)(descriptor);
}

function eraseAndCloseDescriptor(
  descriptor: number,
  dependencies: FixtureMusicTokenSecretDependencies,
  targetId: string,
): never | void {
  let failed = false;
  try {
    eraseDescriptor(descriptor, dependencies);
  } catch {
    failed = true;
  }
  try {
    (dependencies.close ?? closeSync)(descriptor);
  } catch {
    failed = true;
  }
  if (failed) throw new FixtureSecretCleanupError(targetId);
}

function closeDescriptor(
  descriptor: number,
  dependencies: FixtureMusicTokenSecretDependencies,
  targetId: string,
): void {
  try {
    (dependencies.close ?? closeSync)(descriptor);
  } catch {
    throw new FixtureSecretCleanupError(targetId);
  }
}

function syncDirectory(path: string): void {
  if (process.platform === "win32") throw fixtureEnvironmentError("windows-directory-fsync-unsupported");
  const descriptor = openSync(path, constants.O_RDONLY);
  let failed = false;
  try {
    fsyncSync(descriptor);
  } catch {
    failed = true;
  }
  try {
    closeSync(descriptor);
  } catch {
    failed = true;
  }
  if (failed) throw fixtureEnvironmentError("environment-directory");
}

function fixtureSecretError(): Error {
  return new Error("Fixture signing key must be an exact owned regular artifact file");
}

function fixtureEnvironmentError(targetId: string): FixtureEnvironmentPersistenceError {
  return new FixtureEnvironmentPersistenceError(targetId);
}
