export type Counts = { selected: number; passed: number; failed: number; skipped: number; todo: number };
export type MusicVitestFileEvidence = {
  file: string;
  status: "passed" | "failed" | "skipped";
  assertions: Counts;
};
export type MusicVitestEvidence = {
  finalized: true;
  success: boolean;
  nativeExit: number;
  fileCounts: Omit<Counts, "todo">;
  assertions: Counts;
  files: MusicVitestFileEvidence[];
};
export type MusicUatEvidence = {
  version: "explorers-music-uat-database/v1";
  runId: string;
  commit: string;
  result: "passed";
  exitCode: number;
  childSignal: null;
  cleanup: "database-dropped-container-removed";
  vitest: MusicVitestEvidence;
  vitestSha256: string;
};

export const MUSIC_UAT_DATABASE_TEST_FILES = Object.freeze([
  "server/test/explorers-lifecycle.integration.test.ts",
  "server/test/account-recovery.test.ts",
  "server/test/explorers-recovery.integration.test.ts",
  "server/test/explorers-recovery-callback.integration.test.ts",
  "server/test/explorers-profile.integration.test.ts",
  "server/test/explorers-media.integration.test.ts",
  "server/test/migrations/music-migration.integration.test.ts",
  "server/test/music-credential.integration.test.ts",
  "server/test/music-domain-repository.integration.test.ts",
  "server/test/music-identity-projection.integration.test.ts",
  "server/test/music-publication-operation.integration.test.ts",
  "server/test/music-runtime-role.integration.test.ts",
  "server/test/musicLifecycle.integration.test.ts",
  "server/test/musicReconciler.integration.test.ts",
  "server/test/reconciliationRepository.integration.test.ts",
  "server/test/load/music-load-postgres.integration.test.ts",
  "server/test/music-e2e-state-restore.integration.test.ts",
  "server/test/music-e2e-initial-capture.integration.test.ts",
  "server/test/music-e2e-identity-count-adapter.integration.test.ts",
] as const);

import { createHash } from "node:crypto";
import { isAbsolute, relative } from "node:path";

const demand = (ok: unknown, message: string): void => {
  if (!ok) throw new Error(message);
};

const object = (value: unknown): Record<string, any> => {
  demand(value !== null && typeof value === "object" && !Array.isArray(value), "invalid evidence object");
  return value as Record<string, any>;
};

const counts = (): Counts => ({ selected: 0, passed: 0, failed: 0, skipped: 0, todo: 0 });

