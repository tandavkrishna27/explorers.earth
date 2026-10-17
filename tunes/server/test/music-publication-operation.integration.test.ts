import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMusicPublicationIdempotencyKey } from "../../shared/musicPublicationContract";
import { migrateMusicDatabase } from "../db/migrate";
import { MusicIdentityRepository, type EnsureMusicIdentityInput } from "../repositories/musicIdentityRepository";
import { MusicDomainRepository } from "../repositories/musicDomainRepository";
import { MusicPublicationOperationRepository } from "../repositories/musicPublicationOperationRepository";
import {
  MusicPublicationResponseCipher,
  hashPublicationIdempotencyKey,
  publicationRequestFingerprint,
  type MusicPublicationCommandResponse,
} from "../services/musicPublicationResponseCrypto";
import { hashGuestCapability } from "../policies/musicSurfacePolicy";
import { provisionMusicRuntimeLogin } from "../db/music-runtime-role";

const exactTarget = process.env.DATABASE_URL_TEST ?? "postgresql://music_migrator:music@127.0.0.1:55432/music_fixture";
const enabled = process.env.MUSIC_C9_PUBLICATION_POSTGRES_TEST === "1";
const describePg = enabled ? describe.sequential : describe.skip;
const databaseName = `music_c9_publication_${process.pid}`;
const baseTime = Date.parse("2026-08-21T00:00:00.000Z");
let clock = baseTime;
let databaseNow = baseTime;
let admin: pg.Pool;
let pool: pg.Pool;
let runtimePool: pg.Pool;
let identities: MusicIdentityRepository;
const runtimeUser = `music_publication_runtime_${process.pid}`;
const runtimePassword = Buffer.alloc(32, 0x70).toString("base64url");

function publicationKey(label: string, issuedAtMs = databaseNow): string {
  const hex = createHash("sha256").update(label).digest("hex");
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  return createMusicPublicationIdempotencyKey(issuedAtMs, uuid);
}

const currentKey = { kid: "publication-current-v1", key: Buffer.alloc(32, 0x61) };
const previousKey = { kid: "publication-previous-v1", key: Buffer.alloc(32, 0x62) };

function cipher(current = currentKey, previous?: { kid: string; key: Buffer; acceptUntil: number }) {
  return new MusicPublicationResponseCipher({ current, previous, retentionSeconds: 86_400 }, { now: () => clock });
}

function repository(
  responseCipher = cipher(),
  hooks: ConstructorParameters<typeof MusicPublicationOperationRepository>[2] = {},
  repositoryPool: ConstructorParameters<typeof MusicPublicationOperationRepository>[0] = pool,
) {
  return new MusicPublicationOperationRepository(repositoryPool, responseCipher, hooks);
}

