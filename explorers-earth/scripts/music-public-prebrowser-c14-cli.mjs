import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { lstatSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createMusicFixtureStateServiceGuard } from "./music-fixture-cleanup.mjs";
import {
  decodeMusicInitialSnapshotResponse,
  musicInitialSnapshotRequestFailure,
  readMusicInitialSnapshotHttpResponse,
  unavailableMusicInitialSnapshotQualification,
  validateMusicInitialSnapshotQualificationRecord,
} from "./music-public-initial-snapshot.mjs";
import {
  MUSIC_PUBLIC_LIVE_AUTHORITY_ARGS,
  MUSIC_PUBLIC_LIVE_FIXTURE_VERSION,
  MUSIC_PUBLIC_LIVE_NAMESPACE_RESET,
  MUSIC_PUBLIC_LIVE_PROJECT,
  buildMusicPublicLiveAuthority,
  validateMusicPublicLiveInvocation,
} from "./music-public-live-authority.mjs";
import {
  MUSIC_PREBROWSER_C14_ACK,
  MUSIC_PREBROWSER_C14_VERSION,
  runMusicPrebrowserC14Integration,
} from "./music-public-prebrowser-c14.mjs";
import {
  unavailableMusicPrebrowserQualification,
  validateMusicPrebrowserQualificationRecord,
} from "./music-public-prebrowser-qualification.mjs";
import {
  boundedSanitizedQualificationOutput,
  captureQualificationFixtureAuthority,
  captureQualificationLifecycleCommand,
} from "./music-public-qualification-artifacts.mjs";

export const MUSIC_PREBROWSER_C14_CLI_VERSION = "explorers-public-prebrowser-c14-cli/v1";
export const MUSIC_PREBROWSER_C14_AUTHORITY_ARGS = Object.freeze([
  "--ack",
  MUSIC_PREBROWSER_C14_ACK,
  "--fixture-version",
  MUSIC_PUBLIC_LIVE_FIXTURE_VERSION,
  "--confirm-project",
  MUSIC_PUBLIC_LIVE_PROJECT,
  "--confirm-namespace-reset",
  MUSIC_PUBLIC_LIVE_NAMESPACE_RESET,
]);

const TERMINAL_MAX_BYTES = 16 * 1024;
const STATE_ORIGIN = "http://127.0.0.1:55174";
const TUNES_ORIGIN = "http://127.0.0.1:55000";
const EXPLORER_ORIGIN = "http://localhost:55173";
const STRAPI_ORIGIN = "http://127.0.0.1:51337";
const C14_RUNTIME_PREFIX = "explorers-c14-";
const C14_FORBIDDEN_KEYS = new Set(["NODE_OPTIONS"]);
const C14_FORBIDDEN_PREFIXES = Object.freeze(["C14_", "MUSIC_C14_", "MUSIC_PREBROWSER_C14_"]);
const STAGES = new Set([
  "preflight", "authority", "bootstrap", "up", "readiness", "initial-snapshot",
  "qualification", "final-restore", "state-stop", "down", "authority-retirement",
  "temp-cleanup", "complete",
]);
const CODES = new Set([
  "none", "argv-refused", "ambient-refused", "invocation-refused", "source-refused",
  "authority-generation-failed", "authority-gate-failed", "fixture-bootstrap-failed",
  "fixture-up-failed", "readiness-failed", "state-service-failed", "initial-snapshot-failed",
  "qualification-failed", "final-restore-failed", "state-stop-failed", "fixture-down-failed",
  "authority-retirement-failed", "temp-cleanup-failed", "unexpected-failure",
]);
const CLEANUP_CODES = new Set([
  "none", "final-restore-failed", "state-stop-failed", "fixture-down-failed",
  "authority-retirement-failed", "temp-cleanup-failed",
]);

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function exactArgs(args) {
  return Array.isArray(args)
    && args.length === MUSIC_PREBROWSER_C14_AUTHORITY_ARGS.length
    && args.every((value, index) => value === MUSIC_PREBROWSER_C14_AUTHORITY_ARGS[index]);
}

