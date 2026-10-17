import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  realpathSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
  type BigIntStats,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";

const C10_KEYS = [
  "MUSIC_C10_ISOLATED_DOCKER_ACK",
  "MUSIC_C10_ISOLATED_DOCKER_SCRIPT",
  "MUSIC_C10_ISOLATED_NPM_EXECPATH",
] as const;

const SCRUBBED_KEYS = new Set([
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "GATE_PROD",
  "MUSIC_DEPLOY_PRODUCTION",
  "MUSIC_DEPLOY_PROD",
]);

const COMPOSE_PREFIX = [
  "compose", "-p", "explorers-music-fixture",
  "-f", "docker-compose.music-test.yml",
] as const;
const INFO_ARGS = ["info"];
const CONFIG_ARGS = [...COMPOSE_PREFIX, "config", "--format", "json"];
const PS_ARGS = [...COMPOSE_PREFIX, "ps", "-a", "-q"];
const TRACE_BYTE_LIMIT = 65_536;
const TRACE_LINE_LIMIT = 256;

export type MusicCliContractDockerTraceEvent =
  | { kind: "info" | "compose-config" | "compose-ps"; args: string[] }
  | { kind: "blocked"; argumentCount: number };

export interface MusicCliContractAuthority {
  readonly authorityRoot: string;
  readonly dockerDirectory: string;
  readonly dockerScript: string;
  readonly npmScript: string;
  readonly dockerTrace: string;
  readonly environment: Readonly<NodeJS.ProcessEnv>;
  readonly owned: boolean;
}

export interface MusicCliContractAuthorityLease {
  readonly authority: MusicCliContractAuthority;
  dispose(): void;
}

export type MusicCliContractSetupWriteFile = (
  path: string,
  data: string,
  options: { flag: "wx"; mode: number },
  write: (writeBytes?: (descriptor: number, data: string) => void) => void,
) => void;

export type MusicCliContractAuthorityRequest = {
  environment: NodeJS.ProcessEnv;
  composeModel: string;
  setupWriteFile?: MusicCliContractSetupWriteFile;
} & (
  | { mode: "borrow-or-create"; authorityRoot?: never }
  | { mode: "fresh"; authorityRoot: string }
);

interface CreatedIdentity {
  path: string;
  resolvedPath: string;
  kind: "directory" | "file";
  dev: bigint;
  ino: bigint;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function matchingAuthorityKeys(environment: NodeJS.ProcessEnv): string[] {
  const canonicalLower = new Set(C10_KEYS.map((key) => key.toLowerCase()));
  return Object.keys(environment).filter((key) => canonicalLower.has(key.toLowerCase()));
}

export function classifyMusicCliContractAuthorityPresence(
  environment: NodeJS.ProcessEnv,
): "absent" | "complete" {
  const matching = matchingAuthorityKeys(environment);
  if (matching.some((key) => !C10_KEYS.includes(key as typeof C10_KEYS[number]))) {
    throw new Error("music CLI contract authority key casing is ambiguous");
  }
  const present = C10_KEYS.filter((key) => Object.hasOwn(environment, key));
  if (present.length === 0) return "absent";
  if (present.length !== C10_KEYS.length) throw new Error("music CLI contract authority is partial");
  if (present.some((key) => typeof environment[key] !== "string" || environment[key]!.length === 0)) {
    throw new Error("music CLI contract authority is empty");
  }
  return "complete";
}

function scrubEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const scrubbed = { ...environment };
  for (const key of Object.keys(scrubbed)) {
    if (SCRUBBED_KEYS.has(key.toUpperCase())) delete scrubbed[key];
  }
  return scrubbed;
}

function assertRegularFile(path: string): void {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("music CLI contract authority is hostile");
}

