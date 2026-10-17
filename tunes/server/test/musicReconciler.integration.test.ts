import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateMusicDatabase } from "../db/migrate";
import { provisionMusicRuntimeLogin, verifyMusicRuntimeDatabaseConnection } from "../db/music-runtime-role";
import { MusicIdentityRepository, type EnsureMusicIdentityInput } from "../repositories/musicIdentityRepository";
import { ReconciliationRepository } from "../repositories/reconciliationRepository";
import {
  MusicReconciler,
  type MusicReconciliationIdentity,
  type MusicReconciliationReport,
  type ReconciliationReview,
  type ReconciliationSourceMetadata,
} from "../services/musicReconciler";

const exactTarget = process.env.DATABASE_URL_TEST ?? "postgresql://music_migrator:music@127.0.0.1:55432/music_fixture";
const enabled = process.env.MUSIC_C8_POSTGRES_TEST === "1";
const describePg = enabled ? describe.sequential : describe.skip;
const databaseName = `music_c8_reconciliation_${process.pid}`;
const runtimeRole = `music_c8_runtime_${process.pid}`;
const runtimePassword = randomBytes(32).toString("base64url");
let admin: pg.Pool;
let databaseAdmin: pg.Pool;
let pool: pg.Pool;
let databaseAdminUrl: string;
let runtimeDatabaseUrl: string;

function identityInput(suffix: string): EnsureMusicIdentityInput {
  return {
    userDocumentId: `c8-user-${suffix}`,
    accountDocumentId: `c8-account-${suffix}`,
    username: `mutable-${suffix}`,
    email: `${suffix}@example.invalid`,
    provider: "local",
    accountName: `Account ${suffix}`,
    accountType: "Explorer",
    accountMobile: "+15555550100",
    internalUsername: `c8-owner-${suffix}`,
    password: `disabled-password-${suffix}`,
    guestUrl: `c8-public-${suffix}`,
    guestCapabilityHash: createHash("sha256").update(`capability-${suffix}`).digest("hex"),
    operationId: `provision-c8-${suffix}`,
    requestId: `request-c8-${suffix}`,
  };
}

function scannedIdentity(suffix: string, username = `upstream-${suffix}`): MusicReconciliationIdentity {
  return {
    userDocumentId: `c8-user-${suffix}`,
    accountDocumentId: `c8-account-${suffix}`,
    username,
    email: `upstream-${suffix}@example.invalid`,
    provider: "local",
    accountName: `Upstream Account ${suffix}`,
    accountType: "Explorer",
    accountMobile: "+15555550999",
  };
}

function source(snapshot: string, identities: MusicReconciliationIdentity[]): ReconciliationSourceMetadata {
  return {
    schemaVersion: "strapi-music-reconciliation/v1",
    sourceSnapshot: snapshot,
    sourceChecksum: createHash("sha256").update(identities.map((value) => JSON.stringify(value)).join("\n")).digest("hex"),
    total: identities.length,
    pageCount: 1,
  };
}

function runtimeConnection(connectionString: string, user: string) {
  return {
    connectionString,
    password: "redacted-test-value",
    user,
    database: databaseName,
    host: "127.0.0.1",
    port: 55_432,
  };
}

async function reconcile(input: {
  runId: string;
  observationVersion: string;
  identities: MusicReconciliationIdentity[];
  apply?: boolean;
  maxChangeAbsolute?: number;
  maxChangePercent?: number;
  maxRows?: number;
  expectedPlanFingerprint?: string;
  requireSuspensionListener?: boolean;
  databaseLockTimeoutMs?: number;
  databaseStatementTimeoutMs?: number;
  databaseIdleTransactionTimeoutMs?: number;
}) {
  const repository = new ReconciliationRepository(pool);
  const locked = await repository.withAdvisoryLock((session) => session.reconcileValidatedScan({
    runId: input.runId,
    identities: input.identities,
    source: source(`snapshot-${input.observationVersion}`, input.identities),
    observationVersion: input.observationVersion,
    batchSize: 25,
    maxRows: input.maxRows ?? 100_000,
    maxChangeAbsolute: input.maxChangeAbsolute ?? 100,
    maxChangePercent: input.maxChangePercent ?? 100,
    databaseLockTimeoutMs: input.databaseLockTimeoutMs ?? 5_000,
    databaseStatementTimeoutMs: input.databaseStatementTimeoutMs ?? 120_000,
    databaseIdleTransactionTimeoutMs: input.databaseIdleTransactionTimeoutMs ?? 30_000,
    apply: input.apply ?? true,
    expectedPlanFingerprint: input.expectedPlanFingerprint,
    requireSuspensionListener: input.requireSuspensionListener ?? false,
  }));
  expect(locked.acquired).toBe(true);
  if (!locked.acquired) throw new Error("reconciliation advisory lock was not acquired");
  return locked.value;
}