function hasForbiddenC14Ambient(environment) {
  if (!environment || typeof environment !== "object" || Array.isArray(environment)) return true;
  return Object.keys(environment).some((rawKey) => {
    const key = rawKey.toUpperCase();
    return C14_FORBIDDEN_KEYS.has(key)
      || C14_FORBIDDEN_PREFIXES.some((prefix) => key.startsWith(prefix));
  });
}

function invocationFailure(args, environment) {
  if (!exactArgs(args)) return "argv-refused";
  if (hasForbiddenC14Ambient(environment)
      || !validateMusicPublicLiveInvocation({ args: MUSIC_PUBLIC_LIVE_AUTHORITY_ARGS, environment })) {
    return "ambient-refused";
  }
  return null;
}

function generatedToken(random, size) {
  const value = random(size);
  if (!(value instanceof Uint8Array) || value.byteLength !== size) {
    throw new Error("C14 authority generation refused");
  }
  return Buffer.from(value).toString("base64url");
}

export function buildMusicPrebrowserC14Authority({ args, environment, randomBytes: random } = {}) {
  if (invocationFailure(args, environment) || typeof random !== "function") {
    throw new Error("C14 invocation refused");
  }
  return buildMusicPublicLiveAuthority({
    args: MUSIC_PUBLIC_LIVE_AUTHORITY_ARGS,
    environment,
    randomBytes: random,
  });
}

function counts() {
  return { graphqlOperations: 0, publicMusicResources: 0, queueSongs: 0 };
}

function unavailableFinalRestore() {
  return { status: "not-run", databaseEqual: false, profileEqual: false };
}

function unavailableCleanup() {
  return {
    status: "not-required",
    code: "none",
    stateServiceStopped: false,
    fixtureDown: false,
    authorityRetired: false,
    tempRemoved: false,
  };
}

function baseRecord({ stage, code, exitCode, runId = null, commit = null }) {
  return {
    schemaVersion: MUSIC_PREBROWSER_C14_CLI_VERSION,
    runId,
    commit,
    result: "failed",
    stage,
    code,
    exitCode,
    initialSnapshotQualification: unavailableMusicInitialSnapshotQualification(),
    qualifier: unavailableMusicPrebrowserQualification(),
    counts: counts(),
    finalRestore: unavailableFinalRestore(),
    cleanup: unavailableCleanup(),
  };
}

function validCounts(value) {
  if (!exactKeys(value, ["graphqlOperations", "publicMusicResources", "queueSongs"])) return false;
  return (value.graphqlOperations === 0 && value.publicMusicResources === 0 && value.queueSongs === 0)
    || (value.graphqlOperations === 20 && value.publicMusicResources === 2 && value.queueSongs === 3);
}

function validFinalRestore(value) {
  return exactKeys(value, ["status", "databaseEqual", "profileEqual"])
    && ["not-run", "passed", "failed"].includes(value.status)
    && typeof value.databaseEqual === "boolean" && typeof value.profileEqual === "boolean"
    && (value.status !== "passed" || (value.databaseEqual && value.profileEqual))
    && (value.status !== "not-run" || (!value.databaseEqual && !value.profileEqual))
    && (value.status !== "failed" || (!value.databaseEqual || !value.profileEqual));
}

function validCleanup(value) {
  return exactKeys(value, [
    "status", "code", "stateServiceStopped", "fixtureDown", "authorityRetired", "tempRemoved",
  ])
    && ["not-required", "passed", "failed"].includes(value.status)
    && CLEANUP_CODES.has(value.code)
    && [value.stateServiceStopped, value.fixtureDown, value.authorityRetired, value.tempRemoved]
      .every((item) => typeof item === "boolean")
    && (value.status === "failed" ? value.code !== "none" : value.code === "none")
    && (value.status !== "not-required"
      || [value.stateServiceStopped, value.fixtureDown, value.authorityRetired, value.tempRemoved]
        .every((item) => item === false));
}

