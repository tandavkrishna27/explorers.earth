import {types as nativeTypes} from 'node:util';
import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { lstatSync, realpathSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, posix, resolve, win32 } from "node:path";
import { pathToFileURL } from "node:url";
import { buildUatEvidenceEnvelope, MUSIC_UAT_DATABASE_TEST_FILES } from "./music-vitest-evidence";
export { MUSIC_UAT_DATABASE_TEST_FILES } from "./music-vitest-evidence";
import {
  cleanupFixtureMusicTokenSecret,
  prepareFixtureMusicTokenSecret,
} from "./music-fixture-secret";
import {
  musicSensitiveEnvironmentValues,
  sanitizeMusicCliText,
} from "./music-output-redaction";
import { readSecureMusicSecretFile } from "../server/config/secure-music-secret-file";

export const MUSIC_UAT_DATABASE_ACK = "TASK4_FIXTURE_OWNED_DISPOSABLE_PG15";
export const MUSIC_UAT_DATABASE_REPORT_VERSION = "explorers-music-uat-database/v1";
// Each child stream is retained independently and is emitted only after the
// complete process exit. Overflow discards the entire raw stream.
export const MUSIC_UAT_DATABASE_CHILD_OUTPUT_MAX_BYTES = 8 * 1024 * 1024;
export const MUSIC_UAT_DATABASE_RAW_REPORT_MAX_BYTES = 4 * 1024 * 1024;

const FIXTURE_PROJECT = "explorers-music-fixture";
const POSTGRES_IMAGE = "postgres:15-alpine";
const POSTGRES_USER = "music_migrator";
const PASSWORD_DESTINATION = "/run/secrets/music-uat-database-password";
const DATA_DESTINATION = "/var/lib/postgresql/data";
// The migration suite retains multiple isolated databases until its teardown.
// Its WAL exhausted 512MiB; this remains an exact, attested disposable ceiling.
const DATA_TMPFS_OPTIONS = "rw,noexec,nosuid,size=2147483648";
const PORT_MINIMUM = 56_000;
const PORT_MAXIMUM = 60_999;
const FORBIDDEN_AMBIENT_KEYS = new Set([
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DATABASE_URL",
  "GATE_PROD",
  "MUSIC_DEPLOY_PRODUCTION",
  "MUSIC_DEPLOY_PROD",
]);
const LOCAL_DOCKER_HOSTS = new Set([
  "npipe:////./pipe/docker_engine",
  "npipe:////./pipe/dockerDesktopLinuxEngine",
  "unix:///var/run/docker.sock",
]);

export interface UatDatabaseAuthority {
  runId: string;
  database: string;
  port: number;
  containerId: string;
  commit: string;
}

export interface OwnedUatDatabaseAuthority extends UatDatabaseAuthority {
  imageId: string;
  contextHost: string;
  owned: true;
}

export interface UatDatabaseContainerInspect {
  Id?: unknown;
  Name?: unknown;
  Image?: unknown;
  Config?: { Image?: unknown; Env?: unknown; Labels?: Record<string, unknown> };
  State?: { Running?: unknown; Health?: { Status?: unknown } };
  HostConfig?: { PortBindings?: Record<string, unknown>; Tmpfs?: Record<string, unknown> };
  Mounts?: Array<{ Type?: unknown; Destination?: unknown; RW?: unknown; Source?: unknown }>;
}

interface UatDatabaseLifecycleOptions {
  dockerRead?: (args: string[]) => string;
  dockerOptionalRead?: (args: string[]) => string | undefined;
  dockerRun?: (args: string[]) => string;
  healthyInspect?: (authority: UatDatabaseAuthority, contextHost: string) => Promise<UatDatabaseContainerInspect>;
}

interface UatDatabaseStopOptions extends Pick<UatDatabaseLifecycleOptions, "dockerRead" | "dockerOptionalRead" | "dockerRun"> {
  dropDatabase: (authority: OwnedUatDatabaseAuthority) => Promise<void>;
}

function authorityError(message: string): Error {
  return new Error(`Task-4 UAT database authority rejected: ${message}`);
}

// Same dead-signal bug as the C10 standalone fixture: a bare `catch {}` collapsed every
// distinct Docker failure into one generic sentence. Keep the sentence as the prefix and
// append the argv, the exit status and the stderr tail behind it.
function describeDockerFailure(args: string[], cause: unknown): string {
  const failure = cause as { status?: number | null; signal?: string | null; stderr?: unknown; message?: unknown };
  const parts: string[] = [`docker ${args.join(" ")}`];
  if (typeof failure?.status === "number") parts.push(`exit ${failure.status}`);
  if (failure?.signal) parts.push(`signal ${String(failure.signal)}`);
  const stderr = typeof failure?.stderr === "string"
    ? failure.stderr
    : Buffer.isBuffer(failure?.stderr) ? failure.stderr.toString("utf8") : "";
  const detail = (stderr.trim() || (typeof failure?.message === "string" ? failure.message.trim() : ""))
    .split(/\r?\n/).filter((line) => line.trim()).slice(-3).join("; ").slice(0, 500);
  if (detail) parts.push(detail);
  return parts.join(" | ");
}

function normalizedEnvironment(environment: NodeJS.ProcessEnv): Map<string, string> {
  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(environment)) {
    if (value) normalized.set(key.toUpperCase(), value);
  }
  return normalized;
}

function requireNoForbiddenAmbientAuthority(environment: NodeJS.ProcessEnv): void {
  const normalized = normalizedEnvironment(environment);
  if (Array.from(FORBIDDEN_AMBIENT_KEYS).some((key) => normalized.has(key))
      || Array.from(normalized.keys()).some((key) => key.startsWith("MUSIC_C10_STANDALONE_POSTGRES_"))) {
    throw authorityError("ambient Docker, database, production, or unrelated sidecar authority is forbidden");
  }
}

function requireLocalDockerHost(contextHost: string): void {
  const local = LOCAL_DOCKER_HOSTS.has(contextHost)
    || /^unix:\/\/\/run\/user\/\d+\/docker\.sock$/.test(contextHost);
  if (!local) throw authorityError("a local Docker socket is required");
}

function validateRequestedIdentity(input: {
  runId: string;
  database: string;
  commit: string;
  port: number;
  passwordFile?: string;
}): void {
  if (!/^[a-f0-9]{32}$/.test(input.runId)) throw authorityError("run ID is invalid");
  if (input.database !== `music_uat_${input.runId}`) {
    throw authorityError("a unique database bound to the run ID is required");
  }
  if (!/^[a-f0-9]{40}$/.test(input.commit)) throw authorityError("commit is not an exact source commit");
  if (!Number.isSafeInteger(input.port) || input.port < PORT_MINIMUM || input.port > PORT_MAXIMUM) {
    throw authorityError("port is outside the isolated disposable range");
  }
  if (input.passwordFile !== undefined && input.passwordFile.length === 0) {
    throw authorityError("protected password file is required");
  }
}

