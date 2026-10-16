import { createHash, createHmac } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { hashGuestCapability, verifyGuestCapability } from "../policies/musicSurfacePolicy";
import { MusicPublicationOperationRepository } from "./musicPublicationOperationRepository";
import type { MusicPublicationMode } from "../services/musicPublicationResponseCrypto";
import { advancePublicMusicSnapshotRevision } from "./publicMusicRevision";

// playback_states predates the concurrency token and may contain arbitrary
// legacy JSON. Only cast a canonical, in-range unsigned bigint representation.
const SAFE_PLAYBACK_REVISION_SQL = `CASE
  WHEN value ~ '^[0-9]{1,15}$'
    OR (value ~ '^[0-9]{16}$' AND value <= '9007199254740991')
  THEN value::bigint
  ELSE 0
END`;

type QueryPool = Pick<Pool, "query" | "connect">;

// A legacy venue without a canonical mapping retains its existing availability.
// A mapped venue must still belong to an active canonical account; an orphan fails closed.
const CANONICAL_PUBLIC_AVAILABILITY_SQL = `NOT EXISTS (
  SELECT 1 FROM account_music_identity ami
  LEFT JOIN creator_accounts ca ON ca.id=ami.account_id
  WHERE ami.music_user_id=u.id AND ca.status IS DISTINCT FROM 'active'
)`;

const QUEUE_MUTATION_LOCK = 0x4d51;
const SAVED_PLAYLIST_LOCK = 0x4d53;
const PLAYLIST_COLLECTION_LOCK = 0x4d54;
const PUBLICATION_LOCK = 0x4d50;
const MAX_SAVED_PLAYLISTS = 200;
const MAX_SONGS_PER_PLAYLIST = 500;
export const PUBLIC_MUSIC_RESOURCE_MAX_BYTES = 512 * 1_024;

type PublicMusicSongStatus = "queued" | "playing" | "played" | "saved";
export interface PublicMusicSong {
  id: string;
  youtubeId: string;
  title: string;
  artist: string;
  thumbnailUrl: string | null;
  position: number;
  status: PublicMusicSongStatus;
  playedAt: string | null;
}
export interface PublicMusicPlaylist {
  id: string;
  name: string;
  description: string | null;
  songs: { items: PublicMusicSong[]; total: number; truncated: boolean };
}
export interface PublicMusicResource {
  version: "music-public-resource/v1";
  revision: number;
  user: { username: string; venueName: string | null };
  permissions: {
    allowSongRequests: boolean;
    allowGuestPlayOnDevice: boolean;
    allowPlaylistSharing: boolean;
    allowRecentlyPlayedVisibility: boolean;
    allowQueueVisibility: boolean;
  };
  currentlyPlaying: PublicMusicSong | null;
  queue: { items: PublicMusicSong[]; total: number; truncated: boolean };
  recentlyPlayed: { items: PublicMusicSong[]; total: number; truncated: boolean };
  playlists: { items: PublicMusicPlaylist[]; total: number; truncated: boolean };
}

/**
 * The monthly guest song request ceiling, per Music owner. Decision D1, 2026-10-08: TK set
 * it at 100 per calendar month with the surface labelled beta.
 *
 * This is an abuse and cost control, not a billing surface. Every accepted request is a
 * YouTube Data API call, so without a durable ceiling the launch has no bound on
 * third-party spend. It is deliberately separate from the two limits beside it: the
 * per-minute `recentForSource` check stops one client flooding, and the 500-row active
 * queue check bounds how long a queue can get. Neither bounds a month's total.
 */
export const MONTHLY_GUEST_REQUEST_CAP = 100;

export class MusicDomainRepository {
  private readonly publicIdHmacKey?: Buffer;

  constructor(
    private readonly pool: QueryPool,
    private readonly publicationOperations?: MusicPublicationOperationRepository,
    publicIdHmacKey?: Uint8Array,
  ) {
    if (publicIdHmacKey !== undefined && publicIdHmacKey.byteLength !== 32) {
      throw new Error("Music public ID authority must be exactly 256 bits.");
    }
    this.publicIdHmacKey = publicIdHmacKey === undefined ? undefined : Buffer.from(publicIdHmacKey);
  }

  async executePublicationCommand(musicUserId: number, idempotencyKey: string, mode: MusicPublicationMode) {
    if (!this.publicationOperations) throw new Error("Music publication response authority is unavailable.");
    return this.publicationOperations.execute(musicUserId, idempotencyKey, mode);
  }

  private async withAdvisoryLock<T>(namespace: number, resourceId: number, operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1,$2)", [namespace, resourceId]);
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async normalizeActiveQueue(client: PoolClient, musicUserId: number): Promise<void> {
    await client.query(
      `WITH ordered AS (
         SELECT id,(row_number() OVER (ORDER BY position,id)-1)::integer AS desired_position
           FROM songs WHERE user_id=$1 AND status IN ('queued','playing')
       )
       UPDATE songs s SET position=o.desired_position FROM ordered o
        WHERE s.user_id=$1 AND s.id=o.id`,
      [musicUserId],
    );
  }

  async listPlaylists(musicUserId: number) {
    return (await this.pool.query(
      `SELECT p.id,
              p.user_id AS "userId",
              p.name,
              p.description,
              p.is_visible_to_guests AS "isVisibleToGuests",
              p.created_at AS "createdAt",
              p.updated_at AS "updatedAt",
              COALESCE(
                jsonb_agg(
                  jsonb_build_object(
                    'id', ps.id,
                    'playlistId', ps.playlist_id,
                    'youtubeId', ps.youtube_id,
                    'title', ps.title,
                    'artist', ps.artist,
                    'thumbnailUrl', ps.thumbnail_url,
                    'position', ps.position,
                    'addedAt', to_char(ps.added_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                  ) ORDER BY ps.position,ps.id
                ) FILTER (WHERE ps.id IS NOT NULL),
                '[]'::jsonb
              ) AS songs
         FROM (
           SELECT id,user_id,name,description,is_visible_to_guests,created_at,updated_at
             FROM playlists
            WHERE user_id=$1
            ORDER BY created_at DESC,id DESC
            LIMIT 200
         ) p
         LEFT JOIN LATERAL (
           SELECT id,playlist_id,youtube_id,title,artist,thumbnail_url,position,added_at
             FROM playlist_songs
            WHERE playlist_id=p.id
            ORDER BY position,id
            LIMIT 500
         ) ps ON true
        GROUP BY p.id,p.user_id,p.name,p.description,p.is_visible_to_guests,p.created_at,p.updated_at
        ORDER BY p.created_at DESC,p.id DESC`,
      [musicUserId],
    )).rows;
  }

  async getPlaylist(musicUserId: number, playlistId: number) {
    return (await this.pool.query(
      "SELECT id,user_id,name,description,is_visible_to_guests,created_at,updated_at FROM playlists WHERE user_id=$1 AND id=$2",
      [musicUserId, playlistId],
    )).rows[0];
  }

  async createPlaylist(musicUserId: number, input: { name: string; description: string | null }) {
    return this.withAdvisoryLock(PLAYLIST_COLLECTION_LOCK, musicUserId, async (client) => {
      const count = Number((await client.query(
        "SELECT count(*)::integer AS count FROM playlists WHERE user_id=$1",
        [musicUserId],
      )).rows[0]?.count ?? 0);
      if (count >= MAX_SAVED_PLAYLISTS) return undefined;
      const playlist = (await client.query(
        "INSERT INTO playlists(user_id,name,description,is_visible_to_guests) VALUES ($1,$2,$3,false) RETURNING id,user_id,name,description,is_visible_to_guests,created_at,updated_at",
        [musicUserId, input.name, input.description],
      )).rows[0];
      await advancePublicMusicSnapshotRevision(client, musicUserId, "playlists_changed");
      return playlist;
    });
  }

  async updatePlaylist(musicUserId: number, playlistId: number, input: { name: string; description: string | null }) {
    return this.withAdvisoryLock(SAVED_PLAYLIST_LOCK, playlistId, async (client) => {
      const changed = (await client.query(
        `UPDATE playlists SET name=$3,description=$4,updated_at=now()
          WHERE user_id=$1 AND id=$2
            AND (name IS DISTINCT FROM $3 OR description IS DISTINCT FROM $4)
        RETURNING id,user_id,name,description,is_visible_to_guests,created_at,updated_at`,
        [musicUserId, playlistId, input.name, input.description],
      )).rows[0];
      if (changed) {
        await advancePublicMusicSnapshotRevision(client, musicUserId, "playlists_changed");
        return changed;
      }
      return (await client.query(
        "SELECT id,user_id,name,description,is_visible_to_guests,created_at,updated_at FROM playlists WHERE user_id=$1 AND id=$2",
        [musicUserId, playlistId],
      )).rows[0];
    });
  }

  async deletePlaylist(musicUserId: number, playlistId: number): Promise<boolean> {
    return this.withAdvisoryLock(SAVED_PLAYLIST_LOCK, playlistId, async (client) => {
      const deleted = (await client.query("DELETE FROM playlists WHERE user_id=$1 AND id=$2", [musicUserId, playlistId])).rowCount === 1;
      if (deleted) await advancePublicMusicSnapshotRevision(client, musicUserId, "playlists_changed");
      return deleted;
    });
  }

  async addPlaylistSong(musicUserId: number, playlistId: number, input: { youtubeId: string; title: string; artist: string; thumbnailUrl: string }) {
    assertCanonicalYouTubeVideoId(input.youtubeId);
    return this.withAdvisoryLock(SAVED_PLAYLIST_LOCK, playlistId, async (client) => {
      const owned = (await client.query(
        `SELECT p.id,count(ps.id)::integer AS count
           FROM playlists p LEFT JOIN playlist_songs ps ON ps.playlist_id=p.id
          WHERE p.user_id=$1 AND p.id=$2 GROUP BY p.id`,
        [musicUserId, playlistId],
      )).rows[0];
      if (!owned) return undefined;
      if (Number(owned.count) >= MAX_SONGS_PER_PLAYLIST) return null;
      const song = (await client.query(
        `WITH owned AS (
           SELECT id FROM playlists WHERE user_id=$1 AND id=$2
         ), ordered AS (
           SELECT ps.id,(row_number() OVER (ORDER BY ps.position,ps.id)-1)::integer AS desired_position
             FROM playlist_songs ps WHERE ps.playlist_id=(SELECT id FROM owned)
         ), normalized AS (
           UPDATE playlist_songs ps SET position=o.desired_position FROM ordered o WHERE ps.id=o.id
         )
         INSERT INTO playlist_songs(playlist_id,youtube_id,title,artist,thumbnail_url,position)
         SELECT p.id,$3,$4,$5,$6,(SELECT count(*)::integer FROM ordered)
         FROM owned p
         RETURNING id,playlist_id,youtube_id,title,artist,thumbnail_url,position,added_at`,
        [musicUserId, playlistId, input.youtubeId, input.title, input.artist, input.thumbnailUrl],
      )).rows[0];
      await advancePublicMusicSnapshotRevision(client, musicUserId, "playlists_changed");
      return song;
    });
  }