function validateAuthorityPaths(dockerScript: string, npmScript?: string): {
  authorityRoot: string;
  dockerDirectory: string;
  dockerTrace: string;
} {
  const realTemporaryRoot = realpathSync(tmpdir());
  const resolvedDockerScript = resolve(dockerScript);
  const dockerDirectory = dirname(resolvedDockerScript);
  const authorityRoot = dirname(dockerDirectory);
  const segments = relative(realTemporaryRoot, resolvedDockerScript).split(/[\\/]/);
  if (dirname(authorityRoot) !== realTemporaryRoot
      || !basename(authorityRoot).startsWith("music-c10-cli-contract-")
      || segments.length !== 3
      || segments[0] !== basename(authorityRoot)
      || segments[1] !== "fake-docker"
      || segments[2] !== "fake-docker.cjs"
      || resolvedDockerScript !== join(dockerDirectory, "fake-docker.cjs")) {
    throw new Error("music CLI contract authority is hostile");
  }
  const dockerTrace = join(dockerDirectory, "docker-calls.jsonl");
  try {
    const rootStat = lstatSync(authorityRoot);
    const directoryStat = lstatSync(dockerDirectory);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()
        || !directoryStat.isDirectory() || directoryStat.isSymbolicLink()
        || realpathSync(authorityRoot) !== authorityRoot
        || realpathSync(dockerDirectory) !== dockerDirectory) {
      throw new Error("music CLI contract authority is hostile");
    }
    assertRegularFile(resolvedDockerScript);
    if (npmScript !== undefined) {
      const resolvedNpmScript = resolve(npmScript);
      const npmSegments = relative(realTemporaryRoot, resolvedNpmScript).split(/[\\/]/);
      if (!arraysEqual(npmSegments, [basename(authorityRoot), "fake-docker", "fake-npm.cjs"])
          || resolvedNpmScript !== join(dockerDirectory, "fake-npm.cjs")) {
        throw new Error("music CLI contract authority is hostile");
      }
      assertRegularFile(resolvedNpmScript);
    }
    assertRegularFile(dockerTrace);
    assertRegularFile(join(dockerDirectory, "compose-model.json"));
  } catch {
    throw new Error("music CLI contract authority is hostile");
  }
  return { authorityRoot, dockerDirectory, dockerTrace };
}

function borrowedAuthority(environment: NodeJS.ProcessEnv): MusicCliContractAuthorityLease {
  if (environment.MUSIC_C10_ISOLATED_DOCKER_ACK !== "C10_MUTATION_BLOCKED") {
    throw new Error("music CLI contract authority is hostile");
  }
  const dockerScript = environment.MUSIC_C10_ISOLATED_DOCKER_SCRIPT!;
  const npmScript = environment.MUSIC_C10_ISOLATED_NPM_EXECPATH!;
  const paths = validateAuthorityPaths(dockerScript, npmScript);
  const authority: MusicCliContractAuthority = {
    ...paths,
    dockerScript: resolve(dockerScript),
    npmScript: resolve(npmScript),
    environment: scrubEnvironment(environment),
    owned: false,
  };
  return { authority, dispose() {} };
}

function validateComposeModelText(composeModel: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(composeModel);
  } catch {
    throw new Error("music CLI contract Compose model is invalid");
  }
  if (!isRecord(parsed) || !isRecord(parsed.services)) {
    throw new Error("music CLI contract Compose model is invalid");
  }
}

function captureIdentity(path: string, kind: CreatedIdentity["kind"]): CreatedIdentity {
  const stat = lstatSync(path, { bigint: true });
  const correctType = kind === "directory" ? stat.isDirectory() : stat.isFile();
  if (!correctType || stat.isSymbolicLink()) throw new Error("music CLI contract authority setup target is invalid");
  return { path, resolvedPath: realpathSync(path), kind, dev: stat.dev, ino: stat.ino };
}

function sameIdentity(identity: CreatedIdentity, stat: BigIntStats): boolean {
  const correctType = identity.kind === "directory" ? stat.isDirectory() : stat.isFile();
  return correctType && !stat.isSymbolicLink() && identity.dev === stat.dev && identity.ino === stat.ino;
}

function unsafeCleanup(): never {
  throw new Error("unsafe music CLI contract authority cleanup target");
}

function cleanupCreated(records: readonly CreatedIdentity[], fakeDirectory: string, authorityRoot: string, removeRoot: boolean): void {
  for (const record of records) {
    if (!existsSync(record.path)) unsafeCleanup();
    const stat = lstatSync(record.path, { bigint: true });
    if (!sameIdentity(record, stat) || realpathSync(record.path) !== record.resolvedPath) unsafeCleanup();
  }
  const recordedFiles = records.filter((record) => record.kind === "file").map((record) => basename(record.path)).sort();
  const fakeDirectoryRecorded = records.some((record) => record.kind === "directory" && record.path === fakeDirectory);
  if (fakeDirectoryRecorded && !arraysEqual(readdirSync(fakeDirectory).sort(), recordedFiles)) unsafeCleanup();
  if (!fakeDirectoryRecorded && existsSync(fakeDirectory)) unsafeCleanup();
  if (removeRoot) {
    const expectedRootEntries = fakeDirectoryRecorded ? [basename(fakeDirectory)] : [];
    if (!arraysEqual(readdirSync(authorityRoot).sort(), expectedRootEntries)) unsafeCleanup();
  }
  for (const record of [...records].reverse()) {
    if (record.kind === "file") unlinkSync(record.path);
  }
  if (fakeDirectoryRecorded) rmdirSync(fakeDirectory);
  if (removeRoot) rmdirSync(authorityRoot);
}

