import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import request from "supertest";
import pg from "pg";
import { createValidatedApp as createApp } from "../../config/music-startup";
import { MusicIdentityRepository } from "../../repositories/musicIdentityRepository";
import type { Pool } from "pg";
import { prepareProtectedRuntimeTestAuthority, releaseProtectedRuntimeTestAuthority } from "../protected-runtime-test-authority";

let pool: Pool;
let authorityPool: Pool;
let storage: typeof import("../../storage")["storage"];

const runIntegration = process.env.MUSIC_C3_POSTGRES_TEST === "1";
const describePostgres = runIntegration ? describe.sequential : describe.skip;
const suffix = `runtime_${process.pid}_${Date.now()}`;
const rawTables = [
  "youtube_music_playlists", "youtube_music", "youtube_tokens", "youtube_playlists",
  "widgets", "youtube_api_calls", "playback_states",
] as const;

describePostgres("C3 real migrated runtime graph", () => {
  let app: Awaited<ReturnType<typeof createApp>>["app"];
  let server: Awaited<ReturnType<typeof createApp>>["server"];
  let userId: number;
  let strapi: HttpServer;
  const ensurePerson = `${suffix}_ensure_person`;

  beforeAll(async () => {
    process.env.STRAPI_JWT_SECRET = "runtime-strapi-jwt-secret-at-least-thirty-two-bytes";
    process.env.ALLOWED_ORIGINS = "https://explorers.example.test";
    process.env.MUSIC_NEW_ENTRY_KILL_SWITCH = "false";
    process.env.MUSIC_COHORT_ENABLED = "false";
    strapi = createServer((incoming, response) => {
      response.setHeader("content-type", "application/json");
      if (incoming.url === "/api/users/me") return response.end(JSON.stringify({
        documentId: ensurePerson, username: `${suffix}_ensure`, email: `${suffix}_ensure@example.invalid`,
        provider: "local", confirmed: true, blocked: false,
      }));
      if (incoming.url?.startsWith("/api/accounts?")) return response.end(JSON.stringify({
        data: [{
          documentId: `${suffix}_ensure_account`, Account_Name: "Runtime Ensure", Account_Type: "Venue", mobile_number: "+15555550123",
        }],
        meta: { pagination: { page: 1, pageSize: 50, pageCount: 1, total: 1 } },
      }));
      response.statusCode = 404;
      return response.end(JSON.stringify({ error: "not found" }));
    }).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => strapi.once("listening", resolve));
    const address = strapi.address();
    if (!address || typeof address === "string") throw new Error("runtime Strapi did not bind");
    process.env.STRAPI_URL = `http://127.0.0.1:${address.port}`;
    process.env.MUSIC_FIXTURE_STRAPI_ORIGIN = process.env.STRAPI_URL;
    process.env.MUSIC_STRAPI_HOST_PORT = String(address.port);
    process.env.STRAPI_FIXTURE_URL = process.env.STRAPI_URL;
    authorityPool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 1 });
    const startupDependencies = await prepareProtectedRuntimeTestAuthority();
    ({ app, server } = await createApp(process.env, startupDependencies));
    ({ pool } = await import("../../db"));
    ({ storage } = await import("../../storage"));
    const identity = await new MusicIdentityRepository(pool).createIdentity({
      username: suffix,
      password: "disabled-native-password",
      guestUrl: `${suffix}_guest`,
      venueName: "Runtime Venue",
      strapiUserDocumentId: `${suffix}_person`,
      strapiAccountDocumentId: `${suffix}_account`,
      guestCapabilityHash: "9".repeat(64),
      operationId: `${suffix}_provision`,
    });
    userId = identity.id;
  });

  afterAll(async () => {
    server?.close();
    strapi?.close();
    await authorityPool?.query("DROP TRIGGER IF EXISTS runtime_delete_failure ON playback_states").catch(() => undefined);
    await authorityPool?.query("DROP FUNCTION IF EXISTS runtime_fail_delete()").catch(() => undefined);
    await authorityPool?.query("DELETE FROM users WHERE id=$1", [userId]).catch(() => undefined);
    await authorityPool?.query("DELETE FROM users WHERE strapi_user_document_id=$1", [ensurePerson]).catch(() => undefined);
    await authorityPool?.end().catch(() => undefined);
    await releaseProtectedRuntimeTestAuthority();
  });

  it("runs the sole bodyless ensure through the real route graph and keeps legacy boundaries tombstoned", async () => {
    const authorization = "Bearer runtime-proof-with-enough-entropy";
    const first = await request(app).post("/api/music/identity/ensure").set("authorization", authorization).expect(200);
    const second = await request(app).post("/api/music/identity/ensure").set("authorization", authorization).expect(200);
    expect(second.body).toMatchObject({
      version: first.body.version,
      identity: first.body.identity,
    });
    expect(second.body.credential.expiresAt).toBeGreaterThanOrEqual(first.body.credential.expiresAt);
    expect(second.body.credential.expiresAt).toBeLessThanOrEqual(first.body.credential.expiresAt + 5_000);
    expect(second.body.credential.token).not.toBe(first.body.credential.token);
    expect(first.body).toMatchObject({ version: "music-identity/v1", identity: { status: "active" } });
    expect(Number((await pool.query("SELECT count(*) AS count FROM users WHERE strapi_user_document_id=$1", [ensurePerson])).rows[0].count)).toBe(1);
    await request(app).post("/api/music/identity/ensure").set("authorization", authorization).send({ username: "forged" }).expect(400);
    await request(app).post("/api/auth/sync").send({ username: "forged" }).expect(410);
    await request(app).post("/api/register").send({ username: "forged" }).expect(410);
    await request(app).post("/graphql").send({ query: "mutation { deleteUsers { documentId } }" }).expect(410);
  });

  it("boots the real route graph and returns controlled identity tombstones without inserts or schema errors", async () => {
    const forgedNames = [`${suffix}_native`, `${suffix}_forged`];
    const before = Number((await pool.query("SELECT count(*) AS count FROM users WHERE username=ANY($1::text[])", [forgedNames])).rows[0].count);
    for (const body of [
      { username: `${suffix}_native`, password: "native-password" },
      {
        username: `${suffix}_forged`, password: "native-password",
        strapiUserDocumentId: "forged-person", strapiAccountDocumentId: "forged-account",
        lifecycleOperationId: "forged-operation", guestCapabilityHash: "a".repeat(64),
      },
    ]) {
      const response = await request(app).post("/api/register").send(body);
      expect(response.status).toBe(410);
      expect(response.body.error?.code).toBe("LEGACY_IDENTITY_ROUTE_REMOVED");
      expect(JSON.stringify(response.body)).not.toMatch(/relation .* does not exist|column .* does not exist|null value in column/i);
    }
    await request(app).post("/graphql").send({ query: "mutation { deleteUsers { documentId } }" })
      .expect(410).expect(({ body }) => expect(body.error?.code).toBe("SURFACE_REMOVED"));
    await request(app).post("/api/auth/sync").send({ strapiUser: { username: "forged" } })
      .expect(410).expect(({ body }) => expect(body.error?.code).toBe("SURFACE_REMOVED"));
    const after = Number((await pool.query("SELECT count(*) AS count FROM users WHERE username=ANY($1::text[])", [forgedNames])).rows[0].count);
    expect(after).toBe(before);
  });

  it("executes queue, playlist, session, SEO, page, email, admin, and settings storage against the migrated schema", async () => {
    const queueInput = (index: number) => ({
      youtubeId: `${suffix}_video_${index}`, title: `Song ${index}`, artist: "Artist",
      thumbnailUrl: "https://example.test/thumbnail.jpg", position: 999,
    });
    const first = await storage.addSong(userId, queueInput(1));
    const second = await storage.addSong(userId, queueInput(2));
    await storage.updateSongPosition(userId, second.id, 0);
    expect((await storage.getSongs(userId)).map(({ id, position }) => [id, position])).toEqual([[second.id, 0], [first.id, 1]]);

    const playlist = await storage.createPlaylist(userId, { name: `${suffix}_playlist`, description: "Runtime", isVisibleToGuests: true });
    await storage.addSongsToPlaylist(playlist.id, [queueInput(3), queueInput(4)]);
    expect((await storage.getPlaylistSongs(playlist.id)).map(({ youtubeId, position }) => [youtubeId, position]))
      .toEqual([[`${suffix}_video_3`, 0], [`${suffix}_video_4`, 1]]);

    await storage.createUserSession(userId, `${suffix}_session`, "127.0.0.1", { family: "runtime" });
    expect(await storage.getUserSessions(userId)).toHaveLength(1);

    const page = await storage.createPageContent({ slug: `${suffix}_page`, title: "Runtime", content: "<p>ready</p>", createdBy: userId, isPublished: true });
    expect((await storage.getPageContentBySlug(page.slug))?.id).toBe(page.id);
    const seo = await storage.updateSeoSettings({ siteTitle: `${suffix} SEO`, updatedBy: userId });
    expect((await storage.getSeoSettings())?.id).toBe(seo.id);
    const template = await storage.createEmailTemplate({
      name: `${suffix}_template`, subject: "Runtime", html_content: "<p>ready</p>", text_content: "ready",
      variables: {}, createdBy: userId, isActive: true,
    });
    const email = await storage.createEmailLog({ recipient: `${suffix}@example.test`, subject: "Runtime", status: "sent", templateId: template.id } as never);
    expect((await storage.getEmailLogsByRecipient(`${suffix}@example.test`)).logs.map(({ id }) => id)).toContain(email.id);
    const setting = await storage.createSystemSetting({ key: `${suffix}_setting`, value: "ready", category: "runtime", isSecret: false, updatedBy: userId });
    expect((await storage.getSystemSetting(setting.key))?.value).toBe("ready");
    const admin = await storage.getAllUsers(1, 1000);
    expect(admin.users.some(({ id }) => id === userId)).toBe(true);
  });

  it("rolls back all seven raw-only deletes on failure, then deletes/cascades them atomically", async () => {
    for (const table of rawTables) await pool.query(`INSERT INTO ${table}(user_id) VALUES ($1)`, [userId]);
    await authorityPool.query(`CREATE FUNCTION runtime_fail_delete() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'runtime injected delete failure'; END; $$`);
    await authorityPool.query(`CREATE TRIGGER runtime_delete_failure BEFORE DELETE ON playback_states
      FOR EACH ROW EXECUTE FUNCTION runtime_fail_delete()`);

    await expect(storage.deleteUser(userId)).rejects.toThrow("runtime injected delete failure");
    for (const table of rawTables) {
      expect(Number((await pool.query(`SELECT count(*) AS count FROM ${table} WHERE user_id=$1`, [userId])).rows[0].count), table).toBe(1);
    }
    expect(Number((await pool.query("SELECT count(*) AS count FROM users WHERE id=$1", [userId])).rows[0].count)).toBe(1);

    await authorityPool.query("DROP TRIGGER runtime_delete_failure ON playback_states");
    await authorityPool.query("DROP FUNCTION runtime_fail_delete()");
    const activeDeletion = await storage.deleteUser(userId);
    expect(activeDeletion.operationId).toMatch(/^storage-delete:[a-f0-9]{64}$/);
    for (const table of rawTables) {
      expect(Number((await pool.query(`SELECT count(*) AS count FROM ${table} WHERE user_id=$1`, [userId])).rows[0].count), table).toBe(0);
    }
    expect(Number((await pool.query("SELECT count(*) AS count FROM users WHERE id=$1", [userId])).rows[0].count)).toBe(0);
    const activeTombstone = (await pool.query(`SELECT lifecycle_operation_id FROM music_identity_tombstones
      WHERE strapi_user_document_id=$1`, [`${suffix}_person`])).rows[0];
    expect(activeTombstone.lifecycle_operation_id).toBe(activeDeletion.operationId);
    expect((await pool.query(`SELECT operation_phase FROM music_identity_lifecycle_operations
      WHERE operation_id=$1`, [activeDeletion.operationId])).rows[0].operation_phase).toBe("finalized");
  });

  it("finalizes and retries one prepared storage deletion saga without partial cleanup on conflict", async () => {
    const identity = await new MusicIdentityRepository(pool).createIdentity({
      username: `${suffix}_saga`, password: "disabled", guestUrl: `${suffix}_saga_guest`, venueName: "Saga Venue",
      strapiUserDocumentId: `${suffix}_saga_person`, strapiAccountDocumentId: `${suffix}_saga_account`,
      guestCapabilityHash: "8".repeat(64), operationId: `${suffix}_saga_provision`,
    });
    for (const table of rawTables) await pool.query(`INSERT INTO ${table}(user_id) VALUES ($1)`, [identity.id]);
    const operationId = `${suffix}_delete_saga`;
    await new MusicIdentityRepository(pool).transitionIdentity({
      strapiUserDocumentId: `${suffix}_saga_person`, operationId, kind: "request_deletion", targetStatus: "pending_deletion",
    });

    await expect(storage.deleteUser(identity.id, `${suffix}_conflict`)).rejects.toMatchObject({ code: "LIFECYCLE_OPERATION_CONFLICT" });
    for (const table of rawTables) {
      expect(Number((await pool.query(`SELECT count(*) AS count FROM ${table} WHERE user_id=$1`, [identity.id])).rows[0].count), table).toBe(1);
    }
    expect(Number((await pool.query("SELECT count(*) AS count FROM users WHERE id=$1", [identity.id])).rows[0].count)).toBe(1);

    await expect(storage.deleteUser(identity.id)).resolves.toMatchObject({ operationId, finalized: true });
    await expect(storage.deleteUser(identity.id, operationId)).resolves.toMatchObject({ operationId, finalized: false });
    const boundHistory = (await pool.query(`SELECT t.music_user_id AS tombstone_user_id,
      o.music_user_id AS operation_user_id
      FROM music_identity_tombstones t
      JOIN music_identity_lifecycle_operations o ON o.operation_id=t.lifecycle_operation_id
      WHERE t.lifecycle_operation_id=$1`, [operationId])).rows[0];
    expect(boundHistory).toEqual({ tombstone_user_id: identity.id, operation_user_id: identity.id });

    const historyBeforeConflict = (await pool.query(`SELECT
      (SELECT count(*)::int FROM music_identity_tombstones) AS tombstones,
      (SELECT count(*)::int FROM music_identity_lifecycle_operations) AS operations`)).rows[0];
    await expect(storage.deleteUser(identity.id + 1_000_000, operationId))
      .rejects.toMatchObject({ code: "LIFECYCLE_OPERATION_CONFLICT" });
    await expect(storage.deleteUser(identity.id, `${operationId}_wrong`))
      .rejects.toMatchObject({ code: "LIFECYCLE_OPERATION_CONFLICT" });
    expect((await pool.query(`SELECT
      (SELECT count(*)::int FROM music_identity_tombstones) AS tombstones,
      (SELECT count(*)::int FROM music_identity_lifecycle_operations) AS operations`)).rows[0]).toEqual(historyBeforeConflict);

    const unrelated = await new MusicIdentityRepository(pool).createIdentity({
      username: `${suffix}_unrelated`, password: "disabled", guestUrl: `${suffix}_unrelated_guest`, venueName: "Unrelated Venue",
      strapiUserDocumentId: `${suffix}_unrelated_person`, strapiAccountDocumentId: `${suffix}_unrelated_account`,
      guestCapabilityHash: "6".repeat(64), operationId: `${suffix}_unrelated_provision`,
    });
    const unrelatedHistoryBefore = (await pool.query(`SELECT
      (SELECT count(*)::int FROM music_identity_tombstones) AS tombstones,
      (SELECT count(*)::int FROM music_identity_lifecycle_operations) AS operations`)).rows[0];
    await expect(storage.deleteUser(unrelated.id, operationId))
      .rejects.toMatchObject({ code: "LIFECYCLE_OPERATION_CONFLICT" });
    expect((await pool.query("SELECT count(*)::int AS count FROM users WHERE id=$1", [unrelated.id])).rows[0].count).toBe(1);
    expect((await pool.query(`SELECT
      (SELECT count(*)::int FROM music_identity_tombstones) AS tombstones,
      (SELECT count(*)::int FROM music_identity_lifecycle_operations) AS operations`)).rows[0]).toEqual(unrelatedHistoryBefore);
    await storage.deleteUser(unrelated.id);
    expect((await pool.query(`SELECT count(*)::int AS count FROM music_identity_tombstones
      WHERE lifecycle_operation_id=$1`, [operationId])).rows[0].count).toBe(1);
    expect((await pool.query(`SELECT count(*)::int AS count FROM music_identity_lifecycle_operations
      WHERE operation_id=$1 AND operation_phase='finalized'`, [operationId])).rows[0].count).toBe(1);
    for (const table of rawTables) {
      expect(Number((await pool.query(`SELECT count(*) AS count FROM ${table} WHERE user_id=$1`, [identity.id])).rows[0].count), table).toBe(0);
    }
  });
});
