import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createConnection } from "node:net";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createMusicFixtureStateServiceGuard, stopMusicFixture } from "./music-fixture-cleanup.mjs";
import {
  buildSanitizedJourneyOutcomeLedger,
  runLivePreflight,
  runPlaywrightJourneyExecution,
} from "./music-public-live-preflight.mjs";
import {
  createMusicQualificationFailureCoordinator,
  runMusicFixtureOrchestration,
} from "./music-public-e2e-runner.mjs";
import {
  isDistinctMusicCallbackCredential,
  runLoopbackMusicPrebrowserQualification,
  unavailableMusicPrebrowserQualification,
} from "./music-public-prebrowser-qualification.mjs";
import {
  decodeMusicInitialSnapshotResponse,
  musicInitialSnapshotRequestFailure,
  readMusicInitialSnapshotHttpResponse,
  unavailableMusicInitialSnapshotQualification,
} from "./music-public-initial-snapshot.mjs";
import {
  MUSIC_PUBLIC_LIVE_AUTHORITY_ARGS,
  MUSIC_PUBLIC_LIVE_ACKNOWLEDGEMENT,
  MUSIC_PUBLIC_LIVE_FIXTURE_VERSION,
  buildMusicPublicLiveAuthority,
} from "./music-public-live-authority.mjs";
import {
  assessQualificationCleanup,
  buildQualificationOutcomeRecords,
  captureQualificationFixtureAuthority,
  captureQualificationLifecycleCommand,
  createExclusiveQualificationRunDirectory,
  createUnavailableQualificationFixtureAuthority,
  createUnavailableQualificationStreamArtifacts,
  finalizeQualificationRunArtifacts,
  inspectQualificationDockerCleanup,
  LIVE_QUALIFICATION_REQUIRED_ARTIFACTS,
} from "./music-public-qualification-artifacts.mjs";

const VERSION = MUSIC_PUBLIC_LIVE_FIXTURE_VERSION;
const CONFIRMATION = MUSIC_PUBLIC_LIVE_ACKNOWLEDGEMENT;
const MODES = {
  fast: { lane: "pr-safe", project: "chromium-pr-safe", files: ["e2e/music-harness-contract.spec.ts", "e2e/music-fullstack.spec.ts"] },
  pr: { lane: "pr-safe", project: "chromium-pr-safe", files: [
    "e2e/analytics.spec.ts",
    "e2e/music-public-contract.spec.ts",
    "e2e/music-fullstack.spec.ts",
    "e2e/music-accessibility.spec.ts",
    "e2e/profile-theme.spec.ts",
    "e2e/profile-presentation-visual.spec.ts",
    "e2e/music-harness-contract.spec.ts",
  ] },
  e2e: { lane: "fixture", project: "chromium-music-fixture", files: [] },
  live: { lane: "live", project: "chromium-music-live", files: [] },
  verify: { lane: "fixture", project: "chromium-pr-safe", files: ["e2e/music-harness-contract.spec.ts"] },
};

const modeName = process.argv[2] ?? "verify";
const dryRun = process.argv.includes("--dry-run");
const mode = MODES[modeName];
if (!mode) {
  process.stderr.write(`Unknown public Music test mode: ${modeName}\n`);
  process.exit(2);
}

let liveAuthority;
if (mode.lane === "live") {
  try {
    liveAuthority = buildMusicPublicLiveAuthority({
      args: process.argv.slice(3),
      environment: process.env,
      randomBytes,
    });
  } catch {
    process.stderr.write("Live public Music E2E refused: use the exact documented local fixture command; ambient authority is forbidden.\n");
    process.exit(3);
  }
  Object.assign(process.env, liveAuthority.environment);
}

const runId = liveAuthority?.runId
  ?? (process.env.MUSIC_PUBLIC_RUN_ID ?? new Date().toISOString().replace(/\D/g, "")).replace(/[^a-zA-Z0-9_-]/g, "-");
const evidencePath = `.artifacts/music-public/${runId}/evidence.json`;
const externalUrl = liveAuthority?.externalUrl
  ?? process.env.PLAYWRIGHT_EXTERNAL_BASE_URL ?? "http://127.0.0.1:5173";
const username = liveAuthority?.username ?? process.env.MUSIC_E2E_ACCOUNT_USERNAME ?? "not-configured";
const namespace = username.match(/^(e2e-public-music-[a-z0-9-]+)-owner$/)?.[1];
const accountDocumentId = liveAuthority?.accountDocumentId
  ?? process.env.MUSIC_E2E_ACCOUNT_DOCUMENT_ID ?? (namespace ? `${namespace}-account` : "not-configured");
const userDocumentId = liveAuthority?.userDocumentId
  ?? process.env.MUSIC_E2E_USER_DOCUMENT_ID ?? (namespace ? `${namespace}-user` : "not-configured");
