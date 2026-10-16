import type { Pool, PoolClient } from "pg";
import { MusicIdentityError } from "../../shared/musicError";
import type { MusicLifecycleStatus } from "../services/musicLifecycleService";
import type { ClaimedLifecycleDeletion } from "../workers/musicLifecycleWorker";
import { advancePublicMusicSnapshotRevision } from "./publicMusicRevision";

export interface MusicIdentityProjection {
  id: number;
  strapiUserDocumentId: string;
  strapiAccountDocumentId: string;
  identityStatus: "active" | "suspended" | "pending_deletion";
  sessionVersion: number;
}

/**
 * ADR-008. What a canonical credential subject resolves to. Deliberately separate
 * from MusicIdentityProjection, which keeps its non-optional Strapi fields: a
 * canonically owned venue has none, and widening that type would push
 * "there may be no Strapi id" into all 44 of its call sites.
 */
export interface CanonicalMusicVenue {
  musicUserId: number;
  sessionVersion: number;
  identityStatus: MusicIdentityProjection["identityStatus"];
}

export interface MusicIdentityNotPresentProjection {
  identityStatus: "not_present";
  strapiUserDocumentId: string;
  strapiAccountDocumentId: string;
}

export type BoundMusicIdentityLifecycleResult = MusicIdentityProjection | MusicIdentityNotPresentProjection;

export interface BoundMusicIdentityLifecycleInput {
  userDocumentId: string;
  accountDocumentId: string;
  operationId: string;
}

export interface CreateMusicIdentityInput {
  username: string;
  password: string;
  guestUrl: string;
  venueName: string;
  strapiUserDocumentId: string;
  strapiAccountDocumentId: string;
  guestCapabilityHash: string;
  operationId: string;
}

export interface EnsureMusicIdentityInput {
  userDocumentId: string;
  accountDocumentId: string;
  username: string;
  email: string;
  provider: "local" | "google";
  accountName: string;
  accountType: string;
  accountMobile: string;
  internalUsername: string;
  password: string;
  guestUrl: string;
  guestCapabilityHash: string;
  operationId: string;
  requestId: string;
}

export interface TombstoneMusicIdentityInput {
  strapiUserDocumentId: string;
  strapiAccountDocumentId: string;
  reason: string;
  operationId: string;
}

export interface TransitionMusicIdentityInput {
  strapiUserDocumentId: string;
  operationId: string;
  kind: "suspend" | "reactivate" | "request_deletion" | "cancel_deletion";
  targetStatus: MusicIdentityProjection["identityStatus"];
}

export interface RevokeMusicCredentialsInput {
  operationId: string;
  musicUserId: number;
  expectedSessionVersion: number;
  reason: "logout_all" | "entitlement_security_revocation" | "credential_compromise";
}

export interface IssueReactivationTokenInput {
  tokenHash: string;
  strapiUserId: number;
  userDocumentId: string;
  accountDocumentId: string;
  operationId: string;
  expiresInSeconds?: number;
}

export interface ClaimedReactivationToken {
  disposition: "claimed";
  strapiUserId: number;
  userDocumentId: string;
  accountDocumentId: string;
  operationId: string;
}

export type ReactivationTokenClaim = ClaimedReactivationToken | {
  disposition: "missing" | "busy" | "expired" | "consumed" | "revoked";
};

export interface MusicCredentialRevocationResult extends RevokeMusicCredentialsInput {
  strapiUserDocumentId: string;
  strapiAccountDocumentId: string;
  resultSessionVersion: number;
  operationState: "completed";
}

export class StaleLifecycleOperationError extends Error {
  readonly code = "STALE_LIFECYCLE_OPERATION" as const;

  constructor(operationId: string) {
    super(`lifecycle operation is stale: ${operationId}`);
    this.name = "StaleLifecycleOperationError";
  }
}

type TransactionPool = Pick<Pool, "query" | "connect">;

const CANONICAL_ACCOUNT_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function projection(row: {
  id: number;
  strapi_user_document_id: string;
  strapi_account_document_id: string;
  identity_status: MusicIdentityProjection["identityStatus"];
  session_version: number;
}): MusicIdentityProjection {
  return {
    id: row.id,
    strapiUserDocumentId: row.strapi_user_document_id,
    strapiAccountDocumentId: row.strapi_account_document_id,
    identityStatus: row.identity_status,
    sessionVersion: row.session_version,
  };
}

function notPresentProjection(input: Pick<BoundMusicIdentityLifecycleInput, "userDocumentId" | "accountDocumentId">): MusicIdentityNotPresentProjection {
  return {
    identityStatus: "not_present",
    strapiUserDocumentId: input.userDocumentId,
    strapiAccountDocumentId: input.accountDocumentId,
  };
}

async function lockIdentity(client: Pick<PoolClient, "query">, userDocumentId: string, accountDocumentId: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`music:user:${userDocumentId}`]);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`music:account:${accountDocumentId}`]);
}

function isCredentialRevocationOperationIdCollision(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const databaseError = error as { code?: unknown; constraint?: unknown };
  return databaseError.code === "23505"
    && databaseError.constraint === "music_credential_revocation_operations_pkey";
}

function validateEnsureInput(input: EnsureMusicIdentityInput): void {
  const required = [
    input.userDocumentId,input.accountDocumentId,input.username,input.email,input.accountName,input.accountType,
    input.accountMobile,input.internalUsername,input.password,input.guestUrl,input.operationId,input.requestId,
  ];
  if (required.some((value) => !value || value.length > 512)
      || !["local", "google"].includes(input.provider)
      || !/^[a-f0-9]{64}$/.test(input.guestCapabilityHash)) {
    throw new MusicIdentityError("REQUEST_INVALID", 400, "Music identity input is invalid.", "none", false);
  }
}

function validateTokenHash(tokenHash: string): void {
  if (!/^[a-f0-9]{64}$/.test(tokenHash)) throw new Error("reactivation token hash is invalid");
}

function validateUuid(value: string, label: string): void {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) {
    throw new Error(`${label} is invalid`);
  }
}

function validateReactivationTokenIssue(input: IssueReactivationTokenInput): void {
  validateTokenHash(input.tokenHash);
  validateUuid(input.operationId, "reactivation operation ID");
  const expiresInSeconds = input.expiresInSeconds ?? 24 * 60 * 60;
  if (!Number.isSafeInteger(input.strapiUserId) || input.strapiUserId < 1
      || !input.userDocumentId || input.userDocumentId.length > 512
      || !input.accountDocumentId || input.accountDocumentId.length > 512
      || !Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 24 * 60 * 60) {
    throw new Error("reactivation token authority is invalid");
  }
}

export class MusicIdentityRepository {
  constructor(
    private readonly pool: TransactionPool,
    private readonly hooks: {
      afterWrite?: () => Promise<void>;
      beforeFinalize?: () => Promise<void>;
      afterRetentionCleanup?: () => Promise<void>;
    } = {},
  ) {}

  async issueReactivationToken(input: IssueReactivationTokenInput): Promise<void> {
    validateReactivationTokenIssue(input);
    await this.pool.query(`INSERT INTO music_reactivation_tokens(
      token_hash,strapi_user_id,strapi_user_document_id,strapi_account_document_id,
      operation_id,expires_at
    ) VALUES ($1,$2,$3,$4,$5,clock_timestamp()+make_interval(secs=>$6))`, [
      input.tokenHash,
      input.strapiUserId,
      input.userDocumentId,
      input.accountDocumentId,
      input.operationId,
      input.expiresInSeconds ?? 24 * 60 * 60,
    ]);
  }

