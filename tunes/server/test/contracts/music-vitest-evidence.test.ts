import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildUatEvidenceEnvelope,
  parseFinalizedVitestEvidence,
  parseUatVitestEvidenceFromOutput,
  requireExactFileManifest,
  unionFileEvidence,
} from "../../../scripts/music-vitest-evidence.ts";

function report(
  root: string,
  entries: Array<[string, Array<"passed" | "failed" | "skipped" | "todo" | "pending">]>,
): string {
  const statuses = entries.flatMap(([, values]) => values);
  const count = (status: string) => statuses.filter((value) => value === status).length;
  const failedFiles = entries.filter(([, values]) => values.includes("failed")).length;
  return JSON.stringify({
    numTotalTests: statuses.length,
    numPassedTests: count("passed"),
    numFailedTests: count("failed"),
    numPendingTests: count("skipped") + count("pending"),
    numTodoTests: count("todo"),
    numTotalTestSuites: entries.length,
    numPassedTestSuites: entries.length - failedFiles,
    numFailedTestSuites: failedFiles,
    numPendingTestSuites: 0,
    success: failedFiles === 0,
    testResults: entries.map(([name, values]) => ({
      name: resolve(root, name),
      status: values.includes("failed") ? "failed" : "passed",
      startTime: 1,
      endTime: 2,
      message: "",
      assertionResults: values.map((status, index) => ({
        status,
        title: "case-" + index,
        ancestorTitles: [name],
        fullName: name + " case-" + index,
        failureMessages: status === "failed" ? ["synthetic failure"] : [],
      })),
    })),
  });
}

const root = resolve("/synthetic/music-repository");
const a = "server/test/a.integration.test.ts";
const b = "server/test/b.integration.test.ts";
const commit = "0123456789abcdef0123456789abcdef01234567";
const runId = "abcdef0123456789abcdef0123456789";