export function parseFinalizedVitestEvidence(raw: string, nativeExit: number, root: string): MusicVitestEvidence {
  const report = object(JSON.parse(raw));
  demand(Number.isInteger(nativeExit) && nativeExit >= 0, "invalid native exit");
  for (const key of [
    "numTotalTests", "numPassedTests", "numFailedTests", "numPendingTests", "numTodoTests",
    "numTotalTestSuites", "numPassedTestSuites", "numFailedTestSuites", "numPendingTestSuites",
  ]) {
    demand(Number.isInteger(report[key]) && report[key] >= 0, "invalid reporter count");
  }
  demand(typeof report.success === "boolean" && Array.isArray(report.testResults), "invalid finalized Vitest JSON");
  demand(
    report.numTotalTestSuites === report.numPassedTestSuites
      + report.numFailedTestSuites + report.numPendingTestSuites,
    "suite totals disagree",
  );
  demand(report.numPendingTestSuites === 0, "unfinished suites");

  const seen = new Set<string>();
  const assertions = counts();
  let nestedSuiteTotal = 0;
  let nestedSuiteFailed = 0;
  const files: MusicVitestFileEvidence[] = report.testResults.map((value: unknown): MusicVitestFileEvidence => {
    const fileResult = object(value);
    demand(typeof fileResult.name === "string" && isAbsolute(fileResult.name), "absolute file required");
    const file = relative(root, fileResult.name).replaceAll("\\", "/");
    demand(file !== "" && file !== ".." && !file.startsWith("../") && !isAbsolute(file), "file outside root");
    demand(!seen.has(file), "duplicate file record");
    seen.add(file);
    demand(["passed", "failed"].includes(fileResult.status) && Array.isArray(fileResult.assertionResults), "invalid file result");
    demand(Number.isFinite(fileResult.startTime) && Number.isFinite(fileResult.endTime)
      && fileResult.endTime >= fileResult.startTime, "invalid timing");

    const local = counts();
    const nestedSuites = new Set<string>([""]);
    const failedSuites = new Set<string>();
    for (const entry of fileResult.assertionResults) {
      const assertion = object(entry);
      const status = assertion.status;
      demand(["passed", "failed", "skipped", "todo"].includes(status), "unfinished or unknown assertion");
      demand(Array.isArray(assertion.ancestorTitles) && assertion.ancestorTitles.every((part: unknown) => typeof part === "string"), "invalid assertion ancestry");
      const ancestry = assertion.ancestorTitles as string[];
      for (let depth = 1; depth <= ancestry.length; depth++) nestedSuites.add(JSON.stringify(ancestry.slice(0, depth)));
      if (status === "failed") {
        failedSuites.add("");
        for (let depth = 1; depth <= ancestry.length; depth++) failedSuites.add(JSON.stringify(ancestry.slice(0, depth)));
      }
      local.selected++;
      local[status as "passed" | "failed" | "skipped" | "todo"]++;
    }
    demand(local.failed === 0 || fileResult.status === "failed", "file contradicts assertions");
    if (fileResult.status === "failed") failedSuites.add("");
    nestedSuiteTotal += nestedSuites.size;
    nestedSuiteFailed += failedSuites.size;
    for (const key of Object.keys(local) as Array<keyof Counts>) assertions[key] += local[key];

    return {
      file,
      status: fileResult.status === "failed" ? "failed" : local.passed === 0 ? "skipped" : "passed",
      assertions: local,
    };
  });

  demand(
    report.numTotalTests === assertions.selected
      && report.numPassedTests === assertions.passed
      && report.numFailedTests === assertions.failed
      && report.numPendingTests === assertions.skipped
      && report.numTodoTests === assertions.todo,
    "assertion totals disagree",
  );
  demand(assertions.skipped === 0, "skipped assertions are not final evidence");
  const failed = files.filter((file) => file.status === "failed").length;
  const passedSuites = files.filter((file) => file.status === "passed").length;
  const legacySuiteCounts = report.numTotalTestSuites === files.length
    && report.numPassedTestSuites === passedSuites && report.numFailedTestSuites === failed;
  const nestedSuiteCounts = report.numTotalTestSuites === nestedSuiteTotal
    && report.numPassedTestSuites === nestedSuiteTotal - nestedSuiteFailed
    && report.numFailedTestSuites === nestedSuiteFailed;
  demand(report.numTotalTestSuites === files.length || report.numTotalTestSuites === nestedSuiteTotal, "suite results disagree");
  demand(
    legacySuiteCounts || nestedSuiteCounts,
    "suite status counts disagree",
  );
  demand(
    report.success === (files.length > 0 && failed === 0 && report.numFailedTestSuites === 0 && assertions.failed === 0),
    "success contradicts report",
  );
  demand(report.success === (nativeExit === 0), "native exit contradicts success");

  return {
    finalized: true,
    success: report.success,
    nativeExit,
    assertions,
    files,
    fileCounts: {
      selected: files.length,
      passed: files.filter((file) => file.status === "passed").length,
      failed,
      skipped: files.filter((file) => file.status === "skipped").length,
    },
  };
}

export function requireExactFileManifest(evidence: MusicVitestEvidence, expected: readonly string[]): void {
  demand(new Set(expected).size === expected.length, "duplicate expected member");
  demand(evidence.finalized && evidence.success && evidence.nativeExit === 0, "unsuccessful evidence");
  demand(
    evidence.fileCounts.failed === 0 && evidence.fileCounts.skipped === 0
      && evidence.assertions.failed === 0 && evidence.assertions.todo === 0,
    "failed/skipped file or todo assertion",
  );
  demand(
    JSON.stringify(evidence.files.map((file) => file.file).sort()) === JSON.stringify([...expected].sort()),
    "manifest mismatch",
  );
}