  async claimReactivationToken(tokenHash: string, leaseOwner: string, leaseSeconds = 30): Promise<ReactivationTokenClaim> {
    validateTokenHash(tokenHash);
    validateUuid(leaseOwner, "reactivation lease owner");
    if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 1 || leaseSeconds > 300) {
      throw new Error("reactivation lease duration is invalid");
    }
    const row = (await this.pool.query<{
      disposition: ReactivationTokenClaim["disposition"];
      strapi_user_id: string | null;
      strapi_user_document_id: string | null;
      strapi_account_document_id: string | null;
      operation_id: string | null;
    }>(`WITH claimed AS (
        UPDATE music_reactivation_tokens
        SET lease_owner=$2::uuid,lease_expires_at=clock_timestamp()+make_interval(secs=>$3)
        WHERE token_hash=$1 AND consumed_at IS NULL AND revoked_at IS NULL
          AND expires_at>clock_timestamp()
          AND (lease_expires_at IS NULL OR lease_expires_at<=clock_timestamp())
        RETURNING strapi_user_id,strapi_user_document_id,strapi_account_document_id,operation_id
      ), classified AS (
        SELECT 'claimed'::text AS disposition,strapi_user_id,strapi_user_document_id,
          strapi_account_document_id,operation_id FROM claimed
        UNION ALL
        SELECT CASE
            WHEN token.consumed_at IS NOT NULL THEN 'consumed'
            WHEN token.revoked_at IS NOT NULL THEN 'revoked'
            WHEN token.expires_at<=clock_timestamp() THEN 'expired'
            ELSE 'busy'
          END AS disposition,NULL::bigint,NULL::text,NULL::text,NULL::uuid
        FROM music_reactivation_tokens token
        WHERE token.token_hash=$1 AND NOT EXISTS (SELECT 1 FROM claimed)
      )
      SELECT disposition,strapi_user_id,strapi_user_document_id,strapi_account_document_id,operation_id
      FROM classified LIMIT 1`, [tokenHash, leaseOwner, leaseSeconds])).rows[0];
    if (!row) return { disposition: "missing" };
    if (row.disposition !== "claimed") return { disposition: row.disposition };
    const strapiUserId = Number(row.strapi_user_id);
    if (!Number.isSafeInteger(strapiUserId) || strapiUserId < 1 || !row.strapi_user_document_id
        || !row.strapi_account_document_id || !row.operation_id) {
      throw new Error("durable reactivation token authority is malformed");
    }
    return {
      disposition: "claimed",
      strapiUserId,
      userDocumentId: row.strapi_user_document_id,
      accountDocumentId: row.strapi_account_document_id,
      operationId: row.operation_id,
    };
  }

  async releaseReactivationToken(tokenHash: string, leaseOwner: string): Promise<boolean> {
    validateTokenHash(tokenHash);
    validateUuid(leaseOwner, "reactivation lease owner");
    const result = await this.pool.query(`UPDATE music_reactivation_tokens
      SET lease_owner=NULL,lease_expires_at=NULL
      WHERE token_hash=$1 AND lease_owner=$2::uuid AND consumed_at IS NULL AND revoked_at IS NULL`, [tokenHash, leaseOwner]);
    return result.rowCount === 1;
  }

  async consumeReactivationToken(tokenHash: string, leaseOwner: string): Promise<boolean> {
    validateTokenHash(tokenHash);
    validateUuid(leaseOwner, "reactivation lease owner");
    const result = await this.pool.query(`UPDATE music_reactivation_tokens
      SET consumed_at=clock_timestamp(),lease_owner=NULL,lease_expires_at=NULL
      WHERE token_hash=$1 AND lease_owner=$2::uuid AND consumed_at IS NULL AND revoked_at IS NULL
        AND expires_at>clock_timestamp()`, [tokenHash, leaseOwner]);
    return result.rowCount === 1;
  }

  async revokeReactivationToken(tokenHash: string): Promise<boolean> {
    validateTokenHash(tokenHash);
    const result = await this.pool.query(`UPDATE music_reactivation_tokens
      SET revoked_at=clock_timestamp(),lease_owner=NULL,lease_expires_at=NULL
      WHERE token_hash=$1 AND consumed_at IS NULL AND revoked_at IS NULL`, [tokenHash]);
    return result.rowCount === 1;
  }

  async ensureIdentity(input: EnsureMusicIdentityInput): Promise<MusicIdentityProjection> {
    validateEnsureInput(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('music.request_id',$1,true)", [input.requestId]);
      await lockIdentity(client, input.userDocumentId, input.accountDocumentId);
      const tombstone = await client.query(`SELECT strapi_user_document_id,strapi_account_document_id
        FROM music_identity_tombstones
        WHERE strapi_user_document_id=$1 OR strapi_account_document_id=$2`, [input.userDocumentId, input.accountDocumentId]);
      if (tombstone.rowCount) {
        throw new MusicIdentityError("IDENTITY_TOMBSTONED", 409, "This Music identity was permanently removed.", "contact_support", false, undefined, "tombstone");
      }
      const nullableAuthority = (await client.query<any>(`SELECT operation_id,strapi_user_document_id,
        strapi_account_document_id,operation_kind,error_code,created_at
        FROM music_identity_lifecycle_operations
        WHERE music_user_id IS NULL AND operation_kind IN ('delete','suspend','reactivate')
          AND (strapi_user_document_id=$1 OR strapi_account_document_id=$2)
        ORDER BY created_at DESC,operation_id DESC FOR UPDATE`, [input.userDocumentId,input.accountDocumentId])).rows;
      if (nullableAuthority.some((operation) => operation.strapi_user_document_id !== input.userDocumentId
          || operation.strapi_account_document_id !== input.accountDocumentId)) throw lifecycleConflict();
      const pendingDeletion = nullableAuthority.find((operation) => operation.operation_kind === "delete"
        && !String(operation.error_code ?? "").startsWith("NO_LOCAL:CANCELLED"));
      if (pendingDeletion) {
        throw new MusicIdentityError("IDENTITY_PENDING_DELETION", 409, "This Music identity is pending deletion.", "contact_support", false, undefined, "pending_deletion");
      }
      const availabilityAuthority = nullableAuthority.find((operation) => ["suspend", "reactivate"].includes(operation.operation_kind));
      if (availabilityAuthority?.operation_kind === "suspend") {
        throw new MusicIdentityError("IDENTITY_SUSPENDED", 403, "This Music identity is suspended.", "contact_support", false, undefined, "suspended");
      }
      const existing = await client.query<any>(`SELECT id,strapi_user_document_id,strapi_account_document_id,
        identity_status,session_version FROM users
        WHERE strapi_user_document_id=$1 OR strapi_account_document_id=$2 FOR UPDATE`, [input.userDocumentId, input.accountDocumentId]);
      const row = existing.rows[0];
      if (row) {
        if (row.strapi_user_document_id === input.userDocumentId
            && row.strapi_account_document_id !== input.accountDocumentId) {
          throw new MusicIdentityError("ACCOUNT_SWITCH_CONFLICT", 409, "The selected Explorer Account cannot be changed automatically.", "contact_support", false, undefined, "account_switch");
        }
        if (row.strapi_user_document_id !== input.userDocumentId
            || row.strapi_account_document_id !== input.accountDocumentId) {
          throw new MusicIdentityError("IDENTITY_CONFLICT", 409, "The Explorer identity conflicts with an existing Music identity.", "contact_support", false, undefined, "immutable_collision");
        }
        if (row.identity_status === "suspended") {
          throw new MusicIdentityError("IDENTITY_SUSPENDED", 403, "This Music identity is suspended.", "contact_support", false, undefined, "suspended");
        }
        if (row.identity_status === "pending_deletion") {
          throw new MusicIdentityError("IDENTITY_PENDING_DELETION", 409, "This Music identity is pending deletion.", "contact_support", false, undefined, "pending_deletion");
        }
        const updated = await client.query<any>(`UPDATE users SET
          strapi_username_snapshot=$2,strapi_email_snapshot=$3,strapi_provider_snapshot=$4,
          strapi_account_name_snapshot=$5,strapi_account_type_snapshot=$6,strapi_account_mobile_snapshot=$7,
          last_identity_sync_at=now(),updated_at=now()
          WHERE id=$1
          RETURNING id,strapi_user_document_id,strapi_account_document_id,identity_status,session_version`, [
          row.id,input.username,input.email,input.provider,input.accountName,input.accountType,input.accountMobile,
        ]);
        await this.hooks.afterWrite?.();
        await client.query("COMMIT");
        return projection(updated.rows[0]);
      }
      const inserted = await client.query<any>(`INSERT INTO users(
        username,password,email,guest_url,venue_name,strapi_user_document_id,strapi_account_document_id,
        strapi_username_snapshot,strapi_email_snapshot,strapi_provider_snapshot,strapi_account_name_snapshot,
        strapi_account_type_snapshot,strapi_account_mobile_snapshot,last_identity_sync_at,
        guest_capability_hash,lifecycle_operation_id
      ) VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,$4,$10,$11,now(),$12,$13)
      RETURNING id,strapi_user_document_id,strapi_account_document_id,identity_status,session_version`, [
        input.internalUsername,input.password,input.guestUrl,input.accountName,input.userDocumentId,input.accountDocumentId,
        input.username,input.email,input.provider,input.accountType,input.accountMobile,input.guestCapabilityHash,input.operationId,
      ]);
      await this.hooks.afterWrite?.();
      await client.query("COMMIT");
      return projection(inserted.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof MusicIdentityError) throw error;
      const sqlCode = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
      if (["23505", "23514", "P0001"].includes(sqlCode)) {
        throw new MusicIdentityError("IDENTITY_CONFLICT", 409, "The Explorer identity conflicts with an existing Music identity.", "contact_support", false, undefined, "constraint");
      }
      if (/^08/.test(sqlCode) || ["40001", "40P01", "53300", "53400", "55P03", "57P01", "57P03"].includes(sqlCode)) {
        throw new MusicIdentityError("DATABASE_UNAVAILABLE", 503, "Music identity is temporarily unavailable.", "retry", true, 2);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async findByExternalIdentity(strapiUserDocumentId: string): Promise<MusicIdentityProjection | undefined> {
    const result = await this.pool.query<{
      id: number;
      strapi_user_document_id: string;
      strapi_account_document_id: string;
      identity_status: MusicIdentityProjection["identityStatus"];
      session_version: number;
    }>(`SELECT id,strapi_user_document_id,strapi_account_document_id,identity_status,session_version
       FROM users WHERE strapi_user_document_id=$1`, [strapiUserDocumentId]);
    return result.rows[0] ? projection(result.rows[0]) : undefined;
  }

  async isTombstoned(strapiUserDocumentId: string): Promise<boolean> {
    const result = await this.pool.query<{ present: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM music_identity_tombstones WHERE strapi_user_document_id=$1) AS present",
      [strapiUserDocumentId],
    );
    return result.rows[0]?.present === true;
  }

  /**
   * ADR-008. Resolves a canonical account subject to the venue row it owns, through
   * the account_music_identity mapping rather than any Strapi column.
   *
   * The tombstone check is not hardcoded to false. ADR-007's ownership constraint is
   * an OR, so a venue may carry a legacy Strapi id *and* a canonical mapping, and a
   * tombstone recorded against those legacy ids still applies to it. A venue with no
   * legacy ids simply matches nothing, which is accurate rather than assumed.
   */
  /**
   * Ticket 6.1, step 5 obligation 4. Whether the canonical session that minted a Music
   * credential is still live for that user.
   *
   * The predicate is deliberately the one `authorizeOperation` already applies to owner
   * HTTP - the row exists, belongs to this user, and has not expired - so the two
   * transports cannot disagree about whether somebody is logged in. `session_version` is
   * NOT compared here: that column is the canonical session's counter, while a Music
   * credential's `sessionVersion` is the venue's, and comparing the two would reject every
   * credential.
   */
  async isCanonicalSessionLive(sessionId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query<{ live: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM auth_session
          WHERE id=$1 AND user_id=$2
            AND expires_at>(clock_timestamp() AT TIME ZONE 'UTC')
       ) AS live`, [sessionId, userId]);
    return result.rows[0]?.live === true;
  }

  async resolveCanonicalCredentialSubject(accountId: string): Promise<{
    venue?: CanonicalMusicVenue;
    tombstoned: boolean;
  }> {
    if (!CANONICAL_ACCOUNT_PATTERN.test(accountId)) {
      // Never reaches the database with an uncast subject.
      return { venue: undefined, tombstoned: false };
    }
    const result = await this.pool.query<{
      id: number | null;
      identity_status: MusicIdentityProjection["identityStatus"] | null;
      session_version: number | null;
      tombstoned: boolean;
    }>(`SELECT u.id,u.identity_status,u.session_version,
        EXISTS(SELECT 1 FROM music_identity_tombstones t
          WHERE (u.strapi_user_document_id IS NOT NULL
                 AND t.strapi_user_document_id=u.strapi_user_document_id)
             OR (u.strapi_account_document_id IS NOT NULL
                 AND t.strapi_account_document_id=u.strapi_account_document_id)) AS tombstoned
      FROM account_music_identity m
      JOIN users u ON u.id=m.music_user_id
      WHERE m.account_id=$1::uuid`, [accountId]);
    const row = result.rows[0];
    if (!row?.id || !row.identity_status || !row.session_version) {
      return { venue: undefined, tombstoned: false };
    }
    return {
      venue: { musicUserId: row.id, sessionVersion: row.session_version, identityStatus: row.identity_status },
      tombstoned: row.tombstoned === true,
    };
  }

  async resolveCredentialSubject(strapiUserDocumentId: string): Promise<{
    identity?: MusicIdentityProjection;
    tombstoned: boolean;
  }> {
    const result = await this.pool.query<{
      id: number | null;
      strapi_user_document_id: string | null;
      strapi_account_document_id: string | null;
      identity_status: MusicIdentityProjection["identityStatus"] | null;
      session_version: number | null;
      tombstoned: boolean;
    }>(`SELECT u.id,u.strapi_user_document_id,u.strapi_account_document_id,u.identity_status,u.session_version,
        EXISTS(SELECT 1 FROM music_identity_tombstones t
          WHERE t.strapi_user_document_id=requested.subject
             OR (u.strapi_account_document_id IS NOT NULL
                 AND t.strapi_account_document_id=u.strapi_account_document_id)) AS tombstoned
      FROM (VALUES ($1::text)) AS requested(subject)
      LEFT JOIN users u ON u.strapi_user_document_id=requested.subject`, [strapiUserDocumentId]);
    const row = result.rows[0];
    if (!row?.id || !row.strapi_user_document_id || !row.strapi_account_document_id
        || !row.identity_status || !row.session_version) {
      return { identity: undefined, tombstoned: row?.tombstoned === true };
    }
    return {
      identity: projection({
        id: row.id,
        strapi_user_document_id: row.strapi_user_document_id,
        strapi_account_document_id: row.strapi_account_document_id,
        identity_status: row.identity_status,
        session_version: row.session_version,
      }),
      tombstoned: row.tombstoned === true,
    };
  }

  async revokeAllCredentials(input: RevokeMusicCredentialsInput): Promise<MusicCredentialRevocationResult> {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.operationId)
        || !Number.isSafeInteger(input.musicUserId) || input.musicUserId < 1
        || !Number.isSafeInteger(input.expectedSessionVersion) || input.expectedSessionVersion < 1
        || !["logout_all", "entitlement_security_revocation", "credential_compromise"].includes(input.reason)) {
      throw new MusicIdentityError("REQUEST_INVALID", 400, "Music credential revocation input is invalid.", "none", false);
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const readOperation = async () => (await client.query<any>(`SELECT operation_id,music_user_id,
        strapi_user_document_id,strapi_account_document_id,reason,expected_session_version,
        result_session_version,operation_state
        FROM music_credential_revocation_operations WHERE operation_id=$1`, [input.operationId])).rows[0];
      const exactReplay = (operation: any): MusicCredentialRevocationResult => {
        if (operation.music_user_id !== input.musicUserId
            || operation.reason !== input.reason
            || operation.expected_session_version !== input.expectedSessionVersion
            || operation.result_session_version !== input.expectedSessionVersion + 1
            || operation.operation_state !== "completed") {
          throw new MusicIdentityError("IDENTITY_CONFLICT", 409, "The Music credential revocation state conflicts.", "retry", false, undefined, "operation_mismatch");
        }
        return {
          operationId: operation.operation_id,
          musicUserId: operation.music_user_id,
          strapiUserDocumentId: operation.strapi_user_document_id,
          strapiAccountDocumentId: operation.strapi_account_document_id,
          reason: operation.reason,
          expectedSessionVersion: operation.expected_session_version,
          resultSessionVersion: operation.result_session_version,
          operationState: operation.operation_state,
        };
      };

      const prior = await readOperation();
      if (prior) {
        const replay = exactReplay(prior);
        await client.query("COMMIT");
        return replay;
      }

      const result = await client.query<any>(`SELECT id,strapi_user_document_id,
        strapi_account_document_id,identity_status,session_version
        FROM users WHERE id=$1 FOR UPDATE`, [input.musicUserId]);
      const row = result.rows[0];
      const concurrentReplay = await readOperation();
      if (concurrentReplay) {
        const replay = exactReplay(concurrentReplay);
        await client.query("COMMIT");
        return replay;
      }
      if (!row || row.session_version !== input.expectedSessionVersion) {
        throw new MusicIdentityError("IDENTITY_CONFLICT", 409, "The Music credential revocation state conflicts.", "retry", false, undefined, "session_version");
      }

      const operation = await client.query<any>(`INSERT INTO music_credential_revocation_operations(
        operation_id,music_user_id,strapi_user_document_id,strapi_account_document_id,reason,
        expected_session_version,result_session_version,operation_state
      ) VALUES ($1,$2,$3,$4,$5,$6,$6+1,'completed')
      RETURNING operation_id,music_user_id,strapi_user_document_id,strapi_account_document_id,reason,
        expected_session_version,result_session_version,operation_state`, [
        input.operationId,input.musicUserId,row.strapi_user_document_id,row.strapi_account_document_id,
        input.reason,input.expectedSessionVersion,
      ]);
      const updated = await client.query<any>(`UPDATE users SET session_version=session_version+1,updated_at=now()
        WHERE id=$1 AND session_version=$2
        RETURNING session_version`, [
        input.musicUserId,input.expectedSessionVersion,
      ]);
      if (updated.rows[0]?.session_version !== input.expectedSessionVersion + 1) {
        throw new MusicIdentityError("IDENTITY_CONFLICT", 409, "The Music credential revocation state conflicts.", "retry", false, undefined, "session_version");
      }
      await client.query("COMMIT");
      return exactReplay(operation.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (isCredentialRevocationOperationIdCollision(error)) {
        throw new MusicIdentityError(
          "IDENTITY_CONFLICT",
          409,
          "The Music credential revocation state conflicts.",
          "retry",
          false,
          undefined,
          "operation_mismatch",
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async createIdentity(input: CreateMusicIdentityInput): Promise<MusicIdentityProjection> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await lockIdentity(client, input.strapiUserDocumentId, input.strapiAccountDocumentId);
      const tombstone = await client.query(`SELECT 1 FROM music_identity_tombstones
        WHERE strapi_user_document_id=$1 OR strapi_account_document_id=$2`,
      [input.strapiUserDocumentId, input.strapiAccountDocumentId]);
      if (tombstone.rowCount) throw new Error("immutable external identity is tombstoned");
      const existing = await client.query<any>(`SELECT id,strapi_user_document_id,strapi_account_document_id,identity_status,session_version,lifecycle_operation_id
        FROM users WHERE strapi_user_document_id=$1 OR strapi_account_document_id=$2 FOR UPDATE`,
      [input.strapiUserDocumentId, input.strapiAccountDocumentId]);
      if (existing.rows[0]) {
        if (existing.rows[0].strapi_user_document_id === input.strapiUserDocumentId
            && existing.rows[0].strapi_account_document_id === input.strapiAccountDocumentId
            && existing.rows[0].lifecycle_operation_id === input.operationId) {
          await client.query("COMMIT");
          return projection(existing.rows[0]);
        }
        throw new Error("immutable external identity already exists");
      }
      const inserted = await client.query<any>(`INSERT INTO users
        (username,password,guest_url,venue_name,strapi_user_document_id,strapi_account_document_id,
         guest_capability_hash,lifecycle_operation_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id,strapi_user_document_id,strapi_account_document_id,identity_status,session_version`, [
        input.username, input.password, input.guestUrl, input.venueName,
        input.strapiUserDocumentId, input.strapiAccountDocumentId,
        input.guestCapabilityHash, input.operationId,
      ]);
      await client.query("COMMIT");
      return projection(inserted.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async tombstoneIdentity(input: TombstoneMusicIdentityInput): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existingTombstone = await client.query<any>(`SELECT strapi_user_document_id,strapi_account_document_id,lifecycle_operation_id
        FROM music_identity_tombstones WHERE strapi_user_document_id=$1 OR strapi_account_document_id=$2`,
      [input.strapiUserDocumentId, input.strapiAccountDocumentId]);
      if (existingTombstone.rows[0]) {
        const row = existingTombstone.rows[0];
        if (row.strapi_user_document_id !== input.strapiUserDocumentId
            || row.strapi_account_document_id !== input.strapiAccountDocumentId
            || row.lifecycle_operation_id !== input.operationId) throw new Error("lifecycle operation mismatch");
        await client.query("COMMIT");
        return;
      }
      const live = await client.query<any>(`SELECT id,strapi_user_document_id,strapi_account_document_id FROM users
        WHERE strapi_user_document_id=$1 OR strapi_account_document_id=$2`,
      [input.strapiUserDocumentId, input.strapiAccountDocumentId]);
      if (live.rows[0] && (live.rows[0].strapi_user_document_id !== input.strapiUserDocumentId
          || live.rows[0].strapi_account_document_id !== input.strapiAccountDocumentId)) {
        throw new Error("immutable external identity mismatch");
      }
      if (live.rows[0]) {
        await advancePublicMusicSnapshotRevision(client, live.rows[0].id, "publication_changed");
        await client.query("SELECT finalize_music_identity_deletion($1::integer,$2::text,$3::text)", [
          live.rows[0].id,input.operationId,input.reason,
        ]);
      }
      if (!live.rows[0]) {
        await client.query(`INSERT INTO music_identity_tombstones
          (strapi_user_document_id,strapi_account_document_id,reason,lifecycle_operation_id)
          VALUES ($1,$2,$3,$4)`, [
          input.strapiUserDocumentId, input.strapiAccountDocumentId, input.reason, input.operationId,
        ]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async transitionIdentity(input: TransitionMusicIdentityInput): Promise<MusicIdentityProjection> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const identity = await client.query<any>(`SELECT id,strapi_user_document_id,strapi_account_document_id,
        identity_status,session_version,lifecycle_operation_id FROM users WHERE strapi_user_document_id=$1`,
      [input.strapiUserDocumentId]);
      if (!identity.rows[0]) throw new Error("immutable external identity not found");
      const row = identity.rows[0];
      await lockIdentity(client, row.strapi_user_document_id, row.strapi_account_document_id);
      const locked = (await client.query<any>(`SELECT id,strapi_user_document_id,strapi_account_document_id,
        identity_status,session_version,lifecycle_operation_id FROM users WHERE id=$1 FOR UPDATE`, [row.id])).rows[0];
      if (!locked) throw new Error("immutable external identity not found");
      const operationKind = input.kind === "request_deletion" ? "delete" : input.kind;
      const operation = await client.query<any>(`SELECT operation_id,strapi_user_document_id,strapi_account_document_id,
        music_user_id,operation_kind,requested_identity_status,operation_state,result_session_version,operation_phase
        FROM music_identity_lifecycle_operations WHERE operation_id=$1`, [input.operationId]);
      if (operation.rows[0]) {
        const prior = operation.rows[0];
        if (prior.strapi_user_document_id !== input.strapiUserDocumentId
            || prior.strapi_account_document_id !== locked.strapi_account_document_id
            || prior.music_user_id !== locked.id
            || prior.operation_kind !== operationKind
            || prior.requested_identity_status !== input.targetStatus) throw new Error("lifecycle operation mismatch");
        if (prior.operation_state !== "completed" || !prior.result_session_version) throw new Error("lifecycle operation is incomplete");
        if (locked.lifecycle_operation_id !== input.operationId
            || locked.identity_status !== input.targetStatus
            || locked.session_version !== prior.result_session_version) {
          throw new StaleLifecycleOperationError(input.operationId);
        }
        await client.query("COMMIT");
        return {
          id: locked.id,
          strapiUserDocumentId: input.strapiUserDocumentId,
          strapiAccountDocumentId: locked.strapi_account_document_id,
          identityStatus: input.targetStatus,
          sessionVersion: prior.result_session_version,
        };
      }
      if ((input.kind === "suspend" || input.kind === "reactivate") && locked.identity_status === input.targetStatus) {
        await client.query("COMMIT");
        return projection(locked);
      }
      const valid = (locked.identity_status === "active" && input.targetStatus === "suspended" && input.kind === "suspend")
        || (locked.identity_status === "suspended" && input.targetStatus === "active" && input.kind === "reactivate")
        || (["active", "suspended"].includes(locked.identity_status) && input.targetStatus === "pending_deletion" && input.kind === "request_deletion")
        || (locked.identity_status === "pending_deletion" && input.targetStatus === "suspended" && input.kind === "cancel_deletion");
      if (!valid) throw new Error(`invalid identity lifecycle transition: ${locked.identity_status} -> ${input.targetStatus}`);
      const invalidatesSession = (locked.identity_status === "active" && input.targetStatus === "suspended")
        || input.targetStatus === "pending_deletion"
        || input.kind === "reactivate";
      const resultSessionVersion = locked.session_version + (invalidatesSession ? 1 : 0);
      await client.query(`INSERT INTO music_identity_lifecycle_operations(
        operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,operation_kind,requested_identity_status,operation_phase
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
        input.operationId,input.strapiUserDocumentId,locked.strapi_account_document_id,locked.id,operationKind,input.targetStatus,
        input.kind === "request_deletion" ? "prepared" : "single",
      ]);
      await client.query(`UPDATE music_identity_lifecycle_operations
        SET operation_state='running',attempt_count=attempt_count+1 WHERE operation_id=$1`, [input.operationId]);
      await client.query(`UPDATE music_identity_lifecycle_operations
        SET operation_state='completed',result_session_version=$2 WHERE operation_id=$1`, [input.operationId,resultSessionVersion]);
      const updated = await client.query<any>(`UPDATE users SET identity_status=$2,session_version=$3,
        lifecycle_operation_id=$4,lifecycle_state='completed',lifecycle_attempt_count=lifecycle_attempt_count+1,
        lifecycle_last_attempt_at=now(),lifecycle_error_code=NULL,
        guest_capability_revoked_at=CASE WHEN $2='suspended' THEN now() ELSE guest_capability_revoked_at END,
        guest_discoverable=CASE WHEN $2='suspended' THEN false ELSE guest_discoverable END
        WHERE id=$1 RETURNING id,strapi_user_document_id,strapi_account_document_id,identity_status,session_version`, [
        locked.id,input.targetStatus,resultSessionVersion,input.operationId,
      ]);
      await advancePublicMusicSnapshotRevision(client, locked.id, "publication_changed");
      await client.query("COMMIT");
      return projection(updated.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async suspendIdentity(input: BoundMusicIdentityLifecycleInput): Promise<BoundMusicIdentityLifecycleResult> {
    return this.boundAvailabilityTransition(input, "suspend");
  }

  async reactivateIdentity(input: BoundMusicIdentityLifecycleInput): Promise<BoundMusicIdentityLifecycleResult> {
    return this.boundAvailabilityTransition(input, "reactivate");
  }

  private async boundAvailabilityTransition(
    input: BoundMusicIdentityLifecycleInput,
    kind: "suspend" | "reactivate",
  ): Promise<BoundMusicIdentityLifecycleResult> {
    if (!input.userDocumentId || !input.accountDocumentId || !input.operationId
        || [input.userDocumentId,input.accountDocumentId,input.operationId].some((value) => value.length > 512)) {
      throw new MusicIdentityError("REQUEST_INVALID", 400, "Music lifecycle input is invalid.", "none", false);
    }
    const targetStatus = kind === "suspend" ? "suspended" : "active";
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await lockIdentity(client, input.userDocumentId, input.accountDocumentId);
      const collision = (await client.query<any>(`SELECT operation_id,strapi_user_document_id,
        strapi_account_document_id,music_user_id,operation_kind,requested_identity_status,
        operation_state,result_session_version,error_code
        FROM music_identity_lifecycle_operations WHERE operation_id=$1 FOR UPDATE`, [input.operationId])).rows[0];
      if (collision && (collision.strapi_user_document_id !== input.userDocumentId
          || collision.strapi_account_document_id !== input.accountDocumentId
          || collision.operation_kind !== kind || collision.requested_identity_status !== targetStatus)) {
        throw lifecycleConflict();
      }
      const tombstones = (await client.query<any>(`SELECT strapi_user_document_id,strapi_account_document_id
        FROM music_identity_tombstones
        WHERE strapi_user_document_id=$1 OR strapi_account_document_id=$2`, [input.userDocumentId,input.accountDocumentId])).rows;
      if (tombstones.some((row) => row.strapi_user_document_id !== input.userDocumentId
          || row.strapi_account_document_id !== input.accountDocumentId) || tombstones.length > 1) throw lifecycleConflict();
      if (tombstones[0]) {
        throw new MusicIdentityError(
          "IDENTITY_TOMBSTONED", 409, "This Music identity was permanently removed.",
          "contact_support", false, undefined, "tombstone",
        );
      }
      const liveRows = (await client.query<any>(`SELECT id,strapi_user_document_id,strapi_account_document_id,
        identity_status,session_version,lifecycle_operation_id FROM users
        WHERE strapi_user_document_id=$1 OR strapi_account_document_id=$2 FOR UPDATE`, [
        input.userDocumentId,input.accountDocumentId,
      ])).rows;
      const live = liveRows[0];
      if (liveRows.some((row) => row.strapi_user_document_id !== input.userDocumentId
          || row.strapi_account_document_id !== input.accountDocumentId) || liveRows.length > 1) throw lifecycleConflict();
      const nullableAuthority = (await client.query<any>(`SELECT operation_id,strapi_user_document_id,
        strapi_account_document_id,operation_kind,requested_identity_status,operation_state,
        result_session_version,error_code,created_at FROM music_identity_lifecycle_operations
        WHERE music_user_id IS NULL AND operation_kind IN ('delete','suspend','reactivate')
          AND (strapi_user_document_id=$1 OR strapi_account_document_id=$2)
        ORDER BY created_at DESC,operation_id DESC FOR UPDATE`, [input.userDocumentId,input.accountDocumentId])).rows;
      if (nullableAuthority.some((operation) => operation.strapi_user_document_id !== input.userDocumentId
          || operation.strapi_account_document_id !== input.accountDocumentId)) throw lifecycleConflict();
      const pendingDeletion = nullableAuthority.find((operation) => operation.operation_kind === "delete"
        && !String(operation.error_code ?? "").startsWith("NO_LOCAL:CANCELLED"));

      if (live) {
        if (collision) {
          if (collision.music_user_id !== live.id || collision.operation_state !== "completed"
              || collision.result_session_version !== live.session_version
              || live.lifecycle_operation_id !== input.operationId || live.identity_status !== targetStatus) {
            throw lifecycleConflict();
          }
          await client.query("COMMIT");
          return projection(live);
        }
        if (live.identity_status === "pending_deletion") {
          throw new MusicIdentityError(
            "IDENTITY_PENDING_DELETION", 409, "This Music identity is pending deletion.",
            "contact_support", false, undefined, "pending_deletion",
          );
        }
        if (live.identity_status === targetStatus) {
          await client.query("COMMIT");
          return projection(live);
        }
        const valid = (kind === "suspend" && live.identity_status === "active")
          || (kind === "reactivate" && live.identity_status === "suspended");
        if (!valid || pendingDeletion) throw lifecycleConflict();
        const nextSessionVersion = live.session_version + 1;
        await client.query(`INSERT INTO music_identity_lifecycle_operations(
          operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,
          operation_kind,requested_identity_status,operation_phase
        ) VALUES ($1,$2,$3,$4,$5,$6,'single')`, [
          input.operationId,input.userDocumentId,input.accountDocumentId,live.id,kind,targetStatus,
        ]);
        await client.query(`UPDATE music_identity_lifecycle_operations
          SET operation_state='running',attempt_count=1 WHERE operation_id=$1`, [input.operationId]);
        await client.query(`UPDATE music_identity_lifecycle_operations
          SET operation_state='completed',result_session_version=$2 WHERE operation_id=$1`, [input.operationId,nextSessionVersion]);
        const updated = (await client.query<any>(`UPDATE users SET identity_status=$2,session_version=$3,
          lifecycle_operation_id=$4,lifecycle_state='completed',lifecycle_attempt_count=lifecycle_attempt_count+1,
          lifecycle_last_attempt_at=now(),lifecycle_error_code=NULL,
          guest_capability_revoked_at=CASE WHEN $2='suspended' THEN now() ELSE guest_capability_revoked_at END,
          guest_discoverable=CASE WHEN $2='suspended' THEN false ELSE guest_discoverable END,
          updated_at=now() WHERE id=$1
          RETURNING id,strapi_user_document_id,strapi_account_document_id,identity_status,session_version`, [
          live.id,targetStatus,nextSessionVersion,input.operationId,
        ])).rows[0];
        await advancePublicMusicSnapshotRevision(client, live.id, "publication_changed");
        await this.hooks.afterWrite?.();
        await client.query("COMMIT");
        return projection(updated);
      }

      if (pendingDeletion) {
        throw new MusicIdentityError(
          "IDENTITY_PENDING_DELETION", 409, "This Music identity is pending deletion.",
          "contact_support", false, undefined, "pending_deletion",
        );
      }
      const availabilityAuthority = nullableAuthority.find((operation) => ["suspend", "reactivate"].includes(operation.operation_kind));
      if (collision) {
        if (collision.music_user_id !== null || collision.operation_state !== "completed"
            || availabilityAuthority?.operation_id !== input.operationId) throw lifecycleConflict();
        await client.query("COMMIT");
        return notPresentProjection(input);
      }
      if (availabilityAuthority?.operation_kind === kind || (kind === "reactivate" && !availabilityAuthority)) {
        await client.query("COMMIT");
        return notPresentProjection(input);
      }
      const errorCode = kind === "suspend" ? "NO_LOCAL:SUSPENDED" : "NO_LOCAL:REACTIVATED";
      await client.query(`INSERT INTO music_identity_lifecycle_operations(
        operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,operation_kind,
        requested_identity_status,operation_state,attempt_count,operation_phase,error_code,created_at,updated_at
      ) VALUES ($1,$2,$3,NULL,$4,$5,'completed',1,'single',$6,clock_timestamp(),clock_timestamp())`, [
        input.operationId,input.userDocumentId,input.accountDocumentId,kind,targetStatus,errorCode,
      ]);
      await this.hooks.afterWrite?.();
      await client.query("COMMIT");
      return notPresentProjection(input);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw normalizeLifecycleError(error);
    } finally {
      client.release();
    }
  }

  async prepareDeletion(input: {
    userDocumentId: string;
    accountDocumentId: string;
    operationId: string;
  }): Promise<MusicLifecycleStatus> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await lockIdentity(client, input.userDocumentId, input.accountDocumentId);
      const initialRows = (await client.query<any>(`SELECT id,strapi_user_document_id,strapi_account_document_id
        FROM users WHERE strapi_user_document_id=$1 OR strapi_account_document_id=$2`, [
        input.userDocumentId,input.accountDocumentId,
      ])).rows;
      const initial = initialRows[0];
      if (!initial) {
        const retired = await client.query<any>(`SELECT t.music_user_id,t.lifecycle_operation_id,o.operation_phase,o.operation_state
          FROM music_identity_tombstones t JOIN music_identity_lifecycle_operations o ON o.operation_id=t.lifecycle_operation_id
          WHERE t.strapi_user_document_id=$1 OR t.strapi_account_document_id=$2`, [input.userDocumentId,input.accountDocumentId]);
        if (retired.rows[0]) {
          const exact = retired.rows.length === 1
            && (await client.query<any>(`SELECT strapi_user_document_id,strapi_account_document_id FROM music_identity_tombstones
              WHERE lifecycle_operation_id=$1`, [retired.rows[0].lifecycle_operation_id])).rows[0];
          if (!exact || exact.strapi_user_document_id !== input.userDocumentId
              || exact.strapi_account_document_id !== input.accountDocumentId) throw lifecycleConflict();
          await client.query("COMMIT");
          return {
            operationId: retired.rows[0].lifecycle_operation_id, musicUserId: retired.rows[0].music_user_id,
            identityStatus: "tombstoned", phase: "finalized", state: "completed",
            boundaryCrossed: true, retryable: false, deadLetter: false,
          };
        }
        const priorRows = (await client.query<any>(`SELECT * FROM music_identity_lifecycle_operations
          WHERE music_user_id IS NULL AND operation_kind='delete'
            AND (strapi_user_document_id=$1 OR strapi_account_document_id=$2)
          ORDER BY created_at DESC,operation_id DESC FOR UPDATE`, [input.userDocumentId,input.accountDocumentId])).rows;
        if (priorRows.some((row) => row.strapi_user_document_id !== input.userDocumentId
            || row.strapi_account_document_id !== input.accountDocumentId)) throw lifecycleConflict();
        const prior = priorRows.find((row) => !String(row.error_code ?? "").startsWith("NO_LOCAL:CANCELLED"));
        if (prior) {
          await client.query("COMMIT");
          return noLocalLifecycleStatus(prior);
        }
        const collision = await client.query("SELECT 1 FROM music_identity_lifecycle_operations WHERE operation_id=$1", [input.operationId]);
        if (collision.rowCount) throw lifecycleConflict();
        const created = (await client.query<any>(`INSERT INTO music_identity_lifecycle_operations(
          operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,operation_kind,
          requested_identity_status,operation_state,attempt_count,operation_phase,error_code,created_at,updated_at
        ) VALUES ($1,$2,$3,NULL,'delete','pending_deletion','completed',1,'prepared','NO_LOCAL:PREPARED',
          clock_timestamp(),clock_timestamp()) RETURNING *`, [
          input.operationId,input.userDocumentId,input.accountDocumentId,
        ])).rows[0];
        await this.hooks.afterWrite?.();
        await client.query("COMMIT");
        return noLocalLifecycleStatus(created);
      }
      if (initialRows.length !== 1 || initial.strapi_user_document_id !== input.userDocumentId
          || initial.strapi_account_document_id !== input.accountDocumentId) throw lifecycleConflict();
      await client.query("SELECT lock_music_numeric_user_id($1::integer)", [initial.id]);
      const identity = (await client.query<any>(`SELECT id,strapi_user_document_id,strapi_account_document_id,
        identity_status,session_version,lifecycle_operation_id,lifecycle_state,lifecycle_retention_stage,
        lifecycle_error_code FROM users WHERE id=$1 FOR UPDATE`, [initial.id])).rows[0];
      if (!identity) throw lifecycleConflict();
      if (identity.identity_status === "pending_deletion") {
        const status = await lifecycleStatusForLockedIdentity(client, identity);
        await client.query("COMMIT");
        return status;
      }
      const collision = await client.query("SELECT 1 FROM music_identity_lifecycle_operations WHERE operation_id=$1", [input.operationId]);
      if (collision.rowCount) throw lifecycleConflict();
      const resultSessionVersion = identity.session_version + 1;
      await client.query(`INSERT INTO music_identity_lifecycle_operations(
        operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,operation_kind,
        requested_identity_status,operation_phase
      ) VALUES ($1,$2,$3,$4,'delete','pending_deletion','prepared')`, [
        input.operationId,input.userDocumentId,input.accountDocumentId,identity.id,
      ]);
      await client.query("UPDATE music_identity_lifecycle_operations SET operation_state='running',attempt_count=1 WHERE operation_id=$1", [input.operationId]);
      await client.query(`UPDATE music_identity_lifecycle_operations SET operation_state='completed',
        result_session_version=$2 WHERE operation_id=$1`, [input.operationId,resultSessionVersion]);
      const updated = (await client.query<any>(`UPDATE users SET identity_status='pending_deletion',
        session_version=$2,lifecycle_operation_id=$3,lifecycle_state='completed',
        lifecycle_attempt_count=1,lifecycle_last_attempt_at=now(),lifecycle_error_code=NULL,
        lifecycle_retention_stage='deletion-prepared',guest_capability_revoked_at=now(),guest_discoverable=false,
        updated_at=now() WHERE id=$1 RETURNING id,strapi_user_document_id,strapi_account_document_id,
        identity_status,session_version,lifecycle_operation_id,lifecycle_state,lifecycle_retention_stage,lifecycle_error_code`, [
        identity.id,resultSessionVersion,input.operationId,
      ])).rows[0];
      await advancePublicMusicSnapshotRevision(client, identity.id, "publication_changed");
      await this.hooks.afterWrite?.();
      await client.query("COMMIT");
      return lifecycleStatusForRow(updated, {
        operation_id: input.operationId, operation_phase: "prepared", operation_state: "completed",
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw normalizeLifecycleError(error);
    } finally {
      client.release();
    }
  }

  async lifecycleBinding(userDocumentId: string, accountDocumentId?: string): Promise<{
    disposition: "present";
    userDocumentId: string;
    accountDocumentId: string;
    identityStatus: "active" | "suspended" | "pending_deletion";
  } | {
    disposition: "cancelled" | "suspended_absent";
    userDocumentId: string;
    accountDocumentId: string;
  } | { disposition: "not_present" }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (accountDocumentId) await lockIdentity(client, userDocumentId, accountDocumentId);
      const live = await client.query<any>(accountDocumentId
        ? `SELECT strapi_user_document_id,strapi_account_document_id,identity_status FROM users
          WHERE strapi_user_document_id=$1 OR strapi_account_document_id=$2 FOR UPDATE`
        : `SELECT strapi_user_document_id,strapi_account_document_id,identity_status FROM users
          WHERE strapi_user_document_id=$1 FOR UPDATE`, accountDocumentId ? [userDocumentId, accountDocumentId] : [userDocumentId]);
      const tombstone = await client.query<any>(accountDocumentId
        ? `SELECT strapi_user_document_id,strapi_account_document_id FROM music_identity_tombstones
          WHERE strapi_user_document_id=$1 OR strapi_account_document_id=$2`
        : `SELECT strapi_user_document_id,strapi_account_document_id FROM music_identity_tombstones
          WHERE strapi_user_document_id=$1`, accountDocumentId ? [userDocumentId, accountDocumentId] : [userDocumentId]);
      if (tombstone.rows[0]) {
        const exact = tombstone.rows.length === 1 && tombstone.rows[0].strapi_user_document_id === userDocumentId
          && (!accountDocumentId || tombstone.rows[0].strapi_account_document_id === accountDocumentId);
        if (!exact) throw lifecycleConflict();
        if (accountDocumentId) {
          throw new MusicIdentityError("IDENTITY_TOMBSTONED", 409, "This Music identity was permanently removed.", "contact_support", false, undefined, "tombstone");
        }
        await client.query("COMMIT");
        return {
          disposition: "present", userDocumentId: tombstone.rows[0].strapi_user_document_id,
          accountDocumentId: tombstone.rows[0].strapi_account_document_id, identityStatus: "pending_deletion",
        };
      }
      if (!live.rows[0]) {
        const noLocal = await client.query<any>(accountDocumentId
          ? `SELECT operation_id,strapi_user_document_id,strapi_account_document_id,
              operation_kind,error_code,operation_phase,created_at
            FROM music_identity_lifecycle_operations WHERE music_user_id IS NULL
              AND operation_kind IN ('delete','suspend','reactivate')
              AND (strapi_user_document_id=$1 OR strapi_account_document_id=$2)
            ORDER BY created_at DESC,operation_id DESC FOR UPDATE`
          : `SELECT operation_id,strapi_user_document_id,strapi_account_document_id,
              operation_kind,error_code,operation_phase,created_at
            FROM music_identity_lifecycle_operations WHERE music_user_id IS NULL
              AND operation_kind IN ('delete','suspend','reactivate')
              AND strapi_user_document_id=$1 ORDER BY created_at DESC,operation_id DESC FOR UPDATE`,
        accountDocumentId ? [userDocumentId, accountDocumentId] : [userDocumentId]);
        const durableAccountDocumentId = noLocal.rows[0]?.strapi_account_document_id;
        if (noLocal.rows.some((row) => row.strapi_user_document_id !== userDocumentId
            || row.strapi_account_document_id !== (accountDocumentId ?? durableAccountDocumentId))) throw lifecycleConflict();
        const pendingDeletion = noLocal.rows.find((row) => row.operation_kind === "delete"
          && !String(row.error_code ?? "").startsWith("NO_LOCAL:CANCELLED"));
        if (pendingDeletion) {
          await client.query("COMMIT");
          return {
            disposition: "present", userDocumentId: pendingDeletion.strapi_user_document_id,
            accountDocumentId: pendingDeletion.strapi_account_document_id, identityStatus: "pending_deletion",
          };
        }
        const cancelledDeletion = noLocal.rows.find((row) => row.operation_kind === "delete"
          && String(row.error_code ?? "").startsWith("NO_LOCAL:CANCELLED"));
        if (cancelledDeletion) {
          await client.query("COMMIT");
          return {
            disposition: "cancelled", userDocumentId: cancelledDeletion.strapi_user_document_id,
            accountDocumentId: cancelledDeletion.strapi_account_document_id,
          };
        }
        const availabilityAuthority = noLocal.rows.find((row) => ["suspend", "reactivate"].includes(row.operation_kind));
        if (availabilityAuthority?.operation_kind === "suspend") {
          await client.query("COMMIT");
          return {
            disposition: "suspended_absent", userDocumentId: availabilityAuthority.strapi_user_document_id,
            accountDocumentId: availabilityAuthority.strapi_account_document_id,
          };
        }
        await client.query("COMMIT");
        return { disposition: "not_present" };
      }
      const row = live.rows[0];
      if (live.rows.length !== 1 || row.strapi_user_document_id !== userDocumentId
          || (accountDocumentId && row.strapi_account_document_id !== accountDocumentId)
          || !["active", "suspended", "pending_deletion"].includes(row.identity_status)) throw lifecycleConflict();
      await client.query("COMMIT");
      return {
        disposition: "present",
        userDocumentId: row.strapi_user_document_id,
        accountDocumentId: row.strapi_account_document_id,
        identityStatus: row.identity_status,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async lifecycleStatus(input: { userDocumentId: string; accountDocumentId: string }): Promise<MusicLifecycleStatus> {
    const live = await this.pool.query<any>(`SELECT u.id,u.strapi_user_document_id,u.strapi_account_document_id,
      u.identity_status,u.lifecycle_operation_id,u.lifecycle_state,u.lifecycle_retention_stage,u.lifecycle_error_code,
      o.operation_id,o.operation_kind,o.operation_phase,o.operation_state
      FROM users u JOIN music_identity_lifecycle_operations o ON o.operation_id=u.lifecycle_operation_id
      WHERE u.strapi_user_document_id=$1 OR u.strapi_account_document_id=$2`, [input.userDocumentId,input.accountDocumentId]);
    const row = live.rows[0];
    if (row) {
      if (row.strapi_user_document_id !== input.userDocumentId || row.strapi_account_document_id !== input.accountDocumentId) {
        throw lifecycleConflict();
      }
      if (!['pending_deletion','suspended'].includes(row.identity_status)) {
        throw new MusicIdentityError("LIFECYCLE_NOT_FOUND", 409, "No Music deletion is pending.", "none", false);
      }
      if (row.identity_status === "suspended") {
        if (row.operation_kind !== "cancel_deletion") {
          throw new MusicIdentityError("LIFECYCLE_NOT_FOUND", 409, "No Music deletion is pending.", "none", false);
        }
        return {
          operationId: row.operation_id,
          musicUserId: row.id,
          identityStatus: "suspended",
          phase: "prepared",
          state: "cancelled",
          boundaryCrossed: false,
          retryable: false,
          deadLetter: false,
        };
      }
      return lifecycleStatusForRow(row, row);
    }
    const tombstone = await this.pool.query<any>(`SELECT t.music_user_id,t.lifecycle_operation_id,o.operation_phase,o.operation_state
      FROM music_identity_tombstones t JOIN music_identity_lifecycle_operations o ON o.operation_id=t.lifecycle_operation_id
      WHERE t.strapi_user_document_id=$1 OR t.strapi_account_document_id=$2`, [input.userDocumentId,input.accountDocumentId]);
    const retired = tombstone.rows[0];
    if (!retired) {
      const operations = await this.pool.query<any>(`SELECT * FROM music_identity_lifecycle_operations
        WHERE music_user_id IS NULL AND operation_kind='delete'
          AND (strapi_user_document_id=$1 OR strapi_account_document_id=$2)
        ORDER BY created_at DESC,operation_id DESC`, [input.userDocumentId,input.accountDocumentId]);
      if (!operations.rows[0]) throw new MusicIdentityError("LIFECYCLE_NOT_FOUND", 409, "No Music deletion is pending.", "none", false);
      if (operations.rows.some((operation) => operation.strapi_user_document_id !== input.userDocumentId
          || operation.strapi_account_document_id !== input.accountDocumentId)) throw lifecycleConflict();
      return noLocalLifecycleStatus(operations.rows[0]);
    }
    return {
      operationId: retired.lifecycle_operation_id,
      musicUserId: retired.music_user_id,
      identityStatus: "tombstoned",
      phase: "finalized",
      state: "completed",
      boundaryCrossed: true,
      retryable: false,
      deadLetter: false,
    };
  }

  async markDeletionBoundary(input: { userDocumentId: string; accountDocumentId: string }): Promise<MusicLifecycleStatus> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await lockIdentity(client, input.userDocumentId, input.accountDocumentId);
      const identity = (await client.query<any>(`SELECT id,strapi_user_document_id,strapi_account_document_id,
        identity_status,lifecycle_operation_id,lifecycle_state,lifecycle_retention_stage,lifecycle_error_code
        FROM users WHERE strapi_user_document_id=$1 FOR UPDATE`, [input.userDocumentId])).rows[0];
      if (!identity) {
        const collision = await client.query("SELECT 1 FROM users WHERE strapi_account_document_id=$1", [input.accountDocumentId]);
        if (collision.rowCount) throw lifecycleConflict();
        const operations = (await client.query<any>(`SELECT * FROM music_identity_lifecycle_operations
          WHERE music_user_id IS NULL AND operation_kind='delete'
            AND (strapi_user_document_id=$1 OR strapi_account_document_id=$2)
          ORDER BY created_at DESC,operation_id DESC FOR UPDATE`, [input.userDocumentId,input.accountDocumentId])).rows;
        const operation = operations[0];
        if (!operation || operations.some((row) => row.strapi_user_document_id !== input.userDocumentId
            || row.strapi_account_document_id !== input.accountDocumentId)
            || operation.operation_phase !== "prepared" || operation.operation_state !== "completed"
            || String(operation.error_code ?? "").startsWith("NO_LOCAL:CANCELLED")) throw lifecycleConflict();
        if (String(operation.error_code) === "NO_LOCAL:PREPARED") {
          const updated = (await client.query<any>(`UPDATE music_identity_lifecycle_operations
            SET error_code='NO_LOCAL:BOUNDARY' WHERE operation_id=$1 RETURNING *`, [operation.operation_id])).rows[0];
          await client.query("COMMIT");
          return noLocalLifecycleStatus(updated);
        }
        await client.query("COMMIT");
        return noLocalLifecycleStatus(operation);
      }
      if (identity.strapi_account_document_id !== input.accountDocumentId
          || identity.identity_status !== "pending_deletion") throw lifecycleConflict();
      const operation = (await client.query<any>(`SELECT operation_id,operation_kind,operation_phase,operation_state
        FROM music_identity_lifecycle_operations WHERE operation_id=$1 FOR UPDATE`, [identity.lifecycle_operation_id])).rows[0];
      if (!operation || operation.operation_kind !== "delete" || operation.operation_phase !== "prepared"
          || operation.operation_state !== "completed") throw lifecycleConflict();
      if (identity.lifecycle_retention_stage === "deletion-prepared") {
        const updated = (await client.query<any>(`UPDATE users SET lifecycle_retention_stage='upstream-delete-attempted',
          lifecycle_state='requested',lifecycle_last_attempt_at=now(),lifecycle_error_code=NULL,updated_at=now()
          WHERE id=$1 RETURNING *`, [identity.id])).rows[0];
        await client.query("COMMIT");
        return lifecycleStatusForRow(updated, operation);
      }
      await client.query("COMMIT");
      return lifecycleStatusForRow(identity, operation);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw normalizeLifecycleError(error);
    } finally {
      client.release();
    }
  }

  async cancelDeletion(input: {
    userDocumentId: string;
    accountDocumentId: string;
    operationId: string;
  }): Promise<MusicLifecycleStatus> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await lockIdentity(client, input.userDocumentId, input.accountDocumentId);
      const identity = (await client.query<any>(`SELECT * FROM users WHERE strapi_user_document_id=$1 FOR UPDATE`, [input.userDocumentId])).rows[0];
      if (!identity) {
        const collision = await client.query("SELECT 1 FROM users WHERE strapi_account_document_id=$1", [input.accountDocumentId]);
        if (collision.rowCount) throw lifecycleConflict();
        const operations = (await client.query<any>(`SELECT * FROM music_identity_lifecycle_operations
          WHERE music_user_id IS NULL AND operation_kind='delete'
            AND (strapi_user_document_id=$1 OR strapi_account_document_id=$2)
          ORDER BY created_at DESC,operation_id DESC FOR UPDATE`, [input.userDocumentId,input.accountDocumentId])).rows;
        const operation = operations[0];
        if (!operation || operations.some((row) => row.strapi_user_document_id !== input.userDocumentId
            || row.strapi_account_document_id !== input.accountDocumentId)) throw lifecycleConflict();
        if (String(operation.error_code) === "NO_LOCAL:CANCELLED") {
          await client.query("COMMIT");
          return noLocalLifecycleStatus(operation);
        }
        if (String(operation.error_code) !== "NO_LOCAL:PREPARED") {
          throw new MusicIdentityError("LIFECYCLE_CANCEL_FORBIDDEN", 409, "Music deletion can no longer be cancelled.", "contact_support", false);
        }
        const cancelled = (await client.query<any>(`UPDATE music_identity_lifecycle_operations
          SET error_code='NO_LOCAL:CANCELLED' WHERE operation_id=$1 RETURNING *`, [operation.operation_id])).rows[0];
        await client.query("COMMIT");
        return noLocalLifecycleStatus(cancelled);
      }
      if (identity.strapi_account_document_id !== input.accountDocumentId) throw lifecycleConflict();
      if (identity.identity_status === "suspended" && identity.lifecycle_retention_stage === "identity-suspended") {
        const cancelled = (await client.query<any>(`SELECT operation_id,operation_kind,operation_phase,operation_state
          FROM music_identity_lifecycle_operations WHERE operation_id=$1 FOR UPDATE`, [identity.lifecycle_operation_id])).rows[0];
        if (cancelled?.operation_kind === "cancel_deletion" && cancelled.operation_phase === "prepared"
            && cancelled.operation_state === "completed") {
          await client.query("COMMIT");
          return { ...lifecycleStatusForRow(identity, cancelled), state: "cancelled", boundaryCrossed: false, retryable: false };
        }
      }
      const deletion = (await client.query<any>(`SELECT operation_id,operation_kind,operation_phase,operation_state FROM music_identity_lifecycle_operations
        WHERE operation_id=$1 AND operation_kind='delete' FOR UPDATE`, [identity.lifecycle_operation_id])).rows[0];
      if (identity.identity_status !== "pending_deletion" || deletion?.operation_phase !== "prepared"
          || deletion.operation_state !== "completed" || identity.lifecycle_retention_stage !== "deletion-prepared") {
        throw new MusicIdentityError("LIFECYCLE_CANCEL_FORBIDDEN", 409, "Music deletion can no longer be cancelled.", "contact_support", false);
      }
      await client.query(`INSERT INTO music_identity_lifecycle_operations(
        operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,operation_kind,requested_identity_status
      ) VALUES ($1,$2,$3,$4,'cancel_deletion','suspended')`, [
        input.operationId,input.userDocumentId,input.accountDocumentId,identity.id,
      ]);
      await client.query("UPDATE music_identity_lifecycle_operations SET operation_state='running',attempt_count=1 WHERE operation_id=$1", [input.operationId]);
      await client.query(`UPDATE music_identity_lifecycle_operations SET operation_state='completed',result_session_version=$2
        WHERE operation_id=$1`, [input.operationId,identity.session_version]);
      const updated = (await client.query<any>(`UPDATE users SET identity_status='suspended',lifecycle_operation_id=$2,
        lifecycle_state='completed',lifecycle_attempt_count=lifecycle_attempt_count+1,lifecycle_last_attempt_at=now(),
        lifecycle_error_code=NULL,lifecycle_retention_stage='identity-suspended',updated_at=now()
        WHERE id=$1 RETURNING *`, [identity.id,input.operationId])).rows[0];
      await client.query("UPDATE users SET lifecycle_state='cancelled' WHERE id=$1", [identity.id]);
      await advancePublicMusicSnapshotRevision(client, identity.id, "publication_changed");
      await client.query("COMMIT");
      return {
        ...lifecycleStatusForRow(updated, { operation_id: input.operationId, operation_phase: "prepared", operation_state: "completed" }),
        state: "cancelled",
        boundaryCrossed: false,
        retryable: false,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw normalizeLifecycleError(error);
    } finally {
      client.release();
    }
  }

  async claimDueDeletions(input: { batchSize: number; maxAttempts: number }): Promise<ClaimedLifecycleDeletion[]> {
    if (input.batchSize !== 1
        || !Number.isSafeInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 100) {
      throw new MusicIdentityError("REQUEST_INVALID", 400, "Music lifecycle worker input is invalid.", "none", false);
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`WITH exhausted AS (
        SELECT u.id,o.operation_id
        FROM users u JOIN music_identity_lifecycle_operations o ON o.operation_id=u.lifecycle_operation_id
        WHERE u.identity_status='pending_deletion' AND u.lifecycle_retention_stage='upstream-delete-attempted'
          AND u.lifecycle_state='running' AND o.operation_kind='delete'
          AND o.operation_phase='prepared' AND o.operation_state='completed'
          AND o.attempt_count >= $1 AND COALESCE(o.error_code,'') NOT LIKE 'MANUAL_REPAIR_REARMED:%'
          AND o.updated_at + interval '45 seconds' <= clock_timestamp()
        FOR UPDATE OF u,o SKIP LOCKED
      ), operation_failure AS (
        UPDATE music_identity_lifecycle_operations o SET error_code=CASE
          WHEN o.error_code LIKE 'MANUAL_REPAIR_CLAIMED:%'
            THEN 'DEAD_LETTER:WORKER_LEASE_EXPIRED|' || o.error_code
          ELSE 'DEAD_LETTER:WORKER_LEASE_EXPIRED' END
        FROM exhausted e WHERE o.operation_id=e.operation_id
      )
      UPDATE users u SET lifecycle_state='failed',lifecycle_error_code='DEAD_LETTER:WORKER_LEASE_EXPIRED'
      FROM exhausted e WHERE u.id=e.id`, [input.maxAttempts]);
      const due = await client.query<any>(`SELECT u.id,u.strapi_user_document_id,u.strapi_account_document_id,
        u.lifecycle_operation_id,o.attempt_count
        FROM users u JOIN music_identity_lifecycle_operations o ON o.operation_id=u.lifecycle_operation_id
        WHERE u.identity_status='pending_deletion' AND u.lifecycle_retention_stage='upstream-delete-attempted'
          AND u.lifecycle_state IN ('requested','failed','running') AND o.operation_kind='delete'
          AND o.operation_phase='prepared' AND o.operation_state='completed'
          AND COALESCE(u.lifecycle_error_code,'') NOT LIKE 'DEAD_LETTER:%'
          AND (o.attempt_count < $2 OR o.error_code LIKE 'MANUAL_REPAIR_REARMED:%')
          AND ((u.lifecycle_state='running' AND o.updated_at + interval '45 seconds' <= clock_timestamp())
            OR (u.lifecycle_state IN ('requested','failed')
              AND o.updated_at + make_interval(secs => LEAST(300,power(2,GREATEST(0,o.attempt_count-1)))::integer) <= clock_timestamp()))
        ORDER BY o.updated_at,o.operation_id FOR UPDATE OF u SKIP LOCKED LIMIT $1`, [input.batchSize,input.maxAttempts]);
      const claimed: ClaimedLifecycleDeletion[] = [];
      for (const row of due.rows) {
        const operation = (await client.query<any>(`UPDATE music_identity_lifecycle_operations
          SET attempt_count=attempt_count+1,
            error_code=CASE WHEN error_code LIKE 'MANUAL_REPAIR_REARMED:%'
              THEN replace(error_code,'MANUAL_REPAIR_REARMED:','MANUAL_REPAIR_CLAIMED:') ELSE NULL END
          WHERE operation_id=$1 RETURNING attempt_count,updated_at::text AS lease_updated_at`, [row.lifecycle_operation_id])).rows[0];
        const attempt = operation.attempt_count;
        await client.query(`UPDATE users SET lifecycle_state='running',lifecycle_attempt_count=$2,
          lifecycle_last_attempt_at=$3::timestamptz,lifecycle_error_code=NULL WHERE id=$1`, [row.id,attempt,operation.lease_updated_at]);
        claimed.push({
          operationId: row.lifecycle_operation_id,
          musicUserId: row.id,
          userDocumentId: row.strapi_user_document_id,
          accountDocumentId: row.strapi_account_document_id,
          attemptCount: attempt,
          leaseUpdatedAt: String(operation.lease_updated_at),
        });
      }
      if (claimed.length === 0) {
        await client.query(`UPDATE music_identity_lifecycle_operations SET error_code='DEAD_LETTER:NO_LOCAL:LEASE_EXPIRED'
          WHERE music_user_id IS NULL AND operation_kind='delete' AND operation_phase='prepared'
            AND operation_state='completed' AND error_code='NO_LOCAL:CLAIMED' AND attempt_count >= $1
            AND updated_at + interval '45 seconds' <= clock_timestamp()`, [input.maxAttempts]);
        const noLocal = (await client.query<any>(`SELECT * FROM music_identity_lifecycle_operations
          WHERE music_user_id IS NULL AND operation_kind='delete' AND operation_phase='prepared'
            AND operation_state='completed' AND COALESCE(error_code,'') NOT LIKE 'DEAD_LETTER:%'
            AND error_code NOT IN ('NO_LOCAL:PREPARED','NO_LOCAL:CANCELLED')
            AND (attempt_count < $1 OR error_code='NO_LOCAL:MANUAL_REPAIR_REARMED')
            AND ((error_code='NO_LOCAL:CLAIMED' AND updated_at + interval '45 seconds' <= clock_timestamp())
              OR (error_code<>'NO_LOCAL:CLAIMED'
                AND updated_at + make_interval(secs => LEAST(300,power(2,GREATEST(0,attempt_count-1)))::integer) <= clock_timestamp()))
          ORDER BY updated_at,operation_id FOR UPDATE SKIP LOCKED LIMIT 1`, [input.maxAttempts])).rows[0];
        if (noLocal) {
          const operation = (await client.query<any>(`UPDATE music_identity_lifecycle_operations
            SET attempt_count=attempt_count+1,error_code='NO_LOCAL:CLAIMED'
            WHERE operation_id=$1 RETURNING attempt_count,updated_at::text AS lease_updated_at`, [noLocal.operation_id])).rows[0];
          claimed.push({
            operationId: noLocal.operation_id,
            musicUserId: null,
            userDocumentId: noLocal.strapi_user_document_id,
            accountDocumentId: noLocal.strapi_account_document_id,
            attemptCount: operation.attempt_count,
            leaseUpdatedAt: String(operation.lease_updated_at),
          });
        }
      }
      await client.query("COMMIT");
      return claimed;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async recordDeletionObservation(
    operation: ClaimedLifecycleDeletion,
    observation: "present" | "unknown" | "outage",
    deadLetter: boolean,
  ): Promise<boolean> {
    const code = deadLetter ? `DEAD_LETTER:${observation.toUpperCase()}` : `UPSTREAM_${observation.toUpperCase()}`;
    const state = deadLetter ? "failed" : "requested";
    return this.recordDeletionOutcome(operation, state, code);
  }

  async recordDeletionFailure(
    operation: ClaimedLifecycleDeletion,
    stage: "observation" | "finalize",
    deadLetter: boolean,
  ): Promise<boolean> {
    const code = deadLetter ? `DEAD_LETTER:WORKER_${stage.toUpperCase()}` : `WORKER_${stage.toUpperCase()}_FAILED`;
    return this.recordDeletionOutcome(operation, deadLetter ? "failed" : "requested", code);
  }

  async rearmDeletion(operationId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const row = (await client.query<any>(`SELECT u.id,o.attempt_count
        FROM users u JOIN music_identity_lifecycle_operations o ON o.operation_id=u.lifecycle_operation_id
        WHERE o.operation_id=$1 AND u.identity_status='pending_deletion'
          AND u.lifecycle_state='failed' AND u.lifecycle_error_code LIKE 'DEAD_LETTER:%'
          AND o.operation_kind='delete' AND o.operation_phase='prepared' AND o.operation_state='completed'
        FOR UPDATE OF u,o`, [operationId])).rows[0];
      if (!row) {
        const noLocal = (await client.query<any>(`SELECT operation_id,attempt_count
          FROM music_identity_lifecycle_operations WHERE operation_id=$1 AND music_user_id IS NULL
            AND operation_kind='delete' AND operation_phase='prepared' AND operation_state='completed'
            AND error_code LIKE 'DEAD_LETTER:NO_LOCAL:%' FOR UPDATE`, [operationId])).rows[0];
        if (!noLocal) {
          await client.query("ROLLBACK");
          return false;
        }
        await client.query(`UPDATE music_identity_lifecycle_operations
          SET error_code='NO_LOCAL:MANUAL_REPAIR_REARMED' WHERE operation_id=$1`, [operationId]);
        await client.query("COMMIT");
        return true;
      }
      const audit = `MANUAL_REPAIR_REARMED:attempt=${row.attempt_count}`;
      await client.query("UPDATE music_identity_lifecycle_operations SET error_code=$2 WHERE operation_id=$1", [operationId,audit]);
      await client.query(`UPDATE users SET lifecycle_state='requested',lifecycle_error_code=$2,
        lifecycle_last_attempt_at=now() WHERE id=$1`, [row.id,audit]);
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw normalizeLifecycleError(error);
    } finally {
      client.release();
    }
  }

  async finalizeDeletion(operation: ClaimedLifecycleDeletion): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (operation.musicUserId === null) {
        await lockIdentity(client, operation.userDocumentId, operation.accountDocumentId);
        const current = await client.query<any>(`SELECT * FROM music_identity_lifecycle_operations
          WHERE operation_id=$1 AND music_user_id IS NULL AND strapi_user_document_id=$2
            AND strapi_account_document_id=$3 AND attempt_count=$4 AND updated_at=$5::timestamptz
            AND operation_kind='delete' AND operation_phase='prepared' AND operation_state='completed'
            AND error_code='NO_LOCAL:CLAIMED' FOR UPDATE`, [
          operation.operationId,operation.userDocumentId,operation.accountDocumentId,
          operation.attemptCount,operation.leaseUpdatedAt,
        ]);
        if (!current.rowCount) {
          const replay = await client.query(`SELECT 1 FROM music_identity_tombstones t
            JOIN music_identity_lifecycle_operations o ON o.operation_id=t.lifecycle_operation_id
            WHERE t.music_user_id IS NULL AND t.strapi_user_document_id=$1 AND t.strapi_account_document_id=$2
              AND t.lifecycle_operation_id=$3 AND o.operation_phase='finalized'`, [
            operation.userDocumentId,operation.accountDocumentId,operation.operationId,
          ]);
          await client.query(replay.rowCount ? "COMMIT" : "ROLLBACK");
          return false;
        }
        const collision = await client.query(`SELECT 1 FROM users
          WHERE strapi_user_document_id=$1 OR strapi_account_document_id=$2`, [operation.userDocumentId,operation.accountDocumentId]);
        if (collision.rowCount) throw lifecycleConflict();
        await client.query(`UPDATE music_identity_lifecycle_operations
          SET operation_phase='finalized',error_code='NO_LOCAL:FINALIZED' WHERE operation_id=$1`, [operation.operationId]);
        await client.query(`INSERT INTO music_identity_tombstones(
          strapi_user_document_id,strapi_account_document_id,music_user_id,reason,lifecycle_operation_id,retention_stage
        ) VALUES ($1,$2,NULL,'authoritative-absence',$3,'classified-v1')`, [
          operation.userDocumentId,operation.accountDocumentId,operation.operationId,
        ]);
        await client.query("COMMIT");
        return true;
      }
      const identity = (await client.query<any>(`SELECT u.id,u.lifecycle_operation_id,u.lifecycle_retention_stage
        FROM users u JOIN music_identity_lifecycle_operations o ON o.operation_id=u.lifecycle_operation_id
        WHERE u.id=$1 AND u.strapi_user_document_id=$2 AND u.strapi_account_document_id=$3
          AND u.identity_status='pending_deletion' AND u.lifecycle_state='running'
          AND u.lifecycle_retention_stage='upstream-delete-attempted'
          AND o.operation_id=$4 AND o.attempt_count=$5 AND o.updated_at=$6::timestamptz
          AND o.operation_kind='delete' AND o.operation_phase='prepared' AND o.operation_state='completed'
        FOR UPDATE OF u,o`, [
        operation.musicUserId,operation.userDocumentId,operation.accountDocumentId,operation.operationId,
        operation.attemptCount,operation.leaseUpdatedAt,
      ])).rows[0];
      if (!identity) {
        const replay = await client.query(`SELECT 1 FROM music_identity_tombstones t
          JOIN music_identity_lifecycle_operations o ON o.operation_id=t.lifecycle_operation_id
          WHERE t.music_user_id=$1 AND t.lifecycle_operation_id=$2 AND o.operation_phase='finalized'`, [operation.musicUserId,operation.operationId]);
        if (!replay.rowCount) {
          await client.query("ROLLBACK");
          return false;
        }
        await client.query("COMMIT");
        return false;
      }
      await client.query("UPDATE users SET lifecycle_retention_stage='cleanup-running',lifecycle_state='running' WHERE id=$1", [operation.musicUserId]);
      await this.hooks.beforeFinalize?.();
      await client.query(`DELETE FROM email_logs
        WHERE api_token_id IN (SELECT id FROM api_tokens WHERE user_id=$1)
          OR template_id IN (SELECT id FROM email_templates WHERE created_by=$1)`, [operation.musicUserId]);
      await client.query("DELETE FROM api_tokens WHERE user_id=$1", [operation.musicUserId]);
      await client.query("DELETE FROM email_templates WHERE created_by=$1", [operation.musicUserId]);
      await client.query("DELETE FROM page_contents WHERE created_by=$1", [operation.musicUserId]);
      await client.query("UPDATE page_contents SET updated_by=NULL WHERE updated_by=$1", [operation.musicUserId]);
      await client.query("UPDATE seo_settings SET updated_by=NULL WHERE updated_by=$1", [operation.musicUserId]);
      await client.query("UPDATE system_settings SET updated_by=NULL WHERE updated_by=$1", [operation.musicUserId]);
      await client.query("UPDATE youtube_api_usage SET user_id=NULL WHERE user_id=$1", [operation.musicUserId]);
      await client.query("DELETE FROM session WHERE sess->'passport'->>'user'=$1 OR sess->>'userId'=$1", [String(operation.musicUserId)]);
      await this.hooks.afterRetentionCleanup?.();
      await advancePublicMusicSnapshotRevision(client, operation.musicUserId, "publication_changed");
      const finalized = await client.query("SELECT finalize_music_identity_deletion($1::integer,$2::text,$3::text) AS finalized", [
        operation.musicUserId,operation.operationId,"authoritative-absence",
      ]);
      await client.query("UPDATE music_identity_tombstones SET retention_stage='classified-v1' WHERE lifecycle_operation_id=$1", [operation.operationId]);
      await client.query("COMMIT");
      return finalized.rows[0].finalized === true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw normalizeLifecycleError(error);
    } finally {
      client.release();
    }
  }

  private async recordDeletionOutcome(
    operation: ClaimedLifecycleDeletion,
    state: "requested" | "failed",
    code: string,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (operation.musicUserId === null) {
        const current = await client.query(`SELECT 1 FROM music_identity_lifecycle_operations
          WHERE operation_id=$1 AND music_user_id IS NULL AND strapi_user_document_id=$2
            AND strapi_account_document_id=$3 AND attempt_count=$4 AND updated_at=$5::timestamptz
            AND operation_kind='delete' AND operation_phase='prepared' AND operation_state='completed'
            AND error_code='NO_LOCAL:CLAIMED' FOR UPDATE`, [
          operation.operationId,operation.userDocumentId,operation.accountDocumentId,
          operation.attemptCount,operation.leaseUpdatedAt,
        ]);
        if (!current.rowCount) {
          await client.query("ROLLBACK");
          return false;
        }
        const noLocalCode = code.startsWith("DEAD_LETTER:") ? `DEAD_LETTER:NO_LOCAL:${code.slice("DEAD_LETTER:".length)}`
          : `NO_LOCAL:${code}`;
        await client.query("UPDATE music_identity_lifecycle_operations SET error_code=$2 WHERE operation_id=$1", [
          operation.operationId,noLocalCode,
        ]);
        await client.query("COMMIT");
        return true;
      }
      const current = await client.query(`SELECT 1
        FROM users u JOIN music_identity_lifecycle_operations o ON o.operation_id=u.lifecycle_operation_id
        WHERE u.id=$1 AND u.strapi_user_document_id=$2 AND u.strapi_account_document_id=$3
          AND u.identity_status='pending_deletion' AND u.lifecycle_state='running'
          AND o.operation_id=$4 AND o.attempt_count=$5 AND o.updated_at=$6::timestamptz
          AND o.operation_kind='delete' AND o.operation_phase='prepared' AND o.operation_state='completed'
        FOR UPDATE OF u,o`, [
        operation.musicUserId,operation.userDocumentId,operation.accountDocumentId,operation.operationId,
        operation.attemptCount,operation.leaseUpdatedAt,
      ]);
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return false;
      }
      await client.query("UPDATE users SET lifecycle_state=$2,lifecycle_error_code=$3 WHERE id=$1", [operation.musicUserId,state,code]);
      await client.query("UPDATE music_identity_lifecycle_operations SET error_code=$2 WHERE operation_id=$1", [operation.operationId,code]);
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw normalizeLifecycleError(error);
    } finally {
      client.release();
    }
  }
}

