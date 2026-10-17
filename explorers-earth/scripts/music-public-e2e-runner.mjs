import { prepareMusicFixtureArtifacts, stopMusicFixture } from "./music-fixture-cleanup.mjs";
import { LIVE_JOURNEY_MANIFEST, LIVE_JOURNEY_MANIFEST_VERSION, validateLiveJourneyEvidence } from "./music-public-live-preflight.mjs";
import { validateMusicPrebrowserQualificationRecord } from "./music-public-prebrowser-qualification.mjs";

function restorationHash(restoration) {
  if (!restoration?.ok || typeof restoration.beforeHash !== "string" || restoration.beforeHash.length === 0
      || restoration.beforeHash !== restoration.afterHash) return undefined;
  return { cleanup: "restored", beforeHash: restoration.beforeHash, afterHash: restoration.afterHash };
}

function evidenceHash(evidence) {
  if (!evidence || typeof evidence !== "object" || typeof evidence.beforeHash !== "string"
      || typeof evidence.afterHash !== "string") return undefined;
  return { beforeHash: evidence.beforeHash, afterHash: evidence.afterHash };
}

export function createMusicQualificationFailureCoordinator({ onPhase = () => undefined } = {}) {
  if (typeof onPhase !== "function") throw new Error("qualification failure coordinator contract is invalid");
  const controller = new AbortController();
  const ledger = [];
  let phase = "pre-snapshot";
  let snapshotReady = false;
  let failure = null;
  let restorationPromise;
  let teardownPromise;
  let finalizationPromise;

  const transition = (nextPhase) => {
    phase = nextPhase;
    ledger.push(nextPhase);
    onPhase(nextPhase);
  };
  const recordFailure = (candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)
        || typeof candidate.stage !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(candidate.stage)
        || ![4, 5].includes(candidate.exitCode)
        || (candidate.cleanupWhenTeardownSucceeds !== undefined
          && !["not-required-safe", "evidence-missing", "restore-failed"].includes(candidate.cleanupWhenTeardownSucceeds))
        || (candidate.executionOutcome !== undefined
          && (!candidate.executionOutcome || typeof candidate.executionOutcome !== "object"
            || Array.isArray(candidate.executionOutcome)))) {
      throw new Error("qualification failure record is invalid");
    }
    if (!failure) {
      failure = {
        stage: candidate.stage,
        exitCode: candidate.exitCode,
        cleanupWhenTeardownSucceeds: candidate.cleanupWhenTeardownSucceeds ?? "not-required-safe",
        ...(candidate.executionOutcome ? { executionOutcome: candidate.executionOutcome } : {}),
      };
      ledger.push(`failure:${phase}`);
    } else if (candidate.exitCode > failure.exitCode) {
      failure = { ...failure, exitCode: candidate.exitCode };
    }
    if (!controller.signal.aborted) controller.abort();
  };
  const markSnapshotReady = () => {
    if (snapshotReady) return;
    if (restorationPromise || teardownPromise || finalizationPromise) {
      throw new Error("qualification snapshot cannot become ready after cleanup starts");
    }
    snapshotReady = true;
    transition("snapshot-ready");
  };
  const beginOrchestration = () => transition("orchestration");
  const beginExecution = () => {
    if (controller.signal.aborted) {
      transition("execution-skipped");
      return false;
    }
    transition("execution");
    return true;
  };
  const completeExecution = () => transition("execution-complete");
  const runRestoration = (operation) => {
    if (!snapshotReady || typeof operation !== "function") {
      return Promise.reject(new Error("qualification restoration contract is invalid"));
    }
    if (!restorationPromise) {
      transition("restoration");
      restorationPromise = Promise.resolve()
        .then(operation)
        .finally(() => transition("restoration-complete"));
    }
    return restorationPromise;
  };
  const runTeardown = (operation) => {
    if (typeof operation !== "function") {
      return Promise.reject(new Error("qualification teardown contract is invalid"));
    }
    if (!teardownPromise) {
      transition("teardown");
      teardownPromise = Promise.resolve()
        .then(operation)
        .finally(() => transition("teardown-complete"));
    }
    return teardownPromise;
  };
  const markReadyToFinalize = () => {
    if (phase !== "ready-to-finalize") transition("ready-to-finalize");
  };
  const runFinalization = (operation) => {
    if (typeof operation !== "function") {
      return Promise.reject(new Error("qualification finalization contract is invalid"));
    }
    if (!finalizationPromise) {
      transition("finalization");
      finalizationPromise = Promise.resolve()
        .then(operation)
        .finally(() => transition("settled"));
    }
    return finalizationPromise;
  };
  const snapshot = () => ({
    phase,
    snapshotReady,
    failure: failure ? structuredClone(failure) : null,
    ledger: [...ledger],
  });
  return {
    signal: controller.signal,
    markSnapshotReady,
    recordFailure,
    runRestoration,
    runFinalization,
    snapshot,
    beginOrchestration,
    beginExecution,
    completeExecution,
    runTeardown,
    markReadyToFinalize,
  };
}

