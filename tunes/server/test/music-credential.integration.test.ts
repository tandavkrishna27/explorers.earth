import pg from "pg";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateMusicDatabase } from "../db/migrate";
import { MusicPrincipalService } from "../middleware/musicPrincipal";
import { MusicIdentityRepository, type EnsureMusicIdentityInput } from "../repositories/musicIdentityRepository";
import { MusicTokenService } from "../services/musicTokenService";

const exactTarget = process.env.DATABASE_URL_TEST ?? "postgresql://music_migrator:music@127.0.0.1:55432/music_fixture";
const enabled = process.env.MUSIC_C5_POSTGRES_TEST === "1";
const describePg = enabled ? describe.sequential : describe.skip;
const databaseName = `music_c5_credentials_${process.pid}`;
let admin: pg.Pool;
let pool: pg.Pool;
let repository: MusicIdentityRepository;

function revocationOperation(suffix: number): string {
  return `10000000-0000-4000-8000-${suffix.toString(16).padStart(12, "0")}`;
}

function input(suffix: string): EnsureMusicIdentityInput {
  return {
    userDocumentId: `user-${suffix}`,
    accountDocumentId: `account-${suffix}`,
    username: `astronaut-${suffix}`,
    email: `${suffix}@example.invalid`,
    provider: "local",
    accountName: `Room ${suffix}`,
    accountType: "Venue",
    accountMobile: "+15555550100",
    internalUsername: `explorer-${suffix}`,
    password: `disabled-${suffix}`,
    guestUrl: `guest-${suffix}`,
    guestCapabilityHash: createHash("sha256").update(suffix).digest("hex"),
    operationId: `provision-${suffix}`,
    requestId: `request-${suffix}`,
  };
}

