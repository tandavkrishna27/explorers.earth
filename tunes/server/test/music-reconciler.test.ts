import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MusicReconciler,
  type MusicReconciliationReport,
  type MusicReconciliationRepository,
  type MusicReconciliationSession,
  type MusicReconciliationSource,
  type ReconciliationDatabaseResult,
  type ReconciliationReview,
} from "../services/musicReconciler";

const identity = (suffix: string) => ({
  documentId: `user-${suffix}`,
  username: `owner-${suffix}`,
  email: `${suffix}@example.invalid`,
  provider: "local",
  confirmed: true,
  blocked: false,
  accounts: [{
    documentId: `account-${suffix}`,
    Account_Name: `Account ${suffix}`,
    Account_Type: "Explorer",
    mobile_number: "+15555550100",
  }],
});

function normalized(value: ReturnType<typeof identity>) {
  return {
    userDocumentId: value.documentId,
    accountDocumentId: value.accounts[0].documentId,
    username: value.username,
    email: value.email,
    provider: value.provider,
    accountName: value.accounts[0].Account_Name,
    accountType: value.accounts[0].Account_Type,
    accountMobile: value.accounts[0].mobile_number,
  };
}

function sourceChecksum(values: Array<ReturnType<typeof identity>>): string {
  const canonical = values.map(normalized).map((value) => JSON.stringify(value)).join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

function page(input: {
  data: Array<ReturnType<typeof identity>>;
  all: Array<ReturnType<typeof identity>>;
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  snapshot?: string;
  checksum?: string;
  healthy?: boolean;
  schemaVersion?: string;
}) {
  return {
    data: input.data,
    meta: {
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        pageCount: input.pageCount,
        total: input.total,
      },
      reconciliation: {
        schemaVersion: input.schemaVersion ?? "strapi-music-reconciliation/v1",
        sourceSnapshot: input.snapshot ?? "snapshot-001",
        sourceChecksum: input.checksum ?? sourceChecksum(input.all),
        healthy: input.healthy ?? true,
      },
    },
  };
}

class FakeSource implements MusicReconciliationSource {
  readonly requests: Array<{ page: number; pageSize: number; order: string; sourceSnapshot?: string }> = [];

  constructor(private readonly responses: unknown[]) {}

  async fetchPage(request: { page: number; pageSize: number; order: string; sourceSnapshot?: string }): Promise<unknown> {
    this.requests.push(request);
    const response = this.responses[request.page - 1];
    if (response instanceof Error) throw response;
    return response;
  }
}

const safeDatabaseResult = (overrides: Partial<ReconciliationDatabaseResult> = {}): ReconciliationDatabaseResult => ({
  status: "safe",
  localTotal: 2,
  eligibleTotal: 2,
  matched: 1,
  missing: 1,
  firstMisses: 1,
  secondMisses: 0,
  projectedUpdates: 1,
  proposedChangePercent: 100,
  suspended: 0,
  tombstoneConflicts: 0,
  planFingerprint: "plan-fingerprint-001",
  databaseBatches: 1,
  applied: false,
  anomalies: [],
  ...overrides,
});

class FakeRepository implements MusicReconciliationRepository {
  acquired = true;
  readonly calls: Parameters<MusicReconciliationSession["reconcileValidatedScan"]>[0][] = [];
  result: ReconciliationDatabaseResult = safeDatabaseResult();

  async withAdvisoryLock<T>(work: (session: MusicReconciliationSession) => Promise<T>) {
    if (!this.acquired) return { acquired: false as const };
    const session: MusicReconciliationSession = {
      reconcileValidatedScan: async (input) => {
        this.calls.push(input);
        return this.result;
      },
    };
    return { acquired: true as const, value: await work(session) };
  }
}

const runInput = {
  runId: "run-001",
  scanNonce: "1".repeat(64),
  environment: "fixture" as const,
  applyEnabled: true,
  pageSize: 2,
  maxRows: 100,
  batchSize: 25,
  maxChangeAbsolute: 5,
  maxChangePercent: 50,
  maxPages: 10,
  scanTimeoutMs: 10_000,
  maxCanonicalBytes: 16 * 1024 * 1024,
  databaseLockTimeoutMs: 5_000,
  databaseStatementTimeoutMs: 120_000,
  databaseIdleTransactionTimeoutMs: 30_000,
};