async function scannedLocalExcept(excludedId?: number): Promise<MusicReconciliationIdentity[]> {
  const rows = (await pool.query(`SELECT id,strapi_user_document_id,strapi_account_document_id,
    strapi_username_snapshot,strapi_email_snapshot,strapi_provider_snapshot,
    strapi_account_name_snapshot,strapi_account_type_snapshot,strapi_account_mobile_snapshot
    FROM users WHERE identity_status<>'pending_deletion' ORDER BY strapi_user_document_id`)).rows;
  return rows.filter((row) => row.id !== excludedId).map((row) => ({
    userDocumentId: row.strapi_user_document_id,
    accountDocumentId: row.strapi_account_document_id,
    username: row.strapi_username_snapshot,
    email: row.strapi_email_snapshot,
    provider: row.strapi_provider_snapshot,
    accountName: row.strapi_account_name_snapshot,
    accountType: row.strapi_account_type_snapshot,
    accountMobile: row.strapi_account_mobile_snapshot,
  }));
}

async function reconcileIndependentScan(input: {
  runId: string;
  scanNonce: string;
  identities: MusicReconciliationIdentity[];
  mode: "dry-run" | "apply";
  review?: ReconciliationReview;
  approvalToken?: string;
}): Promise<MusicReconciliationReport> {
  const orderedIdentities = [...input.identities].sort((left, right) => left.userDocumentId.localeCompare(right.userDocumentId));
  const metadata = source("stable-content-snapshot", orderedIdentities);
  const sourceClient = {
    fetchPage: async () => ({
      data: orderedIdentities.map((identity) => ({
        documentId: identity.userDocumentId,
        username: identity.username,
        email: identity.email,
        provider: identity.provider,
        confirmed: true,
        blocked: false,
        accounts: [{
          documentId: identity.accountDocumentId,
          Account_Name: identity.accountName,
          Account_Type: identity.accountType,
          mobile_number: identity.accountMobile,
        }],
      })),
      meta: {
        pagination: { page: 1, pageSize: 100, pageCount: 1, total: orderedIdentities.length },
        reconciliation: {
          schemaVersion: metadata.schemaVersion,
          sourceSnapshot: metadata.sourceSnapshot,
          sourceChecksum: metadata.sourceChecksum,
          healthy: true,
        },
      },
    }),
  };
  return new MusicReconciler(sourceClient, new ReconciliationRepository(pool)).run({
    runId: input.runId,
    scanNonce: input.scanNonce,
    environment: "fixture",
    applyEnabled: true,
    requestedMode: input.mode,
    review: input.review,
    approvalToken: input.approvalToken,
    pageSize: 100,
    maxRows: 100_000,
    batchSize: 25,
    maxChangeAbsolute: 100_000,
    maxChangePercent: 100,
  });
}

