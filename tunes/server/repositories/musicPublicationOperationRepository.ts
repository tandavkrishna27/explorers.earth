import type { Pool, PoolClient } from "pg";
import { advancePublicMusicSnapshotRevision } from "./publicMusicRevision";
import {
  MUSIC_PUBLICATION_IDEMPOTENCY_FUTURE_SKEW_MS,
  MUSIC_PUBLICATION_IDEMPOTENCY_RETENTION_MS,
  parseMusicPublicationIdempotencyKey,
} from "../../shared/musicPublicationContract";
import { createGuestCapability, hashGuestCapability } from "../policies/musicSurfacePolicy";
import {
  MUSIC_PUBLICATION_RESPONSE_VERSION,
  MusicPublicationResponseCipher,
  hashPublicationIdempotencyKey,
  publicationRequestFingerprint,
  type MusicPublicationCommandResponse,
  type MusicPublicationMode,
} from "../services/musicPublicationResponseCrypto";

type QueryPool = Pick<Pool, "query" | "connect">;
const PUBLICATION_LOCK = 0x4d50;
export const PUBLICATION_ACTIVE_OPERATION_QUOTA = 100;
export const PUBLICATION_GLOBAL_ACTIVE_OPERATION_QUOTA = 10_000;
const PUBLICATION_GLOBAL_LOCK = 0x4d5047;

export type MusicPublicationCommandResult =
  | { status: "completed"; replayed: boolean; response: MusicPublicationCommandResponse }
  | { status: "rate_limited"; retryAfterSeconds: number }
  | { status: "conflict" | "expired" | "invalid" | "not_found" };

export interface MusicPublicationOperationDependencies {
  createCapability?: () => string;
  afterWrite?: (phase: "publication" | "operation") => void | Promise<void>;
}

interface StoredPublicationOperation {
  request_fingerprint: string;
  request_mode: MusicPublicationMode;
  operation_state: "completed" | "replay_expired";
  expires_at: Date;
  response_expired: boolean;
  response_key_id: string | null;
  response_nonce: Buffer | null;
  response_ciphertext: Buffer | null;
  response_tag: Buffer | null;
}

export class MusicPublicationOperationRepository {
  private readonly createCapability: () => string;

  constructor(
    private readonly pool: QueryPool,
    private readonly cipher: MusicPublicationResponseCipher,
    private readonly dependencies: MusicPublicationOperationDependencies = {},
  ) {
    this.createCapability = dependencies.createCapability ?? createGuestCapability;
  }