describe("finalized Vitest evidence", () => {
  it("accepts Vitest 4 suite counters that include nested describe blocks", () => {
    const raw = JSON.parse(report(root, [[a, ["passed"]]])) as Record<string, any>;
    raw.numTotalTestSuites = 2;
    raw.numPassedTestSuites = 2;
    raw.testResults[0].assertionResults[0].ancestorTitles = ["nested suite"];
    expect(parseFinalizedVitestEvidence(JSON.stringify(raw), 0, root).fileCounts)
      .toEqual({ selected: 1, passed: 1, failed: 0, skipped: 0 });
  });
  it("rejects false nested suite totals and failed-suite counters", () => {
    const raw = JSON.parse(report(root, [[a, ["passed"]]])) as Record<string, any>;
    raw.testResults[0].assertionResults[0].ancestorTitles = ["nested suite"];
    raw.numTotalTestSuites = 3;
    raw.numPassedTestSuites = 3;
    expect(() => parseFinalizedVitestEvidence(JSON.stringify(raw), 0, root)).toThrow(/suite results disagree/);
    raw.numTotalTestSuites = 2;
    raw.numPassedTestSuites = 1;
    raw.numFailedTestSuites = 1;
    expect(() => parseFinalizedVitestEvidence(JSON.stringify(raw), 0, root)).toThrow(/suite status counts disagree/);
  });
  it("rejects partial skipped assertions instead of promoting incomplete evidence", () => {
    expect(() => parseFinalizedVitestEvidence(
      report(root, [[a, ["passed", "skipped"]]]), 0, root,
    )).toThrow("skipped assertions are not final evidence");
  });

  it.each(["", "{}", "{bad json"]) ("rejects missing or malformed JSON: %s", (raw) => {
    expect(() => parseFinalizedVitestEvidence(raw, 0, root)).toThrow();
  });

  it.each(["pending", "todo", "skipped"] as const)("never promotes %s-only proof", (status) => {
    expect(() => requireExactFileManifest(
      parseFinalizedVitestEvidence(report(root, [[a, [status]]]), 0, root), [a],
    )).toThrow();
  });

  it("rejects duplicate records and unfinished mixed execution", () => {
    expect(() => parseFinalizedVitestEvidence(
      report(root, [[a, ["passed"]], [a, ["passed"]]]), 0, root,
    )).toThrow();
    expect(() => parseFinalizedVitestEvidence(
      report(root, [[a, ["passed", "pending"]]]), 0, root,
    )).toThrow();
  });

  it("requires reporter suite counts to match the finalized file result set", () => {
    const raw = JSON.parse(report(root, [[a, ["passed"]]])) as Record<string, unknown>;
    raw.numPassedTestSuites = raw.numTotalTestSuites = 3;
    expect(() => parseFinalizedVitestEvidence(JSON.stringify(raw), 0, root))
      .toThrow("suite results disagree");
  });

  it("rejects internally balanced suite counts that disagree with result statuses", () => {
    const raw = JSON.parse(report(root, [[a, ["passed"]], [b, ["passed"]]])) as Record<string, any>;
    raw.numPassedTestSuites = 2;
    raw.numFailedTestSuites = 0;
    raw.testResults[1].status = "failed";
    raw.success = false;
    expect(() => parseFinalizedVitestEvidence(JSON.stringify(raw), 1, root))
      .toThrow("suite status counts disagree");
  });

  it("still rejects inconsistent assertion totals", () => {
    const raw = JSON.parse(report(root, [[a, ["passed"]]])) as Record<string, unknown>;
    raw.numPassedTests = 2;
    expect(() => parseFinalizedVitestEvidence(JSON.stringify(raw), 0, root)).toThrow();
  });

  it("rejects nonzero native exit with successful JSON", () => {
    expect(() => parseFinalizedVitestEvidence(report(root, [[a, ["passed"]]]), 1, root)).toThrow();
  });

  it("rejects missing manifest members and disagreeing duplicate authorities", () => {
    const first = parseFinalizedVitestEvidence(report(root, [[a, ["passed"]]]), 0, root);
    expect(() => requireExactFileManifest(first, [a, b])).toThrow();
    const second = parseFinalizedVitestEvidence(report(root, [[a, ["passed", "passed"]]]), 0, root);
    expect(() => unionFileEvidence([first, second], [a])).toThrow();
    expect(unionFileEvidence([first, first], [a]).duplicates).toEqual([a]);
  });

  it("rejects invalid reporter counts and contradictory success authorities", () => {
    const mutations: Array<(raw: Record<string, unknown>) => void> = [
      (raw) => { raw.numTotalTests = 1.5; },
      (raw) => { raw.numPassedTests = -1; },
      (raw) => { raw.numTotalTestSuites = 2; },
      (raw) => { raw.success = "true"; },
      (raw) => { raw.success = true; raw.numFailedTestSuites = 1; },
    ];
    for (const mutate of mutations) {
      const raw = JSON.parse(report(root, [[a, ["passed"]]])) as Record<string, unknown>;
      mutate(raw);
      expect(() => parseFinalizedVitestEvidence(JSON.stringify(raw), 0, root)).toThrow();
    }
  });

  it("rejects a balanced pending suite before normalization", () => {
    const raw = JSON.parse(report(root, [[a, ["passed"]]])) as Record<string, unknown>;
    raw.numTotalTestSuites = 1;
    raw.numPassedTestSuites = 0;
    raw.numFailedTestSuites = 0;
    raw.numPendingTestSuites = 1;
    raw.success = false;
    expect(() => parseFinalizedVitestEvidence(JSON.stringify(raw), 1, root))
      .toThrow("unfinished suites");
  });

  it("normalizes a reconciled failed report and rejects native-zero success", () => {
    const raw = report(root, [[a, ["failed"]]]);
    const failed = parseFinalizedVitestEvidence(raw, 1, root);
    expect(failed.success).toBe(false);
    expect(failed.nativeExit).toBe(1);
    expect(failed.fileCounts).toEqual({ selected: 1, passed: 0, failed: 1, skipped: 0 });
    expect(failed.assertions).toEqual({ selected: 1, passed: 0, failed: 1, skipped: 0, todo: 0 });
    expect(() => parseFinalizedVitestEvidence(raw, 0, root))
      .toThrow("native exit contradicts success");
  });

  it("rejects success with failed files, unknown statuses, and invalid paths", () => {
    const failed = JSON.parse(report(root, [[a, ["failed"]]])) as Record<string, unknown>;
    failed.success = true;
    expect(() => parseFinalizedVitestEvidence(JSON.stringify(failed), 0, root)).toThrow();

    const unknown = JSON.parse(report(root, [[a, ["passed"]]])) as Record<string, any>;
    unknown.testResults[0].assertionResults[0].status = "running";
    expect(() => parseFinalizedVitestEvidence(JSON.stringify(unknown), 0, root)).toThrow();

    const relative = JSON.parse(report(root, [[a, ["passed"]]])) as Record<string, any>;
    relative.testResults[0].name = a;
    expect(() => parseFinalizedVitestEvidence(JSON.stringify(relative), 0, root)).toThrow();

    const outside = JSON.parse(report(root, [[a, ["passed"]]])) as Record<string, any>;
    outside.testResults[0].name = resolve("/synthetic/outside", a);
    expect(() => parseFinalizedVitestEvidence(JSON.stringify(outside), 0, root)).toThrow();
  });
});

