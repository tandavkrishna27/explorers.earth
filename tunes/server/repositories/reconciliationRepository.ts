import { createHash, timingSafeEqual } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  MusicReconciliationRepository,
  MusicReconciliationSession,
  ReconciliationAnomaly,
  ReconciliationDatabaseInput,
  ReconciliationDatabaseResult,
} from "../services/musicReconciler";

const RECONCILIATION_LOCK_NAME = "music:identity-reconciliation";

type ReconciliationPool = Pick<Pool, "connect">;
interface LocalReconciliationRow {
  id: number;
  strapi_user_document_id: string;
  strapi_account_document_id: string;
  identity_status: string;
  session_version: number;
  lifecycle_operation_id: string | null;
  lifecycle_state: string;
  reconciliation_observation_version: string;
  reconciliation_mismatch_count: number;
  present: boolean;
  strapi_username_snapshot: string | null;
  strapi_email_snapshot: string | null;
  strapi_provider_snapshot: string | null;
  strapi_account_name_snapshot: string | null;
  strapi_account_type_snapshot: string | null;
  strapi_account_mobile_snapshot: string | null;
  source_username: string | null;
  source_email: string | null;
  source_provider: string | null;
  source_account_name: string | null;
  source_account_type: string | null;
  source_account_mobile: string | null;
}

interface LifecycleAuthorityRow {
  operation_id: string;
  strapi_user_document_id: string;
  strapi_account_document_id: string;
  music_user_id: number | null;
  operation_kind: string;
  requested_identity_status: string;
  operation_state: string;
  operation_phase: string;
  error_code: string | null;
  result_session_version: number | null;
}

interface TombstoneAuthorityRow {
  strapi_user_document_id: string;
  strapi_account_document_id: string;
  lifecycle_operation_id: string;
  music_user_id: number | null;
  retention_stage: string;
}

const SOURCE_RECORDSET = `SELECT * FROM jsonb_to_recordset($1::jsonb) AS source(
  user_document_id text,account_document_id text,username text,email text,provider text,
  account_name text,account_type text,account_mobile text
)`;

export class ReconciliationRepository implements MusicReconciliationRepository {
  constructor(private readonly pool: ReconciliationPool) {}

  async withAdvisoryLock<T>(work: (session: MusicReconciliationSession) => Promise<T>): Promise<
    { acquired: false } | { acquired: true; value: T }
  > {
    const client = await this.pool.connect();
    let acquired = false;
    try {
      acquired = Boolean((await client.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired",
        [RECONCILIATION_LOCK_NAME],
      )).rows[0]?.acquired);
      if (!acquired) return { acquired: false };
      const session = new PostgresReconciliationSession(client);
      return { acquired: true, value: await work(session) };
    } finally {
      if (acquired) {
        await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [RECONCILIATION_LOCK_NAME]).catch(() => undefined);
      }
      client.release();
    }
  }
}

class PostgresReconciliationSession implements MusicReconciliationSession {
  constructor(private readonly client: PoolClient) {}