const fixtureVersion = liveAuthority?.fixtureVersion ?? process.env.MUSIC_E2E_FIXTURE_VERSION ?? "not-configured";
const configuredServiceOrigins = liveAuthority?.serviceOrigins
  ?? (process.env.MUSIC_E2E_SERVICE_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
const healthUrls = liveAuthority?.healthUrls
  ?? (process.env.MUSIC_E2E_HEALTH_URLS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
const namespaceResetConfirmation = liveAuthority?.namespaceResetConfirmation
  ?? process.env.MUSIC_E2E_NAMESPACE_RESET_CONFIRMATION;
const strapiUrl = liveAuthority?.strapiUrl ?? process.env.MUSIC_E2E_STRAPI_URL ?? "";
const strapiToken = liveAuthority?.fixtureToken ?? process.env.MUSIC_E2E_STRAPI_TOKEN ?? "";
const stateServiceUrl = "http://127.0.0.1:55174";

function loopbackHttp(raw) {
  try {
    const url = new URL(raw);
    return ["http:", "tcp:"].includes(url.protocol) && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

if (mode.lane === "live") {
  const namespaceMatch = username.match(/^(e2e-public-music-[a-z0-9-]+)-owner$/);
  const validIdentity = namespaceMatch && accountDocumentId === `${namespaceMatch[1]}-account`;
  const fiveServices = configuredServiceOrigins.length === 5 && healthUrls.length === 5;
  const fullSnapshotAuthority = strapiToken.length > 0 && loopbackHttp(strapiUrl)
    && namespaceResetConfirmation === "RESET_EXPLORERS_MUSIC_FIXTURE_NAMESPACE";
  const everyLoopback = [externalUrl, ...configuredServiceOrigins, ...healthUrls].every(loopbackHttp);
  if (process.env.MUSIC_E2E_LIVE_WRITE !== "true"
      || process.env.MUSIC_E2E_LIVE_WRITE_CONFIRMATION !== CONFIRMATION
      || fixtureVersion !== VERSION || !validIdentity || !fiveServices || !everyLoopback || !fullSnapshotAuthority) {
    process.stderr.write("Live public Music E2E refused: require MUSIC_E2E_LIVE_WRITE=true, exact confirmation, fixture version, namespaced account/document ID, loopback Strapi URL/token, five service loopback origins plus health URLs, and exact disposable namespace reset confirmation. Owner authority is minted only after callback bootstrap.\n");
    process.exit(3);
  }
}

const baseReport = {
  version: VERSION,
  runId,
  lane: mode.lane,
  fixtureVersion,
  accountDocumentId,
  username,
  services: configuredServiceOrigins.length > 0 ? configuredServiceOrigins : [externalUrl, process.env.MUSIC_API_BASE_URL ?? "http://127.0.0.1:3001"],
  evidencePath,
};

const artifactParent = path.resolve(".artifacts/music-public");
let runArtifactDirectory;
try {
  runArtifactDirectory = createExclusiveQualificationRunDirectory({ artifactParent, runId });
} catch {
  process.stderr.write("Live public Music E2E artifact initialization failed; details redacted.\n");
  process.exit(5);
}
const authStatePath = path.join(runArtifactDirectory, "owner-auth.json");
const profileStorageStatePath = path.join(runArtifactDirectory, "profile-storage-state.json");
const restoreEvidencePath = path.join(runArtifactDirectory, "restore-evidence.jsonl");
const journeyReportPath = path.join(runArtifactDirectory, "playwright-journey-results.json");
const privatePlaywrightOutputDirectory = path.join(runArtifactDirectory, "private-playwright-output");
const journeyOutcomeLedgerPath = path.join(runArtifactDirectory, "journey-outcomes.json");
const mutationGuardPath = path.join(runArtifactDirectory, "mutation-guard.json");
const mutationRecoveryPath = path.join(runArtifactDirectory, "mutation-recovery.private.jsonl");
let fixtureAuthorityRecord = createUnavailableQualificationFixtureAuthority();
let initialSnapshotQualificationRecord = unavailableMusicInitialSnapshotQualification();
let prebrowserQualificationRecord = unavailableMusicPrebrowserQualification();
let qualifierJwtFingerprint;

if (dryRun) {
  const report = {
    ...baseReport,
    result: "dry-run",
    cleanup: "not-required",
    git: { sha: "unavailable", reason: "dry-run" },
    command: ["node", "scripts/music-public-e2e.mjs", modeName, "--dry-run"],
    cwd: "<workspace>",
    exitCode: 0,
    totals: { total: 0, passed: 0, failed: 0, skipped: 0 },
    artifactPaths: [
      ...LIVE_QUALIFICATION_REQUIRED_ARTIFACTS.map((artifact) => artifact.path),
      "manifest.json",
      "manifest.sha256",
    ],
    visuals: [],
    traces: [],
    gaps: ["qualification-not-run", "analytics-not-observed", "docker-inspection-not-run"],
    lifecycleCommands: [],
    initialSnapshotQualification: initialSnapshotQualificationRecord,
    prebrowserQualification: prebrowserQualificationRecord,
    stateServiceLifecycle: {
      schemaVersion: "explorers-public-state-service-lifecycle/v1",
      error: { status: "unavailable" },
      exit: { status: "unavailable" },
      close: { status: "unavailable" },
    },
  };
  const stdoutLine = `${JSON.stringify(report)}\n`;
  const dockerCommands = {
    containers: [
      "docker", "ps", "-aq",
      "--filter", "label=com.explorers.music.fixture=true",
      "--filter", "label=com.explorers.music.project=explorers-music-fixture",
    ],
    volumes: [
      "docker", "volume", "ls", "-q",
      "--filter", "label=com.explorers.music.fixture=true",
      "--filter", "label=com.explorers.music.project=explorers-music-fixture",
    ],
  };
  try {
    finalizeQualificationRunArtifacts({
      runDirectory: runArtifactDirectory,
      workspaceRoot: process.cwd(),
      knownSecrets: [strapiToken],
      streamArtifacts: createUnavailableQualificationStreamArtifacts(),
      fixtureAuthority: fixtureAuthorityRecord,
      analyticsLedger: {
        schemaVersion: "explorers-public-analytics-ledger/v1",
        status: "unavailable",
        reason: "not-observed",
        events: [],
      },
      visualTraceLedger: {
        schemaVersion: "explorers-public-visual-trace-ledger/v1",
        status: "none-retained",
        visuals: [],
        traces: [],
      },
      dockerInspection: {
        schemaVersion: "explorers-public-docker-inspection/v1",
        status: "unavailable",
        reason: "dry-run",
        cwd: "<workspace>",
        labels: {
          "com.explorers.music.fixture": "true",
          "com.explorers.music.project": "explorers-music-fixture",
        },
        commands: dockerCommands,
        exitCodes: { containers: null, volumes: null },
        containerMatches: [],
        volumeMatches: [],
        containersRemaining: null,
        volumesRemaining: null,
        authArtifacts: [
          { path: "owner-auth.json", state: "absent" },
          { path: "profile-storage-state.json", state: "absent" },
        ],
      },
      skipLedger: {
        schemaVersion: "explorers-public-skip-ledger/v1",
        lane: mode.lane,
        execution: "not-run",
        totals: { total: 0, passed: 0, failed: 0, skipped: 0 },
        reasons: [{ scope: "lane", reason: "not-observed" }],
      },
      restorationRecord: {
        schemaVersion: "explorers-public-restoration/v1",
        status: "unavailable",
        finalRestore: null,
        journeys: [],
      },
      journeyOutcomeLedger: buildSanitizedJourneyOutcomeLedger({
        reportStatus: "not-run",
        terminalStatus: "not-run",
      }),
      evidence: report,
    });
  } catch {
    process.stderr.write("Live public Music E2E artifact finalization failed; details redacted.\n");
    process.exit(5);
  }
  process.stdout.write(stdoutLine);
  process.exit(0);
}

const monorepoRoot = path.resolve("..");
const npmExecPath = process.env.npm_execpath;
const lifecycleCommandRecords = [];
const qualificationStreamArtifacts = createUnavailableQualificationStreamArtifacts();
function writePublicStdout(text) {
  process.stdout.write(text);
}
function writePublicStderr(text) {
  process.stderr.write(text);
}
function retainQualificationStreams(streams) {
  for (const stream of streams) {
    const index = qualificationStreamArtifacts.findIndex((candidate) => (
      candidate.source === stream.source && candidate.stream === stream.stream
    ));
    if (index < 0) throw new Error("qualification stream source is not declared");
    qualificationStreamArtifacts[index] = stream;
  }
}
function runLifecycleCommand(stage) {
  const captured = captureQualificationLifecycleCommand({
    stage,
    processExecPath: process.execPath,
    npmExecPath,
    cwd: monorepoRoot,
    retainedCwd: "<repository>",
    environment: process.env,
    workspaceRoot: monorepoRoot,
    knownSecrets: [strapiToken, stateToken, orchestrationStateToken].filter(Boolean),
    spawn: spawnSync,
  });
  lifecycleCommandRecords.push(captured.record);
  retainQualificationStreams(captured.streamArtifacts);
  return captured.status;
}
function flushPrivateStateServiceOutput() {
  if (!stateServiceGuard || stateServiceOutputFlushed) return;
  stateServiceOutputFlushed = true;
  retainQualificationStreams(stateServiceGuard.streamInputs());
}
let fixtureLifecycleAttempted = false;
let journeyOutcomeCleanupRequired = false;
let stateServiceGuard;
let stateServiceOutputFlushed = false;
let stateToken;
let orchestrationStateToken;
let initialSnapshot;
let initialRestorePromise;
const qualificationCoordinator = createMusicQualificationFailureCoordinator();
let qualificationFailureMessage;
let failureSettlementPromise;
function fixtureTeardownContract() {
  return {
    artifactPaths: [
      restoreEvidencePath,
      authStatePath,
      profileStorageStatePath,
      journeyReportPath,
      mutationRecoveryPath,
      `${mutationRecoveryPath}.private-tmp`,
      ...(journeyOutcomeCleanupRequired
        ? [journeyOutcomeLedgerPath, `${journeyOutcomeLedgerPath}.private-tmp`]
        : []),
    ],
    artifactDirectories: [privatePlaywrightOutputDirectory],
    exists: existsSync,
    unlink: unlinkSync,
    removeDirectory: (directory) => rmSync(directory, { recursive: true, force: true }),
    stopStateService: async () => {
      try { if (stateServiceGuard) await stateServiceGuard.stop(); }
      finally { flushPrivateStateServiceOutput(); }
    },
    down: () => {
      if (!fixtureLifecycleAttempted) return 0;
      fixtureLifecycleAttempted = false;
      return runLifecycleCommand("fixture-down");
    },
  };
}
async function stopFixture() {
  return stopMusicFixture(fixtureTeardownContract());
}
async function restoreInitialSnapshot() {
  if (initialRestorePromise) return initialRestorePromise;
  initialRestorePromise = (async () => {
    if (!initialSnapshot || !orchestrationStateToken) return { ok: false, cleanup: "evidence-missing" };
    try {
      const response = await fetch(`${stateServiceUrl}/restore-final`, { method: "POST", headers: { Authorization: `Bearer ${orchestrationStateToken}`, "content-type": "application/json" }, body: JSON.stringify(initialSnapshot), signal: AbortSignal.timeout(60_000) });
      if (!response.ok) return { ok: false, cleanup: "restore-failed" };
      const result = await response.json();
      const expected = initialSnapshot?.database?.dumpHash;
      const ok = typeof expected === "string" && result.beforeHash === expected && result.afterHash === expected;
      return { ok, cleanup: ok ? "restored" : "restore-failed", beforeHash: result.beforeHash, afterHash: result.afterHash };
    } catch { return { ok: false, cleanup: "restore-failed" }; }
  })();
  return initialRestorePromise;
}
function qualificationCommit() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: monorepoRoot,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 4 * 1024,
  });
  const sha = String(result.stdout ?? "").trim();
  return result.status === 0 && /^[a-f0-9]{40}$/.test(sha)
    ? { sha }
    : { sha: "unavailable", reason: "git-inspection-failed" };
}
function finalizeCurrentQualification({ report, executionOutcome, exitCode, stage }) {
  const {
    skipLedger,
    restorationRecord,
    journeyOutcomeLedger,
    journeyOutcomeLedgerPersisted,
  } = buildQualificationOutcomeRecords({
    lane: mode.lane,
    executionOutcome,
    report,
  });
  const dockerInspection = inspectQualificationDockerCleanup({
    runDirectory: runArtifactDirectory,
    inspectionCwd: monorepoRoot,
    retainedCwd: "<repository>",
    spawn: spawnSync,
    exists: existsSync,
  });
  const cleanupAssessment = assessQualificationCleanup({
    lane: mode.lane,
    cleanup: report.cleanup,
    dockerInspection,
  });
  const qualificationExitCode = !cleanupAssessment.verified ? 5 : exitCode;
  const gaps = ["analytics-not-observed", "visuals-none-retained", "traces-none-retained"];
  gaps.push(...cleanupAssessment.gaps);
  if (skipLedger.execution !== "completed") gaps.push(`execution-${skipLedger.execution}`);
  const evidence = {
    version: VERSION,
    runId,
    lane: mode.lane,
    result: qualificationExitCode === 0 ? report.result : "failed",
    cleanup: mode.lane === "live" && ["restored", "not-required-safe"].includes(report.cleanup)
      && cleanupAssessment.gaps.some((gap) => gap.startsWith("docker-") || gap.startsWith("auth-artifact-"))
      ? "cleanup-inspection-failed"
      : report.cleanup,
    stage,
    git: qualificationCommit(),
    command: ["node", "scripts/music-public-e2e.mjs", modeName, ...MUSIC_PUBLIC_LIVE_AUTHORITY_ARGS],
    cwd: "<repository>/explorers-earth",
    exitCode: qualificationExitCode,
    totals: skipLedger.totals,
    artifactPaths: [
      ...LIVE_QUALIFICATION_REQUIRED_ARTIFACTS.map((artifact) => artifact.path),
      "manifest.json",
      "manifest.sha256",
    ],
    visuals: [],
    traces: [],
    gaps,
    lifecycleCommands: lifecycleCommandRecords,
    initialSnapshotQualification: report.initialSnapshotQualification ?? initialSnapshotQualificationRecord,
    prebrowserQualification: report.prebrowserQualification ?? prebrowserQualificationRecord,
    stateServiceLifecycle: stateServiceGuard?.snapshot().lifecycle ?? {
      schemaVersion: "explorers-public-state-service-lifecycle/v1",
      error: { status: "unavailable" },
      exit: { status: "unavailable" },
      close: { status: "unavailable" },
    },
  };
  const finalized = finalizeQualificationRunArtifacts({
    runDirectory: runArtifactDirectory,
    workspaceRoot: monorepoRoot,
    knownSecrets: [strapiToken, stateToken, orchestrationStateToken].filter(Boolean),
    streamArtifacts: qualificationStreamArtifacts,
    fixtureAuthority: fixtureAuthorityRecord,
    analyticsLedger: {
      schemaVersion: "explorers-public-analytics-ledger/v1",
      status: "unavailable",
      reason: skipLedger.execution === "preflight-stopped" ? "preflight-stopped"
        : (skipLedger.execution === "completed" ? "not-observed" : "execution-stopped"),
      events: [],
    },
    visualTraceLedger: {
      schemaVersion: "explorers-public-visual-trace-ledger/v1",
      status: "none-retained",
      visuals: [],
      traces: [],
    },
    dockerInspection,
    skipLedger,
    restorationRecord,
    journeyOutcomeLedger,
    journeyOutcomeLedgerPersisted,
    evidence,
  });
  return { ...finalized, exitCode: qualificationExitCode };
}
function recordQualificationFailure({
  message,
  exitCode = 4,
  stage,
  cleanupWhenTeardownSucceeds = "not-required-safe",
  executionOutcome,
}) {
  if (!qualificationCoordinator.snapshot().failure) qualificationFailureMessage = message;
  qualificationCoordinator.recordFailure({
    exitCode,
    stage,
    cleanupWhenTeardownSucceeds,
    executionOutcome,
  });
}
async function settleQualificationFailure() {
  if (!failureSettlementPromise) {
    failureSettlementPromise = (async () => {
      const failure = qualificationCoordinator.snapshot().failure;
      if (!failure) throw new Error("qualification failure settlement requires a recorded failure");
      let teardownStatus = 1;
      try { teardownStatus = await qualificationCoordinator.runTeardown(() => stopFixture()); }
      catch { teardownStatus = 1; }
      const cleanup = teardownStatus === 0 ? failure.cleanupWhenTeardownSucceeds : "teardown-failed";
      writePublicStderr(qualificationFailureMessage ?? "Live public Music E2E failed; details redacted.\n");
      const report = { ...baseReport, result: "failed", cleanup };
      writePublicStdout(`${JSON.stringify(report)}\n`);
      qualificationCoordinator.markReadyToFinalize();
      try {
        const finalized = await qualificationCoordinator.runFinalization(() => finalizeCurrentQualification({
          report,
          executionOutcome: failure.executionOutcome,
          exitCode: failure.exitCode,
          stage: failure.stage,
        }));
        return finalized.exitCode;
      } catch {
        process.stderr.write("Live public Music E2E artifact finalization failed; details redacted.\n");
        return 5;
      }
    })();
  }
  return failureSettlementPromise;
}
async function finishQualificationFailure(failure) {
  recordQualificationFailure(failure);
  return settleQualificationFailure();
}
async function settleIfQualificationFailed() {
  return qualificationCoordinator.snapshot().failure ? settleQualificationFailure() : undefined;
}

async function runLiveQualification() {
  if (!npmExecPath) {
    return finishQualificationFailure({
      message: "Live public Music E2E requires invocation through the documented npm script.\n",
      stage: "invocation-refused",
    });
  }
  const fixtureAuthority = captureQualificationFixtureAuthority({
    processExecPath: process.execPath,
    npmExecPath,
    cwd: monorepoRoot,
    retainedCwd: "<repository>",
    environment: process.env,
    spawn: spawnSync,
  });
  fixtureAuthorityRecord = fixtureAuthority.record;
  if (fixtureAuthority.status !== 0) return finishQualificationFailure({
    message: "Live public Music E2E fixture authority gate failed; details redacted.\n",
    stage: "fixture-authority-gate-failed",
  });
  fixtureLifecycleAttempted = true;
  const authorityBootstrapStatus = runLifecycleCommand("fixture-bootstrap");
  if (authorityBootstrapStatus !== 0) return finishQualificationFailure({
    message: "Live public Music E2E fixture authority bootstrap failed; details redacted.\n",
    stage: "fixture-bootstrap-failed",
  });
  const fixtureUpStatus = runLifecycleCommand("fixture-up");
  if (fixtureUpStatus !== 0) return finishQualificationFailure({
    message: "Live public Music E2E fixture startup failed; details redacted.\n",
    stage: "fixture-startup-failed",
  });
  stateToken = randomBytes(32).toString("base64url");
  orchestrationStateToken = randomBytes(32).toString("base64url");
  try {
    const stateService = spawn(process.execPath, ["tunes/scripts/music-e2e-state-service.mjs"], {
      cwd: monorepoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        MUSIC_E2E_STATE_TOKEN: stateToken,
        MUSIC_E2E_ORCHESTRATION_STATE_TOKEN: orchestrationStateToken,
        MUSIC_E2E_RUN_DIRECTORY: runArtifactDirectory,
        MUSIC_E2E_MUTATION_GUARD_PATH: mutationGuardPath,
        MUSIC_E2E_RECOVERY_ARTIFACT_PATH: mutationRecoveryPath,
      },
      windowsHide: true,
    });
    stateServiceGuard = createMusicFixtureStateServiceGuard({
      child: stateService,
      onFailure: ({ reason }) => recordQualificationFailure({
        message: "Live public Music E2E state service terminated unexpectedly; details redacted.\n",
        exitCode: 4,
        stage: reason === "state-service-error" ? "state-service-error" : "state-service-exit",
      }),
    });
  } catch {
    return finishQualificationFailure({
      message: "Live public Music E2E state service failed to spawn; details redacted.\n",
      exitCode: 4,
      stage: "state-service-error",
    });
  }
  const stateSpawnFailureExitCode = await settleIfQualificationFailed();
  if (stateSpawnFailureExitCode !== undefined) return stateSpawnFailureExitCode;
  for (const healthUrl of healthUrls) {
    const stateFailureExitCode = await settleIfQualificationFailed();
    if (stateFailureExitCode !== undefined) return stateFailureExitCode;
    if (healthUrl.startsWith(stateServiceUrl)) continue; // polled below with bounded startup retries
    let response;
    try {
      const endpoint = new URL(healthUrl);
      if (endpoint.protocol === "tcp:") {
        await new Promise((resolve, reject) => {
          const socket = createConnection({ host: endpoint.hostname, port: Number(endpoint.port) }, () => { socket.destroy(); resolve(); });
          socket.setTimeout(5_000, () => { socket.destroy(); reject(new Error("TCP health timeout")); });
          socket.once("error", reject);
        });
        const tcpStateFailureExitCode = await settleIfQualificationFailed();
        if (tcpStateFailureExitCode !== undefined) return tcpStateFailureExitCode;
        continue;
      }
      response = await fetch(healthUrl, { headers: healthUrl.startsWith(stateServiceUrl) ? { Authorization: `Bearer ${stateToken}` } : {}, signal: AbortSignal.timeout(5_000) });
    } catch {
      const stateFailureExitCodeAfterHealth = await settleIfQualificationFailed();
      if (stateFailureExitCodeAfterHealth !== undefined) return stateFailureExitCodeAfterHealth;
      return finishQualificationFailure({
        message: `Live public Music E2E health check failed for ${new URL(healthUrl).origin}; details redacted.\n`,
        stage: "service-health-failed",
      });
    }
    const stateFailureExitCodeAfterHealth = await settleIfQualificationFailed();
    if (stateFailureExitCodeAfterHealth !== undefined) return stateFailureExitCodeAfterHealth;
    if (!response.ok) {
      return finishQualificationFailure({
        message: `Live public Music E2E health check returned ${response.status} for ${new URL(healthUrl).origin}.\n`,
        stage: "service-health-failed",
      });
    }
  }
  let stateReady = false;
  for (let attempt = 0; attempt < 30 && !stateReady && !qualificationCoordinator.signal.aborted; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (qualificationCoordinator.signal.aborted) break;
    try {
      const response = await fetch(`${stateServiceUrl}/health`, { headers: { Authorization: `Bearer ${stateToken}` }, signal: AbortSignal.timeout(1_000) });
      stateReady = response.ok;
    } catch { /* service is still starting */ }
  }
  const stateStartupFailureExitCode = await settleIfQualificationFailed();
  if (stateStartupFailureExitCode !== undefined) return stateStartupFailureExitCode;
  if (!stateReady) {
    return finishQualificationFailure({
      message: "Live public Music E2E state service failed its loopback health check.\n",
      stage: "state-service-health-failed",
    });
  }
  try {
    const [accountResponse, identityResponse] = await Promise.all([
      fetch(`${strapiUrl}/api/accounts/${encodeURIComponent(accountDocumentId)}`, { headers: { Authorization: `Bearer ${strapiToken}` }, signal: AbortSignal.timeout(5_000) }),
      fetch(`${strapiUrl}/api/users/me`, { headers: { Authorization: `Bearer ${strapiToken}` }, signal: AbortSignal.timeout(5_000) }),
    ]);
    const account = await accountResponse.json(); const identity = await identityResponse.json();
    if (!accountResponse.ok || !identityResponse.ok || account.data?.documentId !== accountDocumentId
        || identity.username !== username || identity.documentId !== userDocumentId
        || identity.accounts?.[0]?.documentId !== accountDocumentId) throw new Error("fixture projected a different identity");
  } catch {
    const stateIdentityFailureExitCode = await settleIfQualificationFailed();
    if (stateIdentityFailureExitCode !== undefined) return stateIdentityFailureExitCode;
    return finishQualificationFailure({
      message: "Live public Music E2E identity readiness failed; details redacted.\n",
      stage: "identity-readiness-failed",
    });
  }
  const stateIdentityFailureExitCode = await settleIfQualificationFailed();
  if (stateIdentityFailureExitCode !== undefined) return stateIdentityFailureExitCode;
  process.env.MUSIC_E2E_STATE_SERVICE_URL = stateServiceUrl;
  process.env.MUSIC_E2E_STATE_TOKEN = stateToken;
  try {
    const snapshotResponse = await fetch(`${stateServiceUrl}/snapshot`, { method: "POST", headers: { Authorization: `Bearer ${orchestrationStateToken}` }, signal: AbortSignal.timeout(60_000) });
    const snapshotPayload = await readMusicInitialSnapshotHttpResponse(snapshotResponse);
    const decoded = decodeMusicInitialSnapshotResponse({
      status: snapshotPayload.status,
      body: snapshotPayload.body,
    });
    initialSnapshotQualificationRecord = decoded.record;
    if (!decoded.ok) throw new Error("initial snapshot qualification failed");
    initialSnapshot = decoded.snapshot;
    qualificationCoordinator.markSnapshotReady();
  } catch (error) {
    if (initialSnapshotQualificationRecord.status === "unavailable") {
      initialSnapshotQualificationRecord = musicInitialSnapshotRequestFailure(error);
    }
    const stateSnapshotFailureExitCode = await settleIfQualificationFailed();
    if (stateSnapshotFailureExitCode !== undefined) return stateSnapshotFailureExitCode;
    return finishQualificationFailure({
      message: "Live public Music E2E preflight refused: initial full-state snapshot failed.\n",
      stage: "snapshot-preflight-stopped",
      cleanupWhenTeardownSucceeds: "evidence-missing",
      executionOutcome: { status: 4, preflightDiagnostics: { subcheck: "execution-stopped" } },
    });
  }
  const playwrightCli = path.resolve("node_modules/@playwright/test/cli.js");
  let liveExecutionOutcome;
  const liveOutcome = await runMusicFixtureOrchestration({
    snapshotExists: Boolean(initialSnapshot),
    coordinator: qualificationCoordinator,
    baseReport,
    artifacts: {
      directory: path.dirname(profileStorageStatePath),
      authPath: authStatePath,
      storagePath: profileStorageStatePath,
      mkdir: (directory) => mkdirSync(directory, { recursive: true }),
      write: (file, content) => writeFileSync(file, content, { encoding: "utf8", mode: 0o600 }),
      chmod: (file) => chmodSync(file, 0o600),
    },
    restoreEvidence: {
      path: restoreEvidencePath,
      exists: existsSync,
      read: (file) => readFileSync(file, "utf8"),
    },
    qualify: async () => {
      const result = await runLoopbackMusicPrebrowserQualification({
        authority: {
          stateOrigin: stateServiceUrl,
          tunesOrigin: "http://127.0.0.1:55000",
          explorerOrigin: new URL(externalUrl).origin,
          strapiOrigin: strapiUrl,
          stateToken,
          orchestrationToken: orchestrationStateToken,
          fixtureToken: strapiToken,
          namespace,
          username,
          accountDocumentId,
          userDocumentId,
        },
        initialSnapshot,
      });
      prebrowserQualificationRecord = result.record;
      qualifierJwtFingerprint = result.qualifierJwtFingerprint;
      return result;
    },
    execute: async () => {
      const preflightEnvironment = { ...process.env, PLAYWRIGHT_EXTERNAL_BASE_URL: externalUrl, PLAYWRIGHT_PR_SAFE: "false", MUSIC_E2E_LIVE_WRITE: "true", MUSIC_E2E_RESTORE_EVIDENCE_PATH: restoreEvidencePath,
        E2E_PROFILE_LIVE_WRITES: "1", E2E_PROFILE_STORAGE_STATE: profileStorageStatePath, E2E_PROFILE_USERNAME: username };
      const preflight = runLivePreflight({
        spawn: spawnSync,
        processExecPath: process.execPath,
        playwrightCli,
        project: mode.project,
        cwd: process.cwd(),
        environment: preflightEnvironment,
        workspaceRoot: monorepoRoot,
        knownSecrets: [strapiToken, stateToken, orchestrationStateToken],
      });
      if (qualificationCoordinator.signal.aborted) {
        liveExecutionOutcome = { status: qualificationCoordinator.snapshot().failure?.exitCode ?? 4 };
        return liveExecutionOutcome;
      }
      if (!preflight.ok) {
        writePublicStderr("Live public Music E2E preflight refused: authority was skipped or expected mutation journeys did not collect; details redacted.\n");
        liveExecutionOutcome = { status: 4, preflightDiagnostics: preflight.diagnostics };
        return liveExecutionOutcome;
      }

      let browser;
      let mintedCredential = "";
      let callbackBootstrapError;
      try {
        const { chromium } = await import("@playwright/test");
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext(); const page = await context.newPage();
        const browserApiPrefix = `${new URL(externalUrl).origin}/api/`;
        page.on("request", (request) => {
          const authorization = request.headers().authorization;
          if (request.url().startsWith(browserApiPrefix) && authorization?.startsWith("Bearer ")
              && authorization !== `Bearer ${strapiToken}`) mintedCredential = authorization;
        });
        await page.goto(`${externalUrl}/google-auth/callback?access_token=${encodeURIComponent(strapiToken)}`, { waitUntil: "domcontentloaded" });
        await page.getByText("Login successful! Redirecting...").waitFor({ timeout: 30_000 });
        await page.goto(`${externalUrl}/recommendations/music`, { waitUntil: "domcontentloaded" });
        await page.getByRole("tab", { name: "Playlists", exact: true }).waitFor({ timeout: 30_000 });
        if (!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(mintedCredential)
            || !isDistinctMusicCallbackCredential({ qualifierJwtFingerprint, callbackCredential: mintedCredential })) {
          throw new Error("callback did not mint distinct owner Tunes authority");
        }
        mkdirSync(path.dirname(authStatePath), { recursive: true });
        writeFileSync(authStatePath, `${JSON.stringify({ ownerCredential: mintedCredential })}\n`, { encoding: "utf8", mode: 0o600 });
        chmodSync(authStatePath, 0o600);
        await context.storageState({ path: profileStorageStatePath });
        chmodSync(profileStorageStatePath, 0o600);
        process.env.MUSIC_E2E_AUTH_STATE_PATH = authStatePath;
        process.env.E2E_PROFILE_STORAGE_STATE = profileStorageStatePath;
      } catch (error) { callbackBootstrapError = error; }
      finally {
        qualifierJwtFingerprint = undefined;
        if (browser) { try { await browser.close(); } catch { callbackBootstrapError ??= new Error("browser close failed"); } }
      }
      if (qualificationCoordinator.signal.aborted) {
        liveExecutionOutcome = { status: qualificationCoordinator.snapshot().failure?.exitCode ?? 4 };
        return liveExecutionOutcome;
      }
      if (callbackBootstrapError) {
        writePublicStderr("Live public Music E2E callback bootstrap failed; details redacted.\n");
        liveExecutionOutcome = { status: 4 };
        return liveExecutionOutcome;
      }

      const childEnvironment = {
        ...process.env,
        PLAYWRIGHT_EXTERNAL_BASE_URL: externalUrl,
        PLAYWRIGHT_PR_SAFE: "false",
        MUSIC_E2E_LIVE_WRITE: "true",
        MUSIC_E2E_RESTORE_EVIDENCE_PATH: restoreEvidencePath,
        MUSIC_E2E_RECOVERY_ARTIFACT_PATH: mutationRecoveryPath,
        E2E_PROFILE_LIVE_WRITES: "1",
        E2E_PROFILE_STORAGE_STATE: profileStorageStatePath,
        E2E_PROFILE_USERNAME: username,
      };
      const journeyExecutionOutcome = runPlaywrightJourneyExecution({
        spawn: spawnSync,
        processExecPath: process.execPath,
        playwrightCli,
        files: mode.files,
        project: mode.project,
        cwd: process.cwd(),
        environment: childEnvironment,
        reportPath: journeyReportPath,
        outputDirectory: privatePlaywrightOutputDirectory,
        terminalEvidencePath: restoreEvidencePath,
        outcomeLedgerPath: journeyOutcomeLedgerPath,
      });
      journeyOutcomeCleanupRequired = journeyExecutionOutcome.outcomeLedgerStatus === "persist-failed";
      const stateServiceFailure = qualificationCoordinator.snapshot().failure;
      liveExecutionOutcome = stateServiceFailure
        ? { ...journeyExecutionOutcome, status: Math.max(journeyExecutionOutcome.status, stateServiceFailure.exitCode) }
        : journeyExecutionOutcome;
      return liveExecutionOutcome;
    },
    restore: restoreInitialSnapshot,
    teardown: fixtureTeardownContract(),
    writeReport: async () => undefined,
    writeStdout: writePublicStdout,
    writeStderr: writePublicStderr,
  });
  const coordinatedFailure = qualificationCoordinator.snapshot().failure;
  if (coordinatedFailure) {
    writePublicStderr(qualificationFailureMessage ?? "Live public Music E2E state service failed; details redacted.\n");
  }
  try {
    const finalized = await qualificationCoordinator.runFinalization(() => finalizeCurrentQualification({
      report: liveOutcome.report,
      executionOutcome: liveExecutionOutcome,
      exitCode: liveOutcome.exitCode,
      stage: coordinatedFailure?.stage
        ?? (liveExecutionOutcome?.preflightDiagnostics ? "preflight-stopped" : "execution-finished"),
    }));
    return finalized.exitCode;
  } catch {
    process.stderr.write("Live public Music E2E artifact finalization failed; details redacted.\n");
    return 5;
  }
}