  async execute(
    musicUserId: number,
    idempotencyKey: string,
    mode: MusicPublicationMode,
  ): Promise<MusicPublicationCommandResult> {
    const issuedAtMs = parseMusicPublicationIdempotencyKey(idempotencyKey);
    if (issuedAtMs === undefined) return { status: "invalid" };
    const idempotencyKeyHash = hashPublicationIdempotencyKey(idempotencyKey);
    const requestFingerprint = publicationRequestFingerprint(mode);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [PUBLICATION_GLOBAL_LOCK]);
      await client.query("SELECT pg_advisory_xact_lock($1,$2)", [PUBLICATION_LOCK, musicUserId]);
      const idempotencyAuthorityTime = (await client.query<{ idempotency_authority_time: string }>(
        "SELECT clock_timestamp()::text AS idempotency_authority_time",
      )).rows[0]?.idempotency_authority_time;
      const authorityNowMs = typeof idempotencyAuthorityTime === "string"
        ? Date.parse(idempotencyAuthorityTime)
        : Number.NaN;
      if (!Number.isFinite(authorityNowMs)) {
        throw new Error("Publication idempotency clock authority is unavailable.");
      }
      const prior = (await client.query<StoredPublicationOperation>(
        `SELECT request_fingerprint,request_mode,operation_state,expires_at,
                expires_at<=clock_timestamp() AS response_expired,
                response_key_id,response_nonce,response_ciphertext,response_tag
           FROM music_publication_operations
          WHERE music_user_id=$1 AND idempotency_key_hash=$2
          FOR UPDATE`,
        [musicUserId, idempotencyKeyHash],
      )).rows[0];
      if (prior) {
        if (prior.request_fingerprint !== requestFingerprint || prior.request_mode !== mode) {
          await client.query("COMMIT");
          return { status: "conflict" };
        }
        if (prior.operation_state === "replay_expired" || prior.response_expired) {
          if (prior.operation_state === "completed") {
            await client.query(
              `UPDATE music_publication_operations
                  SET operation_state='replay_expired',updated_at=clock_timestamp(),shredded_at=clock_timestamp(),
                      response_key_id=NULL,response_nonce=NULL,response_ciphertext=NULL,response_tag=NULL
                WHERE music_user_id=$1 AND idempotency_key_hash=$2 AND operation_state='completed'`,
              [musicUserId, idempotencyKeyHash],
            );
          }
          await client.query("COMMIT");
          return { status: "expired" };
        }
        if (!prior.response_key_id || !prior.response_nonce || !prior.response_ciphertext || !prior.response_tag) {
          throw new Error("Publication response authority is incomplete.");
        }
        const response = this.cipher.decrypt({ musicUserId, idempotencyKeyHash, requestFingerprint }, {
          responseKeyId: prior.response_key_id,
          responseNonce: prior.response_nonce,
          responseCiphertext: prior.response_ciphertext,
          responseTag: prior.response_tag,
        });
        await client.query("COMMIT");
        return { status: "completed", replayed: true, response };
      }

      const archived = (await client.query<Pick<StoredPublicationOperation, "request_fingerprint" | "request_mode">>(
        `SELECT request_fingerprint,request_mode
           FROM music_lookup_publication_operation_archive($1,$2)`,
        [musicUserId, idempotencyKeyHash],
      )).rows[0];
      if (archived) {
        await client.query("COMMIT");
        return archived.request_fingerprint === requestFingerprint && archived.request_mode === mode
          ? { status: "expired" }
          : { status: "conflict" };
      }

      if (issuedAtMs > authorityNowMs + MUSIC_PUBLICATION_IDEMPOTENCY_FUTURE_SKEW_MS) {
        await client.query("COMMIT");
        return { status: "invalid" };
      }
      if (issuedAtMs <= authorityNowMs - MUSIC_PUBLICATION_IDEMPOTENCY_RETENTION_MS) {
        await client.query("COMMIT");
        return { status: "expired" };
      }

      const globalQuota = (await client.query<{ global_active_count: number; retry_after_seconds: number }>(
        `SELECT count(*)::integer AS global_active_count,
                COALESCE(GREATEST(1,LEAST(86400,
                  ceil(extract(epoch FROM (min(expires_at)-clock_timestamp())))::integer)),1)::integer
                  AS retry_after_seconds
           FROM music_publication_operations
          WHERE operation_state='completed'
            AND expires_at>clock_timestamp()`,
      )).rows[0];
      if (!globalQuota || !Number.isSafeInteger(globalQuota.global_active_count)
          || globalQuota.global_active_count < 0) {
        throw new Error("Publication global operation quota authority is unavailable.");
      }
      if (globalQuota.global_active_count >= PUBLICATION_GLOBAL_ACTIVE_OPERATION_QUOTA) {
        if (!Number.isSafeInteger(globalQuota.retry_after_seconds)
            || globalQuota.retry_after_seconds < 1 || globalQuota.retry_after_seconds > 86_400) {
          throw new Error("Publication global operation quota authority is unavailable.");
        }
        await client.query("COMMIT");
        return { status: "rate_limited", retryAfterSeconds: globalQuota.retry_after_seconds };
      }

