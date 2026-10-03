import pg from "pg";
import { afterAll, aroundEach, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { setupMusicFixtureProbeRoute } from "../../routes/musicFixtureProbe";
import { setupMusicHealthRoutes } from "../../deployment/music-health";
import { createGateAttestation, type ImageCandidate } from "../../deployment/music-deployment";
import { MusicIdentityRepository } from "../../repositories/musicIdentityRepository";
import { checkMusicDatabaseReadiness } from "../../db/readiness";
import {
  createMigrationDefinition,
  loadMusicMigrations,
  migrateMusicDatabase,
  verifyMusicDatabase,
} from "../../db/migrate";
import {
  EXPECTED_MUSIC_MIGRATION_CHAIN,
  EXPECTED_MUSIC_MIGRATION_ID,
} from "../../../shared/music-migration-contract";
import { validateIntegrationDatabaseTarget } from "../integration-global-setup";
import {
  MusicMigrationTestResources,
  nextSyntheticMusicMigrationId,
} from "./music-migration-test-resources";
import manifest from "../../../../fixtures/db/music-runtime-table-manifest.json";

const adminUrl = process.env.DATABASE_URL_TEST ?? "";
const runIntegration = process.env.MUSIC_C3_POSTGRES_TEST === "1";
const describePostgres = runIntegration ? describe.sequential : describe.skip;
const databases: string[] = [];
const resources = new MusicMigrationTestResources();
let admin: pg.Pool;

function databaseUrl(name: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function freshDatabase(label: string): Promise<pg.Pool> {
  const name = `music_c3_${label}_${process.pid}_${databases.length}`.replace(/[^a-z0-9_]/g, "_");
  await admin.query(`CREATE DATABASE ${name}`);
  databases.push(name);
  return resources.trackPool(new pg.Pool({ connectionString: databaseUrl(name), max: 4 }));
}

async function expectRejected(pool: pg.Pool, sql: string, values: unknown[] = []): Promise<void> {
  await expect(pool.query(sql, values)).rejects.toThrow();
}

describePostgres("C3 PostgreSQL 15 migration chain", () => {
  it('upgrades historical0036 to Movies0037 and rejects readiness at the older floor',async()=>{const pool=await freshDatabase('movies_upgrade'),prior=loadMusicMigrations().filter(m=>m.id<'0037');await migrateMusicDatabase(pool,{migrations:prior,testOnlyExpectedIds:prior.map(m=>m.id)});const before=(await pool.query('SELECT id,checksum,schema_checksum,applied_at FROM music_schema_migrations ORDER BY id')).rows;await expect(verifyMusicDatabase(pool)).rejects.toThrow();expect((await migrateMusicDatabase(pool)).appliedIds).toEqual(['0037_explorers_movies_provider_context']);expect((await pool.query("SELECT id,checksum,schema_checksum,applied_at FROM music_schema_migrations WHERE id<'0037' ORDER BY id")).rows).toEqual(before);expect((await pool.query('SELECT count(*) FROM movie_provider_genre_terms')).rows[0].count).toBe('35');expect((await verifyMusicDatabase(pool)).ready).toBe(true);await resources.closePool(pool);});

  it('upgrades 0035 to analytics without advancing content revisions and fails readiness without0036',async()=>{
    const pool=await freshDatabase('analytics_upgrade'),prior=loadMusicMigrations().filter(m=>m.id<'0036');
    await migrateMusicDatabase(pool,{migrations:prior,testOnlyExpectedIds:prior.map(m=>m.id)});
    const account=(await pool.query('INSERT INTO creator_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await pool.query("INSERT INTO account_category_content_state(account_id,category,revision) VALUES($1,'books',7)",[account]);
    const before=await pool.query('SELECT * FROM account_category_content_state WHERE account_id=$1',[account]);
    await expect(verifyMusicDatabase(pool)).rejects.toThrow();
    expect((await migrateMusicDatabase(pool)).appliedIds).toEqual(['0036_explorers_analytics_events','0037_explorers_movies_provider_context']);
    expect((await pool.query('SELECT * FROM account_category_content_state WHERE account_id=$1',[account])).rows).toEqual(before.rows);
    expect((await pool.query("SELECT to_regclass('analytics_events') AS events,to_regclass('analytics_event_receipts') AS receipts")).rows[0]).toEqual({events:'analytics_events',receipts:'analytics_event_receipts'});
    await verifyMusicDatabase(pool);expect((await migrateMusicDatabase(pool)).appliedIds).toEqual([]);
  });
  it('upgrades populated 0032 to the override companion once without changing existing category revisions',async()=>{
    const pool=await freshDatabase('override_upgrade'),prior=loadMusicMigrations().filter(m=>m.id<'0033');
    await migrateMusicDatabase(pool,{migrations:prior,testOnlyExpectedIds:prior.map(m=>m.id)});
    const account=(await pool.query('INSERT INTO creator_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await pool.query("INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,'books','Before override','before',0)",[account]);
    const before=(await pool.query('SELECT category,revision::text FROM account_category_content_state WHERE account_id=$1',[account])).rows;
    expect((await migrateMusicDatabase(pool)).appliedIds).toEqual(['0033_explorers_recommendation_display_overrides','0034_explorers_books_provider_context','0035_explorers_book_cover_import','0036_explorers_analytics_events','0037_explorers_movies_provider_context']);
    expect((await migrateMusicDatabase(pool)).appliedIds).toEqual([]);
    expect((await pool.query('SELECT category,revision::text FROM account_category_content_state WHERE account_id=$1',[account])).rows).toEqual(before);
    expect((await pool.query('SELECT count(*)::int n FROM recommendation_display_overrides')).rows[0].n).toBe(0);
    expect((await pool.query("SELECT has_table_privilege('music_runtime','recommendation_display_overrides','SELECT,INSERT,UPDATE,DELETE') allowed,has_table_privilege('music_runtime','account_category_content_state','UPDATE') counter_write")).rows[0]).toEqual({allowed:true,counter_write:false});
    await pool.query("UPDATE music_schema_migrations SET checksum=repeat('0',64) WHERE id='0033_explorers_recommendation_display_overrides'");
    await expect(migrateMusicDatabase(pool)).rejects.toThrow('migration checksum mismatch');
    await resources.closePool(pool);
  });
  it('upgrades 0031 to owner seek indexes without changing revision counters or runtime authority',async()=>{
    const pool=await freshDatabase('owner_page_upgrade'),prior=loadMusicMigrations().filter(m=>m.id<'0032');
    await migrateMusicDatabase(pool,{migrations:prior,testOnlyExpectedIds:prior.map(m=>m.id)});
    const account=(await pool.query('INSERT INTO creator_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await pool.query("INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,'books','Prior list','prior',0)",[account]);
    const before=(await pool.query('SELECT category,revision::text FROM account_category_content_state WHERE account_id=$1',[account])).rows;
    expect((await migrateMusicDatabase(pool)).appliedIds).toEqual(['0032_explorers_owner_page_indexes','0033_explorers_recommendation_display_overrides','0034_explorers_books_provider_context','0035_explorers_book_cover_import','0036_explorers_analytics_events','0037_explorers_movies_provider_context']);
    expect((await pool.query('SELECT category,revision::text FROM account_category_content_state WHERE account_id=$1',[account])).rows).toEqual(before);
    const indexes=(await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN ('collections_owner_order_idx','recommendations_owner_id_idx','collection_items_owner_page_idx','collection_items_owner_collection_order_idx') ORDER BY indexname")).rows;
    expect(indexes).toHaveLength(4);
    const privilege=(await pool.query("SELECT has_table_privilege('music_runtime','account_category_content_state','SELECT') readable,has_table_privilege('music_runtime','account_category_content_state','UPDATE') writable")).rows[0];expect(privilege).toEqual({readable:true,writable:false});
    await resources.closePool(pool);
  });
  it('lets an account-first writer finish before freezing revision backfill sources',async()=>{
    const pool=await freshDatabase('revision_writer_lock'),prior=loadMusicMigrations().filter(m=>m.id<'0031');
    await migrateMusicDatabase(pool,{migrations:prior,testOnlyExpectedIds:prior.map(m=>m.id)});
    const account=(await pool.query('INSERT INTO creator_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await pool.query("INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,'books','Before migration','before',0)",[account]);
    const writer=await pool.connect();let pending:Promise<any>|undefined;
    try {
      await writer.query('BEGIN');await writer.query("SET LOCAL lock_timeout='500ms'");await writer.query('SELECT id FROM creator_accounts WHERE id=$1 FOR UPDATE',[account]);
      pending=migrateMusicDatabase(pool).then(value=>({value})).catch(error=>({error}));
      let waiting=false;const deadline=Date.now()+5000;
      while(Date.now()<deadline&&!waiting) {waiting=(await pool.query('SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type=\'Lock\'')).rowCount!>0;if(!waiting) await new Promise(resolve=>setTimeout(resolve,10));}
      expect(waiting).toBe(true);
      await writer.query("UPDATE collections SET title='Committed before migration' WHERE account_id=$1",[account]);await writer.query('COMMIT');
      expect((await pending).error).toBeUndefined();
      expect((await pool.query('SELECT revision::text FROM account_category_content_state WHERE account_id=$1',[account])).rows).toEqual([{revision:'1'}]);
    } finally {await writer.query('ROLLBACK');await pending;writer.release();await resources.closePool(pool);}
  });
  aroundEach(async (runTest) => {
    await resources.runWithCleanup(runTest);
  });

  beforeAll(async () => {
    const exactTarget = validateIntegrationDatabaseTarget(adminUrl);
    admin = new pg.Pool({ connectionString: exactTarget.toString(), max: 4 });
    const version = await admin.query<{ server_version: string }>("SHOW server_version");
    expect(version.rows[0].server_version).toMatch(/^15\./);
  });

  afterAll(async () => {
    if (!admin) return;
    try {
      try {
        await resources.closeAllPools();
      } finally {
        for (const name of databases.reverse()) {
          await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [name]);
          await admin.query(`DROP DATABASE ${name}`);
        }
      }
    } finally {
      await admin.end();
    }
  });

  it("backfills a populated 0030 database and upgrades category revisions once",async()=>{
    const pool=await freshDatabase('content_revision_upgrade'),prior=loadMusicMigrations().filter(m=>m.id<'0031');
    await migrateMusicDatabase(pool,{migrations:prior,testOnlyExpectedIds:prior.map(m=>m.id)});
    const account=(await pool.query('INSERT INTO creator_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await pool.query("INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,'books','Old list','old',0),($1,'guides','Old guide','guide',0)",[account]);
    const upgraded=await migrateMusicDatabase(pool);expect(upgraded.appliedIds).toEqual(['0031_explorers_content_revision','0032_explorers_owner_page_indexes','0033_explorers_recommendation_display_overrides','0034_explorers_books_provider_context','0035_explorers_book_cover_import','0036_explorers_analytics_events','0037_explorers_movies_provider_context']);
    expect((await pool.query('SELECT category,revision::text FROM account_category_content_state WHERE account_id=$1 ORDER BY category',[account])).rows).toEqual([{category:'books',revision:'1'},{category:'guides',revision:'1'}]);
    const db=await pool.connect();try {await db.query('BEGIN');await db.query('SET LOCAL ROLE music_runtime');
      await db.query("UPDATE collections SET heading='Post upgrade' WHERE account_id=$1 AND category='books'",[account]);await db.query('COMMIT');
    } finally {await db.query('ROLLBACK');db.release();}
    expect((await pool.query("SELECT revision::text FROM account_category_content_state WHERE account_id=$1 AND category='books'",[account])).rows[0].revision).toBe('2');
    expect((await migrateMusicDatabase(pool)).appliedIds).toEqual([]);
    const triggers=await pool.query("SELECT count(*)::int AS count FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%_content_revision_%'");expect(triggers.rows[0].count).toBe(37);
    await resources.closePool(pool);
  });
  it("migrates a fresh database, creates all 56 manifested runtime tables and controls, verifies, and repeats as a no-op", async () => {
    const pool = await freshDatabase("baseline");
    const first = await migrateMusicDatabase(pool);
    const second = await migrateMusicDatabase(pool);
    const verified = await verifyMusicDatabase(pool);
    const tables = await pool.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    const present = new Set(tables.rows.map(({ table_name }) => table_name));
    for (const table of manifest.tables) expect(present.has(table.name), table.name).toBe(true);
    expect(first.currentId).toBe(EXPECTED_MUSIC_MIGRATION_ID);
    expect(first.appliedIds).toEqual(EXPECTED_MUSIC_MIGRATION_CHAIN);
    expect((await pool.query(`SELECT data_type,is_nullable,column_default FROM information_schema.columns
      WHERE table_schema='public' AND table_name='users' AND column_name='public_snapshot_revision'`)).rows[0])
      .toEqual({ data_type: "bigint", is_nullable: "NO", column_default: "0" });
    expect(second.appliedIds).toEqual([]);
    expect(verified.ready).toBe(true);
    await resources.closePool(pool);
  });

  it("persists hash-only reactivation authority with recoverable leases and atomic single use", async () => {
    const pool = await freshDatabase("reactivation_tokens");
    await migrateMusicDatabase(pool);
    const repository = new MusicIdentityRepository(pool);
    const tokenHash = "a".repeat(64);
    const token = {
      tokenHash,
      strapiUserId: 73,
      userDocumentId: "durable-user-document",
      accountDocumentId: "durable-account-document",
      operationId: "10000000-0000-4000-8000-000000000073",
    };
    await repository.issueReactivationToken(token);
    const [first, second] = await Promise.all([
      repository.claimReactivationToken(tokenHash, "20000000-0000-4000-8000-000000000001"),
      repository.claimReactivationToken(tokenHash, "20000000-0000-4000-8000-000000000002"),
    ]);
    const claimed = [first, second].filter((value) => value.disposition === "claimed");
    const busy = [first, second].filter((value) => value.disposition === "busy");
    expect(claimed).toHaveLength(1);
    expect(busy).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      strapiUserId: 73,
      userDocumentId: token.userDocumentId,
      accountDocumentId: token.accountDocumentId,
      operationId: token.operationId,
    });
    const firstOwner = first.disposition === "claimed"
      ? "20000000-0000-4000-8000-000000000001"
      : "20000000-0000-4000-8000-000000000002";
    await expect(repository.releaseReactivationToken(tokenHash, firstOwner)).resolves.toBe(true);
    const recoveryOwner = "20000000-0000-4000-8000-000000000003";
    await expect(repository.claimReactivationToken(tokenHash, recoveryOwner)).resolves.toMatchObject({ disposition: "claimed" });
    await expect(repository.consumeReactivationToken(tokenHash, recoveryOwner)).resolves.toBe(true);
    await expect(repository.claimReactivationToken(tokenHash, "20000000-0000-4000-8000-000000000004"))
      .resolves.toEqual({ disposition: "consumed" });
    const columns = (await pool.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='music_reactivation_tokens' ORDER BY column_name`)).rows
      .map(({ column_name }) => column_name);
    expect(columns).not.toContain("email");
    expect(JSON.stringify(await pool.query("SELECT * FROM music_reactivation_tokens"))).not.toContain("reactivation-token");
    await resources.closePool(pool);
  });

  it("upgrades a populated committed 0002 database through appended 0003 without rewriting history", async () => {
    const pool = await freshDatabase("upgrade_from_0002");
    const chain = loadMusicMigrations();
    await migrateMusicDatabase(pool, {
      migrations: chain.slice(0, 2),
      testOnlyExpectedIds: ["0001_runtime_baseline", "0002_identity_lifecycle"],
    });
    await pool.query(`INSERT INTO users
      (username,password,guest_url,venue_name,strapi_user_document_id,strapi_account_document_id,
       guest_capability_hash,lifecycle_operation_id)
      VALUES ('pre-hardening','disabled','pre-hardening-slug','Venue','pre-hardening-person','pre-hardening-account',$1,'pre-hardening-operation')`, ["b".repeat(64)]);
    const original0002 = (await pool.query("SELECT checksum FROM music_schema_migrations WHERE id='0002_identity_lifecycle'")).rows[0].checksum;
    await migrateMusicDatabase(pool);
    expect((await pool.query("SELECT checksum FROM music_schema_migrations WHERE id='0002_identity_lifecycle'")).rows[0].checksum).toBe(original0002);
    expect((await pool.query("SELECT operation_kind,operation_state FROM music_identity_lifecycle_operations WHERE operation_id='pre-hardening-operation'")).rows[0])
      .toEqual({ operation_kind: "provision", operation_state: "completed" });
    await resources.closePool(pool);
  });

  it("upgrades a populated 0019 database without breaking the old queue-visible binary contract", async () => {
    // Break caught: the additive column rewrites prior history, lacks its zero
    // default, or makes an old binary's explicit user projection/update fail.
    const pool = await freshDatabase("upgrade_from_0019");
    const chain = loadMusicMigrations();
    const idsThrough0019 = ["0001_runtime_baseline", "0002_identity_lifecycle", "0003_identity_lifecycle_hardening", "0004_identity_delete_saga", "0005_resource_bound_deletion_history", "0006_numeric_identity_lock", "0007_identity_provider_snapshot", "0008_credential_revocation_operations", "0009_credential_revocation_history_immutability", "0010_least_privilege_runtime_role", "0011_durable_publication_idempotency", "0012_publication_replay_expiry_guard", "0013_publication_operation_database_clock", "0014_durable_reactivation_authority", "0015_publication_operation_archive", "0016_publication_operation_retention", "0017_publication_idempotency_key_retirement", "0018_transactional_queue_replacement", "0019_queue_visibility_control"];
    await migrateMusicDatabase(pool, { migrations: chain.slice(0, 19), testOnlyExpectedIds: idsThrough0019 });
    const inserted = await pool.query<{ id: number }>(`INSERT INTO users
      (username,password,guest_url,venue_name,strapi_user_document_id,strapi_account_document_id,
       guest_capability_hash,lifecycle_operation_id,music_queue_revision,allow_queue_visibility)
      VALUES ('old-public-binary','disabled','old-public-slug','Old Venue','old-public-person',
        'old-public-account',$1,'old-public-operation',7,true) RETURNING id`, ["d".repeat(64)]);
    const id = inserted.rows[0].id;
    const before = (await pool.query(
      "SELECT username,music_queue_revision,allow_queue_visibility FROM users WHERE id=$1",
      [id],
    )).rows[0];
    const oldChecksum = (await pool.query(
      "SELECT checksum FROM music_schema_migrations WHERE id='0019_queue_visibility_control'",
    )).rows[0].checksum;

    await migrateMusicDatabase(pool);

    expect((await pool.query(
      "SELECT username,music_queue_revision,allow_queue_visibility FROM users WHERE id=$1",
      [id],
    )).rows[0]).toEqual(before);
    expect((await pool.query(
      "SELECT public_snapshot_revision FROM users WHERE id=$1",
      [id],
    )).rows[0].public_snapshot_revision).toBe("0");
    expect((await pool.query(
      "UPDATE users SET music_queue_revision=music_queue_revision+1 WHERE id=$1 RETURNING music_queue_revision",
      [id],
    )).rows[0].music_queue_revision).toBe("8");
    expect((await pool.query(
      "SELECT checksum FROM music_schema_migrations WHERE id='0019_queue_visibility_control'",
    )).rows[0].checksum).toBe(oldChecksum);
    await resources.closePool(pool);
  });

  it("enforces immutable identities, selected Account, lifecycle, owners, and hashed guest capabilities in PostgreSQL", async () => {
    const pool = await freshDatabase("constraints");
    await migrateMusicDatabase(pool);
    const insert = `INSERT INTO users
      (username,password,guest_url,venue_name,strapi_user_document_id,strapi_account_document_id,
       guest_capability_hash,lifecycle_operation_id)
      VALUES ($1,'disabled-native-password',$2,'Venue',$3,$4,$5,$6) RETURNING id`;
    const hash = "a".repeat(64);
    const user = await pool.query<{ id: number }>(insert, ["snapshot", "public-slug", "person-1", "account-1", hash, "operation-1"]);
    const id = user.rows[0].id;
    await expectRejected(pool, insert, ["other", "other-slug", "person-1", "account-2", "b".repeat(64), "operation-2"]);
    await expectRejected(pool, insert, ["same-account", "same-account-slug", "person-2", "account-1", "c".repeat(64), "operation-3"]);
    await expectRejected(pool, "UPDATE users SET strapi_user_document_id='person-2' WHERE id=$1", [id]);
    await expectRejected(pool, "UPDATE users SET strapi_account_document_id='account-2' WHERE id=$1", [id]);
    await expectRejected(pool, "UPDATE users SET identity_status='invalid' WHERE id=$1", [id]);
    await expectRejected(pool, "UPDATE users SET session_version=0 WHERE id=$1", [id]);
    await expectRejected(pool, "INSERT INTO playlists(user_id,name) VALUES (999999,'orphan')");
    await expectRejected(pool, insert, ["plaintext", "plaintext-slug", "person-3", "account-3", "plaintext-capability", "operation-3"]);
    await expectRejected(pool, insert, ["duplicate-hash", "dup-slug", "person-4", "account-4", hash, "operation-4"]);
    await expectRejected(pool, "UPDATE users SET identity_status='pending_deletion' WHERE id=$1", [id]);
    await expectRejected(pool, "UPDATE users SET identity_status='suspended' WHERE id=$1", [id]);
    await resources.closePool(pool);
  });

  it("keeps tombstones independent of deleted user rows and never adopts by username/email", async () => {
    const pool = await freshDatabase("tombstone");
    await migrateMusicDatabase(pool);
    const repository = new MusicIdentityRepository(pool);
    await pool.query("INSERT INTO music_identity_tombstones(strapi_user_document_id,strapi_account_document_id,reason,lifecycle_operation_id) VALUES ('person-deleted','account-deleted','upstream-deleted','delete-op')");
    expect(await repository.isTombstoned("person-deleted")).toBe(true);
    await expect(repository.createIdentity({
      username: "recreated",
      password: "disabled-native-password",
      guestUrl: "recreated-slug",
      venueName: "Venue",
      strapiUserDocumentId: "person-deleted",
      strapiAccountDocumentId: "account-deleted",
      guestCapabilityHash: "d".repeat(64),
      operationId: "recreate-op",
    })).rejects.toThrow(/tombstoned/i);
    expect(await repository.findByExternalIdentity("person-missing")).toBeUndefined();
    expect(Object.getOwnPropertyNames(MusicIdentityRepository.prototype)).not.toEqual(expect.arrayContaining(["findByUsername", "findByEmail", "assertCanCreate"]));
    await resources.closePool(pool);
  });

  it("atomically prevents recreation by either immutable user or Account ID, including direct SQL", async () => {
    const pool = await freshDatabase("atomic_identity");
    await migrateMusicDatabase(pool);
    const insertUser = `INSERT INTO users
      (username,password,guest_url,venue_name,strapi_user_document_id,strapi_account_document_id,
       guest_capability_hash,lifecycle_operation_id)
      VALUES ($1,'disabled-native-password',$2,'Venue',$3,$4,$5,$6)`;
    await pool.query(`INSERT INTO music_identity_tombstones
      (strapi_user_document_id,strapi_account_document_id,reason,lifecycle_operation_id)
      VALUES ('person-deleted','account-deleted','upstream-deleted','delete-direct')`);
    await expectRejected(pool, insertUser, ["same-user", "same-user-slug", "person-deleted", "other-account", "1".repeat(64), "create-same-user"]);
    await expectRejected(pool, insertUser, ["same-account", "same-account-slug", "other-person", "account-deleted", "2".repeat(64), "create-same-account"]);

    const repository = new MusicIdentityRepository(pool);
    await repository.createIdentity({
      username: "live",
      password: "disabled-native-password",
      guestUrl: "live-slug",
      venueName: "Venue",
      strapiUserDocumentId: "person-live",
      strapiAccountDocumentId: "account-live",
      guestCapabilityHash: "3".repeat(64),
      operationId: "provision-live",
    });
    await repository.tombstoneIdentity({
      strapiUserDocumentId: "person-live",
      strapiAccountDocumentId: "account-live",
      reason: "upstream-deleted",
      operationId: "delete-live",
    });
    expect(await repository.findByExternalIdentity("person-live")).toBeUndefined();
    expect(await repository.isTombstoned("person-live")).toBe(true);
    await expect(repository.createIdentity({
      username: "recreated-live",
      password: "disabled-native-password",
      guestUrl: "recreated-live-slug",
      venueName: "Venue",
      strapiUserDocumentId: "person-live",
      strapiAccountDocumentId: "account-live",
      guestCapabilityHash: "4".repeat(64),
      operationId: "recreate-live",
    })).rejects.toThrow(/tombstoned/i);

    await pool.query(insertUser, ["direct-delete", "direct-delete-slug", "person-direct-delete", "account-direct-delete", "e".repeat(64), "provision-direct-delete"]);
    await expectRejected(pool, "DELETE FROM users WHERE strapi_user_document_id='person-direct-delete'");
    expect((await pool.query("SELECT count(*)::int AS count FROM users WHERE strapi_user_document_id='person-direct-delete'")).rows[0].count).toBe(1);
    await repository.tombstoneIdentity({
      strapiUserDocumentId: "person-direct-delete", strapiAccountDocumentId: "account-direct-delete",
      reason: "upstream-deleted", operationId: "delete-direct-safe",
    });
    expect((await pool.query("SELECT strapi_account_document_id FROM music_identity_tombstones WHERE strapi_user_document_id='person-direct-delete'")).rows[0])
      .toEqual({ strapi_account_document_id: "account-direct-delete" });
    await expectRejected(pool, insertUser, ["direct-recreate-user", "direct-recreate-user-slug", "person-direct-delete", "account-other", "f".repeat(64), "recreate-direct-user"]);
    await expectRejected(pool, insertUser, ["direct-recreate-account", "direct-recreate-account-slug", "person-other", "account-direct-delete", "0".repeat(64), "recreate-direct-account"]);
    await resources.closePool(pool);
  });

  it("serializes concurrent direct create-vs-tombstone in both lock-queue orderings", async () => {
    const pool = await freshDatabase("identity_races");
    await migrateMusicDatabase(pool);
    const insertUser = `INSERT INTO users
      (username,password,guest_url,venue_name,strapi_user_document_id,strapi_account_document_id,
       guest_capability_hash,lifecycle_operation_id)
      VALUES ($1,'disabled-native-password',$2,'Venue',$3,$4,$5,$6)`;
    const insertTombstone = `INSERT INTO music_identity_tombstones
      (strapi_user_document_id,strapi_account_document_id,reason,lifecycle_operation_id)
      VALUES ($1,$2,'upstream-deleted',$3)`;
    async function waitForWaiters(expected: number): Promise<void> {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const waiting = await pool.query<{ count: number }>(`SELECT count(*)::int AS count FROM pg_locks
          WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`);
        if (waiting.rows[0].count >= expected) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`timed out waiting for ${expected} advisory lock waiters`);
    }
    for (const first of ["create", "tombstone"] as const) {
      const suffix = first;
      const userDocumentId = `person-race-${suffix}`;
      const accountDocumentId = `account-race-${suffix}`;
      const create = () => pool.query(insertUser, [
        `race-${suffix}`, `race-slug-${suffix}`, userDocumentId, accountDocumentId,
        (first === "create" ? "6" : "7").repeat(64), `provision-race-${suffix}`,
      ]);
      const tombstone = () => pool.query(insertTombstone, [userDocumentId, accountDocumentId, `delete-race-${suffix}`]);
      const { settledPending } = await resources.withClient(pool, async (blocker: pg.PoolClient) => {
        await blocker.query("BEGIN");
        await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`music:user:${userDocumentId}`]);
        await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`music:account:${accountDocumentId}`]);
        const firstPending = first === "create" ? create() : tombstone();
        await waitForWaiters(1);
        const secondPending = first === "create" ? tombstone() : create();
        // Attach rejection handlers before releasing the blocker: the losing
        // query may reject before withClient returns to the outer assertion.
        const settledPending = Promise.allSettled([firstPending, secondPending]);
        await waitForWaiters(2);
        await blocker.query("COMMIT");
        return { settledPending };
      });
      const [firstResult, secondResult] = await settledPending;
      expect(firstResult.status).toBe("fulfilled");
      expect(secondResult.status).toBe("rejected");
      const state = await pool.query<{ live: number; tombstone: number }>(`SELECT
        (SELECT count(*)::int FROM users WHERE strapi_user_document_id=$1) AS live,
        (SELECT count(*)::int FROM music_identity_tombstones WHERE strapi_user_document_id=$1) AS tombstone`, [userDocumentId]);
      expect(state.rows[0]).toEqual(first === "create" ? { live: 1, tombstone: 0 } : { live: 0, tombstone: 1 });
    }
    await resources.closePool(pool);
  });

  it("enforces lifecycle edge/session rules and operation replay at the repository boundary", async () => {
    const pool = await freshDatabase("lifecycle_edges");
    await migrateMusicDatabase(pool);
    const repository = new MusicIdentityRepository(pool);
    await repository.createIdentity({
      username: "lifecycle",
      password: "disabled-native-password",
      guestUrl: "lifecycle-slug",
      venueName: "Venue",
      strapiUserDocumentId: "person-lifecycle",
      strapiAccountDocumentId: "account-lifecycle",
      guestCapabilityHash: "5".repeat(64),
      operationId: "provision-lifecycle",
    });
    const suspended = await repository.transitionIdentity({
      strapiUserDocumentId: "person-lifecycle", operationId: "suspend-1", kind: "suspend", targetStatus: "suspended",
    });
    expect(suspended).toMatchObject({ identityStatus: "suspended", sessionVersion: 2 });
    const replay = await repository.transitionIdentity({
      strapiUserDocumentId: "person-lifecycle", operationId: "suspend-1", kind: "suspend", targetStatus: "suspended",
    });
    expect(replay).toEqual(suspended);
    await expect(repository.transitionIdentity({
      strapiUserDocumentId: "person-lifecycle", operationId: "suspend-1", kind: "reactivate", targetStatus: "active",
    })).rejects.toThrow(/operation.*mismatch/i);
    await repository.transitionIdentity({
      strapiUserDocumentId: "person-lifecycle", operationId: "reactivate-1", kind: "reactivate", targetStatus: "active",
    });
    await expect(repository.transitionIdentity({
      strapiUserDocumentId: "person-lifecycle", operationId: "suspend-1", kind: "suspend", targetStatus: "suspended",
    })).rejects.toMatchObject({ code: "STALE_LIFECYCLE_OPERATION" });
    const pending = await repository.transitionIdentity({
      strapiUserDocumentId: "person-lifecycle", operationId: "delete-1", kind: "request_deletion", targetStatus: "pending_deletion",
    });
    expect(pending.sessionVersion).toBe(4);
    await expect(repository.transitionIdentity({
      strapiUserDocumentId: "person-lifecycle", operationId: "bypass", kind: "reactivate", targetStatus: "active",
    })).rejects.toThrow(/invalid identity lifecycle transition/i);
    await repository.transitionIdentity({
      strapiUserDocumentId: "person-lifecycle", operationId: "cancel-1", kind: "cancel_deletion", targetStatus: "suspended",
    });
    await repository.transitionIdentity({
      strapiUserDocumentId: "person-lifecycle", operationId: "reactivate-2", kind: "reactivate", targetStatus: "active",
    });
    await repository.transitionIdentity({
      strapiUserDocumentId: "person-lifecycle", operationId: "delete-again", kind: "request_deletion", targetStatus: "pending_deletion",
    });
    await repository.transitionIdentity({
      strapiUserDocumentId: "person-lifecycle", operationId: "cancel-again", kind: "cancel_deletion", targetStatus: "suspended",
    });
    await repository.transitionIdentity({
      strapiUserDocumentId: "person-lifecycle", operationId: "reactivate-again", kind: "reactivate", targetStatus: "active",
    });
    await repository.createIdentity({
      username: "delete-from-suspended",
      password: "disabled-native-password",
      guestUrl: "delete-from-suspended-slug",
      venueName: "Venue",
      strapiUserDocumentId: "person-delete-from-suspended",
      strapiAccountDocumentId: "account-delete-from-suspended",
      guestCapabilityHash: "8".repeat(64),
      operationId: "provision-delete-from-suspended",
    });
    await repository.transitionIdentity({
      strapiUserDocumentId: "person-delete-from-suspended", operationId: "suspend-2", kind: "suspend", targetStatus: "suspended",
    });
    const deletedFromSuspended = await repository.transitionIdentity({
      strapiUserDocumentId: "person-delete-from-suspended", operationId: "delete-2", kind: "request_deletion", targetStatus: "pending_deletion",
    });
    expect(deletedFromSuspended.sessionVersion).toBe(3);
    const finalize = {
      strapiUserDocumentId: "person-delete-from-suspended", strapiAccountDocumentId: "account-delete-from-suspended",
      reason: "upstream-deleted", operationId: "delete-2",
    };
    await repository.tombstoneIdentity(finalize);
    await expect(repository.tombstoneIdentity(finalize)).resolves.toBeUndefined();
    expect((await pool.query(`SELECT t.lifecycle_operation_id,t.music_user_id,o.music_user_id AS operation_music_user_id
      FROM music_identity_tombstones t
      JOIN music_identity_lifecycle_operations o ON o.operation_id=t.lifecycle_operation_id
      WHERE t.strapi_user_document_id=$1`, [finalize.strapiUserDocumentId])).rows[0])
      .toEqual({ lifecycle_operation_id: "delete-2", music_user_id: deletedFromSuspended.id, operation_music_user_id: deletedFromSuspended.id });
    await expectRejected(pool, `INSERT INTO users
      (id,username,password,guest_url,venue_name,strapi_user_document_id,strapi_account_document_id,
       guest_capability_hash,lifecycle_operation_id)
      VALUES ($1,'numeric-reuse','disabled','numeric-reuse-slug','Venue','person-numeric-reuse',
        'account-numeric-reuse',$2,'provision-numeric-reuse')`, [deletedFromSuspended.id, "7".repeat(64)]);
    expect((await pool.query("SELECT count(*)::int AS count FROM music_identity_lifecycle_operations WHERE operation_id='provision-numeric-reuse'")).rows[0].count).toBe(0);
    await expectRejected(pool, "UPDATE music_identity_tombstones SET music_user_id=music_user_id+1 WHERE lifecycle_operation_id='delete-2'");
    await expectRejected(pool, "UPDATE music_identity_lifecycle_operations SET music_user_id=music_user_id+1 WHERE operation_id='delete-2'");
    expect((await pool.query(`SELECT count(*)::int AS count FROM pg_constraint
      WHERE contype='f' AND conrelid IN ('music_identity_tombstones'::regclass,'music_identity_lifecycle_operations'::regclass)
        AND confrelid='users'::regclass`)).rows[0].count).toBe(0);
    expect((await pool.query("SELECT seqcycle FROM pg_sequence WHERE seqrelid='users_id_seq'::regclass")).rows[0].seqcycle).toBe(false);
    expect((await pool.query("SELECT operation_id FROM music_identity_lifecycle_operations WHERE strapi_user_document_id='person-lifecycle' ORDER BY created_at,operation_id")).rows.map((row) => row.operation_id))
      .toEqual(expect.arrayContaining(["provision-lifecycle", "suspend-1", "reactivate-1", "delete-1", "cancel-1", "reactivate-2", "delete-again", "cancel-again", "reactivate-again"]));
    await expectRejected(pool, "UPDATE users SET identity_status='suspended' WHERE strapi_user_document_id='person-lifecycle'");
    await expectRejected(pool, "UPDATE users SET identity_status='pending_deletion' WHERE strapi_user_document_id='person-lifecycle'");
    await resources.closePool(pool);
  });

  it("uses one advisory-before-row delete primitive without deadlock in create/delete and tombstone/delete orderings", async () => {
    const pool = await freshDatabase("delete_lock_order");
    await migrateMusicDatabase(pool);
    const repository = new MusicIdentityRepository(pool);
    async function seed(suffix: string): Promise<number> {
      const created = await repository.createIdentity({
        username: `lock-${suffix}`, password: "disabled", guestUrl: `lock-${suffix}-slug`, venueName: "Venue",
        strapiUserDocumentId: `person-lock-${suffix}`, strapiAccountDocumentId: `account-lock-${suffix}`,
        guestCapabilityHash: (suffix.charCodeAt(0) % 10).toString().repeat(64), operationId: `provision-lock-${suffix}`,
      });
      return created.id;
    }
    async function waitForWaiters(expected: number): Promise<void> {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const waiting = await pool.query<{ count: number }>(`SELECT count(*)::int AS count FROM pg_locks
          WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`);
        if (waiting.rows[0].count >= expected) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("timed out waiting for identity advisory lock queue");
    }
    for (const family of ["create", "tombstone"] as const) {
      for (const first of [family, "delete"] as const) {
        const suffix = `${family}-${first}`;
        const userId = await seed(suffix);
        const userDocumentId = `person-lock-${suffix}`;
        const accountDocumentId = `account-lock-${suffix}`;
        const competitor = family === "create"
          ? () => repository.createIdentity({
            username: `duplicate-${suffix}`, password: "disabled", guestUrl: `duplicate-${suffix}-slug`, venueName: "Venue",
            strapiUserDocumentId: userDocumentId, strapiAccountDocumentId: accountDocumentId,
            guestCapabilityHash: "9".repeat(64), operationId: `duplicate-${suffix}`,
          })
          : () => pool.query(`INSERT INTO music_identity_tombstones
            (strapi_user_document_id,strapi_account_document_id,reason,lifecycle_operation_id)
            VALUES ($1,$2,'direct-race',$3)`, [userDocumentId, accountDocumentId, `direct-tombstone-${suffix}`]);
        const deletion = () => pool.query("SELECT finalize_music_identity_deletion($1,$2,$3)", [userId, `delete-${suffix}`, "race-delete"]);
        const { settledPending } = await resources.withClient(pool, async (blocker: pg.PoolClient) => {
          await blocker.query("BEGIN");
          await blocker.query("SELECT lock_music_identity_pair($1,$2)", [userDocumentId, accountDocumentId]);
          const firstPending = first === "delete" ? deletion() : competitor();
          await waitForWaiters(1);
          const secondPending = first === "delete" ? competitor() : deletion();
          // Attach both rejection handlers before releasing the lock: either
          // operation can reject before this callback returns to the test.
          const settledPending = Promise.allSettled([firstPending, secondPending]);
          await waitForWaiters(2);
          await blocker.query("COMMIT");
          return { settledPending };
        });
        const settled = await Promise.race([
          settledPending,
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("delete lock-order deadlock")), 5_000)),
        ]);
        expect(settled.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
        expect((await pool.query(`SELECT
          (SELECT count(*)::int FROM users WHERE id=$1) AS live,
          (SELECT count(*)::int FROM music_identity_tombstones WHERE strapi_user_document_id=$2) AS tombstone`, [userId,userDocumentId])).rows[0])
          .toEqual({ live: 0, tombstone: 1 });
      }
    }
    await resources.closePool(pool);
  }, 30_000);

  it("serializes numeric user IDs across authorized deletion, explicit inserts, and sequence reset", async () => {
    const pool = await freshDatabase("numeric_id_lock");
    await migrateMusicDatabase(pool);
    const repository = new MusicIdentityRepository(pool);
    const original = await repository.createIdentity({
      username: "numeric-lock-old", password: "disabled", guestUrl: "numeric-lock-old-slug", venueName: "Venue",
      strapiUserDocumentId: "person-numeric-lock-old", strapiAccountDocumentId: "account-numeric-lock-old",
      guestCapabilityHash: "6".repeat(64), operationId: "provision-numeric-lock-old",
    });

    // Delete-first: the delete has removed the old row but has not committed.
    // A different external identity using the same numeric ID must wait on the
    // numeric advisory key, then observe the committed tombstone and lose.
    const { reuse, numericLockWaiters } = await resources.withClient(pool, async (deleting: pg.PoolClient) => {
      await deleting.query("BEGIN");
      await deleting.query("SELECT finalize_music_identity_deletion($1,$2,$3)", [original.id, "delete-numeric-lock-old", "numeric-race"]);
      const reuse = pool.query(`INSERT INTO users
        (id,username,password,guest_url,venue_name,strapi_user_document_id,strapi_account_document_id,
         guest_capability_hash,lifecycle_operation_id)
        VALUES ($1,'numeric-lock-reuse','disabled','numeric-lock-reuse-slug','Venue',
          'person-numeric-lock-new','account-numeric-lock-new',$2,'provision-numeric-lock-new')`, [original.id, "7".repeat(64)]);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const numericLockWaiters = (await pool.query<{ count: number }>(`SELECT count(*)::int AS count FROM pg_locks
        WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`)).rows[0].count;
      await deleting.query("COMMIT");
      return { reuse, numericLockWaiters };
    });
    const reuseResult = await reuse.then(() => ({ accepted: true, message: "" }), (error: Error) => ({ accepted: false, message: error.message }));
    expect(numericLockWaiters).toBeGreaterThanOrEqual(1);
    expect(reuseResult).toMatchObject({ accepted: false });
    expect(reuseResult.message).toMatch(/retired|tombstone/i);
    expect((await pool.query(`SELECT
      (SELECT count(*)::int FROM users WHERE id=$1) AS live,
      (SELECT count(*)::int FROM music_identity_tombstones WHERE music_user_id=$1) AS tombstone`, [original.id])).rows[0])
      .toEqual({ live: 0, tombstone: 1 });

    // Insert-first for an unused explicit ID is a normal live identity. It
    // stays live until a later authorized deletion; PostgreSQL's PK means an
    // insert cannot "win" first against an already-existing numeric ID.
    const explicitId = original.id + 50_000;
    await resources.withClient(pool, async (inserting: pg.PoolClient) => {
      await inserting.query("BEGIN");
      await inserting.query(`INSERT INTO users
        (id,username,password,guest_url,venue_name,strapi_user_document_id,strapi_account_document_id,
         guest_capability_hash,lifecycle_operation_id)
        VALUES ($1,'numeric-lock-first','disabled','numeric-lock-first-slug','Venue',
          'person-numeric-lock-first','account-numeric-lock-first',$2,'provision-numeric-lock-first')`, [explicitId, "8".repeat(64)]);
      // A delete that cannot yet observe the uncommitted identity must not
      // speculate or create history for it.
      await expect(pool.query("SELECT finalize_music_identity_deletion($1,$2,$3)", [explicitId, "premature-delete-numeric-lock-first", "numeric-race"]))
        .rejects.toThrow(/resource-bound deletion history not found/i);
      await inserting.query("COMMIT");
    });
    expect((await pool.query("SELECT count(*)::int AS count FROM users WHERE id=$1", [explicitId])).rows[0].count).toBe(1);
    await pool.query("SELECT finalize_music_identity_deletion($1,$2,$3)", [explicitId, "delete-numeric-lock-first", "numeric-race"]);
    expect((await pool.query("SELECT count(*)::int AS count FROM users WHERE id=$1", [explicitId])).rows[0].count).toBe(0);

    // Resetting the sequence cannot bypass the same retired numeric-ID check.
    await pool.query("SELECT setval('users_id_seq',$1,false)", [explicitId]);
    await expect(pool.query(`INSERT INTO users
      (username,password,guest_url,venue_name,strapi_user_document_id,strapi_account_document_id,
       guest_capability_hash,lifecycle_operation_id)
      VALUES ('numeric-lock-sequence','disabled','numeric-lock-sequence-slug','Venue',
        'person-numeric-lock-sequence','account-numeric-lock-sequence',$1,'provision-numeric-lock-sequence')`, ["9".repeat(64)]))
      .rejects.toThrow(/retired|tombstone/i);
    await resources.closePool(pool);
  }, 30_000);

  it("enforces the complete lifecycle operation-state edge matrix", async () => {
    const pool = await freshDatabase("operation_edges");
    await migrateMusicDatabase(pool);
    const states = ["requested", "running", "completed", "failed", "cancelled"] as const;
    const allowed = new Set([
      "requested:running", "requested:failed", "requested:cancelled",
      "running:completed", "running:failed", "running:cancelled",
      "failed:requested",
    ]);
    for (const from of states) {
      for (const to of states) {
        if (from === to) continue;
        const operationId = `matrix-${from}-${to}`;
        await pool.query(`INSERT INTO music_identity_lifecycle_operations(
          operation_id,strapi_user_document_id,strapi_account_document_id,operation_kind,
          requested_identity_status,operation_state,attempt_count
        ) VALUES ($1,$2,$3,'suspend','suspended',$4,$5)`, [
          operationId,`person-${operationId}`,`account-${operationId}`,from,from === "running" ? 1 : 0,
        ]);
        const nextAttempt = (from === "requested" && to === "running") || (from === "failed" && to === "requested") ? 1 : (from === "running" ? 1 : 0);
        const update = pool.query("UPDATE music_identity_lifecycle_operations SET operation_state=$2,attempt_count=$3 WHERE operation_id=$1", [operationId,to,nextAttempt]);
        if (allowed.has(`${from}:${to}`)) await expect(update).resolves.toMatchObject({ rowCount: 1 });
        else await expect(update).rejects.toThrow(/invalid lifecycle operation transition/i);
      }
    }
    await resources.closePool(pool);
  });

  it("serializes concurrent public snapshot revision increments without losing a commit", async () => {
    // Break caught: read-then-write revision updates collapse two committed
    // public changes into one revision or use a non-integer counter.
    const pool = await freshDatabase("public_revision_concurrency");
    await migrateMusicDatabase(pool);
    const inserted = await pool.query<{ id: number }>(`INSERT INTO users
      (username,password,guest_url,venue_name,strapi_user_document_id,strapi_account_document_id,
       guest_capability_hash,lifecycle_operation_id)
      VALUES ('revision-owner','disabled','revision-slug','Revision Venue','revision-person',
        'revision-account',$1,'revision-operation') RETURNING id`, ["e".repeat(64)]);
    const id = inserted.rows[0].id;
    const secondPool = resources.trackPool(new pg.Pool({
      connectionString: (pool as unknown as { options: { connectionString: string } }).options.connectionString,
      max: 2,
    }));
    const increment = (database: pg.Pool) => database.query<{ public_snapshot_revision: string }>(
      `UPDATE users SET public_snapshot_revision=public_snapshot_revision+1
       WHERE id=$1 RETURNING public_snapshot_revision`,
      [id],
    );
    const revisions = (await Promise.all([increment(pool), increment(secondPool)]))
      .map(({ rows }) => Number(rows[0].public_snapshot_revision)).sort((left, right) => left - right);
    expect(revisions).toEqual([1, 2]);
    expect((await pool.query(
      "SELECT public_snapshot_revision FROM users WHERE id=$1",
      [id],
    )).rows[0].public_snapshot_revision).toBe("2");
    await resources.closePool(secondPool);
    await resources.closePool(pool);
  });

  it("serializes concurrent migrators and rolls a deliberately failing migration back atomically", async () => {
    const pool = await freshDatabase("concurrency");
    const secondPool = resources.trackPool(new pg.Pool({
      connectionString: (pool as unknown as { options: { connectionString: string } }).options.connectionString,
      max: 2,
    }));
    const [left, right] = await Promise.all([migrateMusicDatabase(pool), migrateMusicDatabase(secondPool)]);
    expect([...left.appliedIds, ...right.appliedIds].sort()).toEqual([...EXPECTED_MUSIC_MIGRATION_CHAIN].sort());
    const failureId = nextSyntheticMusicMigrationId(EXPECTED_MUSIC_MIGRATION_CHAIN, "deliberate_failure");
    const failure = createMigrationDefinition(failureId, "CREATE TABLE must_rollback(id integer); SELECT missing_function();");
    await expect(migrateMusicDatabase(pool, {
      migrations: [...loadMusicMigrations(), failure],
      testOnlyExpectedIds: [...EXPECTED_MUSIC_MIGRATION_CHAIN, failureId],
    })).rejects.toThrow();
    expect((await pool.query("SELECT to_regclass('public.must_rollback') AS value")).rows[0].value).toBeNull();
    expect((await pool.query("SELECT count(*)::int AS count FROM music_schema_migrations WHERE id=$1", [failureId])).rows[0].count).toBe(0);
    await resources.closePool(secondPool);
    await resources.closePool(pool);
  });

  it("rejects an appended production chain before any fresh or migrated database write", async () => {
    const appended = createMigrationDefinition(
      nextSyntheticMusicMigrationId(EXPECTED_MUSIC_MIGRATION_CHAIN, "unapproved"),
      "CREATE TABLE forbidden_chain_write(id integer);\n",
    );
    const chain = [...loadMusicMigrations(), appended];
    const fresh = await freshDatabase("appended_fresh");
    await expect(migrateMusicDatabase(fresh, { migrations: chain })).rejects.toThrow(/exact production migration chain/i);
    expect((await fresh.query("SELECT to_regclass('public.music_schema_migrations') AS journal, to_regclass('public.forbidden_chain_write') AS ddl")).rows[0])
      .toEqual({ journal: null, ddl: null });
    await resources.closePool(fresh);

    const migrated = await freshDatabase("appended_migrated");
    await migrateMusicDatabase(migrated);
    const before = await migrated.query("SELECT id,checksum,schema_checksum,applied_at FROM music_schema_migrations ORDER BY id");
    await expect(migrateMusicDatabase(migrated, { migrations: chain })).rejects.toThrow(/exact production migration chain/i);
    expect((await migrated.query("SELECT id,checksum,schema_checksum,applied_at FROM music_schema_migrations ORDER BY id")).rows).toEqual(before.rows);
    expect((await migrated.query("SELECT to_regclass('public.forbidden_chain_write') AS ddl")).rows[0].ddl).toBeNull();
    await resources.closePool(migrated);
  });

  it("fails closed on checksum changes, catalog drift, missing/future migrations, and unversioned application tables", async () => {
    const pool = await freshDatabase("tamper");
    await migrateMusicDatabase(pool);
    const chain = loadMusicMigrations();
    await expect(migrateMusicDatabase(pool, { migrations: [
      createMigrationDefinition(chain[0].id, `${chain[0].sql}\n-- tampered`),
      ...chain.slice(1),
    ] })).rejects.toThrow("checksum");
    await pool.query("ALTER TABLE users ADD COLUMN unreviewed_drift text");
    await expect(verifyMusicDatabase(pool)).rejects.toThrow("drift");
    await resources.closePool(pool);

    const existing = await freshDatabase("unversioned");
    await existing.query("CREATE TABLE users(id integer primary key, username text, email text)");
    await existing.query("INSERT INTO users VALUES (1,'legacy-name','legacy@example.test')");
    await expect(migrateMusicDatabase(existing)).rejects.toThrow("unversioned application tables");
    expect((await existing.query("SELECT to_regclass('public.music_schema_migrations') AS value")).rows[0].value).toBeNull();
    await resources.closePool(existing);

    const future = await freshDatabase("future");
    await migrateMusicDatabase(future);
    await future.query("INSERT INTO music_schema_migrations(id,checksum,schema_checksum) VALUES ('9999_future',$1,$1)", ["f".repeat(64)]);
    await expect(migrateMusicDatabase(future)).rejects.toThrow("unknown future migration");
    await expect(migrateMusicDatabase(future, { migrations: loadMusicMigrations().slice(1) })).rejects.toThrow("missing migration");
    await resources.closePool(future);
  });

  it("fingerprints trigger function bodies and complete sequence metadata", async () => {
    const functionPool = await freshDatabase("function_drift");
    await migrateMusicDatabase(functionPool);
    await functionPool.query(`CREATE OR REPLACE FUNCTION enforce_music_identity_immutability() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$`);
    await expect(verifyMusicDatabase(functionPool)).rejects.toThrow("drift");
    expect(await checkMusicDatabaseReadiness(functionPool)).toMatchObject({ ready: false, reason: "migration-state-invalid" });
    await resources.closePool(functionPool);

    const sequencePool = await freshDatabase("sequence_drift");
    await migrateMusicDatabase(sequencePool);
    await sequencePool.query("ALTER SEQUENCE users_id_seq INCREMENT BY 2");
    await expect(verifyMusicDatabase(sequencePool)).rejects.toThrow("drift");
    expect(await checkMusicDatabaseReadiness(sequencePool)).toMatchObject({ ready: false, reason: "migration-state-invalid" });
    await resources.closePool(sequencePool);
  });

  it("keeps readiness closed before migration and opens only for the exact journal/checksum state", async () => {
    const pool = await freshDatabase("readiness");
    expect(await checkMusicDatabaseReadiness(pool)).toMatchObject({ ready: false });
    await migrateMusicDatabase(pool);
    expect(await checkMusicDatabaseReadiness(pool)).toMatchObject({ ready: true, currentId: EXPECTED_MUSIC_MIGRATION_ID });
    await pool.query("UPDATE music_schema_migrations SET checksum=$1 WHERE id=$2", ["0".repeat(64), EXPECTED_MUSIC_MIGRATION_ID]);
    expect(await checkMusicDatabaseReadiness(pool)).toMatchObject({ ready: false, reason: "migration-state-invalid" });
    await resources.closePool(pool);
  });

  it("smokes every runtime family plus the real fixture/readiness routes on the migrated database", async () => {
    const pool = await freshDatabase("families");
    await migrateMusicDatabase(pool);
    const families = new Set<string>();
    for (const table of manifest.tables) {
      await pool.query(`SELECT count(*) FROM ${table.name}`);
      families.add(table.family);
    }
    expect(families).toEqual(new Set(["security-audit", "analytics", "pii", "user-content", "identity", "identity-credential", "profile", "media"]));

    const app = express();
    setupMusicFixtureProbeRoute(app, {
      mode: "fixture",
      databaseQuery: (sql) => pool.query(sql) as never,
      migrationReadiness: () => checkMusicDatabaseReadiness(pool),
      strapiUrl: "http://fixture",
      strapiReadToken: "fixture-read-only-token",
      fetchImpl: (async (url: string | URL) => new Response(JSON.stringify(String(url).endsWith("/health")
        ? { status: "ready" }
        : { documentId: "person-1", accounts: [{ documentId: "account-1" }] }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch,
    });
    const image: ImageCandidate = { digest: `sha256:${"a".repeat(64)}`, commit: "a".repeat(40), migrationMarker: EXPECTED_MUSIC_MIGRATION_ID };
    const key = "migration-attestation-test-key-long-enough";
    setupMusicHealthRoutes(app, {
      pool,
      env: {
        MUSIC_IMAGE_DIGEST: image.digest,
        MUSIC_IMAGE_COMMIT: image.commit,
        MUSIC_MIGRATION_MARKER: image.migrationMarker,
        MUSIC_GATE_ATTESTATION_KEY: key,
        MUSIC_GATE_ATTESTATION_JSON: JSON.stringify(createGateAttestation(image, key, (await verifyMusicDatabase(pool)).currentChecksum)),
        SESSION_SECRET: "s".repeat(32), COOKIE_SECRET: "c".repeat(32), STRAPI_ACCESS_TOKEN: "t".repeat(32), STRAPI_JWT_SECRET: "j".repeat(32),
        STRAPI_URL: "https://cms.example.test", MUSIC_NEW_ENTRY_KILL_SWITCH: "true", MUSIC_COHORT_ENABLED: "false",
      },
    });
    await request(app).get("/api/music-fixture/readiness").expect(200);
    await request(app).get("/health/ready").expect(200);
    await resources.closePool(pool);
  });
});
