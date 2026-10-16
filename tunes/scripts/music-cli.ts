import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statfsSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, win32 as windowsPath } from "node:path";
import {
  DEFAULT_MUSIC_FIXTURE_STRAPI_HOST_PORT,
  normalizeMusicFixtureChildEnvironment,
  parseMusicEnvironment,
  parseMusicFixtureStrapiHostPort,
  resolveMusicFixtureStrapiUrl,
} from "../server/config/music-environment.ts";
import { MUSIC_COMPOSE_PROJECT, validateComposeModel, validateOwnedResources, type ComposeModel } from "./music-compose-safety.ts";
import { OwnedProcessRunner } from "./music-process-runner.ts";
import { EXPECTED_MUSIC_MIGRATION_ID } from "../shared/music-migration-contract.ts";
import {
  attestRetiredFixtureMusicAuthority,
  cleanupAllFixtureMusicTokenSecrets,
  FixtureSecretCleanupError,
  FixtureUnsupportedLegacyEnvironmentError,
  inspectFixtureEnvironmentAuthority,
  readFixtureMusicEnvironment,
  rotateFixtureMusicAuthority,
  withAllFixtureMusicSecretsCleanup,
} from "./music-fixture-secret.ts";
import {
  readSecureMusicSecretFile,
  readSecureMusicReconciliationAuthorities,
  type SecureMusicSecretAuthorityEvidence,
} from "../server/config/secure-music-secret-file.ts";
import {
  finalizeMusicQualificationReport,
  preferredQualificationPort,
  qualificationTelemetryIsBounded,
  qualificationReportMatchesAuthority,
  qualificationTaskEnvironment,
  qualificationTaskUsesFixtureEnvironment,
  qualificationTaskUsesStandalonePostgres,
  runMusicQualificationLane,
  type MusicQualificationExecutionResult,
  type MusicQualificationLaneName,
  type MusicQualificationLoadMeasurement,
  type MusicQualificationMeasurements,
  type MusicQualificationOperationalMeasurement,
  type MusicQualificationReport,
  type MusicQualificationTask,
  type MusicQualificationTaskEvidence,
  type QualificationOutcome,
} from "./music-qualification.ts";
import { parseFinalizedVitestEvidence, parseUatVitestEvidenceFromOutput, requireExactFileManifest } from "./music-vitest-evidence.ts";
import {
  attestC10StandalonePostgresAuthority,
  parseC10StandalonePostgresAuthority,
  startC10StandalonePostgres,
  stopC10StandalonePostgres,
  type OwnedC10StandalonePostgresAuthority,
} from "./music-qualification-postgres.ts";
import { requireNativeMusicReleaseLauncher } from "./music-release-channel.mjs";
import {
  isSensitiveMusicAuthorityKey,
  musicSensitiveEnvironmentValues,
  redactStructuredData,
  sanitizeMusicCliText,
} from "./music-output-redaction.ts";
export {
  isSensitiveMusicAuthorityKey,
  musicSensitiveEnvironmentValues,
  redactStructuredData,
  sanitizeMusicCliText,
} from "./music-output-redaction.ts";

export const MUSIC_CLI_SCHEMA_VERSION = "music-cli/v1";
export const FIXTURE_SCHEMA_VERSION = "strapi-identity-fixture/v1";
export const EXIT = { success: 0, verification: 1, usage: 2, prerequisite: 3, dependency: 4, safety: 5, interrupted: 130 } as const;
export const MUSIC_RECONCILIATION_AUTHORITY_FILES = [
  "fixtures/strapi/music-identity/identity.fixture.json",
  "package.json",
  "package-lock.json",
  "tunes/package.json",
  "tunes/package-lock.json",
  "tunes/scripts/music-cli.ts",
  "tunes/server/commands/reconcileMusicIdentities.ts",
  "tunes/server/config/music-environment.ts",
  "tunes/server/config/music-identity-config.ts",
  "tunes/server/config/music-reconciliation-config.ts",
  "tunes/server/repositories/reconciliationRepository.ts",
  "tunes/server/services/musicReconciler.ts",
] as const;

export interface StrapiIdentityFixture {
  schemaVersion: "strapi-identity-fixture/v1";
  fixtureVersion: string;
  identities: Array<{ user: { documentId?: string; username?: string; email?: string; provider?: "local" | "google"; confirmed?: boolean; blocked?: boolean; is_subscribed?: boolean; accounts: Array<{ documentId?: string; Account_Name?: string; Account_Type?: string; mobile_number?: string; localtunes_integrated?: "Yes" | "No" }> } }>;
  reconciliation?: { schemaVersion?: string; sourceSnapshot?: string; sourceChecksum?: string };
  pagination?: { page?: number; pageCount?: number; pageSize?: number; total?: number };
  serviceToken?: { operations: string[] };
}

export function validateStrapiFixture(fixture: StrapiIdentityFixture, options: { mode: "fixture" | "live"; readOnlyCredential?: string }): void {
  if (fixture.schemaVersion !== FIXTURE_SCHEMA_VERSION) throw new Error("unsupported fixture schema");
  if (!fixture.fixtureVersion) throw new Error("fixtureVersion is required");
  if (options.mode === "live" && !options.readOnlyCredential) throw new Error("LIVE_STRAPI_READ_ONLY_CREDENTIAL is required");
  fixture.identities.forEach((identity, index) => {
    if (!identity.user.documentId) throw new Error(`identity[${index}].user.documentId is required`);
    if (!identity.user.username) throw new Error(`identity[${index}].user.username is required`);
    if (!identity.user.email || !/^[^@\s]+@[^@\s]+$/.test(identity.user.email)) throw new Error(`identity[${index}].user.email is required`);
    if (identity.user.provider !== "local" && identity.user.provider !== "google") throw new Error(`identity[${index}].user.provider is invalid`);
    if (identity.user.confirmed !== true) throw new Error(`identity[${index}].user.confirmed must be true`);
    if (typeof identity.user.blocked !== "boolean") throw new Error(`identity[${index}].user.blocked must be boolean`);
    if (typeof identity.user.is_subscribed !== "boolean") throw new Error(`identity[${index}].user.is_subscribed must be boolean`);
    const completed = identity.user.accounts.filter((account) => account.Account_Name && account.Account_Type && account.mobile_number);
    if (completed.length !== 1) throw new Error(`identity[${index}] has ${completed.length === 0 ? "no" : "ambiguous"} completed Accounts`);
    if (!completed[0].documentId) throw new Error(`identity[${index}].accounts completed Account documentId is required`);
    if (completed[0].localtunes_integrated !== "Yes" && completed[0].localtunes_integrated !== "No") throw new Error(`identity[${index}].accounts completed Account localtunes_integrated must be Yes or No`);
  });
  if (!fixture.pagination) throw new Error("pagination metadata is required");
  if (!Number.isInteger(fixture.pagination.page) || !Number.isInteger(fixture.pagination.pageCount) || !Number.isInteger(fixture.pagination.pageSize) || !Number.isInteger(fixture.pagination.total)) throw new Error("pagination metadata is truncated");
  const expectedPageCount = Math.max(1, Math.ceil(fixture.identities.length / fixture.pagination.pageSize!));
  if (fixture.pagination.page !== 1 || fixture.pagination.pageCount !== expectedPageCount
      || fixture.pagination.pageSize! < 1 || fixture.pagination.total !== fixture.identities.length) throw new Error("pagination metadata is inconsistent");
  const persistedAbsenceRead = "POST /graphql query:MusicIdentityAbsence";
  if (fixture.serviceToken?.operations.some((operation) => !operation.startsWith("GET ")
      && !operation.startsWith("HEAD ") && operation !== persistedAbsenceRead)) throw new Error("service token operation must be read-only");
  if (!fixture.serviceToken || JSON.stringify([...fixture.serviceToken.operations].sort()) !== JSON.stringify([
    "GET /api/accounts",
    "GET /api/music-identities",
    "GET /api/users/me",
    persistedAbsenceRead,
  ])) throw new Error("service token operations must match the exact fixture allowlist");
  if (!fixture.reconciliation) throw new Error("reconciliation fixture metadata is required");
  if (fixture.reconciliation.schemaVersion !== "strapi-music-reconciliation/v1"
      || !fixture.reconciliation.sourceSnapshot
      || !/^[a-f0-9]{64}$/.test(fixture.reconciliation.sourceChecksum ?? "")) {
    throw new Error("reconciliation fixture metadata is invalid");
  }
  const canonical = fixture.identities.map(({ user }) => {
    const account = user.accounts.find((value) => value.Account_Name && value.Account_Type && value.mobile_number)!;
    return {
      userDocumentId: user.documentId,
      accountDocumentId: account.documentId,
      username: user.username,
      email: user.email,
      provider: user.provider,
      accountName: account.Account_Name,
      accountType: account.Account_Type,
      accountMobile: account.mobile_number,
    };
  }).sort((left, right) => left.userDocumentId!.localeCompare(right.userDocumentId!));
  const checksum = createHash("sha256").update(canonical.map((identity) => JSON.stringify(identity)).join("\n")).digest("hex");
  if (checksum !== fixture.reconciliation.sourceChecksum) throw new Error("reconciliation fixture checksum is inconsistent");
}

type OutputFormat = "human" | "json";
type Mode = "fixture" | "live";
export interface ParsedArgs { command: string; mode: Mode; format: OutputFormat; detach: boolean; wait: boolean; volumes: boolean; confirmProject?: string; confirmReset?: string; target?: string; resume?: string; checkpoint?: string; reconciliationMode: "dry-run" | "apply"; approvalToken?: string; }
interface RunResult { status: "success" | "failure" | "blocked" | "not-run"; phase: string; exitCode: number; artifacts?: string[]; checkpoint?: string; error?: string; details?: unknown; summary?: string; suppressEvidence?: boolean; }
export interface RunContext { commit: string; fixtureVersion: string; fixtureSchemaVersion: string; gateValues: Record<string, string>; environmentFingerprint: string; }

const root = resolve(import.meta.dirname, "../..");
const artifactRoot = join(root, ".artifacts", "music-runs");
const composeFile = "docker-compose.music-test.yml";
const composeArguments = ["compose", "-p", MUSIC_COMPOSE_PROJECT, "-f", composeFile];
const retainedFixtureVolumes = ["music-fixture-postgres", "music-fixture-gates"] as const;
const requiredFiles = [composeFile, ".env.music.example", ".env.music.test.example", "fixtures/strapi/music-identity/identity.fixture.json", "fixtures/db/music-runtime-table-manifest.json"];
const runner = new OwnedProcessRunner();
const qualificationRunners = new Set<OwnedProcessRunner>();
const qualificationPorts = new Set<number>();
let activeRun: { id: string; command: string; format: OutputFormat; started: number; context: RunContext; reconciliationCheckpoint?: string } | undefined;
let childSequence = 0;
let activeFixtureEnvironment: Record<string, string> = {};
let activeStandalonePostgresEnvironment: Record<string, string> = {};

export interface RetainedFixtureVolumeInspection {
  Name?: string;
  CreatedAt?: string;
  Mountpoint?: string;
  Labels?: Record<string, string>;
}

export interface VolumeOnlyFixtureResetDependencies {
  listContainerIds: () => Promise<readonly string[]>;
  listLabeledVolumeNames: () => Promise<readonly string[]>;
  inspectVolume: (name: string) => Promise<readonly RetainedFixtureVolumeInspection[]>;
  removeVolumes: (names: readonly string[]) => Promise<string>;
}

export interface VolumeOnlyFixtureDockerCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  artifact?: string;
}

interface VolumeOnlyFixtureResetSnapshot {
  volumes: Array<{
    logicalName: typeof retainedFixtureVolumes[number];
    name: string;
    fingerprint: string;
  }>;
}

export function validateRetainedFixtureVolume(
  inspection: RetainedFixtureVolumeInspection,
  logicalName: typeof retainedFixtureVolumes[number],
): void {
  const expectedName = `${MUSIC_COMPOSE_PROJECT}_${logicalName}`;
  const labels = inspection.Labels ?? {};
  if (inspection.Name !== expectedName
      || !inspection.CreatedAt
      || !inspection.Mountpoint
      || labels["com.explorers.music.fixture"] !== "true"
      || labels["com.explorers.music.project"] !== MUSIC_COMPOSE_PROJECT
      || labels["com.docker.compose.project"] !== MUSIC_COMPOSE_PROJECT
      || labels["com.docker.compose.volume"] !== logicalName) {
    throw new SafetyError(`retained fixture volume ${expectedName} failed ownership validation`, "cleanup-safety");
  }
}

function retainedFixtureVolumeName(logicalName: typeof retainedFixtureVolumes[number]): string {
  return `${MUSIC_COMPOSE_PROJECT}_${logicalName}`;
}

function retainedFixtureVolumeFingerprint(inspection: RetainedFixtureVolumeInspection): string {
  return JSON.stringify({
    Name: inspection.Name,
    CreatedAt: inspection.CreatedAt,
    Mountpoint: inspection.Mountpoint,
    Labels: Object.fromEntries(Object.entries(inspection.Labels ?? {}).sort(([left], [right]) => left.localeCompare(right))),
  });
}

function sameVolumeOnlyFixtureResetSnapshot(
  left: VolumeOnlyFixtureResetSnapshot,
  right: VolumeOnlyFixtureResetSnapshot,
): boolean {
  return left.volumes.length === right.volumes.length
    && left.volumes.every((volume, index) => {
      const other = right.volumes[index];
      return other?.logicalName === volume.logicalName
        && other.name === volume.name
        && other.fingerprint === volume.fingerprint;
    });
}