export function validateMusicPrebrowserC14CliRecord(value) {
  if (!exactKeys(value, [
    "schemaVersion", "runId", "commit", "result", "stage", "code", "exitCode",
    "initialSnapshotQualification", "qualifier", "counts", "finalRestore", "cleanup",
  ]) || value.schemaVersion !== MUSIC_PREBROWSER_C14_CLI_VERSION
      || !(value.runId === null || (typeof value.runId === "string" && /^[a-f0-9]{32}$/.test(value.runId)))
      || !(value.commit === null || (typeof value.commit === "string" && /^[a-f0-9]{40}$/.test(value.commit)))
      || !["passed", "failed"].includes(value.result)
      || !STAGES.has(value.stage) || !CODES.has(value.code)
      || ![0, 3, 4, 5].includes(value.exitCode)
      || !validateMusicInitialSnapshotQualificationRecord(value.initialSnapshotQualification)
      || !validateMusicPrebrowserQualificationRecord(value.qualifier)
      || !validCounts(value.counts) || !validFinalRestore(value.finalRestore)
      || !validCleanup(value.cleanup)) return false;
  if (value.result === "passed") {
    return value.stage === "complete" && value.code === "none" && value.exitCode === 0
      && value.runId !== null && value.commit !== null
      && value.initialSnapshotQualification.status === "passed"
      && value.qualifier.status === "passed"
      && value.counts.graphqlOperations === 20
      && value.counts.publicMusicResources === 2
      && value.counts.queueSongs === 3
      && value.finalRestore.status === "passed"
      && value.cleanup.status === "passed"
      && value.cleanup.stateServiceStopped === true
      && value.cleanup.fixtureDown === true
      && value.cleanup.authorityRetired === true
      && value.cleanup.tempRemoved === true;
  }
  return value.exitCode !== 0 && !(value.stage === "complete" && value.code === "none");
}

function comparablePath(value) {
  const exact = path.resolve(value);
  return process.platform === "win32" ? exact.toLowerCase() : exact;
}

export function createMusicPrebrowserC14RuntimeDirectory({ runId }) {
  if (typeof runId !== "string" || !/^[a-f0-9]{32}$/.test(runId)) {
    throw new Error("C14 runtime directory refused");
  }
  const parent = path.resolve(tmpdir());
  const directory = mkdtempSync(path.join(parent, `${C14_RUNTIME_PREFIX}${runId}-`));
  const stat = lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()
      || comparablePath(realpathSync(directory)) !== comparablePath(directory)
      || path.dirname(directory) !== parent) {
    throw new Error("C14 runtime directory refused");
  }
  return {
    directory,
    identity: { dev: stat.dev, ino: stat.ino },
    mutationGuardPath: path.join(directory, "mutation-guard.json"),
    recoveryPath: path.join(directory, "mutation-recovery.private.jsonl"),
  };
}

export function removeMusicPrebrowserC14RuntimeDirectory(runtime) {
  if (!runtime || typeof runtime !== "object" || typeof runtime.directory !== "string"
      || !runtime.identity || typeof runtime.identity !== "object"
      || typeof runtime.identity.dev !== "bigint" || typeof runtime.identity.ino !== "bigint") return false;
  const directory = path.resolve(runtime.directory);
  const parent = path.resolve(tmpdir());
  const basename = path.basename(directory);
  if (path.dirname(directory) !== parent
      || !/^explorers-c14-[a-f0-9]{32}-[A-Za-z0-9_-]+$/.test(basename)) return false;
  let stat;
  try { stat = lstatSync(directory, { bigint: true }); } catch { return false; }
  if (!stat.isDirectory() || stat.isSymbolicLink()
      || stat.dev !== runtime.identity.dev || stat.ino !== runtime.identity.ino
      || comparablePath(realpathSync(directory)) !== comparablePath(directory)) return false;
  try {
    rmSync(directory, { recursive: true, force: false });
    return true;
  } catch {
    return false;
  }
}

