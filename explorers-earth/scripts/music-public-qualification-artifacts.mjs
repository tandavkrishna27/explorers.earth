import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildSanitizedJourneyOutcomeLedger,
  validateSanitizedJourneyOutcomeLedger,
} from "./music-public-live-preflight.mjs";
import { validateMusicPrebrowserQualificationRecord } from "./music-public-prebrowser-qualification.mjs";
import { validateMusicInitialSnapshotQualificationRecord } from "./music-public-initial-snapshot.mjs";
import { validateMusicMutationGuardRecord } from "../../tunes/scripts/music-e2e-mutation-guard.mjs";

const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SCHEMA_VERSION = "explorers-public-qualification-artifacts/v1";
const MANIFEST_NAME = "manifest.json";
const SIDECAR_NAME = "manifest.sha256";
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_SANITIZER_INPUT_BYTES = 256 * 1024;
const MAX_LEDGER_BYTES = 64 * 1024;
const ANALYTICS_LEDGER_VERSION = "explorers-public-analytics-ledger/v1";
const VISUAL_TRACE_LEDGER_VERSION = "explorers-public-visual-trace-ledger/v1";
const LIFECYCLE_COMMANDS = Object.freeze({
  "fixture-bootstrap": Object.freeze(["npm", "run", "--silent", "music-cli", "--", "bootstrap"]),
  "fixture-up": Object.freeze(["npm", "run", "--silent", "music-cli", "--", "up", "--detach", "--wait"]),
  "fixture-down": Object.freeze([
    "npm", "run", "--silent", "music-cli", "--", "down",
    "--volumes", "--mode", "fixture", "--confirm-project", "explorers-music-fixture",
  ]),
});
const FIXTURE_AUTHORITY_COMMAND = Object.freeze([
  "npm", "run", "--silent", "music:fixture:authority:attest",
]);
const SAFE_UTM_KEYS = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]);
const ANALYTICS_UNAVAILABLE_REASONS = new Set(["preflight-stopped", "execution-stopped", "not-observed"]);
const DOCKER_INSPECTION_COMMANDS = Object.freeze({
  containers: Object.freeze([
    "docker", "ps", "-aq",
    "--filter", "label=com.explorers.music.fixture=true",
    "--filter", "label=com.explorers.music.project=explorers-music-fixture",
  ]),
  volumes: Object.freeze([
    "docker", "volume", "ls", "-q",
    "--filter", "label=com.explorers.music.fixture=true",
    "--filter", "label=com.explorers.music.project=explorers-music-fixture",
  ]),
});

export const LIVE_QUALIFICATION_STREAM_ARTIFACTS = Object.freeze([
  Object.freeze({ role: "fixture-bootstrap-stdout", path: "logs/fixture-bootstrap.stdout.log", source: "fixture-bootstrap", stream: "stdout" }),
  Object.freeze({ role: "fixture-bootstrap-stderr", path: "logs/fixture-bootstrap.stderr.log", source: "fixture-bootstrap", stream: "stderr" }),
  Object.freeze({ role: "fixture-up-stdout", path: "logs/fixture-up.stdout.log", source: "fixture-up", stream: "stdout" }),
  Object.freeze({ role: "fixture-up-stderr", path: "logs/fixture-up.stderr.log", source: "fixture-up", stream: "stderr" }),
  Object.freeze({ role: "fixture-down-stdout", path: "logs/fixture-down.stdout.log", source: "fixture-down", stream: "stdout" }),
  Object.freeze({ role: "fixture-down-stderr", path: "logs/fixture-down.stderr.log", source: "fixture-down", stream: "stderr" }),
  Object.freeze({ role: "state-service-stdout", path: "logs/state-service.stdout.log", source: "state-service", stream: "stdout" }),
  Object.freeze({ role: "state-service-stderr", path: "logs/state-service.stderr.log", source: "state-service", stream: "stderr" }),
]);

export const LIVE_QUALIFICATION_REQUIRED_ARTIFACTS = Object.freeze([
  ...LIVE_QUALIFICATION_STREAM_ARTIFACTS.map(({ role, path: relativePath }) => Object.freeze({ role, path: relativePath })),
  Object.freeze({ role: "fixture-authority", path: "fixture-authority.json" }),
  Object.freeze({ role: "analytics-ledger", path: "analytics-events.jsonl" }),
  Object.freeze({ role: "visual-trace-ledger", path: "visual-trace-ledger.json" }),
  Object.freeze({ role: "docker-inspection", path: "docker-inspection.json" }),
  Object.freeze({ role: "skip-ledger", path: "skip-reasons.json" }),
  Object.freeze({ role: "restoration-record", path: "restoration.json" }),
  Object.freeze({ role: "journey-outcomes", path: "journey-outcomes.json" }),
  Object.freeze({ role: "mutation-guard", path: "mutation-guard.json" }),
  Object.freeze({ role: "evidence", path: "evidence.json" }),
]);

export function createUnavailableQualificationStreamArtifacts() {
  return LIVE_QUALIFICATION_STREAM_ARTIFACTS.map(({ source, stream }) => ({
    source,
    stream,
    status: "unavailable",
    observedBytes: 0,
    chunks: [],
    truncated: false,
  }));
}

export function createUnavailableQualificationFixtureAuthority() {
  return {
    schemaVersion: "explorers-public-fixture-authority/v1",
    status: "unavailable",
    command: [...FIXTURE_AUTHORITY_COMMAND],
    cwd: "<repository>",
    exitCode: null,
    termination: "not-run",
    attestation: null,
  };
}

function fail(message) {
  throw new Error(message);
}

function safeArtifactPath(runDirectory, relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0 || relativePath.length > 256
      || relativePath.includes("\\") || relativePath.includes("\0") || /[\r\n]/.test(relativePath)
      || path.posix.isAbsolute(relativePath) || path.posix.normalize(relativePath) !== relativePath
      || relativePath === MANIFEST_NAME || relativePath === SIDECAR_NAME) {
    fail("qualification artifact path is not a safe relative path");
  }
  const absolute = path.resolve(runDirectory, ...relativePath.split("/"));
  if (path.relative(runDirectory, absolute).split(path.sep).some((part) => part === "..")) {
    fail("qualification artifact path escapes its run directory");
  }
  return absolute;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function utf8Prefix(value, maximumBytes) {
  let bytes = 0;
  let result = "";
  for (const character of value) {
    const width = Buffer.byteLength(character);
    if (bytes + width > maximumBytes) break;
    result += character;
    bytes += width;
  }
  return result;
}