  async reconcileValidatedScan(input: ReconciliationDatabaseInput): Promise<ReconciliationDatabaseResult> {
    validateInput(input);
    const sourceRows = input.identities.map(sourceRow);
    const sourceJson = JSON.stringify(sourceRows);
    const databaseBatches = Math.ceil(input.identities.length / input.batchSize);
    try {
      await this.client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      await this.client.query(`SELECT
        set_config('lock_timeout',$1,true),
        set_config('statement_timeout',$2,true),
        set_config('idle_in_transaction_session_timeout',$3,true)`, [
        `${input.databaseLockTimeoutMs}ms`,
        `${input.databaseStatementTimeoutMs}ms`,
        `${input.databaseIdleTransactionTimeoutMs}ms`,
      ]);
      await this.client.query(`SELECT count(*) FROM (
        SELECT pg_advisory_xact_lock(hashtextextended(lock_key,0))
        FROM (
          SELECT id,priority,lock_key FROM (
            SELECT u.id,1 AS priority,'music:user:' || u.strapi_user_document_id AS lock_key
            FROM users u ORDER BY u.id LIMIT $1
          ) user_locks
          UNION ALL
          SELECT id,priority,lock_key FROM (
            SELECT u.id,2 AS priority,'music:account:' || u.strapi_account_document_id AS lock_key
            FROM users u ORDER BY u.id LIMIT $1
          ) account_locks
          ORDER BY id,priority
        ) ordered_locks
      ) acquired_locks`, [input.maxRows + 1]);
      const localRows = (await this.client.query<LocalReconciliationRow>(`WITH music_reconciliation_scan AS (${SOURCE_RECORDSET})
        SELECT u.id,u.strapi_user_document_id,
        u.strapi_account_document_id,u.identity_status,u.session_version,u.lifecycle_operation_id,u.lifecycle_state,
        u.reconciliation_observation_version,u.reconciliation_mismatch_count,
        u.strapi_username_snapshot,u.strapi_email_snapshot,u.strapi_provider_snapshot,
        u.strapi_account_name_snapshot,u.strapi_account_type_snapshot,u.strapi_account_mobile_snapshot,
        s.username AS source_username,s.email AS source_email,s.provider AS source_provider,
        s.account_name AS source_account_name,s.account_type AS source_account_type,
        s.account_mobile AS source_account_mobile,
        (s.user_document_id IS NOT NULL) AS present
        FROM users u LEFT JOIN music_reconciliation_scan s
          ON s.user_document_id=u.strapi_user_document_id
         AND s.account_document_id=u.strapi_account_document_id
        ORDER BY u.id LIMIT $2 FOR UPDATE OF u`, [sourceJson, input.maxRows + 1])).rows;
      const localTotal = localRows.length;
      const eligibleTotal = localRows.filter((row) => row.identity_status !== "pending_deletion").length;
      if (localTotal > input.maxRows) {
        const planFingerprint = fingerprintPlan(input, localRows);
        const anomalies: ReconciliationAnomaly[] = [{
          code: "SOURCE_COUNT",
          message: "The local identity count exceeds the reviewed reconciliation bound.",
        }];
        await this.client.query("ROLLBACK");
        return result({
          status: "anomaly",localTotal,eligibleTotal,matched: 0,missing: 0,firstMisses: 0,secondMisses: 0,
          projectedUpdates: 0,proposedChangePercent: 0,suspended: 0,tombstoneConflicts: 0,planFingerprint,
          databaseBatches,applied: false,anomalies,
        });
      }
      const collisionCount = Number((await this.client.query(`WITH music_reconciliation_scan AS (${SOURCE_RECORDSET})
        SELECT count(*) AS value
        FROM users u JOIN music_reconciliation_scan s
          ON s.user_document_id=u.strapi_user_document_id OR s.account_document_id=u.strapi_account_document_id
        WHERE s.user_document_id<>u.strapi_user_document_id OR s.account_document_id<>u.strapi_account_document_id`, [sourceJson])).rows[0].value);
      const tombstoneRows = (await this.client.query<TombstoneAuthorityRow>(`WITH music_reconciliation_scan AS (${SOURCE_RECORDSET})
        SELECT t.strapi_user_document_id,t.strapi_account_document_id,t.lifecycle_operation_id,
          t.music_user_id,t.retention_stage
        FROM music_identity_tombstones t
        WHERE EXISTS (SELECT 1 FROM music_reconciliation_scan s
          WHERE s.user_document_id=t.strapi_user_document_id OR s.account_document_id=t.strapi_account_document_id)
          OR EXISTS (SELECT 1 FROM users u WHERE u.id=ANY($2::bigint[])
            AND (u.strapi_user_document_id=t.strapi_user_document_id
              OR u.strapi_account_document_id=t.strapi_account_document_id))
        ORDER BY t.lifecycle_operation_id LIMIT $3 FOR UPDATE OF t`, [
        sourceJson,
        localRows.map((row) => row.id),
        input.maxRows * 2 + 1,
      ])).rows;
      const tombstoneBoundBreached = tombstoneRows.length > input.maxRows * 2;
      const tombstoneConflicts = tombstoneRows.length;
      const operationPrefix = `reconcile-suspend:${input.runId}:`;
      const lifecycleRows = (await this.client.query<LifecycleAuthorityRow>(`SELECT
          o.operation_id,o.strapi_user_document_id,o.strapi_account_document_id,o.music_user_id,
          o.operation_kind,o.requested_identity_status,o.operation_state,o.operation_phase,o.error_code,
          o.result_session_version
        FROM music_identity_lifecycle_operations o JOIN users u
          ON o.operation_id=$1 || u.id::text
          OR o.strapi_user_document_id=u.strapi_user_document_id
          OR o.strapi_account_document_id=u.strapi_account_document_id
        WHERE u.identity_status<>'pending_deletion' AND (
          o.operation_id=$1 || u.id::text
          OR (o.music_user_id IS NULL AND (
            (o.operation_kind='delete' AND coalesce(o.error_code,'') NOT LIKE 'NO_LOCAL:CANCELLED%')
            OR (o.operation_kind IN ('suspend','reactivate') AND o.operation_state IN ('requested','running','failed'))
          ))
        )
        ORDER BY o.operation_id LIMIT $2 FOR UPDATE OF o`, [operationPrefix, input.maxRows * 4 + 1])).rows;
      const lifecycleBoundBreached = lifecycleRows.length > input.maxRows * 4;
      const lifecycleConflicts = lifecycleRows.filter((row) => lifecycleConflict(row, operationPrefix, localRows)).length;
      const matched = localRows.filter((row) => row.present).length;
      const missingRows = localRows.filter((row) => !row.present && row.identity_status !== "pending_deletion");
      const missing = missingRows.length;
      const independentMissing = missingRows.filter((row) => String(row.reconciliation_observation_version) !== input.observationVersion);
      const firstMisses = independentMissing.filter((row) => Number(row.reconciliation_mismatch_count) === 0).length;
      const secondMisses = independentMissing.filter((row) => row.identity_status === "active"
        && Number(row.reconciliation_mismatch_count) >= 1).length;
      const projectedUpdates = localRows.filter(snapshotChanged).length;
      const planFingerprint = fingerprintPlan(input, localRows, lifecycleRows, tombstoneRows);
      const anomalies: ReconciliationAnomaly[] = [];
      const proposedChanges = missing + projectedUpdates;
      const changePercent = eligibleTotal === 0 ? 0 : proposedChanges * 100 / eligibleTotal;
      if (collisionCount > 0) anomalies.push({ code: "PLAN_DRIFT", message: "An immutable identity binding conflicts with the validated source." });
      if (lifecycleBoundBreached) anomalies.push({ code: "SOURCE_COUNT", message: "The lifecycle authority count exceeds the reviewed reconciliation bound." });
      if (tombstoneBoundBreached) anomalies.push({ code: "SOURCE_COUNT", message: "The tombstone authority count exceeds the reviewed reconciliation bound." });
      if (lifecycleConflicts > 0) anomalies.push({ code: "PLAN_DRIFT", message: "A lifecycle authority conflicts with the reconciliation plan." });
      if (tombstoneConflicts > 0) anomalies.push({ code: "TOMBSTONE_CONFLICT", message: "The validated source contains a retired Music identity." });
      if (proposedChanges > input.maxChangeAbsolute || changePercent > input.maxChangePercent) {
        anomalies.push({ code: "CHANGE_THRESHOLD", message: "The proposed identity change count exceeds the reviewed threshold." });
      }
      if (input.expectedPlanFingerprint && !secureEqual(input.expectedPlanFingerprint, planFingerprint)) {
        anomalies.push({ code: "PLAN_DRIFT", message: "The database plan no longer matches the reviewed dry-run." });
      }
      if (input.requireSuspensionListener && input.apply) {
        const readinessLockAcquired = Boolean((await this.client.query<{ acquired: boolean }>(
          "SELECT pg_try_advisory_lock(hashtextextended('music:identity-suspension-listener-ready',0)) AS acquired",
        )).rows[0]?.acquired);
        if (readinessLockAcquired) {
          await this.client.query("SELECT pg_advisory_unlock(hashtextextended('music:identity-suspension-listener-ready',0))");
        }
        const listenerReady = !readinessLockAcquired;
        if (!listenerReady) anomalies.push({
          code: "LISTENER_UNAVAILABLE",
          message: "The Music suspension notification listener is unavailable.",
        });
      }
      if (anomalies.length > 0 || !input.apply) {
        await this.client.query("ROLLBACK");
        return result({
          status: anomalies.length ? "anomaly" : "safe",
          localTotal,eligibleTotal,matched,missing,firstMisses,secondMisses,projectedUpdates,
          proposedChangePercent: changePercent,
          suspended: 0,tombstoneConflicts,planFingerprint,databaseBatches,applied: false,anomalies,
        });
      }

      for (let offset = 0; offset < sourceRows.length; offset += input.batchSize) {
        const batch = JSON.stringify(sourceRows.slice(offset, offset + input.batchSize));
        await this.client.query(`WITH music_reconciliation_scan AS (${SOURCE_RECORDSET})
          UPDATE users u SET
            strapi_username_snapshot=s.username,
            strapi_email_snapshot=s.email,
            strapi_provider_snapshot=s.provider,
            strapi_account_name_snapshot=s.account_name,
            strapi_account_type_snapshot=s.account_type,
            strapi_account_mobile_snapshot=s.account_mobile,
            last_reconciled_at=clock_timestamp(),
            reconciliation_observation_version=$2::bigint,
            reconciliation_mismatch_count=0,
            updated_at=clock_timestamp()
          FROM music_reconciliation_scan s
          WHERE s.user_document_id=u.strapi_user_document_id
            AND s.account_document_id=u.strapi_account_document_id
            AND u.identity_status<>'pending_deletion'`, [batch, input.observationVersion]);
      }

      const inserted = await this.client.query(`WITH music_reconciliation_scan AS (${SOURCE_RECORDSET})
        INSERT INTO music_identity_lifecycle_operations(
        operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,
        operation_kind,requested_identity_status,operation_phase
      ) SELECT $3 || u.id::text,u.strapi_user_document_id,u.strapi_account_document_id,u.id,
          'suspend','suspended','single'
        FROM users u
        WHERE u.identity_status='active'
          AND u.reconciliation_observation_version<>$2::bigint
          AND u.reconciliation_mismatch_count>=1
          AND NOT EXISTS (SELECT 1 FROM music_reconciliation_scan s
            WHERE s.user_document_id=u.strapi_user_document_id
              AND s.account_document_id=u.strapi_account_document_id)
        RETURNING operation_id`, [sourceJson, input.observationVersion, operationPrefix]);
      const running = await this.client.query(`UPDATE music_identity_lifecycle_operations o
        SET operation_state='running',attempt_count=1,updated_at=clock_timestamp()
        FROM users u WHERE o.operation_id=$1 || u.id::text
          AND o.music_user_id=u.id
          AND o.strapi_user_document_id=u.strapi_user_document_id
          AND o.strapi_account_document_id=u.strapi_account_document_id
          AND o.operation_kind='suspend' AND o.requested_identity_status='suspended'
          AND o.operation_state='requested'
        RETURNING o.operation_id`, [operationPrefix]);
      const completed = await this.client.query(`UPDATE music_identity_lifecycle_operations o
        SET operation_state='completed',result_session_version=u.session_version+1,updated_at=clock_timestamp()
        FROM users u WHERE o.operation_id=$1 || u.id::text
          AND o.music_user_id=u.id
          AND o.strapi_user_document_id=u.strapi_user_document_id
          AND o.strapi_account_document_id=u.strapi_account_document_id
          AND o.operation_kind='suspend' AND o.requested_identity_status='suspended'
          AND o.operation_state='running'
        RETURNING o.operation_id`, [operationPrefix]);
      if (inserted.rowCount !== secondMisses || running.rowCount !== inserted.rowCount || completed.rowCount !== inserted.rowCount) {
        throw new Error("reconciliation lifecycle operation count changed");
      }

      await this.client.query(`WITH music_reconciliation_scan AS (${SOURCE_RECORDSET})
        UPDATE users u SET
        reconciliation_observation_version=$2::bigint,
        reconciliation_mismatch_count=LEAST(2,u.reconciliation_mismatch_count+1),
        last_reconciled_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE u.identity_status IN ('active','suspended')
          AND u.reconciliation_observation_version<>$2::bigint
          AND NOT EXISTS (SELECT 1 FROM music_reconciliation_scan s
            WHERE s.user_document_id=u.strapi_user_document_id
              AND s.account_document_id=u.strapi_account_document_id)`, [sourceJson, input.observationVersion]);
      const suspended = await this.client.query<{ id: number; session_version: number }>(`UPDATE users u SET
        identity_status='suspended',session_version=u.session_version+1,
        lifecycle_operation_id=o.operation_id,lifecycle_state='completed',
        lifecycle_attempt_count=u.lifecycle_attempt_count+1,lifecycle_last_attempt_at=clock_timestamp(),
        lifecycle_error_code=NULL,guest_capability_revoked_at=clock_timestamp(),guest_discoverable=false,
        updated_at=clock_timestamp()
        FROM music_identity_lifecycle_operations o
        WHERE o.operation_id=$1 || u.id::text AND o.music_user_id=u.id
          AND o.operation_kind='suspend' AND o.operation_state='completed'
          AND o.strapi_user_document_id=u.strapi_user_document_id
          AND o.strapi_account_document_id=u.strapi_account_document_id
          AND u.identity_status='active'
        RETURNING u.id,u.session_version`, [operationPrefix]);
      if (suspended.rowCount !== inserted.rowCount) throw new Error("reconciliation suspension count changed");
      if (suspended.rows.length > 0) {
        await this.client.query("SELECT pg_notify('music_identity_suspended', payload) FROM unnest($1::text[]) AS payload", [
          suspended.rows.map((row) => `${row.id}:${row.session_version}`),
        ]);
      }
      await this.client.query("COMMIT");
      return result({
        status: "safe",localTotal,eligibleTotal,matched,missing,firstMisses,secondMisses,projectedUpdates,
        proposedChangePercent: changePercent,
        suspended: suspended.rows.length,tombstoneConflicts,planFingerprint,databaseBatches,applied: true,anomalies: [],
      });
    } catch (error) {
      await this.client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }
}

function validateInput(input: ReconciliationDatabaseInput): void {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(input.runId)
      || !/^(?:0|[1-9][0-9]{0,15})$/.test(input.observationVersion)
      || !Number.isSafeInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 1_000
      || !Number.isSafeInteger(input.maxRows) || input.maxRows < 1 || input.maxRows > 100_000
      || !Number.isSafeInteger(input.maxChangeAbsolute) || input.maxChangeAbsolute < 0 || input.maxChangeAbsolute > 100_000
      || !Number.isFinite(input.maxChangePercent) || input.maxChangePercent < 0 || input.maxChangePercent > 100
      || !Number.isSafeInteger(input.databaseLockTimeoutMs) || input.databaseLockTimeoutMs < 1 || input.databaseLockTimeoutMs > 60_000
      || !Number.isSafeInteger(input.databaseStatementTimeoutMs) || input.databaseStatementTimeoutMs < 1 || input.databaseStatementTimeoutMs > 600_000
      || !Number.isSafeInteger(input.databaseIdleTransactionTimeoutMs) || input.databaseIdleTransactionTimeoutMs < 1 || input.databaseIdleTransactionTimeoutMs > 600_000
      || typeof input.requireSuspensionListener !== "boolean"
      || input.identities.length > input.maxRows) {
    throw new Error("invalid reconciliation database input");
  }
  const values = input.identities.flatMap((identity) => Object.values(identity));
  if (values.some((value) => typeof value !== "string" || value.length < 1 || value.length > 512)) {
    throw new Error("invalid reconciliation identity input");
  }
  if (Buffer.byteLength(JSON.stringify(input.identities), "utf8") > 16 * 1024 * 1024) {
    throw new Error("invalid reconciliation identity input");
  }
}