async function captureVolumeOnlyFixtureResetSnapshot(
  dependencies: VolumeOnlyFixtureResetDependencies,
): Promise<VolumeOnlyFixtureResetSnapshot> {
  const containers = Array.from(await dependencies.listContainerIds());
  if (containers.some((value) => typeof value !== "string" || !value.trim())) {
    throw new SafetyError("volume-only fixture container inventory is malformed", "cleanup-safety");
  }
  if (containers.length) throw new SafetyError("volume-only fixture reset requires zero owned fixture containers", "cleanup-safety");

  const names = Array.from(await dependencies.listLabeledVolumeNames());
  if (names.some((value) => typeof value !== "string" || !value.trim()) || new Set(names).size !== names.length) {
    throw new SafetyError("labeled fixture volume inventory is malformed or ambiguous", "cleanup-safety");
  }
  const allowedNames = new Set(retainedFixtureVolumes.map(retainedFixtureVolumeName));
  if (names.some((name) => !allowedNames.has(name))) {
    throw new SafetyError("labeled fixture volume inventory contains an unallowlisted target", "cleanup-safety");
  }
  if (!names.includes(retainedFixtureVolumeName("music-fixture-postgres"))) {
    throw new SafetyError("no retained fixture database volume was found; reset refused", "cleanup-safety");
  }

  const listedNames = new Set(names);
  const volumes: VolumeOnlyFixtureResetSnapshot["volumes"] = [];
  for (const logicalName of retainedFixtureVolumes) {
    const expectedName = retainedFixtureVolumeName(logicalName);
    const inspections = Array.from(await dependencies.inspectVolume(expectedName));
    if (inspections.length > 1) {
      throw new SafetyError(`retained fixture volume ${expectedName} inspection was ambiguous`, "cleanup-safety");
    }
    if (!listedNames.has(expectedName)) {
      if (inspections.length) {
        validateRetainedFixtureVolume(inspections[0]!, logicalName);
        throw new SafetyError(`retained fixture volume ${expectedName} escaped the exact labeled inventory`, "cleanup-safety");
      }
      continue;
    }
    if (inspections.length !== 1) {
      throw new SafetyError(`retained fixture volume ${expectedName} changed during authorization`, "cleanup-safety");
    }
    validateRetainedFixtureVolume(inspections[0]!, logicalName);
    volumes.push({
      logicalName,
      name: expectedName,
      fingerprint: retainedFixtureVolumeFingerprint(inspections[0]!),
    });
  }
  if (volumes.length !== names.length) {
    throw new SafetyError("labeled fixture volume inventory is incomplete or ambiguous", "cleanup-safety");
  }
  return { volumes };
}

async function proveVolumeOnlyFixtureResetAbsent(
  dependencies: VolumeOnlyFixtureResetDependencies,
): Promise<void> {
  const containers = Array.from(await dependencies.listContainerIds());
  const names = Array.from(await dependencies.listLabeledVolumeNames());
  const inspections = await Promise.all(retainedFixtureVolumes.map(async (logicalName) =>
    Array.from(await dependencies.inspectVolume(retainedFixtureVolumeName(logicalName)))));
  if (containers.length || names.length || inspections.some((entries) => entries.length)) {
    throw new SafetyError("volume-only fixture reset absence proof failed; owned resources remain", "cleanup-safety");
  }
}

export async function resetVolumeOnlyFixtureVolumes(
  repositoryRoot: string,
  dependencies: VolumeOnlyFixtureResetDependencies,
): Promise<{
  removalArtifact: string;
  attestation: ReturnType<typeof attestRetiredFixtureMusicAuthority>;
}> {
  const first = await captureVolumeOnlyFixtureResetSnapshot(dependencies);
  const authorized = await captureVolumeOnlyFixtureResetSnapshot(dependencies);
  if (!sameVolumeOnlyFixtureResetSnapshot(first, authorized)) {
    throw new SafetyError("retained fixture volume authority changed during preauthorization", "cleanup-safety");
  }

  cleanupAllFixtureMusicTokenSecrets(repositoryRoot);
  attestRetiredFixtureMusicAuthority(repositoryRoot);

  const contained = await captureVolumeOnlyFixtureResetSnapshot(dependencies);
  if (!sameVolumeOnlyFixtureResetSnapshot(authorized, contained)) {
    throw new SafetyError("retained fixture volume authority changed after authority containment", "cleanup-safety");
  }

  const removalArtifact = await dependencies.removeVolumes(contained.volumes.map(({ name }) => name));
  await proveVolumeOnlyFixtureResetAbsent(dependencies);
  const attestation = attestRetiredFixtureMusicAuthority(repositoryRoot);
  return { removalArtifact, attestation };
}
const C10_STANDALONE_POSTGRES_ENVIRONMENT_KEYS = [
  "MUSIC_C10_STANDALONE_POSTGRES_ACK",
  "MUSIC_C10_STANDALONE_POSTGRES_PORT",
  "MUSIC_C10_STANDALONE_POSTGRES_CONTAINER_ID",
  "MUSIC_C10_STANDALONE_POSTGRES_COMMIT",
] as const;
const C10_STANDALONE_POSTGRES_ENVIRONMENT_KEY_SET = new Set<string>(
  C10_STANDALONE_POSTGRES_ENVIRONMENT_KEYS,
);

const DEFAULT_TEST_CHILD_KEYS = new Set([
  "PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR",
  "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "LANG", "LC_ALL", "TZ", "CI",
  "NPM_EXECPATH", "NPM_NODE_EXECPATH", "NPM_CONFIG_CACHE",
]);
export function defaultMusicTestChildEnvironment(ambient: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const child: NodeJS.ProcessEnv = {}, seen = new Set<string>();
  for (const [key, value] of Object.entries(ambient)) {
    const normalized = key.toUpperCase();
    if (!DEFAULT_TEST_CHILD_KEYS.has(normalized) || value === undefined) continue;
    if (seen.has(normalized)) throw new Error("duplicate case-insensitive child environment key");
    seen.add(normalized); child[key] = value;
  }
  return child;
}

export function buildQualificationChildEnvironment(input: {
  authority: "default" | "real-tool" | "c10-postgres" | "uat-postgres";
  ambient: NodeJS.ProcessEnv;
  ownedDatabase?: Record<string, string>;
}): NodeJS.ProcessEnv {
  const child = defaultMusicTestChildEnvironment(input.ambient);
  const emptyConfiguration = process.platform === "win32" ? "NUL" : "/dev/null";
  child.NPM_CONFIG_USERCONFIG = emptyConfiguration;
  child.NPM_CONFIG_GLOBALCONFIG = emptyConfiguration;
  if (input.authority === "c10-postgres") {
    if (!input.ownedDatabase) throw new Error("owned C10 database environment required");
    Object.assign(child, input.ownedDatabase);
  } else if (input.ownedDatabase) {
    throw new Error("foreign database authority");
  }
  return child;
}

export function qualificationChildAmbientEnvironment(
  taskId: string,
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const childEnvironment = { ...environment };
  if (!qualificationTaskUsesStandalonePostgres(taskId)) {
    for (const key of Object.keys(childEnvironment)) {
      if (C10_STANDALONE_POSTGRES_ENVIRONMENT_KEY_SET.has(key.toUpperCase())) delete childEnvironment[key];
    }
  }
  return childEnvironment;
}

export async function withQualificationPostgresAuthority<T, A>(input: {
  existing: A | undefined;
  acquire: () => Promise<A>;
  release: (authority: A) => Promise<void>;
  run: (authority: A) => Promise<T>;
}): Promise<T> {
  if (input.existing) return await input.run(input.existing);
  const authority = await input.acquire();
  try { return await input.run(authority); }
  finally { await input.release(authority); }
}
let qualificationInterruptProbeScheduled = false;
let qualificationInterruptionRequested = false;

class MusicCommandError extends Error {
  readonly phase: string;
  readonly exitCode: number;

  constructor(message: string, phase: string, exitCode: number) {
    super(message);
    this.phase = phase;
    this.exitCode = exitCode;
  }
}
class ResumeMismatchError extends MusicCommandError { constructor(message: string) { super(message, "resume", EXIT.prerequisite); } }
class SafetyError extends MusicCommandError { constructor(message: string, phase = "cleanup-safety") { super(message, phase, EXIT.safety); } }

export function parseMusicCliArguments(args: string[]): ParsedArgs {
  const parsed: Partial<ParsedArgs> = { mode: "fixture", format: "human", detach: false, wait: false, volumes: false, reconciliationMode: "dry-run" };
  let explicitDryRun = false;
  let explicitApply = false;
  const value = (index: number, flag: string): string => {
    const candidate = args[index + 1];
    if (!candidate || candidate.startsWith("--")) throw new MusicCommandError(`${flag} requires a value`, "arguments", EXIT.usage);
    return candidate;
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--") && !parsed.command) parsed.command = argument;
    else if (argument === "--mode") parsed.mode = value(index++, argument) as Mode;
    else if (argument === "--format") parsed.format = value(index++, argument) as OutputFormat;
    else if (argument === "--detach") parsed.detach = true;
    else if (argument === "--wait") parsed.wait = true;
    else if (argument === "--volumes") parsed.volumes = true;
    else if (argument === "--confirm-project") parsed.confirmProject = value(index++, argument);
    else if (argument === "--confirm-reset") parsed.confirmReset = value(index++, argument);
    else if (argument === "--target") parsed.target = value(index++, argument);
    else if (argument === "--resume") parsed.resume = value(index++, argument);
    else if (argument === "--checkpoint") parsed.checkpoint = value(index++, argument);
    else if (argument === "--approval-token") parsed.approvalToken = value(index++, argument);
    else if (argument === "--dry-run") { explicitDryRun = true; parsed.reconciliationMode = "dry-run"; }
    else if (argument === "--apply") { explicitApply = true; parsed.reconciliationMode = "apply"; }
    else throw new MusicCommandError(`unknown argument: ${argument}`, "arguments", EXIT.usage);
  }
  if (!parsed.command || !["bootstrap", "doctor", "up", "test:smoke", "test:all", "test:fast", "test:pr", "test:nightly", "test:release", "down", "db:status", "db:migrate", "db:verify", "db:reset", "fixtures:capture", "reconcile"].includes(parsed.command)) throw new MusicCommandError("usage: music:<bootstrap|doctor|up|test:smoke|test:all|test:fast|test:pr|test:nightly|test:release|down|db:status|db:migrate|db:verify|db:reset|fixtures:capture|reconcile>", "arguments", EXIT.usage);
  if (!(["fixture", "live"] as string[]).includes(parsed.mode!)) throw new MusicCommandError("--mode must be fixture or live", "arguments", EXIT.usage);
  if (!(["human", "json"] as string[]).includes(parsed.format!)) throw new MusicCommandError("--format must be human or json", "arguments", EXIT.usage);
  const reconciliationFlags = explicitDryRun || explicitApply || parsed.checkpoint !== undefined || parsed.approvalToken !== undefined;
  if (parsed.command !== "reconcile" && reconciliationFlags) throw new MusicCommandError("reconciliation flags require the reconcile command", "arguments", EXIT.usage);
  if (parsed.command === "reconcile") {
    if (explicitDryRun && explicitApply) throw new MusicCommandError("--dry-run and --apply are mutually exclusive", "arguments", EXIT.usage);
    if (parsed.reconciliationMode === "apply") {
      if (!parsed.resume) throw new MusicCommandError("--apply requires --resume with a reviewed checkpoint", "arguments", EXIT.usage);
      if (!parsed.approvalToken || !/^[a-f0-9]{64}$/.test(parsed.approvalToken)) throw new MusicCommandError("--apply requires an exact 64-character approval token", "arguments", EXIT.usage);
    } else if (parsed.approvalToken) throw new MusicCommandError("--approval-token is valid only with --apply", "arguments", EXIT.usage);
  }
  return parsed as ParsedArgs;
}

const parseArgs = parseMusicCliArguments;

const sanitize = sanitizeMusicCliText;
function sanitizeStructuredOutput(value: string, exactSensitiveValues: readonly string[] = []): string {
  try { return sanitizeMusicCliText(JSON.stringify(redactStructuredData(JSON.parse(value), exactSensitiveValues)), exactSensitiveValues); }
  catch { return sanitizeMusicCliText(value, exactSensitiveValues); }
}
export function sanitizeMusicChildArtifactOutput(
  command: "npm" | "docker" | "node",
  phase: string,
  value: string,
  exactSensitiveValues: readonly string[] = [],
): string {
  if (command === "docker" && [
    "compose-config", "inspect-containers", "inspect-networks", "inspect-volumes", "docker-daemon",
  ].includes(phase)) return `[DOCKER_STRUCTURED_OUTPUT_REDACTED bytes=${Buffer.byteLength(value, "utf8")}]`;
  return sanitizeStructuredOutput(value, exactSensitiveValues);
}
function redactedError(value: unknown): string { return sanitize(value instanceof Error ? value.message : String(value)); }
function runId(): string { return `${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${randomBytes(4).toString("hex")}`; }
function runDirectory(id: string): string {
  const directory = join(artifactRoot, id);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") chmodSync(directory, 0o700);
  return directory;
}
function currentSensitiveValues(): string[] {
  return musicSensitiveEnvironmentValues(activeFixtureEnvironment);
}
function writeArtifact(id: string, name: string, content: string): string {
  const target = join(runDirectory(id), name);
  writeFileSync(target, sanitizeStructuredOutput(content, currentSensitiveValues()));
  return target;
}
function portableQualificationArtifact(path: string): string {
  const target = isAbsolute(path) ? path : resolve(root, path);
  const relationship = relative(root, target);
  if (!relationship || relationship.startsWith("..") || isAbsolute(relationship)) return "[OUTSIDE_REPOSITORY]";
  return relationship.replace(/\\/g, "/");
}