function sanitizeQualificationText(value, { workspaceRoot, knownSecrets }) {
  let sanitized = value.replace(/\r\n?/g, "\n").replace(/\0/g, "");
  const roots = [workspaceRoot, workspaceRoot?.replace(/\\/g, "/")]
    .filter((entry) => typeof entry === "string" && entry.length > 0);
  for (const root of roots) sanitized = sanitized.replace(new RegExp(escapeRegExp(root), "gi"), "<workspace>");
  for (const secret of [...new Set(knownSecrets.filter((entry) => typeof entry === "string" && entry.length > 0))]
    .sort((left, right) => right.length - left.length)) {
    sanitized = sanitized.split(secret).join("<redacted>");
  }
  sanitized = sanitized
    .replace(/Bearer\s+[^\s"',;]+/gi, "Bearer <redacted>")
    .replace(/\b(access[_-]?token|capability|credential|authorization)\b\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi, "$1=<redacted>")
    .replace(/(^|[\s("'=])[A-Za-z]:[\\/][^\s"'<>|]+/gm, "$1<path>")
    .replace(/(^|[\s("'=])\/(?:[^/\s"'<>]+\/)+[^\s"'<>]*/gm, "$1<path>");
  return sanitized;
}

export function boundedSanitizedQualificationOutput(value, {
  workspaceRoot,
  knownSecrets,
  maximumBytes = 4_096,
  forceTruncated = false,
}) {
  const raw = String(value ?? "");
  const sanitized = sanitizeQualificationText(raw, { workspaceRoot, knownSecrets });
  const marker = "[truncated]\n";
  const truncated = forceTruncated || Buffer.byteLength(sanitized) > maximumBytes;
  const text = truncated
    ? `${utf8Prefix(sanitized, maximumBytes - Buffer.byteLength(marker))}${marker}`
    : sanitized;
  return { text, retainedBytes: Buffer.byteLength(text), truncated };
}

export function captureQualificationLifecycleCommand({
  stage,
  processExecPath,
  npmExecPath,
  cwd,
  retainedCwd,
  environment,
  workspaceRoot,
  knownSecrets = [],
  spawn,
} = {}) {
  const logicalCommand = LIFECYCLE_COMMANDS[stage];
  if (!logicalCommand || typeof processExecPath !== "string" || processExecPath.length === 0
      || typeof npmExecPath !== "string" || npmExecPath.length === 0
      || typeof cwd !== "string" || cwd.length === 0 || !["<workspace>", "<repository>"].includes(retainedCwd)
      || !environment || typeof environment !== "object" || Array.isArray(environment)
      || typeof workspaceRoot !== "string" || !path.isAbsolute(workspaceRoot)
      || !Array.isArray(knownSecrets) || knownSecrets.some((secret) => typeof secret !== "string")
      || typeof spawn !== "function") {
    fail("qualification lifecycle command contract is invalid");
  }
  const [, ...npmArguments] = logicalCommand;
  let result;
  try {
    result = spawn(processExecPath, [npmExecPath, ...npmArguments], {
      cwd,
      encoding: "utf8",
      env: environment,
      maxBuffer: 64 * 1024,
      windowsHide: true,
    });
  } catch { result = { status: null, signal: null, stdout: undefined, stderr: undefined, error: true }; }
  const termination = Number.isSafeInteger(result?.status) ? "exited"
    : (typeof result?.signal === "string" && result.signal.length > 0 ? "signaled" : "spawn-error");
  const observedStream = (value) => value !== undefined && value !== null;
  const observedBytes = (value) => observedStream(value) ? Buffer.byteLength(String(value)) : 0;
  const forceTruncated = Boolean(result?.error);
  const stdout = boundedSanitizedQualificationOutput(result?.stdout, {
    workspaceRoot, knownSecrets, forceTruncated,
  });
  const stderr = boundedSanitizedQualificationOutput(result?.stderr, {
    workspaceRoot, knownSecrets, forceTruncated,
  });
  const streamRecord = (observed, bounded) => ({
    status: observedStream(observed) ? "captured" : "unavailable",
    observedBytes: observedBytes(observed),
    retainedBytes: observedStream(observed) ? bounded.retainedBytes : 0,
    truncated: observedStream(observed) ? bounded.truncated : false,
  });
  const exitCode = Number.isSafeInteger(result?.status) && result.status >= 0 && result.status <= 255
    ? result.status
    : null;
  const stdoutRecord = streamRecord(result?.stdout, stdout);
  const stderrRecord = streamRecord(result?.stderr, stderr);
  return {
    status: exitCode ?? 1,
    stdout: stdoutRecord.status === "captured" ? stdout.text : "",
    stderr: stderrRecord.status === "captured" ? stderr.text : "",
    streamArtifacts: [
      {
        source: stage,
        stream: "stdout",
        status: stdoutRecord.status,
        observedBytes: stdoutRecord.observedBytes,
        chunks: stdoutRecord.status === "captured" ? [stdout.text] : [],
        truncated: stdoutRecord.truncated,
      },
      {
        source: stage,
        stream: "stderr",
        status: stderrRecord.status,
        observedBytes: stderrRecord.observedBytes,
        chunks: stderrRecord.status === "captured" ? [stderr.text] : [],
        truncated: stderrRecord.truncated,
      },
    ],
    record: {
      schemaVersion: "explorers-public-lifecycle-command/v1",
      stage,
      command: [...logicalCommand],
      cwd: retainedCwd,
      exitCode,
      termination,
      stdout: stdoutRecord,
      stderr: stderrRecord,
    },
  };
}

function validSafeFixtureAuthorityAttestation(value) {
  return isExactKeySet(value, ["schemaVersion", "state", "safeToBootstrap", "usableRecords"])
    && value.schemaVersion === "music-fixture-authority-attestation/v1"
    && ["absent", "tombstone"].includes(value.state)
    && value.safeToBootstrap === true
    && value.usableRecords === 0;
}

function validFixtureAuthorityRecord(value) {
  if (!isExactKeySet(value, [
    "schemaVersion", "status", "command", "cwd", "exitCode", "termination", "attestation",
  ]) || value.schemaVersion !== "explorers-public-fixture-authority/v1"
      || JSON.stringify(value.command) !== JSON.stringify(FIXTURE_AUTHORITY_COMMAND)
      || value.cwd !== "<repository>"
      || !["accepted", "rejected", "unavailable"].includes(value.status)) return false;
  if (value.status === "accepted") {
    return value.exitCode === 0 && value.termination === "exited"
      && validSafeFixtureAuthorityAttestation(value.attestation);
  }
  if (value.status === "unavailable") {
    return value.exitCode === null && value.termination === "not-run" && value.attestation === null;
  }
  const validExit = value.exitCode === null
    || (Number.isSafeInteger(value.exitCode) && value.exitCode >= 0 && value.exitCode <= 255);
  return validExit && value.attestation === null
    && ((value.termination === "exited" && value.exitCode !== null)
      || (["signaled", "spawn-error"].includes(value.termination) && value.exitCode === null));
}

export function captureQualificationFixtureAuthority({
  processExecPath,
  npmExecPath,
  cwd,
  retainedCwd,
  environment,
  spawn,
} = {}) {
  if (typeof processExecPath !== "string" || processExecPath.length === 0
      || typeof npmExecPath !== "string" || npmExecPath.length === 0
      || typeof cwd !== "string" || cwd.length === 0 || retainedCwd !== "<repository>"
      || !environment || typeof environment !== "object" || Array.isArray(environment)
      || typeof spawn !== "function") fail("fixture authority command contract is invalid");
  let result;
  try {
    result = spawn(processExecPath, [npmExecPath, ...FIXTURE_AUTHORITY_COMMAND.slice(1)], {
      cwd,
      encoding: "utf8",
      env: environment,
      maxBuffer: 8 * 1024,
      windowsHide: true,
    });
  } catch {
    result = { status: null, signal: null, error: true };
  }
  const exitCode = Number.isSafeInteger(result?.status) && result.status >= 0 && result.status <= 255
    ? result.status
    : null;
  const termination = exitCode !== null ? "exited"
    : (typeof result?.signal === "string" && result.signal.length > 0 ? "signaled" : "spawn-error");
  let attestation = null;
  if (exitCode === 0 && !result?.error && String(result?.stderr ?? "") === "") {
    const stdout = String(result?.stdout ?? "");
    if (Buffer.byteLength(stdout) <= 1_024) {
      try {
        const candidate = JSON.parse(stdout);
        if (stdout === `${JSON.stringify(candidate)}\n` && validSafeFixtureAuthorityAttestation(candidate)) {
          attestation = candidate;
        }
      } catch {
        // Raw output is never retained; malformed authority is a typed rejection.
      }
    }
  }
  const accepted = attestation !== null;
  const record = {
    schemaVersion: "explorers-public-fixture-authority/v1",
    status: accepted ? "accepted" : "rejected",
    command: [...FIXTURE_AUTHORITY_COMMAND],
    cwd: retainedCwd,
    exitCode,
    termination,
    attestation,
  };
  if (!validFixtureAuthorityRecord(record)) fail("fixture authority command result is invalid");
  return { status: accepted ? 0 : 1, record };
}

export function writeSanitizedQualificationLog({
  runDirectory: runDirectoryInput,
  relativePath,
  chunks,
  workspaceRoot,
  knownSecrets = [],
  maximumBytes = 4_096,
  forceTruncated = false,
} = {}) {
  const runDirectory = requireGuardedRunDirectory(runDirectoryInput);
  if (!Array.isArray(chunks) || typeof forceTruncated !== "boolean"
      || !Number.isSafeInteger(maximumBytes) || maximumBytes < 64 || maximumBytes > 64 * 1024) {
    fail("qualification log contract is invalid");
  }
  const joined = chunks.map((chunk) => String(chunk ?? "")).join("");
  const rawBytes = Buffer.byteLength(joined);
  const inputTruncated = rawBytes > MAX_SANITIZER_INPUT_BYTES;
  const boundedInput = inputTruncated
    ? utf8Prefix(joined, MAX_SANITIZER_INPUT_BYTES - 256)
    : joined;
  const bounded = boundedSanitizedQualificationOutput(boundedInput, {
    workspaceRoot, knownSecrets, maximumBytes, forceTruncated: forceTruncated || inputTruncated,
  });
  const retained = bounded.text;
  const artifactPath = safeArtifactPath(runDirectory, relativePath);
  mkdirSync(path.dirname(artifactPath), { recursive: true, mode: 0o700 });
  try {
    writeFileSync(artifactPath, retained, { encoding: "utf8", flag: "wx", mode: 0o600 });
  } catch {
    fail("qualification artifact already exists");
  }
  return { bytes: Buffer.byteLength(retained), truncated: bounded.truncated };
}

function validAnalyticsProductEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event) || typeof event.name !== "string") return false;
  if (event.name === "navigation_opened") {
    return isExactKeySet(event, ["name", "route"]) && ["friendly", "direct"].includes(event.route);
  }
  if (event.name === "section_opened") {
    return isExactKeySet(event, ["name", "section"])
      && ["player", "request", "queue", "playlists", "history"].includes(event.section);
  }
  if (event.name === "playlist_opened") return isExactKeySet(event, ["name"]);
  if (["song_selected", "playback_started"].includes(event.name)) {
    return isExactKeySet(event, ["name", "source"]) && ["current", "queue", "playlist"].includes(event.source);
  }
  if (event.name === "request_submitted") {
    return isExactKeySet(event, ["name", "outcome"])
      && ["accepted", "invalid", "rate_limited", "queue_full", "forbidden", "unavailable"].includes(event.outcome);
  }
  if (event.name === "unavailable") {
    return isExactKeySet(event, ["name", "reason"])
      && ["not_public", "rate_limited", "service_unavailable"].includes(event.reason);
  }
  return false;
}

function validSafeUtm(utm) {
  if (!utm || typeof utm !== "object" || Array.isArray(utm)) return false;
  const keys = Object.keys(utm);
  return keys.length > 0 && keys.every((key) => SAFE_UTM_KEYS.has(key)
    && typeof utm[key] === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(utm[key]));
}

function validObservedAnalyticsLedger(ledger) {
  if (!isExactKeySet(ledger, ["schemaVersion", "status", "events"])
      || ledger.schemaVersion !== ANALYTICS_LEDGER_VERSION || ledger.status !== "observed"
      || !Array.isArray(ledger.events) || ledger.events.length === 0 || ledger.events.length > 256) return false;
  const occurrences = new Set();
  const eventIds = new Set();
  for (let index = 0; index < ledger.events.length; index += 1) {
    const record = ledger.events[index];
    if (!isExactKeySet(record, ["sequence", "event", "utm", "delivery"])
        || record.sequence !== index + 1 || !validAnalyticsProductEvent(record.event) || !validSafeUtm(record.utm)) return false;
    const delivery = record.delivery;
    if (!isExactKeySet(delivery, [
      "occurrenceSha256", "eventIdSha256", "attempts", "distinctEventIds",
      "committedEvents", "duplicateResponses", "exactlyOnce",
    ]) || typeof delivery.occurrenceSha256 !== "string" || !/^[a-f0-9]{64}$/.test(delivery.occurrenceSha256)
        || typeof delivery.eventIdSha256 !== "string" || !/^[a-f0-9]{64}$/.test(delivery.eventIdSha256)
        || !Number.isSafeInteger(delivery.attempts) || delivery.attempts < 1 || delivery.attempts > 16
        || delivery.distinctEventIds !== 1 || delivery.committedEvents !== 1 || delivery.exactlyOnce !== true
        || !Number.isSafeInteger(delivery.duplicateResponses) || delivery.duplicateResponses < 0
        || delivery.duplicateResponses >= delivery.attempts) return false;
    if (occurrences.has(delivery.occurrenceSha256) || eventIds.has(delivery.eventIdSha256)) return false;
    occurrences.add(delivery.occurrenceSha256);
    eventIds.add(delivery.eventIdSha256);
  }
  return true;
}

function validUnavailableAnalyticsLedger(ledger) {
  return isExactKeySet(ledger, ["schemaVersion", "status", "reason", "events"])
    && ledger.schemaVersion === ANALYTICS_LEDGER_VERSION && ledger.status === "unavailable"
    && ANALYTICS_UNAVAILABLE_REASONS.has(ledger.reason) && Array.isArray(ledger.events) && ledger.events.length === 0;
}

function validateVisualTraceLedgerObject(runDirectory, ledger) {
  if (!isExactKeySet(ledger, ["schemaVersion", "status", "visuals", "traces"])
      || ledger.schemaVersion !== VISUAL_TRACE_LEDGER_VERSION
      || !["retained", "none-retained"].includes(ledger.status)
      || !Array.isArray(ledger.visuals) || !Array.isArray(ledger.traces)
      || ledger.visuals.length + ledger.traces.length > 64
      || (ledger.status === "retained" && ledger.visuals.length + ledger.traces.length === 0)
      || (ledger.status === "none-retained" && ledger.visuals.length + ledger.traces.length !== 0)) {
    fail("qualification visual/trace ledger contract is invalid");
  }
  const paths = [...ledger.visuals, ...ledger.traces];
  if (new Set(paths).size !== paths.length) fail("qualification visual/trace ledger contract is invalid");
  for (const [kind, values] of [["visual", ledger.visuals], ["trace", ledger.traces]]) {
    for (const relativePath of values) {
      safeArtifactPath(runDirectory, relativePath);
      const validPrefix = relativePath.startsWith(kind === "visual" ? "visuals/" : "traces/");
      const validExtension = kind === "visual"
        ? /\.(?:png|jpe?g|webp)$/i.test(relativePath)
        : /\.zip$/i.test(relativePath);
      if (!validPrefix || !validExtension || !/^[A-Za-z0-9._/-]+$/.test(relativePath)) {
        fail("qualification visual/trace ledger contract is invalid");
      }
    }
  }
}

function parseVisualTraceLedger(runDirectory) {
  let bytes;
  try {
    const ledgerPath = safeArtifactPath(runDirectory, "visual-trace-ledger.json");
    const observed = lstatSync(ledgerPath);
    if (!observed.isFile() || observed.isSymbolicLink() || observed.size > MAX_LEDGER_BYTES) {
      fail("qualification visual/trace ledger contract is invalid");
    }
    bytes = readFileSync(ledgerPath);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("qualification visual/trace")) throw error;
    fail("qualification visual/trace ledger contract is invalid");
  }
  let ledger;
  try { ledger = JSON.parse(bytes.toString("utf8")); } catch { fail("qualification visual/trace ledger contract is invalid"); }
  validateVisualTraceLedgerObject(runDirectory, ledger);
  const canonical = Buffer.from(`${JSON.stringify(ledger)}\n`, "utf8");
  if (!bytes.equals(canonical)) fail("qualification visual/trace ledger contract is invalid");
  return ledger;
}

function requiredArtifactsForRun(runDirectory) {
  const ledger = parseVisualTraceLedger(runDirectory);
  return [
    ...LIVE_QUALIFICATION_REQUIRED_ARTIFACTS,
    ...ledger.visuals.map((relativePath, index) => ({
      role: `visual-${String(index + 1).padStart(3, "0")}`,
      path: relativePath,
    })),
    ...ledger.traces.map((relativePath, index) => ({
      role: `trace-${String(index + 1).padStart(3, "0")}`,
      path: relativePath,
    })),
  ];
}

export function writeQualificationAnalyticsLedger({ runDirectory: runDirectoryInput, ledger } = {}) {
  const runDirectory = requireGuardedRunDirectory(runDirectoryInput);
  if (!validObservedAnalyticsLedger(ledger) && !validUnavailableAnalyticsLedger(ledger)) {
    fail("qualification analytics ledger contract is invalid");
  }
  const retained = `${JSON.stringify(ledger)}\n`;
  if (Buffer.byteLength(retained) > MAX_LEDGER_BYTES) fail("qualification analytics ledger is too large");
  const artifactPath = safeArtifactPath(runDirectory, "analytics-events.jsonl");
  try {
    writeFileSync(artifactPath, retained, { encoding: "utf8", flag: "wx", mode: 0o600 });
  } catch {
    fail("qualification artifact already exists");
  }
  return { bytes: Buffer.byteLength(retained), events: ledger.events.length, status: ledger.status };
}

function validDockerInspection(value) {
  const commonValid = value?.schemaVersion === "explorers-public-docker-inspection/v1"
    && ["<workspace>", "<repository>"].includes(value.cwd)
    && isExactKeySet(value.labels, ["com.explorers.music.fixture", "com.explorers.music.project"])
    && value.labels["com.explorers.music.fixture"] === "true"
    && value.labels["com.explorers.music.project"] === "explorers-music-fixture"
    && isExactKeySet(value.commands, ["containers", "volumes"])
    && JSON.stringify(value.commands) === JSON.stringify(DOCKER_INSPECTION_COMMANDS)
    && isExactKeySet(value.exitCodes, ["containers", "volumes"])
    && Object.values(value.exitCodes).every((exitCode) => exitCode === null
      || (Number.isSafeInteger(exitCode) && exitCode >= 0 && exitCode <= 255))
    && Array.isArray(value.containerMatches) && value.containerMatches.length <= 64
    && value.containerMatches.every((entry) => typeof entry === "string" && /^[a-f0-9]{12,64}$/.test(entry))
    && new Set(value.containerMatches).size === value.containerMatches.length
    && Array.isArray(value.volumeMatches) && value.volumeMatches.length <= 64
    && value.volumeMatches.every((entry) => typeof entry === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(entry))
    && new Set(value.volumeMatches).size === value.volumeMatches.length
    && Array.isArray(value.authArtifacts) && value.authArtifacts.length === 2
    && JSON.stringify(value.authArtifacts.map(({ path: relativePath }) => relativePath))
      === JSON.stringify(["owner-auth.json", "profile-storage-state.json"])
    && value.authArtifacts.every((entry) => isExactKeySet(entry, ["path", "state"])
      && ["absent", "present", "unavailable"].includes(entry.state));
  if (!commonValid) return false;
  if (value.status === "unavailable") {
    return isExactKeySet(value, [
      "schemaVersion", "status", "reason", "cwd", "labels", "commands", "exitCodes", "containerMatches", "volumeMatches",
      "containersRemaining", "volumesRemaining", "authArtifacts",
    ]) && ["dry-run", "inspection-failed", "not-run"].includes(value.reason)
      && value.containerMatches.length === 0 && value.volumeMatches.length === 0
      && value.containersRemaining === null && value.volumesRemaining === null;
  }
  return value.status === "observed" && isExactKeySet(value, [
    "schemaVersion", "status", "cwd", "labels", "commands", "exitCodes", "containerMatches", "volumeMatches",
    "containersRemaining", "volumesRemaining", "authArtifacts",
  ]) && value.exitCodes.containers === 0 && value.exitCodes.volumes === 0
    && Number.isSafeInteger(value.containersRemaining) && value.containersRemaining >= 0
    && value.containersRemaining === value.containerMatches.length
    && Number.isSafeInteger(value.volumesRemaining) && value.volumesRemaining >= 0
    && value.volumesRemaining === value.volumeMatches.length;
}

function parsedDockerMatches(stdout, pattern) {
  if (typeof stdout !== "string" || Buffer.byteLength(stdout) > 8 * 1024) return undefined;
  const matches = stdout.split(/\r?\n/).filter((entry) => entry.length > 0);
  if (matches.length > 64 || new Set(matches).size !== matches.length
      || matches.some((entry) => !pattern.test(entry))) return undefined;
  return matches;
}

export function inspectQualificationDockerCleanup({
  runDirectory: runDirectoryInput,
  inspectionCwd,
  retainedCwd,
  spawn,
  exists = existsSync,
} = {}) {
  const runDirectory = requireGuardedRunDirectory(runDirectoryInput);
  if (typeof inspectionCwd !== "string" || inspectionCwd.length === 0
      || !["<workspace>", "<repository>"].includes(retainedCwd)
      || typeof spawn !== "function" || typeof exists !== "function") {
    fail("qualification Docker inspection contract is invalid");
  }
  const authArtifacts = ["owner-auth.json", "profile-storage-state.json"].map((relativePath) => {
    let state = "unavailable";
    try { state = exists(safeArtifactPath(runDirectory, relativePath)) ? "present" : "absent"; } catch { /* retained as unavailable */ }
    return { path: relativePath, state };
  });
  const results = {};
  for (const role of ["containers", "volumes"]) {
    const [, ...args] = DOCKER_INSPECTION_COMMANDS[role];
    try {
      results[role] = spawn("docker", args, {
        cwd: inspectionCwd,
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 8 * 1024,
      });
    } catch { results[role] = undefined; }
  }
  const exitCodes = Object.fromEntries(["containers", "volumes"].map((role) => [
    role,
    Number.isSafeInteger(results[role]?.status) && results[role].status >= 0 && results[role].status <= 255
      ? results[role].status
      : null,
  ]));
  const containerMatches = parsedDockerMatches(results.containers?.stdout, /^[a-f0-9]{12,64}$/);
  const volumeMatches = parsedDockerMatches(results.volumes?.stdout, /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/);
  const common = {
    schemaVersion: "explorers-public-docker-inspection/v1",
    cwd: retainedCwd,
    labels: {
      "com.explorers.music.fixture": "true",
      "com.explorers.music.project": "explorers-music-fixture",
    },
    commands: {
      containers: [...DOCKER_INSPECTION_COMMANDS.containers],
      volumes: [...DOCKER_INSPECTION_COMMANDS.volumes],
    },
    exitCodes,
    authArtifacts,
  };
  if (exitCodes.containers === 0 && exitCodes.volumes === 0 && containerMatches && volumeMatches) {
    return {
      ...common,
      status: "observed",
      containerMatches,
      volumeMatches,
      containersRemaining: containerMatches.length,
      volumesRemaining: volumeMatches.length,
    };
  }
  return {
    ...common,
    status: "unavailable",
    reason: "inspection-failed",
    containerMatches: [],
    volumeMatches: [],
    containersRemaining: null,
    volumesRemaining: null,
  };
}

export function assessQualificationCleanup({ lane, cleanup, dockerInspection } = {}) {
  const validCleanup = [
    "restored", "not-required-safe", "evidence-missing", "restore-failed", "teardown-failed",
    "evidence-delete-failed", "not-required",
  ].includes(cleanup);
  if (!["live", "fixture", "pr-safe"].includes(lane) || !validCleanup || !validDockerInspection(dockerInspection)) {
    fail("qualification cleanup assessment contract is invalid");
  }
  const gaps = [];
  if (lane === "live" && !["restored", "not-required-safe"].includes(cleanup)) {
    gaps.push(`cleanup-unverified:${cleanup}`);
  }
  if (dockerInspection.status !== "observed") gaps.push("docker-inspection-unavailable");
  if (dockerInspection.containersRemaining > 0) gaps.push("docker-containers-remain");
  if (dockerInspection.volumesRemaining > 0) gaps.push("docker-volumes-remain");
  for (const artifact of dockerInspection.authArtifacts) {
    if (artifact.state !== "absent") gaps.push(`auth-artifact-${artifact.state}:${artifact.path}`);
  }
  return { verified: lane !== "live" || gaps.length === 0, gaps };
}

function validSkipLedger(value) {
  const allowedReasons = new Set([
    "none", "authority-process", "authority-semantic", "collection-process", "collection-json",
    "collection-semantic", "collection-unclassified", "manifest-missing", "manifest-duplicate", "manifest-unknown",
    "manifest-reordered", "manifest-skipped", "execution-stopped", "test-skipped", "not-observed",
  ]);
  if (!isExactKeySet(value, ["schemaVersion", "lane", "execution", "totals", "reasons"])
      || value.schemaVersion !== "explorers-public-skip-ledger/v1"
      || !["live", "fixture", "pr-safe"].includes(value.lane)
      || !["completed", "preflight-stopped", "execution-stopped", "not-run"].includes(value.execution)
      || !isExactKeySet(value.totals, ["total", "passed", "failed", "skipped"])
      || !Object.values(value.totals).every((count) => Number.isSafeInteger(count) && count >= 0)
      || value.totals.passed + value.totals.failed + value.totals.skipped !== value.totals.total
      || !Array.isArray(value.reasons) || value.reasons.length > 48) return false;
  return value.reasons.every((entry) => isExactKeySet(entry, ["scope", "reason"])
    && ["authority", "collection", "live-manifest", "journey", "lane"].includes(entry.scope)
    && allowedReasons.has(entry.reason));
}

function validJourneyOutcomeTotals(skipLedger, journeyOutcomeLedger) {
  if (!validSkipLedger(skipLedger) || !validateSanitizedJourneyOutcomeLedger(journeyOutcomeLedger)) return false;
  const execution = journeyOutcomeLedger.counts.execution;
  if (skipLedger.lane === "pr-safe") {
    return journeyOutcomeLedger.integrity === "not-run"
      && execution.notRun === execution.total;
  }
  const stopped = journeyOutcomeLedger.executionOutcomes.some(({ reason }) => reason === "execution-stopped");
  if (execution.notRun > 0) {
    return (stopped ? skipLedger.execution === "execution-stopped" : skipLedger.execution !== "completed")
      && skipLedger.totals.total === execution.total - execution.notRun
      && skipLedger.totals.passed === execution.passed
      && skipLedger.totals.failed === execution.failed
      && skipLedger.totals.skipped === execution.skipped;
  }
  if (journeyOutcomeLedger.executionOutcomes.some(({ reason }) => reason.startsWith("report-"))) {
    return skipLedger.execution !== "completed";
  }
  return execution.notRun === 0 && skipLedger.execution === "completed"
    && skipLedger.totals.total === execution.total
    && skipLedger.totals.passed === execution.passed
    && skipLedger.totals.failed === execution.failed
    && skipLedger.totals.skipped === execution.skipped;
}

function executionTotals(executionReport) {
  const specs = [];
  const visit = (suite) => {
    if (!suite || typeof suite !== "object") return;
    if (Array.isArray(suite.specs)) specs.push(...suite.specs);
    if (Array.isArray(suite.suites)) suite.suites.forEach(visit);
  };
  if (!executionReport || typeof executionReport !== "object" || !Array.isArray(executionReport.suites)) return undefined;
  executionReport.suites.forEach(visit);
  // The PR-safe browser matrix currently contains more than 256 cases. Keep a
  // finite ceiling while allowing the complete declared matrix to be counted.
  if (specs.length === 0 || specs.length > 512) return undefined;
  const totals = { total: 0, passed: 0, failed: 0, skipped: 0 };
  let resultless = 0;
  for (const spec of specs) {
    const test = Array.isArray(spec?.tests) ? spec.tests[0] : undefined;
    const results = Array.isArray(test?.results) ? test.results : [];
    const status = results.at(-1)?.status;
    const annotatedSkip = Array.isArray(test?.annotations)
      && test.annotations.some((annotation) => annotation?.type === "skip");
    if (!status && !annotatedSkip) {
      resultless += 1;
      continue;
    }
    totals.total += 1;
    if (annotatedSkip || status === "skipped") totals.skipped += 1;
    else if (status === "passed") totals.passed += 1;
    else totals.failed += 1;
  }
  return { totals, resultless };
}

function preflightReason(subcheck) {
  const allowed = new Set([
    "authority-process", "authority-semantic", "collection-process", "collection-semantic",
    "collection-unclassified", "manifest-missing", "manifest-duplicate", "manifest-unknown",
    "manifest-reordered", "manifest-skipped",
  ]);
  return allowed.has(subcheck) ? subcheck : "execution-stopped";
}

function reasonScope(reason) {
  if (reason.startsWith("authority-")) return "authority";
  if (reason.startsWith("collection-")) return "collection";
  if (reason.startsWith("manifest-")) return "live-manifest";
  return "lane";
}

export function buildQualificationOutcomeRecords({ lane, executionOutcome, report } = {}) {
  if (!["live", "fixture", "pr-safe"].includes(lane) || !report || typeof report !== "object") {
    fail("qualification outcome contract is invalid");
  }
  let execution = "execution-stopped";
  let totals = { total: 0, passed: 0, failed: 0, skipped: 0 };
  let reasons = [{ scope: "lane", reason: "execution-stopped" }];
  if (executionOutcome?.preflightDiagnostics) {
    execution = "preflight-stopped";
    const reason = preflightReason(executionOutcome.preflightDiagnostics.subcheck);
    reasons = [{ scope: reasonScope(reason), reason }];
  } else {
    const observed = executionTotals(executionOutcome?.executionReport);
    if (observed) {
      totals = observed.totals;
      execution = observed.resultless > 0 ? "execution-stopped" : "completed";
      reasons = observed.resultless > 0
        ? [{ scope: "lane", reason: "execution-stopped" }]
        : (totals.skipped > 0 ? [{ scope: "journey", reason: "test-skipped" }] : []);
    }
  }
  const skipLedger = {
    schemaVersion: "explorers-public-skip-ledger/v1",
    lane,
    execution,
    totals,
    reasons,
  };
  let restorationRecord = {
    schemaVersion: "explorers-public-restoration/v1",
    status: report.cleanup === "restore-failed" ? "restore-failed" : "unavailable",
    finalRestore: null,
    journeys: [],
  };
  const finalRestore = report.finalRestore;
  if (finalRestore && validHashPair({ beforeHash: finalRestore.beforeHash, afterHash: finalRestore.afterHash })) {
    const journeys = Array.isArray(report.journeys)
      ? report.journeys.map((entry) => ({ id: entry?.id, beforeHash: entry?.beforeHash, afterHash: entry?.afterHash }))
      : [];
    const journeysValid = journeys.length === 17 && journeys.every((entry) => isExactKeySet(entry, ["id", "beforeHash", "afterHash"])
      && typeof entry.id === "string" && /^[a-z0-9][a-z0-9.-]{0,127}$/.test(entry.id)
      && validHashPair({ beforeHash: entry.beforeHash, afterHash: entry.afterHash }));
    restorationRecord = {
      schemaVersion: "explorers-public-restoration/v1",
      status: journeysValid ? "journeys-restored" : "initial-restored",
      finalRestore: { beforeHash: finalRestore.beforeHash, afterHash: finalRestore.afterHash },
      journeys: journeysValid ? journeys : [],
    };
  }
  if (!validSkipLedger(skipLedger) || !validRestorationRecord(restorationRecord)) {
    fail("qualification outcome contract is invalid");
  }
  let journeyOutcomeLedger;
  let journeyOutcomeLedgerPersisted = false;
  if (lane === "pr-safe") {
    journeyOutcomeLedger = buildSanitizedJourneyOutcomeLedger({
      reportStatus: "not-run",
      terminalStatus: "not-run",
    });
  } else if (executionOutcome?.outcomeLedgerStatus !== undefined) {
    if (executionOutcome.outcomeLedgerStatus !== "persisted"
        || !validateSanitizedJourneyOutcomeLedger(executionOutcome.journeyOutcomeLedger)) {
      fail("qualification journey outcome persistence is invalid");
    }
    journeyOutcomeLedger = executionOutcome.journeyOutcomeLedger;
    journeyOutcomeLedgerPersisted = true;
  } else if (executionOutcome?.preflightDiagnostics || !executionOutcome?.executionReport) {
    journeyOutcomeLedger = buildSanitizedJourneyOutcomeLedger({
      reportStatus: "not-run",
      terminalStatus: "not-run",
    });
  } else {
    journeyOutcomeLedger = buildSanitizedJourneyOutcomeLedger({
      executionReport: executionOutcome.executionReport,
      reportStatus: "accepted",
      terminalRecords: Array.isArray(report.journeys) ? report.journeys : undefined,
      terminalStatus: Array.isArray(report.journeys) ? "accepted" : "not-run",
    });
  }
  return { skipLedger, restorationRecord, journeyOutcomeLedger, journeyOutcomeLedgerPersisted };
}

function validHashPair(value) {
  return isExactKeySet(value, ["beforeHash", "afterHash"])
    && typeof value.beforeHash === "string" && /^[a-f0-9]{64}$/.test(value.beforeHash)
    && value.beforeHash === value.afterHash;
}

function validRestorationRecord(value) {
  if (!isExactKeySet(value, ["schemaVersion", "status", "finalRestore", "journeys"])
      || value.schemaVersion !== "explorers-public-restoration/v1"
      || !["initial-restored", "journeys-restored", "unavailable", "restore-failed"].includes(value.status)
      || !Array.isArray(value.journeys) || value.journeys.length > 17) return false;
  if (["unavailable", "restore-failed"].includes(value.status)) {
    return value.finalRestore === null && value.journeys.length === 0;
  }
  if (!validHashPair(value.finalRestore)) return false;
  if (value.status === "initial-restored") return value.journeys.length === 0;
  return value.journeys.length === 17 && value.journeys.every((entry) => isExactKeySet(entry, ["id", "beforeHash", "afterHash"])
    && typeof entry.id === "string" && /^[a-z0-9][a-z0-9.-]{0,127}$/.test(entry.id)
    && validHashPair({ beforeHash: entry.beforeHash, afterHash: entry.afterHash }));
}

function assertSafeStructuredArtifact(value, { knownSecrets, workspaceRoot }) {
  let serialized;
  try { serialized = JSON.stringify(value); } catch { fail("qualification structured artifact is invalid"); }
  if (typeof serialized !== "string" || Buffer.byteLength(serialized) > MAX_LEDGER_BYTES
      || /Bearer\s+|\b(?:access[_-]?token|capability|credential|authorization|password|secret)\b/i.test(serialized)
      || /(^|[\s"'])[A-Za-z]:[\\/]/.test(serialized)
      || /(?:^|[{:,[\]])\s*"\/(?:[^"\\]|\\.)*"/.test(serialized)
      || (typeof workspaceRoot === "string" && workspaceRoot.length > 0 && serialized.toLowerCase().includes(workspaceRoot.toLowerCase()))
      || knownSecrets.some((secret) => typeof secret === "string" && secret.length > 0 && serialized.includes(secret))) {
    fail("qualification structured artifact is invalid");
  }
}

function writeCanonicalStructuredArtifact({ runDirectory, relativePath, value, knownSecrets, workspaceRoot, compact = false }) {
  assertSafeStructuredArtifact(value, { knownSecrets, workspaceRoot });
  const retained = `${JSON.stringify(value, null, compact ? undefined : 2)}\n`;
  if (Buffer.byteLength(retained) > MAX_LEDGER_BYTES) fail("qualification structured artifact is invalid");
  const artifactPath = safeArtifactPath(runDirectory, relativePath);
  mkdirSync(path.dirname(artifactPath), { recursive: true, mode: 0o700 });
  try { writeFileSync(artifactPath, retained, { encoding: "utf8", flag: "wx", mode: 0o600 }); }
  catch { fail("qualification artifact already exists"); }
}

function retainJourneyOutcomeLedger({
  runDirectory,
  ledger,
  alreadyPersisted,
  knownSecrets,
  workspaceRoot,
}) {
  if (!validateSanitizedJourneyOutcomeLedger(ledger) || typeof alreadyPersisted !== "boolean") {
    fail("qualification journey outcome ledger contract is invalid");
  }
  assertSafeStructuredArtifact(ledger, { knownSecrets, workspaceRoot });
  const expectedBytes = Buffer.from(`${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  const ledgerPath = safeArtifactPath(runDirectory, "journey-outcomes.json");
  if (alreadyPersisted) {
    let retained;
    try { retained = readBoundedRegularFile(ledgerPath, MAX_LEDGER_BYTES); }
    catch { fail("qualification journey outcome ledger is missing or unreadable"); }
    if (!retained.equals(expectedBytes)) fail("qualification journey outcome ledger changed after private cleanup");
    return;
  }
  if (existsSync(ledgerPath)) fail("qualification journey outcome ledger unexpectedly exists");
  writeCanonicalStructuredArtifact({
    runDirectory,
    relativePath: "journey-outcomes.json",
    value: ledger,
    knownSecrets,
    workspaceRoot,
  });
}

const clearMutationGuardRecord = Object.freeze({
  version: "music-e2e-mutation-guard/v1", state: "clear", reason: "none", stage: "preflight",
});

function resolvedMutationGuard(runDirectory, supplied) {
  if (supplied !== undefined) return supplied;
  const guardPath = safeArtifactPath(runDirectory, "mutation-guard.json");
  if (!existsSync(guardPath)) return clearMutationGuardRecord;
  try { return JSON.parse(readBoundedRegularFile(guardPath, 1024).toString("utf8")); }
  catch { fail("qualification mutation guard contract is invalid"); }
}

function retainMutationGuard({ runDirectory, record, knownSecrets, workspaceRoot }) {
  if (!validateMusicMutationGuardRecord(record)) fail("qualification mutation guard contract is invalid");
  assertSafeStructuredArtifact(record, { knownSecrets, workspaceRoot });
  const guardPath = safeArtifactPath(runDirectory, "mutation-guard.json");
  const expected = Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
  if (existsSync(guardPath)) {
    let retained;
    try {
      const observed = lstatSync(guardPath);
      if (!observed.isFile() || observed.isSymbolicLink() || observed.nlink !== 1) {
        fail("qualification mutation guard contract is invalid");
      }
      retained = readBoundedRegularFile(guardPath, 1024);
    } catch { fail("qualification mutation guard contract is invalid"); }
    if (!retained.equals(expected)) fail("qualification mutation guard changed after cleanup");
    return;
  }
  const temporaryPath = `${guardPath}.private-tmp`;
  let descriptor;
  let published = false;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, expected);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporaryPath, guardPath);
    published = true;
  } catch {
    fail("qualification mutation guard persistence failed");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try { if (existsSync(temporaryPath)) unlinkSync(temporaryPath); }
    catch {
      if (published) { try { unlinkSync(guardPath); } catch { /* fail closed below */ } }
      fail("qualification mutation guard persistence failed");
    }
  }
}

function validStateServiceTerminalRecord(value) {
  if (isExactKeySet(value, ["status"])) return value.status === "unavailable";
  return isExactKeySet(value, ["status", "code", "signal"])
    && value.status === "observed"
    && (value.code === null || (Number.isSafeInteger(value.code) && value.code >= 0 && value.code <= 255))
    && (value.signal === null || (typeof value.signal === "string" && /^[A-Z][A-Z0-9]{0,31}$/.test(value.signal)));
}

function validStateServiceLifecycle(value) {
  return isExactKeySet(value, ["schemaVersion", "error", "exit", "close"])
    && value.schemaVersion === "explorers-public-state-service-lifecycle/v1"
    && (isExactKeySet(value.error, ["status"])
      && ["observed", "unavailable"].includes(value.error.status))
    && validStateServiceTerminalRecord(value.exit)
    && validStateServiceTerminalRecord(value.close);
}

function normalizedQualificationStreamInputs(streamArtifacts) {
  if (!Array.isArray(streamArtifacts) || streamArtifacts.length !== LIVE_QUALIFICATION_STREAM_ARTIFACTS.length) {
    fail("qualification stream artifact contract is invalid");
  }
  return LIVE_QUALIFICATION_STREAM_ARTIFACTS.map((definition, index) => {
    const input = streamArtifacts[index];
    if (!isExactKeySet(input, ["source", "stream", "status", "observedBytes", "chunks", "truncated"])
        || input.source !== definition.source || input.stream !== definition.stream
        || !["captured", "unavailable"].includes(input.status)
        || !Number.isSafeInteger(input.observedBytes) || input.observedBytes < 0
        || !Array.isArray(input.chunks)
        || input.chunks.some((chunk) => typeof chunk !== "string" && !Buffer.isBuffer(chunk))
        || typeof input.truncated !== "boolean") {
      fail("qualification stream artifact contract is invalid");
    }
    const bufferedBytes = input.chunks.reduce((total, chunk) => total + Buffer.byteLength(chunk), 0);
    if (bufferedBytes > MAX_SANITIZER_INPUT_BYTES || input.observedBytes < bufferedBytes
        || (input.status === "unavailable"
          && (input.observedBytes !== 0 || input.chunks.length !== 0 || input.truncated))) {
      fail("qualification stream artifact contract is invalid");
    }
    return { definition, input };
  });
}

function validQualificationStreamRecords(records) {
  if (!Array.isArray(records) || records.length !== LIVE_QUALIFICATION_STREAM_ARTIFACTS.length) return false;
  return records.every((record, index) => {
    const definition = LIVE_QUALIFICATION_STREAM_ARTIFACTS[index];
    return isExactKeySet(record, [
      "schemaVersion", "role", "path", "source", "stream", "status", "observedBytes", "bytes", "truncated",
    ])
      && record.schemaVersion === "explorers-public-stream-artifact/v1"
      && record.role === definition.role && record.path === definition.path
      && record.source === definition.source && record.stream === definition.stream
      && ["captured", "unavailable"].includes(record.status)
      && Number.isSafeInteger(record.observedBytes) && record.observedBytes >= 0
      && Number.isSafeInteger(record.bytes) && record.bytes >= 0 && record.bytes <= 4_096
      && typeof record.truncated === "boolean"
      && (record.status !== "unavailable"
        || (record.observedBytes === 0 && record.bytes === 0 && record.truncated === false));
  });
}

export function finalizeQualificationRunArtifacts({
  runDirectory: runDirectoryInput,
  workspaceRoot,
  knownSecrets = [],
  streamArtifacts,
  fixtureAuthority,
  analyticsLedger,
  visualTraceLedger,
  dockerInspection,
  skipLedger,
  restorationRecord,
  journeyOutcomeLedger,
  journeyOutcomeLedgerPersisted = false,
  mutationGuard,
  evidence,
} = {}) {
  const runDirectory = requireGuardedRunDirectory(runDirectoryInput);
  if (typeof workspaceRoot !== "string" || !path.isAbsolute(workspaceRoot)
      || !Array.isArray(knownSecrets) || knownSecrets.some((secret) => typeof secret !== "string")
      || !evidence || typeof evidence !== "object" || Array.isArray(evidence)
      || Object.hasOwn(evidence, "streams") || Object.hasOwn(evidence, "journeyOutcomes")
      || !validateMusicInitialSnapshotQualificationRecord(evidence.initialSnapshotQualification)
      || !validateMusicPrebrowserQualificationRecord(evidence.prebrowserQualification)
      || !validStateServiceLifecycle(evidence.stateServiceLifecycle)) {
    fail("qualification finalization contract is invalid");
  }
  const normalizedStreams = normalizedQualificationStreamInputs(streamArtifacts);
  validateVisualTraceLedgerObject(runDirectory, visualTraceLedger);
  if (!validFixtureAuthorityRecord(fixtureAuthority)
      || (!validObservedAnalyticsLedger(analyticsLedger) && !validUnavailableAnalyticsLedger(analyticsLedger))
      || !validDockerInspection(dockerInspection) || !validSkipLedger(skipLedger)
      || !validRestorationRecord(restorationRecord)
      || !validJourneyOutcomeTotals(skipLedger, journeyOutcomeLedger)
      || typeof journeyOutcomeLedgerPersisted !== "boolean") fail("qualification structured artifact contract is invalid");
  const retainedMutationGuard = resolvedMutationGuard(runDirectory, mutationGuard);
  if (!validateMusicMutationGuardRecord(retainedMutationGuard)) fail("qualification mutation guard contract is invalid");
  for (const value of [
    fixtureAuthority, analyticsLedger, visualTraceLedger, dockerInspection, skipLedger, restorationRecord,
    journeyOutcomeLedger, retainedMutationGuard, evidence,
  ]) assertSafeStructuredArtifact(value, { knownSecrets, workspaceRoot });
  const streamRecords = normalizedStreams.map(({ definition, input }) => {
    const written = writeSanitizedQualificationLog({
      runDirectory,
      relativePath: definition.path,
      chunks: input.chunks,
      workspaceRoot,
      knownSecrets,
      forceTruncated: input.truncated || input.observedBytes > input.chunks.reduce(
        (total, chunk) => total + Buffer.byteLength(chunk), 0,
      ),
    });
    return {
      schemaVersion: "explorers-public-stream-artifact/v1",
      role: definition.role,
      path: definition.path,
      source: definition.source,
      stream: definition.stream,
      status: input.status,
      observedBytes: input.observedBytes,
      bytes: written.bytes,
      truncated: input.status === "captured" ? written.truncated : false,
    };
  });
  if (!validQualificationStreamRecords(streamRecords)) fail("qualification stream artifact contract is invalid");
  const retainedEvidence = {
    ...evidence, journeyOutcomes: journeyOutcomeLedger, mutationGuard: retainedMutationGuard, streams: streamRecords,
  };
  assertSafeStructuredArtifact(retainedEvidence, { knownSecrets, workspaceRoot });
  retainJourneyOutcomeLedger({
    runDirectory,
    ledger: journeyOutcomeLedger,
    alreadyPersisted: journeyOutcomeLedgerPersisted,
    knownSecrets,
    workspaceRoot,
  });
  retainMutationGuard({
    runDirectory, record: retainedMutationGuard, knownSecrets, workspaceRoot,
  });
  writeCanonicalStructuredArtifact({
    runDirectory, relativePath: "fixture-authority.json", value: fixtureAuthority,
    knownSecrets, workspaceRoot,
  });
  writeQualificationAnalyticsLedger({ runDirectory, ledger: analyticsLedger });
  writeCanonicalStructuredArtifact({
    runDirectory, relativePath: "visual-trace-ledger.json", value: visualTraceLedger,
    knownSecrets, workspaceRoot, compact: true,
  });
  for (const [relativePath, value] of [
    ["docker-inspection.json", dockerInspection],
    ["skip-reasons.json", skipLedger],
    ["restoration.json", restorationRecord],
    ["evidence.json", retainedEvidence],
  ]) writeCanonicalStructuredArtifact({ runDirectory, relativePath, value, knownSecrets, workspaceRoot });
  const created = createQualificationArtifactManifest({ runDirectory });
  const verified = verifyQualificationArtifactManifest({ runDirectory });
  if (created.manifestSha256 !== verified.manifestSha256 || created.files !== verified.files) {
    fail("qualification manifest did not verify after creation");
  }
  return { files: verified.files, manifestSha256: verified.manifestSha256, verified: true };
}

function isExactKeySet(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
}

function validateRequiredArtifacts(requiredArtifacts) {
  if (!Array.isArray(requiredArtifacts) || requiredArtifacts.length === 0) {
    fail("required qualification artifact contract is invalid");
  }
  const roles = new Set();
  const paths = new Set();
  for (const artifact of requiredArtifacts) {
    if (!isExactKeySet(artifact, ["role", "path"])
        || typeof artifact.role !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(artifact.role)) {
      fail("required qualification artifact contract is invalid");
    }
    safeArtifactPath(path.resolve("."), artifact.path);
    if (roles.has(artifact.role) || paths.has(artifact.path)) {
      fail("required qualification artifact contract contains duplicates");
    }
    roles.add(artifact.role);
    paths.add(artifact.path);
  }
}

function requireGuardedRunDirectory(runDirectoryInput) {
  const runDirectory = path.resolve(runDirectoryInput ?? "");
  const artifactParent = path.dirname(runDirectory);
  if (path.basename(artifactParent) !== "music-public" || path.basename(path.dirname(artifactParent)) !== ".artifacts") {
    fail("qualification run directory is outside the guarded artifact parent");
  }
  try {
    const runStat = lstatSync(runDirectory);
    const parentStat = lstatSync(artifactParent);
    if (!runStat.isDirectory() || runStat.isSymbolicLink() || !parentStat.isDirectory() || parentStat.isSymbolicLink()) {
      fail("qualification run directory must be a regular guarded directory");
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("qualification ")) throw error;
    fail("qualification run directory must be a regular guarded directory");
  }
  return runDirectory;
}

function hashRegularFile(file) {
  let descriptor;
  try {
    const observed = lstatSync(file);
    if (!observed.isFile() || observed.isSymbolicLink()) fail("required qualification artifact must be a regular file");
    descriptor = openSync(file, "r");
    const initial = fstatSync(descriptor);
    if (!initial.isFile()) fail("required qualification artifact must be a regular file");
    const hash = createHash("sha256");
    const chunk = Buffer.allocUnsafe(64 * 1024);
    let bytes = 0;
    for (;;) {
      const count = readSync(descriptor, chunk, 0, chunk.length, null);
      if (count === 0) break;
      bytes += count;
      hash.update(chunk.subarray(0, count));
    }
    const final = fstatSync(descriptor);
    if (final.size !== initial.size || bytes !== initial.size) fail("qualification artifact changed while hashing");
    return { bytes, sha256: hash.digest("hex") };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("qualification ")) throw error;
    fail("required qualification artifact is missing or unreadable");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function canonicalManifest(runDirectory, requiredArtifacts = LIVE_QUALIFICATION_REQUIRED_ARTIFACTS) {
  validateRequiredArtifacts(requiredArtifacts);
  const artifacts = requiredArtifacts.map((artifact) => ({
    role: artifact.role,
    path: artifact.path,
    ...hashRegularFile(safeArtifactPath(runDirectory, artifact.path)),
  }));
  const bytes = Buffer.from(`${JSON.stringify({ schemaVersion: SCHEMA_VERSION, artifacts }, null, 2)}\n`, "utf8");
  return { artifacts, bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function writeExclusive(file, content) {
  try {
    writeFileSync(file, content, { flag: "wx", mode: 0o600 });
  } catch {
    fail("manifest files already exist");
  }
}

export function createQualificationArtifactManifest({
  runDirectory: runDirectoryInput,
  requiredArtifacts,
} = {}) {
  const runDirectory = requireGuardedRunDirectory(runDirectoryInput);
  const exactRequiredArtifacts = requiredArtifacts ?? requiredArtifactsForRun(runDirectory);
  const manifestPath = path.join(runDirectory, MANIFEST_NAME);
  const sidecarPath = path.join(runDirectory, SIDECAR_NAME);
  if (existsSync(manifestPath) || existsSync(sidecarPath)) fail("manifest files already exist");
  const canonical = canonicalManifest(runDirectory, exactRequiredArtifacts);
  let manifestCreated = false;
  try {
    writeExclusive(manifestPath, canonical.bytes);
    manifestCreated = true;
    writeExclusive(sidecarPath, `${canonical.sha256}\n`);
  } catch (error) {
    if (manifestCreated && !existsSync(sidecarPath)) {
      try { unlinkSync(manifestPath); } catch { /* failed creation remains fail-closed */ }
    }
    throw error;
  }
  return { schemaVersion: SCHEMA_VERSION, files: canonical.artifacts.length, manifestSha256: canonical.sha256 };
}

function readBoundedRegularFile(file, maximumBytes) {
  try {
    const observed = lstatSync(file);
    if (!observed.isFile() || observed.isSymbolicLink() || observed.nlink !== 1
        || observed.size > maximumBytes) {
      fail("manifest files are missing or unreadable");
    }
    return readFileSync(file);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("manifest ")) throw error;
    fail("manifest files are missing or unreadable");
  }
}

function expectedDirectories(requiredArtifacts) {
  const directories = new Set();
  for (const artifact of requiredArtifacts) {
    let current = path.posix.dirname(artifact.path);
    while (current !== ".") {
      directories.add(current);
      current = path.posix.dirname(current);
    }
  }
  return directories;
}

function assertQualificationFileSet(runDirectory, requiredArtifacts) {
  const expectedFiles = new Set([
    ...requiredArtifacts.map(({ path: relativePath }) => relativePath),
    MANIFEST_NAME,
    SIDECAR_NAME,
  ]);
  const allowedDirectories = expectedDirectories(requiredArtifacts);
  const observedFiles = [];
  const walk = (directory, prefix = "") => {
    let names;
    try { names = readdirSync(directory); } catch { fail("qualification artifact file set mismatch"); }
    for (const name of names) {
      const relativePath = prefix ? `${prefix}/${name}` : name;
      const absolutePath = path.join(directory, name);
      let observed;
      try { observed = lstatSync(absolutePath); } catch { fail("qualification artifact file set mismatch"); }
      if (observed.isSymbolicLink()) fail("qualification artifact file set mismatch");
      if (observed.isDirectory()) {
        if (!allowedDirectories.has(relativePath)) fail("qualification artifact file set mismatch");
        walk(absolutePath, relativePath);
      } else if (observed.isFile()) observedFiles.push(relativePath);
      else fail("qualification artifact file set mismatch");
    }
  };
  walk(runDirectory);
  const expected = [...expectedFiles].sort();
  const observed = observedFiles.sort();
  if (expected.length !== observed.length || expected.some((entry, index) => entry !== observed[index])) {
    fail("qualification artifact file set mismatch");
  }
}

function verifyQualificationStreamEvidence(runDirectory, manifestArtifacts) {
  let evidence;
  try {
    const bytes = readBoundedRegularFile(safeArtifactPath(runDirectory, "evidence.json"), MAX_LEDGER_BYTES);
    evidence = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("qualification stream metadata contract is invalid");
  }
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)
      || !validStateServiceLifecycle(evidence.stateServiceLifecycle)
      || !validateMusicInitialSnapshotQualificationRecord(evidence.initialSnapshotQualification)
      || !validateMusicPrebrowserQualificationRecord(evidence.prebrowserQualification)
      || !validQualificationStreamRecords(evidence.streams)) {
    fail("qualification stream metadata contract is invalid");
  }
  const manifestByRole = new Map(manifestArtifacts.map((artifact) => [artifact.role, artifact]));
  for (const record of evidence.streams) {
    const artifact = manifestByRole.get(record.role);
    if (!artifact || artifact.path !== record.path || artifact.bytes !== record.bytes) {
      fail("qualification stream metadata contract is invalid");
    }
  }
}

function verifyFixtureAuthorityEvidence(runDirectory, manifestArtifacts) {
  let value;
  let bytes;
  try {
    bytes = readBoundedRegularFile(safeArtifactPath(runDirectory, "fixture-authority.json"), MAX_LEDGER_BYTES);
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("fixture authority evidence contract is invalid");
  }
  if (!validFixtureAuthorityRecord(value)
      || !bytes.equals(Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"))) {
    fail("fixture authority evidence contract is invalid");
  }
  const artifact = manifestArtifacts.find(({ role }) => role === "fixture-authority");
  if (!artifact || artifact.path !== "fixture-authority.json" || artifact.bytes !== bytes.length) {
    fail("fixture authority evidence contract is invalid");
  }
}

function verifyJourneyOutcomeEvidence(runDirectory, manifestArtifacts) {
  let ledger;
  let ledgerBytes;
  let evidence;
  try {
    ledgerBytes = readBoundedRegularFile(safeArtifactPath(runDirectory, "journey-outcomes.json"), MAX_LEDGER_BYTES);
    ledger = JSON.parse(ledgerBytes.toString("utf8"));
    evidence = JSON.parse(readBoundedRegularFile(safeArtifactPath(runDirectory, "evidence.json"), MAX_LEDGER_BYTES).toString("utf8"));
  } catch {
    fail("qualification journey outcome evidence contract is invalid");
  }
  if (!validateSanitizedJourneyOutcomeLedger(ledger, { allowHistorical: true })
      || !ledgerBytes.equals(Buffer.from(`${JSON.stringify(ledger, null, 2)}\n`, "utf8"))
      || JSON.stringify(evidence?.journeyOutcomes) !== JSON.stringify(ledger)) {
    fail("qualification journey outcome evidence contract is invalid");
  }
  const artifact = manifestArtifacts.find(({ role }) => role === "journey-outcomes");
  if (!artifact || artifact.path !== "journey-outcomes.json" || artifact.bytes !== ledgerBytes.length) {
    fail("qualification journey outcome evidence contract is invalid");
  }
}

function verifyMutationGuardEvidence(runDirectory, manifestArtifacts) {
  let record;
  let bytes;
  let evidence;
  try {
    bytes = readBoundedRegularFile(safeArtifactPath(runDirectory, "mutation-guard.json"), 1024);
    record = JSON.parse(bytes.toString("utf8"));
    evidence = JSON.parse(readBoundedRegularFile(safeArtifactPath(runDirectory, "evidence.json"), MAX_LEDGER_BYTES).toString("utf8"));
  } catch { fail("qualification mutation guard evidence contract is invalid"); }
  if (!validateMusicMutationGuardRecord(record)
      || !bytes.equals(Buffer.from(`${JSON.stringify(record)}\n`, "utf8"))
      || JSON.stringify(evidence?.mutationGuard) !== JSON.stringify(record)) {
    fail("qualification mutation guard evidence contract is invalid");
  }
  const artifact = manifestArtifacts.find(({ role }) => role === "mutation-guard");
  if (!artifact || artifact.path !== "mutation-guard.json" || artifact.bytes !== bytes.length) {
    fail("qualification mutation guard evidence contract is invalid");
  }
}

export function verifyQualificationArtifactManifest({
  runDirectory: runDirectoryInput,
  requiredArtifacts,
} = {}) {
  const runDirectory = requireGuardedRunDirectory(runDirectoryInput);
  const exactRequiredArtifacts = requiredArtifacts ?? requiredArtifactsForRun(runDirectory);
  validateRequiredArtifacts(exactRequiredArtifacts);
  let manifestBytes;
  let sidecar;
  try {
    manifestBytes = readBoundedRegularFile(path.join(runDirectory, MANIFEST_NAME), MAX_MANIFEST_BYTES);
    sidecar = readBoundedRegularFile(path.join(runDirectory, SIDECAR_NAME), 65).toString("utf8");
  } catch {
    fail("manifest files are missing or unreadable");
  }
  if (!/^[a-f0-9]{64}\n$/.test(sidecar)) fail("manifest sidecar format is invalid");
  const observedHash = createHash("sha256").update(manifestBytes).digest("hex");
  if (observedHash !== sidecar.trim()) fail("manifest sidecar hash mismatch");
  let manifest;
  try { manifest = JSON.parse(manifestBytes.toString("utf8")); } catch { fail("manifest JSON is invalid"); }
  if (!isExactKeySet(manifest, ["schemaVersion", "artifacts"])
      || manifest.schemaVersion !== SCHEMA_VERSION || !Array.isArray(manifest.artifacts)) {
    fail("manifest contract is invalid");
  }
  const roles = new Set();
  const paths = new Set();
  for (const artifact of manifest.artifacts) {
    if (!isExactKeySet(artifact, ["role", "path", "bytes", "sha256"])
        || typeof artifact.role !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(artifact.role)
        || !Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0
        || typeof artifact.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(artifact.sha256)) {
      fail("manifest contract is invalid");
    }
    safeArtifactPath(runDirectory, artifact.path);
    if (roles.has(artifact.role) || paths.has(artifact.path)) fail("manifest contains duplicate role or path");
    roles.add(artifact.role);
    paths.add(artifact.path);
  }
  const actualContract = manifest.artifacts.map(({ role, path: relativePath }) => ({ role, path: relativePath }));
  if (JSON.stringify(actualContract) !== JSON.stringify(exactRequiredArtifacts)) {
    fail("manifest required artifact set mismatch");
  }
  const canonicalBytes = Buffer.from(`${JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    artifacts: manifest.artifacts.map(({ role, path: relativePath, bytes, sha256 }) => ({
      role, path: relativePath, bytes, sha256,
    })),
  }, null, 2)}\n`, "utf8");
  if (!manifestBytes.equals(canonicalBytes)) fail("manifest JSON is not canonical");
  for (const artifact of manifest.artifacts) {
    const current = hashRegularFile(safeArtifactPath(runDirectory, artifact.path));
    if (current.bytes !== artifact.bytes) fail("qualification artifact byte count mismatch");
    if (current.sha256 !== artifact.sha256) fail("qualification artifact SHA-256 mismatch");
  }
  assertQualificationFileSet(runDirectory, exactRequiredArtifacts);
  verifyQualificationStreamEvidence(runDirectory, manifest.artifacts);
  verifyFixtureAuthorityEvidence(runDirectory, manifest.artifacts);
  verifyJourneyOutcomeEvidence(runDirectory, manifest.artifacts);
  verifyMutationGuardEvidence(runDirectory, manifest.artifacts);
  return { schemaVersion: SCHEMA_VERSION, files: manifest.artifacts.length, manifestSha256: observedHash };
}

export function createExclusiveQualificationRunDirectory({ artifactParent, runId }) {
  if (typeof artifactParent !== "string" || artifactParent.length === 0 || !SAFE_RUN_ID.test(runId ?? "")) {
    throw new Error("Qualification artifact parent and safe run ID are required");
  }
  const exactParent = path.resolve(artifactParent);
  if (path.basename(exactParent) !== "music-public" || path.basename(path.dirname(exactParent)) !== ".artifacts") {
    throw new Error("Qualification artifact parent must be the exact .artifacts/music-public directory");
  }
  mkdirSync(exactParent, { recursive: true, mode: 0o700 });
  const parentStat = lstatSync(exactParent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    throw new Error("Qualification artifact parent must be a regular directory");
  }
  const runDirectory = path.resolve(exactParent, runId);
  if (path.dirname(runDirectory) !== exactParent) {
    throw new Error("Qualification run directory must be a direct child of its guarded parent");
  }
  mkdirSync(runDirectory, { recursive: false, mode: 0o700 });
  return runDirectory;
}

function main() {
  const [operation, runDirectory, ...extra] = process.argv.slice(2);
  if (extra.length > 0 || !runDirectory || !["create", "verify"].includes(operation)) {
    fail("usage: music-public-qualification-artifacts <create|verify> <run-directory>");
  }
  const result = operation === "create"
    ? createQualificationArtifactManifest({ runDirectory })
    : verifyQualificationArtifactManifest({ runDirectory });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { main(); } catch (error) {
    const message = error instanceof Error ? error.message : "unknown failure";
    process.stderr.write(`qualification artifact error: ${message}\n`);
    process.exitCode = 1;
  }
}