  private async withReadSnapshot<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async removePlaylistSong(musicUserId: number, playlistId: number, songId: number): Promise<boolean> {
    return this.withAdvisoryLock(SAVED_PLAYLIST_LOCK, playlistId, async (client) => {
      const deleted = (await client.query(
        `DELETE FROM playlist_songs ps USING playlists p
         WHERE p.user_id=$1 AND ps.playlist_id=$2 AND p.id=ps.playlist_id AND ps.id=$3`,
        [musicUserId, playlistId, songId],
      )).rowCount === 1;
      if (deleted) await advancePublicMusicSnapshotRevision(client, musicUserId, "playlists_changed");
      return deleted;
    });
  }

  async reorderPlaylistSong(musicUserId: number, playlistId: number, songId: number, position: number): Promise<boolean> {
    return this.withAdvisoryLock(SAVED_PLAYLIST_LOCK, playlistId, async (client) => {
      const ids = (await client.query(
        `SELECT ps.id FROM playlist_songs ps JOIN playlists p ON p.id=ps.playlist_id
          WHERE p.user_id=$1 AND p.id=$2 ORDER BY ps.position,ps.id FOR UPDATE OF ps`,
        [musicUserId, playlistId],
      )).rows.map(({ id }) => id as number);
      const current = ids.indexOf(songId);
      if (current < 0) return false;
      const requestedPosition = Math.max(0, Math.min(position, ids.length - 1));
      if (current === requestedPosition) return true;
      ids.splice(current, 1);
      ids.splice(Math.max(0, Math.min(position, ids.length)), 0, songId);
      await client.query(
        `WITH desired AS (
           SELECT id,(ordinality-1)::integer AS position FROM unnest($3::integer[]) WITH ORDINALITY AS item(id,ordinality)
         )
         UPDATE playlist_songs ps SET position=d.position FROM desired d,playlists p
          WHERE p.user_id=$1 AND p.id=$2 AND ps.playlist_id=p.id AND ps.id=d.id`,
        [musicUserId, playlistId, ids],
      );
      await advancePublicMusicSnapshotRevision(client, musicUserId, "playlists_changed");
      return true;
    });
  }

  async setPlaylistVisibility(musicUserId: number, playlistId: number, visible: boolean): Promise<boolean> {
    return this.withAdvisoryLock(SAVED_PLAYLIST_LOCK, playlistId, async (client) => {
      const changed = (await client.query(
        `UPDATE playlists SET is_visible_to_guests=$3,updated_at=now()
          WHERE user_id=$1 AND id=$2 AND is_visible_to_guests IS DISTINCT FROM $3`,
        [musicUserId, playlistId, visible],
      )).rowCount === 1;
      if (changed) {
        await advancePublicMusicSnapshotRevision(client, musicUserId, "playlists_changed");
        return true;
      }
      return (await client.query("SELECT 1 FROM playlists WHERE user_id=$1 AND id=$2", [musicUserId, playlistId])).rowCount === 1;
    });
  }

  async listQueue(musicUserId: number) {
    return (await this.pool.query(
      "SELECT id,user_id,youtube_id,title,artist,thumbnail_url,position,status,played_at FROM songs WHERE user_id=$1 ORDER BY position",
      [musicUserId],
    )).rows;
  }

  private async advanceQueueRevision(client: PoolClient, musicUserId: number): Promise<number> {
    const row = (await client.query(
      "UPDATE users SET music_queue_revision=music_queue_revision+1 WHERE id=$1 RETURNING music_queue_revision",
      [musicUserId],
    )).rows[0];
    return Number(row.music_queue_revision);
  }

