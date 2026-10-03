import type { Pool, PoolClient } from "pg";
import type { StorageEnvironment } from "../services/objectStorage";

export type MediaRecord = { id: string; account_id: string; purpose: string; status: string; mime_type: string;
  byte_size: string; alternative_text: string | null; caption: string | null; object_key: string;
  storage_environment: string; storage_version_id: string | null; content_sha256: Buffer };
export class MediaAccountInactive extends Error {}

export class MediaRepository {
  constructor(private readonly db: Pool) {}

  async reserve(input: { id: string; accountId: string; purpose: string; mimeType: string; filename: string;
    bytes: Buffer; hash: Buffer; key: string; environment: StorageEnvironment }, connection?: PoolClient): Promise<void> {
    const client = connection ?? await this.db.connect();
    try {
      await client.query("BEGIN");
      const account = await client.query(`SELECT id FROM creator_accounts WHERE id=$1 AND status='active' FOR UPDATE`,
        [input.accountId]);
      if (!account.rowCount) throw new MediaAccountInactive("Media account is no longer active");
      await client.query(`INSERT INTO media_assets(id,account_id,purpose,status,mime_type,byte_size,content_sha256,original_filename)
        VALUES ($1,$2,$3,'uploading',$4,$5,$6,$7)`, [input.id, input.accountId, input.purpose,
        input.mimeType, input.bytes.length, input.hash, input.filename]);
      await client.query(`INSERT INTO media_objects(media_id,variant,storage_environment,object_key,mime_type,byte_size,content_sha256)
        VALUES ($1,'original',$2,$3,$4,$5,$6)`, [input.id, input.environment, input.key,
          input.mimeType, input.bytes.length, input.hash]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { if (!connection) client.release(); }
  }

  async markReady(id: string, versionId?: string, connection?: PoolClient, readyWrite?: (db: PoolClient) => Promise<void>): Promise<void> {
    const client = connection ?? await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE media_objects SET storage_version_id=$2 WHERE media_id=$1", [id, versionId ?? null]);
      const result = await client.query(`UPDATE media_assets SET status='ready',ready_at=now(),updated_at=now()
        WHERE id=$1 AND status='uploading' RETURNING id`, [id]);
      if (!result.rows[0]) throw new Error("Upload reservation disappeared");
      if (readyWrite) await readyWrite(client);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { if (!connection) client.release(); }
  }

  async markUploadForCleanup(id: string, versionId?: string, connection?: PoolClient): Promise<void> {
    const db = connection ?? this.db;
    await db.query(`UPDATE media_assets SET status='pending_delete',delete_requested_at=now(),updated_at=now()
      WHERE id=$1 AND status IN ('uploading','failed')`, [id]);
    if (versionId) await db.query("UPDATE media_objects SET storage_version_id=$2 WHERE media_id=$1", [id, versionId]);
  }

  async find(id: string): Promise<MediaRecord | undefined> {
    const result = await this.db.query<MediaRecord>(`SELECT m.id,m.account_id,m.purpose,m.status,m.mime_type,m.byte_size,
      m.alternative_text,m.caption,o.object_key,o.storage_environment,o.storage_version_id,o.content_sha256
      FROM media_assets m JOIN media_objects o ON o.media_id=m.id AND o.variant='original' WHERE m.id=$1`, [id]);
    return result.rows[0];
  }

  async isPublicAttachment(id: string): Promise<boolean> {
    const result = await this.db.query<{ visible: boolean }>(`SELECT EXISTS (
      SELECT 1 FROM profile_media pm JOIN creator_accounts a ON a.id=pm.account_id
      WHERE pm.media_id=$1 AND pm.slot IN ('profile','background','wallpaper')
        AND a.status='active' AND a.onboarding_status='complete' AND a.public_profile=true
      UNION ALL
      SELECT 1 FROM profile_feed_items pf JOIN creator_accounts a ON a.id=pf.account_id
      WHERE pf.media_id=$1 AND a.status='active' AND a.onboarding_status='complete' AND a.public_profile=true
      UNION ALL
      SELECT 1 FROM (SELECT recommendation_id,account_id,media_id FROM recommendation_media UNION ALL SELECT recommendation_id,account_id,media_id FROM recommendation_book_covers) rm
      JOIN recommendations r ON r.id=rm.recommendation_id AND r.account_id=rm.account_id
      JOIN collection_items ci ON ci.recommendation_id=r.id AND ci.account_id=r.account_id AND ci.category=r.category
      JOIN collections c ON c.id=ci.collection_id AND c.account_id=ci.account_id AND c.category=ci.category
      JOIN creator_accounts a ON a.id=r.account_id
      JOIN account_category_settings s ON s.account_id=r.account_id AND s.category=r.category
      WHERE rm.media_id=$1 AND r.category='books' AND a.status='active' AND a.onboarding_status='complete' AND a.public_profile
        AND s.is_public AND c.archived_at IS NULL AND c.visibility='public' AND c.publication_state='published'
        AND r.archived_at IS NULL AND r.publication_state='published'
    ) AS visible`, [id]);
    return result.rows[0]?.visible === true;
  }

  async markDelete(id: string, accountId: string): Promise<MediaRecord | undefined> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query("SELECT id FROM media_assets WHERE id=$1 AND account_id=$2 AND status='ready' FOR UPDATE", [id, accountId]);
      if (!locked.rows[0]) { await client.query("ROLLBACK"); return undefined; }
      const refs = await client.query<{ count: string }>(`SELECT ((SELECT count(*) FROM profile_media WHERE media_id=$1 AND account_id=$2)
        + (SELECT count(*) FROM profile_feed_items WHERE media_id=$1 AND account_id=$2)
        + (SELECT count(*) FROM collection_media WHERE media_id=$1 AND account_id=$2)
        + (SELECT count(*) FROM recommendation_media WHERE media_id=$1 AND account_id=$2) + (SELECT count(*) FROM recommendation_book_covers WHERE media_id=$1 AND account_id=$2))::text AS count`, [id, accountId]);
      if (Number(refs.rows[0]?.count) > 0) { await client.query("ROLLBACK"); return undefined; }
      const changed = await client.query("UPDATE media_assets SET status='pending_delete',delete_requested_at=now(),updated_at=now() WHERE id=$1 AND account_id=$2 AND status='ready' RETURNING id", [id, accountId]);
      if (!changed.rows[0]) { await client.query("ROLLBACK"); return undefined; }
      const object = await client.query<MediaRecord>(`SELECT m.id,m.account_id,m.purpose,m.status,m.mime_type,m.byte_size,
        m.alternative_text,m.caption,o.object_key,o.storage_environment,o.storage_version_id,o.content_sha256 FROM media_assets m
        JOIN media_objects o ON o.media_id=m.id AND o.variant='original' WHERE m.id=$1`, [id]);
      await client.query("COMMIT");
      return object.rows[0];
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async finalizeDelete(id: string, connection?: PoolClient): Promise<void> {
    const db = connection ?? this.db;
    await db.query(`UPDATE media_assets SET status='deleted',deleted_at=now(),updated_at=now() WHERE id=$1 AND status='pending_delete'`, [id]);
    await db.query("UPDATE media_objects SET deleted_at=now() WHERE media_id=$1", [id]);
  }

  async pendingDeletes(accountId: string, environment: StorageEnvironment, limit = 20): Promise<Array<{ id: string; object_key: string; storage_version_id: string | null }>> {
    const result = await this.db.query<{ id: string; object_key: string; storage_version_id: string | null }>(`SELECT m.id,o.object_key,o.storage_version_id
      FROM media_assets m JOIN media_objects o ON o.media_id=m.id AND o.variant='original'
      WHERE m.account_id=$1 AND m.status='pending_delete' AND o.storage_environment=$2
      ORDER BY m.delete_requested_at,m.id LIMIT $3`, [accountId, environment, limit]);
    return result.rows;
  }

  async abandoned(accountId: string, environment: StorageEnvironment, limit = 20): Promise<Array<{ id: string; status: string }>> {
    const result = await this.db.query<{ id: string; status: string }>(`SELECT m.id,m.status FROM media_assets m
      JOIN media_objects o ON o.media_id=m.id AND o.variant='original'
      WHERE m.account_id=$1 AND o.storage_environment=$2 AND (
        (m.status='uploading' AND m.created_at < now()-interval '10 minutes') OR
        (m.status='ready' AND m.created_at < now()-interval '24 hours'
          AND NOT EXISTS (SELECT 1 FROM profile_media WHERE media_id=m.id)
          AND NOT EXISTS (SELECT 1 FROM profile_feed_items WHERE media_id=m.id)
          AND NOT EXISTS (SELECT 1 FROM collection_media WHERE media_id=m.id)
          AND NOT EXISTS (SELECT 1 FROM recommendation_media WHERE media_id=m.id)
          AND NOT EXISTS (SELECT 1 FROM recommendation_book_covers WHERE media_id=m.id)))
      ORDER BY m.created_at,m.id LIMIT $3`, [accountId, environment, limit]);
    return result.rows;
  }
}