function fingerprintPlan(
  input: ReconciliationDatabaseInput,
  localRows: LocalReconciliationRow[],
  lifecycleRows: LifecycleAuthorityRow[] = [],
  tombstoneRows: TombstoneAuthorityRow[] = [],
): string {
  return createHash("sha256").update(JSON.stringify({
    source: input.source,
    observationVersion: input.observationVersion,
    thresholds: {
      maxRows: input.maxRows,
      absolute: input.maxChangeAbsolute,
      percent: input.maxChangePercent,
      databaseLockTimeoutMs: input.databaseLockTimeoutMs,
      databaseStatementTimeoutMs: input.databaseStatementTimeoutMs,
      databaseIdleTransactionTimeoutMs: input.databaseIdleTransactionTimeoutMs,
    },
    identities: input.identities,
    local: localRows.map((row) => ({
      id: row.id,
      userDocumentId: row.strapi_user_document_id,
      accountDocumentId: row.strapi_account_document_id,
      identityStatus: row.identity_status,
      sessionVersion: row.session_version,
      lifecycleOperationId: row.lifecycle_operation_id,
      lifecycleState: row.lifecycle_state,
      observationVersion: String(row.reconciliation_observation_version),
      mismatchCount: row.reconciliation_mismatch_count,
      present: row.present,
      snapshots: [
        row.strapi_username_snapshot,row.strapi_email_snapshot,row.strapi_provider_snapshot,
        row.strapi_account_name_snapshot,row.strapi_account_type_snapshot,row.strapi_account_mobile_snapshot,
      ],
    })),
    lifecycle: lifecycleRows,
    tombstones: tombstoneRows,
  })).digest("hex");
}