describePg("C8 guarded Music reconciliation on PostgreSQL 15", () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: exactTarget });
    expect((await admin.query("SHOW server_version")).rows[0].server_version).toMatch(/^15\./);
    await admin.query(`CREATE DATABASE ${databaseName}`);
    const target = new URL(exactTarget);
    target.pathname = `/${databaseName}`;
    databaseAdminUrl = target.toString();
    databaseAdmin = new pg.Pool({ connectionString: target.toString(), max: 2 });
    await migrateMusicDatabase(databaseAdmin);
    await provisionMusicRuntimeLogin(databaseAdmin, { loginRole: runtimeRole, password: runtimePassword });
    target.username = runtimeRole;
    target.password = runtimePassword;
    runtimeDatabaseUrl = target.toString();
    pool = new pg.Pool({ connectionString: target.toString(), max: 12 });
    expect((await pool.query("SELECT current_user")).rows[0].current_user).toBe(runtimeRole);
    expect((await pool.query("SELECT has_database_privilege(current_user,current_database(),'TEMP') AS allowed")).rows[0].allowed).toBe(false);
  });

  afterAll(async () => {
    await pool?.end();
    await databaseAdmin?.end();
    await admin?.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [databaseName]);
    await admin?.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin?.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
    await admin?.end();
  });

  it("keeps an empty local database empty while validating an upstream-only batch", async () => {
    const result = await reconcile({
      runId: "c8-empty-local",
      observationVersion: "91",
      identities: [scannedIdentity("upstream-before-local")],
    });
    expect(result).toMatchObject({ status: "safe", localTotal: 0, missing: 0, applied: true });
    expect(Number((await pool.query("SELECT count(*) FROM users")).rows[0].count)).toBe(0);
  });

  it("attests the exact restricted runtime role and rejects a privileged login before reconciliation", async () => {
    await expect(verifyMusicRuntimeDatabaseConnection(
      runtimeConnection(runtimeDatabaseUrl, runtimeRole),
      "music_migrator",
    )).resolves.toBeUndefined();
    await expect(verifyMusicRuntimeDatabaseConnection(
      runtimeConnection(databaseAdminUrl, "music_migrator"),
      "music_migrator",
    )).rejects.toThrow(/attestation/i);
  });

  it("rejects an otherwise valid runtime login with a direct authority grant", async () => {
    await databaseAdmin.query(`GRANT UPDATE ON music_schema_migrations TO ${runtimeRole}`);
    try {
      await expect(verifyMusicRuntimeDatabaseConnection(
        runtimeConnection(runtimeDatabaseUrl, runtimeRole),
        "music_migrator",
      )).rejects.toThrow(/attestation/i);
    } finally {
      await databaseAdmin.query(`REVOKE UPDATE ON music_schema_migrations FROM ${runtimeRole}`);
    }
    await expect(verifyMusicRuntimeDatabaseConnection(
      runtimeConnection(runtimeDatabaseUrl, runtimeRole),
      "music_migrator",
    )).resolves.toBeUndefined();
  });

  it("reports actual mutable projection drift and applies the same reviewed change threshold", async () => {
    const identities = new MusicIdentityRepository(pool);
    const mutable = await identities.ensureIdentity(identityInput("projection-drift"));
    const before = (await pool.query("SELECT strapi_username_snapshot FROM users WHERE id=$1", [mutable.id])).rows[0];
    const proposed = [scannedIdentity("projection-drift", "changed-upstream-name")];

    const blocked = await reconcile({
      runId: "c8-projection-threshold",
      observationVersion: "94",
      identities: proposed,
      maxChangeAbsolute: 0,
      maxChangePercent: 100,
    });
    expect(blocked).toMatchObject({
      status: "anomaly",
      projectedUpdates: 1,
      applied: false,
      anomalies: [{ code: "CHANGE_THRESHOLD" }],
    });
    expect((await pool.query("SELECT strapi_username_snapshot FROM users WHERE id=$1", [mutable.id])).rows[0]).toEqual(before);

    const applied = await reconcile({
      runId: "c8-projection-apply",
      observationVersion: "95",
      identities: proposed,
      maxChangeAbsolute: 1,
      maxChangePercent: 100,
    });
    expect(applied).toMatchObject({ status: "safe", projectedUpdates: 1, applied: true });
    const noOp = await reconcile({
      runId: "c8-projection-noop",
      observationVersion: "96",
      identities: proposed,
      apply: false,
      maxChangeAbsolute: 0,
      maxChangePercent: 100,
    });
    expect(noOp).toMatchObject({ status: "safe", projectedUpdates: 0, applied: false });
  });

  it("requires a live suspension listener for apply and admits the exact dedicated session", async () => {
    const proposed = [scannedIdentity("projection-drift", "changed-upstream-name")];
    const unavailable = await reconcile({
      runId: "c8-listener-unavailable",
      observationVersion: "97",
      identities: proposed,
      requireSuspensionListener: true,
    });
    expect(unavailable).toMatchObject({ status: "anomaly", applied: false, anomalies: [{ code: "LISTENER_UNAVAILABLE" }] });

    const listener = await pool.connect();
    await listener.query("SET application_name = 'music-reconciliation-suspension-listener'");
    await listener.query("LISTEN music_identity_suspended");
    await listener.query("SELECT pg_advisory_lock_shared(hashtextextended('music:identity-suspension-listener-ready',0))");
    try {
      const ready = await reconcile({
        runId: "c8-listener-ready",
        observationVersion: "98",
        identities: proposed,
        requireSuspensionListener: true,
      });
      expect(ready).toMatchObject({ status: "safe", applied: true });
    } finally {
      await listener.query("SELECT pg_advisory_unlock_shared(hashtextextended('music:identity-suspension-listener-ready',0))");
      await listener.query("UNLISTEN music_identity_suspended");
      listener.release();
    }
  });

  it("counts only independent complete scans and suspends on the second miss without reactivation", async () => {
    // Break caught: a replay or first absence suspends, or later presence reactivates a lifecycle-owned identity.
    const identities = new MusicIdentityRepository(pool);
    const present = await identities.ensureIdentity(identityInput("present"));
    const missing = await identities.ensureIdentity(identityInput("missing"));

    const stableProjection = scannedIdentity("projection-drift", "changed-upstream-name");
    const scanned = [stableProjection, scannedIdentity("present", "renamed-present")];
    const firstNonce = "a".repeat(64);
    const firstReviewReport = await reconcileIndependentScan({ runId: "c8-first-review", scanNonce: firstNonce, identities: scanned, mode: "dry-run" });
    const firstReview: ReconciliationReview = {
      scanNonce: firstNonce,
      source: firstReviewReport.source!,
      planFingerprint: firstReviewReport.planFingerprint!,
      approvalToken: firstReviewReport.approvalToken!,
    };
    const first = await reconcileIndependentScan({
      runId: "c8-first-apply", scanNonce: firstNonce, identities: scanned, mode: "apply",
      review: firstReview, approvalToken: firstReview.approvalToken,
    });
    expect(first.anomalies).toEqual([]);
    expect(first).toMatchObject({
      status: "success",
      source: { sourceSnapshot: "stable-content-snapshot" },
      changes: { missing: 1, firstMisses: 1, secondMisses: 0, suspended: 0, applied: true },
    });
    let missingRow = (await pool.query("SELECT identity_status,session_version,reconciliation_mismatch_count,reconciliation_observation_version FROM users WHERE id=$1", [missing.id])).rows[0];
    expect(missingRow).toMatchObject({ identity_status: "active", session_version: missing.sessionVersion, reconciliation_mismatch_count: 1 });
    const firstObservationVersion = String(missingRow.reconciliation_observation_version);
    const presentRow = (await pool.query("SELECT strapi_username_snapshot,strapi_email_snapshot,identity_status FROM users WHERE id=$1", [present.id])).rows[0];
    expect(presentRow).toEqual({ strapi_username_snapshot: "renamed-present", strapi_email_snapshot: "upstream-present@example.invalid", identity_status: "active" });

    const replay = await reconcileIndependentScan({
      runId: "c8-first-replay", scanNonce: firstNonce, identities: scanned, mode: "apply",
      review: firstReview, approvalToken: firstReview.approvalToken,
    });
    expect(replay).toMatchObject({ status: "blocked", changes: { applied: false }, anomalies: [{ code: "PLAN_DRIFT" }] });
    expect(Number((await pool.query("SELECT reconciliation_mismatch_count FROM users WHERE id=$1", [missing.id])).rows[0].reconciliation_mismatch_count)).toBe(1);

    const secondNonce = "b".repeat(64);
    const secondReviewReport = await reconcileIndependentScan({ runId: "c8-second-review", scanNonce: secondNonce, identities: scanned, mode: "dry-run" });
    expect(secondReviewReport).toMatchObject({ status: "success", source: { sourceSnapshot: "stable-content-snapshot" } });
    const secondReview: ReconciliationReview = {
      scanNonce: secondNonce,
      source: secondReviewReport.source!,
      planFingerprint: secondReviewReport.planFingerprint!,
      approvalToken: secondReviewReport.approvalToken!,
    };
    const notificationClient = await pool.connect();
    await notificationClient.query("LISTEN music_identity_suspended");
    const notification = new Promise<string | undefined>((resolveNotification) => {
      notificationClient.once("notification", (message) => resolveNotification(message.payload));
    });
    const second = await reconcileIndependentScan({
      runId: "c8-second-apply", scanNonce: secondNonce, identities: scanned, mode: "apply",
      review: secondReview, approvalToken: secondReview.approvalToken,
    });
    expect(second).toMatchObject({ status: "success", changes: { firstMisses: 0, secondMisses: 1, suspended: 1, applied: true } });
    await expect(notification).resolves.toBe(`${missing.id}:${missing.sessionVersion + 1}`);
    await notificationClient.query("UNLISTEN music_identity_suspended");
    notificationClient.release();
    missingRow = (await pool.query("SELECT identity_status,session_version,reconciliation_mismatch_count,guest_capability_revoked_at,guest_discoverable FROM users WHERE id=$1", [missing.id])).rows[0];
    expect(missingRow).toMatchObject({ identity_status: "suspended", session_version: missing.sessionVersion + 1, reconciliation_mismatch_count: 2, guest_discoverable: false });
    expect(String((await pool.query("SELECT reconciliation_observation_version FROM users WHERE id=$1", [missing.id])).rows[0].reconciliation_observation_version)).not.toBe(firstObservationVersion);
    expect(missingRow.guest_capability_revoked_at).toBeInstanceOf(Date);
    expect((await pool.query("SELECT operation_kind,requested_identity_status,operation_state FROM music_identity_lifecycle_operations WHERE music_user_id=$1 AND operation_kind='suspend'", [missing.id])).rows).toEqual([
      { operation_kind: "suspend", requested_identity_status: "suspended", operation_state: "completed" },
    ]);

    const committedReplay = await reconcileIndependentScan({
      runId: "c8-second-apply", scanNonce: secondNonce, identities: scanned, mode: "apply",
      review: secondReview, approvalToken: secondReview.approvalToken,
    });
    expect(committedReplay).toMatchObject({ status: "blocked", anomalies: [{ code: "PLAN_DRIFT" }] });
    expect(Number((await pool.query("SELECT count(*) FROM music_identity_lifecycle_operations WHERE music_user_id=$1 AND operation_kind='suspend'", [missing.id])).rows[0].count)).toBe(1);

    const returnsUpstream = await reconcile({ runId: "c8-third", observationVersion: "103", identities: [scannedIdentity("missing"), stableProjection, scannedIdentity("present", "renamed-present")] });
    expect(returnsUpstream).toMatchObject({ suspended: 0, applied: true });
    expect((await pool.query("SELECT identity_status,reconciliation_mismatch_count FROM users WHERE id=$1", [missing.id])).rows[0])
      .toEqual({ identity_status: "suspended", reconciliation_mismatch_count: 0 });
  });

  it("never creates an upstream-only identity", async () => {
    // Break caught: reconciliation silently becomes a provisioning path.
    const before = Number((await pool.query("SELECT count(*) FROM users")).rows[0].count);
    const result = await reconcile({
      runId: "c8-upstream-only",
      observationVersion: "201",
      identities: [scannedIdentity("missing"), scannedIdentity("present"), scannedIdentity("upstream-only")],
    });
    expect(result).toMatchObject({ status: "safe", applied: true });
    expect(Number((await pool.query("SELECT count(*) FROM users")).rows[0].count)).toBe(before);
    expect(Number((await pool.query("SELECT count(*) FROM users WHERE strapi_user_document_id='c8-user-upstream-only'")).rows[0].count)).toBe(0);
  });

  it("rolls back every write on threshold, plan-drift, or tombstone anomalies", async () => {
    // Break caught: a partially planned batch updates snapshots/misses before an anomaly aborts suspension.
    const identities = new MusicIdentityRepository(pool);
    const guarded = await identities.ensureIdentity(identityInput("guarded"));
    const initial = (await pool.query("SELECT identity_status,session_version,reconciliation_mismatch_count,strapi_username_snapshot FROM users WHERE id=$1", [guarded.id])).rows[0];

    const threshold = await reconcile({
      runId: "c8-threshold",
      observationVersion: "301",
      identities: [],
      maxChangeAbsolute: 0,
      maxChangePercent: 0,
    });
    expect(threshold).toMatchObject({ status: "anomaly", applied: false, suspended: 0, anomalies: [{ code: "CHANGE_THRESHOLD" }] });
    expect((await pool.query("SELECT identity_status,session_version,reconciliation_mismatch_count,strapi_username_snapshot FROM users WHERE id=$1", [guarded.id])).rows[0]).toEqual(initial);

    const dry = await reconcile({ runId: "c8-plan-dry", observationVersion: "302", identities: [scannedIdentity("guarded", "reviewed-name")], apply: false });
    expect(dry.applied).toBe(false);
    const drift = await reconcile({
      runId: "c8-plan-apply",
      observationVersion: "302",
      identities: [scannedIdentity("guarded", "changed-name")],
      expectedPlanFingerprint: dry.planFingerprint,
    });
    expect(drift).toMatchObject({ status: "anomaly", applied: false, anomalies: [{ code: "PLAN_DRIFT" }] });
    expect((await pool.query("SELECT strapi_username_snapshot,reconciliation_mismatch_count FROM users WHERE id=$1", [guarded.id])).rows[0])
      .toEqual({ strapi_username_snapshot: initial.strapi_username_snapshot, reconciliation_mismatch_count: 0 });

    await identities.tombstoneIdentity({
      strapiUserDocumentId: "c8-user-retired",
      strapiAccountDocumentId: "c8-account-retired",
      operationId: "c8-retired-operation",
      reason: "authoritative deletion",
    });
    const tombstone = await reconcile({
      runId: "c8-tombstone",
      observationVersion: "303",
      identities: [scannedIdentity("guarded"), scannedIdentity("retired")],
    });
    expect(tombstone).toMatchObject({ status: "anomaly", applied: false, tombstoneConflicts: 1, anomalies: [{ code: "TOMBSTONE_CONFLICT" }] });
    expect((await pool.query("SELECT identity_status,session_version,reconciliation_mismatch_count FROM users WHERE id=$1", [guarded.id])).rows[0])
      .toEqual({ identity_status: "active", session_version: guarded.sessionVersion, reconciliation_mismatch_count: 0 });

    const collisionA = await identities.ensureIdentity(identityInput("collision-a"));
    const collisionB = await identities.ensureIdentity(identityInput("collision-b"));
    const switched = { ...scannedIdentity("collision-a"), accountDocumentId: "c8-account-collision-b" };
    const collision = await reconcile({ runId: "c8-collision", observationVersion: "304", identities: [switched] });
    expect(collision.status).toBe("anomaly");
    expect(collision.anomalies).toContainEqual({ code: "PLAN_DRIFT", message: "An immutable identity binding conflicts with the validated source." });
    expect((await pool.query("SELECT id,identity_status,reconciliation_mismatch_count FROM users WHERE id=ANY($1::int[]) ORDER BY id", [[collisionA.id, collisionB.id]])).rows)
      .toEqual([
        { id: collisionA.id, identity_status: "active", reconciliation_mismatch_count: 0 },
        { id: collisionB.id, identity_status: "active", reconciliation_mismatch_count: 0 },
      ]);

    const beforeBound = (await pool.query("SELECT identity_status,reconciliation_mismatch_count FROM users WHERE id=$1", [guarded.id])).rows[0];
    const localBound = await reconcile({ runId: "c8-local-bound", observationVersion: "305", identities: [], maxRows: 1 });
    expect(localBound).toMatchObject({ status: "anomaly", applied: false, anomalies: [{ code: "SOURCE_COUNT" }] });
    expect((await pool.query("SELECT identity_status,reconciliation_mismatch_count FROM users WHERE id=$1", [guarded.id])).rows[0]).toEqual(beforeBound);
  });

  it("locks C7 lifecycle authority and never advances prefix-colliding operations", async () => {
    const identities = new MusicIdentityRepository(pool);
    const victim = await identities.ensureIdentity(identityInput("lifecycle-victim"));
    const other = await identities.ensureIdentity(identityInput("lifecycle-other"));
    const absentVictim = await scannedLocalExcept(victim.id);
    const first = await reconcile({
      runId: "c8-lifecycle-first",
      observationVersion: "401",
      identities: absentVictim,
    });
    expect(first).toMatchObject({ status: "safe", firstMisses: 1, suspended: 0, applied: true });

    const collisionId = `reconcile-suspend:c8-lifecycle-collision:${victim.id}`;
    await pool.query(`INSERT INTO music_identity_lifecycle_operations(
      operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,
      operation_kind,requested_identity_status,operation_state,operation_phase
    ) VALUES ($1,$2,$3,$4,'reactivate','active','requested','single')`, [
      collisionId,
      other.strapiUserDocumentId,
      other.strapiAccountDocumentId,
      other.id,
    ]);
    const collision = await reconcile({
      runId: "c8-lifecycle-collision",
      observationVersion: "402",
      identities: absentVictim,
    });
    expect(collision).toMatchObject({ status: "anomaly", applied: false, suspended: 0 });
    expect(collision.anomalies).toContainEqual({ code: "PLAN_DRIFT", message: "A lifecycle authority conflicts with the reconciliation plan." });
    expect((await pool.query("SELECT operation_state FROM music_identity_lifecycle_operations WHERE operation_id=$1", [collisionId])).rows[0].operation_state)
      .toBe("requested");
    expect((await pool.query("SELECT identity_status,reconciliation_mismatch_count FROM users WHERE id=$1", [victim.id])).rows[0])
      .toEqual({ identity_status: "active", reconciliation_mismatch_count: 1 });

    const inconsistentCompletedId = `reconcile-suspend:c8-lifecycle-result-mismatch:${victim.id}`;
    await pool.query(`INSERT INTO music_identity_lifecycle_operations(
      operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,
      operation_kind,requested_identity_status,operation_state,operation_phase,result_session_version
    ) VALUES ($1,$2,$3,$4,'suspend','suspended','completed','single',$5)`, [
      inconsistentCompletedId,
      victim.strapiUserDocumentId,
      victim.strapiAccountDocumentId,
      victim.id,
      victim.sessionVersion + 99,
    ]);
    const inconsistentCompleted = await reconcile({
      runId: "c8-lifecycle-result-mismatch",
      observationVersion: "4021",
      identities: absentVictim,
    });
    expect(inconsistentCompleted).toMatchObject({ status: "anomaly", applied: false, suspended: 0 });
    expect(inconsistentCompleted.anomalies).toContainEqual({
      code: "PLAN_DRIFT",
      message: "A lifecycle authority conflicts with the reconciliation plan.",
    });
    expect((await pool.query("SELECT identity_status,reconciliation_mismatch_count FROM users WHERE id=$1", [victim.id])).rows[0])
      .toEqual({ identity_status: "active", reconciliation_mismatch_count: 1 });

    const nullableDelete = "c8-nullable-delete-authority";
    await pool.query(`INSERT INTO music_identity_lifecycle_operations(
      operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,
      operation_kind,requested_identity_status,operation_state,attempt_count,operation_phase,error_code
    ) VALUES ($1,$2,$3,NULL,'delete','pending_deletion','completed',1,'prepared','NO_LOCAL:PREPARED')`, [
      nullableDelete,
      victim.strapiUserDocumentId,
      victim.strapiAccountDocumentId,
    ]);
    const nullableConflict = await reconcile({
      runId: "c8-nullable-conflict",
      observationVersion: "403",
      identities: await scannedLocalExcept(),
    });
    expect(nullableConflict).toMatchObject({ status: "anomaly", applied: false, suspended: 0 });
    expect(nullableConflict.anomalies).toContainEqual({ code: "PLAN_DRIFT", message: "A lifecycle authority conflicts with the reconciliation plan." });
    expect((await pool.query("SELECT operation_state FROM music_identity_lifecycle_operations WHERE operation_id=$1", [nullableDelete])).rows[0].operation_state)
      .toBe("completed");
  });

  it("does not let a pending-deletion backlog dilute the reviewed percentage threshold", async () => {
    const identities = new MusicIdentityRepository(pool);
    for (let index = 0; index < 12; index += 1) {
      const pending = await identities.ensureIdentity(identityInput(`pending-backlog-${index}`));
      await identities.prepareDeletion({
        userDocumentId: pending.strapiUserDocumentId,
        accountDocumentId: pending.strapiAccountDocumentId,
        operationId: `c8-pending-backlog-${index}`,
      });
    }
    const candidate = await identities.ensureIdentity(identityInput("percentage-candidate"));
    const present = await scannedLocalExcept(candidate.id);
    const eligibleTotal = present.length + 1;
    const pendingTotal = Number((await pool.query("SELECT count(*) FROM users WHERE identity_status='pending_deletion'")).rows[0].count);
    const correctPercent = 100 / eligibleTotal;
    const dilutedPercent = 100 / (eligibleTotal + pendingTotal);
    const threshold = (correctPercent + dilutedPercent) / 2;

    const result = await reconcile({
      runId: "c8-pending-denominator",
      observationVersion: "404",
      identities: present,
      maxChangeAbsolute: 100,
      maxChangePercent: threshold,
    });
    expect(result).toMatchObject({ status: "anomaly", applied: false, missing: 1, suspended: 0 });
    expect(result.anomalies).toContainEqual({
      code: "CHANGE_THRESHOLD",
      message: "The proposed identity change count exceeds the reviewed threshold.",
    });
    expect((await pool.query("SELECT identity_status,reconciliation_mismatch_count FROM users WHERE id=$1", [candidate.id])).rows[0])
      .toEqual({ identity_status: "active", reconciliation_mismatch_count: 0 });
  });

  it("quarantines a missing live identity that already has a tombstone", async () => {
    const identities = new MusicIdentityRepository(pool);
    const inconsistent = await identities.ensureIdentity(identityInput("live-tombstone-conflict"));
    await databaseAdmin.query(`INSERT INTO music_identity_lifecycle_operations(
      operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,
      operation_kind,requested_identity_status,operation_state,attempt_count,operation_phase,result_session_version
    ) VALUES ($1,$2,$3,$4,'delete','pending_deletion','completed',1,'finalized',$5)`, [
      "c8-live-tombstone-conflict",
      inconsistent.strapiUserDocumentId,
      inconsistent.strapiAccountDocumentId,
      inconsistent.id,
      inconsistent.sessionVersion,
    ]);
    await databaseAdmin.query("ALTER TABLE music_identity_tombstones DISABLE TRIGGER music_identity_tombstone_insert");
    try {
      await databaseAdmin.query(`INSERT INTO music_identity_tombstones(
        strapi_user_document_id,strapi_account_document_id,music_user_id,reason,lifecycle_operation_id
      ) VALUES ($1,$2,$3,'defensive inconsistent fixture',$4)`, [
        inconsistent.strapiUserDocumentId,
        inconsistent.strapiAccountDocumentId,
        inconsistent.id,
        "c8-live-tombstone-conflict",
      ]);
    } finally {
      await databaseAdmin.query("ALTER TABLE music_identity_tombstones ENABLE TRIGGER music_identity_tombstone_insert");
    }

    const result = await reconcile({
      runId: "c8-live-tombstone",
      observationVersion: "405",
      identities: await scannedLocalExcept(inconsistent.id),
    });
    expect(result).toMatchObject({ status: "anomaly", applied: false, suspended: 0, tombstoneConflicts: 1 });
    expect(result.anomalies).toContainEqual({
      code: "TOMBSTONE_CONFLICT",
      message: "The validated source contains a retired Music identity.",
    });
    expect((await pool.query("SELECT identity_status,reconciliation_mismatch_count FROM users WHERE id=$1", [inconsistent.id])).rows[0])
      .toEqual({ identity_status: "active", reconciliation_mismatch_count: 0 });
  });

  it("bounds waits behind a C7 immutable-pair lock and rolls back with zero writes", async () => {
    const identities = new MusicIdentityRepository(pool);
    const blocked = await identities.ensureIdentity(identityInput("held-pair-lock"));
    const before = (await pool.query(
      "SELECT identity_status,reconciliation_mismatch_count FROM users WHERE id=$1",
      [blocked.id],
    )).rows[0];
    const holder = await pool.connect();
    await holder.query("BEGIN");
    await holder.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`music:user:${blocked.strapiUserDocumentId}`]);
    const started = Date.now();
    try {
      await expect(reconcile({
        runId: "c8-held-pair-lock",
        observationVersion: "406",
        identities: await scannedLocalExcept(),
        databaseLockTimeoutMs: 100,
      })).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(3_000);
      expect((await pool.query(
        "SELECT identity_status,reconciliation_mismatch_count FROM users WHERE id=$1",
        [blocked.id],
      )).rows[0]).toEqual(before);
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
    }
  });

  it("uses one PostgreSQL advisory lock across repository instances", async () => {
    // Break caught: scheduled and manual runs both enter the scan/write section.
    const external = await pool.connect();
    await external.query("SELECT pg_advisory_lock(hashtextextended('music:identity-reconciliation',0))");
    try {
      const repository = new ReconciliationRepository(pool);
      await expect(repository.withAdvisoryLock(async () => "entered")).resolves.toEqual({ acquired: false });
    } finally {
      await external.query("SELECT pg_advisory_unlock(hashtextextended('music:identity-reconciliation',0))");
      external.release();
    }
    const repository = new ReconciliationRepository(pool);
    await expect(repository.withAdvisoryLock(async () => "entered")).resolves.toEqual({ acquired: true, value: "entered" });
  });

});
