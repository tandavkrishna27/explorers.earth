import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  MUSIC_PREBROWSER_C14_AUTHORITY_ARGS,
  runMusicPrebrowserC14Cli,
} from "./music-public-prebrowser-c14-cli.mjs";
import { runMusicPublicSocketC15Qualification } from "./music-public-socket-c15.mjs";

export const MUSIC_PUBLIC_SOCKET_C15_CLI_VERSION = "explorers-public-socket-c15-cli/v1";

const C15_GATE = "MUSIC_C15_SOCKET_PROXY_TEST";
const TERMINAL_MAX_BYTES = 16 * 1024;
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

function exactC15Gate(environment) {
  if (!environment || typeof environment !== "object" || Array.isArray(environment)) return false;
  const c15Keys = Object.keys(environment).filter((key) => key.toUpperCase().startsWith("MUSIC_C15_"));
  return c15Keys.length === 1 && c15Keys[0] === C15_GATE && environment[C15_GATE] === "1";
}

function withoutC15Gate(environment) {
  const clean = { ...environment };
  delete clean[C15_GATE];
  return clean;
}

function unavailableFinalRestore() {
  return { status: "not-run", databaseEqual: false, profileEqual: false };
}

function unavailableCleanup() {
  return {
    status: "not-required", code: "none", stateServiceStopped: false,
    fixtureDown: false, authorityRetired: false, tempRemoved: false,
  };
}

function refusalRecord() {
  return {
    schemaVersion: MUSIC_PUBLIC_SOCKET_C15_CLI_VERSION,
    result: "failed",
    stage: "preflight",
    code: "ambient-refused",
    exitCode: 3,
    counts: { connections: 0, reconnects: 0 },
    finalRestore: unavailableFinalRestore(),
    cleanup: unavailableCleanup(),
  };
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
  ]) && ["not-required", "passed", "failed"].includes(value.status)
    && CLEANUP_CODES.has(value.code)
    && [value.stateServiceStopped, value.fixtureDown, value.authorityRetired, value.tempRemoved]
      .every((item) => typeof item === "boolean")
    && (value.status === "failed" ? value.code !== "none" : value.code === "none")
    && (value.status !== "not-required"
      || [value.stateServiceStopped, value.fixtureDown, value.authorityRetired, value.tempRemoved]
        .every((item) => item === false));
}

export function validateMusicPublicSocketC15CliRecord(value) {
  if (!exactKeys(value, [
    "schemaVersion", "result", "stage", "code", "exitCode", "counts", "finalRestore", "cleanup",
  ]) || value.schemaVersion !== MUSIC_PUBLIC_SOCKET_C15_CLI_VERSION
      || !["passed", "failed"].includes(value.result) || !STAGES.has(value.stage)
      || !CODES.has(value.code) || ![0, 3, 4, 5].includes(value.exitCode)
      || !exactKeys(value.counts, ["connections", "reconnects"])
      || ![[0, 0], [2, 1]].some(([connections, reconnects]) => (
        value.counts.connections === connections && value.counts.reconnects === reconnects
      )) || !validFinalRestore(value.finalRestore) || !validCleanup(value.cleanup)) return false;
  if (value.result === "passed") {
    return value.stage === "complete" && value.code === "none" && value.exitCode === 0
      && value.counts.connections === 2 && value.counts.reconnects === 1
      && value.finalRestore.status === "passed" && value.finalRestore.databaseEqual
      && value.finalRestore.profileEqual && value.cleanup.status === "passed"
      && value.cleanup.stateServiceStopped && value.cleanup.fixtureDown
      && value.cleanup.authorityRetired && value.cleanup.tempRemoved;
  }
  return value.exitCode !== 0 && value.counts.connections === 0 && value.counts.reconnects === 0
    && !(value.stage === "complete" && value.code === "none");
}

function mapC14Outcome(outcome) {
  const passed = outcome?.exitCode === 0 && outcome?.record?.result === "passed";
  return {
    exitCode: Number.isSafeInteger(outcome?.exitCode) ? outcome.exitCode : 5,
    record: {
      schemaVersion: MUSIC_PUBLIC_SOCKET_C15_CLI_VERSION,
      result: passed ? "passed" : "failed",
      stage: outcome?.record?.stage ?? "preflight",
      code: outcome?.record?.code ?? "unexpected-failure",
      exitCode: Number.isSafeInteger(outcome?.exitCode) ? outcome.exitCode : 5,
      counts: passed ? { connections: 2, reconnects: 1 } : { connections: 0, reconnects: 0 },
      finalRestore: outcome?.record?.finalRestore ?? unavailableFinalRestore(),
      cleanup: outcome?.record?.cleanup ?? unavailableCleanup(),
    },
  };
}

export async function runMusicPublicSocketC15Cli({
  args = [],
  environment = process.env,
  dependencies,
  cwd = process.cwd(),
  socketFactory,
  prebrowserRunner,
} = {}) {
  if (!exactC15Gate(environment)) return { exitCode: 3, record: refusalRecord() };
  if (!(socketFactory === undefined || typeof socketFactory === "function")
      || !(prebrowserRunner === undefined || typeof prebrowserRunner === "function")) {
    return {
      exitCode: 3,
      record: { ...refusalRecord(), code: "invocation-refused" },
    };
  }
  const qualificationRunner = (input) => runMusicPublicSocketC15Qualification({
    ...input,
    socketFactory,
    prebrowserRunner,
  });
  const runtimeDependencies = dependencies && typeof dependencies === "object" && !Array.isArray(dependencies)
    ? { ...dependencies, qualify: qualificationRunner }
    : dependencies;
  const outcome = await runMusicPrebrowserC14Cli({
    args,
    environment: withoutC15Gate(environment),
    dependencies: runtimeDependencies,
    cwd,
    qualificationRunner,
  });
  const mapped = mapC14Outcome(outcome);
  return validateMusicPublicSocketC15CliRecord(mapped.record)
    ? mapped
    : { exitCode: 5, record: { ...refusalRecord(), code: "unexpected-failure", exitCode: 5 } };
}

async function main() {
  let outcome;
  try {
    outcome = await runMusicPublicSocketC15Cli({
      args: process.argv.slice(2),
      environment: process.env,
    });
  } catch {
    outcome = { exitCode: 5, record: { ...refusalRecord(), code: "unexpected-failure", exitCode: 5 } };
  }
  let line = JSON.stringify(outcome.record);
  if (!validateMusicPublicSocketC15CliRecord(outcome.record)
      || Buffer.byteLength(line) > TERMINAL_MAX_BYTES) {
    outcome = { exitCode: 5, record: { ...refusalRecord(), code: "unexpected-failure", exitCode: 5 } };
    line = JSON.stringify(outcome.record);
  }
  process.stdout.write(`${line}\n`);
  process.exitCode = outcome.exitCode;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}

export { MUSIC_PREBROWSER_C14_AUTHORITY_ARGS as MUSIC_PUBLIC_SOCKET_C15_AUTHORITY_ARGS };