async function insertExpiredOperation(ownerId: number, key: string, response: MusicPublicationCommandResponse): Promise<void> {
  const idempotencyKeyHash = hashPublicationIdempotencyKey(key);
  const requestFingerprint = publicationRequestFingerprint(response.publication.mode);
  const encrypted = cipher().encrypt({ musicUserId: ownerId, idempotencyKeyHash, requestFingerprint }, response);
  const expiresAt = new Date(databaseNow - 1_000);
  const completedAt = new Date(expiresAt.getTime() - 86_400_000);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("ALTER TABLE music_publication_operations DISABLE TRIGGER music_publication_operation_immutability");
    await client.query(`INSERT INTO music_publication_operations(
      music_user_id,idempotency_key_hash,request_fingerprint,request_mode,operation_state,
      created_at,completed_at,expires_at,updated_at,response_key_id,response_nonce,response_ciphertext,response_tag
    ) VALUES($1,$2,$3,$4,'completed',$5,$5,$6,$5,$7,$8,$9,$10)`, [
      ownerId, idempotencyKeyHash, requestFingerprint, response.publication.mode, completedAt, expiresAt,
      encrypted.responseKeyId, encrypted.responseNonce, encrypted.responseCiphertext, encrypted.responseTag,
    ]);
    await client.query("ALTER TABLE music_publication_operations ENABLE ALWAYS TRIGGER music_publication_operation_immutability");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function removePublicationOperationFixture(ownerId: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("ALTER TABLE music_publication_operations DISABLE TRIGGER music_publication_operation_immutability");
    await client.query("DELETE FROM music_publication_operations WHERE music_user_id=$1", [ownerId]);
    await client.query("ALTER TABLE music_publication_operations ENABLE ALWAYS TRIGGER music_publication_operation_immutability");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function identityInput(suffix: string): EnsureMusicIdentityInput {
  return {
    userDocumentId: `c9-publication-user-${suffix}`,
    accountDocumentId: `c9-publication-account-${suffix}`,
    username: `c9-publication-${suffix}`,
    email: `c9-publication-${suffix}@example.invalid`,
    provider: "local",
    accountName: `C9 publication ${suffix}`,
    accountType: "Venue",
    accountMobile: "+15555550100",
    internalUsername: `c9-publication-internal-${suffix}`,
    password: `disabled-${suffix}`,
    guestUrl: `c9-publication-public-${suffix}`,
    guestCapabilityHash: createHash("sha256").update(`initial-${suffix}`).digest("hex"),
    operationId: `c9-publication-provision-${suffix}`,
    requestId: `c9-publication-request-${suffix}`,
  };
}

describePg("C9 durable publication idempotency on real PostgreSQL 15", () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: exactTarget });
    expect((await admin.query("SHOW server_version")).rows[0].server_version).toMatch(/^15\./);
    await admin.query(`CREATE DATABASE ${databaseName}`);
    const target = new URL(exactTarget);
    target.pathname = `/${databaseName}`;
    pool = new pg.Pool({ connectionString: target.toString(), max: 24 });
    await migrateMusicDatabase(pool);
    await provisionMusicRuntimeLogin(pool, { loginRole: runtimeUser, password: runtimePassword });
    const runtimeTarget = new URL(target);
    runtimeTarget.username = runtimeUser;
    runtimeTarget.password = runtimePassword;
    runtimePool = new pg.Pool({ connectionString: runtimeTarget.toString(), max: 4 });
    expect((await runtimePool.query("SELECT current_user,pg_has_role(current_user,'music_runtime','member') AS member")).rows[0])
      .toEqual({ current_user: runtimeUser, member: true });
    databaseNow = new Date((await pool.query("SELECT clock_timestamp() AS value")).rows[0].value).getTime();
    identities = new MusicIdentityRepository(pool);
  });

  afterAll(async () => {
    await runtimePool?.end();
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin?.query(`DROP ROLE IF EXISTS ${runtimeUser}`);
    await admin?.end();
  });

  it("includes a canonical public publication command in sitemap discovery", async () => {
    // Break caught: public mode revokes an unlisted capability and the sitemap mistakes that independent axis for non-discoverability.
    const owner = await identities.ensureIdentity(identityInput("sitemap-command"));
    const domain = new MusicDomainRepository(pool, repository());
    const playlist = await domain.createPlaylist(owner.id, { name: "Sitemap", description: null }) as { id: number };
    await expect(domain.setPlaylistVisibility(owner.id, playlist.id, true)).resolves.toBe(true);

    await expect(domain.executePublicationCommand(owner.id, publicationKey("sitemap-public-command"), "public"))
      .resolves.toMatchObject({ status: "completed", replayed: false });
    await expect(domain.listPublishedMusicPlaylists()).resolves.toContainEqual({
      guestUrl: "c9-publication-public-sitemap-command",
      updatedAt: expect.any(Date),
    });
  });

  it("replays one exact capability across concurrent instances, restart, eviction, and a lost response", async () => {
    clock = baseTime;
    const owner = await identities.ensureIdentity(identityInput("same"));
    const transactionRoles: string[] = [];
    const roleAuditedPool = {
      query: pool.query.bind(pool),
      async connect() {
        const client = await pool.connect();
        return {
          async query(text: string, values: unknown[] = []) {
            const result = await client.query(text, values);
            if (text === "BEGIN") {
              await client.query("SET LOCAL ROLE music_runtime");
              transactionRoles.push((await client.query<{ role: string }>("SELECT current_user AS role")).rows[0].role);
            }
            return result;
          },
          release: () => client.release(),
        };
      },
    };
    const instanceA = repository(cipher(), {}, roleAuditedPool as never);
    const instanceB = repository(cipher(), {}, roleAuditedPool as never);
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) =>
      (index % 2 ? instanceA : instanceB).execute(owner.id, publicationKey("same-operation-key"), "unlisted")));
    expect(results.every((result) => result.status === "completed")).toBe(true);
    expect(transactionRoles).toHaveLength(20);
    expect(new Set(transactionRoles)).toEqual(new Set(["music_runtime"]));
    const responses = results.map((result) => result.status === "completed" ? result.response : undefined);
    expect(new Set(responses.map((response) => JSON.stringify(response))).size).toBe(1);
    const response = responses[0]!;
    expect(response.capability).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await pool.query("SELECT count(*)::int AS count FROM music_publication_operations WHERE music_user_id=$1", [owner.id])).rows[0].count).toBe(1);
    expect((await pool.query("SELECT guest_capability_hash FROM users WHERE id=$1", [owner.id])).rows[0].guest_capability_hash)
      .toBe(hashGuestCapability(response.capability!));

    // The first response is deliberately discarded to model a connection loss after COMMIT.
    await instanceA.execute(owner.id, publicationKey("lost-response-key"), "unlisted");
    const afterRestart = repository();
    expect(await afterRestart.execute(owner.id, publicationKey("same-operation-key"), "unlisted")).toMatchObject({
      status: "completed", replayed: true, response,
    });
    const recovered = await afterRestart.execute(owner.id, publicationKey("lost-response-key"), "unlisted");
    expect(recovered).toMatchObject({ status: "completed", replayed: true });
    expect((await pool.query("SELECT count(*)::int AS count FROM music_publication_operations WHERE music_user_id=$1", [owner.id])).rows[0].count).toBe(2);
  });

  it.each([
    ["backward", -172_800_000],
    ["forward", 172_800_000],
  ] as const)("ignores a %s-skewed application clock and persists one exact database-owned 24-hour window", async (suffix, skew) => {
    clock = databaseNow + skew;
    const owner = await identities.ensureIdentity(identityInput(`database-clock-${suffix}`));
    const before = new Date((await pool.query("SELECT clock_timestamp() AS value")).rows[0].value).getTime();
    await expect(repository().execute(owner.id, publicationKey(`database-clock-${suffix}-key`), "unlisted"))
      .resolves.toMatchObject({ status: "completed", replayed: false });
    const after = new Date((await pool.query("SELECT clock_timestamp() AS value")).rows[0].value).getTime();
    const row = (await pool.query(`SELECT operation.created_at,operation.completed_at,operation.expires_at,
        operation.updated_at,operation.operation_state,
        owner.guest_capability_rotated_at=operation.completed_at AS owner_timestamp_matches
      FROM music_publication_operations operation JOIN users owner ON owner.id=operation.music_user_id
      WHERE operation.music_user_id=$1`, [owner.id])).rows[0];
    const completedAt = new Date(row.completed_at).getTime();
    expect(completedAt).toBeGreaterThanOrEqual(before);
    expect(completedAt).toBeLessThanOrEqual(after);
    expect(new Date(row.created_at).getTime()).toBe(completedAt);
    expect(new Date(row.updated_at).getTime()).toBe(completedAt);
    expect(new Date(row.expires_at).getTime() - completedAt).toBe(86_400_000);
    expect(row.owner_timestamp_matches).toBe(true);
    expect(await repository().shredExpiredResponses(100)).toBe(0);
    expect((await pool.query("SELECT operation_state FROM music_publication_operations WHERE music_user_id=$1", [owner.id])).rows[0])
      .toEqual({ operation_state: "completed" });
  });

  it("serializes simultaneous different requests for the same key with one winner and no partial exposure", async () => {
    clock = baseTime + 1_000;
    const owner = await identities.ensureIdentity(identityInput("different"));
    const [left, right] = await Promise.all([
      repository().execute(owner.id, publicationKey("competing-operation-key"), "public"),
      repository().execute(owner.id, publicationKey("competing-operation-key"), "private"),
    ]);
    const completed = [left, right].filter((result) => result.status === "completed");
    const conflicts = [left, right].filter((result) => result.status === "conflict");
    expect(completed).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    const winningMode = completed[0].status === "completed" ? completed[0].response.publication.mode : "impossible";
    const row = (await pool.query(
      "SELECT request_mode FROM music_publication_operations WHERE music_user_id=$1 AND idempotency_key_hash IS NOT NULL",
      [owner.id],
    )).rows[0];
    const user = (await pool.query("SELECT guest_discoverable FROM users WHERE id=$1", [owner.id])).rows[0];
    expect(row.request_mode).toBe(winningMode);
    expect(user.guest_discoverable).toBe(winningMode === "public");
  });

  it("admits only one concurrent fresh command at the 100-operation owner quota", async () => {
    const owner = await identities.ensureIdentity(identityInput("quota-race"));
    await pool.query(`INSERT INTO music_publication_operations(
      music_user_id,idempotency_key_hash,request_fingerprint,request_mode,operation_state,
      created_at,completed_at,expires_at,updated_at,response_key_id,response_nonce,response_ciphertext,response_tag
    ) SELECT $1,lpad(to_hex(value),64,'0'),repeat('a',64),'public','completed',
             clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '24 hours',clock_timestamp(),
             'publication-current-v1',decode(repeat('00',12),'hex'),decode('01','hex'),decode(repeat('00',16),'hex')
        FROM generate_series(1,99) AS value`, [owner.id]);

    const [left, right] = await Promise.all([
      repository().execute(owner.id, publicationKey("quota-race-left"), "public"),
      repository().execute(owner.id, publicationKey("quota-race-right"), "public"),
    ]);
    expect([left, right].filter(({ status }) => status === "completed")).toHaveLength(1);
    const limited = [left, right].find(({ status }) => status === "rate_limited");
    expect(limited).toMatchObject({ status: "rate_limited", retryAfterSeconds: expect.any(Number) });
    expect((await pool.query(
      "SELECT count(*)::int AS count FROM music_publication_operations WHERE music_user_id=$1 AND expires_at>clock_timestamp()",
      [owner.id],
    )).rows[0]).toEqual({ count: 100 });
  });

  it.each(["publication", "operation"] as const)("rolls back a real failure after the %s write", async (phase) => {
    clock = baseTime + (phase === "publication" ? 2_000 : 3_000);
    const owner = await identities.ensureIdentity(identityInput(`rollback-${phase}`));
    const before = (await pool.query(
      "SELECT guest_discoverable,guest_capability_hash,guest_capability_revoked_at FROM users WHERE id=$1",
      [owner.id],
    )).rows[0];
    const failing = repository(cipher(), {
      afterWrite: (completed) => { if (completed === phase) throw new Error(`real ${phase} failure`); },
    });
    await expect(failing.execute(owner.id, publicationKey(`rollback-${phase}-key`), "unlisted")).rejects.toThrow(`real ${phase} failure`);
    expect((await pool.query(
      "SELECT guest_discoverable,guest_capability_hash,guest_capability_revoked_at FROM users WHERE id=$1",
      [owner.id],
    )).rows[0]).toEqual(before);
    expect((await pool.query("SELECT count(*)::int AS count FROM music_publication_operations WHERE music_user_id=$1", [owner.id])).rows[0].count).toBe(0);
  });

  it("retires an expired key through retention, then purges it through the real runtime login", async () => {
    clock = baseTime + 4_000;
    const owner = await identities.ensureIdentity(identityInput("expired"));
    const durable = repository();
    const capability = "E".repeat(43);
    await pool.query(`UPDATE users SET guest_discoverable=false,guest_capability_hash=$2,
      guest_capability_rotated_at=clock_timestamp(),guest_capability_revoked_at=NULL WHERE id=$1`, [owner.id, hashGuestCapability(capability)]);
    const response = { version: "music-publication/v1" as const,
      publication: { mode: "unlisted" as const, publicSlug: `c9-publication-public-expired` }, capability };
    const expiredOperationKey = publicationKey("expired-operation-key");
    await insertExpiredOperation(owner.id, expiredOperationKey, response);
    const publicationBefore = (await pool.query(
      "SELECT guest_discoverable,guest_capability_hash,guest_capability_rotated_at,guest_capability_revoked_at FROM users WHERE id=$1",
      [owner.id],
    )).rows[0];
    expect(await repository().execute(owner.id, expiredOperationKey, "unlisted")).toEqual({ status: "expired" });
    expect(await repository().execute(owner.id, expiredOperationKey, "public")).toEqual({ status: "conflict" });
    expect((await pool.query(
      "SELECT guest_discoverable,guest_capability_hash,guest_capability_rotated_at,guest_capability_revoked_at FROM users WHERE id=$1",
      [owner.id],
    )).rows[0]).toEqual(publicationBefore);
    expect((await pool.query(
      `SELECT operation_state,response_key_id,response_nonce,response_ciphertext,response_tag,shredded_at IS NOT NULL AS shredded
         FROM music_publication_operations WHERE music_user_id=$1`,
      [owner.id],
    )).rows[0]).toEqual({
      operation_state: "replay_expired", response_key_id: null, response_nonce: null,
      response_ciphertext: null, response_tag: null, shredded: true,
    });
    const runtimeDurable = repository(cipher(), {}, runtimePool);
    expect(await runtimeDurable.compactExpiredOperations(1_000)).toBeGreaterThanOrEqual(1);
    expect((await pool.query(
      "SELECT count(*)::int AS count FROM music_publication_operations WHERE music_user_id=$1",
      [owner.id],
    )).rows[0]).toEqual({ count: 0 });
    expect((await pool.query(
      "SELECT request_mode FROM music_publication_operation_archive WHERE music_user_id=$1",
      [owner.id],
    )).rows[0]).toEqual({ request_mode: "unlisted" });
    expect(await repository().execute(owner.id, expiredOperationKey, "unlisted")).toEqual({ status: "expired" });
    expect(await repository().execute(owner.id, expiredOperationKey, "public")).toEqual({ status: "conflict" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("ALTER TABLE music_publication_operation_archive DISABLE TRIGGER music_publication_operation_archive_immutability");
      await client.query(`WITH authority_clock AS (SELECT clock_timestamp() AS value)
        UPDATE music_publication_operation_archive
        SET completed_at=authority_clock.value-interval '32 days',
            expires_at=authority_clock.value-interval '31 days',
            archived_at=authority_clock.value-interval '30 days 1 second'
        FROM authority_clock WHERE music_user_id=$1`, [owner.id]);
      await client.query("ALTER TABLE music_publication_operation_archive ENABLE ALWAYS TRIGGER music_publication_operation_archive_immutability");
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    const queuedOwner = await identities.ensureIdentity(identityInput("mixed-compaction-limit"));
    const queuedKey = publicationKey("mixed-compaction-limit");
    const queuedResponse = { version: "music-publication/v1" as const,
      publication: { mode: "public" as const, publicSlug: "c9-publication-public-mixed-compaction-limit" } };
    await insertExpiredOperation(queuedOwner.id, queuedKey, queuedResponse);
    expect(await repository().execute(queuedOwner.id, queuedKey, "public")).toEqual({ status: "expired" });

    // Break caught: the archive purge and live compaction each consumed p_limit,
    // so the function returned 2*p_limit after committing and the repository failed.
    expect(await runtimeDurable.compactExpiredOperations(1)).toBe(1);
    expect((await pool.query(
      "SELECT count(*)::int AS count FROM music_publication_operation_archive WHERE music_user_id=$1",
      [owner.id],
    )).rows[0]).toEqual({ count: 0 });
    expect(await runtimeDurable.compactExpiredOperations(1)).toBe(1);
    expect((await pool.query(
      "SELECT count(*)::int AS count FROM music_publication_operations WHERE music_user_id=$1",
      [queuedOwner.id],
    )).rows[0]).toEqual({ count: 0 });

    const retiredKey = publicationKey("purged-retired-key", databaseNow - 31 * 24 * 60 * 60 * 1_000);
    const publicationAfterPurge = (await pool.query(
      "SELECT guest_discoverable,guest_capability_hash,guest_capability_rotated_at,guest_capability_revoked_at FROM users WHERE id=$1",
      [owner.id],
    )).rows[0];
    expect(await repository().execute(owner.id, retiredKey, "public")).toEqual({ status: "expired" });
    expect((await pool.query(
      "SELECT guest_discoverable,guest_capability_hash,guest_capability_rotated_at,guest_capability_revoked_at FROM users WHERE id=$1",
      [owner.id],
    )).rows[0]).toEqual(publicationAfterPurge);
  });

  it("indexes the replay-expired compaction queue and archive retention queue", async () => {
    const indexes = (await pool.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname,indexdef FROM pg_indexes
        WHERE schemaname='public' AND indexname IN (
          'music_publication_operations_compaction_idx',
          'music_publication_operation_archive_retention_idx'
        ) ORDER BY indexname`,
    )).rows;
    expect(indexes).toHaveLength(2);
    expect(indexes[0]?.indexdef).toMatch(/archived_at/i);
    expect(indexes[1]?.indexdef).toMatch(/expires_at/i);
    expect(indexes[1]?.indexdef).toMatch(/operation_state[\s\S]*replay_expired/i);
  });

  it("compares a previous-key deadline to the exact PostgreSQL microsecond expiry", async () => {
    const submillisecondKey = { kid: "publication-submillisecond-v1", key: Buffer.alloc(32, 0x63) };
    const owner = await identities.ensureIdentity(identityInput("readiness-microseconds"));
    await expect(repository(cipher(submillisecondKey)).execute(owner.id, publicationKey("microsecond-operation-key"), "public"))
      .resolves.toMatchObject({ status: "completed", replayed: false });
    const client = await pool.connect();
    let expiry: { expiry_text: string; deadline_ms: string };
    try {
      await client.query("BEGIN");
      await client.query("ALTER TABLE music_publication_operations DISABLE TRIGGER music_publication_operation_immutability");
      expiry = (await client.query<{ expiry_text: string; deadline_ms: string }>(
        `WITH exact_expiry AS (
           SELECT date_trunc('second',clock_timestamp())+interval '1 hour'+interval '0.123999 seconds' AS value
         )
         UPDATE music_publication_operations operation
            SET expires_at=exact_expiry.value,
                created_at=exact_expiry.value-interval '24 hours',
                completed_at=exact_expiry.value-interval '24 hours',
                updated_at=exact_expiry.value-interval '24 hours'
           FROM exact_expiry
          WHERE music_user_id=$1
          RETURNING expires_at::text AS expiry_text,
                    floor(extract(epoch FROM expires_at)*1000)::bigint AS deadline_ms`,
        [owner.id],
      )).rows[0];
      await client.query("ALTER TABLE music_publication_operations ENABLE ALWAYS TRIGGER music_publication_operation_immutability");
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    try {
      expect(expiry.expiry_text).toMatch(/\.123999\+00$/);
      const truncatedDeadline = Number(expiry.deadline_ms);
      clock = truncatedDeadline - 1;
      await expect(repository(cipher(currentKey, { ...submillisecondKey, acceptUntil: truncatedDeadline }))
        .verifyReplayReadiness()).rejects.toThrow(/publication replay key readiness/i);
      await expect(repository(cipher(currentKey, { ...submillisecondKey, acceptUntil: truncatedDeadline + 1 }))
        .verifyReplayReadiness()).resolves.toBeUndefined();
    } finally {
      await removePublicationOperationFixture(owner.id);
    }
  });

  it("rotates response keys safely and fails readiness without the needed prior authority or deadline", async () => {
    clock = baseTime + 5_000;
    const owner = await identities.ensureIdentity(identityInput("rotation"));
    const oldWriter = repository(cipher(previousKey));
    const original = await oldWriter.execute(owner.id, publicationKey("old-key-operation"), "unlisted");
    expect(original.status).toBe("completed");
    const acceptUntil = Number((await pool.query(
      `SELECT ceil(date_part('epoch',expires_at)*1000)::bigint AS deadline_ms
         FROM music_publication_operations WHERE music_user_id=$1`,
      [owner.id],
    )).rows[0].deadline_ms);
    const rotated = repository(cipher(currentKey, { ...previousKey, acceptUntil }));
    await expect(rotated.verifyReplayReadiness()).resolves.toBeUndefined();
    expect(await rotated.execute(owner.id, publicationKey("old-key-operation"), "unlisted")).toMatchObject({ status: "completed", replayed: true });
    await rotated.execute(owner.id, publicationKey("new-key-operation"), "private");
    expect((await pool.query(
      "SELECT request_mode,response_key_id FROM music_publication_operations WHERE music_user_id=$1 ORDER BY request_mode",
      [owner.id],
    )).rows).toEqual([
      { request_mode: "private", response_key_id: currentKey.kid },
      { request_mode: "unlisted", response_key_id: previousKey.kid },
    ]);
    await expect(repository(cipher(currentKey)).verifyReplayReadiness()).rejects.toThrow(/publication replay key readiness/i);
    await expect(repository(cipher(currentKey, { ...previousKey, acceptUntil: clock + 60_000 })).verifyReplayReadiness())
      .rejects.toThrow(/publication replay key readiness/i);
  });

  it("bounds cleanup, preserves the operation after canonical owner deletion, and stores no plaintext capability", async () => {
    clock = baseTime + 6_000;
    const owner = await identities.ensureIdentity(identityInput("tombstone"));
    const durable = repository();
    const capability = "T".repeat(43);
    await insertExpiredOperation(owner.id, "tombstone-operation-key", {
      version: "music-publication/v1", publication: { mode: "unlisted", publicSlug: "c9-publication-public-tombstone" }, capability,
    });
    const operationBefore = (await pool.query(
      "SELECT encode(response_ciphertext,'hex') AS ciphertext,idempotency_key_hash FROM music_publication_operations WHERE music_user_id=$1",
      [owner.id],
    )).rows[0];
    expect(operationBefore.ciphertext).not.toContain(Buffer.from(capability).toString("hex"));
    expect(operationBefore.idempotency_key_hash).not.toBe("tombstone-operation-key");

    await identities.prepareDeletion({
      userDocumentId: "c9-publication-user-tombstone",
      accountDocumentId: "c9-publication-account-tombstone",
      operationId: "c9-publication-delete-tombstone",
    });
    await identities.markDeletionBoundary({
      userDocumentId: "c9-publication-user-tombstone",
      accountDocumentId: "c9-publication-account-tombstone",
    });
    const lifecycleClient = await pool.connect();
    try {
      await lifecycleClient.query("BEGIN");
      await lifecycleClient.query("ALTER TABLE music_identity_lifecycle_operations DISABLE TRIGGER music_lifecycle_operation_state");
      await lifecycleClient.query(
        "UPDATE music_identity_lifecycle_operations SET updated_at=clock_timestamp()-interval '2 seconds' WHERE operation_id=$1",
        ["c9-publication-delete-tombstone"],
      );
      await lifecycleClient.query("ALTER TABLE music_identity_lifecycle_operations ENABLE TRIGGER music_lifecycle_operation_state");
      await lifecycleClient.query("COMMIT");
    } catch (error) {
      await lifecycleClient.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      lifecycleClient.release();
    }
    const claim = (await identities.claimDueDeletions({ batchSize: 1, maxAttempts: 5 }))
      .find(({ operationId }) => operationId === "c9-publication-delete-tombstone");
    expect(claim).toBeDefined();
    await expect(identities.finalizeDeletion(claim!)).resolves.toBe(true);
    expect((await pool.query("SELECT count(*)::int AS count FROM users WHERE id=$1", [owner.id])).rows[0].count).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS count FROM music_publication_operations WHERE music_user_id=$1", [owner.id])).rows[0].count).toBe(1);

    expect(await durable.shredExpiredResponses(100)).toBeGreaterThanOrEqual(1);
    expect((await pool.query(
      "SELECT operation_state,response_ciphertext FROM music_publication_operations WHERE music_user_id=$1",
      [owner.id],
    )).rows[0]).toEqual({ operation_state: "replay_expired", response_ciphertext: null });
  });

  it("enforces runtime least privilege and immutable operation identity", async () => {
    const privileges = (await pool.query(`SELECT
      has_table_privilege('music_runtime','music_publication_operations','SELECT') AS can_select,
      has_table_privilege('music_runtime','music_publication_operations','INSERT') AS can_insert,
      has_table_privilege('music_runtime','music_publication_operations','UPDATE') AS can_update,
      has_table_privilege('music_runtime','music_publication_operations','DELETE') AS can_delete,
      has_table_privilege('music_runtime','music_publication_operations','TRUNCATE') AS can_truncate`)).rows[0];
    expect(privileges).toEqual({ can_select: true, can_insert: true, can_update: true, can_delete: false, can_truncate: false });
    const archivePrivileges = (await pool.query(`SELECT
      has_table_privilege('music_runtime','music_publication_operation_archive','SELECT') AS can_select_archive,
      has_table_privilege('music_runtime','music_publication_operation_archive','INSERT') AS can_insert_archive,
      has_table_privilege('music_runtime','music_publication_operation_archive','UPDATE') AS can_update_archive,
      has_table_privilege('music_runtime','music_publication_operation_archive','DELETE') AS can_delete_archive,
      has_function_privilege('music_runtime','music_lookup_publication_operation_archive(integer,text)','EXECUTE') AS can_lookup_archive,
      has_function_privilege('music_runtime','music_compact_publication_operations(integer)','EXECUTE') AS can_compact_archive`)).rows[0];
    expect(archivePrivileges).toEqual({
      can_select_archive: false,
      can_insert_archive: false,
      can_update_archive: false,
      can_delete_archive: false,
      can_lookup_archive: true,
      can_compact_archive: true,
    });
    const row = (await pool.query("SELECT music_user_id,idempotency_key_hash FROM music_publication_operations LIMIT 1")).rows[0];
    await expect(pool.query(
      "UPDATE music_publication_operations SET request_mode=CASE request_mode WHEN 'public' THEN 'private' ELSE 'public' END WHERE music_user_id=$1 AND idempotency_key_hash=$2",
      [row.music_user_id, row.idempotency_key_hash],
    )).rejects.toThrow(/publication operation identity is immutable/i);
    await expect(pool.query(
      "DELETE FROM music_publication_operations WHERE music_user_id=$1 AND idempotency_key_hash=$2",
      [row.music_user_id, row.idempotency_key_hash],
    )).rejects.toThrow(/publication operation (?:identity|history) is immutable/i);
  });

  it("replaces hostile runtime insert timestamps with one transaction clock and rolls the insert back atomically", async () => {
    const client = await pool.connect();
    const insert = (owner: number, hashByte: string) => client.query(`INSERT INTO music_publication_operations(
      music_user_id,idempotency_key_hash,request_fingerprint,request_mode,operation_state,
      created_at,completed_at,expires_at,updated_at,response_key_id,response_nonce,response_ciphertext,response_tag
    ) VALUES($1,$2,$3,'public','completed',timestamp with time zone '2000-01-01T00:00:00Z',
      timestamp with time zone '2000-01-02T00:00:00Z',timestamp with time zone '2000-01-03T00:00:00Z',
      timestamp with time zone '2000-01-04T00:00:00Z','publication-current-v1',decode(repeat('00',12),'hex'),
      decode('01','hex'),decode(repeat('00',16),'hex'))`, [owner, hashByte.repeat(64), "e".repeat(64)]);
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE music_runtime");
      const transactionTime = new Date((await client.query("SELECT transaction_timestamp() AS value")).rows[0].value).getTime();
      await insert(900_000, "9");
      await client.query("COMMIT");
      const stored = (await pool.query(`SELECT created_at,completed_at,expires_at,updated_at
        FROM music_publication_operations WHERE music_user_id=900000`)).rows[0];
      expect(new Date(stored.created_at).getTime()).toBe(transactionTime);
      expect(new Date(stored.completed_at).getTime()).toBe(transactionTime);
      expect(new Date(stored.updated_at).getTime()).toBe(transactionTime);
      expect(new Date(stored.expires_at).getTime() - transactionTime).toBe(86_400_000);

      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE music_runtime");
      await insert(900_005, "8");
      await client.query("ROLLBACK");
      expect((await pool.query("SELECT count(*)::int AS count FROM music_publication_operations WHERE music_user_id=900005")).rows[0].count)
        .toBe(0);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("lets runtime shred only at database-clock expiry and preserves transaction rollback", async () => {
    const client = await pool.connect();
    const seedHistorical = async (owner: number, hashByte: string, expiry: "before" | "at" | "after") => {
      const delta = expiry === "before" ? "interval '1 hour'" : expiry === "after" ? "-interval '1 hour'" : "interval '0 seconds'";
      await client.query("BEGIN");
      await client.query("ALTER TABLE music_publication_operations DISABLE TRIGGER music_publication_operation_immutability");
      await client.query(`WITH authority_clock AS (SELECT clock_timestamp() + ${delta} AS expires_at)
        INSERT INTO music_publication_operations(
          music_user_id,idempotency_key_hash,request_fingerprint,request_mode,operation_state,
          created_at,completed_at,expires_at,updated_at,response_key_id,response_nonce,response_ciphertext,response_tag
        ) SELECT $1,$2,$3,'public','completed',expires_at-interval '24 hours',expires_at-interval '24 hours',
                 expires_at,expires_at-interval '24 hours','publication-current-v1',decode(repeat('00',12),'hex'),decode('01','hex'),decode(repeat('00',16),'hex')
            FROM authority_clock`, [owner, hashByte.repeat(64), "f".repeat(64)]);
      await client.query("ALTER TABLE music_publication_operations ENABLE ALWAYS TRIGGER music_publication_operation_immutability");
      await client.query("COMMIT");
    };
    const shred = (owner: number) => client.query(`UPDATE music_publication_operations
      SET operation_state='replay_expired',updated_at=clock_timestamp(),shredded_at=clock_timestamp(),
          response_key_id=NULL,response_nonce=NULL,response_ciphertext=NULL,response_tag=NULL
      WHERE music_user_id=$1`, [owner]);
    try {
      await seedHistorical(900_001, "a", "before");
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE music_runtime");
      await expect(shred(900_001)).rejects.toThrow(/before response expiry/i);
      await client.query("ROLLBACK");
      expect((await pool.query("SELECT operation_state FROM music_publication_operations WHERE music_user_id=900001")).rows[0])
        .toEqual({ operation_state: "completed" });

      for (const [owner, hashByte, expiry] of [[900_002, "b", "at"], [900_003, "c", "after"]] as const) {
        await seedHistorical(owner, hashByte, expiry);
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE music_runtime");
        await expect(shred(owner)).resolves.toMatchObject({ rowCount: 1 });
        await client.query("COMMIT");
      }

      await seedHistorical(900_004, "d", "after");
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE music_runtime");
      await shred(900_004);
      await client.query("ROLLBACK");
      expect((await pool.query("SELECT operation_state FROM music_publication_operations WHERE music_user_id=900004")).rows[0])
        .toEqual({ operation_state: "completed" });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });
});