  async replaceQueue(
    musicUserId: number,
    idempotencyKey: string,
    expectedRevision: number,
    songs: Array<{ playlistId: number; songId: number }>,
  ): Promise<
    | { status: "completed"; replayed: boolean; response: { version: "music-queue/v1"; revision: number; songs: unknown[] } }
    | { status: "stale"; revision: number }
    | { status: "conflict" }
    | { status: "not_found" }
  > {
    const operation = "queue.replace";
    const keyHash = createHash("sha256").update(idempotencyKey, "utf8").digest("hex");
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ expectedRevision, songs }), "utf8")
      .digest("hex");
    return this.withAdvisoryLock(QUEUE_MUTATION_LOCK, musicUserId, async (client) => {
      await client.query(
        `DELETE FROM music_owner_operations
          WHERE music_user_id=$1 AND operation=$2 AND idempotency_key_hash=$3
            AND expires_at<=transaction_timestamp()`,
        [musicUserId, operation, keyHash],
      );
      await client.query(
        `WITH expired AS (
           SELECT ctid FROM music_owner_operations
            WHERE music_user_id=$1 AND expires_at<=transaction_timestamp()
            ORDER BY expires_at LIMIT 100
         )
         DELETE FROM music_owner_operations operation USING expired
          WHERE operation.ctid=expired.ctid`,
        [musicUserId],
      );
      const existing = (await client.query(
        `SELECT request_hash,status_code,response_body
           FROM music_owner_operations
          WHERE music_user_id=$1 AND operation=$2 AND idempotency_key_hash=$3
            AND expires_at>transaction_timestamp()`,
        [musicUserId, operation, keyHash],
      )).rows[0];
      if (existing) {
        if (existing.request_hash !== requestHash) return { status: "conflict" as const };
        return { status: "completed" as const, replayed: true, response: existing.response_body };
      }

      const owner = (await client.query(
        "SELECT u.music_queue_revision FROM users u WHERE u.id=$1 FOR UPDATE",
        [musicUserId],
      )).rows[0];
      if (!owner) return { status: "not_found" as const };
      const revision = Number(owner.music_queue_revision);
      if (revision !== expectedRevision) return { status: "stale" as const, revision };

      const playlistIds = songs.map(({ playlistId }) => playlistId);
      const songIds = songs.map(({ songId }) => songId);
      const sources = songs.length === 0 ? [] : (await client.query(
        `SELECT ps.id,ps.youtube_id,ps.title,ps.artist,ps.thumbnail_url,source.ordinality
           FROM unnest($2::integer[],$3::integer[]) WITH ORDINALITY AS source(playlist_id,song_id,ordinality)
           JOIN playlists p ON p.id=source.playlist_id AND p.user_id=$1
           JOIN playlist_songs ps ON ps.playlist_id=p.id AND ps.id=source.song_id
          ORDER BY source.ordinality`,
        [musicUserId, playlistIds, songIds],
      )).rows;
      if (sources.length !== songs.length) return { status: "not_found" as const };

      const removedActiveRows = (await client.query(
        "DELETE FROM songs WHERE user_id=$1 AND status IN ('queued','playing') RETURNING status",
        [musicUserId],
      )).rows;
      const stoppedPlayback = removedActiveRows.some(({ status }) => status === "playing");
      const inserted = sources.length === 0 ? [] : (await client.query(
        `INSERT INTO songs(user_id,youtube_id,title,artist,thumbnail_url,position,status)
         SELECT $1,source.youtube_id,source.title,source.artist,source.thumbnail_url,(source.ordinality-1)::integer,'queued'
           FROM unnest($2::text[],$3::text[],$4::text[],$5::text[]) WITH ORDINALITY
             AS source(youtube_id,title,artist,thumbnail_url,ordinality)
          ORDER BY source.ordinality
         RETURNING id,user_id,youtube_id,title,artist,thumbnail_url,position,status,played_at`,
        [
          musicUserId,
          sources.map(({ youtube_id }) => youtube_id),
          sources.map(({ title }) => title),
          sources.map(({ artist }) => artist),
          sources.map(({ thumbnail_url }) => thumbnail_url),
        ],
      )).rows.sort((left, right) => Number(left.position) - Number(right.position));
      const nextRevision = Number((await client.query(
        "UPDATE users SET music_queue_revision=music_queue_revision+1 WHERE id=$1 RETURNING music_queue_revision",
        [musicUserId],
      )).rows[0].music_queue_revision);
      if (stoppedPlayback) await this.recordPlaybackRevision(client, musicUserId, nextRevision);
      const response = {
        version: "music-queue/v1" as const,
        revision: nextRevision,
        songs: inserted.map((row) => ({
          id: row.id,
          userId: row.user_id,
          youtubeId: row.youtube_id,
          title: row.title,
          artist: row.artist,
          thumbnailUrl: row.thumbnail_url,
          position: row.position,
          status: row.status,
          playedAt: row.played_at instanceof Date ? row.played_at.toISOString() : row.played_at ?? null,
        })),
      };
      if (removedActiveRows.length > 0 || inserted.length > 0) {
        await advancePublicMusicSnapshotRevision(client, musicUserId, "queue_changed");
      }
      await client.query(
        `INSERT INTO music_owner_operations(
           music_user_id,operation,idempotency_key_hash,request_hash,status_code,response_body,expires_at
         ) VALUES ($1,$2,$3,$4,200,$5::jsonb,transaction_timestamp()+interval '24 hours')`,
        [musicUserId, operation, keyHash, requestHash, JSON.stringify(response)],
      );
      return { status: "completed" as const, replayed: false, response };
    });
  }

  async addPlaylistSongIdempotent(
    musicUserId: number,
    idempotencyKey: string,
    playlistId: number,
    input: { youtubeId: string; title: string; artist: string; thumbnailUrl: string },
  ): Promise<
    | { status: "completed"; replayed: boolean; response: unknown }
    | { status: "conflict" }
    | { status: "limit" }
    | { status: "not_found" }
  > {
    assertCanonicalYouTubeVideoId(input.youtubeId);
    const operation = "playlist.song.add";
    const keyHash = createHash("sha256").update(idempotencyKey, "utf8").digest("hex");
    const requestHash = createHash("sha256").update(JSON.stringify({ playlistId, input }), "utf8").digest("hex");
    return this.withAdvisoryLock(SAVED_PLAYLIST_LOCK, playlistId, async (client) => {
      await client.query(
        `DELETE FROM music_owner_operations
          WHERE music_user_id=$1 AND operation=$2 AND idempotency_key_hash=$3
            AND expires_at<=transaction_timestamp()`,
        [musicUserId, operation, keyHash],
      );
      await client.query(
        `WITH expired AS (
           SELECT ctid FROM music_owner_operations
            WHERE music_user_id=$1 AND expires_at<=transaction_timestamp()
            ORDER BY expires_at LIMIT 100
         )
         DELETE FROM music_owner_operations operation USING expired
          WHERE operation.ctid=expired.ctid`,
        [musicUserId],
      );
      const existing = (await client.query(
        `SELECT request_hash,response_body FROM music_owner_operations
          WHERE music_user_id=$1 AND operation=$2 AND idempotency_key_hash=$3
            AND expires_at>transaction_timestamp()`,
        [musicUserId, operation, keyHash],
      )).rows[0];
      if (existing) {
        if (existing.request_hash !== requestHash) return { status: "conflict" as const };
        return { status: "completed" as const, replayed: true, response: existing.response_body };
      }
      const owned = (await client.query(
        `SELECT p.id,count(ps.id)::integer AS count
           FROM playlists p LEFT JOIN playlist_songs ps ON ps.playlist_id=p.id
          WHERE p.user_id=$1 AND p.id=$2 GROUP BY p.id`,
        [musicUserId, playlistId],
      )).rows[0];
      if (!owned) return { status: "not_found" as const };
      if (Number(owned.count) >= MAX_SONGS_PER_PLAYLIST) return { status: "limit" as const };
      const song = (await client.query(
        `INSERT INTO playlist_songs(playlist_id,youtube_id,title,artist,thumbnail_url,position)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id,playlist_id,youtube_id,title,artist,thumbnail_url,position,added_at`,
        [playlistId, input.youtubeId, input.title, input.artist, input.thumbnailUrl, Number(owned.count)],
      )).rows[0];
      await advancePublicMusicSnapshotRevision(client, musicUserId, "playlists_changed");
      await client.query(
        `INSERT INTO music_owner_operations(
           music_user_id,operation,idempotency_key_hash,request_hash,status_code,response_body,expires_at
         ) VALUES ($1,$2,$3,$4,201,$5::jsonb,transaction_timestamp()+interval '24 hours')`,
        [musicUserId, operation, keyHash, requestHash, JSON.stringify(song)],
      );
      return { status: "completed" as const, replayed: false, response: song };
    });
  }

  async appendQueue(
    musicUserId: number,
    idempotencyKey: string,
    expectedRevision: number,
    songs: Array<{ playlistId: number; songId: number }>,
  ): Promise<
    | { status: "completed"; replayed: boolean; response: { version: "music-queue/v1"; revision: number; songs: unknown[] } }
    | { status: "stale"; revision: number }
    | { status: "conflict" }
    | { status: "not_found" }
    | { status: "limit" }
    | { status: "empty" }
  > {
    if (songs.length === 0) return { status: "empty" as const };
    const operation = "queue.append";
    const keyHash = createHash("sha256").update(idempotencyKey, "utf8").digest("hex");
    const requestHash = createHash("sha256").update(JSON.stringify({ expectedRevision, songs }), "utf8").digest("hex");
    return this.withAdvisoryLock(QUEUE_MUTATION_LOCK, musicUserId, async (client) => {
      await client.query(
        `DELETE FROM music_owner_operations WHERE music_user_id=$1 AND operation=$2 AND idempotency_key_hash=$3
           AND expires_at<=transaction_timestamp()`,
        [musicUserId, operation, keyHash],
      );
      await client.query(
        `WITH expired AS (
           SELECT ctid FROM music_owner_operations
            WHERE music_user_id=$1 AND expires_at<=transaction_timestamp()
            ORDER BY expires_at LIMIT 100
         )
         DELETE FROM music_owner_operations operation USING expired
          WHERE operation.ctid=expired.ctid`,
        [musicUserId],
      );
      const existing = (await client.query(
        `SELECT request_hash,response_body FROM music_owner_operations
          WHERE music_user_id=$1 AND operation=$2 AND idempotency_key_hash=$3 AND expires_at>transaction_timestamp()`,
        [musicUserId, operation, keyHash],
      )).rows[0];
      if (existing) {
        if (existing.request_hash !== requestHash) return { status: "conflict" as const };
        return { status: "completed" as const, replayed: true, response: existing.response_body };
      }

      const owner = (await client.query("SELECT music_queue_revision FROM users WHERE id=$1 FOR UPDATE", [musicUserId])).rows[0];
      if (!owner) return { status: "not_found" as const };
      const revision = Number(owner.music_queue_revision);
      if (revision !== expectedRevision) return { status: "stale" as const, revision };
      await this.normalizeActiveQueue(client, musicUserId);
      const currentCount = Number((await client.query(
        "SELECT count(*)::integer AS count FROM songs WHERE user_id=$1 AND status IN ('queued','playing')",
        [musicUserId],
      )).rows[0]?.count ?? 0);
      const playlistIds = songs.map(({ playlistId }) => playlistId);
      const songIds = songs.map(({ songId }) => songId);
      const sources = songs.length === 0 ? [] : (await client.query(
        `SELECT ps.youtube_id,ps.title,ps.artist,ps.thumbnail_url,source.ordinality
           FROM unnest($2::integer[],$3::integer[]) WITH ORDINALITY AS source(playlist_id,song_id,ordinality)
           JOIN playlists p ON p.id=source.playlist_id AND p.user_id=$1
           JOIN playlist_songs ps ON ps.playlist_id=p.id AND ps.id=source.song_id
          ORDER BY source.ordinality`,
        [musicUserId, playlistIds, songIds],
      )).rows;
      if (sources.length !== songs.length) return { status: "not_found" as const };
      if (currentCount + sources.length > 500) return { status: "limit" as const };
      if (sources.length) await client.query(
        `INSERT INTO songs(user_id,youtube_id,title,artist,thumbnail_url,position,status)
         SELECT $1,source.youtube_id,source.title,source.artist,source.thumbnail_url,$2+(source.ordinality-1)::integer,'queued'
           FROM unnest($3::text[],$4::text[],$5::text[],$6::text[]) WITH ORDINALITY
             AS source(youtube_id,title,artist,thumbnail_url,ordinality)`,
        [musicUserId, currentCount, sources.map(({ youtube_id }) => youtube_id), sources.map(({ title }) => title), sources.map(({ artist }) => artist), sources.map(({ thumbnail_url }) => thumbnail_url)],
      );
      const nextRevision = Number((await client.query(
        "UPDATE users SET music_queue_revision=music_queue_revision+1 WHERE id=$1 RETURNING music_queue_revision", [musicUserId],
      )).rows[0].music_queue_revision);
      const queue = (await client.query(
        `SELECT id,user_id,youtube_id,title,artist,thumbnail_url,position,status,played_at
           FROM songs WHERE user_id=$1 AND status IN ('queued','playing') ORDER BY position,id`,
        [musicUserId],
      )).rows.map((row) => ({
        id: row.id, userId: row.user_id, youtubeId: row.youtube_id, title: row.title, artist: row.artist,
        thumbnailUrl: row.thumbnail_url, position: row.position, status: row.status,
        playedAt: row.played_at instanceof Date ? row.played_at.toISOString() : row.played_at ?? null,
      }));
      const response = { version: "music-queue/v1" as const, revision: nextRevision, songs: queue };
      await advancePublicMusicSnapshotRevision(client, musicUserId, "queue_changed");
      await client.query(
        `INSERT INTO music_owner_operations(music_user_id,operation,idempotency_key_hash,request_hash,status_code,response_body,expires_at)
         VALUES ($1,$2,$3,$4,200,$5::jsonb,transaction_timestamp()+interval '24 hours')`,
        [musicUserId, operation, keyHash, requestHash, JSON.stringify(response)],
      );
      return { status: "completed" as const, replayed: false, response };
    });
  }

  async ownerDashboard(musicUserId: number) {
    return this.withReadSnapshot(async (client) => {
      const activeRows = (await client.query(
        `WITH bounded AS (
           SELECT id,user_id AS "userId",youtube_id AS "youtubeId",title,artist,
                  thumbnail_url AS "thumbnailUrl",position,status,played_at AS "playedAt"
             FROM songs
            WHERE user_id=$1 AND status IN ('queued','playing')
            ORDER BY (status='playing') DESC,position,id
            LIMIT 500
         )
         SELECT * FROM bounded ORDER BY position,id`,
        [musicUserId],
      )).rows;
      const playedRows = (await client.query(
        `SELECT id,user_id AS "userId",youtube_id AS "youtubeId",title,artist,
                thumbnail_url AS "thumbnailUrl",position,status,played_at AS "playedAt"
           FROM songs
          WHERE user_id=$1 AND status='played'
          ORDER BY played_at DESC NULLS LAST,id DESC
          LIMIT 500`,
        [musicUserId],
      )).rows;
      const publication = (await client.query(
        `SELECT guest_url,
                music_queue_revision,
                COALESCE((SELECT ${SAFE_PLAYBACK_REVISION_SQL}
                            FROM (SELECT state->>'revision' AS value FROM playback_states WHERE user_id=$1) playback_revision),0) AS music_playback_revision,
                guest_discoverable,
                allow_song_requests,allow_guest_play_on_device,allow_playlist_sharing,allow_recently_played_visibility,allow_queue_visibility,
                (guest_capability_hash IS NOT NULL AND guest_capability_revoked_at IS NULL) AS has_guest_capability
           FROM users WHERE id=$1`,
        [musicUserId],
      )).rows[0];
      return {
        queueRevision: Number(publication?.music_queue_revision ?? 0),
        playbackRevision: Number(publication?.music_playback_revision ?? 0),
        songs: activeRows,
        currentlyPlaying: activeRows.find((row) => row.status === "playing"),
        playedSongs: playedRows,
        publication: {
          mode: publication?.guest_discoverable === true ? "public"
            : publication?.has_guest_capability === true ? "unlisted" : "private",
          publicSlug: String(publication?.guest_url ?? ""),
        },
        guestControls: {
          allowSongRequests: publication?.allow_song_requests === true,
          allowGuestPlayOnDevice: publication?.allow_guest_play_on_device === true,
          allowPlaylistSharing: publication?.allow_playlist_sharing === true,
          allowRecentlyPlayedVisibility: publication?.allow_recently_played_visibility === true,
          allowQueueVisibility: publication?.allow_queue_visibility === true,
        },
      };
    });
  }

  async updateGuestControls(musicUserId: number, controls: { allowSongRequests: boolean; allowGuestPlayOnDevice: boolean; allowPlaylistSharing: boolean; allowRecentlyPlayedVisibility: boolean; allowQueueVisibility?: boolean }) {
    return this.withAdvisoryLock(PUBLICATION_LOCK, musicUserId, async (client) => {
      const row = (await client.query(
        `UPDATE users SET allow_song_requests=$2,allow_guest_play_on_device=$3,
           allow_playlist_sharing=$4,allow_recently_played_visibility=$5,
           allow_queue_visibility=COALESCE($6,allow_queue_visibility),updated_at=now()
         WHERE id=$1 AND identity_status='active'
           AND (allow_song_requests IS DISTINCT FROM $2
             OR allow_guest_play_on_device IS DISTINCT FROM $3
             OR allow_playlist_sharing IS DISTINCT FROM $4
             OR allow_recently_played_visibility IS DISTINCT FROM $5
             OR ($6::boolean IS NOT NULL AND allow_queue_visibility IS DISTINCT FROM $6))
         RETURNING allow_song_requests,allow_guest_play_on_device,allow_playlist_sharing,allow_recently_played_visibility,allow_queue_visibility,true AS changed`,
        [musicUserId, controls.allowSongRequests, controls.allowGuestPlayOnDevice, controls.allowPlaylistSharing, controls.allowRecentlyPlayedVisibility, controls.allowQueueVisibility],
      )).rows[0] ?? (await client.query(
        `SELECT allow_song_requests,allow_guest_play_on_device,allow_playlist_sharing,allow_recently_played_visibility,allow_queue_visibility,false AS changed
           FROM users WHERE id=$1 AND identity_status='active'`,
        [musicUserId],
      )).rows[0];
      if (!row) return undefined;
      const result = {
        allowSongRequests: row.allow_song_requests === true,
        allowGuestPlayOnDevice: row.allow_guest_play_on_device === true,
        allowPlaylistSharing: row.allow_playlist_sharing === true,
        allowRecentlyPlayedVisibility: row.allow_recently_played_visibility === true,
        allowQueueVisibility: row.allow_queue_visibility === true,
      };
      if (row.changed === true) await advancePublicMusicSnapshotRevision(client, musicUserId, "guest_controls_changed");
      return result;
    });
  }

  async getGuestControls(musicUserId: number) {
    const row = (await this.pool.query(
      `SELECT allow_song_requests,allow_guest_play_on_device,allow_playlist_sharing,allow_recently_played_visibility,allow_queue_visibility
       FROM users WHERE id=$1 AND identity_status='active'`,
      [musicUserId],
    )).rows[0];
    return row ? {
      allowSongRequests: row.allow_song_requests === true,
      allowGuestPlayOnDevice: row.allow_guest_play_on_device === true,
      allowPlaylistSharing: row.allow_playlist_sharing === true,
      allowRecentlyPlayedVisibility: row.allow_recently_played_visibility === true,
      allowQueueVisibility: row.allow_queue_visibility === true,
    } : undefined;
  }

  async addSong(musicUserId: number, input: { youtubeId: string; title: string; artist: string; thumbnailUrl: string }) {
    assertCanonicalYouTubeVideoId(input.youtubeId);
    return this.withAdvisoryLock(QUEUE_MUTATION_LOCK, musicUserId, async (client) => {
      const activeCount = Number((await client.query(
        "SELECT count(*)::integer AS count FROM songs WHERE user_id=$1 AND status IN ('queued','playing')",
        [musicUserId],
      )).rows[0]?.count ?? 0);
      if (activeCount >= 500) return undefined;
      const song = (await client.query(
        `WITH ordered AS (
           SELECT id,(row_number() OVER (ORDER BY position,id)-1)::integer AS desired_position
             FROM songs WHERE user_id=$1 AND status IN ('queued','playing')
         ), normalized AS (
           UPDATE songs s SET position=o.desired_position FROM ordered o WHERE s.user_id=$1 AND s.id=o.id
         )
         INSERT INTO songs(user_id,youtube_id,title,artist,thumbnail_url,position,status)
         VALUES ($1,$2,$3,$4,$5,(SELECT count(*)::integer FROM ordered),'queued')
         RETURNING id,user_id,youtube_id,title,artist,thumbnail_url,position,status,played_at`,
        [musicUserId, input.youtubeId, input.title, input.artist, input.thumbnailUrl],
      )).rows[0];
      await this.advanceQueueRevision(client, musicUserId);
      await advancePublicMusicSnapshotRevision(client, musicUserId, "queue_changed");
      return song;
    });
  }

  async setPlaying(musicUserId: number, songId: number | null, expectedRevision?: number, expectedPlaybackRevision?: number) {
    return this.withAdvisoryLock(QUEUE_MUTATION_LOCK, musicUserId, async (client) => {
      let nextRevision: number | undefined;
      if (expectedRevision !== undefined) {
        const owner = (await client.query(
          `SELECT music_queue_revision,
                  COALESCE((SELECT ${SAFE_PLAYBACK_REVISION_SQL}
                              FROM (SELECT state->>'revision' AS value FROM playback_states WHERE user_id=$1) playback_revision),0) AS music_playback_revision
             FROM users WHERE id=$1 FOR UPDATE`,
          [musicUserId],
        )).rows[0];
        if (!owner) return { status: "not_found" as const };
        const currentRevision = Number(owner.music_queue_revision);
        const playbackRevision = Number(owner.music_playback_revision);
        if (expectedRevision !== currentRevision) return {
          status: "stale" as const,
          revision: currentRevision,
          playbackRevision,
          queueOnly: expectedPlaybackRevision !== undefined && expectedPlaybackRevision === playbackRevision,
        };
        nextRevision = currentRevision + 1;
      }
      if (songId === null) {
        const completed = await client.query(
          "UPDATE songs SET status='played',played_at=now() WHERE user_id=$1 AND status='playing'",
          [musicUserId],
        );
        await this.normalizeActiveQueue(client, musicUserId);
        if (nextRevision !== undefined) {
          const advanced = (await client.query(
            "UPDATE users SET music_queue_revision=music_queue_revision+1 WHERE id=$1 AND music_queue_revision=$2 RETURNING music_queue_revision",
            [musicUserId, expectedRevision],
          )).rows[0];
          const revision = Number(advanced.music_queue_revision);
          await this.recordPlaybackRevision(client, musicUserId, revision);
          if ((completed.rowCount ?? 0) > 0) await advancePublicMusicSnapshotRevision(client, musicUserId, "playback_changed");
          return { status: "completed" as const, revision, playbackRevision: revision, song: null };
        }
        if ((completed.rowCount ?? 0) > 0) {
          const revision = await this.advanceQueueRevision(client, musicUserId);
          await this.recordPlaybackRevision(client, musicUserId, revision);
        }
        if ((completed.rowCount ?? 0) > 0) await advancePublicMusicSnapshotRevision(client, musicUserId, "playback_changed");
        return null;
      }
      const activated = (await client.query(
        `WITH target AS (
           SELECT id FROM songs WHERE user_id=$1 AND id=$2 FOR UPDATE
         ), was_playing AS (
           SELECT EXISTS(SELECT 1 FROM songs WHERE user_id=$1 AND id=$2 AND status='playing') AS value
             FROM target
         ), previous AS (
           UPDATE songs SET status='played',played_at=now()
            WHERE user_id=$1 AND status='playing' AND id<>$2
              AND EXISTS (SELECT 1 FROM target)
           RETURNING 1
         )
         UPDATE songs SET status='playing',played_at=NULL
          WHERE user_id=$1 AND id=$2 AND EXISTS (SELECT 1 FROM target)
         RETURNING id,user_id,youtube_id,title,artist,thumbnail_url,position,status,played_at,
                   (SELECT value FROM was_playing) AS was_playing,
                   (SELECT count(*)::integer FROM previous) AS retired_count`,
        [musicUserId, songId],
      )).rows[0];
      if (!activated) return expectedRevision === undefined ? undefined : { status: "not_found" as const };
      await this.normalizeActiveQueue(client, musicUserId);
      let canonicalRevision = nextRevision;
      if (expectedRevision === undefined) canonicalRevision = await this.advanceQueueRevision(client, musicUserId);
      else canonicalRevision = Number((await client.query(
        "UPDATE users SET music_queue_revision=music_queue_revision+1 WHERE id=$1 AND music_queue_revision=$2 RETURNING music_queue_revision",
        [musicUserId, expectedRevision],
      )).rows[0].music_queue_revision);
      await this.recordPlaybackRevision(client, musicUserId, canonicalRevision!);
      if (activated.was_playing !== true || Number(activated.retired_count) > 0) {
        await advancePublicMusicSnapshotRevision(client, musicUserId, "playback_changed");
      }
      const song = (await client.query(
        "SELECT id,user_id,youtube_id,title,artist,thumbnail_url,position,status,played_at FROM songs WHERE user_id=$1 AND id=$2 AND status='playing'",
        [musicUserId, songId],
      )).rows[0];
      return expectedRevision === undefined
        ? song
        : { status: "completed" as const, revision: canonicalRevision!, playbackRevision: canonicalRevision!, song };
    });
  }

  private async recordPlaybackRevision(client: PoolClient, musicUserId: number, revision: number): Promise<void> {
    await client.query(
      `INSERT INTO playback_states(user_id,state,updated_at)
       VALUES ($1,jsonb_build_object('revision',$2::bigint),now())
       ON CONFLICT (user_id) DO UPDATE
       SET state=(CASE
                    WHEN jsonb_typeof(playback_states.state)='object' THEN playback_states.state
                    ELSE jsonb_build_object('legacyState',playback_states.state)
                  END) || EXCLUDED.state,
           updated_at=EXCLUDED.updated_at`,
      [musicUserId, revision],
    );
  }

  async createPlaylistIdempotent(
    musicUserId: number,
    idempotencyKey: string,
    input: { name: string; description: string | null },
  ): Promise<
    | { status: "completed"; replayed: boolean; response: unknown }
    | { status: "conflict" }
    | { status: "limit" }
  > {
    const operation = "playlist.create";
    const keyHash = createHash("sha256").update(idempotencyKey, "utf8").digest("hex");
    const requestHash = createHash("sha256").update(JSON.stringify(input), "utf8").digest("hex");
    return this.withAdvisoryLock(PLAYLIST_COLLECTION_LOCK, musicUserId, async (client) => {
      await client.query(
        `DELETE FROM music_owner_operations
          WHERE music_user_id=$1 AND operation=$2 AND idempotency_key_hash=$3
            AND expires_at<=transaction_timestamp()`,
        [musicUserId, operation, keyHash],
      );
      await client.query(
        `WITH expired AS (
           SELECT ctid FROM music_owner_operations
            WHERE music_user_id=$1 AND expires_at<=transaction_timestamp()
            ORDER BY expires_at LIMIT 100
         )
         DELETE FROM music_owner_operations operation USING expired
          WHERE operation.ctid=expired.ctid`,
        [musicUserId],
      );
      const existing = (await client.query(
        `SELECT request_hash,status_code,response_body
           FROM music_owner_operations
          WHERE music_user_id=$1 AND operation=$2 AND idempotency_key_hash=$3
            AND expires_at>transaction_timestamp()`,
        [musicUserId, operation, keyHash],
      )).rows[0];
      if (existing) {
        if (existing.request_hash !== requestHash) return { status: "conflict" as const };
        return { status: "completed" as const, replayed: true, response: existing.response_body };
      }
      const count = Number((await client.query(
        "SELECT count(*)::integer AS count FROM playlists WHERE user_id=$1",
        [musicUserId],
      )).rows[0]?.count ?? 0);
      if (count >= MAX_SAVED_PLAYLISTS) return { status: "limit" as const };
      const playlist = (await client.query(
        "INSERT INTO playlists(user_id,name,description,is_visible_to_guests) VALUES ($1,$2,$3,false) RETURNING id,user_id,name,description,is_visible_to_guests,created_at,updated_at",
        [musicUserId, input.name, input.description],
      )).rows[0];
      await advancePublicMusicSnapshotRevision(client, musicUserId, "playlists_changed");
      await client.query(
        `INSERT INTO music_owner_operations(
           music_user_id,operation,idempotency_key_hash,request_hash,status_code,response_body,expires_at
         ) VALUES ($1,$2,$3,$4,201,$5::jsonb,transaction_timestamp()+interval '24 hours')`,
        [musicUserId, operation, keyHash, requestHash, JSON.stringify(playlist)],
      );
      return { status: "completed" as const, replayed: false, response: playlist };
    });
  }

  async updateSongPosition(musicUserId: number, songId: number, position: number) {
    return this.withAdvisoryLock(QUEUE_MUTATION_LOCK, musicUserId, async (client) => {
      const rows = (await client.query(
        "SELECT id,status FROM songs WHERE user_id=$1 AND status IN ('queued','playing') ORDER BY position,id FOR UPDATE",
        [musicUserId],
      )).rows as Array<{ id: number; status: string }>;
      const current = rows.findIndex(({ id, status }) => id === songId && status === "queued");
      if (current < 0) return undefined;
      const requestedPosition = Math.max(0, Math.min(position, rows.length - 1));
      const publicStateChanged = current !== requestedPosition;
      const [target] = rows.splice(current, 1);
      rows.splice(Math.max(0, Math.min(position, rows.length)), 0, target);
      await client.query(
        `WITH desired AS (
           SELECT id,(ordinality-1)::integer AS position FROM unnest($2::integer[]) WITH ORDINALITY AS item(id,ordinality)
         )
         UPDATE songs s SET position=d.position FROM desired d WHERE s.user_id=$1 AND s.id=d.id`,
        [musicUserId, rows.map(({ id }) => id)],
      );
      await this.advanceQueueRevision(client, musicUserId);
      if (publicStateChanged) await advancePublicMusicSnapshotRevision(client, musicUserId, "queue_changed");
      return (await client.query(
        "SELECT id,user_id,youtube_id,title,artist,thumbnail_url,position,status,played_at FROM songs WHERE user_id=$1 AND id=$2 AND status='queued'",
        [musicUserId, songId],
      )).rows[0];
    });
  }

  async removeSong(musicUserId: number, songId: number): Promise<boolean> {
    return this.withAdvisoryLock(QUEUE_MUTATION_LOCK, musicUserId, async (client) => {
      const removed = await client.query(
        "DELETE FROM songs WHERE user_id=$1 AND id=$2 RETURNING status",
        [musicUserId, songId],
      );
      if ((removed.rowCount ?? 0) > 0 && removed.rows.some(({ status }) => status === "queued" || status === "playing")) {
        await this.normalizeActiveQueue(client, musicUserId);
        const nextRevision = await this.advanceQueueRevision(client, musicUserId);
        if (removed.rows.some(({ status }) => status === "playing")) {
          await this.recordPlaybackRevision(client, musicUserId, nextRevision);
        }
      }
      if ((removed.rowCount ?? 0) > 0) await advancePublicMusicSnapshotRevision(client, musicUserId, "queue_changed");
      return removed.rowCount === 1;
    });
  }

  async removeSongs(musicUserId: number, songIds: number[]): Promise<number> {
    return this.withAdvisoryLock(QUEUE_MUTATION_LOCK, musicUserId, async (client) => {
      const removed = await client.query(
        "DELETE FROM songs WHERE user_id=$1 AND id=ANY($2::integer[]) RETURNING status",
        [musicUserId, songIds],
      );
      if (removed.rows.some(({ status }) => status === "queued" || status === "playing")) {
        await this.normalizeActiveQueue(client, musicUserId);
        const nextRevision = await this.advanceQueueRevision(client, musicUserId);
        if (removed.rows.some(({ status }) => status === "playing")) {
          await this.recordPlaybackRevision(client, musicUserId, nextRevision);
        }
      }
      if ((removed.rowCount ?? 0) > 0) await advancePublicMusicSnapshotRevision(client, musicUserId, "queue_changed");
      return removed.rowCount ?? 0;
    });
  }

  async removeHistorySong(
    musicUserId: number,
    idempotencyKey: string,
    songId: number,
  ): Promise<
    | { status: "completed"; replayed: boolean }
    | { status: "conflict" }
    | { status: "not_found" }
  > {
    const operation = "history.remove";
    const keyHash = createHash("sha256").update(idempotencyKey, "utf8").digest("hex");
    const requestHash = createHash("sha256").update(JSON.stringify({ songId }), "utf8").digest("hex");
    return this.withAdvisoryLock(QUEUE_MUTATION_LOCK, musicUserId, async (client) => {
      await client.query(
        `DELETE FROM music_owner_operations
          WHERE music_user_id=$1 AND operation=$2 AND idempotency_key_hash=$3
            AND expires_at<=transaction_timestamp()`,
        [musicUserId, operation, keyHash],
      );
      await client.query(
        `WITH expired AS (
           SELECT ctid FROM music_owner_operations
            WHERE music_user_id=$1 AND expires_at<=transaction_timestamp()
            ORDER BY expires_at LIMIT 100
         )
         DELETE FROM music_owner_operations operation USING expired
          WHERE operation.ctid=expired.ctid`,
        [musicUserId],
      );
      const existing = (await client.query(
        `SELECT request_hash FROM music_owner_operations
          WHERE music_user_id=$1 AND operation=$2 AND idempotency_key_hash=$3
            AND expires_at>transaction_timestamp()`,
        [musicUserId, operation, keyHash],
      )).rows[0];
      if (existing) {
        if (existing.request_hash !== requestHash) return { status: "conflict" as const };
        return { status: "completed" as const, replayed: true };
      }
      const removed = await client.query(
        "DELETE FROM songs WHERE user_id=$1 AND id=$2 AND status='played' RETURNING id",
        [musicUserId, songId],
      );
      if ((removed.rowCount ?? 0) !== 1) return { status: "not_found" as const };
      await advancePublicMusicSnapshotRevision(client, musicUserId, "playback_changed");
      await client.query(
        `INSERT INTO music_owner_operations(
           music_user_id,operation,idempotency_key_hash,request_hash,status_code,response_body,expires_at
         ) VALUES ($1,$2,$3,$4,204,'{}'::jsonb,transaction_timestamp()+interval '24 hours')`,
        [musicUserId, operation, keyHash, requestHash],
      );
      return { status: "completed" as const, replayed: false };
    });
  }

  async clearHistory(musicUserId: number): Promise<number> {
    return this.withAdvisoryLock(QUEUE_MUTATION_LOCK, musicUserId, async (client) => {
      const deleted = (await client.query("DELETE FROM songs WHERE user_id=$1 AND status='played'", [musicUserId])).rowCount ?? 0;
      if (deleted > 0) await advancePublicMusicSnapshotRevision(client, musicUserId, "playback_changed");
      return deleted;
    });
  }

  async addGuestSongIdempotent(
    publicSlug: string,
    capability: string | undefined,
    source: string,
    idempotencyKey: string,
    input: { youtubeId: string; title: string; artist: string; thumbnailUrl: string },
  ): Promise<
    | { status: "completed"; replayed: boolean; response: { accepted: true } }
    | { status: "conflict" | "limit" | "forbidden" | "rate_limited" }
    | { status: "quota_exceeded"; cap: number; retryAfterSeconds: number }
  > {
    assertCanonicalYouTubeVideoId(input.youtubeId);
    const operationFamily = "guest.song.request:";
    const keyHash = createHash("sha256").update(idempotencyKey, "utf8").digest("hex");
    const requestHash = createHash("sha256").update(JSON.stringify(input), "utf8").digest("hex");
    const capabilityValid = typeof capability === "string" && /^[A-Za-z0-9_-]{43}$/.test(capability);
    const capabilityHash = capabilityValid ? hashGuestCapability(capability) : null;
    const rateAuthorityHash = createHash("sha256")
      .update(`${source}\0${publicSlug}\0${capabilityHash ?? "public"}`, "utf8").digest("hex");
    const operation = `${operationFamily}${rateAuthorityHash}`;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const resolved = (await client.query(
        `SELECT id FROM users u WHERE guest_url=$1 AND identity_status='active'
              AND ${CANONICAL_PUBLIC_AVAILABILITY_SQL}
           AND (guest_discoverable=true OR ($3::boolean AND guest_capability_hash=$2 AND guest_capability_revoked_at IS NULL))`,
        [publicSlug, capabilityHash, capabilityValid],
      )).rows[0];
      if (!resolved) { await client.query("ROLLBACK"); return { status: "forbidden" }; }
      const musicUserId = Number(resolved.id);
      await client.query("SELECT pg_advisory_xact_lock($1,$2)", [QUEUE_MUTATION_LOCK, musicUserId]);
      const owner = (await client.query(
        `SELECT id,allow_song_requests,guest_discoverable,guest_capability_hash
           FROM users u WHERE guest_url=$1 AND identity_status='active'
              AND ${CANONICAL_PUBLIC_AVAILABILITY_SQL}
              AND id=$4
              AND (guest_discoverable=true OR ($3::boolean AND guest_capability_hash=$2 AND guest_capability_revoked_at IS NULL))
           FOR UPDATE`,
        [publicSlug, capabilityHash, capabilityValid, musicUserId],
      )).rows[0];
      const authorized = owner && owner.allow_song_requests === true && (owner.guest_discoverable === true
        || (capabilityValid && verifyGuestCapability(capability!, owner.guest_capability_hash)));
      if (!authorized) { await client.query("ROLLBACK"); return { status: "forbidden" }; }
      await client.query(
        `DELETE FROM music_owner_operations WHERE music_user_id=$1 AND operation LIKE $2 AND idempotency_key_hash=$3
           AND expires_at<=transaction_timestamp()`, [musicUserId, operation, keyHash],
      );
      await client.query(
        `WITH expired AS (
           SELECT ctid FROM music_owner_operations
            WHERE music_user_id=$1 AND operation LIKE $2 AND expires_at<=transaction_timestamp()
            ORDER BY expires_at LIMIT 100
         ) DELETE FROM music_owner_operations operation USING expired WHERE operation.ctid=expired.ctid`,
        [musicUserId, `${operationFamily}%`],
      );
      const existing = (await client.query(
        `SELECT request_hash,response_body FROM music_owner_operations
          WHERE music_user_id=$1 AND operation LIKE $2 AND idempotency_key_hash=$3 AND expires_at>transaction_timestamp()`,
        [musicUserId, `${operationFamily}%`, keyHash],
      )).rows[0];
      if (existing) {
        await client.query("COMMIT");
        if (existing.request_hash !== requestHash) return { status: "conflict" };
        return { status: "completed", replayed: true, response: existing.response_body };
      }
      const recentForSource = Number((await client.query(
        `SELECT count(*)::integer AS count FROM music_owner_operations
          WHERE music_user_id=$1 AND operation=$2 AND created_at>transaction_timestamp()-interval '1 minute'`,
        [musicUserId, operation],
      )).rows[0]?.count ?? 0);
      if (recentForSource >= 20) { await client.query("ROLLBACK"); return { status: "rate_limited" }; }
      await this.normalizeActiveQueue(client, musicUserId);
      const activeCount = Number((await client.query(
        "SELECT count(*)::integer AS count FROM songs WHERE user_id=$1 AND status IN ('queued','playing')", [musicUserId],
      )).rows[0]?.count ?? 0);
      if (activeCount >= 500) { await client.query("ROLLBACK"); return { status: "limit" }; }
      /*
       * The monthly cap. Decision D1.
       *
       * Counted by upsert-and-read rather than check-then-increment, so the count and the
       * queue insert commit together or not at all. The ROLLBACK below therefore undoes the
       * increment too: a refused request does not consume quota, which it would under a
       * read followed by a separate write.
       *
       * Neither of the two tables that look like they already count this can. Rows in
       * `music_owner_operations` expire after 24 hours and are swept by this very function,
       * and `songs` churns as the queue plays, so one gives a daily figure and the other
       * gives a queue length.
       */
      const monthlyCount = Number((await client.query(
        `INSERT INTO music_request_quota(music_user_id,period_start,accepted_count)
         VALUES ($1,date_trunc('month',transaction_timestamp())::date,1)
         ON CONFLICT (music_user_id,period_start)
         DO UPDATE SET accepted_count=music_request_quota.accepted_count+1,updated_at=now()
         RETURNING accepted_count`,
        [musicUserId],
      )).rows[0]?.accepted_count ?? 0);
      if (monthlyCount > MONTHLY_GUEST_REQUEST_CAP) {
        // Seconds until the next calendar month, from the database clock rather than the
        // node process, because the period boundary above is the database's.
        const retryAfterSeconds = Math.max(1, Math.ceil(Number((await client.query(
          `SELECT EXTRACT(EPOCH FROM (date_trunc('month',transaction_timestamp())
             + interval '1 month' - transaction_timestamp())) AS seconds`,
        )).rows[0]?.seconds ?? 3600)));
        await client.query("ROLLBACK");
        return { status: "quota_exceeded", cap: MONTHLY_GUEST_REQUEST_CAP, retryAfterSeconds };
      }
      await client.query(
        `INSERT INTO songs(user_id,youtube_id,title,artist,thumbnail_url,position,status)
         VALUES ($1,$2,$3,$4,$5,$6,'queued')`,
        [musicUserId, input.youtubeId, input.title, input.artist, input.thumbnailUrl, activeCount],
      );
      await client.query("UPDATE users SET music_queue_revision=music_queue_revision+1 WHERE id=$1", [musicUserId]);
      const revision = Number((await client.query(
        "UPDATE users SET public_snapshot_revision=public_snapshot_revision+1 WHERE id=$1 RETURNING public_snapshot_revision", [musicUserId],
      )).rows[0]?.public_snapshot_revision);
      if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Public Music snapshot revision authority is unavailable.");
      await client.query("SELECT pg_notify('music_public_change',$1)", [JSON.stringify({ musicUserId, kind: "queue_changed", revision })]);
      const response = { accepted: true as const };
      await client.query(
        `INSERT INTO music_owner_operations(music_user_id,operation,idempotency_key_hash,request_hash,status_code,response_body,expires_at)
         VALUES ($1,$2,$3,$4,201,$5::jsonb,transaction_timestamp()+interval '24 hours')`,
        [musicUserId, operation, keyHash, requestHash, JSON.stringify(response)],
      );
      await client.query("COMMIT");
      return { status: "completed", replayed: false, response };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async rotateGuestCapability(musicUserId: number, capabilityHash: string) {
    return this.withAdvisoryLock(PUBLICATION_LOCK, musicUserId, async (client) => {
      const changed = (await client.query(
        `UPDATE users SET guest_capability_hash=$2,guest_capability_rotated_at=now(),guest_capability_revoked_at=NULL
          WHERE id=$1 AND (guest_capability_hash IS DISTINCT FROM $2 OR guest_capability_revoked_at IS NOT NULL)
        RETURNING guest_capability_hash`,
        [musicUserId, capabilityHash],
      )).rows[0];
      if (changed) {
        await advancePublicMusicSnapshotRevision(client, musicUserId, "publication_changed");
        return changed;
      }
      return (await client.query("SELECT guest_capability_hash FROM users WHERE id=$1", [musicUserId])).rows[0];
    });
  }

  async setPublicationMode(
    musicUserId: number,
    mode: "private" | "unlisted" | "public",
    capabilityHash?: string,
  ): Promise<{ mode: "private" | "unlisted" | "public"; publicSlug: string } | undefined> {
    if (mode === "unlisted" && !/^[a-f0-9]{64}$/.test(capabilityHash ?? "")) {
      throw new Error("A valid capability hash is required for unlisted publication.");
    }
    return this.withAdvisoryLock(PUBLICATION_LOCK, musicUserId, async (client) => {
      const changed = (await client.query(
        `UPDATE users
            SET guest_discoverable=($2='public'),
                guest_capability_hash=CASE WHEN $2='unlisted' THEN $3 ELSE guest_capability_hash END,
                guest_capability_rotated_at=CASE WHEN $2='unlisted' THEN now() ELSE guest_capability_rotated_at END,
                guest_capability_revoked_at=CASE WHEN $2='unlisted' THEN NULL ELSE now() END
          WHERE id=$1 AND (
            ($2='unlisted' AND (guest_discoverable IS NOT FALSE
              OR guest_capability_hash IS DISTINCT FROM $3 OR guest_capability_revoked_at IS NOT NULL))
            OR ($2='public' AND guest_discoverable IS NOT TRUE)
            OR ($2='private' AND (guest_discoverable IS NOT FALSE
              OR (guest_capability_hash IS NOT NULL AND guest_capability_revoked_at IS NULL)))
          )
          RETURNING guest_url`,
        [musicUserId, mode, capabilityHash ?? null],
      )).rows[0];
      if (changed) await advancePublicMusicSnapshotRevision(client, musicUserId, "publication_changed");
      const row = changed ?? (await client.query("SELECT guest_url FROM users WHERE id=$1", [musicUserId])).rows[0];
      return row ? { mode, publicSlug: String(row.guest_url ?? "") } : undefined;
    });
  }

  async revokeGuestCapability(musicUserId: number): Promise<void> {
    await this.withAdvisoryLock(PUBLICATION_LOCK, musicUserId, async (client) => {
      const changed = await client.query(
        `UPDATE users SET guest_capability_revoked_at=now(),guest_discoverable=false
          WHERE id=$1 AND (guest_discoverable IS NOT FALSE
            OR (guest_capability_hash IS NOT NULL AND guest_capability_revoked_at IS NULL))`,
        [musicUserId],
      );
      if ((changed.rowCount ?? 0) > 0) await advancePublicMusicSnapshotRevision(client, musicUserId, "publication_changed");
    });
  }

  async setDiscoverable(musicUserId: number, discoverable: boolean): Promise<void> {
    await this.withAdvisoryLock(PUBLICATION_LOCK, musicUserId, async (client) => {
      const changed = await client.query(
        "UPDATE users SET guest_discoverable=$2 WHERE id=$1 AND guest_discoverable IS DISTINCT FROM $2",
        [musicUserId, discoverable],
      );
      if ((changed.rowCount ?? 0) > 0) await advancePublicMusicSnapshotRevision(client, musicUserId, "publication_changed");
    });
  }

  async resolveEntitlement(musicUserId: number) {
    const row = (await this.pool.query(
      "SELECT entitlement_state,entitlement_source_updated_at FROM users WHERE id=$1",
      [musicUserId],
    )).rows[0];
    return row ? { state: row.entitlement_state, sourceUpdatedAt: row.entitlement_source_updated_at } : undefined;
  }

  async resolvePublicDescriptor(accountDocumentId: string): Promise<{
    mode: "public";
    publicSlug: string;
    revision: number;
  } | undefined> {
    const rows = (await this.pool.query(
      // The descriptor id is the owner's account identifier, and after ADR-007 a
      // canonically provisioned venue has NULL in strapi_account_document_id, so the
      // legacy arm alone can never resolve one. The canonical arm joins through
      // account_music_identity, as explorersAnalyticsEventRepository already does.
      // account_id is compared as text deliberately: $1 is still a legacy Strapi
      // document id for pre-0039 venues, and `account_id=$1` would make Postgres
      // coerce that to uuid and raise 22P02, failing every legacy lookup.
      // Canonical owners have no representable tombstone (ADR-008 decision 5), so the
      // tombstone and collision guards below remain keyed on the Strapi columns.
      `SELECT u.guest_url AS "publicSlug",u.public_snapshot_revision AS revision
         FROM users u
        WHERE (u.strapi_account_document_id=$1
               OR EXISTS (
                 SELECT 1 FROM account_music_identity owner
                  WHERE owner.music_user_id=u.id
                    AND owner.account_id::text=$1
               ))
          AND u.identity_status='active'
          AND ${CANONICAL_PUBLIC_AVAILABILITY_SQL}
          AND u.guest_discoverable=true
          AND u.guest_url IS NOT NULL
          AND length(u.guest_url) BETWEEN 8 AND 128
          AND u.guest_url ~ '^[A-Za-z0-9_-]+$'
          AND NOT EXISTS (
            SELECT 1 FROM users collision
             WHERE collision.strapi_user_document_id=$1
          )
          AND NOT EXISTS (
            SELECT 1 FROM music_identity_tombstones tombstone
             WHERE tombstone.strapi_user_document_id=$1
                OR tombstone.strapi_account_document_id=$1
          )
        LIMIT 2`,
      [accountDocumentId],
    )).rows;
    if (rows.length !== 1) return undefined;
    const publicSlug = rows[0]?.publicSlug;
    const revision = Number(rows[0]?.revision);
    if (typeof publicSlug !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(publicSlug)
        || !Number.isSafeInteger(revision) || revision < 0) return undefined;
    return { mode: "public", publicSlug, revision };
  }

  async resolvePublicSnapshotRevision(musicUserId: number): Promise<number | undefined> {
    if (!Number.isSafeInteger(musicUserId) || musicUserId < 1) return undefined;
    const row = (await this.pool.query(
      `SELECT public_snapshot_revision AS revision FROM users u WHERE id=$1 AND identity_status='active' AND ${CANONICAL_PUBLIC_AVAILABILITY_SQL}`,
      [musicUserId],
    )).rows[0];
    const revision = Number(row?.revision);
    return Number.isSafeInteger(revision) && revision >= 0 ? revision : undefined;
  }

  async resolvePublicMusicResource(
    publicSlug: string,
    capability?: string,
  ): Promise<{ state: string; noindex?: boolean; resource?: PublicMusicResource } | undefined> {
    if (!this.publicIdHmacKey) throw new Error("Music public ID authority is unavailable.");
    const publicIdHmacKey = this.publicIdHmacKey;
    const capabilityValid = typeof capability === "string" && /^[A-Za-z0-9_-]{43}$/.test(capability);
    const capabilityHash = capabilityValid ? hashGuestCapability(capability) : "0".repeat(64);
    return this.withReadSnapshot(async (client) => {
      const owner = (await client.query(
        `SELECT u.id,u.identity_status,u.guest_capability_hash,u.guest_capability_revoked_at,
                u.guest_discoverable,u.guest_url,u.username,u.venue_name,u.public_snapshot_revision,
                u.allow_song_requests,u.allow_guest_play_on_device,u.allow_playlist_sharing,
                u.allow_recently_played_visibility,u.allow_queue_visibility
           FROM users u
          WHERE u.guest_url=$2 AND ${CANONICAL_PUBLIC_AVAILABILITY_SQL}
            AND (u.guest_discoverable=true OR ($3::boolean AND u.guest_capability_hash=$1))
          LIMIT 1`,
        [capabilityHash, publicSlug, capabilityValid],
      )).rows[0];
      if (!owner) return undefined;
      const capabilityMatch = capabilityValid && verifyGuestCapability(capability!, owner.guest_capability_hash);
      const state = owner.identity_status === "suspended" ? "suspended"
        : owner.identity_status === "pending_deletion" ? "pending_deletion"
          : owner.guest_discoverable === true ? "public"
            : owner.guest_capability_revoked_at && capabilityMatch ? "revoked"
              : capabilityMatch ? "unlisted" : "private";
      if (state !== "public" && state !== "unlisted") return { state };

      const revision = boundedPublicTotal(owner.public_snapshot_revision);
      const username = boundedPublicText(owner.username, 255);
      let venueName: string | null = null;
      if (owner.venue_name !== null) {
        const boundedVenueName = boundedPublicText(owner.venue_name, 255);
        if (!boundedVenueName) return { state };
        venueName = boundedVenueName;
      }
      if (revision === undefined || !username) return { state };
      const permissions = {
        allowSongRequests: owner.allow_song_requests === true,
        allowGuestPlayOnDevice: owner.allow_guest_play_on_device === true,
        allowPlaylistSharing: owner.allow_playlist_sharing === true,
        allowRecentlyPlayedVisibility: owner.allow_recently_played_visibility === true,
        allowQueueVisibility: owner.allow_queue_visibility === true,
      };

      let currentlyPlaying: PublicMusicSong | null = null;
      if (permissions.allowGuestPlayOnDevice || permissions.allowQueueVisibility) {
        const row = (await client.query(
          `SELECT id,youtube_id,title,artist,thumbnail_url,position,status,played_at
             FROM songs WHERE user_id=$1 AND status='playing'
            ORDER BY position,id LIMIT 1`,
          [owner.id],
        )).rows[0];
        currentlyPlaying = row ? publicSongFromRow(publicIdHmacKey, "song", row, "playing") : null;
      }

      let queueRows: any[] = [];
      let queueTotal = 0;
      if (permissions.allowQueueVisibility) {
        queueRows = (await client.query(
          `WITH total AS (
             SELECT count(*)::integer AS total FROM songs WHERE user_id=$1 AND status='queued'
           ), bounded AS (
             SELECT id,youtube_id,title,artist,thumbnail_url,position,status,played_at
               FROM songs WHERE user_id=$1 AND status='queued'
              ORDER BY position,id LIMIT 100
           )
           SELECT bounded.*,total.total FROM total LEFT JOIN bounded ON true ORDER BY bounded.position,bounded.id`,
          [owner.id],
        )).rows;
        queueTotal = publicQueryTotal(queueRows, owner.queue_total);
      }
      const queueItems = queueRows.filter((row) => row.id !== null && row.id !== undefined).slice(0, 100)
        .map((row) => publicSongFromRow(publicIdHmacKey, "song", row, "queued"));

      let historyRows: any[] = [];
      let historyTotal = 0;
      if (permissions.allowRecentlyPlayedVisibility) {
        historyRows = (await client.query(
          `WITH total AS (
             SELECT count(*)::integer AS total FROM songs WHERE user_id=$1 AND status='played'
           ), bounded AS (
             SELECT id,youtube_id,title,artist,thumbnail_url,position,status,played_at
               FROM songs WHERE user_id=$1 AND status='played'
              ORDER BY played_at DESC NULLS LAST,id DESC LIMIT 50
           )
           SELECT bounded.*,total.total FROM total LEFT JOIN bounded ON true
            ORDER BY bounded.played_at DESC NULLS LAST,bounded.id DESC`,
          [owner.id],
        )).rows;
        historyTotal = publicQueryTotal(historyRows, owner.history_total);
      }
      const historyItems = historyRows.filter((row) => row.id !== null && row.id !== undefined).slice(0, 50)
        .map((row) => publicSongFromRow(publicIdHmacKey, "song", row, "played"));

      let playlistRows: any[] = [];
      let playlistTotal = 0;
      if (permissions.allowPlaylistSharing) {
        playlistRows = (await client.query(
          `WITH total AS (
             SELECT count(*)::integer AS total FROM playlists
              WHERE user_id=$1 AND is_visible_to_guests=true
           ), bounded_playlists AS (
             SELECT id,name,description,is_visible_to_guests,created_at
               FROM playlists
              WHERE user_id=$1 AND is_visible_to_guests=true
              ORDER BY created_at DESC,id DESC LIMIT 20
           )
           SELECT p.id AS playlist_internal_id,p.name AS playlist_name,p.description AS playlist_description,
                  p.is_visible_to_guests AS playlist_visible,total.total AS playlist_total,
                  saved.id,saved.youtube_id,saved.title,saved.artist,saved.thumbnail_url,saved.position,
                  saved.status,saved.played_at,saved.song_total AS playlist_song_total
             FROM total LEFT JOIN bounded_playlists p ON true
             LEFT JOIN LATERAL (
               WITH song_total AS (
                 SELECT count(*)::integer AS total FROM playlist_songs WHERE playlist_id=p.id
               ), bounded_songs AS (
                 SELECT id,youtube_id,title,artist,thumbnail_url,position,'saved'::text AS status,NULL::timestamptz AS played_at
                   FROM playlist_songs WHERE playlist_id=p.id
                  ORDER BY position,id LIMIT 50
               )
               SELECT bounded_songs.*,song_total.total AS song_total
                 FROM song_total LEFT JOIN bounded_songs ON true
                ORDER BY bounded_songs.position,bounded_songs.id
             ) saved ON p.id IS NOT NULL
            ORDER BY p.created_at DESC,p.id DESC,saved.position,saved.id`,
          [owner.id],
        )).rows;
        playlistTotal = publicQueryTotal(playlistRows, owner.playlist_total);
      }
      const playlists = publicPlaylistsFromRows(publicIdHmacKey, playlistRows).slice(0, 20);
      const resource: PublicMusicResource = {
        version: "music-public-resource/v1",
        revision,
        user: { username, venueName },
        permissions,
        currentlyPlaying,
        queue: { items: queueItems, total: queueTotal, truncated: queueTotal > queueItems.length },
        recentlyPlayed: { items: historyItems, total: historyTotal, truncated: historyTotal > historyItems.length },
        playlists: { items: playlists, total: playlistTotal, truncated: playlistTotal > playlists.length },
      };
      boundPublicResourcePayload(resource);
      return { state, noindex: state === "unlisted", resource };
    });
  }

  async resolvePublicMusicSocketAuthority(publicSlug: string, capability?: string): Promise<{
    musicUserId: number;
    active: boolean;
  } | undefined> {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(publicSlug)) return undefined;
    const capabilityValid = typeof capability === "string" && /^[A-Za-z0-9_-]{43}$/.test(capability);
    const capabilityHash = capabilityValid ? hashGuestCapability(capability) : "0".repeat(64);
    const row = (await this.pool.query(
      `SELECT id,identity_status,guest_discoverable,guest_capability_hash,guest_capability_revoked_at
         FROM users u
        WHERE guest_url=$2 AND ${CANONICAL_PUBLIC_AVAILABILITY_SQL}
          AND (guest_discoverable=true OR ($3::boolean AND guest_capability_hash=$1))
        LIMIT 1`,
      [capabilityHash, publicSlug, capabilityValid],
    )).rows[0];
    if (!row || row.identity_status !== "active") return undefined;
    const publicAuthority = row.guest_discoverable === true;
    const unlistedAuthority = row.guest_discoverable !== true && capabilityValid
      && !row.guest_capability_revoked_at && verifyGuestCapability(capability!, row.guest_capability_hash);
    return publicAuthority || unlistedAuthority ? { musicUserId: Number(row.id), active: true } : undefined;
  }

  async resolveGuestResource(publicSlug: string, capability?: string) {
    const capabilityValid = typeof capability === "string" && /^[A-Za-z0-9_-]{43}$/.test(capability);
    const capabilityHash = capabilityValid
      ? hashGuestCapability(capability)
      : "0".repeat(64);
    const row = (await this.pool.query(
      `SELECT u.id,u.identity_status,u.guest_capability_hash,u.guest_capability_revoked_at,
        u.guest_discoverable,u.guest_url,u.username,u.venue_name,u.theme,
        u.allow_song_requests,u.allow_guest_play_on_device,u.allow_playlist_sharing,u.allow_recently_played_visibility,u.allow_queue_visibility,
        EXISTS(SELECT 1 FROM playlists vp WHERE vp.user_id=u.id AND vp.is_visible_to_guests=true) AS has_visible_playlist,
        (SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id',s.id,'userId',s.user_id,'youtubeId',s.youtube_id,'title',s.title,'artist',s.artist,
          'thumbnailUrl',s.thumbnail_url,'position',s.position,'status',s.status,'playedAt',s.played_at
        ) ORDER BY s.position) FILTER (WHERE s.id IS NOT NULL),'[]'::jsonb)
          FROM songs s WHERE s.user_id=u.id AND s.status IN ('queued','playing')) AS songs,
        (SELECT jsonb_build_object(
          'id',s.id,'userId',s.user_id,'youtubeId',s.youtube_id,'title',s.title,'artist',s.artist,
          'thumbnailUrl',s.thumbnail_url,'position',s.position,'status',s.status,'playedAt',s.played_at
        ) FROM songs s WHERE s.user_id=u.id AND s.status='playing' ORDER BY s.id LIMIT 1) AS currently_playing,
        (SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id',played.id,'userId',played.user_id,'youtubeId',played.youtube_id,'title',played.title,'artist',played.artist,
          'thumbnailUrl',played.thumbnail_url,'position',played.position,'status',played.status,'playedAt',played.played_at
        ) ORDER BY played.played_at DESC) FILTER (WHERE played.id IS NOT NULL),'[]'::jsonb)
          FROM (SELECT * FROM songs ps WHERE ps.user_id=u.id AND ps.status='played' ORDER BY ps.played_at DESC LIMIT 50) played) AS played_songs,
        (SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id',p.id,'userId',p.user_id,'name',p.name,'description',p.description,'isVisibleToGuests',p.is_visible_to_guests,
          'createdAt',p.created_at,'updatedAt',p.updated_at,
          'songs',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id',j.id,'playlistId',j.playlist_id,'youtubeId',j.youtube_id,'title',j.title,'artist',j.artist,
            'thumbnailUrl',j.thumbnail_url,'position',j.position,'addedAt',to_char(j.added_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
          ) ORDER BY j.position) FILTER (WHERE j.id IS NOT NULL),'[]'::jsonb) FROM playlist_songs j WHERE j.playlist_id=p.id)
        ) ORDER BY p.id) FILTER (WHERE p.id IS NOT NULL),'[]'::jsonb)
          FROM playlists p WHERE p.user_id=u.id AND p.is_visible_to_guests=true) AS visible_playlists
       FROM users u
         WHERE u.guest_url=$2 AND ${CANONICAL_PUBLIC_AVAILABILITY_SQL} AND (u.guest_discoverable=true OR ($3::boolean AND u.guest_capability_hash=$1))
       LIMIT 1`,
      [capabilityHash, publicSlug, capabilityValid],
    )).rows[0];
    if (!row) return undefined;
    const capabilityMatch = capabilityValid
      && verifyGuestCapability(capability!, row.guest_capability_hash);
    const state = row.identity_status === "suspended" ? "suspended"
      : row.identity_status === "pending_deletion" ? "pending_deletion"
        : row.guest_discoverable ? "public"
          : row.guest_capability_revoked_at && capabilityMatch ? "revoked"
            : capabilityMatch ? "unlisted" : "private";
    const publicPlaylist = {
      songs: row.allow_queue_visibility ? row.songs ?? [] : [],
      user: {
        id: row.id,
        username: row.username,
        guestUrl: row.guest_url,
        venueName: row.venue_name,
        theme: row.theme,
        allowSongRequests: row.allow_song_requests,
        allowGuestPlayOnDevice: row.allow_guest_play_on_device,
        allowPlaylistSharing: row.allow_playlist_sharing,
        allowRecentlyPlayedVisibility: row.allow_recently_played_visibility,
        allowQueueVisibility: row.allow_queue_visibility,
      },
      currentlyPlaying: row.allow_queue_visibility ? row.currently_playing ?? null : null,
      playedSongs: row.allow_recently_played_visibility ? row.played_songs ?? [] : [],
      allowGuestPlayOnDevice: row.allow_guest_play_on_device,
      allowRecentlyPlayedVisibility: row.allow_recently_played_visibility,
      allowQueueVisibility: row.allow_queue_visibility,
      playlists: row.allow_playlist_sharing ? row.visible_playlists ?? [] : undefined,
    };
    return {
      state,
      noindex: state === "unlisted",
      playlist: state === "public" || state === "unlisted" ? publicPlaylist : undefined,
    };
  }

  async resolveGuestSocketAuthority(capability: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(capability)) return undefined;
    const row = (await this.pool.query(
      `SELECT id,allow_song_requests,guest_capability_hash FROM users u
       WHERE guest_capability_hash=$1 AND guest_capability_revoked_at IS NULL AND identity_status='active'
         AND ${CANONICAL_PUBLIC_AVAILABILITY_SQL}`,
      [hashGuestCapability(capability)],
    )).rows[0];
    return row && verifyGuestCapability(capability, row.guest_capability_hash)
      ? { musicUserId: row.id, active: true as const, allowSongRequests: row.allow_song_requests === true }
      : undefined;
  }

  async resolveGuestRequestAuthority(publicSlug: string, capability?: string) {
    const capabilityValid = typeof capability === "string" && /^[A-Za-z0-9_-]{43}$/.test(capability);
    const capabilityHash = capabilityValid ? hashGuestCapability(capability) : null;
    const row = (await this.pool.query(
      `SELECT id,allow_song_requests,guest_discoverable,guest_capability_hash FROM users u
       WHERE guest_url=$1 AND identity_status='active'
         AND ${CANONICAL_PUBLIC_AVAILABILITY_SQL}
         AND (guest_discoverable=true OR ($3::boolean AND guest_capability_hash=$2 AND guest_capability_revoked_at IS NULL))`,
      [publicSlug, capabilityHash, capabilityValid],
    )).rows[0];
    const authorityValid = row?.guest_discoverable === true
      || (capabilityValid && verifyGuestCapability(capability, row?.guest_capability_hash));
    return row && authorityValid
      ? { musicUserId: row.id, active: true as const, allowSongRequests: row.allow_song_requests === true }
      : undefined;
  }

  async listPublishedMusicPlaylists() {
    return (await this.pool.query(
      `SELECT DISTINCT u.guest_url AS "guestUrl",u.updated_at AS "updatedAt"
         FROM users u
        WHERE u.identity_status='active'
          AND ${CANONICAL_PUBLIC_AVAILABILITY_SQL}
          AND u.guest_url IS NOT NULL
          AND u.guest_discoverable=true
          AND EXISTS (
            SELECT 1 FROM playlists p
             WHERE p.user_id=u.id AND p.is_visible_to_guests=true
          )
        ORDER BY u.guest_url`,
    )).rows;
  }
}