function inspectSource({ monorepoRoot }) {
  const run = (args) => spawnSync("git", args, {
    cwd: monorepoRoot,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8 * 1024,
  });
  try {
    const root = run(["rev-parse", "--show-toplevel"]);
    const observedRoot = String(root.stdout ?? "").trim();
    if (root.status !== 0 || comparablePath(observedRoot) !== comparablePath(monorepoRoot)) {
      return { ok: false, commit: null };
    }
    const status = run(["status", "--porcelain=v1", "--untracked-files=all"]);
    if (status.status !== 0 || String(status.stdout ?? "") !== "") return { ok: false, commit: null };
    const revision = run(["rev-parse", "HEAD"]);
    const commit = String(revision.stdout ?? "").trim();
    return revision.status === 0 && /^[a-f0-9]{40}$/.test(commit)
      ? { ok: true, commit }
      : { ok: false, commit: null };
  } catch {
    return { ok: false, commit: null };
  }
}

async function healthyTcp(raw) {
  const endpoint = new URL(raw);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value, socket) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* best effort socket close */ }
      resolve(value);
    };
    const socket = createConnection({ host: endpoint.hostname, port: Number(endpoint.port) }, () => finish(true, socket));
    socket.setTimeout(5_000, () => finish(false, socket));
    socket.once("error", () => finish(false, socket));
  });
}

async function boundedJsonResponse(response) {
  return readMusicInitialSnapshotHttpResponse(response);
}

async function waitForReadiness({ authority, stateServiceFailed, fetchImpl }) {
  for (const healthUrl of authority.healthUrls) {
    if (healthUrl.startsWith(STATE_ORIGIN)) continue;
    if (stateServiceFailed()) return false;
    try {
      if (healthUrl.startsWith("tcp:")) {
        if (!await healthyTcp(healthUrl)) return false;
      } else {
        const response = await fetchImpl(healthUrl, { signal: AbortSignal.timeout(5_000) });
        if (!response.ok) return false;
      }
    } catch { return false; }
  }
  let stateReady = false;
  for (let attempt = 0; attempt < 30 && !stateReady && !stateServiceFailed(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      const response = await fetchImpl(`${STATE_ORIGIN}/health`, {
        headers: { Authorization: `Bearer ${authority.stateToken}` },
        signal: AbortSignal.timeout(1_000),
      });
      stateReady = response.ok;
    } catch { /* bounded retry */ }
  }
  if (!stateReady || stateServiceFailed()) return false;
  try {
    const [accountResponse, identityResponse] = await Promise.all([
      fetchImpl(`${STRAPI_ORIGIN}/api/accounts/${encodeURIComponent(authority.accountDocumentId)}`, {
        headers: { Authorization: `Bearer ${authority.fixtureToken}` }, signal: AbortSignal.timeout(5_000),
      }),
      fetchImpl(`${STRAPI_ORIGIN}/api/users/me`, {
        headers: { Authorization: `Bearer ${authority.fixtureToken}` }, signal: AbortSignal.timeout(5_000),
      }),
    ]);
    const [account, identity] = await Promise.all([
      boundedJsonResponse(accountResponse), boundedJsonResponse(identityResponse),
    ]);
    return account.status === 200 && identity.status === 200
      && account.body?.data?.documentId === authority.accountDocumentId
      && identity.body?.username === authority.username
      && identity.body?.documentId === authority.userDocumentId
      && identity.body?.accounts?.[0]?.documentId === authority.accountDocumentId;
  } catch { return false; }
}