export function parseUatDatabaseAuthority(environment: NodeJS.ProcessEnv): UatDatabaseAuthority | undefined {
  const normalized = normalizedEnvironment(environment);
  const acknowledgement = normalized.get("MUSIC_UAT_DATABASE_ACK");
  const runId = normalized.get("MUSIC_UAT_DATABASE_RUN_ID");
  const database = normalized.get("MUSIC_UAT_DATABASE_NAME");
  const rawPort = normalized.get("MUSIC_UAT_DATABASE_PORT");
  const containerId = normalized.get("MUSIC_UAT_DATABASE_CONTAINER_ID");
  const commit = normalized.get("MUSIC_UAT_DATABASE_COMMIT");
  if (![acknowledgement, runId, database, rawPort, containerId, commit].some(Boolean)) return undefined;
  if (acknowledgement !== MUSIC_UAT_DATABASE_ACK || !runId || !database || !rawPort || !containerId || !commit) {
    throw authorityError("the exact acknowledgement, run ID, database, port, container ID, and commit are required");
  }
  requireNoForbiddenAmbientAuthority(environment);
  if (!/^\d{5}$/.test(rawPort)) throw authorityError("port is invalid");
  const port = Number(rawPort);
  validateRequestedIdentity({ runId, database, port, commit });
  if (!/^[a-f0-9]{64}$/.test(containerId)) {
    throw authorityError("container ID is not an exact immutable ID");
  }
  return { runId, database, port, containerId, commit };
}

function exactTmpfs(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const options = value.split(",");
  return options.length === 4
    && new Set(options).size === 4
    && ["rw", "noexec", "nosuid", "size=2147483648"].every((option) => options.includes(option));
}

export function validateUatDatabaseInspect(
  authority: UatDatabaseAuthority,
  input: { contextHost: string; imageId: string; inspect: UatDatabaseContainerInspect },
): UatDatabaseAuthority & { imageId: string; contextHost: string } {
  return validateDatabaseInspect(authority, input, POSTGRES_IMAGE, true);
}

function validateDatabaseInspect(
  authority: UatDatabaseAuthority,
  input: { contextHost: string; imageId: string; inspect: UatDatabaseContainerInspect },
  configImage: string,
  healthy: boolean,
): UatDatabaseAuthority & { imageId: string; contextHost: string } {
  requireLocalDockerHost(input.contextHost);
  const expectedImageId = /^sha256:[a-f0-9]{64}$/.test(input.imageId) ? input.imageId : "";
  const labels = input.inspect.Config?.Labels ?? {};
  const environment = Array.isArray(input.inspect.Config?.Env) ? input.inspect.Config.Env : [];
  const bindingKeys = Object.keys(input.inspect.HostConfig?.PortBindings ?? {});
  const bindings = input.inspect.HostConfig?.PortBindings?.["5432/tcp"];
  const binding = Array.isArray(bindings) && bindings.length === 1
    ? bindings[0] as Record<string, unknown>
    : undefined;
  const tmpfs = input.inspect.HostConfig?.Tmpfs ?? {};
  const secretMounts = (input.inspect.Mounts ?? []).filter((mount) => mount.Destination === PASSWORD_DESTINATION);
  const exactEnvironment = [
    `POSTGRES_USER=${POSTGRES_USER}`,
    `POSTGRES_DB=${authority.database}`,
    `POSTGRES_PASSWORD_FILE=${PASSWORD_DESTINATION}`,
  ].every((entry) => environment.includes(entry));
  const exactLabels = labels["com.explorers.music.fixture"] === "true"
    && labels["com.explorers.music.project"] === FIXTURE_PROJECT
    && labels["com.explorers.music.uat-database"] === "true"
    && labels["com.explorers.music.uat-run"] === authority.runId
    && labels["com.explorers.music.database"] === authority.database
    && labels["com.explorers.music.commit"] === authority.commit;
  const exactMount = secretMounts.length === 1
    && secretMounts[0]?.Type === "bind"
    && secretMounts[0]?.RW === false
    && !(input.inspect.Mounts ?? []).some((mount) => mount.Type === "volume");
  if (input.inspect.Id !== authority.containerId
      || input.inspect.Name !== `/explorers-music-uat-db-${authority.runId}`
      || input.inspect.Config?.Image !== configImage
      || !expectedImageId || input.inspect.Image !== expectedImageId
      || !exactEnvironment || !exactLabels || !exactMount
      || (healthy && (input.inspect.State?.Running !== true
        || input.inspect.State?.Health?.Status !== "healthy"))
      || bindingKeys.length !== 1 || bindingKeys[0] !== "5432/tcp"
      || binding?.HostIp !== "127.0.0.1" || binding?.HostPort !== String(authority.port)
      || Object.keys(tmpfs).length !== 1 || !exactTmpfs(tmpfs[DATA_DESTINATION])) {
    throw authorityError("container is not the exact fixture-owned disposable PostgreSQL authority");
  }
  return { ...authority, imageId: expectedImageId, contextHost: input.contextHost };
}

function dockerExecutable(): string {
  return process.platform === "win32" ? "docker.exe" : "docker";
}