function boundedPublicText(value: unknown, maxLength: number): string | undefined {
  return typeof value === "string" && value.length >= 1 && value.length <= maxLength ? value : undefined;
}

function boundedPublicOptionalText(value: unknown, maxLength: number): string | undefined {
  return typeof value === "string" && value.length <= maxLength ? value : undefined;
}

function boundedPublicTotal(value: unknown): number | undefined {
  const total = Number(value);
  return Number.isSafeInteger(total) && total >= 0 ? total : undefined;
}

function publicQueryTotal(rows: any[], fallback: unknown): number {
  const total = boundedPublicTotal(rows[0]?.total ?? rows[0]?.playlist_total ?? fallback);
  return total ?? rows.filter((row) => row.id !== null && row.id !== undefined).length;
}

function publicContentId(
  key: Buffer,
  entityType: "song" | "playlist" | "playlist-song",
  internalIdentity: unknown,
): string {
  const identity = canonicalInternalPublicIdentity(internalIdentity);
  return createHmac("sha256", key)
    .update("music-public-id/v1\0", "utf8")
    .update(entityType, "utf8")
    .update("\0", "utf8")
    .update(identity, "utf8")
    .digest("base64url");
}

function canonicalInternalPublicIdentity(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "bigint" && /^[1-9][0-9]*$/.test(value.toString())) return value.toString();
  if (typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value)) return value;
  throw new Error("The public Music entity identity is invalid.");
}

function publicThumbnailUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 2_048) return null;
  try {
    const parsed = new URL(value);
    const canonical = parsed.toString();
    return (parsed.protocol === "https:" || parsed.protocol === "http:")
      && parsed.username.length === 0 && parsed.password.length === 0 && canonical.length <= 2_048
      ? canonical
      : null;
  } catch {
    return null;
  }
}

function publicSongFromRow(
  publicIdHmacKey: Buffer,
  entityType: "song" | "playlist-song",
  row: any,
  status: PublicMusicSongStatus,
): PublicMusicSong {
  const youtubeId = boundedPublicText(row.youtube_id ?? row.youtubeId, 11);
  const title = boundedPublicText(row.title, 1_024);
  const artist = boundedPublicText(row.artist, 1_024);
  const thumbnailUrl = publicThumbnailUrl(row.thumbnail_url ?? row.thumbnailUrl);
  const position = boundedPublicTotal(row.position);
  if (!youtubeId || !/^[A-Za-z0-9_-]{11}$/.test(youtubeId) || !title || !artist || position === undefined) {
    throw new Error("The public Music song projection is invalid.");
  }
  const rawPlayedAt = row.played_at ?? row.playedAt;
  const playedAt = status === "played"
    ? rawPlayedAt instanceof Date ? rawPlayedAt.toISOString() : rawPlayedAt ? new Date(rawPlayedAt).toISOString() : undefined
    : null;
  if (status === "played" && !playedAt) throw new Error("The public Music history projection is invalid.");
  return {
    id: publicContentId(publicIdHmacKey, entityType, row.id),
    youtubeId,
    title,
    artist,
    thumbnailUrl,
    position,
    status,
    playedAt: playedAt ?? null,
  };
}