describe("MusicReconciler", () => {
  it("validates stable explicitly ordered pages and defaults to report-only", async () => {
    // Break caught: the scanner can skip/reorder pages or mutate before explicit --apply.
    const all = [identity("a"), identity("b"), identity("c")];
    const source = new FakeSource([
      page({ data: all.slice(0, 2), all, page: 1, pageSize: 2, pageCount: 2, total: 3 }),
      page({ data: all.slice(2), all, page: 2, pageSize: 2, pageCount: 2, total: 3 }),
    ]);
    const repository = new FakeRepository();

    const report = await new MusicReconciler(source, repository).run(runInput);

    expect(source.requests).toEqual([
      expect.objectContaining({ page: 1, pageSize: 2, order: "documentId:asc", sourceSnapshot: undefined, timeoutMs: expect.any(Number) }),
      expect.objectContaining({ page: 2, pageSize: 2, order: "documentId:asc", sourceSnapshot: "snapshot-001", timeoutMs: expect.any(Number) }),
    ]);
    expect(repository.calls).toHaveLength(1);
    expect(repository.calls[0]).toMatchObject({ apply: false, maxChangeAbsolute: 5, maxChangePercent: 50 });
    expect(repository.calls[0].identities.map((value) => value.userDocumentId)).toEqual(["user-a", "user-b", "user-c"]);
    expect(report).toMatchObject({
      status: "success",
      mode: "dry-run",
      source: { total: 3, pageCount: 2, sourceSnapshot: "snapshot-001", sourceChecksum: sourceChecksum(all) },
      changes: { missing: 1, firstMisses: 1, suspended: 0, applied: false },
    });
    expect(report.approvalToken).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(report)).not.toContain("example.invalid");
    expect(JSON.stringify(report)).not.toContain("user-a");

    const defaultOptions = {
      ...runInput,
      maxPages: undefined,
      scanTimeoutMs: undefined,
      requestTimeoutMs: undefined,
      maxResponseBytes: undefined,
      maxCanonicalBytes: undefined,
      databaseLockTimeoutMs: undefined,
      databaseStatementTimeoutMs: undefined,
      databaseIdleTransactionTimeoutMs: undefined,
    };
    const defaults = await new MusicReconciler(new FakeSource([
      page({ data: all.slice(0, 2), all, page: 1, pageSize: 2, pageCount: 2, total: 3 }),
      page({ data: all.slice(2), all, page: 2, pageSize: 2, pageCount: 2, total: 3 }),
    ]), new FakeRepository()).run(defaultOptions);
    expect(defaults.status).toBe("success");
  });

  it("uses a scan nonce as independent anti-replay evidence while keeping the source snapshot content-stable", async () => {
    const all = [identity("stable")];
    const stablePage = () => page({ data: all, all, page: 1, pageSize: 2, pageCount: 1, total: 1, snapshot: "content-v1" });
    const repository = new FakeRepository();
    const firstNonce = "a".repeat(64);
    const secondNonce = "b".repeat(64);

    const first = await new MusicReconciler(new FakeSource([stablePage()]), repository).run({
      ...runInput,
      runId: "scan-first",
      scanNonce: firstNonce,
    });
    const second = await new MusicReconciler(new FakeSource([stablePage()]), repository).run({
      ...runInput,
      runId: "scan-second",
      scanNonce: secondNonce,
    });
    const replay = await new MusicReconciler(new FakeSource([stablePage()]), repository).run({
      ...runInput,
      runId: "scan-first-replay",
      scanNonce: firstNonce,
    });

    expect(repository.calls.map((call) => call.source.sourceSnapshot)).toEqual(["content-v1", "content-v1", "content-v1"]);
    expect(repository.calls[0].observationVersion).not.toBe(repository.calls[1].observationVersion);
    expect(repository.calls[0].observationVersion).toBe(repository.calls[2].observationVersion);
    expect((first as MusicReconciliationReport & { scanNonce?: string }).scanNonce).toBe(firstNonce);
    expect((second as MusicReconciliationReport & { scanNonce?: string }).scanNonce).toBe(secondNonce);
    expect((replay as MusicReconciliationReport & { scanNonce?: string }).scanNonce).toBe(firstNonce);
  });

  it("bounds page count and the total scan deadline while the advisory-lock callback is active", async () => {
    const all = [identity("a"), identity("b")];
    const repository = new FakeRepository();
    const tooManyPages = await new MusicReconciler(new FakeSource([
      page({ data: [all[0]], all, page: 1, pageSize: 1, pageCount: 2, total: 2 }),
    ]), repository).run({ ...runInput, pageSize: 1, maxPages: 1 });
    expect(tooManyPages).toMatchObject({ status: "blocked", anomalies: [{ code: "SOURCE_COUNT" }] });
    expect(repository.calls).toHaveLength(0);

    const delayedSource: MusicReconciliationSource = {
      fetchPage: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return page({ data: [all[0]], all: [all[0]], page: 1, pageSize: 2, pageCount: 1, total: 1 });
      },
    };
    const timedOut = await new MusicReconciler(delayedSource, repository).run({ ...runInput, scanTimeoutMs: 1 });
    expect(timedOut).toMatchObject({ status: "blocked", anomalies: [{ code: "SOURCE_UNAVAILABLE" }] });
    expect(repository.calls).toHaveLength(0);
  });

  it("bounds the cumulative canonical scan before database handoff", async () => {
    const all = [identity("a"), identity("b")];
    const repository = new FakeRepository();
    const report = await new MusicReconciler(new FakeSource([
      page({ data: all, all, page: 1, pageSize: 2, pageCount: 1, total: 2 }),
    ]), repository).run({ ...runInput, maxCanonicalBytes: 1 });

    expect(report).toMatchObject({ status: "blocked", anomalies: [{ code: "SOURCE_COUNT" }] });
    expect(repository.calls).toEqual([]);
  });

  it("checks the overall deadline after fetch, checkpoint, and checksum work", async () => {
    const all = [identity("a")];
    const response = page({ data: all, all, page: 1, pageSize: 2, pageCount: 1, total: 1 });
    for (const expireAt of ["fetch", "checkpoint", "checksum"] as const) {
      let calls = 0;
      const timer = vi.spyOn(performance, "now").mockImplementation(() => {
        calls += 1;
        if (expireAt === "fetch") return calls >= 3 ? 2 : 0;
        if (expireAt === "checkpoint") return calls >= 4 ? 2 : 0;
        return calls >= 5 ? 2 : 0;
      });
      try {
        const report = await new MusicReconciler(new FakeSource([response]), new FakeRepository()).run({
          ...runInput,
          scanTimeoutMs: 1,
          onSourceCheckpoint: () => undefined,
        });
        expect(report).toMatchObject({ status: "blocked", anomalies: [{ code: "SOURCE_UNAVAILABLE" }] });
      } finally {
        timer.mockRestore();
      }
    }
  });

  it.each([
    {
      name: "a syntactically valid truncated final page",
      responses: (() => {
        const all = [identity("a"), identity("b"), identity("c")];
        return [
          page({ data: all.slice(0, 2), all, page: 1, pageSize: 2, pageCount: 2, total: 3 }),
          page({ data: [], all, page: 2, pageSize: 2, pageCount: 2, total: 3 }),
        ];
      })(),
      code: "SOURCE_TRUNCATED",
    },
    {
      name: "duplicate identities across pages",
      responses: (() => {
        const all = [identity("a"), identity("b"), identity("b")];
        return [
          page({ data: all.slice(0, 2), all, page: 1, pageSize: 2, pageCount: 2, total: 3 }),
          page({ data: all.slice(2), all, page: 2, pageSize: 2, pageCount: 2, total: 3 }),
        ];
      })(),
      code: "SOURCE_DUPLICATE",
    },
    {
      name: "reordered identities",
      responses: (() => {
        const all = [identity("b"), identity("a")];
        return [page({ data: all, all, page: 1, pageSize: 2, pageCount: 1, total: 2 })];
      })(),
      code: "SOURCE_REORDERED",
    },
    {
      name: "a source mutation between pages",
      responses: (() => {
        const all = [identity("a"), identity("b"), identity("c")];
        return [
          page({ data: all.slice(0, 2), all, page: 1, pageSize: 2, pageCount: 2, total: 3 }),
          page({ data: all.slice(2), all, page: 2, pageSize: 2, pageCount: 2, total: 3, snapshot: "snapshot-002" }),
        ];
      })(),
      code: "SOURCE_DRIFT",
    },
    {
      name: "malformed totals",
      responses: (() => {
        const all = [identity("a")];
        const malformed = page({ data: all, all, page: 1, pageSize: 2, pageCount: 1, total: 1 });
        malformed.meta.pagination.total = -1;
        return [malformed];
      })(),
      code: "SOURCE_SCHEMA",
    },
    {
      name: "uncertain upstream health",
      responses: (() => {
        const all = [identity("a")];
        return [page({ data: all, all, page: 1, pageSize: 2, pageCount: 1, total: 1, healthy: false })];
      })(),
      code: "SOURCE_UNHEALTHY",
    },
    {
      name: "upstream timeout",
      responses: [new DOMException("timed out", "AbortError")],
      code: "SOURCE_UNAVAILABLE",
    },
    {
      name: "a mismatched page cursor",
      responses: (() => {
        const all = [identity("a")];
        return [page({ data: all, all, page: 2, pageSize: 2, pageCount: 1, total: 1 })];
      })(),
      code: "SOURCE_DRIFT",
    },
    {
      name: "a mismatched page count",
      responses: (() => {
        const all = [identity("a")];
        return [page({ data: all, all, page: 1, pageSize: 2, pageCount: 2, total: 1 })];
      })(),
      code: "SOURCE_COUNT",
    },
    {
      name: "an ambiguous completed Account",
      responses: (() => {
        const value = identity("a");
        value.accounts.push({ ...value.accounts[0], documentId: "account-a-2" });
        return [page({ data: [value], all: [value], page: 1, pageSize: 2, pageCount: 1, total: 1 })];
      })(),
      code: "SOURCE_SCHEMA",
    },
    {
      name: "a checksum mismatch",
      responses: (() => {
        const all = [identity("a")];
        return [page({ data: all, all, page: 1, pageSize: 2, pageCount: 1, total: 1, checksum: "0".repeat(64) })];
      })(),
      code: "SOURCE_CHECKSUM",
    },
  ])("blocks $name before any database scan or suspension write", async ({ responses, code }) => {
    // Break caught: a hostile or incomplete scan can reach absence accounting.
    const repository = new FakeRepository();
    const report = await new MusicReconciler(new FakeSource(responses), repository).run(runInput);
    expect(report).toMatchObject({ status: "blocked", anomalies: [{ code }] });
    expect(repository.calls).toEqual([]);
  });

  it("returns a non-overlap report when the PostgreSQL advisory lock is held", async () => {
    // Break caught: workflow and manual invocations can overlap and double-count a miss.
    const all = [identity("a")];
    const repository = new FakeRepository();
    repository.acquired = false;
    const report = await new MusicReconciler(
      new FakeSource([page({ data: all, all, page: 1, pageSize: 2, pageCount: 1, total: 1 })]),
      repository,
    ).run(runInput);
    expect(report).toMatchObject({ status: "blocked", anomalies: [{ code: "LOCK_HELD" }] });
    expect(repository.calls).toEqual([]);
  });

  it("returns a redacted database-unavailable report when lock acquisition fails", async () => {
    const all = [identity("a")];
    const repository: MusicReconciliationRepository = {
      withAdvisoryLock: async () => { throw new Error("postgresql://owner:secret@db/private"); },
    };
    await expect(new MusicReconciler(
      new FakeSource([page({ data: all, all, page: 1, pageSize: 2, pageCount: 1, total: 1 })]),
      repository,
    ).run(runInput)).resolves.toMatchObject({
      status: "blocked",
      anomalies: [{ code: "DATABASE_UNAVAILABLE", message: "The Music identity database is unavailable." }],
    });
  });

  it("contains transaction failures and reports database plan anomalies", async () => {
    const all = [identity("a")];
    const response = page({ data: all, all, page: 1, pageSize: 2, pageCount: 1, total: 1 });
    const failing: MusicReconciliationRepository = {
      withAdvisoryLock: async (work) => ({
        acquired: true,
        value: await work({ reconcileValidatedScan: async () => { throw new Error("secret database detail"); } }),
      }),
    };
    await expect(new MusicReconciler(new FakeSource([response]), failing).run(runInput)).resolves.toMatchObject({
      status: "blocked", anomalies: [{ code: "DATABASE_UNAVAILABLE" }], source: { sourceSnapshot: "snapshot-001" },
    });

    const anomalous = new FakeRepository();
    anomalous.result = safeDatabaseResult({
      status: "anomaly",
      anomalies: [{ code: "CHANGE_THRESHOLD", message: "The proposed absence count exceeds the reviewed threshold." }],
    });
    await expect(new MusicReconciler(new FakeSource([response]), anomalous).run(runInput)).resolves.toMatchObject({
      status: "blocked", anomalies: [{ code: "CHANGE_THRESHOLD" }],
    });
  });

  it("rejects invalid bounds before source access and contains checkpoint callback failures", async () => {
    const all = [identity("a")];
    const response = page({ data: all, all, page: 1, pageSize: 2, pageCount: 1, total: 1 });
    const repository = new FakeRepository();
    for (const invalid of [
      { pageSize: 0 }, { maxRows: 0 }, { batchSize: 0 }, { maxPages: 0 }, { scanTimeoutMs: 0 },
      { requestTimeoutMs: 0 }, { maxResponseBytes: 0 }, { maxCanonicalBytes: 0 },
      { databaseLockTimeoutMs: 0 }, { databaseStatementTimeoutMs: 0 },
      { databaseIdleTransactionTimeoutMs: 0 }, { maxChangeAbsolute: -1 },
    ]) {
      await expect(new MusicReconciler(new FakeSource([response]), repository).run({ ...runInput, ...invalid })).resolves.toMatchObject({
        status: "blocked", anomalies: [{ code: "SOURCE_COUNT" }],
      });
    }
    await expect(new MusicReconciler(new FakeSource([response]), repository).run({ ...runInput, runId: "unsafe run" })).resolves.toMatchObject({
      status: "blocked", anomalies: [{ code: "SOURCE_SCHEMA" }],
    });
    await expect(new MusicReconciler(new FakeSource([response]), repository).run({ ...runInput, maxChangePercent: Number.NaN })).resolves.toMatchObject({
      status: "blocked", anomalies: [{ code: "SOURCE_COUNT" }],
    });
    await expect(new MusicReconciler(new FakeSource([response]), repository).run({ ...runInput, scanNonce: undefined })).resolves.toMatchObject({
      status: "blocked", anomalies: [{ code: "SOURCE_SCHEMA" }],
    });
    expect(repository.calls).toEqual([]);
    await expect(new MusicReconciler(new FakeSource([response]), new FakeRepository()).run({
      ...runInput,
      onSourceCheckpoint: () => { throw new Error("checkpoint disk detail"); },
    })).resolves.toMatchObject({ status: "blocked", anomalies: [{ code: "SOURCE_UNAVAILABLE" }] });
  });

  it("requires an eligible environment, enabled apply policy, reviewed checkpoint, and exact approval token", async () => {
    // Break caught: --apply alone can mutate production or an unreviewed plan.
    const all = [identity("a")];
    const response = page({ data: all, all, page: 1, pageSize: 2, pageCount: 1, total: 1 });
    const dryRepository = new FakeRepository();
    const dry = await new MusicReconciler(new FakeSource([response]), dryRepository).run(runInput);
    const review: ReconciliationReview = {
      scanNonce: runInput.scanNonce,
      source: dry.source!,
      planFingerprint: dry.planFingerprint!,
      approvalToken: dry.approvalToken!,
    };

    for (const candidate of [
      { ...runInput, requestedMode: "apply" as const, environment: "production" as const, review, approvalToken: review.approvalToken },
      { ...runInput, requestedMode: "apply" as const, applyEnabled: false, review, approvalToken: review.approvalToken },
      { ...runInput, requestedMode: "apply" as const, approvalToken: review.approvalToken },
      { ...runInput, requestedMode: "apply" as const, review: { ...review, scanNonce: "f".repeat(64) }, approvalToken: review.approvalToken },
      { ...runInput, requestedMode: "apply" as const, review, approvalToken: "0".repeat(64) },
      { ...runInput, requestedMode: "apply" as const, review, approvalToken: "short" },
    ]) {
      const repository = new FakeRepository();
      const report = await new MusicReconciler(new FakeSource([response]), repository).run(candidate);
      expect(report.status).toBe("blocked");
      expect(repository.calls).toEqual([]);
    }

    const applyRepository = new FakeRepository();
    applyRepository.result = safeDatabaseResult({ applied: true, suspended: 1 });
    const applied = await new MusicReconciler(new FakeSource([response]), applyRepository).run({
      ...runInput,
      requestedMode: "apply",
      review,
      approvalToken: review.approvalToken,
    });
    expect(applyRepository.calls[0]).toMatchObject({
      apply: true,
      expectedPlanFingerprint: "plan-fingerprint-001",
    });
    expect(applied).toMatchObject({ status: "success", mode: "apply", changes: { applied: true, suspended: 1 } });
  });

  it("rejects every source metadata drift from the reviewed dry-run", async () => {
    // Break caught: resume applies a different upstream population than the human reviewed.
    const all = [identity("a")];
    const response = page({ data: all, all, page: 1, pageSize: 2, pageCount: 1, total: 1, snapshot: "snapshot-new" });
    const repository = new FakeRepository();
    const review: ReconciliationReview = {
      scanNonce: runInput.scanNonce,
      source: {
        schemaVersion: "strapi-music-reconciliation/v1",
        sourceSnapshot: "snapshot-reviewed",
        sourceChecksum: "a".repeat(64),
        total: 1,
        pageCount: 1,
      },
      planFingerprint: "plan-reviewed",
      approvalToken: "b".repeat(64),
    };
    for (const changed of [
      review,
      { ...review, source: { ...response.meta.reconciliation, schemaVersion: "strapi-music-reconciliation/v1" as const, total: 1, pageCount: 1, sourceSnapshot: "snapshot-new", sourceChecksum: "b".repeat(64) } },
      { ...review, source: { ...review.source, sourceSnapshot: "snapshot-new", sourceChecksum: response.meta.reconciliation.sourceChecksum, total: 2 } },
      { ...review, source: { ...review.source, sourceSnapshot: "snapshot-new", sourceChecksum: response.meta.reconciliation.sourceChecksum, pageCount: 2 } },
    ]) {
      const candidateRepository = new FakeRepository();
      const report = await new MusicReconciler(new FakeSource([response]), candidateRepository).run({
        ...runInput,
        requestedMode: "apply",
        review: changed,
        approvalToken: changed.approvalToken,
      });
      expect(report).toMatchObject({ status: "blocked", anomalies: [{ code: "SOURCE_DRIFT" }] });
      expect(candidateRepository.calls).toEqual([]);
    }

    const expectedRepository = new FakeRepository();
    const expected = { ...review.source, sourceSnapshot: "snapshot-new", sourceChecksum: response.meta.reconciliation.sourceChecksum };
    await expect(new MusicReconciler(new FakeSource([response]), expectedRepository).run({
      ...runInput,
      expectedSource: expected,
    })).resolves.toMatchObject({ status: "success" });
  });
});