describe("UAT evidence envelope", () => {
  const vitestRaw = report(root, [[a, ["passed", "passed"]]]);

  it("round-trips the finalized report, native outcome, and raw hash", () => {
    const envelope = buildUatEvidenceEnvelope({
      runId,
      commit,
      exitCode: 0,
      childSignal: null,
      cleanup: "database-dropped-container-removed",
      vitestRaw,
      root,
    });
    const output = ["focused child log", JSON.stringify(envelope)].join("\n");
    expect(parseUatVitestEvidenceFromOutput(output, {
      root,
      commit,
      nativeExit: 0,
      nativeSignal: null,
    })).toEqual(envelope);
    expect(envelope).not.toHaveProperty("vitestRaw");
    expect(JSON.stringify(envelope)).not.toContain(resolve(root, a));
  });

  it("rejects malformed identities and incomplete lifecycle state", () => {
    const base: Parameters<typeof buildUatEvidenceEnvelope>[0] = { runId, commit, exitCode: 0, childSignal: null,
      cleanup: "database-dropped-container-removed", vitestRaw, root };
    const mutations: Array<Partial<typeof base>> = [
      { runId: "short" },
      { commit: "not-a-commit" },
      { exitCode: 1 },
      { childSignal: "SIGTERM" },
      { cleanup: "database-retained" },
    ];
    for (const mutation of mutations) {
      expect(() => buildUatEvidenceEnvelope({ ...base, ...mutation })).toThrow();
    }
  });

  it("rejects missing or wrong outer version before accepting a token-bearing property", () => {
    const envelope = buildUatEvidenceEnvelope({
      runId, commit, exitCode: 0, childSignal: null,
      cleanup: "database-dropped-container-removed", vitestRaw, root,
    });
    const wrong = { ...envelope, version: "other/v1", token: "explorers-music-uat-database/v1" };
    expect(() => parseUatVitestEvidenceFromOutput(JSON.stringify(wrong), {
      root, commit, nativeExit: 0, nativeSignal: null,
    })).toThrow("invalid UAT envelope version");

    const missing = { ...envelope, token: "explorers-music-uat-database/v1" } as Record<string, unknown>;
    delete missing.version;
    expect(() => parseUatVitestEvidenceFromOutput(JSON.stringify(missing), {
      root, commit, nativeExit: 0, nativeSignal: null,
    })).toThrow("invalid UAT envelope version");
  });

  it("rejects a version token found only in a nested property", () => {
    const nested = JSON.stringify({ payload: { version: "explorers-music-uat-database/v1" } });
    expect(() => parseUatVitestEvidenceFromOutput(nested, {
      root, commit, nativeExit: 0, nativeSignal: null,
    })).toThrow("invalid UAT envelope version");
  });

  it("rejects mismatched expected commit, native exit, and signal", () => {
    const envelope = buildUatEvidenceEnvelope({
      runId, commit, exitCode: 0, childSignal: null,
      cleanup: "database-dropped-container-removed", vitestRaw, root,
    });
    const output = JSON.stringify(envelope);
    expect(() => parseUatVitestEvidenceFromOutput(output, {
      root, commit: "fedcba9876543210fedcba9876543210fedcba98", nativeExit: 0, nativeSignal: null,
    })).toThrow();
    expect(() => parseUatVitestEvidenceFromOutput(output, {
      root, commit, nativeExit: 1, nativeSignal: null,
    })).toThrow();
    expect(() => parseUatVitestEvidenceFromOutput(output, {
      root, commit, nativeExit: 0, nativeSignal: "SIGTERM",
    })).toThrow();
  });

  it("requires exactly one final envelope line and verifies embedded evidence", () => {
    const envelope = buildUatEvidenceEnvelope({
      runId, commit, exitCode: 0, childSignal: null,
      cleanup: "database-dropped-container-removed", vitestRaw, root,
    });
    const output = JSON.stringify(envelope);
    expect(() => parseUatVitestEvidenceFromOutput(`${output}\n${output}`, {
      root, commit, nativeExit: 0, nativeSignal: null,
    })).toThrow();
    const corrupted = { ...envelope, vitestSha256: "0".repeat(64) };
    expect(() => parseUatVitestEvidenceFromOutput(JSON.stringify(corrupted), {
      root, commit, nativeExit: 0, nativeSignal: null,
    })).toThrow();
  });
});