export function unionFileEvidence(groups: MusicVitestEvidence[], expected: readonly string[]) {
  const byFile = new Map<string, MusicVitestFileEvidence>();
  const duplicates = new Set<string>();
  for (const group of groups) {
    requireExactFileManifest(group, group.files.map((file) => file.file));
    for (const file of group.files) {
      const prior = byFile.get(file.file);
      if (prior) {
        demand(JSON.stringify(prior) === JSON.stringify(file), "duplicate authority disagreement");
        duplicates.add(file.file);
      } else {
        byFile.set(file.file, file);
      }
    }
  }

  const files = Array.from(byFile.values()).sort((left, right) => left.file.localeCompare(right.file));
  const assertions = counts();
  for (const file of files) {
    for (const key of Object.keys(assertions) as Array<keyof Counts>) assertions[key] += file.assertions[key];
  }
  const evidence: MusicVitestEvidence = {
    finalized: true,
    success: true,
    nativeExit: 0,
    files,
    assertions,
    fileCounts: { selected: files.length, passed: files.length, failed: 0, skipped: 0 },
  };
  requireExactFileManifest(evidence, expected);
  return { evidence, duplicates: Array.from(duplicates).sort() };
}

export function buildUatEvidenceEnvelope(input: {
  runId: string;
  commit: string;
  exitCode: number;
  childSignal: string | null;
  cleanup: string;
  vitestRaw: string;
  root: string;
}): MusicUatEvidence {
  demand(typeof input.runId === "string" && /^[a-f0-9]{32}$/.test(input.runId)
    && typeof input.commit === "string" && /^[a-f0-9]{40}$/.test(input.commit), "invalid UAT identity");
  demand(input.exitCode === 0 && input.childSignal === null
    && input.cleanup === "database-dropped-container-removed"
    && typeof input.vitestRaw === "string", "incomplete UAT lifecycle");
  const vitest = parseFinalizedVitestEvidence(input.vitestRaw, input.exitCode, input.root);
  const normalizedVitest = JSON.stringify(vitest);
  return {
    version: "explorers-music-uat-database/v1",
    runId: input.runId,
    commit: input.commit,
    result: "passed",
    exitCode: input.exitCode,
    childSignal: null,
    cleanup: "database-dropped-container-removed",
    vitest,
    vitestSha256: createHash("sha256").update(normalizedVitest, "utf8").digest("hex"),
  };
}

export function parseUatVitestEvidenceFromOutput(output: string, input: {
  root: string;
  commit: string;
  nativeExit: number;
  nativeSignal: string | null;
}): MusicUatEvidence {
  const lines = output.trim().split(/\r?\n/);
  const envelopes = lines.filter((line) => line.includes('"explorers-music-uat-database/v1"'));
  demand(envelopes.length === 1 && envelopes[0] === lines.at(-1), "one final UAT envelope required");
  const outer = object(JSON.parse(envelopes[0]!));
  demand(outer.version === "explorers-music-uat-database/v1", "invalid UAT envelope version");
  demand(outer.commit === input.commit && outer.exitCode === input.nativeExit
    && input.nativeSignal === null && outer.result === "passed", "UAT outer result/identity mismatch");
  demand(!Object.hasOwn(outer, "vitestRaw"), "raw Vitest evidence is forbidden");
  const vitest = object(outer.vitest) as MusicVitestEvidence;
  demand(vitest.finalized === true && vitest.success === true && vitest.nativeExit === input.nativeExit
    && Array.isArray(vitest.files), "invalid normalized Vitest evidence");
  requireExactFileManifest(vitest, vitest.files.map((file) => file.file));
  const digest = createHash("sha256").update(JSON.stringify(vitest), "utf8").digest("hex");
  demand(outer.vitestSha256 === digest, "UAT embedded evidence mismatch");
  return {
    version: "explorers-music-uat-database/v1",
    runId: outer.runId,
    commit: outer.commit,
    result: "passed",
    exitCode: outer.exitCode,
    childSignal: null,
    cleanup: "database-dropped-container-removed",
    vitest,
    vitestSha256: digest,
  };
}
