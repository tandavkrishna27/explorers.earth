import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateMusicDatabase } from "../db/migrate";
import {
  MusicIdentityRepository,
  type EnsureMusicIdentityInput,
} from "../repositories/musicIdentityRepository";

const exactTarget = process.env.DATABASE_URL_TEST ?? "postgresql://music_migrator:music@127.0.0.1:55432/music_fixture";
const enabled = process.env.MUSIC_C4_POSTGRES_TEST === "1";
const describePg = enabled ? describe.sequential : describe.skip;
let admin: pg.Pool;
let pool: pg.Pool;
const databaseName = `music_c4_projection_${process.pid}`;

function input(overrides: Partial<EnsureMusicIdentityInput> = {}): EnsureMusicIdentityInput {
  return {
    userDocumentId: "user-doc-1",
    accountDocumentId: "account-doc-1",
    username: "astronaut",
    email: "astronaut@example.invalid",
    provider: "local",
    accountName: "Moon Room",
    accountType: "Venue",
    accountMobile: "+15555550100",
    internalUsername: "explorer-stable-1",
    password: "disabled-native-password-1",
    guestUrl: "guest-stable-1",
    guestCapabilityHash: "a".repeat(64),
    operationId: "provision-operation-1",
    requestId: "request-1",
    ...overrides,
  };
}