function publicPlaylistsFromRows(publicIdHmacKey: Buffer, rows: any[]): PublicMusicPlaylist[] {
  const grouped = new Map<unknown, { playlist: PublicMusicPlaylist; total: number }>();
  for (const row of rows) {
    const internalId = row.playlist_internal_id;
    if (internalId === null || internalId === undefined || row.playlist_visible !== true) continue;
    let entry = grouped.get(internalId);
    if (!entry) {
      const name = boundedPublicText(row.playlist_name, 120);
      let description: string | null = null;
      if (row.playlist_description !== null) {
        const boundedDescription = boundedPublicOptionalText(row.playlist_description, 2_000);
        if (boundedDescription === undefined) throw new Error("The public Music playlist projection is invalid.");
        description = boundedDescription;
      }
      if (!name) throw new Error("The public Music playlist projection is invalid.");
      const total = boundedPublicTotal(row.playlist_song_total) ?? 0;
      entry = {
        total,
        playlist: {
          id: publicContentId(publicIdHmacKey, "playlist", internalId),
          name,
          description,
          songs: { items: [], total, truncated: total > 0 },
        },
      };
      grouped.set(internalId, entry);
    }
    const current = entry!;
    if (row.id !== null && row.id !== undefined && current.playlist.songs.items.length < 50) {
      current.playlist.songs.items.push(publicSongFromRow(
        publicIdHmacKey,
        "playlist-song",
        row,
        "saved",
      ));
      current.playlist.songs.truncated = current.total > current.playlist.songs.items.length;
    }
  }
  return Array.from(grouped.values()).map(({ playlist }) => playlist);
}

