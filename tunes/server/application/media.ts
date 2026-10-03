import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Actor } from "./actor";
import { authorizeOperation, AuthorizationError } from "./authorization";
import type { MediaDto, RequestContext } from "../../shared/explorersContract";
import { MediaAccountInactive, MediaRepository } from "../repositories/mediaRepository";
import { resolveObjectStorage, type ObjectStorage } from "../services/objectStorage";

export type MediaUploadInput = { purpose: "profile" | "background" | "feed" | "recommendation"; filename: string;
  mimeType: string; length: number; bytes: Buffer; alternativeText?: string | null; caption?: string | null };
export type AuthorizedMediaObject = { key: string; mimeType: string; length: number; bytes: Buffer;
  sha256: string };
export class MediaInputError extends Error {}
export class MediaUnavailable extends Error {}

const limits: Record<MediaUploadInput["purpose"], number> = { profile: 5 * 1024 * 1024,
  background: 5 * 1024 * 1024, feed: 10 * 1024 * 1024,recommendation:5*1024*1024 };

function sniff(bytes: Buffer): string | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii",0,4)==="RIFF" && bytes.toString("ascii",8,12)==="WEBP") return "image/webp";
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.toString("ascii",0,6))) return "image/gif";
  if (bytes.length >= 12 && bytes.toString("ascii",4,8)==="ftyp") return "video/mp4";
  return undefined;
}

export class MediaService {
  private readonly repo: MediaRepository;
  constructor(private readonly db: Pool, private readonly storage: ObjectStorage = resolveObjectStorage()) {
    this.repo = new MediaRepository(db);
  }

  /** Borrow an already reserved session between transactions. Upload reservation,
   * cleanup and ready transitions still use their normal short transactions; the
   * caller retains responsibility for releasing its connection. */
  usingConnection(connection: PoolClient): MediaService {
    const query=connection.query.bind(connection);
    const borrowed={query,release:()=>undefined} as unknown as PoolClient;
    return new MediaService({query,connect:async()=>borrowed} as unknown as Pool,this.storage);
  }

  /** Bounded retry for metadata retained after a failed object deletion. */
  async retryPendingDeletes(accountId: string): Promise<void> {
    for (const candidate of await this.repo.abandoned(accountId, this.storage.environment)) {
      if (candidate.status === "ready") await this.repo.markDelete(candidate.id, accountId);
      else await this.repo.markUploadForCleanup(candidate.id);
    }
    for (const item of await this.repo.pendingDeletes(accountId, this.storage.environment)) {
      try { await this.storage.delete(item.object_key, item.storage_version_id); await this.repo.finalizeDelete(item.id); }
      catch { /* keep the pending row for the next local cleanup pass */ }
    }
  }