      const quota = (await client.query<{ active_count: number; retry_after_seconds: number }>(
        `SELECT count(*)::integer AS active_count,
                COALESCE(GREATEST(1,LEAST(86400,
                  ceil(extract(epoch FROM (min(expires_at)-clock_timestamp())))::integer)),1)::integer
                  AS retry_after_seconds
           FROM music_publication_operations
          WHERE music_user_id=$1
            AND operation_state='completed'
            AND expires_at>clock_timestamp()`,
        [musicUserId],
      )).rows[0];
      if (!quota || !Number.isSafeInteger(quota.active_count) || quota.active_count < 0) {
        throw new Error("Publication operation quota authority is unavailable.");
      }
      if (quota.active_count >= PUBLICATION_ACTIVE_OPERATION_QUOTA) {
        if (!Number.isSafeInteger(quota.retry_after_seconds)
            || quota.retry_after_seconds < 1 || quota.retry_after_seconds > 86_400) {
          throw new Error("Publication operation quota authority is unavailable.");
        }
        await client.query("COMMIT");
        return { status: "rate_limited", retryAfterSeconds: quota.retry_after_seconds };
      }

      const operationTime = (await client.query<{ operation_time: string }>(
        "SELECT transaction_timestamp()::text AS operation_time",
      )).rows[0]?.operation_time;
      if (typeof operationTime !== "string"
        || operationTime.length < 1
        || operationTime.length > 128
        || operationTime.includes("\0")
        || operationTime.trim() !== operationTime) {
        throw new Error("Publication database clock authority is unavailable.");
      }

      const capability = mode === "unlisted" ? this.createCapability() : undefined;
      if (capability && !/^[A-Za-z0-9_-]{43}$/.test(capability)) {
        throw new Error("Publication capability generation failed.");
      }
      const changedPublication = (await client.query<{ guest_url: string }>(
        `UPDATE users
            SET guest_discoverable=($2='public'),
                guest_capability_hash=CASE WHEN $2='unlisted' THEN $3 ELSE guest_capability_hash END,
                guest_capability_rotated_at=CASE WHEN $2='unlisted' THEN transaction_timestamp() ELSE guest_capability_rotated_at END,
                guest_capability_revoked_at=CASE WHEN $2='unlisted' THEN NULL ELSE transaction_timestamp() END
          WHERE id=$1 AND identity_status='active' AND (
            ($2='unlisted' AND (guest_discoverable IS NOT FALSE
              OR guest_capability_hash IS DISTINCT FROM $3 OR guest_capability_revoked_at IS NOT NULL))
            OR ($2='public' AND guest_discoverable IS NOT TRUE)
            OR ($2='private' AND (guest_discoverable IS NOT FALSE
              OR (guest_capability_hash IS NOT NULL AND guest_capability_revoked_at IS NULL)))
          )
          RETURNING guest_url`,
        [musicUserId, mode, capability ? hashGuestCapability(capability) : null],
      )).rows[0];
      if (changedPublication) {
        await advancePublicMusicSnapshotRevision(client, musicUserId, "publication_changed");
        await this.dependencies.afterWrite?.("publication");
      }
      const publication = changedPublication ?? (await client.query<{ guest_url: string }>(
        "SELECT guest_url FROM users WHERE id=$1 AND identity_status='active' FOR UPDATE",
        [musicUserId],
      )).rows[0];
      if (!publication) {
        await client.query("COMMIT");
        return { status: "not_found" };
      }