export function sanitizeMusicCheckpointData(value: unknown, exactSensitiveValues: readonly string[] = []): unknown {
  const portablePaths = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(portablePaths);
    if (!entry || typeof entry !== "object") return entry;
    return Object.fromEntries(Object.entries(entry).map(([key, nested]) => {
      if (key === "artifacts" && Array.isArray(nested)) {
        return [key, nested.map((path) => typeof path === "string" ? portableQualificationArtifact(path) : portablePaths(path))];
      }
      if (key === "checkpoint" && typeof nested === "string") return [key, portableQualificationArtifact(nested)];
      return [key, portablePaths(nested)];
    }));
  };
  return redactStructuredData(portablePaths(value), exactSensitiveValues);
}

function readEnvFile(file: string): Record<string, string> {
  return parseEnvironmentContents(readFileSync(file, "utf8"), file);
}
function parseEnvironmentContents(contents: string, source: string): Record<string, string> {
  return Object.fromEntries(contents.split(/\r?\n/).filter((line) => line.trim() && !line.trimStart().startsWith("#")).map((line) => { const separator = line.indexOf("="); if (separator < 1) throw new Error(`invalid environment line in ${source}`); return [line.slice(0, separator), line.slice(separator + 1)]; }));
}
function readActiveFixtureEnvironment(): Record<string, string> {
  return parseEnvironmentContents(readFixtureMusicEnvironment(root), "guarded fixture environment generation");
}

function gitDirectory(repositoryRoot: string): string {
  const dotGit = join(repositoryRoot, ".git");
  if (statSync(dotGit).isDirectory()) return dotGit;
  const contents = readFileSync(dotGit, "utf8").trim();
  if (!contents.startsWith("gitdir:")) return dotGit;
  const path = contents.slice("gitdir:".length).trim();
  return isAbsolute(path) ? path : resolve(repositoryRoot, path);
}
export function readGitSha(repositoryRoot = root): string {
  const gitDir = gitDirectory(repositoryRoot);
  const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
  if (!head.startsWith("ref:")) return head;
  const reference = head.slice("ref:".length).trim();
  let commonDir = gitDir;
  const commonDirFile = join(gitDir, "commondir");
  if (existsSync(commonDirFile)) commonDir = resolve(gitDir, readFileSync(commonDirFile, "utf8").trim());
  const loose = join(commonDir, reference);
  if (existsSync(loose)) return readFileSync(loose, "utf8").trim();
  const packed = readFileSync(join(commonDir, "packed-refs"), "utf8").split(/\r?\n/).find((line) => line.endsWith(` ${reference}`));
  if (!packed) throw new Error(`cannot resolve Git reference ${reference}`);
  return packed.split(" ")[0];
}

export function assertQualificationSourceClean(repositoryRoot = root): void {
  const dirty = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  if (dirty) {
    throw new SafetyError("release qualification requires an exact clean source checkout", "qualification-source-authority");
  }
}

export function createEnvironmentFingerprint(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function assertLiveMusicReconciliationWorktreeClean(status?: string): void {
  const worktreeStatus = status ?? execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: root, encoding: "utf8", windowsHide: true },
  );
  if (worktreeStatus.trim()) {
    throw new SafetyError("Live reconciliation requires a clean tracked worktree.", "reconciliation-code-authority");
  }
}

export function createLiveMusicReconciliationRunContext(input: {
  base: RunContext;
  environment: Record<string, string | undefined>;
  sourceUrl: string;
  databaseUrl: string;
  serviceToken: string;
  credentialAuthorities: {
    reconciliation: SecureMusicSecretAuthorityEvidence;
    lifecycleProof: SecureMusicSecretAuthorityEvidence;
    access: SecureMusicSecretAuthorityEvidence;
  };
}): RunContext {
  const database = new URL(input.databaseUrl);
  const gateNames = [
    "MUSIC_RECONCILIATION_ENVIRONMENT",
    "MUSIC_RECONCILIATION_APPLY_ENABLED",
    "MUSIC_RECONCILIATION_LIVE_CONTRACT_VERIFIED",
    "MUSIC_RECONCILIATION_ENABLED",
    "MUSIC_RECONCILIATION_MAX_ROWS",
  ] as const;
  const gateValues = Object.fromEntries(gateNames.map((name) => [name, input.environment[name] ?? "unset"]));
  const serviceTokenAuthority = createEnvironmentFingerprint({
    file: input.environment.STRAPI_RECONCILIATION_TOKEN_FILE ?? "unset",
    lifecycleProofFile: input.environment.STRAPI_LIFECYCLE_PROOF_TOKEN_FILE ?? "unset",
    accessTokenFile: input.environment.STRAPI_ACCESS_TOKEN_FILE ?? "unset",
    content: createHash("sha256").update(input.serviceToken).digest("hex"),
    credentialAuthorities: input.credentialAuthorities,
  });
  const databaseAuthority = createEnvironmentFingerprint({
    file: input.environment.MUSIC_DATABASE_PASSWORD_FILE ?? "unset",
    credential: createHash("sha256").update(database.password).digest("hex"),
  });
  const environmentFingerprint = createEnvironmentFingerprint({
    codeAuthority: input.base.environmentFingerprint,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    sourceUrl: new URL(input.sourceUrl).origin,
    database: {
      protocol: database.protocol,
      hostname: database.hostname,
      port: database.port,
      pathname: database.pathname,
      username: database.username,
    },
    serviceTokenAuthority,
    databaseAuthority,
    gateValues,
  });
  return { ...input.base, gateValues, environmentFingerprint };
}

function fileHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function buildRunContext(options: { allowInvalidEnvironment?: boolean; useExampleForRetiredEnvironment?: boolean } = {}): RunContext {
  const commit = readGitSha();
  const fixture = JSON.parse(readFileSync(join(root, "fixtures/strapi/music-identity/identity.fixture.json"), "utf8")) as StrapiIdentityFixture;
  let rawEnvironment: Record<string, string> = {};
  let environmentContents = "";
  try {
    const authorityState = inspectFixtureEnvironmentAuthority(root);
    environmentContents = authorityState === "missing"
      || (authorityState === "tombstone" && options.useExampleForRetiredEnvironment)
      ? readFileSync(join(root, ".env.music.test.example"), "utf8")
      : readFixtureMusicEnvironment(root);
    rawEnvironment = parseEnvironmentContents(environmentContents, "guarded fixture environment generation");
  }
  catch (error) { if (!options.allowInvalidEnvironment) throw error; }
  let environment: ReturnType<typeof parseMusicEnvironment> | undefined;
  try { environment = parseMusicEnvironment(rawEnvironment); }
  catch (error) { if (!options.allowInvalidEnvironment) throw error; }
  activeFixtureEnvironment = environment ? normalizeMusicFixtureChildEnvironment(rawEnvironment) : rawEnvironment;
  const gateValues = {
    MUSIC_PROVISIONING_KILL_SWITCH: String(environment?.MUSIC_PROVISIONING_KILL_SWITCH ?? rawEnvironment.MUSIC_PROVISIONING_KILL_SWITCH ?? "invalid"),
    MUSIC_PROVISIONING_COHORT: environment?.MUSIC_PROVISIONING_COHORT ?? rawEnvironment.MUSIC_PROVISIONING_COHORT ?? "invalid",
    MUSIC_RECONCILIATION_ENABLED: String(environment?.MUSIC_RECONCILIATION_ENABLED ?? rawEnvironment.MUSIC_RECONCILIATION_ENABLED ?? "invalid"),
    MUSIC_RECONCILIATION_MAX_ROWS: String(environment?.MUSIC_RECONCILIATION_MAX_ROWS ?? rawEnvironment.MUSIC_RECONCILIATION_MAX_ROWS ?? "invalid"),
    MUSIC_EXPECTED_MIGRATION_ID: environment?.MUSIC_EXPECTED_MIGRATION_ID ?? rawEnvironment.MUSIC_EXPECTED_MIGRATION_ID ?? "invalid",
  };
  let databaseTarget = "missing";
  const standalonePostgres = attestC10StandalonePostgresAuthority(process.env, commit);
  try {
    const database = new URL(rawEnvironment.DATABASE_URL_TEST);
    if (standalonePostgres) database.port = String(standalonePostgres.port);
    databaseTarget = `${database.protocol}//${database.hostname}:${database.port}${database.pathname}`;
  } catch { databaseTarget = "invalid"; }
  const configurationHashes = Object.fromEntries([
    composeFile,
    "fixtures/strapi/music-identity/identity.fixture.json",
    ".env.music.example",
    ".env.music.test.example",
    "package.json",
    "tunes/package.json",
  ].map((file) => [file, fileHash(join(root, file))]));
  configurationHashes["active-environment"] = createHash("sha256").update(environmentContents).digest("hex");
  if (standalonePostgres) {
    configurationHashes["standalone-postgres-image"] = standalonePostgres.imageId;
    configurationHashes["standalone-postgres-container"] = createHash("sha256").update(standalonePostgres.containerId).digest("hex");
  }
  const environmentFingerprint = createEnvironmentFingerprint({
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    composeProject: MUSIC_COMPOSE_PROJECT,
    databaseTarget,
    mode: environment?.MUSIC_MODE ?? "invalid",
    fixtureUrl: environment?.STRAPI_FIXTURE_URL ?? "invalid",
    fixtureVersion: fixture.fixtureVersion,
    fixtureSchemaVersion: fixture.schemaVersion,
    signingKeyIds: [environment?.MUSIC_SIGNING_KEY_CURRENT_ID ?? "invalid", environment?.MUSIC_SIGNING_KEY_PREVIOUS_ID ?? "invalid"],
    controls: [environment?.MUSIC_CONNECT_TIMEOUT_MS ?? "invalid", environment?.MUSIC_READ_TIMEOUT_MS ?? "invalid", environment?.MUSIC_CIRCUIT_FAILURE_THRESHOLD ?? "invalid", environment?.MUSIC_RATE_LIMIT_PER_MINUTE ?? "invalid"],
    gateValues,
    configurationHashes,
  });
  return { commit, fixtureVersion: fixture.fixtureVersion, fixtureSchemaVersion: fixture.schemaVersion, gateValues, environmentFingerprint };
}

export function createTrackedMusicReconciliationAuthorityFingerprint(repositoryRoot = root): string {
  return createEnvironmentFingerprint(Object.fromEntries(
    MUSIC_RECONCILIATION_AUTHORITY_FILES.map((file) => [file, fileHash(join(repositoryRoot, file))]),
  ));
}

function buildTrackedReconciliationContext(): RunContext {
  const fixture = JSON.parse(readFileSync(join(root, "fixtures/strapi/music-identity/identity.fixture.json"), "utf8")) as StrapiIdentityFixture;
  return {
    commit: readGitSha(),
    fixtureVersion: fixture.fixtureVersion,
    fixtureSchemaVersion: fixture.schemaVersion,
    gateValues: {},
    environmentFingerprint: createTrackedMusicReconciliationAuthorityFingerprint(),
  };
}