async function captureInitialSnapshot({ authority, fetchImpl }) {
  try {
    const response = await fetchImpl(`${STATE_ORIGIN}/snapshot`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authority.orchestrationToken}` },
      signal: AbortSignal.timeout(60_000),
    });
    const payload = await boundedJsonResponse(response);
    return decodeMusicInitialSnapshotResponse(payload);
  } catch (error) {
    return { ok: false, record: musicInitialSnapshotRequestFailure(error) };
  }
}

async function restoreFinal({ authority, initialSnapshot, fetchImpl }) {
  try {
    const response = await fetchImpl(`${STATE_ORIGIN}/restore-final`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authority.orchestrationToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(initialSnapshot),
      signal: AbortSignal.timeout(60_000),
    });
    const payload = await boundedJsonResponse(response);
    const body = payload.body;
    const databaseEqual = payload.status === 200
      && body?.restored === true
      && body.beforeHash === initialSnapshot.database.dumpHash
      && body.afterHash === initialSnapshot.database.dumpHash;
    const profileEqual = payload.status === 200
      && body?.profileHash === initialSnapshot.profile.profileHash
      && body?.profileRevision === initialSnapshot.profile.profileRevision;
    return { ok: databaseEqual && profileEqual, databaseEqual, profileEqual };
  } catch {
    return { ok: false, databaseEqual: false, profileEqual: false };
  }
}

function createDefaultDependencies({
  environment, monorepoRoot, qualificationRunner = runMusicPrebrowserC14Integration,
}) {
  const npmExecPath = environment.npm_execpath;
  if (typeof npmExecPath !== "string" || npmExecPath.length === 0) return null;
  const lifecycle = ({ stage, authority }) => {
    const captured = captureQualificationLifecycleCommand({
      stage,
      processExecPath: process.execPath,
      npmExecPath,
      cwd: monorepoRoot,
      retainedCwd: "<repository>",
      environment: authority.environment,
      workspaceRoot: monorepoRoot,
      knownSecrets: [authority.fixtureToken, authority.stateToken, authority.orchestrationToken],
      spawn: spawnSync,
    });
    return { status: captured.status };
  };
  return {
    randomBytes,
    inspectSource: () => inspectSource({ monorepoRoot }),
    attestAuthority: ({ phase, authority }) => {
      const captured = captureQualificationFixtureAuthority({
        processExecPath: process.execPath,
        npmExecPath,
        cwd: monorepoRoot,
        retainedCwd: "<repository>",
        environment: authority.environment,
        spawn: spawnSync,
      });
      return {
        ok: captured.status === 0
          && (phase !== "post" || captured.record.attestation?.state === "tombstone"),
      };
    },
    runLifecycle: lifecycle,
    createRuntimeDirectory: createMusicPrebrowserC14RuntimeDirectory,
    startStateService: ({ authority, runtime }) => {
      let failed = false;
      const child = spawn(process.execPath, ["tunes/scripts/music-e2e-state-service.mjs"], {
        cwd: monorepoRoot,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...authority.environment,
          MUSIC_E2E_STATE_TOKEN: authority.stateToken,
          MUSIC_E2E_ORCHESTRATION_STATE_TOKEN: authority.orchestrationToken,
          MUSIC_E2E_RUN_DIRECTORY: runtime.directory,
          MUSIC_E2E_MUTATION_GUARD_PATH: runtime.mutationGuardPath,
          MUSIC_E2E_RECOVERY_ARTIFACT_PATH: runtime.recoveryPath,
        },
        windowsHide: true,
      });
      const guard = createMusicFixtureStateServiceGuard({
        child,
        onFailure: async () => { failed = true; },
      });
      const sanitizeAndDiscardStreams = () => {
        for (const stream of guard.streamInputs()) {
          boundedSanitizedQualificationOutput(Buffer.concat(stream.chunks.map((chunk) => Buffer.from(chunk))), {
            workspaceRoot: monorepoRoot,
            knownSecrets: [authority.fixtureToken, authority.stateToken, authority.orchestrationToken],
            maximumBytes: 4_096,
            forceTruncated: stream.truncated,
          });
        }
      };
      return {
        stop: async () => {
          try { return await guard.stop(); }
          finally { sanitizeAndDiscardStreams(); }
        },
        failed: () => failed,
      };
    },
    waitForReadiness,
    captureInitialSnapshot,
    qualify: ({ authority, initialSnapshot, fetchImpl }) => qualificationRunner({
      ack: MUSIC_PREBROWSER_C14_ACK,
      authority,
      initialSnapshot,
      fetchImpl,
    }),
    restoreFinal,
    removeRuntimeDirectory: removeMusicPrebrowserC14RuntimeDirectory,
    fetchImpl: fetch,
  };
}

function exactDependencyContract(value) {
  return value && typeof value === "object" && [
    "randomBytes", "inspectSource", "attestAuthority", "runLifecycle", "createRuntimeDirectory",
    "startStateService", "waitForReadiness", "captureInitialSnapshot", "qualify", "restoreFinal",
    "removeRuntimeDirectory",
  ].every((key) => typeof value[key] === "function");
}

export async function runMusicPrebrowserC14Cli({
  args = [],
  environment = process.env,
  dependencies,
  qualificationRunner,
  cwd = process.cwd(),
} = {}) {
  const refused = invocationFailure(args, environment);
  if (refused || !(qualificationRunner === undefined || typeof qualificationRunner === "function")) {
    return {
      exitCode: 3,
      record: baseRecord({ stage: "preflight", code: refused ?? "invocation-refused", exitCode: 3 }),
    };
  }
  const explorerRoot = path.resolve(cwd);
  const monorepoRoot = path.resolve(explorerRoot, "..");
  const runtimeDependencies = dependencies ?? createDefaultDependencies({
    environment,
    monorepoRoot,
    qualificationRunner: qualificationRunner ?? runMusicPrebrowserC14Integration,
  });
  if (!runtimeDependencies || !exactDependencyContract(runtimeDependencies)) {
    return {
      exitCode: 3,
      record: baseRecord({ stage: "preflight", code: "invocation-refused", exitCode: 3 }),
    };
  }
  let source;
  try { source = await runtimeDependencies.inspectSource(); }
  catch { source = { ok: false }; }
  if (source?.ok !== true || !/^[a-f0-9]{40}$/.test(String(source.commit))) {
    return { exitCode: 3, record: baseRecord({ stage: "preflight", code: "source-refused", exitCode: 3 }) };
  }

  let derived;
  let stateToken;
  let orchestrationToken;
  try {
    derived = buildMusicPrebrowserC14Authority({
      args,
      environment,
      randomBytes: runtimeDependencies.randomBytes,
    });
    stateToken = generatedToken(runtimeDependencies.randomBytes, 32);
    orchestrationToken = generatedToken(runtimeDependencies.randomBytes, 32);
    if (new Set([derived.fixtureToken, stateToken, orchestrationToken]).size !== 3) {
      throw new Error("C14 authority generation refused");
    }
  } catch {
    const record = baseRecord({
      stage: "authority", code: "authority-generation-failed", exitCode: 4,
      commit: source.commit,
    });
    return { exitCode: 4, record };
  }
  const authority = {
    ...derived,
    stateOrigin: STATE_ORIGIN,
    tunesOrigin: TUNES_ORIGIN,
    explorerOrigin: EXPLORER_ORIGIN,
    strapiOrigin: STRAPI_ORIGIN,
    stateToken,
    orchestrationToken,
    environment: {
      ...environment,
      ...derived.environment,
      MUSIC_E2E_STATE_TOKEN: stateToken,
      MUSIC_E2E_ORCHESTRATION_STATE_TOKEN: orchestrationToken,
    },
  };
  const qualificationAuthority = Object.freeze({
    stateOrigin: STATE_ORIGIN,
    tunesOrigin: TUNES_ORIGIN,
    explorerOrigin: EXPLORER_ORIGIN,
    strapiOrigin: STRAPI_ORIGIN,
    stateToken,
    orchestrationToken,
    fixtureToken: derived.fixtureToken,
    namespace: derived.namespace,
    username: derived.username,
    accountDocumentId: derived.accountDocumentId,
    userDocumentId: derived.userDocumentId,
  });
  const record = baseRecord({
    stage: "authority", code: "unexpected-failure", exitCode: 4,
    runId: derived.runId, commit: source.commit,
  });
  let primaryFailure = null;
  let cleanupFailure = null;
  let lifecycleAttempted = false;
  let runtime;
  let stateService;
  let initialSnapshot;
  let cleanupAttempted = false;
  let activeFailure = { stage: "authority", code: "authority-gate-failed" };
  let finalized;
  const STOP = Symbol("C14_STOP");

  const failPrimary = (stage, code) => { if (!primaryFailure) primaryFailure = { stage, code }; };
  const failCleanup = (stage, code) => { if (!cleanupFailure) cleanupFailure = { stage, code }; };
  const stopPrimary = (stage, code) => {
    failPrimary(stage, code);
    throw STOP;
  };

  try {
    activeFailure = { stage: "authority", code: "authority-gate-failed" };
    const preAuthority = await runtimeDependencies.attestAuthority({ phase: "pre", authority });
    if (preAuthority?.ok !== true) stopPrimary("authority", "authority-gate-failed");
    lifecycleAttempted = true;
    activeFailure = { stage: "bootstrap", code: "fixture-bootstrap-failed" };
    const bootstrap = await runtimeDependencies.runLifecycle({ stage: "fixture-bootstrap", authority });
    if (bootstrap?.status !== 0) stopPrimary("bootstrap", "fixture-bootstrap-failed");
    activeFailure = { stage: "up", code: "fixture-up-failed" };
    const up = await runtimeDependencies.runLifecycle({ stage: "fixture-up", authority });
    if (up?.status !== 0) stopPrimary("up", "fixture-up-failed");
    activeFailure = { stage: "readiness", code: "state-service-failed" };
    runtime = await runtimeDependencies.createRuntimeDirectory({ runId: derived.runId });
    stateService = await runtimeDependencies.startStateService({ authority, runtime });
    const stateServiceFailed = typeof stateService?.failed === "function" ? stateService.failed : () => false;
    activeFailure = { stage: "readiness", code: "readiness-failed" };
    const ready = await runtimeDependencies.waitForReadiness({
      authority,
      stateServiceFailed,
      fetchImpl: runtimeDependencies.fetchImpl ?? fetch,
    });
    if (ready !== true) stopPrimary("readiness", "readiness-failed");
    activeFailure = { stage: "initial-snapshot", code: "initial-snapshot-failed" };
    const captured = await runtimeDependencies.captureInitialSnapshot({
      authority: qualificationAuthority,
      fetchImpl: runtimeDependencies.fetchImpl ?? fetch,
    });
    if (validateMusicInitialSnapshotQualificationRecord(captured?.record)) {
      record.initialSnapshotQualification = captured.record;
    }
    if (captured?.ok !== true || !captured.snapshot
        || record.initialSnapshotQualification.status !== "passed") {
      stopPrimary("initial-snapshot", "initial-snapshot-failed");
    }
    initialSnapshot = captured.snapshot;
    activeFailure = { stage: "qualification", code: "qualification-failed" };
    const qualified = await runtimeDependencies.qualify({
      authority: qualificationAuthority,
      initialSnapshot,
      fetchImpl: runtimeDependencies.fetchImpl ?? fetch,
    });
    if (validateMusicPrebrowserQualificationRecord(qualified?.qualification)) {
      record.qualifier = qualified.qualification;
    }
    if (qualified?.status === "passed"
        && qualified?.schemaVersion === MUSIC_PREBROWSER_C14_VERSION
        && qualified.counts?.graphqlOperations === 20
        && qualified.counts?.publicMusicResources === 2
        && qualified.counts?.queueSongs === 3
        && record.qualifier.status === "passed") {
      record.counts = { graphqlOperations: 20, publicMusicResources: 2, queueSongs: 3 };
    } else {
      stopPrimary("qualification", "qualification-failed");
    }
  } catch (error) {
    if (error !== STOP) failPrimary(activeFailure.stage, activeFailure.code);
  } finally {
    // Cleanup is deliberately complete and chronological. No failure prevents a
    // later owner retirement, fixture down, authority re-attestation, or temp removal.
    finalized = await finalize();
  }
  return finalized;

  async function finalize() {
    if (initialSnapshot) {
      cleanupAttempted = true;
      try {
        const restored = await runtimeDependencies.restoreFinal({
          authority: qualificationAuthority,
          initialSnapshot,
          fetchImpl: runtimeDependencies.fetchImpl ?? fetch,
        });
        const ok = restored?.ok === true && restored.databaseEqual === true && restored.profileEqual === true;
        record.finalRestore = {
          status: ok ? "passed" : "failed",
          databaseEqual: restored?.databaseEqual === true,
          profileEqual: restored?.profileEqual === true,
        };
        if (!ok) failCleanup("final-restore", "final-restore-failed");
      } catch {
        record.finalRestore = { status: "failed", databaseEqual: false, profileEqual: false };
        failCleanup("final-restore", "final-restore-failed");
      }
    }
    if (stateService) {
      cleanupAttempted = true;
      try {
        await stateService.stop();
        record.cleanup.stateServiceStopped = true;
      } catch { failCleanup("state-stop", "state-stop-failed"); }
    }
    if (lifecycleAttempted) {
      cleanupAttempted = true;
      try {
        const down = await runtimeDependencies.runLifecycle({ stage: "fixture-down", authority });
        record.cleanup.fixtureDown = down?.status === 0;
        if (!record.cleanup.fixtureDown) failCleanup("down", "fixture-down-failed");
      } catch { failCleanup("down", "fixture-down-failed"); }
      try {
        const retired = await runtimeDependencies.attestAuthority({ phase: "post", authority });
        record.cleanup.authorityRetired = retired?.ok === true;
        if (!record.cleanup.authorityRetired) {
          failCleanup("authority-retirement", "authority-retirement-failed");
        }
      } catch { failCleanup("authority-retirement", "authority-retirement-failed"); }
    }
    if (runtime) {
      cleanupAttempted = true;
      try {
        record.cleanup.tempRemoved = await runtimeDependencies.removeRuntimeDirectory(runtime) === true;
        if (!record.cleanup.tempRemoved) failCleanup("temp-cleanup", "temp-cleanup-failed");
      } catch { failCleanup("temp-cleanup", "temp-cleanup-failed"); }
    }

    record.cleanup.status = cleanupFailure ? "failed" : (cleanupAttempted ? "passed" : "not-required");
    record.cleanup.code = cleanupFailure?.code ?? "none";
    if (cleanupFailure) {
      record.result = "failed";
      record.stage = cleanupFailure.stage;
      record.code = cleanupFailure.code;
      record.exitCode = 5;
    } else if (primaryFailure) {
      record.result = "failed";
      record.stage = primaryFailure.stage;
      record.code = primaryFailure.code;
      record.exitCode = 4;
    } else {
      record.result = "passed";
      record.stage = "complete";
      record.code = "none";
      record.exitCode = 0;
    }
    if (!validateMusicPrebrowserC14CliRecord(record)) {
      const fallback = baseRecord({
        stage: "preflight", code: "unexpected-failure", exitCode: 5,
        runId: derived.runId, commit: source.commit,
      });
      return { exitCode: 5, record: fallback };
    }
    return { exitCode: record.exitCode, record };
  }
}

async function main() {
  let outcome;
  try {
    outcome = await runMusicPrebrowserC14Cli({ args: process.argv.slice(2), environment: process.env });
  } catch {
    outcome = {
      exitCode: 5,
      record: baseRecord({ stage: "preflight", code: "unexpected-failure", exitCode: 5 }),
    };
  }
  let line = JSON.stringify(outcome.record);
  if (!validateMusicPrebrowserC14CliRecord(outcome.record)
      || Buffer.byteLength(line) > TERMINAL_MAX_BYTES) {
    outcome = {
      exitCode: 5,
      record: baseRecord({ stage: "preflight", code: "unexpected-failure", exitCode: 5 }),
    };
    line = JSON.stringify(outcome.record);
  }
  process.stdout.write(`${line}\n`);
  process.exitCode = outcome.exitCode;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