      const response: MusicPublicationCommandResponse = {
        version: MUSIC_PUBLICATION_RESPONSE_VERSION,
        publication: { mode, publicSlug: String(publication.guest_url) },
        ...(capability ? { capability } : {}),
      };
      const encrypted = this.cipher.encrypt({ musicUserId, idempotencyKeyHash, requestFingerprint }, response);
      await client.query(
        `INSERT INTO music_publication_operations(
           music_user_id,idempotency_key_hash,request_fingerprint,request_mode,operation_state,
           created_at,completed_at,expires_at,updated_at,
           response_key_id,response_nonce,response_ciphertext,response_tag
         ) VALUES ($1,$2,$3,$4,'completed',$5::timestamptz,$5::timestamptz,
                   $5::timestamptz+interval '24 hours',$5::timestamptz,$6,$7,$8,$9)`,
        [
          musicUserId, idempotencyKeyHash, requestFingerprint, mode, operationTime,
          encrypted.responseKeyId, encrypted.responseNonce, encrypted.responseCiphertext, encrypted.responseTag,
        ],
      );
      await this.dependencies.afterWrite?.("operation");
      await client.query("COMMIT");
      return { status: "completed", replayed: false, response };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async verifyReplayReadiness(): Promise<void> {
    const previous = this.cipher.keyring.previous;
    const rows = (await this.pool.query<{
      music_user_id: number;
      idempotency_key_hash: string;
      request_fingerprint: string;
      response_key_id: string;
      response_nonce: Buffer;
      response_ciphertext: Buffer;
      response_tag: Buffer;
      replay_deadline_covered: boolean;
    }>(
      `SELECT DISTINCT ON (response_key_id)
              music_user_id,idempotency_key_hash,request_fingerprint,response_key_id,
              response_nonce,response_ciphertext,response_tag,
              CASE
                WHEN response_key_id=$1 THEN TRUE
                WHEN response_key_id=$2
                  AND (extract(epoch FROM expires_at)*1000000)::numeric<=$3::bigint*1000 THEN TRUE
                ELSE FALSE
              END AS replay_deadline_covered
         FROM music_publication_operations
        WHERE operation_state='completed' AND expires_at>clock_timestamp()
        ORDER BY response_key_id,expires_at DESC
        LIMIT 3`,
      [
        this.cipher.keyring.current.kid,
        previous?.kid ?? null,
        previous?.acceptUntil ?? null,
      ],
    )).rows;
    try {
      if (rows.length > 2) throw new Error("too many active response keys");
      for (const row of rows) {
        if (row.replay_deadline_covered !== true || !this.cipher.acceptsReplayKey(row.response_key_id)) {
          throw new Error("response key is unavailable");
        }
        this.cipher.decrypt({
          musicUserId: row.music_user_id,
          idempotencyKeyHash: row.idempotency_key_hash,
          requestFingerprint: row.request_fingerprint,
        }, {
          responseKeyId: row.response_key_id,
          responseNonce: row.response_nonce,
          responseCiphertext: row.response_ciphertext,
          responseTag: row.response_tag,
        });
      }
    } catch {
      throw new Error("Music publication replay key readiness failed.");
    }
  }

  async shredExpiredResponses(limit = 100): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw new Error("Publication response shred limit is invalid.");
    }
    const result = await this.pool.query(
      `WITH expired AS (
         SELECT music_user_id,idempotency_key_hash
           FROM music_publication_operations
          WHERE operation_state='completed' AND expires_at<=clock_timestamp()
          ORDER BY expires_at,music_user_id,idempotency_key_hash
          LIMIT $1
          FOR UPDATE SKIP LOCKED
       )
       UPDATE music_publication_operations operation
          SET operation_state='replay_expired',updated_at=clock_timestamp(),shredded_at=clock_timestamp(),
              response_key_id=NULL,response_nonce=NULL,response_ciphertext=NULL,response_tag=NULL
         FROM expired
        WHERE operation.music_user_id=expired.music_user_id
          AND operation.idempotency_key_hash=expired.idempotency_key_hash`,
      [limit],
    );
    return result.rowCount ?? 0;
  }

  async compactExpiredOperations(limit = 100): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw new Error("Publication operation compaction limit is invalid.");
    }
    const row = (await this.pool.query<{ compacted_count: number }>(
      "SELECT music_compact_publication_operations($1)::integer AS compacted_count",
      [limit],
    )).rows[0];
    if (!row || !Number.isSafeInteger(row.compacted_count) || row.compacted_count < 0 || row.compacted_count > limit) {
      throw new Error("Publication operation compaction authority is unavailable.");
    }
    return row.compacted_count;
  }
}