if (mode.lane === "live") {
  process.exit(await runLiveQualification());
} else {
const playwrightCli = path.resolve("node_modules/@playwright/test/cli.js");
const childEnvironment = {
  ...process.env,
  PLAYWRIGHT_PR_SAFE: mode.lane === "pr-safe" ? "true" : "false",
  MUSIC_E2E_LIVE_WRITE: "false",
  MUSIC_E2E_RESTORE_EVIDENCE_PATH: restoreEvidencePath,
};
if (process.env.PLAYWRIGHT_EXTERNAL_BASE_URL) {
  childEnvironment.PLAYWRIGHT_EXTERNAL_BASE_URL = process.env.PLAYWRIGHT_EXTERNAL_BASE_URL;
} else {
  delete childEnvironment.PLAYWRIGHT_EXTERNAL_BASE_URL;
}
const executionOutcome = runPlaywrightJourneyExecution({
  spawn: spawnSync,
  processExecPath: process.execPath,
  playwrightCli,
  files: mode.files,
  project: mode.project,
  cwd: process.cwd(),
  environment: childEnvironment,
  reportPath: journeyReportPath,
  outputDirectory: privatePlaywrightOutputDirectory,
  terminalEvidencePath: restoreEvidencePath,
  outcomeLedgerPath: journeyOutcomeLedgerPath,
  requireJourneyLedger: false,
});
const cleanup = executionOutcome.privateArtifactCleanup === "deleted" ? "not-required" : "evidence-delete-failed";
const exitCode = cleanup === "not-required" ? executionOutcome.status : 5;
const report = { ...baseReport, result: exitCode === 0 ? "passed" : "failed", cleanup };
if (executionOutcome.status !== 0 || executionOutcome.reportStatus !== "accepted") {
  writePublicStderr("Public Music Playwright execution or structured result collection failed; details redacted.\n");
}
writePublicStdout(`${JSON.stringify(report)}\n`);
try {
  finalizeCurrentQualification({
    report,
    executionOutcome,
    exitCode,
    stage: "execution-finished",
  });
} catch {
  process.stderr.write("Live public Music E2E artifact finalization failed; details redacted.\n");
  process.exit(5);
}
process.exit(exitCode);
}