function writeCheckpoint(id: string, context: RunContext, result: RunResult): string {
  const target = join(runDirectory(id), "checkpoint.json");
  const temporary = `${target}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(sanitizeMusicCheckpointData(
    { schemaVersion: MUSIC_CLI_SCHEMA_VERSION, ...context, ...result },
    currentSensitiveValues(),
  ), null, 2));
  renameSync(temporary, target);
  return target;
}
function assertResume(path: string, context: RunContext): void {
  const checkpoint = JSON.parse(readFileSync(path, "utf8")) as Partial<RunContext>;
  for (const key of ["commit", "fixtureVersion", "fixtureSchemaVersion", "environmentFingerprint"] as const) if (checkpoint[key] !== context[key]) throw new ResumeMismatchError(`resume checkpoint ${key} does not match`);
  if (JSON.stringify(checkpoint.gateValues) !== JSON.stringify(context.gateValues)) throw new ResumeMismatchError("resume checkpoint gateValues do not match");
}

export function resolveMusicReconciliationCheckpointPath(path: string | undefined, id: string): string {
  const target = path ? resolve(root, path) : join(runDirectory(id), "reconciliation-checkpoint.json");
  const relationship = relative(artifactRoot, target);
  if (!relationship || relationship.startsWith("..") || isAbsolute(relationship) || !target.endsWith(".json")) {
    throw new SafetyError("reconciliation checkpoints must be JSON files under .artifacts/music-runs", "reconciliation-checkpoint");
  }
  return target;
}

const commandGuidance: Record<string, { success: string; failure: string; recovery: string }> = {
  bootstrap: { success: "npm run music:doctor", failure: "npm run music:bootstrap", recovery: "npm run music:down" },
  doctor: { success: "npm run music:up -- --detach --wait", failure: "npm run music:doctor", recovery: "npm run music:down" },
  up: { success: "npm run music:test:smoke", failure: "npm run music:doctor", recovery: "npm run music:down" },
  "test:smoke": { success: "npm run music:down", failure: "npm run music:test:smoke", recovery: "npm run music:down" },
  "test:all": { success: "npm run music:down", failure: "npm run music:test:all", recovery: "npm run music:down" },
  "test:fast": { success: "npm run music:test:pr", failure: "npm run music:test:fast", recovery: "inspect the sanitized qualification report" },
  "test:pr": { success: "npm run music:test:nightly", failure: "npm run music:test:pr", recovery: "inspect the sanitized qualification report" },
  "test:nightly": { success: "review the nightly qualification evidence", failure: "npm run music:test:nightly", recovery: "inspect the sanitized qualification report" },
  "test:release": { success: "review the release evidence; no deployment was performed", failure: "use the native Music release launcher for this platform", recovery: "inspect the sanitized qualification report" },
  down: { success: "npm run music:doctor", failure: "npm run music:doctor", recovery: "inspect the checkpoint; no cleanup was attempted" },
  "db:status": { success: "review the runtime manifest", failure: "npm run music:doctor", recovery: "npm run music:down" },
  "db:migrate": { success: "npm run music:db:status", failure: "implement reviewed C3 migrations", recovery: "npm run music:db:status" },
  "db:verify": { success: "review the verified journal", failure: "npm run music:db:status -- --target test", recovery: "npm run music:db:status -- --target test" },
  "db:reset": { success: "npm run music:up -- --detach --wait", failure: "npm run music:doctor", recovery: "npm run music:down" },
  "fixtures:capture": { success: "request TK identity-owner review", failure: "supply explicit read-only credentials or use fixture mode", recovery: "npm run music:fixtures:capture -- --mode fixture" },
  reconcile: { success: "review the reconciliation checkpoint; keep the first production run report-only", failure: "inspect the redacted reconciliation report", recovery: "rerun npm run music:reconcile -- --dry-run" },
  music: { success: "npm run music:doctor", failure: "review command usage", recovery: "npm run music:down" },
};

function emit(id: string, command: string, format: OutputFormat, started: number, context: RunContext, result: RunResult): number {
  const guidance = commandGuidance[command] ?? commandGuidance.music;
  const suppressEvidence = result.suppressEvidence === true;
  const checkpoint = suppressEvidence ? undefined : result.checkpoint ?? writeCheckpoint(id, context, result);
  const nextCommand = suppressEvidence
    ? "preserve source changes according to operator policy, then discard the disposable worktree"
    : result.status === "success" ? guidance.success : guidance.failure;
  const recoveryCommand = suppressEvidence
    ? "create a clean checkout without copying fixture authority"
    : guidance.recovery;
  const output = {
    schemaVersion: MUSIC_CLI_SCHEMA_VERSION,
    command,
    runId: id,
    status: result.status,
    phase: result.phase,
    durationMs: Date.now() - started,
    artifacts: (result.artifacts ?? []).map(portableQualificationArtifact),
    checkpoint: checkpoint ? portableQualificationArtifact(checkpoint) : undefined,
    error: result.error ? sanitize(result.error) : undefined,
    details: result.details === undefined ? undefined : redactStructuredData(result.details),
    nextCommand,
    recoveryCommand,
  };
  if (!suppressEvidence) {
    const commandResult = writeArtifact(id, "command-result.json", JSON.stringify({
      ...output,
      commit: context.commit,
      environmentFingerprint: context.environmentFingerprint,
      artifacts: output.artifacts,
      checkpoint: output.checkpoint,
    }, null, 2));
    output.artifacts = [...output.artifacts, portableQualificationArtifact(commandResult)];
  }
  if (format === "json") process.stdout.write(`${JSON.stringify(output)}\n`);
  else process.stdout.write(`${command}: ${result.status} (${result.phase})${output.error ? `\nerror: ${output.error}` : ""}${result.summary ? `\n${sanitize(result.summary)}` : ""}\nnext: ${output.nextCommand}\nrecovery: ${output.recoveryCommand}\nartifacts: ${output.artifacts.join(", ") || "none"}\ncheckpoint: ${output.checkpoint ?? "none"}\n`);
  return result.exitCode;
}

export interface StoredMusicCommandResult {
  command: string;
  runId: string;
  status: "success" | "failure" | "blocked";
  durationMs: number;
  commit: string;
  environmentFingerprint: string;
}

export function selectMusicTimeToFirstGreen(
  records: StoredMusicCommandResult[],
  authority: Pick<StoredMusicCommandResult, "commit" | "environmentFingerprint">,
): { coldFirstGreenMs: number | undefined; warmFirstGreenMs: number | undefined } {
  const matching = records.filter((record) => record.commit === authority.commit
    && record.environmentFingerprint === authority.environmentFingerprint).sort((left, right) => left.runId.localeCompare(right.runId));
  const sequence = ["bootstrap", "doctor", "up", "test:smoke"];
  let selected: { coldFirstGreenMs: number | undefined; warmFirstGreenMs: number | undefined } = {
    coldFirstGreenMs: undefined,
    warmFirstGreenMs: undefined,
  };
  for (let index = 0; index <= matching.length - sequence.length; index += 1) {
    const cold = matching.slice(index, index + sequence.length);
    if (!cold.every((record, offset) => record.command === sequence[offset] && record.status === "success")) continue;
    const warm = matching[index + sequence.length];
    selected = {
      coldFirstGreenMs: cold.reduce((total, record) => total + record.durationMs, 0),
      warmFirstGreenMs: warm?.command === "test:smoke" && warm.status === "success" ? warm.durationMs : undefined,
    };
  }
  return selected;
}

function storedCommandResults(): StoredMusicCommandResult[] {
  if (!existsSync(artifactRoot)) return [];
  const records: StoredMusicCommandResult[] = [];
  for (const directory of readdirSync(artifactRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const target = join(artifactRoot, directory.name, "command-result.json");
    if (!existsSync(target)) continue;
    try {
      const candidate = JSON.parse(readFileSync(target, "utf8")) as Partial<StoredMusicCommandResult>;
      if (typeof candidate.command === "string" && typeof candidate.runId === "string"
          && ["success", "failure", "blocked"].includes(candidate.status ?? "")
          && Number.isFinite(candidate.durationMs) && (candidate.durationMs ?? -1) >= 0
          && typeof candidate.commit === "string" && /^[a-f0-9]{40}$/.test(candidate.commit)
          && typeof candidate.environmentFingerprint === "string" && /^[a-f0-9]{64}$/.test(candidate.environmentFingerprint)) {
        records.push(candidate as StoredMusicCommandResult);
      }
    } catch {
      // Ignore malformed prior diagnostics; the current lane remains authoritative.
    }
  }
  return records.sort((left, right) => left.runId.localeCompare(right.runId)).slice(-100);
}

function readQualificationLaneHistory(lane: MusicQualificationLaneName, authority: RunContext): number[] {
  if (!existsSync(artifactRoot)) return [];
  const samples: number[] = [];
  for (const directory of readdirSync(artifactRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const target = join(artifactRoot, directory.name, `qualification-${lane}.json`);
    if (!existsSync(target)) continue;
    try {
      const candidate = JSON.parse(readFileSync(target, "utf8")) as {
        lane?: string;
        status?: string;
        authority?: { commit?: string; environmentFingerprint?: string };
        timing?: { wallClockMs?: number };
      };
      if (candidate.lane === lane && qualificationReportMatchesAuthority(candidate, authority)
          && Number.isFinite(candidate.timing?.wallClockMs)
          && (candidate.timing?.wallClockMs ?? -1) >= 0) samples.push(candidate.timing!.wallClockMs!);
    } catch {
      // Malformed history is excluded rather than trusted as timing evidence.
    }
  }
  return samples.slice(-20);
}

function readLatestQualificationLoadMeasurements(authority: RunContext): MusicQualificationLoadMeasurement[] {
  if (!existsSync(artifactRoot)) return [];
  const reports = readdirSync(artifactRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(artifactRoot, entry.name, "qualification-nightly.json"))
    .filter(existsSync)
    .sort()
    .reverse();
  for (const target of reports) {
    try {
      const candidate = JSON.parse(readFileSync(target, "utf8")) as {
        status?: string;
        authority?: { commit?: string; environmentFingerprint?: string };
        tasks?: MusicQualificationTaskEvidence[];
      };
      if (!qualificationReportMatchesAuthority(candidate, authority)) continue;
      const measurements = candidate.tasks?.flatMap((task) => task.loadMeasurements ?? []) ?? [];
      if (qualificationTelemetryIsBounded(measurements)) return measurements;
    } catch {
      // Malformed or older evidence is not promoted into the current release report.
    }
  }
  return [];
}

function collectQualificationMeasurements(tasks: MusicQualificationTaskEvidence[], context: RunContext): MusicQualificationMeasurements {
  const commands = storedCommandResults();
  const currentCommands = commands.filter((record) => record.commit === context.commit
    && record.environmentFingerprint === context.environmentFingerprint);
  const latest = (command: string) => [...currentCommands].reverse().find((record) => record.command === command);
  const successful = (command: string) => {
    const record = latest(command);
    return record ? { status: record.status, durationMs: record.durationMs } : undefined;
  };
  const bootstrap = successful("bootstrap");
  const doctor = successful("doctor");
  const smokes = currentCommands.filter(({ command }) => command === "test:smoke");
  const smoke = smokes.at(-1);
  const firstGreen = selectMusicTimeToFirstGreen(currentCommands, context);
  const taskGreen = (id: string) => tasks.find((task) => task.id === id)?.originalStatus === "success";
  const fixture = JSON.parse(readFileSync(join(root, "fixtures/strapi/music-identity/identity.fixture.json"), "utf8")) as { capturedAt?: string };
  const capturedAt = Date.parse(fixture.capturedAt ?? "");
  const currentLoad = tasks.flatMap((task) => task.loadMeasurements ?? []);
  const load = currentLoad.length ? currentLoad : readLatestQualificationLoadMeasurements(context);
  const loadMetrics = new Set(load.map(({ metric }) => metric));
  const operations: MusicQualificationOperationalMeasurement[] = tasks.flatMap((task) => task.operationalMeasurements ?? []);
  const interrupt = operations.find(({ metric }) => metric === "interrupt-resume");
  const release = operations.find(({ metric }) => metric === "real-docker-release");
  return {
    bootstrap,
    doctor,
    smoke: smoke ? { status: smoke.status, durationMs: smoke.durationMs } : undefined,
    coldFirstGreenMs: firstGreen.coldFirstGreenMs,
    warmFirstGreenMs: firstGreen.warmFirstGreenMs,
    fixtureAgeMs: Number.isFinite(capturedAt) ? Math.max(0, Date.now() - capturedAt) : 0,
    interruptCleanup: interrupt?.interruptCleanup === "verified" ? "verified" : "not-run",
    resume: interrupt?.resume === "verified" ? "verified" : "not-run",
    documentationContractFailures: taskGreen("fixture-drift") ? 0 : tasks.some(({ id }) => id === "fixture-drift") ? 1 : 0,
    compatibilityRouteUsage: typeof release?.compatibilityRouteUsage === "number" ? release.compatibilityRouteUsage : undefined,
    telemetryCardinality: qualificationTelemetryIsBounded(load) ? "bounded" : loadMetrics.size ? "failed" : "not-run",
    load,
    operations,
  };
}

export function resolveNpmCommand(input: { npmExecPath?: string; nodeExecPath: string; platform: NodeJS.Platform }): { file: string; args: string[] } {
  if (input.npmExecPath) return { file: input.nodeExecPath, args: [input.npmExecPath] };
  if (input.platform === "win32") return {
    file: input.nodeExecPath,
    args: [windowsPath.join(windowsPath.dirname(input.nodeExecPath), "node_modules", "npm", "bin", "npm-cli.js")],
  };
  return { file: "npm", args: [] };
}
export function resolveC10IsolatedDockerExecutable(
  environment: NodeJS.ProcessEnv,
  options: { platform?: NodeJS.Platform; nodeExecPath?: string; temporaryRoot?: string } = {},
): { file: string; args: string[] } | undefined {
  const scriptAuthority = environment.MUSIC_C10_ISOLATED_DOCKER_SCRIPT;
  const acknowledgement = environment.MUSIC_C10_ISOLATED_DOCKER_ACK;
  if (!scriptAuthority && !acknowledgement) return undefined;
  if (!scriptAuthority || acknowledgement !== "C10_MUTATION_BLOCKED") {
    throw new SafetyError("isolated Docker authority is incomplete", "qualification-docker-authority");
  }
  if (["DOCKER_HOST", "DOCKER_CONTEXT", "GATE_PROD", "MUSIC_DEPLOY_PRODUCTION", "MUSIC_DEPLOY_PROD"]
    .some((key) => Boolean(environment[key]))) {
    throw new SafetyError("ambient Docker or production authority is forbidden for the isolated CLI contract", "qualification-docker-authority");
  }
  const temporaryRoot = realpathSync(options.temporaryRoot ?? tmpdir());
  const script = realpathSync(scriptAuthority);
  const relationship = relative(temporaryRoot, script);
  const segments = relationship.split(/[\\/]/);
  if (relationship.startsWith("..") || segments.length !== 3
      || !segments[0]!.startsWith("music-c10-cli-contract-")
      || segments[1] !== "fake-docker" || segments[2] !== "fake-docker.cjs") {
    throw new SafetyError("isolated Docker script escaped its disposable authority", "qualification-docker-authority");
  }
  const authority = lstatSync(script);
  if (!authority.isFile() || authority.isSymbolicLink()) {
    throw new SafetyError("isolated Docker script is not a regular authority", "qualification-docker-authority");
  }
  return { file: options.nodeExecPath ?? process.execPath, args: [script] };
}
export function resolveC10IsolatedNpmExecutable(
  environment: NodeJS.ProcessEnv,
  options: { nodeExecPath?: string; temporaryRoot?: string } = {},
): { file: string; args: string[] } | undefined {
  const scriptAuthority = environment.MUSIC_C10_ISOLATED_NPM_EXECPATH;
  if (!scriptAuthority) return undefined;
  const docker = resolveC10IsolatedDockerExecutable(environment, options);
  const script = realpathSync(scriptAuthority);
  if (!docker || dirname(script) !== dirname(docker.args[0]!) || basename(script) !== "fake-npm.cjs") {
    throw new SafetyError("isolated npm script escaped its disposable Docker authority", "qualification-npm-authority");
  }
  const authority = lstatSync(script);
  if (!authority.isFile() || authority.isSymbolicLink()) {
    throw new SafetyError("isolated npm script is not a regular authority", "qualification-npm-authority");
  }
  return { file: options.nodeExecPath ?? process.execPath, args: [script] };
}
export function resolveC10StandalonePostgresPort(environment: NodeJS.ProcessEnv): number | undefined {
  return parseC10StandalonePostgresAuthority(environment)?.port;
}
export function resolveNativeMusicReleaseLauncher(
  mode: "rehearsal",
  platform: NodeJS.Platform = process.platform,
): { file: string; args: string[] } {
  if (platform === "win32") {
    return {
      file: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      args: [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
        "-File", join(root, "tunes", "scripts", "music-release-launcher.ps1"), "-Mode", mode,
      ],
    };
  }
  return {
    file: "/bin/sh",
    args: [join(root, "tunes", "scripts", "music-release-launcher.sh"), mode],
  };
}
function executable(command: "npm" | "docker" | "node"): { file: string; args: string[] } {
  if (command === "npm") return resolveC10IsolatedNpmExecutable(process.env)
    ?? resolveNpmCommand({ npmExecPath: process.env.npm_execpath, nodeExecPath: process.execPath, platform: process.platform });
  if (command === "node") return { file: process.execPath, args: [] };
  const isolatedDocker = resolveC10IsolatedDockerExecutable(process.env);
  if (isolatedDocker) return isolatedDocker;
  return { file: process.platform === "win32" ? "docker.exe" : "docker", args: [] };
}

async function runChild(id: string, command: "npm" | "docker" | "node", args: string[], phase: string, failureExitCode: number): Promise<{ stdout: string; stderr: string; artifact: string }> {
  const resolved = executable(command);
  const result = await runner.run(resolved.file, [...resolved.args, ...args], {
    cwd: root,
    env: phase === "all-tests" ? defaultMusicTestChildEnvironment(process.env) : { ...process.env, ...activeFixtureEnvironment },
  });
  let sensitiveValues = currentSensitiveValues();
  try { sensitiveValues = await qualificationSensitiveValues(activeFixtureEnvironment); } catch { /* bounded fallback */ }
  const artifact = writeArtifact(id, `child-${String(++childSequence).padStart(3, "0")}-${phase}.log`, `$ ${command} ${sanitizeMusicCliText(args.join(" "), sensitiveValues)}\nexit=${result.exitCode}\nstdout:\n${sanitizeMusicChildArtifactOutput(command, phase, result.stdout, sensitiveValues)}\nstderr:\n${sanitizeStructuredOutput(result.stderr, sensitiveValues)}`);
  if (result.exitCode !== 0) throw new MusicCommandError(`${command} ${args.join(" ")} failed with exit ${result.exitCode}; see ${portableQualificationArtifact(artifact)}`, phase, failureExitCode);
  return { ...result, artifact };
}

async function runQualificationTask(
  id: string,
  task: MusicQualificationTask,
  attempt: 1 | 2,
  remainingBudgetMs: number,
): Promise<MusicQualificationExecutionResult> {
  const started = Date.now();
  const commitBefore = readGitSha();
  const cleanBefore = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root, encoding: "utf8", windowsHide: true }).trim() === "";
  const rootLockSha256 = createHash("sha256").update(readFileSync(join(root, "package-lock.json"))).digest("hex");
  const taskRunner = new OwnedProcessRunner();
  qualificationRunners.add(taskRunner);
  const resolved = task.nativeReleaseMode
    ? resolveNativeMusicReleaseLauncher(task.nativeReleaseMode)
    : executable("npm");
  const taskEnvironment = qualificationTaskEnvironment(task.id);
  let playwrightPort: number | undefined;
  let timedOut = remainingBudgetMs <= 0;
  let childStarted = false;
  let result: { exitCode: number; signal: NodeJS.Signals | null; stdout: string; stderr: string } = { exitCode: 124, signal: null, stdout: "", stderr: "qualification wall-clock budget exhausted" };
  const rawEvidenceDirectory = task.testEvidenceSource
    ? mkdtempSync(join(tmpdir(), "explorers-music-evidence-"))
    : undefined;
  if (rawEvidenceDirectory && process.platform !== "win32") chmodSync(rawEvidenceDirectory, 0o700);
  const rawEvidencePath = rawEvidenceDirectory ? join(rawEvidenceDirectory, "result.json") : undefined;
  let capturedVitestRaw: string | undefined;
  if (rawEvidencePath && task.testEvidenceSource?.kind === "vitest-json") {
    writeFileSync(rawEvidencePath, "", { flag: "wx", mode: 0o600 });
  }
  let sensitiveValues = Object.entries(activeFixtureEnvironment)
    .filter(([key, value]) => /(?:password|secret|token|authorization|credential|database_url)/i.test(key) && value.length >= 8)
    .map(([, value]) => value);
  let timer: NodeJS.Timeout | undefined;
  try {
    if (!timedOut && !qualificationInterruptionRequested) {
      sensitiveValues = await qualificationSensitiveValues(activeFixtureEnvironment);
      let databaseUrlTest = taskEnvironment.MUSIC_C3_POSTGRES_TEST === "1"
        ? await fixtureMigratorUrl(activeFixtureEnvironment)
        : undefined;
      const legacyChildEnvironment = qualificationChildAmbientEnvironment(task.id, {
        ...process.env,
        ...activeStandalonePostgresEnvironment,
      });
      const standalonePostgres = databaseUrlTest && qualificationTaskUsesStandalonePostgres(task.id)
        ? attestC10StandalonePostgresAuthority(activeStandalonePostgresEnvironment, readGitSha())
        : undefined;
      if (databaseUrlTest && standalonePostgres) {
        const standaloneDatabase = new URL(databaseUrlTest);
        standaloneDatabase.hostname = "127.0.0.1";
        standaloneDatabase.port = String(standalonePostgres.port);
        databaseUrlTest = standaloneDatabase.toString();
      }
      const boundedAuthority = task.authority && task.authority !== "existing" ? task.authority : undefined;
      const childEnvironment = boundedAuthority ? buildQualificationChildEnvironment({
        authority: boundedAuthority,
        ambient: process.env,
        ...(boundedAuthority === "c10-postgres" ? { ownedDatabase: {
          ...activeStandalonePostgresEnvironment,
          ...taskEnvironment,
          ...(databaseUrlTest ? { DATABASE_URL_TEST: databaseUrlTest } : {}),
        } } : {}),
      }) : {
        ...legacyChildEnvironment,
        ...(qualificationTaskUsesFixtureEnvironment(task.id) ? activeFixtureEnvironment : {}),
        ...taskEnvironment,
        ...(databaseUrlTest ? { DATABASE_URL_TEST: databaseUrlTest } : {}),
      };
      if (task.npmArgs.includes("test:e2e") && !taskEnvironment.PLAYWRIGHT_EXTERNAL_BASE_URL) {
        const preferred = preferredQualificationPort(task.id);
        for (let offset = 0; offset <= 4_000; offset += 1) {
          const candidate = 56_000 + ((preferred - 56_000 + offset) % 4_001);
          if (!qualificationPorts.has(candidate) && await portAvailable(candidate)) {
            qualificationPorts.add(candidate);
            playwrightPort = candidate;
            break;
          }
        }
        if (!playwrightPort) throw new MusicCommandError("no isolated Playwright port is available", `qualification-${task.id}`, EXIT.prerequisite);
      }
      const evidenceArgs = rawEvidencePath && task.testEvidenceSource?.kind === "vitest-json"
        ? ["--reporter=default", "--reporter=json", `--outputFile.json=${rawEvidencePath}`]
        : [];
      childStarted = true;
      const completion = taskRunner.run(resolved.file, [...resolved.args, ...task.npmArgs, ...evidenceArgs], {
        cwd: root,
        env: { ...childEnvironment, ...(playwrightPort ? { PLAYWRIGHT_PORT: String(playwrightPort) } : {}) },
      });
      if (attempt === 1 && process.env.MUSIC_C10_INTERRUPT_PROBE === "1" && !qualificationInterruptProbeScheduled) {
        qualificationInterruptProbeScheduled = true;
        setTimeout(() => process.emit("SIGINT"), 250);
      }
      const timeout = new Promise<undefined>((resolveTimeout) => {
        timer = setTimeout(() => {
          timedOut = true;
          void taskRunner.terminateAll().finally(() => resolveTimeout(undefined));
        }, Math.max(1, remainingBudgetMs));
      });
      result = await Promise.race([completion, timeout]) ?? await completion;
    } else if (qualificationInterruptionRequested) {
      result = { exitCode: EXIT.interrupted, signal: null, stdout: "", stderr: "qualification interrupted before child start" };
    }
  } catch (error) {
    result = { exitCode: 1, signal: null, stdout: "", stderr: redactedError(error) };
  } finally {
    if (timer) clearTimeout(timer);
    if (playwrightPort) qualificationPorts.delete(playwrightPort);
    qualificationRunners.delete(taskRunner);
    try {
      if (rawEvidencePath && task.testEvidenceSource?.kind === "vitest-json" && existsSync(rawEvidencePath)) {
        capturedVitestRaw = readFileSync(rawEvidencePath, "utf8");
      }
    } finally {
      if (rawEvidenceDirectory) rmSync(rawEvidenceDirectory, { recursive: true, force: true });
    }
  }
  const durationMs = Date.now() - started;
  const commitAfter = readGitSha();
  const cleanAfter = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root, encoding: "utf8", windowsHide: true }).trim() === "";
  const outcome: QualificationOutcome = {
    started: childStarted,
    nativeExit: result.exitCode,
    nativeSignal: result.signal,
    timedOut,
    interrupted: qualificationInterruptionRequested || result.signal !== null,
    source: { commitBefore, commitAfter, cleanBefore, cleanAfter, rootLockSha256, sourceRoot: join(root, "tunes") },
    cleanup: taskRunner.activeChildCount === 0 ? "verified" : "unknown",
  };
  if (task.testEvidenceSource) {
    try {
      if (task.testEvidenceSource.kind === "vitest-json") {
        if (capturedVitestRaw === undefined) throw new Error("final Vitest JSON evidence is missing");
        const raw = capturedVitestRaw;
        if (sanitizeMusicCliText(raw, sensitiveValues) !== raw) throw new Error("raw Vitest evidence contains sensitive data");
        const evidence = parseFinalizedVitestEvidence(raw, result.exitCode, join(root, "tunes"));
        if (task.testEvidenceSource.expectedFiles) requireExactFileManifest(evidence, task.testEvidenceSource.expectedFiles);
        const rawSha256 = createHash("sha256").update(raw, "utf8").digest("hex");
        outcome.testEvidence = evidence;
        const metadata = JSON.stringify({ rawSha256, testEvidence: evidence }, null, 2);
        const metadataPath = writeAtomicArtifact(id, `qualification-${task.id}-attempt-${attempt}-evidence.json`, metadata);
        outcome.json = { path: portableQualificationArtifact(metadataPath), sha256: createHash("sha256").update(sanitizeStructuredOutput(metadata, currentSensitiveValues()), "utf8").digest("hex") };
      } else {
        const envelope = parseUatVitestEvidenceFromOutput(result.stdout, { root: join(root, "tunes"), commit: commitBefore, nativeExit: result.exitCode, nativeSignal: result.signal });
        const rawEnvelope = result.stdout.trim().split(/\r?\n/).at(-1)!;
        if (sanitizeMusicCliText(rawEnvelope, sensitiveValues) !== rawEnvelope) throw new Error("raw UAT evidence contains sensitive data");
        if (task.testEvidenceSource.expectedFiles) requireExactFileManifest(envelope.vitest, task.testEvidenceSource.expectedFiles);
        outcome.testEvidence = envelope.vitest;
        outcome.uatRunId = envelope.runId;
        const metadata = JSON.stringify({ rawSha256: createHash("sha256").update(rawEnvelope, "utf8").digest("hex"), testEvidence: envelope.vitest, uatRunId: envelope.runId }, null, 2);
        const metadataPath = writeAtomicArtifact(id, `qualification-${task.id}-attempt-${attempt}-evidence.json`, metadata);
        outcome.json = { path: portableQualificationArtifact(metadataPath), sha256: createHash("sha256").update(sanitizeStructuredOutput(metadata, currentSensitiveValues()), "utf8").digest("hex") };
      }
    } catch (error) {
      outcome.validationError = redactedError(error);
    }
  }
  const artifact = writeArtifact(id, `qualification-${task.id}-attempt-${attempt}.log`, [
    `$ npm ${task.npmArgs.join(" ")}`,
    `attempt=${attempt}`,
    `durationMs=${durationMs}`,
    `timedOut=${timedOut}`,
    `exit=${result.exitCode}`,
    `stdout:\n${sanitizeStructuredOutput(result.stdout, sensitiveValues)}`,
    `stderr:\n${sanitizeStructuredOutput(result.stderr, sensitiveValues)}`,
  ].join("\n"));
  return { ...result, durationMs, artifact: portableQualificationArtifact(artifact), timedOut, outcome };
}
function writeAtomicArtifact(id: string, name: string, content: string): string {
  const target = join(runDirectory(id), name);
  writeOwnerOnlyAtomicFile(target, sanitizeStructuredOutput(content, currentSensitiveValues()));
  return target;
}
export function writeOwnerOnlyAtomicFile(target: string, content: string): void {
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") chmodSync(dirname(target), 0o700);
  const temporary = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(temporary, content, { flag: "wx", mode: 0o600 });
  try {
    renameSync(temporary, target);
    if (process.platform !== "win32") chmodSync(target, 0o600);
  }
  catch (error) { if (existsSync(temporary)) unlinkSync(temporary); throw error; }
}

async function qualificationSensitiveValues(environment: Record<string, string>): Promise<string[]> {
  const values = musicSensitiveEnvironmentValues(environment);
  for (const key of [
    "MUSIC_TOKEN_SECRET_FILE_HOST",
    "MUSIC_DB_MIGRATOR_SECRET_FILE_HOST",
    "MUSIC_DB_RUNTIME_SECRET_FILE_HOST",
  ]) {
    const path = environment[key];
    if (path) values.push(await readSecureMusicSecretFile(resolve(root, path), { mode: "fixture" }));
  }
  return Array.from(new Set(values));
}

function withFixturePublicIdAuthority(
  buildEnvironment: Parameters<typeof rotateFixtureMusicAuthority>[1],
): Parameters<typeof rotateFixtureMusicAuthority>[1] {
  return (paths) => {
    const contents = buildEnvironment(paths);
    return `${contents}${contents.endsWith("\n") ? "" : "\n"}MUSIC_PUBLIC_ID_HMAC_KEY=VFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFQ\n`;
  };
}

function createTestEnv(): void {
  const fixtureStrapiHostPort = parseMusicFixtureStrapiHostPort(process.env.MUSIC_STRAPI_HOST_PORT);
  const fixtureStrapiUrl = resolveMusicFixtureStrapiUrl(fixtureStrapiHostPort);
  rotateFixtureMusicAuthority(root, withFixturePublicIdAuthority(({ tokenPath, migratorPasswordPath, runtimePasswordPath }) => {
    const fixturePath = (value: string) => `./${relative(root, value).replace(/\\/g, "/")}`;
    const identityEnvironment = ["MUSIC_E2E_ACCOUNT_USERNAME", "MUSIC_E2E_ACCOUNT_DOCUMENT_ID", "MUSIC_E2E_USER_DOCUMENT_ID", "MUSIC_E2E_STRAPI_TOKEN"]
      .map((name) => `${name}=${process.env[name] ?? ""}`).join("\n");
    return `MUSIC_MODE=fixture\nMUSIC_FIXTURE_VERSION=1\nSTRAPI_URL=http://strapi:1337\nMUSIC_FIXTURE_STRAPI_ORIGIN=http://strapi:1337\nTRUST_PROXY_HOPS=0\nMUSIC_STRAPI_HOST_PORT=${fixtureStrapiHostPort}\nSTRAPI_FIXTURE_URL=${fixtureStrapiUrl}\nDATABASE_URL_TEST=postgresql://music_migrator@127.0.0.1:55432/music_fixture\nMUSIC_DATABASE_HOST=postgres\nMUSIC_DATABASE_PORT=5432\nMUSIC_DATABASE_NAME=music_fixture\nMUSIC_DATABASE_USER=music_runtime_login\nMUSIC_DATABASE_MIGRATOR_USER=music_migrator\nMUSIC_DATABASE_PASSWORD_FILE=/run/secrets/music-db-runtime\nMUSIC_TOKEN_SECRET_FILE_HOST=${fixturePath(tokenPath)}\nMUSIC_DB_MIGRATOR_SECRET_FILE_HOST=${fixturePath(migratorPasswordPath)}\nMUSIC_DB_RUNTIME_SECRET_FILE_HOST=${fixturePath(runtimePasswordPath)}\nSESSION_SECRET=${randomBytes(32).toString("base64url")}\nCOOKIE_SECRET=${randomBytes(32).toString("base64url")}\nMUSIC_SIGNING_KEY_CURRENT_ID=fixture-current\nMUSIC_SIGNING_KEY_CURRENT_SECRET=${randomBytes(32).toString("base64url")}\nMUSIC_SIGNING_KEY_PREVIOUS_ID=fixture-previous\nMUSIC_SIGNING_KEY_PREVIOUS_SECRET=${randomBytes(32).toString("base64url")}\nMUSIC_TOKEN_CURRENT_KID=fixture-current\nMUSIC_TOKEN_CURRENT_SECRET_FILE=/run/secrets/music-token/current\nMUSIC_PUBLICATION_RESPONSE_CURRENT_KID=fixture-publication-v1\nMUSIC_PUBLICATION_RESPONSE_CURRENT_KEY=fHVy90h-cc6NG5lHj0Q_P8Gpg_HBwSp0reMX9lu19zI\nMUSIC_TOKEN_LIFETIME_SECONDS=600\nMUSIC_TOKEN_CLOCK_SKEW_SECONDS=15\nMUSIC_CONNECT_TIMEOUT_MS=5000\nMUSIC_READ_TIMEOUT_MS=10000\nMUSIC_CIRCUIT_FAILURE_THRESHOLD=3\nMUSIC_RATE_LIMIT_PER_MINUTE=60\nMUSIC_PROVISIONING_KILL_SWITCH=true\nMUSIC_PROVISIONING_COHORT=disabled\nMUSIC_EXPECTED_MIGRATION_ID=${EXPECTED_MUSIC_MIGRATION_ID}\nMUSIC_RECONCILIATION_ENABLED=false\nMUSIC_RECONCILIATION_MAX_ROWS=0\nMUSIC_RECONCILIATION_ENVIRONMENT=fixture\nMUSIC_RECONCILIATION_APPLY_ENABLED=false\nMUSIC_RECONCILIATION_LIVE_CONTRACT_VERIFIED=false\nMUSIC_RECONCILIATION_PAGE_SIZE=100\nMUSIC_RECONCILIATION_SCAN_MAX_ROWS=1000\nMUSIC_RECONCILIATION_BATCH_SIZE=100\nMUSIC_RECONCILIATION_MAX_CHANGE_ABSOLUTE=0\nMUSIC_RECONCILIATION_MAX_CHANGE_PERCENT=0\nMUSIC_RECONCILIATION_MAX_PAGES=100\nMUSIC_RECONCILIATION_SCAN_TIMEOUT_MS=300000\nMUSIC_RECONCILIATION_TIMEOUT_MS=10000\nMUSIC_RECONCILIATION_MAX_RESPONSE_BYTES=1048576\nMUSIC_RECONCILIATION_MAX_CANONICAL_BYTES=16777216\nMUSIC_RECONCILIATION_DB_LOCK_TIMEOUT_MS=5000\nMUSIC_RECONCILIATION_DB_STATEMENT_TIMEOUT_MS=120000\nMUSIC_RECONCILIATION_DB_IDLE_TRANSACTION_TIMEOUT_MS=30000\nSTRAPI_RECONCILIATION_TOKEN=fixture-read-only-token\n${identityEnvironment}\n`;
  }));
}