function boundPublicResourcePayload(resource: PublicMusicResource): void {
  const size = () => Buffer.byteLength(JSON.stringify(resource), "utf8");
  while (size() > PUBLIC_MUSIC_RESOURCE_MAX_BYTES && resource.playlists.items.length > 0) {
    resource.playlists.items.pop();
    resource.playlists.truncated = resource.playlists.total > resource.playlists.items.length;
  }
  while (size() > PUBLIC_MUSIC_RESOURCE_MAX_BYTES && resource.recentlyPlayed.items.length > 0) {
    resource.recentlyPlayed.items.pop();
    resource.recentlyPlayed.truncated = resource.recentlyPlayed.total > resource.recentlyPlayed.items.length;
  }
  while (size() > PUBLIC_MUSIC_RESOURCE_MAX_BYTES && resource.queue.items.length > 0) {
    resource.queue.items.pop();
    resource.queue.truncated = resource.queue.total > resource.queue.items.length;
  }
  if (size() > PUBLIC_MUSIC_RESOURCE_MAX_BYTES) throw new Error("The public Music resource exceeds its encoded limit.");
}

function assertCanonicalYouTubeVideoId(value: string): void {
  if (!/^[A-Za-z0-9_-]{11}$/.test(value)) throw new TypeError("A canonical YouTube video ID is required.");
}