describePg("C5 Music credentials on real PostgreSQL 15", () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: exactTarget });
    expect((await admin.query("SHOW server_version")).rows[0].server_version).toMatch(/^15\./);
    await admin.query(`CREATE DATABASE ${databaseName}`);
    const target = new URL(exactTarget);
    target.pathname = `/${databaseName}`;
    pool = new pg.Pool({ connectionString: target.toString(), max: 24 });
    await migrateMusicDatabase(pool);
    repository = new MusicIdentityRepository(pool);
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [databaseName]);
    await admin?.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin?.end();
  });

  it("re-resolves subject, both tombstone dimensions, status, and session truth on every request", async () => {
    const identity = await repository.ensureIdentity(input("truth"));
    const now = 1_800_000_000_000;
    const tokens = new MusicTokenService({
      current: { kid: "integration", secret: Buffer.alloc(32, 0x67).toString("base64url") },
      tokenLifetimeSeconds: 600,
      clockSkewSeconds: 10,
    }, { now: () => now });
    const principals = new MusicPrincipalService(tokens, repository);
    const token = tokens.mint(identity).token;
    await expect(principals.resolve(token)).resolves.toMatchObject({ musicUserId: identity.id, subject: "user-truth" });

    await repository.revokeAllCredentials({
      operationId: revocationOperation(1), musicUserId: identity.id, expectedSessionVersion: 1, reason: "logout_all",
    });
    await expect(principals.resolve(token)).rejects.toMatchObject({ code: "TOKEN_REVOKED" });

    const suspended = await repository.ensureIdentity(input("suspended"));
    const suspendedToken = tokens.mint(suspended).token;
    await repository.transitionIdentity({ strapiUserDocumentId: "user-suspended", operationId: "suspend-c5", kind: "suspend", targetStatus: "suspended" });
    await expect(principals.resolve(suspendedToken)).rejects.toMatchObject({ code: "IDENTITY_SUSPENDED" });

    const pending = await repository.ensureIdentity(input("pending"));
    const pendingToken = tokens.mint(pending).token;
    await repository.transitionIdentity({ strapiUserDocumentId: "user-pending", operationId: "delete-c5", kind: "request_deletion", targetStatus: "pending_deletion" });
    await expect(principals.resolve(pendingToken)).rejects.toMatchObject({ code: "IDENTITY_PENDING_DELETION" });

    const accountTombstone = await repository.ensureIdentity(input("account-tombstone"));
    const accountToken = tokens.mint(accountTombstone).token;
    await pool.query("BEGIN");
    await pool.query("SET LOCAL session_replication_role='replica'");
    await pool.query(`INSERT INTO music_identity_lifecycle_operations
      (operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,operation_kind,
       requested_identity_status,operation_state,attempt_count,result_session_version,operation_phase)
      VALUES ('other-delete','other-deleted-user','account-account-tombstone',$1,'tombstone',
        'pending_deletion','completed',1,$2,'single')`, [accountTombstone.id, accountTombstone.sessionVersion]);
    await pool.query(`INSERT INTO music_identity_tombstones
      (strapi_user_document_id,strapi_account_document_id,reason,lifecycle_operation_id,music_user_id)
      VALUES ('other-deleted-user','account-account-tombstone','security','other-delete',$1)`, [accountTombstone.id]);
    await pool.query("COMMIT");
    await expect(principals.resolve(accountToken)).rejects.toMatchObject({ code: "TOKEN_REVOKED" });
    await pool.query("BEGIN");
    await pool.query("SET LOCAL session_replication_role='replica'");
    await pool.query("DELETE FROM music_identity_tombstones WHERE lifecycle_operation_id='other-delete'");
    await pool.query("DELETE FROM music_identity_lifecycle_operations WHERE operation_id='other-delete'");
    await pool.query("COMMIT");

    await pool.query("DELETE FROM users WHERE id=$1", [identity.id]).catch(() => undefined);
    await expect(principals.resolve(token)).rejects.toMatchObject({ code: "TOKEN_REVOKED" });
  });

  it.each([
    ["logout_all", 10],
    ["entitlement_security_revocation", 11],
    ["credential_compromise", 12],
  ] as const)(
    "atomically and idempotently revokes concurrent %s calls",
    async (reason, operationSuffix) => {
      const identity = await repository.ensureIdentity(input(`revoke-${reason}`));
      const operationId = revocationOperation(operationSuffix);
      const results = await Promise.all(Array.from({ length: 20 }, () => repository.revokeAllCredentials({
        operationId, musicUserId: identity.id, expectedSessionVersion: identity.sessionVersion, reason,
      })));
      expect(new Set(results.map(({ resultSessionVersion }) => resultSessionVersion))).toEqual(new Set([2]));
      expect((await pool.query("SELECT session_version FROM users WHERE id=$1", [identity.id])).rows[0].session_version).toBe(2);
      expect((await pool.query(`SELECT operation_id,music_user_id,strapi_user_document_id,strapi_account_document_id,
        reason,expected_session_version,result_session_version,operation_state
        FROM music_credential_revocation_operations WHERE music_user_id=$1`, [identity.id])).rows).toEqual([{
        operation_id: operationId,
        music_user_id: identity.id,
        strapi_user_document_id: `user-revoke-${reason}`,
        strapi_account_document_id: `account-revoke-${reason}`,
        reason,
        expected_session_version: 1,
        result_session_version: 2,
        operation_state: "completed",
      }]);
    },
  );

  it("rejects stale, ahead, mismatched operation, and changed-reason replay without mutation", async () => {
    const identity = await repository.ensureIdentity(input("stale"));
    await expect(repository.revokeAllCredentials({
      operationId: revocationOperation(20), musicUserId: identity.id, expectedSessionVersion: 3, reason: "credential_compromise",
    })).rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
    const first = await repository.revokeAllCredentials({
      operationId: revocationOperation(21), musicUserId: identity.id, expectedSessionVersion: 1, reason: "logout_all",
    });
    expect(first.resultSessionVersion).toBe(2);
    await expect(repository.revokeAllCredentials({
      operationId: revocationOperation(21), musicUserId: identity.id, expectedSessionVersion: 1, reason: "credential_compromise",
    })).rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
    await expect(repository.revokeAllCredentials({
      operationId: revocationOperation(22), musicUserId: identity.id, expectedSessionVersion: 1, reason: "logout_all",
    })).rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
    await expect(repository.revokeAllCredentials({
      operationId: revocationOperation(23), musicUserId: identity.id, expectedSessionVersion: 4, reason: "logout_all",
    })).rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
    expect((await pool.query("SELECT session_version FROM users WHERE id=$1", [identity.id])).rows[0].session_version).toBe(2);
    expect((await pool.query("SELECT count(*)::integer AS count FROM music_credential_revocation_operations WHERE music_user_id=$1", [identity.id])).rows[0].count).toBe(1);
  });

  it("allows only one distinct concurrent operation for the same resource version", async () => {
    const identity = await repository.ensureIdentity(input("distinct"));
    const settled = await Promise.allSettled([
      repository.revokeAllCredentials({
        operationId: revocationOperation(30), musicUserId: identity.id, expectedSessionVersion: 1, reason: "logout_all",
      }),
      repository.revokeAllCredentials({
        operationId: revocationOperation(31), musicUserId: identity.id, expectedSessionVersion: 1, reason: "credential_compromise",
      }),
    ]);
    expect(settled.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(settled.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect((settled.find(({ status }) => status === "rejected") as PromiseRejectedResult).reason)
      .toMatchObject({ code: "IDENTITY_CONFLICT" });
    expect((await pool.query("SELECT session_version FROM users WHERE id=$1", [identity.id])).rows[0].session_version).toBe(2);
    expect((await pool.query("SELECT count(*)::integer AS count FROM music_credential_revocation_operations WHERE music_user_id=$1", [identity.id])).rows[0].count).toBe(1);
  });

  it("makes revocation history update/delete immutable while exact replay stays valid", async () => {
    const identity = await repository.ensureIdentity(input("immutable-history"));
    const operationId = revocationOperation(32);
    await repository.revokeAllCredentials({
      operationId, musicUserId: identity.id, expectedSessionVersion: 1, reason: "logout_all",
    });
    for (const statement of [
      "UPDATE music_credential_revocation_operations SET operation_id='10000000-0000-4000-8000-000000000099' WHERE operation_id=$1",
      "UPDATE music_credential_revocation_operations SET music_user_id=99999 WHERE operation_id=$1",
      "UPDATE music_credential_revocation_operations SET strapi_user_document_id='forged-subject' WHERE operation_id=$1",
      "UPDATE music_credential_revocation_operations SET strapi_account_document_id='forged-account' WHERE operation_id=$1",
      "UPDATE music_credential_revocation_operations SET reason='credential_compromise' WHERE operation_id=$1",
      "UPDATE music_credential_revocation_operations SET expected_session_version=2 WHERE operation_id=$1",
      "UPDATE music_credential_revocation_operations SET result_session_version=3 WHERE operation_id=$1",
      "UPDATE music_credential_revocation_operations SET operation_state='completed' WHERE operation_id=$1",
      "UPDATE music_credential_revocation_operations SET completed_at=completed_at + interval '1 second' WHERE operation_id=$1",
      "DELETE FROM music_credential_revocation_operations WHERE operation_id=$1",
    ]) {
      await pool.query("BEGIN");
      await expect(pool.query(statement, [operationId])).rejects.toThrow(/immutable|revocation history/i);
      await pool.query("ROLLBACK");
    }
    await expect(repository.revokeAllCredentials({
      operationId, musicUserId: identity.id, expectedSessionVersion: 1, reason: "logout_all",
    })).resolves.toMatchObject({ resultSessionVersion: 2 });
    expect((await pool.query(`SELECT reason,result_session_version FROM music_credential_revocation_operations
      WHERE operation_id=$1`, [operationId])).rows).toEqual([{ reason: "logout_all", result_session_version: 2 }]);
  });

  it("converts a concurrent cross-resource UUID collision to one typed conflict", async () => {
    const left = await repository.ensureIdentity(input("uuid-left"));
    const right = await repository.ensureIdentity(input("uuid-right"));
    const operationId = revocationOperation(33);
    const settled = await Promise.allSettled([
      repository.revokeAllCredentials({
        operationId, musicUserId: left.id, expectedSessionVersion: 1, reason: "logout_all",
      }),
      repository.revokeAllCredentials({
        operationId, musicUserId: right.id, expectedSessionVersion: 1, reason: "credential_compromise",
      }),
    ]);
    expect(settled.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(settled.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect((settled.find(({ status }) => status === "rejected") as PromiseRejectedResult).reason)
      .toMatchObject({ code: "IDENTITY_CONFLICT" });
    expect((await pool.query("SELECT count(*)::integer AS count FROM music_credential_revocation_operations WHERE operation_id=$1", [operationId])).rows[0].count).toBe(1);
    const versions = (await pool.query("SELECT id,session_version FROM users WHERE id=ANY($1::integer[]) ORDER BY id", [[left.id, right.id]])).rows;
    expect(versions.map(({ session_version }) => session_version).sort()).toEqual([1, 2]);
  });

  it("does not reinterpret an unrelated lifecycle increment as a revocation replay", async () => {
    const identity = await repository.ensureIdentity(input("lifecycle-version"));
    await repository.transitionIdentity({
      strapiUserDocumentId: "user-lifecycle-version",
      operationId: "suspend-before-revocation",
      kind: "suspend",
      targetStatus: "suspended",
    });
    await expect(repository.revokeAllCredentials({
      operationId: revocationOperation(35), musicUserId: identity.id, expectedSessionVersion: 1, reason: "logout_all",
    })).rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
    expect((await pool.query("SELECT session_version FROM users WHERE id=$1", [identity.id])).rows[0].session_version).toBe(2);
    expect((await pool.query("SELECT count(*)::integer AS count FROM music_credential_revocation_operations WHERE music_user_id=$1", [identity.id])).rows[0].count).toBe(0);
  });

  it("rolls back the durable operation and session change together on a history write failure", async () => {
    const identity = await repository.ensureIdentity(input("rollback"));
    await pool.query(`CREATE FUNCTION music_test_reject_revocation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'revocation history rejected'; END $$`);
    await pool.query(`CREATE TRIGGER music_test_reject_revocation
      BEFORE INSERT ON music_credential_revocation_operations
      FOR EACH ROW EXECUTE FUNCTION music_test_reject_revocation()`);
    await expect(repository.revokeAllCredentials({
      operationId: revocationOperation(40), musicUserId: identity.id, expectedSessionVersion: 1, reason: "logout_all",
    })).rejects.toThrow("revocation history rejected");
    await pool.query("DROP TRIGGER music_test_reject_revocation ON music_credential_revocation_operations");
    await pool.query("DROP FUNCTION music_test_reject_revocation()");
    expect((await pool.query("SELECT session_version FROM users WHERE id=$1", [identity.id])).rows[0].session_version).toBe(1);
    expect((await pool.query("SELECT count(*)::integer AS count FROM music_credential_revocation_operations WHERE music_user_id=$1", [identity.id])).rows[0].count).toBe(0);
  });
});