async function fixtureMigratorUrl(environment: Record<string, string>): Promise<string> {
  const path = resolve(root, environment.MUSIC_DB_MIGRATOR_SECRET_FILE_HOST ?? "");
  const password = await readSecureMusicSecretFile(path, { mode: "fixture" });
  const url = new URL(environment.DATABASE_URL_TEST);
  url.password = password;
  return url.toString();
}

async function portAvailable(port: number): Promise<boolean> {
  return await new Promise((resolvePort) => { const server = createServer(); server.unref(); server.once("error", () => resolvePort(false)); server.listen({ host: "127.0.0.1", port }, () => server.close(() => resolvePort(true))); });
}

function assertRetainedFixtureVolumeName(name: string): void {
  if (!retainedFixtureVolumes.map(retainedFixtureVolumeName).includes(name)) {
    throw new SafetyError("retained fixture volume inspection target is outside the exact allowlist", "cleanup-safety");
  }
}

function parseRetainedFixtureVolumeInspection(
  name: string,
  result: VolumeOnlyFixtureDockerCommandResult,
): RetainedFixtureVolumeInspection[] {
  assertRetainedFixtureVolumeName(name);
  if (result.exitCode !== 0) {
    if (/no such volume/i.test(`${result.stdout}\n${result.stderr}`)) return [];
    throw new MusicCommandError(`docker volume inspection failed for ${name}`, "cleanup-safety", EXIT.dependency);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(result.stdout); }
  catch { throw new SafetyError(`retained fixture volume ${name} inspection was malformed`, "cleanup-safety"); }
  if (!Array.isArray(parsed) || parsed.some((entry) => !entry || typeof entry !== "object" || Array.isArray(entry))) {
    throw new SafetyError(`retained fixture volume ${name} inspection was malformed`, "cleanup-safety");
  }
  return parsed as RetainedFixtureVolumeInspection[];
}

