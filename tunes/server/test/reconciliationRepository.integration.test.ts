import { describe, expect, it, vi } from "vitest";
import { ReconciliationRepository } from "../repositories/reconciliationRepository";
import type { ReconciliationDatabaseInput } from "../services/musicReconciler";

const validInput: ReconciliationDatabaseInput = {
  runId: "defensive-run",
  identities: [],
  source: {
    schemaVersion: "strapi-music-reconciliation/v1",
    sourceSnapshot: "defensive-snapshot",
    sourceChecksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    total: 0,
    pageCount: 1,
  },
  observationVersion: "1",
  batchSize: 10,
  maxRows: 100,
  maxChangeAbsolute: 0,
  maxChangePercent: 0,
  databaseLockTimeoutMs: 5_000,
  databaseStatementTimeoutMs: 120_000,
  databaseIdleTransactionTimeoutMs: 30_000,
  requireSuspensionListener: false,
  apply: false,
};

function repositoryWithQuery(query: (sql: string) => Promise<{ rows: unknown[]; rowCount?: number }>) {
  const client = { query: vi.fn(query), release: vi.fn() };
  const repository = new ReconciliationRepository({ connect: vi.fn(async () => client) } as never);
  return { client, repository };
}

describe("ReconciliationRepository defensive integration boundaries", () => {
  it("preserves the work error when rollback and advisory unlock also fail", async () => {
    const { client, repository } = repositoryWithQuery(async (sql) => {
      if (sql.startsWith("SELECT pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
      if (sql.startsWith("BEGIN")) throw new Error("begin failed");
      if (sql === "ROLLBACK") throw new Error("rollback failed");
      if (sql.startsWith("SELECT pg_advisory_unlock")) throw new Error("unlock failed");
      return { rows: [] };
    });

    await expect(repository.withAdvisoryLock((session) => session.reconcileValidatedScan(validInput))).rejects.toThrow("begin failed");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rejects malformed direct database inputs before beginning a transaction", async () => {
    const { repository } = repositoryWithQuery(async (sql) => sql.startsWith("SELECT pg_try_advisory_lock")
      ? { rows: [{ acquired: true }] }
      : { rows: [{ pg_advisory_unlock: true }] });
    await expect(repository.withAdvisoryLock((session) => session.reconcileValidatedScan({ ...validInput, runId: "bad run id" })))
      .rejects.toThrow("invalid reconciliation database input");

    const { repository: identityRepository } = repositoryWithQuery(async (sql) => sql.startsWith("SELECT pg_try_advisory_lock")
      ? { rows: [{ acquired: true }] }
      : { rows: [{ pg_advisory_unlock: true }] });
    await expect(identityRepository.withAdvisoryLock((session) => session.reconcileValidatedScan({
      ...validInput,
      identities: [{
        userDocumentId: "", accountDocumentId: "account", username: "user", email: "user@example.invalid",
        provider: "local", accountName: "Account", accountType: "Personal", accountMobile: "+10000000000",
      }],
    }))).rejects.toThrow("invalid reconciliation identity input");

    const oversizedValue = "x".repeat(512);
    const oversized = Array.from({ length: 5_000 }, () => ({
      userDocumentId: oversizedValue, accountDocumentId: oversizedValue, username: oversizedValue,
      email: oversizedValue, provider: oversizedValue as "local", accountName: oversizedValue,
      accountType: oversizedValue, accountMobile: oversizedValue,
    }));
    const { repository: oversizedRepository } = repositoryWithQuery(async (sql) => sql.startsWith("SELECT pg_try_advisory_lock")
      ? { rows: [{ acquired: true }] }
      : { rows: [{ pg_advisory_unlock: true }] });
    await expect(oversizedRepository.withAdvisoryLock((session) => session.reconcileValidatedScan({
      ...validInput,
      maxRows: 100_000,
      identities: oversized,
    }))).rejects.toThrow("invalid reconciliation identity input");
  });

  it.each([
    ["lifecycle", 5, 0],
    ["tombstone", 0, 3],
  ])("blocks a bounded %s authority overflow", async (_kind, lifecycleCount, tombstoneCount) => {
    const localRow = {
      id: 1,
      strapi_user_document_id: "user-1",
      strapi_account_document_id: "account-1",
      identity_status: "active",
      session_version: 0,
      lifecycle_operation_id: null,
      lifecycle_state: "none",
      reconciliation_observation_version: "0",
      reconciliation_mismatch_count: 0,
      present: false,
      strapi_username_snapshot: "user",
      strapi_email_snapshot: "user@example.invalid",
      strapi_provider_snapshot: "local",
      strapi_account_name_snapshot: "Account",
      strapi_account_type_snapshot: "Personal",
      strapi_account_mobile_snapshot: "+10000000000",
      source_username: null,
      source_email: null,
      source_provider: null,
      source_account_name: null,
      source_account_type: null,
      source_account_mobile: null,
    };
    const lifecycleRows = Array.from({ length: lifecycleCount }, (_, index) => ({
      operation_id: `nullable-${index}`,
      strapi_user_document_id: "user-1",
      strapi_account_document_id: "account-1",
      music_user_id: null,
      operation_kind: "delete",
      requested_identity_status: "pending_deletion",
      operation_state: "completed",
      operation_phase: "prepared",
      error_code: "NO_LOCAL:PREPARED",
      result_session_version: null,
    }));
    const tombstoneRows = Array.from({ length: tombstoneCount }, (_, index) => ({
      strapi_user_document_id: `retired-user-${index}`,
      strapi_account_document_id: `retired-account-${index}`,
      lifecycle_operation_id: `retired-${index}`,
      music_user_id: null,
      retention_stage: "tombstone-retained",
    }));
    const { repository } = repositoryWithQuery(async (sql) => {
      if (sql.startsWith("SELECT pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
      if (sql.includes("SELECT u.id,u.strapi_user_document_id")) return { rows: [localRow] };
      if (sql.includes("SELECT count(*) AS value") && sql.includes("JOIN music_reconciliation_scan")) return { rows: [{ value: 0 }] };
      if (sql.includes("FROM music_identity_tombstones t")) return { rows: tombstoneRows };
      if (sql.includes("FROM music_identity_lifecycle_operations o JOIN users")) return { rows: lifecycleRows };
      return { rows: [] };
    });
    const locked = await repository.withAdvisoryLock((session) => session.reconcileValidatedScan({
      ...validInput,
      maxRows: 1,
    }));
    expect(locked).toMatchObject({ acquired: true, value: { status: "anomaly", applied: false } });
    if (!locked.acquired) throw new Error("expected lock");
    expect(locked.value.anomalies).toContainEqual(expect.objectContaining({ code: "SOURCE_COUNT" }));
  });

  it.each(["lifecycle", "suspension"])("rolls back a changed %s write count", async (phase) => {
    const { repository } = repositoryWithQuery(async (sql) => {
      if (sql.startsWith("SELECT pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
      if (sql.includes("SELECT u.id,u.strapi_user_document_id")) return { rows: [] };
      if (sql.includes("SELECT count(*) AS value")) return { rows: [{ value: 0 }] };
      if (sql.includes("FROM music_identity_tombstones t")) return { rows: [] };
      if (sql.includes("FROM music_identity_lifecycle_operations o JOIN users")) return { rows: [] };
      if (sql.includes("INSERT INTO music_identity_lifecycle_operations")) {
        return { rows: [], rowCount: phase === "lifecycle" ? 1 : 0 };
      }
      if (sql.includes("UPDATE music_identity_lifecycle_operations o")) return { rows: [], rowCount: 0 };
      if (sql.includes("UPDATE users u SET") && sql.includes("FROM music_identity_lifecycle_operations o")) {
        return { rows: [], rowCount: phase === "suspension" ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    await expect(repository.withAdvisoryLock((session) => session.reconcileValidatedScan({
      ...validInput,
      apply: true,
    }))).rejects.toThrow(phase === "lifecycle" ? /operation count/i : /suspension count/i);
  });
});