function performSetupWrite(
  path: string,
  data: string,
  options: { flag: "wx"; mode: number },
  setupWriteFile: MusicCliContractSetupWriteFile,
  records: CreatedIdentity[],
): void {
  if (existsSync(path)) throw new Error("music CLI contract authority setup target already exists");
  const write = (writeBytes = (descriptor: number, contents: string) => writeFileSync(descriptor, contents)): void => {
    const descriptor = openSync(path, options.flag, options.mode);
    try {
      const stat = fstatSync(descriptor, { bigint: true });
      if (!stat.isFile()) throw new Error("music CLI contract authority setup target is invalid");
      records.push({ path, resolvedPath: resolve(path), kind: "file", dev: stat.dev, ino: stat.ino });
      writeBytes(descriptor, data);
    } finally {
      closeSync(descriptor);
    }
  };
  setupWriteFile(path, data, options, write);
}

function createAuthority(input: MusicCliContractAuthorityRequest): MusicCliContractAuthorityLease {
  validateComposeModelText(input.composeModel);
  const realTemporaryRoot = realpathSync(tmpdir());
  const createdRoot = input.mode === "borrow-or-create";
  const authorityRoot = createdRoot
    ? mkdtempSync(join(realTemporaryRoot, "music-c10-cli-contract-"))
    : resolve(input.authorityRoot);
  const records: CreatedIdentity[] = [];
  if (createdRoot) records.push(captureIdentity(authorityRoot, "directory"));
  else {
    const stat = lstatSync(authorityRoot);
    if (dirname(authorityRoot) !== realTemporaryRoot
        || !basename(authorityRoot).startsWith("music-c10-cli-contract-")
        || !stat.isDirectory() || stat.isSymbolicLink()
        || realpathSync(authorityRoot) !== authorityRoot) {
      throw new Error("music CLI contract authority is hostile");
    }
  }

  const dockerDirectory = join(authorityRoot, "fake-docker");
  const composeModelPath = join(dockerDirectory, "compose-model.json");
  const dockerTrace = join(dockerDirectory, "docker-calls.jsonl");
  const dockerScript = join(dockerDirectory, "fake-docker.cjs");
  const npmScript = join(dockerDirectory, "fake-npm.cjs");
  const setupWriteFile = input.setupWriteFile ?? ((_path, _data, _options, write) => write());
  try {
    mkdirSync(dockerDirectory, { recursive: false, mode: 0o700 });
    records.push(captureIdentity(dockerDirectory, "directory"));
    performSetupWrite(composeModelPath, input.composeModel, { flag: "wx", mode: 0o600 }, setupWriteFile, records);
    performSetupWrite(dockerTrace, "", { flag: "wx", mode: 0o600 }, setupWriteFile, records);

    const dockerScriptSource = `const { appendFileSync, closeSync, openSync, readFileSync, readSync } = require("node:fs");
const args = process.argv.slice(2);
const exact = JSON.stringify(args);
const info = JSON.stringify(["info"]);
const config = JSON.stringify(["compose", "-p", "explorers-music-fixture", "-f", "docker-compose.music-test.yml", "config", "--format", "json"]);
const ps = JSON.stringify(["compose", "-p", "explorers-music-fixture", "-f", "docker-compose.music-test.yml", "ps", "-a", "-q"]);
const event = exact === info
  ? { kind: "info", args }
  : exact === config
    ? { kind: "compose-config", args }
    : exact === ps
      ? { kind: "compose-ps", args }
      : { kind: "blocked", argumentCount: args.length };
const encoded = Buffer.from(JSON.stringify(event) + "\\n", "utf8");
const traceDescriptor = openSync(${JSON.stringify(dockerTrace)}, "r");
const boundedTrace = Buffer.alloc(65537);
let bytesRead = 0;
try {
  while (bytesRead < boundedTrace.length) {
    const count = readSync(traceDescriptor, boundedTrace, bytesRead, boundedTrace.length - bytesRead, bytesRead);
    if (count === 0) break;
    bytesRead += count;
  }
} finally {
  closeSync(traceDescriptor);
}
if (bytesRead > 65536) {
  process.stderr.write("fixture Docker trace bound exceeded\\n");
  process.exit(71);
}
const existing = boundedTrace.subarray(0, bytesRead);
const existingLines = existing.length === 0
  ? 0
  : existing.toString("utf8").split(/\\r?\\n/).filter(Boolean).length;
if (existing.length + encoded.length > 65536 || existingLines + 1 > 256) {
  process.stderr.write("fixture Docker trace bound exceeded\\n");
  process.exit(71);
}
appendFileSync(${JSON.stringify(dockerTrace)}, encoded);
if (event.kind === "info") {
  process.stdout.write("{}\\n");
  process.exit(0);
}
if (event.kind === "compose-config") {
  process.stdout.write(readFileSync(${JSON.stringify(composeModelPath)}, "utf8"));
  process.exit(0);
}
if (event.kind === "compose-ps") process.exit(0);
process.stderr.write("fixture Docker mutation blocked\\n");
process.exit(70);
`;
    performSetupWrite(dockerScript, dockerScriptSource, { flag: "wx", mode: 0o700 }, setupWriteFile, records);
    const npmScriptSource = `const args = process.argv.slice(2);
if (JSON.stringify(args) === JSON.stringify(["--version"])) {
  process.stdout.write("10.0.0\\n");
  process.exit(0);
}
if (JSON.stringify(args) === JSON.stringify([
  "exec", "--silent", "--prefix", "tunes", "--", "tsx", "tunes/scripts/music-smoke.ts",
])) {
  process.stdout.write("SESSION_SECRET=hostile-child-secret C:\\\\Users\\\\fixture\\\\private\\n");
  process.stderr.write("Bearer hostile-child-token\\n");
  process.exit(1);
}
process.stderr.write("fixture npm mutation blocked\\n");
process.exit(70);
`;
    performSetupWrite(npmScript, npmScriptSource, { flag: "wx", mode: 0o700 }, setupWriteFile, records);
  } catch (error) {
    try {
      cleanupCreated(records, dockerDirectory, authorityRoot, createdRoot);
    } catch {
      unsafeCleanup();
    }
    throw error;
  }

  const environment = scrubEnvironment(input.environment);
  environment.MUSIC_C10_ISOLATED_DOCKER_ACK = "C10_MUTATION_BLOCKED";
  environment.MUSIC_C10_ISOLATED_DOCKER_SCRIPT = dockerScript;
  environment.MUSIC_C10_ISOLATED_NPM_EXECPATH = npmScript;
  const authority: MusicCliContractAuthority = {
    authorityRoot, dockerDirectory, dockerScript, npmScript, dockerTrace, environment, owned: true,
  };
  let disposed = false;
  return {
    authority,
    dispose() {
      if (disposed) return;
      cleanupCreated(records, dockerDirectory, authorityRoot, createdRoot);
      disposed = true;
    },
  };
}