async function inspectRetainedFixtureVolumeByName(
  name: string,
): Promise<RetainedFixtureVolumeInspection[]> {
  assertRetainedFixtureVolumeName(name);
  const resolved = executable("docker");
  const result = await runner.run(resolved.file, [...resolved.args, "volume", "inspect", name], { cwd: root, env: process.env });
  return parseRetainedFixtureVolumeInspection(name, result);
}

async function inspectRetainedFixtureVolume(
  logicalName: typeof retainedFixtureVolumes[number],
): Promise<RetainedFixtureVolumeInspection | undefined> {
  const name = retainedFixtureVolumeName(logicalName);
  const parsed = await inspectRetainedFixtureVolumeByName(name);
  if (!parsed.length) return undefined;
  if (parsed.length !== 1) throw new SafetyError(`retained fixture volume ${name} inspection was ambiguous`, "cleanup-safety");
  validateRetainedFixtureVolume(parsed[0]!, logicalName);
  return parsed[0]!;
}

export function createVolumeOnlyFixtureResetDockerAdapter(input: {
  required: (
    args: readonly string[],
    phase: string,
  ) => Promise<VolumeOnlyFixtureDockerCommandResult & { artifact: string }>;
  observed: (args: readonly string[]) => Promise<VolumeOnlyFixtureDockerCommandResult>;
}): { dependencies: VolumeOnlyFixtureResetDependencies; artifacts: string[] } {
  const artifacts: string[] = [];
  const required = async (args: readonly string[], phase: string) => {
    const result = await input.required(args, phase);
    if (result.exitCode !== 0 || !result.artifact) {
      throw new MusicCommandError(`docker ${args.join(" ")} failed with exit ${result.exitCode}`, phase, EXIT.dependency);
    }
    artifacts.push(result.artifact);
    return result;
  };
  const lines = (output: string) => output.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  return {
    dependencies: {
      listContainerIds: async () => lines((await required(
        [...composeArguments, "ps", "-a", "-q"],
        "db-reset-volume-only-containers",
      )).stdout),
      listLabeledVolumeNames: async () => lines((await required([
        "volume", "ls", "-q",
        "--filter", "label=com.explorers.music.fixture=true",
        "--filter", `label=com.explorers.music.project=${MUSIC_COMPOSE_PROJECT}`,
      ], "db-reset-volume-only-volumes")).stdout),
      inspectVolume: async (name) => parseRetainedFixtureVolumeInspection(
        name,
        await input.observed(["volume", "inspect", name]),
      ),
      removeVolumes: async (names) => (await required(
        ["volume", "rm", ...names],
        "db-reset-retained-volumes",
      )).artifact,
    },
    artifacts,
  };
}

async function removeRetainedFixtureVolumes(id: string): Promise<string[]> {
  const adapter = createVolumeOnlyFixtureResetDockerAdapter({
    required: async (args, phase) => ({
      exitCode: 0,
      ...await runChild(id, "docker", [...args], phase, EXIT.dependency),
    }),
    observed: async (args) => {
      const resolved = executable("docker");
      return await runner.run(resolved.file, [...resolved.args, ...args], { cwd: root, env: process.env });
    },
  });
  await resetVolumeOnlyFixtureVolumes(root, adapter.dependencies);
  return adapter.artifacts;
}

async function allocateStandalonePostgresPort(): Promise<number> {
  const preferred = preferredQualificationPort("standalone-postgres");
  for (let offset = 0; offset <= 4_000; offset += 1) {
    const candidate = 56_000 + ((preferred - 56_000 + offset) % 4_001);
    if (candidate !== 55_432 && !qualificationPorts.has(candidate) && await portAvailable(candidate)) {
      qualificationPorts.add(candidate);
      return candidate;
    }
  }
  throw new MusicCommandError("no isolated PostgreSQL port is available", "qualification-postgres-authority", EXIT.prerequisite);
}

function standalonePostgresEnvironment(authority: { port: number; containerId: string; commit: string }): Record<string, string> {
  return {
    MUSIC_C10_STANDALONE_POSTGRES_ACK: "C10_LABELED_LOCAL_PG15",
    MUSIC_C10_STANDALONE_POSTGRES_PORT: String(authority.port),
    MUSIC_C10_STANDALONE_POSTGRES_CONTAINER_ID: authority.containerId,
    MUSIC_C10_STANDALONE_POSTGRES_COMMIT: authority.commit,
  };
}

async function renderComposeModel(id: string): Promise<{ model: ComposeModel; artifacts: string[] }> {
  const rendered = await runChild(id, "docker", [...composeArguments, "config", "--format", "json"], "compose-config", EXIT.prerequisite);
  const model = JSON.parse(rendered.stdout) as ComposeModel;
  validateComposeModel(model);
  return { model, artifacts: [rendered.artifact] };
}

async function inspectOwnedComposeResources(id: string, model: ComposeModel): Promise<string[]> {
  const artifacts: string[] = [];
  const ps = await runChild(id, "docker", [...composeArguments, "ps", "-a", "-q"], "compose-ps", EXIT.dependency); artifacts.push(ps.artifact);
  const ids = ps.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  if (!ids.length) throw new SafetyError("no owned fixture containers were found; cleanup refused");
  const inspectedContainers = await runChild(id, "docker", ["inspect", ...ids], "inspect-containers", EXIT.dependency); artifacts.push(inspectedContainers.artifact);
  const resources: Array<{ kind: "container" | "network" | "volume"; name: string; labels?: Record<string, string> }> = JSON.parse(inspectedContainers.stdout).map((entry: { Name?: string; Config?: { Labels?: Record<string, string> } }) => ({ kind: "container" as const, name: entry.Name ?? "unknown", labels: entry.Config?.Labels }));
  const networks = Object.values(model.networks ?? {}).map((resource) => (resource as { name?: string }).name).filter((name): name is string => Boolean(name));
  const volumes = Object.values(model.volumes ?? {}).map((resource) => (resource as { name?: string }).name).filter((name): name is string => Boolean(name));
  for (const name of [...networks, ...volumes]) if (!name.startsWith(`${MUSIC_COMPOSE_PROJECT}_`) || /prod(?:uction)?/i.test(name)) throw new SafetyError(`resolved resource ${name} is outside the isolated fixture project`);
  if (networks.length) { const inspected = await runChild(id, "docker", ["network", "inspect", ...networks], "inspect-networks", EXIT.dependency); artifacts.push(inspected.artifact); resources.push(...JSON.parse(inspected.stdout).map((entry: { Name?: string; Labels?: Record<string, string> }) => ({ kind: "network" as const, name: entry.Name ?? "unknown", labels: entry.Labels }))); }
  if (volumes.length) { const inspected = await runChild(id, "docker", ["volume", "inspect", ...volumes], "inspect-volumes", EXIT.dependency); artifacts.push(inspected.artifact); resources.push(...JSON.parse(inspected.stdout).map((entry: { Name?: string; Labels?: Record<string, string> }) => ({ kind: "volume" as const, name: entry.Name ?? "unknown", labels: entry.Labels }))); }
  validateOwnedResources(resources);
  return artifacts;
}