describePg("C4 atomic Music identity projection on PostgreSQL 15", () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: exactTarget });
    expect((await admin.query("SHOW server_version")).rows[0].server_version).toMatch(/^15\./);
    await admin.query(`CREATE DATABASE ${databaseName}`);
    const target = new URL(exactTarget);
    target.pathname = `/${databaseName}`;
    pool = new pg.Pool({ connectionString: target.toString(), max: 24 });
    await migrateMusicDatabase(pool);
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin?.end();
  });

  it("creates once, converges mutable snapshots, and preserves immutable state/content/settings", async () => {
    const repository = new MusicIdentityRepository(pool);
    const first = await repository.ensureIdentity(input());
    await pool.query(`UPDATE users SET venue_name='Owner Venue',allow_song_requests=false,
      allow_guest_play_on_device=false,allow_playlist_sharing=true,allow_recently_played_visibility=false,
      theme='{"primary":"#112233"}'::jsonb,session_version=7 WHERE id=$1`, [first.id]);
    await pool.query("INSERT INTO playlists(user_id,name) VALUES ($1,'Keep me')", [first.id]);
    const before = (await pool.query("SELECT row_to_json(users) AS value FROM users WHERE id=$1", [first.id])).rows[0].value;

    const repeated = await repository.ensureIdentity(input({
      username: "renamed",
      email: "renamed@example.invalid",
      provider: "google",
      accountName: "Renamed Room",
      accountType: "Studio",
      accountMobile: "+15555550199",
      operationId: "ignored-repeat-operation",
      guestUrl: "must-not-replace",
      guestCapabilityHash: "b".repeat(64),
    }));
    expect(repeated).toEqual({ ...first, sessionVersion: 7 });
    const row = (await pool.query(`SELECT username,email,venue_name,strapi_username_snapshot,strapi_email_snapshot,
      strapi_provider_snapshot,strapi_account_name_snapshot,strapi_account_type_snapshot,strapi_account_mobile_snapshot,
      strapi_user_document_id,strapi_account_document_id,guest_capability_hash,lifecycle_operation_id,
      allow_song_requests,session_version FROM users WHERE id=$1`, [first.id])).rows[0];
    expect(row).toMatchObject({
      username: "explorer-stable-1",
      email: null,
      venue_name: "Owner Venue",
      strapi_username_snapshot: "renamed",
      strapi_email_snapshot: "renamed@example.invalid",
      strapi_provider_snapshot: "google",
      strapi_account_name_snapshot: "Renamed Room",
      strapi_account_type_snapshot: "Studio",
      strapi_account_mobile_snapshot: "+15555550199",
      strapi_user_document_id: "user-doc-1",
      strapi_account_document_id: "account-doc-1",
      guest_capability_hash: before.guest_capability_hash,
      lifecycle_operation_id: before.lifecycle_operation_id,
      allow_song_requests: false,
      session_version: 7,
    });
    const after = (await pool.query("SELECT row_to_json(users) AS value FROM users WHERE id=$1", [first.id])).rows[0].value;
    const mutableSnapshots = ["strapi_username_snapshot", "strapi_email_snapshot", "strapi_provider_snapshot",
      "strapi_account_name_snapshot", "strapi_account_type_snapshot", "strapi_account_mobile_snapshot",
      "last_identity_sync_at", "updated_at"];
    for (const key of mutableSnapshots) {
      delete before[key];
      delete after[key];
    }
    expect(after).toEqual(before);
    expect(Number((await pool.query("SELECT count(*) FROM playlists WHERE user_id=$1", [first.id])).rows[0].count)).toBe(1);
  });

  it("collapses 20 concurrent first requests to one stable numeric identity", async () => {
    const repository = new MusicIdentityRepository(pool);
    const base = input({
      userDocumentId: "user-concurrent",
      accountDocumentId: "account-concurrent",
      internalUsername: "explorer-concurrent",
      guestUrl: "guest-concurrent",
      guestCapabilityHash: "c".repeat(64),
      operationId: "operation-concurrent",
    });
    const results = await Promise.all(Array.from({ length: 20 }, () => repository.ensureIdentity(base)));
    expect(new Set(results.map(({ id }) => id)).size).toBe(1);
    expect(Number((await pool.query("SELECT count(*) FROM users WHERE strapi_user_document_id='user-concurrent'")).rows[0].count)).toBe(1);
    const persisted = JSON.stringify((await pool.query("SELECT row_to_json(users) AS value FROM users WHERE strapi_user_document_id='user-concurrent'")).rows[0].value);
    expect(persisted).not.toContain("proof");
    expect(persisted).not.toContain("request-");
  });

  it("rejects two-user collisions and selected Account switches without partial rows", async () => {
    const repository = new MusicIdentityRepository(pool);
    const sameAccount = await Promise.allSettled([
      repository.ensureIdentity(input({
        userDocumentId: "collision-user-a", accountDocumentId: "collision-account",
        internalUsername: "collision-a", guestUrl: "collision-a", guestCapabilityHash: "d".repeat(64), operationId: "collision-a",
      })),
      repository.ensureIdentity(input({
        userDocumentId: "collision-user-b", accountDocumentId: "collision-account",
        internalUsername: "collision-b", guestUrl: "collision-b", guestCapabilityHash: "e".repeat(64), operationId: "collision-b",
      })),
    ]);
    expect(sameAccount.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(sameAccount.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect((sameAccount.find(({ status }) => status === "rejected") as PromiseRejectedResult).reason)
      .toMatchObject({ code: "IDENTITY_CONFLICT" });
    expect(Number((await pool.query("SELECT count(*) FROM users WHERE strapi_account_document_id='collision-account'")).rows[0].count)).toBe(1);

    await expect(repository.ensureIdentity(input({ accountDocumentId: "switched-account" })))
      .rejects.toMatchObject({ code: "ACCOUNT_SWITCH_CONFLICT" });
    expect((await pool.query("SELECT strapi_account_document_id FROM users WHERE strapi_user_document_id='user-doc-1'")).rows[0].strapi_account_document_id)
      .toBe("account-doc-1");
  });

  it("rejects user/Account tombstones and suspended/pending identities before mutation", async () => {
    const repository = new MusicIdentityRepository(pool);
    await pool.query(`INSERT INTO music_identity_tombstones(strapi_user_document_id,strapi_account_document_id,reason,lifecycle_operation_id)
      VALUES ('dead-user','dead-account','deleted','delete-dead')`);
    await expect(repository.ensureIdentity(input({
      userDocumentId: "dead-user", accountDocumentId: "fresh-account", internalUsername: "dead-user", guestUrl: "dead-user",
      guestCapabilityHash: "f".repeat(64), operationId: "dead-user-operation",
    }))).rejects.toMatchObject({ code: "IDENTITY_TOMBSTONED" });
    await expect(repository.ensureIdentity(input({
      userDocumentId: "fresh-user", accountDocumentId: "dead-account", internalUsername: "dead-account", guestUrl: "dead-account",
      guestCapabilityHash: "1".repeat(64), operationId: "dead-account-operation",
    }))).rejects.toMatchObject({ code: "IDENTITY_TOMBSTONED" });

    const suspended = await repository.ensureIdentity(input({
      userDocumentId: "suspended-user", accountDocumentId: "suspended-account", internalUsername: "suspended-user", guestUrl: "suspended-user",
      guestCapabilityHash: "2".repeat(64), operationId: "suspended-create",
    }));
    await repository.transitionIdentity({ strapiUserDocumentId: "suspended-user", operationId: "suspend-op", kind: "suspend", targetStatus: "suspended" });
    await expect(repository.ensureIdentity(input({ userDocumentId: "suspended-user", accountDocumentId: "suspended-account" })))
      .rejects.toMatchObject({ code: "IDENTITY_SUSPENDED" });
    expect((await pool.query("SELECT identity_status FROM users WHERE id=$1", [suspended.id])).rows[0].identity_status).toBe("suspended");

    await repository.transitionIdentity({ strapiUserDocumentId: "collision-user-a", operationId: "delete-pending-op", kind: "request_deletion", targetStatus: "pending_deletion" })
      .catch(async () => repository.transitionIdentity({ strapiUserDocumentId: "collision-user-b", operationId: "delete-pending-op", kind: "request_deletion", targetStatus: "pending_deletion" }));
    const pending = (await pool.query("SELECT strapi_user_document_id,strapi_account_document_id FROM users WHERE lifecycle_operation_id='delete-pending-op'")).rows[0];
    await expect(repository.ensureIdentity(input({ userDocumentId: pending.strapi_user_document_id, accountDocumentId: pending.strapi_account_document_id })))
      .rejects.toMatchObject({ code: "IDENTITY_PENDING_DELETION" });
  });

  it("rolls back an injected post-write failure with no projection or lifecycle residue", async () => {
    const repository = new MusicIdentityRepository(pool, { afterWrite: async () => { throw new Error("injected-safe-failure"); } });
    await expect(repository.ensureIdentity(input({
      userDocumentId: "rollback-user", accountDocumentId: "rollback-account", internalUsername: "rollback-user", guestUrl: "rollback-user",
      guestCapabilityHash: "3".repeat(64), operationId: "rollback-operation",
    }))).rejects.toThrow("injected-safe-failure");
    expect(Number((await pool.query("SELECT count(*) FROM users WHERE strapi_user_document_id='rollback-user'")).rows[0].count)).toBe(0);
    expect(Number((await pool.query("SELECT count(*) FROM music_identity_lifecycle_operations WHERE operation_id='rollback-operation'")).rows[0].count)).toBe(0);
  });
});