async function lifecycleStatusForLockedIdentity(client: Pick<PoolClient, "query">, identity: any): Promise<MusicLifecycleStatus> {
  const operation = (await client.query<any>(`SELECT operation_id,operation_kind,operation_phase,operation_state
    FROM music_identity_lifecycle_operations WHERE operation_id=$1 FOR UPDATE`, [identity.lifecycle_operation_id])).rows[0];
  if (!operation || operation.operation_kind !== "delete" || operation.operation_phase !== "prepared"
      || operation.operation_state !== "completed") throw lifecycleConflict();
  return lifecycleStatusForRow(identity, operation);
}

function lifecycleStatusForRow(identity: any, operation: any): MusicLifecycleStatus {
  const deadLetter = typeof identity.lifecycle_error_code === "string" && identity.lifecycle_error_code.startsWith("DEAD_LETTER:");
  const boundaryCrossed = identity.lifecycle_retention_stage !== "deletion-prepared";
  return {
    operationId: operation.operation_id,
    musicUserId: identity.id,
    identityStatus: identity.identity_status,
    phase: operation.operation_phase,
    state: deadLetter ? "failed" : identity.lifecycle_state,
    boundaryCrossed,
    retryable: boundaryCrossed && !deadLetter && identity.identity_status === "pending_deletion",
    deadLetter,
  };
}