async function doctor(id: string): Promise<RunResult> {
  const failures: string[] = [];
  const artifacts: string[] = [];
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major !== 24 || minor < 21) failures.push("Node ^24.21.0 is required; fix: nvm use");
  for (const file of requiredFiles) if (!existsSync(join(root, file))) failures.push(`missing ${file}; fix: restore the repository file`);
  let fixtureStrapiHostPort = DEFAULT_MUSIC_FIXTURE_STRAPI_HOST_PORT;
  try {
    const environment = parseMusicEnvironment(readActiveFixtureEnvironment());
    fixtureStrapiHostPort = environment.MUSIC_STRAPI_HOST_PORT;
  } catch (error) { failures.push(`invalid fixture environment reference: ${redactedError(error)}; fix: npm run music:bootstrap`); }
  for (const example of [".env.music.example", ".env.music.test.example"]) try { parseMusicEnvironment(readEnvFile(join(root, example))); } catch (error) { failures.push(`invalid ${example}: ${redactedError(error)}; fix: restore the typed example`); }
  try { const npm = await runChild(id, "npm", ["--version"], "npm-version", EXIT.prerequisite); artifacts.push(npm.artifact); } catch (error) { failures.push(redactedError(error)); }
  try { const compose = await renderComposeModel(id); artifacts.push(...compose.artifacts); } catch (error) { failures.push(redactedError(error)); }
  try { const docker = await runChild(id, "docker", ["info"], "docker-daemon", EXIT.prerequisite); artifacts.push(docker.artifact); } catch { failures.push("Docker daemon is unavailable; fix: start Docker Desktop or the Docker daemon"); }
  if (statfsSync(root).bavail * statfsSync(root).bsize < 2 * 1024 * 1024 * 1024) failures.push("less than 2 GiB free disk space; fix: free disk space");
  for (const port of [55_432, fixtureStrapiHostPort, 55_000, 55_173]) if (!(await portAvailable(port))) failures.push(`fixture port ${port} is occupied; fix: stop the conflicting process`);
  return failures.length ? { status: "failure", phase: "doctor", exitCode: EXIT.prerequisite, error: failures.join(" | "), artifacts } : { status: "success", phase: "doctor", exitCode: EXIT.success, artifacts };
}

function captureFixture(mode: Mode): RunResult {
  if (mode !== "live") return { status: "success", phase: "fixture-capture", exitCode: EXIT.success, artifacts: [join(root, "fixtures/strapi/music-identity/identity.fixture.json")] };
  if (!process.env.LIVE_STRAPI_READ_ONLY_CREDENTIAL || !process.env.LIVE_STRAPI_URL) return { status: "blocked", phase: "live-fixture-capture", exitCode: EXIT.safety, error: "LIVE_STRAPI_URL and LIVE_STRAPI_READ_ONLY_CREDENTIAL are required; no probe was attempted" };
  return { status: "blocked", phase: "live-fixture-capture", exitCode: EXIT.safety, error: "live capture requires TK identity-owner endpoint allowlist review; no probe was attempted" };
}

async function executeCommand(id: string, parsed: ParsedArgs, context: RunContext): Promise<RunResult> {
  if (parsed.command === "bootstrap") {
    parseMusicEnvironment(readActiveFixtureEnvironment());
    const fixture = JSON.parse(readFileSync(join(root, "fixtures/strapi/music-identity/identity.fixture.json"), "utf8")); validateStrapiFixture(fixture, { mode: "fixture" });
    const artifacts: string[] = [];
    for (const args of [["ci", "--prefix", "tunes"], ["ci", "--prefix", "explorers-earth"]]) { const result = await runChild(id, "npm", args, "bootstrap-install", EXIT.prerequisite); artifacts.push(result.artifact); }
    return { status: "success", phase: "bootstrap", exitCode: EXIT.success, artifacts: [join(root, ".env.music.test"), ...artifacts] };
  }
  if (parsed.command === "doctor") return await doctor(id);
  if (parsed.command === "fixtures:capture") return captureFixture(parsed.mode);
  if (parsed.command === "reconcile") {
    if (parsed.mode === "live") assertLiveMusicReconciliationWorktreeClean();
    const environment = parsed.mode === "fixture"
      ? readActiveFixtureEnvironment()
      : Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
    const [{ parseMusicReconciliationCommandConfig, validateMusicReconciliationServiceToken }, command, { MusicReconciler }, { ReconciliationRepository }, { default: pg }] = await Promise.all([
      import("../server/config/music-reconciliation-config.ts"),
      import("../server/commands/reconcileMusicIdentities.ts"),
      import("../server/services/musicReconciler.ts"),
      import("../server/repositories/reconciliationRepository.ts"),
      import("pg"),
    ]);
    let config: ReturnType<typeof parseMusicReconciliationCommandConfig>;
    try { config = parseMusicReconciliationCommandConfig(environment); }
    catch (error) {
      const message = redactedError(error);
      if (/blocked until|Production reconciliation apply/i.test(message)) throw new SafetyError(message, "reconciliation-config");
      throw new MusicCommandError(message, "reconciliation-config", EXIT.usage);
    }
    const checkpointPath = activeRun?.reconciliationCheckpoint
      ?? resolveMusicReconciliationCheckpointPath(parsed.checkpoint, id);
    const resumePath = parsed.resume ? resolveMusicReconciliationCheckpointPath(parsed.resume, id) : undefined;
    let serviceToken: string;
    let databaseUrl: string;
    let fetchImpl: typeof fetch = fetch;
    let reconciliationContext = context;
    if (parsed.mode === "fixture") {
      serviceToken = config.serviceToken!;
      const runtimePasswordPath = resolve(root, environment.MUSIC_DB_RUNTIME_SECRET_FILE_HOST ?? "");
      const runtimePassword = await readSecureMusicSecretFile(runtimePasswordPath, { mode: "fixture" });
      const target = new URL(environment.DATABASE_URL_TEST);
      target.username = environment.MUSIC_DATABASE_USER;
      target.password = runtimePassword;
      databaseUrl = target.toString();
    } else {
      const credentialAuthorities = await readSecureMusicReconciliationAuthorities({
        reconciliationTokenFile: config.serviceTokenFile!,
        lifecycleProofTokenFile: config.lifecycleProofTokenFile!,
        accessTokenFile: config.accessTokenFile!,
      }, environment.STRAPI_ACCESS_TOKEN ?? "", { mode: "live" });
      serviceToken = validateMusicReconciliationServiceToken(credentialAuthorities.reconciliationToken);
      const [{ resolveMusicDatabaseConnection }, { resolveMusicIdentityTransportConfig }, { verifyMusicRuntimeDatabaseConnection }] = await Promise.all([
        import("../server/config/music-database-config.ts"),
        import("../server/config/music-identity-config.ts"),
        import("../server/db/music-runtime-role.ts"),
      ]);
      const database = await resolveMusicDatabaseConnection(environment, "runtime");
      await verifyMusicRuntimeDatabaseConnection(database, environment.MUSIC_DATABASE_MIGRATOR_USER ?? "");
      const transport = await resolveMusicIdentityTransportConfig(environment);
      databaseUrl = database.connectionString;
      fetchImpl = transport.fetchImpl;
      reconciliationContext = createLiveMusicReconciliationRunContext({
        base: context,
        environment,
        sourceUrl: config.sourceUrl,
        databaseUrl,
        serviceToken,
        credentialAuthorities: credentialAuthorities.evidence,
      });
      if (activeRun) activeRun.context = reconciliationContext;
    }
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
    try {
      if (parsed.mode === "live") {
        const { checkMusicDatabaseReadiness } = await import("../server/db/readiness.ts");
        const readiness = await checkMusicDatabaseReadiness(pool);
        if (!readiness.ready) {
          throw new SafetyError("Live reconciliation requires the exact verified Music migration.", "reconciliation-database-readiness");
        }
      }
      const source = new command.HttpMusicReconciliationSource({
        baseUrl: config.sourceUrl,
        serviceToken,
        timeoutMs: config.timeoutMs,
        maxResponseBytes: config.maxResponseBytes,
        fetchImpl,
      });
      const report = await command.reconcileMusicIdentities({
        reconciler: new MusicReconciler(source, new ReconciliationRepository(pool)),
        checkpointPath,
        resumePath,
        context: {
          commit: reconciliationContext.commit,
          fixtureVersion: reconciliationContext.fixtureVersion,
          fixtureSchemaVersion: reconciliationContext.fixtureSchemaVersion,
          environment: config.environment,
          environmentFingerprint: reconciliationContext.environmentFingerprint,
          gateValues: reconciliationContext.gateValues,
          thresholds: {
            pageSize: config.pageSize,
            maxRows: config.maxRows,
            batchSize: config.batchSize,
            maxChangeAbsolute: config.maxChangeAbsolute,
            maxChangePercent: config.maxChangePercent,
            maxPages: config.maxPages,
            scanTimeoutMs: config.scanTimeoutMs,
            requestTimeoutMs: config.timeoutMs,
            maxResponseBytes: config.maxResponseBytes,
            maxCanonicalBytes: config.maxCanonicalBytes,
            databaseLockTimeoutMs: config.databaseLockTimeoutMs,
            databaseStatementTimeoutMs: config.databaseStatementTimeoutMs,
            databaseIdleTransactionTimeoutMs: config.databaseIdleTransactionTimeoutMs,
          },
        },
        run: {
          runId: id,
          environment: config.environment,
          applyEnabled: config.applyEnabled,
          requestedMode: parsed.reconciliationMode,
          approvalToken: parsed.approvalToken,
          pageSize: config.pageSize,
          maxRows: config.maxRows,
          batchSize: config.batchSize,
          maxChangeAbsolute: config.maxChangeAbsolute,
          maxChangePercent: config.maxChangePercent,
          maxPages: config.maxPages,
          scanTimeoutMs: config.scanTimeoutMs,
          requestTimeoutMs: config.timeoutMs,
          maxResponseBytes: config.maxResponseBytes,
          maxCanonicalBytes: config.maxCanonicalBytes,
          databaseLockTimeoutMs: config.databaseLockTimeoutMs,
          databaseStatementTimeoutMs: config.databaseStatementTimeoutMs,
          databaseIdleTransactionTimeoutMs: config.databaseIdleTransactionTimeoutMs,
        },
      });
      const unavailable = report.anomalies.some((value) => value.code === "SOURCE_UNAVAILABLE" || value.code === "DATABASE_UNAVAILABLE");
      return {
        status: report.status === "success" ? "success" : "blocked",
        phase: report.status === "success" ? "reconcile" : "reconcile-safety",
        exitCode: report.status === "success" ? EXIT.success : unavailable ? EXIT.dependency : EXIT.safety,
        artifacts: [checkpointPath],
        checkpoint: checkpointPath,
       details: report,
       summary: command.formatMusicReconciliationReport(report, "human"),
      };
    } catch (error) {
      if (error instanceof command.MusicReconciliationResumeError) {
        throw new ResumeMismatchError(redactedError(error));
      }
      throw error;
    } finally {
      await pool.end().catch(() => undefined);
    }
  }
  if (["db:status", "db:migrate", "db:verify"].includes(parsed.command)) {
    const [{ default: pg }, { inspectMusicDatabase, migrateMusicDatabase, validateDisposableDatabaseTarget, verifyMusicDatabase }] = await Promise.all([
      import("pg"),
      import("../server/db/migrate.ts"),
    ]);
    if (parsed.target !== "test") throw new SafetyError("database command requires explicit --target test", "database-target");
    const environment = readActiveFixtureEnvironment();
    const target = validateDisposableDatabaseTarget({
      databaseUrlTest: environment.DATABASE_URL_TEST,
      databaseUrl: process.env.DATABASE_URL,
      composeProject: MUSIC_COMPOSE_PROJECT,
      confirmation: "RESET explorers-music-fixture/music_fixture",
    });
    const pool = new pg.Pool({ connectionString: await fixtureMigratorUrl(environment), max: 2 });
    try {
      const before = await inspectMusicDatabase(pool);
      const preflight = writeArtifact(id, `${parsed.command.replace(":", "-")}-preflight.json`, JSON.stringify({
        target, expectedId: EXPECTED_MUSIC_MIGRATION_ID, currentId: before.currentId ?? null, pendingIds: before.pendingIds,
      }));
      const state = parsed.command === "db:migrate"
        ? await migrateMusicDatabase(pool)
        : parsed.command === "db:verify"
          ? await verifyMusicDatabase(pool)
          : before;
      const evidence = writeArtifact(id, `${parsed.command.replace(":", "-")}.json`, JSON.stringify({
        target, expectedId: EXPECTED_MUSIC_MIGRATION_ID, currentIdBefore: before.currentId ?? null,
        currentId: state.currentId ?? null, currentChecksum: state.currentChecksum ?? null,
        ready: state.ready, pendingIds: state.pendingIds,
      }));
      return {
        status: "success", phase: parsed.command.replace(":", "-"), exitCode: EXIT.success, artifacts: [preflight, evidence],
        details: { target, expectedId: EXPECTED_MUSIC_MIGRATION_ID, currentIdBefore: before.currentId ?? null,
          currentId: state.currentId ?? null, currentChecksum: state.currentChecksum ?? null, ready: state.ready, pendingIds: state.pendingIds },
      };
    } catch (error) {
      throw new MusicCommandError(redactedError(error), parsed.command.replace(":", "-"), parsed.command === "db:verify" ? EXIT.verification : EXIT.prerequisite);
    } finally {
      await pool.end();
    }
  }
  if (parsed.command === "up") {
    const compose = await renderComposeModel(id);
    const result = await runChild(id, "docker", [...composeArguments, "up", "--build", ...(parsed.detach ? ["--detach"] : []), ...(parsed.wait ? ["--wait"] : [])], "up", EXIT.dependency);
    return { status: "success", phase: "up", exitCode: EXIT.success, artifacts: [...compose.artifacts, result.artifact] };
  }
  if (parsed.command === "test:smoke") { const result = await runChild(id, "npm", ["exec", "--silent", "--prefix", "tunes", "--", "tsx", "tunes/scripts/music-smoke.ts"], "smoke", EXIT.verification); return { status: "success", phase: "smoke", exitCode: EXIT.success, artifacts: [result.artifact] }; }
  if (parsed.command === "test:all") { const result = await runChild(id, "npm", ["test", "--prefix", "tunes"], "all-tests", EXIT.verification); return { status: "success", phase: "all-tests", exitCode: EXIT.success, artifacts: [result.artifact] }; }
  if (["test:fast", "test:pr", "test:nightly", "test:release"].includes(parsed.command)) {
    const lane = parsed.command.slice("test:".length) as MusicQualificationLaneName;
    if (lane === "release") assertQualificationSourceClean();
    const runLane = async () => await runMusicQualificationLane(lane, {
        artifactDirectory: runDirectory(id),
        priorLaneWallClockMs: readQualificationLaneHistory(lane, context),
        authority: { commit: context.commit, environmentFingerprint: context.environmentFingerprint },
        measurements: collectQualificationMeasurements([], context),
        execute: async (task, execution) => await runQualificationTask(id, task, execution.attempt, execution.remainingBudgetMs),
      });
    const report = lane === "fast" ? await runLane() : await withQualificationPostgresAuthority({
      existing: attestC10StandalonePostgresAuthority(process.env, context.commit),
      acquire: async () => {
        const passwordFile = activeFixtureEnvironment.MUSIC_DB_MIGRATOR_SECRET_FILE_HOST;
        if (!passwordFile) throw new MusicCommandError("fixture migrator secret authority is required", "qualification-postgres-authority", EXIT.prerequisite);
        return await startC10StandalonePostgres({
          commit: context.commit,
          port: await allocateStandalonePostgresPort(),
          passwordFile: resolve(root, passwordFile),
        });
      },
      release: async (authority) => {
        if ((authority as OwnedC10StandalonePostgresAuthority).owned) {
          await stopC10StandalonePostgres(authority as OwnedC10StandalonePostgresAuthority);
          qualificationPorts.delete(authority.port);
        }
      },
      run: async (authority) => {
        activeStandalonePostgresEnvironment = standalonePostgresEnvironment(authority);
        try { return await runLane(); }
        finally { activeStandalonePostgresEnvironment = {}; }
      },
    });
    await finalizeMusicQualificationReport(report, collectQualificationMeasurements(report.tasks, context), async (value) =>
      portableQualificationArtifact(writeAtomicArtifact(id, `qualification-${lane}.json`, JSON.stringify(value, null, 2))));
    return {
      status: report.status,
      phase: `qualification-${lane}`,
      exitCode: report.status === "success" ? EXIT.success : EXIT.verification,
      artifacts: [...report.tasks.flatMap(({ artifacts }) => artifacts), report.evidenceArtifact!],
      details: { failureCodes: report.failureCodes, timing: report.timing, telemetry: report.telemetry },
      summary: `${lane} lane ${report.status}; wall=${report.timing.wallClockMs}ms budget=${report.timing.budgetMs}ms p50=${report.timing.taskP50Ms}ms p95=${report.timing.taskP95Ms}ms`,
    };
  }
  if (parsed.command === "db:reset") {
    if (parsed.mode !== "fixture" || parsed.confirmProject !== MUSIC_COMPOSE_PROJECT) {
      throw new SafetyError(`destructive cleanup requires --mode fixture --confirm-project ${MUSIC_COMPOSE_PROJECT}`);
    }
    if (parsed.target !== "test") throw new SafetyError("db:reset requires explicit --target test", "database-target");
    const { validateDisposableDatabaseTarget } = await import("../server/db/migrate.ts");
    validateDisposableDatabaseTarget({
      databaseUrlTest: activeFixtureEnvironment.DATABASE_URL_TEST,
      databaseUrl: process.env.DATABASE_URL,
      composeProject: parsed.confirmProject,
      confirmation: parsed.confirmReset,
    });
    const compose = await renderComposeModel(id);
    const artifacts = [...compose.artifacts, ...(await removeRetainedFixtureVolumes(id))];
    return { status: "success", phase: "db-reset", exitCode: EXIT.success, artifacts };
  }
  if (parsed.command === "down") {
    return await withAllFixtureMusicSecretsCleanup(root, async () => {
      const destructive = parsed.volumes;
      if (destructive && (parsed.mode !== "fixture" || parsed.confirmProject !== MUSIC_COMPOSE_PROJECT)) throw new SafetyError(`destructive cleanup requires --mode fixture --confirm-project ${MUSIC_COMPOSE_PROJECT}`);
      const compose = await renderComposeModel(id);
      const artifacts = [...compose.artifacts, ...(await inspectOwnedComposeResources(id, compose.model))];
      const result = await runChild(id, "docker", [...composeArguments, "down", ...(destructive ? ["--volumes"] : [])], "down", EXIT.dependency);
      return { status: "success", phase: "down", exitCode: EXIT.success, artifacts: [...artifacts, result.artifact] };
    });
  }
  throw new MusicCommandError(`unhandled command ${parsed.command}`, "arguments", EXIT.usage);
}