function sourceRow(identity: ReconciliationDatabaseInput["identities"][number]) {
  return {
    user_document_id: identity.userDocumentId,
    account_document_id: identity.accountDocumentId,
    username: identity.username,
    email: identity.email,
    provider: identity.provider,
    account_name: identity.accountName,
    account_type: identity.accountType,
    account_mobile: identity.accountMobile,
  };
}

function snapshotChanged(row: LocalReconciliationRow): boolean {
  return row.present && row.identity_status !== "pending_deletion" && (
    row.strapi_username_snapshot !== row.source_username
    || row.strapi_email_snapshot !== row.source_email
    || row.strapi_provider_snapshot !== row.source_provider
    || row.strapi_account_name_snapshot !== row.source_account_name
    || row.strapi_account_type_snapshot !== row.source_account_type
    || row.strapi_account_mobile_snapshot !== row.source_account_mobile
  );
}

function lifecycleConflict(
  authority: LifecycleAuthorityRow,
  operationPrefix: string,
  localRows: LocalReconciliationRow[],
): boolean {
  const expected = localRows.find((row) => authority.operation_id === `${operationPrefix}${row.id}`);
  if (expected) {
    return authority.strapi_user_document_id !== expected.strapi_user_document_id
      || authority.strapi_account_document_id !== expected.strapi_account_document_id
      || authority.music_user_id !== expected.id
      || authority.operation_kind !== "suspend"
      || authority.requested_identity_status !== "suspended"
      || authority.operation_state !== "completed"
      || authority.operation_phase !== "single"
      || expected.identity_status !== "suspended"
      || expected.lifecycle_operation_id !== authority.operation_id
      || expected.lifecycle_state !== "completed"
      || authority.result_session_version !== expected.session_version;
  }
  return authority.music_user_id === null;
}

function secureEqual(left: string, right: string): boolean {
  const leftValue = Buffer.from(left);
  const rightValue = Buffer.from(right);
  return leftValue.length === rightValue.length && timingSafeEqual(leftValue, rightValue);
}

function result(value: ReconciliationDatabaseResult): ReconciliationDatabaseResult {
  return value;
}