  /** readyWrite performs database-only receipt work in the ready transaction;
   * remote storage has already completed before that transaction begins. */
  async createMedia(actor: Actor, input: MediaUploadInput, _context: RequestContext, readyWrite?: (db: PoolClient, media: MediaDto) => Promise<void>): Promise<MediaDto> {
    await authorizeOperation(this.db, actor, "media:create", actor.accountId);
    await this.retryPendingDeletes(actor.accountId);
    const limit = limits[input.purpose];
    if (!limit || !Buffer.isBuffer(input.bytes) || input.length !== input.bytes.length || input.length < 1 || input.length > limit
      || !/^[\w. -]{1,255}$/.test(input.filename) || sniff(input.bytes) !== input.mimeType
      || (input.purpose !== "feed" && !input.mimeType.startsWith("image/"))) throw new MediaInputError("Invalid media upload");
    const id = randomUUID();
    const key = `${this.storage.environment}/${actor.accountId}/${id}`;
    const dto: MediaDto = { id, url: `/api/explorers/v1/media/${id}/content`, mimeType: input.mimeType,
      size: input.bytes.length, alternativeText: input.alternativeText ?? null, caption: input.caption ?? null };
    const hash = createHash("sha256").update(input.bytes).digest();
    // Keep a session advisory lock until the put and its metadata/compensation
    // settle. A terminal worker never sweeps a live writer's reservation.
    const gate = await this.db.connect();
    let uploadLocked = false;
    try {
    await gate.query("SELECT pg_advisory_lock(44024,hashtext($1))", [actor.accountId]);
    uploadLocked = true;
    try {
      await this.repo.reserve({ id, accountId: actor.accountId, purpose: input.purpose, mimeType: input.mimeType,
        filename: input.filename, bytes: input.bytes, hash, key, environment: this.storage.environment }, gate);
    } catch (error) {
      if (error instanceof MediaAccountInactive) throw new AuthorizationError(403, "FORBIDDEN", "Account access is unavailable");
      throw error;
    }
    let versionId: string | undefined;
    try {
      versionId = (await this.storage.put(key, input.bytes)) || undefined;
      await this.repo.markReady(id, versionId, gate, readyWrite ? db => readyWrite(db, dto) : undefined);
    } catch (error) {
      // A lost COMMIT acknowledgement may already have persisted ready metadata
      // and the caller's receipt. Never compensate committed or uncertain work.
      let existing;
      try { existing = await this.repo.find(id); } catch { throw new MediaUnavailable("Storage completion uncertain"); }
      if (existing?.status === "ready") return dto;
      // The reservation survives even if both cleanup and metadata finalization fail.
      await this.repo.markUploadForCleanup(id, versionId, gate).catch(() => undefined);
      try { await this.storage.delete(key, versionId); await this.repo.finalizeDelete(id, gate); }
      catch { /* durable reservation is retried by the cleanup pass */ }
      throw new MediaUnavailable("Storage unavailable");
    }
    return dto;
    } finally {
      if (uploadLocked) await gate.query("SELECT pg_advisory_unlock(44024,hashtext($1))", [actor.accountId])
        .catch(() => undefined);
      gate.release();
    }
  }

  async resolveMediaContent(actor: Actor | null, id: string): Promise<AuthorizedMediaObject> {
    const record = await this.repo.find(id);
    if (!record || record.status !== "ready" || record.storage_environment !== this.storage.environment) throw new MediaUnavailable("Media unavailable");
    const publicAttachment = record.purpose !== "claim-evidence" && await this.repo.isPublicAttachment(id);
    if (!publicAttachment) {
      if (!actor || actor.accountId !== record.account_id) throw new MediaUnavailable("Media unavailable");
      try { await authorizeOperation(this.db, actor, "media:read", record.account_id); }
      catch { throw new MediaUnavailable("Media unavailable"); }
    }
    const bytes = await this.storage.get(record.object_key);
    return { key: record.object_key, mimeType: record.mime_type, length: bytes.length, bytes,
      sha256: record.content_sha256.toString("hex") };
  }

  async deleteMedia(actor: Actor, id: string, _context: RequestContext): Promise<void> {
    await authorizeOperation(this.db, actor, "media:delete", actor.accountId);
    await this.retryPendingDeletes(actor.accountId);
    const located = await this.repo.find(id);
    if (!located || located.storage_environment !== this.storage.environment) throw new MediaUnavailable("Media unavailable");
    const record = await this.repo.markDelete(id, actor.accountId);
    if (!record || record.storage_environment !== this.storage.environment) throw new MediaUnavailable("Media unavailable");
    try { await this.storage.delete(record.object_key, record.storage_version_id); await this.repo.finalizeDelete(id); }
    catch { /* pending_delete is retained for the bounded cleanup worker */ }
  }
}

export async function createMedia(db: Pool, actor: Actor, input: MediaUploadInput, context: RequestContext): Promise<MediaDto> {
  return new MediaService(db).createMedia(actor, input, context);
}
export async function deleteMedia(db: Pool, actor: Actor, id: string, context: RequestContext): Promise<void> {
  return new MediaService(db).deleteMedia(actor, id, context);
}
export async function resolveMediaContent(db: Pool, actor: Actor | null, id: string): Promise<AuthorizedMediaObject> {
  return new MediaService(db).resolveMediaContent(actor, id);
}