async function main(): Promise<number> {
  const id = runId(); const started = Date.now(); let parsed: ParsedArgs;
  const rawArguments = process.argv.slice(2);
  const liveReconciliationIntent = rawArguments[0] === "reconcile"
    && rawArguments.some((value, index) => value === "--mode" && rawArguments[index + 1] === "live");
  // Classify only the fixed repository authority before touching untrusted
  // command arguments. If full parsing fails, unsupported authority still
  // wins and uses the CLI's safe default command/format.
  const fixtureAuthorityState = inspectFixtureEnvironmentAuthority(root);
  const unsupportedFixtureAuthority = !liveReconciliationIntent
    && fixtureAuthorityState === "unsupported";
  try { parsed = parseArgs(rawArguments); } catch (error) {
    const context = liveReconciliationIntent
      ? buildTrackedReconciliationContext()
      : buildRunContext({ allowInvalidEnvironment: unsupportedFixtureAuthority });
    if (unsupportedFixtureAuthority) {
      const authorityError = new FixtureUnsupportedLegacyEnvironmentError();
      return emit(id, "music", "human", started, context, { status: "blocked", phase: "fixture-authority", exitCode: EXIT.safety, error: redactedError(authorityError), suppressEvidence: true });
    }
    const failure = error instanceof MusicCommandError ? error : new MusicCommandError(redactedError(error), "arguments", EXIT.usage);
    return emit(id, "music", "human", started, context, { status: "failure", phase: failure.phase, exitCode: failure.exitCode, error: redactedError(failure) });
  }
  const requiresFixtureAuthority = !(parsed.command === "reconcile" && parsed.mode === "live");
  if (requiresFixtureAuthority
      && (unsupportedFixtureAuthority || inspectFixtureEnvironmentAuthority(root) === "unsupported")) {
    const error = new FixtureUnsupportedLegacyEnvironmentError();
    const context = buildRunContext({ allowInvalidEnvironment: true });
    return emit(id, parsed.command, parsed.format, started, context, {
      status: "blocked",
      phase: "fixture-authority",
      exitCode: EXIT.safety,
      error: redactedError(error),
      suppressEvidence: true,
    });
  }
  // A resume checkpoint is validated against the existing fixture authority.
  // Never rotate or erase credentials before that fail-closed comparison.
  if (parsed.command === "bootstrap" && !parsed.resume) {
    try {
      if (fixtureAuthorityState === "tombstone") {
        const retainedDatabase = await inspectRetainedFixtureVolume("music-fixture-postgres");
        if (retainedDatabase) {
          throw new SafetyError(
            `retired fixture credentials cannot be rotated over a retained database volume; recover with: npm run music:db:reset -- --mode fixture --target test --confirm-project ${MUSIC_COMPOSE_PROJECT} --confirm-reset "RESET ${MUSIC_COMPOSE_PROJECT}/music_fixture"`,
            "fixture-authority",
          );
        }
      }
      createTestEnv();
    } catch (error) {
      const context = buildRunContext({ allowInvalidEnvironment: true });
      const safetyFailure = error instanceof SafetyError
        || error instanceof FixtureUnsupportedLegacyEnvironmentError
        || error instanceof FixtureSecretCleanupError;
      const failure = error instanceof MusicCommandError
        ? error
        : new MusicCommandError(redactedError(error), "fixture-authority", safetyFailure ? EXIT.safety : EXIT.dependency);
      return emit(id, parsed.command, parsed.format, started, context, {
        status: safetyFailure ? "blocked" : "failure",
        phase: failure.phase,
        exitCode: failure.exitCode,
        error: redactedError(failure),
      });
    }
  }
  const context = parsed.command === "reconcile" && parsed.mode === "live"
    ? buildTrackedReconciliationContext()
    : buildRunContext({
      allowInvalidEnvironment: parsed.command === "doctor",
      // The aggregate cleanup wrapper is the destructive authority. A retired
      // pointer needs only a non-secret render context so a repeated teardown
      // can reach that wrapper; populated or malformed inventories still fail
      // authentication before the action is allowed to run.
      useExampleForRetiredEnvironment: parsed.command === "down" || parsed.command === "db:reset",
    });
  let reconciliationCheckpoint: string | undefined;
  if (parsed.command === "reconcile") {
    try { reconciliationCheckpoint = resolveMusicReconciliationCheckpointPath(parsed.checkpoint, id); }
    catch (error) { const failure = error as MusicCommandError; return emit(id, parsed.command, parsed.format, started, context, { status: "blocked", phase: failure.phase, exitCode: failure.exitCode, error: redactedError(failure) }); }
  }
  activeRun = { id, command: parsed.command, format: parsed.format, started, context, reconciliationCheckpoint };
  if (parsed.resume && parsed.command !== "reconcile") { try { assertResume(parsed.resume, context); } catch (error) { const failure = error as MusicCommandError; return emit(id, parsed.command, parsed.format, started, context, { status: "failure", phase: failure.phase, exitCode: failure.exitCode, error: redactedError(failure) }); } }
  try { return emit(id, parsed.command, parsed.format, started, context, await executeCommand(id, parsed, context)); }
  catch (error) { const failure = error instanceof MusicCommandError ? error : new MusicCommandError(redactedError(error), "execution", EXIT.dependency); return emit(id, parsed.command, parsed.format, started, context, { status: failure.exitCode === EXIT.safety ? "blocked" : "failure", phase: failure.phase, exitCode: failure.exitCode, error: redactedError(failure) }); }
  finally { activeRun = undefined; }
}

async function interrupted(): Promise<void> {
  qualificationInterruptionRequested = true;
  if (!activeRun) process.exit(EXIT.interrupted);
  const run = activeRun;
  let checkpoint = "";
  let ownedChildrenTerminated = false;
  await terminateBeforeCheckpoint(
    async () => {
      await runner.terminateAll();
      await Promise.all(Array.from(qualificationRunners).map(async (active) => await active.terminateAll()));
      ownedChildrenTerminated = runner.activeChildCount === 0
        && Array.from(qualificationRunners).every((active) => active.activeChildCount === 0);
    },
    async () => {
      if (run.reconciliationCheckpoint) {
        const { interruptMusicReconciliationCheckpoint } = await import("../server/commands/reconcileMusicIdentities.ts");
        if (await interruptMusicReconciliationCheckpoint(run.reconciliationCheckpoint)) checkpoint = run.reconciliationCheckpoint;
      }
      if (!checkpoint) checkpoint = writeCheckpoint(run.id, run.context, {
        status: "failure",
        phase: "interrupted",
        exitCode: EXIT.interrupted,
        details: { ownedChildrenTerminated },
      });
    },
  );
  emit(run.id, run.command, run.format, run.started, run.context, { status: "failure", phase: "interrupted", exitCode: EXIT.interrupted, checkpoint });
  process.exit(EXIT.interrupted);
}
export async function terminateBeforeCheckpoint(terminate: () => Promise<void>, checkpoint: () => void | Promise<void>): Promise<void> {
  await terminate();
  await checkpoint();
}
process.once("SIGINT", () => { void interrupted(); });
process.once("SIGTERM", () => { void interrupted(); });

if (process.argv[1]?.replace(/\\/g, "/").endsWith("/scripts/music-cli.ts")) {
  if (process.argv[2] === "test:release") requireNativeMusicReleaseLauncher("qualification");
  void main().then((code) => { process.exitCode = code; });
}