function noLocalLifecycleStatus(operation: any): MusicLifecycleStatus {
  const code = String(operation.error_code ?? "");
  const finalized = operation.operation_phase === "finalized";
  const cancelled = code.startsWith("NO_LOCAL:CANCELLED");
  const deadLetter = code.startsWith("DEAD_LETTER:");
  const boundaryCrossed = finalized || (!cancelled && !code.startsWith("NO_LOCAL:PREPARED"));
  const state: MusicLifecycleStatus["state"] = finalized ? "completed"
    : cancelled ? "cancelled"
      : deadLetter ? "failed"
        : code.startsWith("NO_LOCAL:CLAIMED") ? "running"
          : boundaryCrossed ? "requested" : "completed";
  return {
    operationId: operation.operation_id,
    musicUserId: null,
    identityStatus: finalized ? "tombstoned" : cancelled ? "not_present" : "pending_deletion",
    phase: finalized ? "finalized" : "prepared",
    state,
    boundaryCrossed,
    retryable: boundaryCrossed && !finalized && !deadLetter,
    deadLetter,
  };
}

function lifecycleConflict(): MusicIdentityError {
  return new MusicIdentityError("IDENTITY_CONFLICT", 409, "The Music lifecycle state conflicts.", "contact_support", false, undefined, "lifecycle");
}

function normalizeLifecycleError(error: unknown): unknown {
  if (error instanceof MusicIdentityError) return error;
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  if (["23505", "23514", "P0001"].includes(code)) return lifecycleConflict();
  return error;
}