function defaultDockerRead(args: string[]): string {
  try {
    return execFileSync(dockerExecutable(), args, {
      encoding: "utf8", windowsHide: true, timeout: 15_000, stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (cause) {
    throw authorityError(`read-only Docker attestation failed: ${describeDockerFailure(args, cause)}`);
  }
}

function defaultDockerOptionalRead(args: string[]): string | undefined {
  const result = spawnSync(dockerExecutable(), args, {
    encoding: "utf8", windowsHide: true, timeout: 15_000, stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0 ? result.stdout : undefined;
}

function defaultDockerRun(args: string[]): string {
  try {
    return execFileSync(dockerExecutable(), args, {
      encoding: "utf8", windowsHide: true, timeout: 45_000, stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (cause) {
    throw authorityError(`owned Docker mutation failed: ${describeDockerFailure(args, cause)}`);
  }
}

function readLocalDockerContext(dockerRead: (args: string[]) => string): string {
  const contextName = dockerRead(["context", "show"]).trim();
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(contextName)) throw authorityError("Docker context name is invalid");
  let contextHost: unknown;
  try {
    contextHost = JSON.parse(dockerRead([
      "context", "inspect", contextName, "--format", "{{json .Endpoints.docker.Host}}",
    ]));
  } catch {
    throw authorityError("Docker context attestation returned invalid structured data");
  }
  if (typeof contextHost !== "string") throw authorityError("Docker context host is invalid");
  requireLocalDockerHost(contextHost);
  return contextHost;
}

async function defaultHealthyInspect(
  authority: UatDatabaseAuthority,
  contextHost: string,
  dockerRead: (args: string[]) => string,
): Promise<UatDatabaseContainerInspect> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const inspect = JSON.parse(dockerRead([
      "--host", contextHost, "inspect", "--type", "container", "--format", "{{json .}}", authority.containerId,
    ])) as UatDatabaseContainerInspect;
    if (inspect.State?.Running === true && inspect.State?.Health?.Status === "healthy") return inspect;
    if (inspect.State?.Running !== true || inspect.State?.Health?.Status === "unhealthy") break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw authorityError("owned disposable PostgreSQL did not become healthy");
}

export async function startOwnedUatDatabase(
  input: { runId: string; database: string; commit: string; port: number; passwordFile: string },
  options: UatDatabaseLifecycleOptions = {},
): Promise<OwnedUatDatabaseAuthority> {
  validateRequestedIdentity(input);
  const dockerRead = options.dockerRead ?? defaultDockerRead;
  const dockerOptionalRead = options.dockerOptionalRead ?? defaultDockerOptionalRead;
  const dockerRun = options.dockerRun ?? defaultDockerRun;
  const contextHost = readLocalDockerContext(dockerRead);
  const containerName = `explorers-music-uat-db-${input.runId}`;
  if (dockerOptionalRead(["--host", contextHost, "inspect", "--type", "container", containerName])) {
    throw authorityError("unique owned container name is already in use");
  }
  const imageId = dockerRead([
    "--host", contextHost, "image", "inspect", "--format", "{{.Id}}", POSTGRES_IMAGE,
  ]).trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(imageId)) throw authorityError("PostgreSQL image ID is invalid");
  const containerId = dockerRun(databaseCreationArguments(input, contextHost, POSTGRES_IMAGE)).trim();
  if (!/^[a-f0-9]{64}$/.test(containerId)) throw authorityError("created container ID is invalid");
  const authority: UatDatabaseAuthority = {
    runId: input.runId, database: input.database, port: input.port, containerId, commit: input.commit,
  };
  try {
    const inspect = options.healthyInspect
      ? await options.healthyInspect(authority, contextHost)
      : await defaultHealthyInspect(authority, contextHost, dockerRead);
    validateUatDatabaseInspect(authority, { contextHost, imageId, inspect });
    return { ...authority, imageId, contextHost, owned: true };
  } catch (error) {
    try { dockerRun(["--host", contextHost, "rm", "--force", "--volumes", containerId]); }
    catch { throw authorityError("startup failed and exact owned-container cleanup also failed"); }
    throw error;
  }
}

function databaseCreationArguments(
  input: { runId: string; database: string; commit: string; port: number; passwordFile: string },
  contextHost: string,
  image: string,
): string[] {
  const containerName = `explorers-music-uat-db-${input.runId}`;
  const passwordMount = `type=bind,src=${input.passwordFile},dst=${PASSWORD_DESTINATION},readonly`;
  return [
    "--host", contextHost, "run", "--detach", "--rm", "--name", containerName,
    "--label", "com.explorers.music.fixture=true",
    "--label", `com.explorers.music.project=${FIXTURE_PROJECT}`,
    "--label", "com.explorers.music.uat-database=true",
    "--label", `com.explorers.music.uat-run=${input.runId}`,
    "--label", `com.explorers.music.database=${input.database}`,
    "--label", `com.explorers.music.commit=${input.commit}`,
    "--publish", `127.0.0.1:${input.port}:5432`,
    "--env", `POSTGRES_USER=${POSTGRES_USER}`,
    "--env", `POSTGRES_DB=${input.database}`,
    "--env", `POSTGRES_PASSWORD_FILE=${PASSWORD_DESTINATION}`,
    "--mount", passwordMount,
    "--tmpfs", `${DATA_DESTINATION}:${DATA_TMPFS_OPTIONS}`,
    // Probed over TCP on purpose. The postgres entrypoint runs a socket-only
    // temporary server while it initialises, so a default pg_isready can report
    // healthy during that phase; the server then stops and restarts for real and a
    // client that connected in the gap sees "Connection terminated unexpectedly".
    // A TCP probe cannot pass until the real listener is up.
    "--health-cmd", `pg_isready -U ${POSTGRES_USER} -d ${input.database} -h 127.0.0.1 -p 5432`,
    "--health-interval", "1s", "--health-timeout", "5s", "--health-retries", "30",
    image,
  ];
}

interface StagedDockerResult {
  status: number | null;
  stdout: string;
  timedOut: boolean;
}

interface StagedFileMetadata {
  dev: bigint; ino: bigint; mode: bigint; uid: bigint; gid: bigint;
  size: bigint; nlink: bigint; mtimeNs: bigint; ctimeNs: bigint;
  isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean;
}

interface StagedDatabaseDependencies {
  clock: { now(): number; setTimeout(callback: () => void, ms: number): unknown; clearTimeout(timer: unknown): void };
  command(args: string[], timeoutMs: number): Promise<StagedDockerResult>;
  healthyInspect(authority: UatDatabaseAuthority, contextHost: string): Promise<UatDatabaseContainerInspect>;
  fileSystem: { realpath(path: string): string; lstat(path: string): StagedFileMetadata };
}

interface StagedDatabaseInput {
  runId: string; database: string; commit: string; port: number; passwordFile: string;
}

interface StagedDatabaseIntent extends StagedDatabaseInput {
  containerName: string; contextHost: string; imageId: string;
}

interface StagedDatabaseAcquisition {
  intent: Readonly<StagedDatabaseIntent>;
  create(): Promise<OwnedUatDatabaseAuthority>;
  dispose(dropDatabase: (authority: OwnedUatDatabaseAuthority) => Promise<void>): Promise<void>;
}

// The adapter is deliberately complete: tests cannot accidentally combine a fake
// witness with a production mutation. Production derives every witness itself.
async function stagedDockerCommand(args: string[], timeoutMs: number): Promise<StagedDockerResult> {
  const result = spawnSync(dockerExecutable(), args, {
    encoding: "utf8", windowsHide: true, timeout: timeoutMs, maxBuffer: 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { status: result.error ? null : result.status, stdout: result.stdout ?? "", timedOut: !!result.error };
}

function stagedCustody(
  path: string,
  fileSystem: StagedDatabaseDependencies["fileSystem"],
): readonly string[] {
  // The branch is chosen by the runtime platform and never by the shape of the incoming
  // string. Choosing by appearance would let a crafted path select whichever rule set is
  // weaker for the filesystem it actually lands on, which is the whole predicate gone.
  const windows = process.platform === "win32";
  const platformPath = windows ? win32 : posix;
  if (typeof path !== "string" || path.length > 512 || !platformPath.isAbsolute(path)) {
    throw authorityError("secret custody is invalid");
  }
  if (windows) {
    if (!/^[A-Za-z]:\\/.test(path) || /[\x00-\x1f\x7f/,]/.test(path)
        || path.slice(2).includes(":")
        || path.slice(3).split("\\").some(segment => !segment || segment === "." || segment === "..")) {
      throw authorityError("secret custody is invalid");
    }
  } else {
    // `/` appears in the Windows rejection class because there it is an alternate
    // separator that must never reach a path this predicate has already canonicalised on
    // backslashes. On POSIX that same character IS the separator, so it cannot also be a
    // rejection trigger - it moves from the character class into the segment walk below,
    // which enforces exactly what the Windows branch enforces: no empty segment, no `.`,
    // no `..`. Everything else in the class still applies. `,` matters most: this path is
    // interpolated into `--mount type=bind,src=<path>,dst=...`, where a comma would start
    // a new mount option. `:` is legal in a POSIX filename but is the separator in
    // Docker's `-v` syntax, and `\` is legal but would make a POSIX path read as a
    // Windows one; nothing this fixture generates needs either, so both stay refused
    // rather than left to a consumer to re-parse.
    const segments = path.split("/").slice(1);
    if (/[\x00-\x1f\x7f,:\\]/.test(path) || segments.length === 0
        || segments.some(segment => !segment || segment === "." || segment === "..")) {
      throw authorityError("secret custody is invalid");
    }
  }
  if (fileSystem.realpath(path) !== path) throw authorityError("secret custody is invalid");
  const paths = [path];
  let ancestor = platformPath.dirname(path);
  while (true) {
    paths.push(ancestor);
    if (ancestor === platformPath.parse(path).root) break;
    ancestor = platformPath.dirname(ancestor);
  }
  return paths.map((candidate, index) => {
    if (fileSystem.realpath(candidate) !== candidate) throw authorityError("secret ancestor custody is invalid");
    const stat = fileSystem.lstat(candidate);
    if (stat.isSymbolicLink() || (index === 0 ? !stat.isFile() || stat.nlink !== 1n
        || stat.size < 1n || stat.size > 512n : !stat.isDirectory())) {
      throw authorityError("secret custody is invalid");
    }
    const identity = [stat.dev, stat.ino, stat.mode, stat.uid, stat.gid];
    if (index === 0) identity.push(stat.size, stat.nlink, stat.mtimeNs, stat.ctimeNs);
    return identity.map(value => String(value)).join(":");
  });
}

export type OwnedUatDatabaseAcquisitionStage='creation-custody'|'creation-command'|'creation-result'|'health-inspect'|'health-state'|'health-not-running'|'health-unhealthy'|'health-wait'|'health-deadline'|'secret-custody'|'secret-mount'|'container-witness';
export type OwnedUatDatabaseAcquisitionDiagnostic=Readonly<{stage:OwnedUatDatabaseAcquisitionStage}>;
const acquisitionDiagnostics=new WeakMap<object,OwnedUatDatabaseAcquisitionDiagnostic>();
/** Reads only constructor-owned diagnostics; foreign error properties are never inspected. */
export function extractOwnedUatDatabaseAcquisitionDiagnostic(error:unknown):OwnedUatDatabaseAcquisitionDiagnostic|undefined{return typeof error==='object'&&error!==null?acquisitionDiagnostics.get(error):undefined;}

export async function prepareOwnedUatDatabaseAcquisition(
  input: StagedDatabaseInput,
  dependencies?: StagedDatabaseDependencies,
): Promise<StagedDatabaseAcquisition> {
  try {
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some(key => typeof key !== "string") || keys.sort().join(",") !== "commit,database,passwordFile,port,runId"
        || keys.some(key => !descriptors[key as string]?.enumerable || !("value" in descriptors[key as string]!))) {
      throw authorityError("acquisition input is invalid");
    }
    const runId: unknown = descriptors.runId!.value;
    const database: unknown = descriptors.database!.value;
    const commit: unknown = descriptors.commit!.value;
    const port: unknown = descriptors.port!.value;
    const passwordFile: unknown = descriptors.passwordFile!.value;
    if (typeof runId !== "string" || typeof database !== "string" || typeof commit !== "string"
        || typeof passwordFile !== "string" || typeof port !== "number") throw authorityError("acquisition input types are invalid");
    const requested: StagedDatabaseInput = { runId, database, commit, port, passwordFile };
    validateRequestedIdentity(requested);
    if (dependencies && (typeof dependencies.command !== "function"
        || typeof dependencies.healthyInspect !== "function"
        || typeof dependencies.fileSystem?.realpath !== "function"
        || typeof dependencies.fileSystem?.lstat !== "function"
        || typeof dependencies.clock?.now !== "function" || typeof dependencies.clock?.setTimeout !== "function"
        || typeof dependencies.clock?.clearTimeout !== "function")) throw authorityError("complete test adapter required");
    const clock = dependencies?.clock ?? {
      now: () => performance.now(),
      setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
      clearTimeout: (timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>),
    };
    const settlementExpired = authorityError("bounded settlement expired; custody retained");
    const bounded = <T>(operation: Promise<T>, deadline: number): Promise<T> => {
      const remaining = Math.floor(deadline - clock.now());
      if (remaining <= 0) {
        void operation.catch(() => undefined);
        return Promise.reject(settlementExpired);
      }
      return new Promise<T>((resolveResult, rejectResult) => {
        const timer = clock.setTimeout(() => rejectResult(settlementExpired), remaining);
        operation.then(value => { clock.clearTimeout(timer); resolveResult(value); },
          error => { clock.clearTimeout(timer); rejectResult(error); });
      });
    };
    const command = dependencies?.command ?? stagedDockerCommand;
    const fileSystem = dependencies?.fileSystem ?? {
      realpath: (path: string) => realpathSync(path),
      lstat: (path: string) => lstatSync(path, { bigint: true }),
    };
    const retainedCustody = stagedCustody(requested.passwordFile, fileSystem);
    const checkCustody = () => {
      const fresh = stagedCustody(requested.passwordFile, fileSystem);
      if (fresh.length !== retainedCustody.length || fresh.some((value, index) => value !== retainedCustody[index])) {
        throw authorityError("secret or ancestor custody changed");
      }
    };
    const preparationDeadline = clock.now() + 60000;
    const read = async (args: string[], deadline: number, mutation = false): Promise<string> => {
      const remaining = Math.floor(deadline - clock.now());
      if (remaining <= 0) throw authorityError("bounded Docker operation expired");
      const timeout = Math.min(mutation ? 45000 : 15000, remaining);
      const commandDeadline = Math.min(deadline, clock.now() + timeout);
      const result = await bounded(command(args, timeout), commandDeadline);
      if (clock.now() >= commandDeadline || result.status !== 0 || result.timedOut !== false
          || typeof result.stdout !== "string" || Buffer.byteLength(result.stdout) > 1024 * 1024) {
        throw authorityError("bounded Docker operation failed");
      }
      return result.stdout;
    };
    const contextName = (await read(["context", "show"], preparationDeadline)).trim();
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(contextName)) throw authorityError("Docker context name is invalid");
    const contextHost: unknown = JSON.parse(await read([
      "context", "inspect", contextName, "--format", "{{json .Endpoints.docker.Host}}",
    ], preparationDeadline));
    if (typeof contextHost !== "string") throw authorityError("Docker context host is invalid");
    requireLocalDockerHost(contextHost);
    const imageId = (await read([
      "--host", contextHost, "image", "inspect", "--format", "{{.Id}}", POSTGRES_IMAGE,
    ], preparationDeadline)).trim();
    if (!/^sha256:[a-f0-9]{64}$/.test(imageId)) throw authorityError("PostgreSQL image ID is invalid");
    const containerName = `explorers-music-uat-db-${requested.runId}`;
    const absence = async (filter: string, deadline: number) => {
      const output = await read(["--host", contextHost, "container", "ls", "--all", "--no-trunc",
        "--filter", filter, "--format", "{{.ID}}"], deadline);
      if (output !== "" && output !== "\n" && output !== "\r\n") throw authorityError("container absence is unconfirmed");
    };
    await absence(`name=^/${containerName}$`, preparationDeadline);
    checkCustody();
    const intent = Object.freeze({ ...requested, containerName, contextHost, imageId });
    let state: "prepared" | "creating" | "created" | "healthy" | "failed-known" | "uncertain" | "disposed" | "retained" = "prepared";
    let authority: OwnedUatDatabaseAuthority | undefined;
    let creation: Promise<OwnedUatDatabaseAuthority> | undefined;
    let disposal: Promise<void> | undefined;
    let disposalRequested = false;
    let terminalRetention = false;
    let acquisitionStage:OwnedUatDatabaseAcquisitionStage|undefined;
    const validatePinned = (inspect: UatDatabaseContainerInspect, healthy: boolean) => {
      if (!authority) throw authorityError("created ID is unknown");
      acquisitionStage='secret-custody';checkCustody();
      acquisitionStage='secret-mount';const mounts = (inspect.Mounts ?? []).filter(mount => mount.Destination === PASSWORD_DESTINATION);
      if (mounts.length !== 1 || mounts[0]?.Source !== requested.passwordFile) throw authorityError("secret bind source custody changed");
      acquisitionStage='container-witness';validateDatabaseInspect(authority, { contextHost, imageId, inspect }, imageId, healthy);
    };
    const freshInspect = async (deadline: number, healthy: boolean) => {
      if (!authority) throw authorityError("created ID is unknown");
      const inspect = JSON.parse(await read(["--host", contextHost, "inspect", "--type", "container",
        "--format", "{{json .}}", authority.containerId], deadline)) as UatDatabaseContainerInspect;
      validatePinned(inspect, healthy);
    };
    return Object.freeze({
      intent,
      create() {
        if (creation) return creation;
        if (disposalRequested) {
          creation = Promise.reject(authorityError("acquisition is disposed"));
          return creation;
        }
        state = "creating";
        creation = Promise.resolve().then(async () => {
          const deadline = clock.now() + 120000;
          try {
            acquisitionStage='creation-custody';checkCustody();
            acquisitionStage='creation-command';const containerId = (await read(databaseCreationArguments(requested, contextHost, imageId), deadline, true)).trim();
            acquisitionStage='creation-result';if (!/^[a-f0-9]{64}$/.test(containerId)) throw authorityError("created container ID is invalid");
            // Store exact custody before invoking or awaiting any health adapter.
            authority = Object.freeze({ runId: requested.runId, database: requested.database, commit: requested.commit,
              port: requested.port, containerId, imageId, contextHost, owned: true as const });
            state = "created";
            if (terminalRetention) throw authorityError("late creation retained");
            let inspect: UatDatabaseContainerInspect;
            acquisitionStage='health-inspect';if (dependencies) inspect = await bounded(dependencies.healthyInspect(authority, contextHost), deadline);
            else {
              while (true) {
                acquisitionStage='health-inspect';inspect = JSON.parse(await read(["--host", contextHost, "inspect", "--type", "container",
                  "--format", "{{json .}}", containerId], deadline)) as UatDatabaseContainerInspect;
                acquisitionStage='health-state';if (inspect.State?.Running === true && inspect.State?.Health?.Status === "healthy") break;
                if (inspect.State?.Running !== true || inspect.State?.Health?.Status === "unhealthy") {acquisitionStage=inspect.State?.Running!==true?'health-not-running':'health-unhealthy';throw authorityError("health failed");}
                acquisitionStage='health-deadline';if (deadline - clock.now() <= 250) throw authorityError("health expired");
                acquisitionStage='health-wait';await new Promise(resolveWait => setTimeout(resolveWait, 250));
              }
            }
            acquisitionStage='health-deadline';if (clock.now() >= deadline || terminalRetention) throw authorityError("health expired");
            validatePinned(inspect, true);
            state = "healthy";acquisitionStage=undefined;
            return authority;
          } catch {
            state = terminalRetention ? "retained" : authority ? "failed-known" : "uncertain";
            const error=authorityError("staged acquisition failed; custody retained");if(acquisitionStage)acquisitionDiagnostics.set(error,Object.freeze({stage:acquisitionStage}));throw error;
          }
        });
        return creation;
      },
      dispose(dropDatabase: (authority: OwnedUatDatabaseAuthority) => Promise<void>) {
        if (disposal) return disposal;
        disposalRequested = true;
        disposal = (async () => {
          const deadline = clock.now() + 120000;
          // Settlement, rather than a timer or discovery name, grants cleanup custody.
          if (creation) {
            try { await bounded(creation.catch(() => undefined), deadline); }
            catch { terminalRetention = true; state = "retained"; throw authorityError("unsettled creation retained"); }
          }
          if (state === "prepared") { state = "disposed"; return; }
          if (!authority || state === "uncertain") {
            state = "retained";
            throw authorityError("uncertain creation retained");
          }
          let dropFailed = false;
          try {
            const wasHealthy = state === "healthy";
            if (wasHealthy) {
              await freshInspect(deadline, true);
              try { await bounded(dropDatabase(authority), deadline); }
              catch (error) { if (error === settlementExpired) throw error; dropFailed = true; }
            }
            await freshInspect(deadline, wasHealthy);
            await read(["--host", contextHost, "rm", "--force", "--volumes", authority.containerId], deadline, true);
            await absence(`id=${authority.containerId}`, deadline);
            state = "disposed";
          } catch {
            terminalRetention = true;
            state = "retained";
            throw authorityError(dropFailed ? "DROP failed; exact cleanup failed; custody retained" : "exact cleanup failed; custody retained");
          }
          if (dropFailed) throw authorityError("DROP failed after exact removal");
        })();
        return disposal;
      },
    });
  } catch {
    throw authorityError("staged acquisition preparation refused");
  }
}

function authorityEnvironment(authority: UatDatabaseAuthority): NodeJS.ProcessEnv {
  return {
    MUSIC_UAT_DATABASE_ACK,
    MUSIC_UAT_DATABASE_RUN_ID: authority.runId,
    MUSIC_UAT_DATABASE_NAME: authority.database,
    MUSIC_UAT_DATABASE_PORT: String(authority.port),
    MUSIC_UAT_DATABASE_CONTAINER_ID: authority.containerId,
    MUSIC_UAT_DATABASE_COMMIT: authority.commit,
  };
}

export type OwnedStagedReadonlyDependencies={dockerRead:(args:string[])=>string;fileSystem:StagedDatabaseDependencies['fileSystem']};
/** Read-only witness only: fixture authority still requires the private owned-handle binding. */
/** Read-only witness only: fixture authority still requires the private owned-handle binding. */
export function attestOwnedStagedUatDatabaseAuthority(input: OwnedUatDatabaseAuthority, passwordFile: string, dependencies?: OwnedStagedReadonlyDependencies): Readonly<OwnedUatDatabaseAuthority> {
    const capture = (value: unknown, expected: readonly string[]) => { if (!value || typeof value !== 'object' || nativeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype)
        throw authorityError('staged readonly input is invalid'); const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors); if (keys.some(key => typeof key !== 'string') || keys.sort().join(',') !== [...expected].sort().join(',') || keys.some(key => !descriptors[key as string]?.enumerable || !Object.hasOwn(descriptors[key as string], 'value')))
        throw authorityError('staged readonly input is invalid'); return Object.fromEntries(keys.map(key => [key, descriptors[key as string].value])); };
    const data = capture(input, ['owned', 'runId', 'database', 'commit', 'port', 'containerId', 'imageId', 'contextHost']);
    if (data.owned !== true || typeof data.port !== 'number' || ['runId', 'database', 'commit', 'containerId', 'imageId', 'contextHost'].some(key => typeof data[key] !== 'string'))
        throw authorityError('staged readonly authority is invalid');
    const authority = Object.freeze({ ...data }) as unknown as OwnedUatDatabaseAuthority;
    validateRequestedIdentity({ ...authority, passwordFile });
    if (!/^[a-f0-9]{64}$/.test(authority.containerId) || !/^sha256:[a-f0-9]{64}$/.test(authority.imageId))
        throw authorityError('staged readonly identity is invalid');
    requireLocalDockerHost(authority.contextHost);
    let dockerRead = defaultDockerRead, fileSystem: StagedDatabaseDependencies['fileSystem'] = { realpath: path => realpathSync(path), lstat: path => lstatSync(path, { bigint: true }) };
    if (dependencies !== undefined) {
        const adapter = capture(dependencies, ['dockerRead', 'fileSystem']), files = capture(adapter.fileSystem, ['realpath', 'lstat']);
        if ([adapter.dockerRead, files.realpath, files.lstat].some(value => typeof value !== 'function' || nativeTypes.isProxy(value)))
            throw authorityError('complete readonly adapter required');
        dockerRead = adapter.dockerRead;
        fileSystem = { realpath: files.realpath, lstat: files.lstat };
    }
    const retained = stagedCustody(passwordFile, fileSystem);
    const contextHost = readLocalDockerContext(dockerRead);
    if (contextHost !== authority.contextHost)
        throw authorityError('staged readonly context changed');
    let inspect: UatDatabaseContainerInspect;
    try {
        inspect = JSON.parse(dockerRead(['--host', contextHost, 'inspect', '--type', 'container', '--format', '{{json .}}', authority.containerId]));
    }
    catch {
        throw authorityError('staged readonly inspection failed');
    }
    const imageId = dockerRead(['--host', contextHost, 'image', 'inspect', '--format', '{{.Id}}', authority.imageId]).trim();
    if (imageId !== authority.imageId)
        throw authorityError('staged readonly image changed');
    const result = validateDatabaseInspect(authority, { contextHost, imageId, inspect }, authority.imageId, true), mounts = (inspect.Mounts ?? []).filter(mount => mount.Destination === PASSWORD_DESTINATION);
    if (mounts.length !== 1 || mounts[0].Source !== passwordFile)
        throw authorityError('staged readonly mount changed');
    const fresh = stagedCustody(passwordFile, fileSystem);
    if (fresh.length !== retained.length || fresh.some((identity, index) => identity !== retained[index]))
        throw authorityError('secret or ancestor custody changed');
    return Object.freeze({ ...result, owned: true });
}

export function attestUatDatabaseAuthority(
  environment: NodeJS.ProcessEnv,
  expectedCommit: string,
  options: { dockerRead?: (args: string[]) => string } = {},
): (UatDatabaseAuthority & { imageId: string; contextHost: string }) | undefined {
  const authority = parseUatDatabaseAuthority(environment);
  if (!authority) return undefined;
  if (authority.commit !== expectedCommit) throw authorityError("container commit does not match the source commit");
  const dockerRead = options.dockerRead ?? defaultDockerRead;
  const contextHost = readLocalDockerContext(dockerRead);
  let inspect: UatDatabaseContainerInspect;
  try {
    inspect = JSON.parse(dockerRead([
      "--host", contextHost, "inspect", "--type", "container", "--format", "{{json .}}", authority.containerId,
    ])) as UatDatabaseContainerInspect;
  } catch {
    throw authorityError("Docker container attestation returned invalid structured data");
  }
  const imageId = dockerRead([
    "--host", contextHost, "image", "inspect", "--format", "{{.Id}}", POSTGRES_IMAGE,
  ]).trim();
  return validateUatDatabaseInspect(authority, { contextHost, imageId, inspect });
}

export async function stopOwnedUatDatabase(
  authority: OwnedUatDatabaseAuthority,
  options: UatDatabaseStopOptions,
): Promise<void> {
  const dockerRead = options.dockerRead ?? defaultDockerRead;
  const dockerOptionalRead = options.dockerOptionalRead ?? defaultDockerOptionalRead;
  const dockerRun = options.dockerRun ?? defaultDockerRun;
  const attest = () => attestUatDatabaseAuthority(authorityEnvironment(authority), authority.commit, { dockerRead });
  const beforeDrop = attest();
  if (!beforeDrop || beforeDrop.imageId !== authority.imageId || beforeDrop.contextHost !== authority.contextHost) {
    throw authorityError("owned database cleanup attestation changed");
  }
  let dropFailure: unknown;
  try { await options.dropDatabase(authority); }
  catch (error) { dropFailure = error; }

  let removalFailure: unknown;
  try {
    const beforeRemoval = attest();
    if (!beforeRemoval || beforeRemoval.imageId !== authority.imageId || beforeRemoval.contextHost !== authority.contextHost) {
      throw authorityError("owned database removal attestation changed");
    }
    dockerRun(["--host", authority.contextHost, "rm", "--force", "--volumes", authority.containerId]);
    if (dockerOptionalRead([
      "--host", authority.contextHost, "inspect", "--type", "container", authority.containerId,
    ]) !== undefined) {
      throw authorityError("owned container remains after teardown");
    }
  } catch (error) {
    removalFailure = error;
  }
  if (removalFailure) throw authorityError("exact owned-container teardown failed");
  if (dropFailure) throw authorityError("database drop failed before successful container teardown");
}

export async function withOwnedUatDatabase<T, A>(input: {
  acquire: () => Promise<A>;
  run: (authority: A) => Promise<T>;
  release: (authority: A) => Promise<void>;
}): Promise<T> {
  const authority = await input.acquire();
  try { return await input.run(authority); }
  finally { await input.release(authority); }
}

export function buildUatDatabaseTestCommand(npmCli: string, outputPath: string): { file: string; args: string[] } {
  if (!npmCli) throw authorityError("the invoking npm CLI is required");
  if (!outputPath) throw authorityError("the owned Vitest output path is required");
  return {
    file: process.execPath,
    args: [
      npmCli, "run", "test:integration", "--",
      ...MUSIC_UAT_DATABASE_TEST_FILES,
      "--maxWorkers=1", "--fileParallelism=false", "--testTimeout=10000",
      "--reporter=default", "--reporter=json", `--outputFile.json=${outputPath}`,
    ],
  };
}

export async function executeOwnedUatEvidence<A, E>(input: {
  acquire: () => Promise<A>;
  run: (authority: A) => Promise<UatDatabaseTestChildResult>;
  release: (authority: A) => Promise<void>;
  readRaw: () => string;
  buildEnvelope: (input: {
    result: UatDatabaseTestChildResult;
    vitestRaw: string;
    cleanup: "database-dropped-container-removed";
  }) => E;
  writeEnvelope: (envelope: E) => Promise<void>;
}): Promise<E> {
  const authority = await input.acquire();
  let result: UatDatabaseTestChildResult;
  try {
    result = await input.run(authority);
  } finally {
    await input.release(authority);
  }
  const vitestRaw = input.readRaw();
  if (Buffer.byteLength(vitestRaw, "utf8") > MUSIC_UAT_DATABASE_RAW_REPORT_MAX_BYTES) {
    throw authorityError("raw Vitest report exceeded the retained evidence limit");
  }
  const envelope = input.buildEnvelope({
    result,
    vitestRaw,
    cleanup: "database-dropped-container-removed",
  });
  await input.writeEnvelope(envelope);
  return envelope;
}

function uatDatabaseEnvironment(
  ambient: NodeJS.ProcessEnv,
  authority: UatDatabaseAuthority,
  password: string,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  const removed = new Set([
    "DATABASE_URL", "DATABASE_URL_TEST", "PGHOST", "PGHOSTADDR", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD",
    "DOCKER_HOST", "DOCKER_CONTEXT", "GATE_PROD", "MUSIC_DEPLOY_PRODUCTION", "MUSIC_DEPLOY_PROD",
  ]);
  for (const [key, value] of Object.entries(ambient)) {
    const normalized = key.toUpperCase();
    if (removed.has(normalized)
        || normalized.startsWith("MUSIC_UAT_DATABASE_")
        || normalized.startsWith("MUSIC_C10_STANDALONE_POSTGRES_")) continue;
    environment[key] = value;
  }
  const target = new URL("postgresql://127.0.0.1");
  target.username = POSTGRES_USER;
  target.password = password;
  target.port = String(authority.port);
  target.pathname = authority.database;
  return {
    ...environment,
    ...authorityEnvironment(authority),
    DATABASE_URL_TEST: target.toString(),
    MUSIC_C3_POSTGRES_TEST: "1",
    MUSIC_C4_POSTGRES_TEST: "1",
    MUSIC_C5_POSTGRES_TEST: "1",
    MUSIC_C6_POSTGRES_TEST: "1",
    MUSIC_C7_POSTGRES_TEST: "1",
    MUSIC_C8_POSTGRES_TEST: "1",
    MUSIC_C9_PUBLICATION_POSTGRES_TEST: "1",
    MUSIC_C10_POSTGRES_TEST: "1",
    MUSIC_C11_STATE_RESTORE_POSTGRES_TEST: "1",
    MUSIC_C12_INITIAL_CAPTURE_POSTGRES_TEST: "1",
    MUSIC_C13_IDENTITY_COUNT_ADAPTER_POSTGRES_TEST: "1",
  };
}

async function allocatePort(): Promise<number> {
  const start = PORT_MINIMUM + randomBytes(2).readUInt16BE(0) % (PORT_MAXIMUM - PORT_MINIMUM + 1);
  for (let offset = 0; offset <= PORT_MAXIMUM - PORT_MINIMUM; offset += 1) {
    const port = PORT_MINIMUM + ((start - PORT_MINIMUM + offset) % (PORT_MAXIMUM - PORT_MINIMUM + 1));
    const available = await new Promise<boolean>((resolveAvailable) => {
      const server = createServer();
      server.unref();
      server.once("error", () => resolveAvailable(false));
      server.listen({ host: "127.0.0.1", port }, () => server.close(() => resolveAvailable(true)));
    });
    if (available) return port;
  }
  throw authorityError("no isolated disposable port is available");
}

async function dropDatabase(authority: OwnedUatDatabaseAuthority, password: string): Promise<void> {
  const { default: pg } = await import("pg");
  const admin = new URL("postgresql://127.0.0.1/postgres");
  admin.username = POSTGRES_USER;
  admin.password = password;
  admin.port = String(authority.port);
  const pool = new pg.Pool({ connectionString: admin.toString(), max: 1 });
  try {
    await pool.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [authority.database],
    );
    await pool.query(`DROP DATABASE IF EXISTS "${authority.database}"`);
    const remaining = await pool.query("SELECT 1 FROM pg_database WHERE datname = $1", [authority.database]);
    if (remaining.rowCount !== 0) throw authorityError("database remains after drop");
  } finally {
    await pool.end();
  }
}

export interface UatDatabaseTestChildResult {
  exitCode: number;
  signal: NodeJS.Signals | null;
}

interface UatDatabaseTestChildOptions {
  setChild: (child: ChildProcess | undefined) => void;
  exactSensitiveValues?: readonly string[];
  writeStdout?: (value: string) => void;
  writeStderr?: (value: string) => void;
}

interface CapturedChildStream {
  chunks: Buffer[];
  bytes: number;
  overflow: boolean;
}

function captureChildOutput(stream: CapturedChildStream, chunk: Buffer | string): void {
  if (stream.overflow) return;
  const value = Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(chunk, "utf8");
  if (stream.bytes + value.byteLength > MUSIC_UAT_DATABASE_CHILD_OUTPUT_MAX_BYTES) {
    stream.chunks = [];
    stream.bytes = 0;
    stream.overflow = true;
    return;
  }
  stream.chunks.push(value);
  stream.bytes += value.byteLength;
}

function childOutputSensitiveValues(
  environment: NodeJS.ProcessEnv,
  exactSensitiveValues: readonly string[],
): string[] {
  const values = [
    ...exactSensitiveValues,
    ...musicSensitiveEnvironmentValues(
      Object.fromEntries(Object.entries(environment).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    ),
  ];
  const databaseUrl = environment.DATABASE_URL_TEST;
  if (databaseUrl) {
    values.push(databaseUrl);
    try {
      const parsed = new URL(databaseUrl);
      if (parsed.password) {
        values.push(parsed.password);
        try { values.push(decodeURIComponent(parsed.password)); }
        catch { /* exact URL and encoded password remain protected */ }
      }
    } catch { /* the exact configured value remains protected */ }
  }
  return values;
}

function retainedChildOutput(
  stream: CapturedChildStream,
  streamName: "stdout" | "stderr",
  sensitiveValues: readonly string[],
): string {
  if (stream.overflow) {
    return `[Task-4 UAT database ${streamName} discarded: exceeded ${MUSIC_UAT_DATABASE_CHILD_OUTPUT_MAX_BYTES} bytes]\n`;
  }
  return sanitizeMusicCliText(Buffer.concat(stream.chunks, stream.bytes).toString("utf8"), sensitiveValues);
}

export function runUatDatabaseTestChild(
  command: { file: string; args: string[] },
  environment: NodeJS.ProcessEnv,
  options: UatDatabaseTestChildOptions,
): Promise<UatDatabaseTestChildResult> {
  return new Promise((resolveExit, rejectExit) => {
    const child = spawn(command.file, command.args, {
      cwd: resolve(import.meta.dirname, ".."),
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout: CapturedChildStream = { chunks: [], bytes: 0, overflow: false };
    const stderr: CapturedChildStream = { chunks: [], bytes: 0, overflow: false };
    const sensitiveValues = childOutputSensitiveValues(environment, options.exactSensitiveValues ?? []);
    let spawnFailure: unknown;
    options.setChild(child);
    child.stdout?.on("data", (chunk: Buffer | string) => { captureChildOutput(stdout, chunk); });
    child.stderr?.on("data", (chunk: Buffer | string) => { captureChildOutput(stderr, chunk); });
    child.once("error", (error) => { spawnFailure = error; });
    child.once("close", (code, signal) => {
      options.setChild(undefined);
      const writeStdout = options.writeStdout ?? ((value: string) => { process.stdout.write(value); });
      const writeStderr = options.writeStderr ?? ((value: string) => { process.stderr.write(value); });
      writeStdout(retainedChildOutput(stdout, "stdout", sensitiveValues));
      writeStderr(retainedChildOutput(stderr, "stderr", sensitiveValues));
      if (spawnFailure) {
        rejectExit(authorityError("repository test child failed to start"));
        return;
      }
      resolveExit({
        exitCode: signal ? 130 : (Number.isInteger(code) ? code! : 1),
        signal,
      });
    });
  });
}

function readCommit(): string {
  try {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: resolve(import.meta.dirname, "../.."), encoding: "utf8", windowsHide: true,
      timeout: 10_000, stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("invalid commit");
    return commit;
  } catch {
    throw authorityError("an exact source commit is required");
  }
}

function parseAcknowledgement(args: string[]): void {
  if (args.length !== 2 || args[0] !== "--ack" || args[1] !== MUSIC_UAT_DATABASE_ACK) {
    throw authorityError(`invoke with --ack ${MUSIC_UAT_DATABASE_ACK}`);
  }
}

export async function runUatDatabaseCli(
  args: string[],
  environment: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  parseAcknowledgement(args);
  requireNoForbiddenAmbientAuthority({
    ...environment,
    ...(normalizedEnvironment(environment).has("DATABASE_URL_TEST") ? { DATABASE_URL: "ambient-test-database" } : {}),
  });
  if (Array.from(normalizedEnvironment(environment).keys()).some((key) => key.startsWith("MUSIC_UAT_DATABASE_"))) {
    throw authorityError("ambient UAT database authority is forbidden");
  }
  const npmCli = environment.npm_execpath;
  if (!npmCli) throw authorityError("the invoking npm CLI is required");
  const runId = randomBytes(16).toString("hex");
  const database = `music_uat_${runId}`;
  const commit = readCommit();
  const port = await allocatePort();
  const repositoryRoot = resolve(import.meta.dirname, "../..");
  const passwordFile = prepareFixtureMusicTokenSecret(repositoryRoot);
  const rawReportDirectory = mkdtempSync(join(tmpdir(), "explorers-music-uat-"));
  const rawReportPath = join(rawReportDirectory, "vitest.json");
  try {
    const password = await readSecureMusicSecretFile(passwordFile, { mode: "fixture" });
    let activeChild: ChildProcess | undefined;
    let interrupted = false;
    const interrupt = (signal: NodeJS.Signals) => {
      interrupted = true;
      activeChild?.kill(signal);
    };
    const onSigint = () => interrupt("SIGINT");
    const onSigterm = () => interrupt("SIGTERM");
    process.once("SIGINT", onSigint);
    process.once("SIGTERM", onSigterm);
    try {
      let terminalEnvelope: ReturnType<typeof buildUatEvidenceEnvelope> | undefined;
      const result = await executeOwnedUatEvidence({
        acquire: async () => await startOwnedUatDatabase({ runId, database, commit, port, passwordFile }),
        run: async (authority) => await runUatDatabaseTestChild(
          buildUatDatabaseTestCommand(npmCli, rawReportPath),
          uatDatabaseEnvironment(environment, authority, password),
          {
            setChild: (child) => { activeChild = child; },
            exactSensitiveValues: [password],
          },
        ),
        release: async (authority) => await stopOwnedUatDatabase(authority, {
          dropDatabase: async (owned) => await dropDatabase(owned, password),
        }),
        readRaw: () => readFileSync(rawReportPath, "utf8"),
        buildEnvelope: ({ result: childResult, vitestRaw, cleanup }) => buildUatEvidenceEnvelope({
          runId,
          commit,
          exitCode: interrupted ? 130 : childResult.exitCode,
          childSignal: childResult.signal,
          cleanup,
          vitestRaw,
          root: resolve(repositoryRoot, "tunes"),
        }),
        writeEnvelope: async (envelope) => { terminalEnvelope = envelope; },
      });
      process.stdout.write(`${JSON.stringify({ ...terminalEnvelope, database })}\n`);
      return interrupted ? 130 : result.exitCode;
    } finally {
      process.removeListener("SIGINT", onSigint);
      process.removeListener("SIGTERM", onSigterm);
    }
  } finally {
    rmSync(rawReportDirectory, { recursive: true, force: true });
    cleanupFixtureMusicTokenSecret(repositoryRoot, passwordFile);
  }
}

const directEntry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (directEntry === import.meta.url) {
  runUatDatabaseCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  }).catch(() => {
    process.stderr.write("Task-4 UAT database lane failed; authority details redacted.\n");
    process.exitCode = 1;
  });
}