export function acquireMusicCliContractAuthority(
  input: MusicCliContractAuthorityRequest,
): MusicCliContractAuthorityLease {
  const presence = classifyMusicCliContractAuthorityPresence(input.environment);
  if (input.mode === "fresh") {
    if (presence !== "absent") throw new Error("fresh music CLI contract authority forbids inherited authority");
    return createAuthority(input);
  }
  if (presence === "complete") return borrowedAuthority(input.environment);
  return createAuthority(input);
}

export function musicCliContractChildEnvironment(
  authority: MusicCliContractAuthority,
  overrides?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  if (overrides !== undefined) {
    const presence = classifyMusicCliContractAuthorityPresence(overrides);
    if (presence === "complete" && C10_KEYS.some((key) => overrides[key] !== authority.environment[key])) {
      throw new Error("music CLI contract authority override does not match lease");
    }
  }
  const environment = scrubEnvironment({ ...authority.environment, ...(overrides ?? {}) });
  environment.MUSIC_C10_ISOLATED_DOCKER_ACK = "C10_MUTATION_BLOCKED";
  environment.MUSIC_C10_ISOLATED_DOCKER_SCRIPT = authority.dockerScript;
  if (overrides !== undefined
      && Object.hasOwn(overrides, "npm_execpath")
      && typeof overrides.npm_execpath === "string"
      && overrides.npm_execpath.length > 0) {
    delete environment.MUSIC_C10_ISOLATED_NPM_EXECPATH;
  } else {
    environment.MUSIC_C10_ISOLATED_NPM_EXECPATH = authority.npmScript;
  }
  assertMusicCliContractDockerEnvironment(environment);
  return environment;
}