export async function runMusicFixtureOrchestration({
  snapshotExists,
  coordinator: providedCoordinator,
  baseReport,
  qualify,
  artifacts,
  restoreEvidence,
  execute,
  restore,
  teardown,
  writeReport,
  writeStdout,
  writeStderr,
}) {
  const coordinator = providedCoordinator ?? createMusicQualificationFailureCoordinator();
  if (snapshotExists && !coordinator.snapshot().snapshotReady) coordinator.markSnapshotReady();
  coordinator.beginOrchestration();
  let setupOk = false;
  let executionStatus = 4;
  let executionOutcome;
  let qualificationRefused = false;
  let prebrowserQualification;
  if (coordinator.beginExecution()) {
    try {
      if (qualify !== undefined) {
        if (typeof qualify !== "function") throw new Error("pre-browser qualifier contract is invalid");
        const result = await qualify();
        if (!result || typeof result !== "object" || typeof result.ok !== "boolean"
            || !validateMusicPrebrowserQualificationRecord(result.record)
            || (result.ok && result.record.status !== "passed")
            || (!result.ok && result.record.status !== "failed")) {
          throw new Error("pre-browser qualifier result is invalid");
        }
        prebrowserQualification = result.record;
        if (!result.ok) {
          qualificationRefused = true;
          executionStatus = 4;
        }
      }
      if (!qualificationRefused) {
        prepareMusicFixtureArtifacts(artifacts);
        setupOk = true;
      }
      if (!qualificationRefused) {
        try {
          const result = await execute();
          if (Number.isInteger(result)) executionStatus = result;
          else if (result && typeof result === "object" && Number.isInteger(result.status)) {
            executionOutcome = result;
            executionStatus = result.status;
          } else executionStatus = 1;
        } catch {
          writeStderr("Live public Music E2E execution failed; details redacted.\n");
        }
      }
    } catch {
      qualificationRefused = true;
      writeStderr("Live public Music E2E pre-browser qualification failed; details redacted.\n");
    } finally {
      coordinator.completeExecution();
    }
  }

  let restoration = { ok: false, cleanup: "restore-failed" };
  if (snapshotExists) {
    try { restoration = await coordinator.runRestoration(restore); }
    catch { restoration = { ok: false, cleanup: "restore-failed" }; }
  }
  const initialHash = restorationHash(restoration);

  let parsedEvidence = [];
  let evidenceParseFailed = false;
  if (setupOk) {
    try {
      if (restoreEvidence.exists(restoreEvidence.path)) {
        parsedEvidence = restoreEvidence.read(restoreEvidence.path).trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
      }
    } catch {
      evidenceParseFailed = true;
      writeStderr("Live public Music E2E restore evidence parsing failed; details redacted.\n");
    }
  }

  const legacyEvidenceVerified = parsedEvidence.every((entry) => entry?.cleanup === "restored"
    && typeof entry.beforeHash === "string" && entry.beforeHash.length > 0 && entry.beforeHash === entry.afterHash);
  const coordinatedFailure = coordinator.snapshot().failure;
  if (coordinatedFailure) {
    executionStatus = Math.max(executionStatus, coordinatedFailure.exitCode);
    executionOutcome ??= coordinatedFailure.executionOutcome;
  }
  const preflightRefusal = executionOutcome?.status === 4 && executionOutcome.preflightDiagnostics;
  const independentRecordEvidence = validateLiveJourneyEvidence({ executionReport: undefined, records: parsedEvidence });
  const reportStatusFailure = executionOutcome?.reportStatus && executionOutcome.reportStatus !== "accepted"
    ? (() => {
      const reportSubcheck = `execution-report-${executionOutcome.reportStatus}`;
      return {
        ok: false,
        failureStage: "journey-evidence",
        subcheck: reportSubcheck,
        subchecks: [reportSubcheck, ...(independentRecordEvidence.subchecks ?? [])
          .filter((subcheck) => subcheck !== "execution-report")],
        journeyPresence: independentRecordEvidence.journeyPresence,
      };
    })()
    : undefined;
  const journeyEvidence = reportStatusFailure ?? (executionOutcome?.executionReport
    ? validateLiveJourneyEvidence({ executionReport: executionOutcome.executionReport, records: parsedEvidence })
    : undefined);
  const privateArtifactCleanupFailed = executionOutcome?.privateArtifactCleanup === "delete-failed";
  const outcomeLedgerFailed = executionOutcome?.outcomeLedgerStatus !== undefined
    && executionOutcome.outcomeLedgerStatus !== "persisted";
  const evidenceVerified = coordinatedFailure
    ? legacyEvidenceVerified && !privateArtifactCleanupFailed && !outcomeLedgerFailed
    : (qualificationRefused
      ? parsedEvidence.length === 0
      : (preflightRefusal
      ? parsedEvidence.length === 0
      : (executionOutcome
        ? Boolean(journeyEvidence?.ok) && !privateArtifactCleanupFailed && !outcomeLedgerFailed
        : legacyEvidenceVerified)));
  if ((!evidenceVerified || evidenceParseFailed) && snapshotExists) {
    executionStatus = Math.max(executionStatus, 5);
  }
  let cleanup = initialHash && !evidenceParseFailed && !privateArtifactCleanupFailed && !outcomeLedgerFailed
    ? "restored"
    : (initialHash ? "evidence-missing" : "restore-failed");
  let teardownStatus = 1;
  try { teardownStatus = await coordinator.runTeardown(() => stopMusicFixture(teardown)); }
  catch { teardownStatus = 1; }
  if (!snapshotExists && coordinatedFailure && teardownStatus === 0) {
    cleanup = coordinatedFailure.cleanupWhenTeardownSucceeds;
  }
  if (teardownStatus !== 0) cleanup = "teardown-failed";

  const restoreHashes = [initialHash, ...parsedEvidence.map(evidenceHash)]
    .filter(Boolean)
    .map(({ beforeHash, afterHash }) => ({ beforeHash, afterHash }));
  let report = {
    ...baseReport,
    result: executionStatus === 0 && cleanup === "restored" ? "passed" : "failed",
    cleanup,
    ...(executionOutcome ? {} : { restoreHashes }),
    finalRestore: initialHash,
    ...(journeyEvidence?.ok ? { manifestVersion: LIVE_JOURNEY_MANIFEST_VERSION, journeys: journeyEvidence.journeyResults } : {}),
    ...(journeyEvidence && !journeyEvidence.ok ? { journeyDiagnostics: journeyEvidence } : {}),
    ...(executionOutcome?.reportStatus ? { journeyReportStatus: executionOutcome.reportStatus } : {}),
    ...(executionOutcome?.outcomeLedgerStatus ? { journeyOutcomeLedgerStatus: executionOutcome.outcomeLedgerStatus } : {}),
    ...(executionOutcome?.privateArtifactCleanup ? { journeyArtifactCleanup: executionOutcome.privateArtifactCleanup } : {}),
    ...(preflightRefusal ? { preflightDiagnostics: executionOutcome.preflightDiagnostics } : {}),
    ...(prebrowserQualification ? { prebrowserQualification } : {}),
  };
  try {
    await writeReport(report);
  } catch {
    cleanup = cleanup === "restored" ? "evidence-missing" : cleanup;
    report = { ...report, result: "failed", cleanup };
    writeStderr("Live public Music E2E evidence report writing failed; details redacted.\n");
  }

  const exitCode = ["restored", "not-required-safe"].includes(cleanup) ? executionStatus : 5;
  writeStdout(`${JSON.stringify(report)}\n`);
  coordinator.markReadyToFinalize();
  return { exitCode, report, restoration, teardownStatus };
}