export function assertMusicCliContractDockerEnvironment(environment: NodeJS.ProcessEnv): void {
  const matching = matchingAuthorityKeys(environment);
  if (matching.some((key) => !C10_KEYS.includes(key as typeof C10_KEYS[number]))) {
    throw new Error("music CLI contract Docker authority is incomplete");
  }
  if (!Object.hasOwn(environment, "MUSIC_C10_ISOLATED_DOCKER_ACK")
      || !Object.hasOwn(environment, "MUSIC_C10_ISOLATED_DOCKER_SCRIPT")
      || environment.MUSIC_C10_ISOLATED_DOCKER_ACK !== "C10_MUTATION_BLOCKED"
      || typeof environment.MUSIC_C10_ISOLATED_DOCKER_SCRIPT !== "string"
      || environment.MUSIC_C10_ISOLATED_DOCKER_SCRIPT.length === 0) {
    throw new Error("music CLI contract Docker authority is incomplete");
  }
  validateAuthorityPaths(
    environment.MUSIC_C10_ISOLATED_DOCKER_SCRIPT,
    typeof environment.MUSIC_C10_ISOLATED_NPM_EXECPATH === "string"
      ? environment.MUSIC_C10_ISOLATED_NPM_EXECPATH
      : undefined,
  );
  if (Object.keys(environment).some((key) => SCRUBBED_KEYS.has(key.toUpperCase()))) {
    throw new Error("music CLI contract Docker authority has forbidden selectors");
  }
}

function parseTraceEvent(line: string): MusicCliContractDockerTraceEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error("music CLI contract Docker trace is invalid");
  }
  if (!isRecord(parsed) || typeof parsed.kind !== "string") {
    throw new Error("music CLI contract Docker trace is invalid");
  }
  if (parsed.kind === "blocked") {
    if (!exactKeys(parsed, ["argumentCount", "kind"])
        || typeof parsed.argumentCount !== "number"
        || !Number.isInteger(parsed.argumentCount)
        || parsed.argumentCount < 0) {
      throw new Error("music CLI contract Docker trace is invalid");
    }
    return { kind: "blocked", argumentCount: parsed.argumentCount };
  }
  if (parsed.kind !== "info" && parsed.kind !== "compose-config" && parsed.kind !== "compose-ps") {
    throw new Error("music CLI contract Docker trace is invalid");
  }
  const expected = parsed.kind === "info" ? INFO_ARGS : parsed.kind === "compose-config" ? CONFIG_ARGS : PS_ARGS;
  if (!exactKeys(parsed, ["args", "kind"])
      || !Array.isArray(parsed.args)
      || !parsed.args.every((value) => typeof value === "string")
      || !arraysEqual(parsed.args, expected)) {
    throw new Error("music CLI contract Docker trace is invalid");
  }
  return { kind: parsed.kind, args: [...parsed.args] };
}

export function readMusicCliContractDockerTrace(path: string): MusicCliContractDockerTraceEvent[] {
  const descriptor = openSync(path, "r");
  const buffer = Buffer.alloc(TRACE_BYTE_LIMIT + 1);
  let bytesRead = 0;
  try {
    while (bytesRead < buffer.length) {
      const count = readSync(descriptor, buffer, bytesRead, buffer.length - bytesRead, bytesRead);
      if (count === 0) break;
      bytesRead += count;
    }
  } finally {
    closeSync(descriptor);
  }
  if (bytesRead > TRACE_BYTE_LIMIT) throw new Error("music CLI contract Docker trace bound exceeded");
  const text = buffer.subarray(0, bytesRead).toString("utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length > TRACE_LINE_LIMIT) throw new Error("music CLI contract Docker trace bound exceeded");
  return lines.map(parseTraceEvent);
}

export function createDeterministicMusicCliContractComposeModel(repositoryRoot: string): string {
  const labels = {
    "com.docker.compose.project": "explorers-music-fixture",
    "com.explorers.music.fixture": "true",
    "com.explorers.music.project": "explorers-music-fixture",
  };
  return JSON.stringify({
    name: "explorers-music-fixture",
    services: {
      postgres: { image: "postgres:15-alpine", labels, environment: { POSTGRES_PASSWORD: "music" } },
      strapi: { image: "node:22.12-alpine", labels, environment: { MUSIC_FIXTURE_TOKEN: "fixture-read-only-token" } },
      tunes: { build: { context: join(repositoryRoot, "tunes"), dockerfile: "Dockerfile" }, labels },
      explorers: { build: { context: repositoryRoot, dockerfile: "explorers-earth/Dockerfile.music-fixture" }, labels },
    },
    networks: { default: { labels } },
    volumes: { database: { labels } },
  });
}
