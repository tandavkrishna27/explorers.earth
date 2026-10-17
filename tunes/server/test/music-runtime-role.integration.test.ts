import pg from "pg";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync as nodeMkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateMusicDatabase } from "../db/migrate";
import { MusicIdentityRepository } from "../repositories/musicIdentityRepository";
import { startMusicServer } from "../config/music-startup";
import { EXPECTED_MUSIC_MIGRATION_CHAIN } from "../../shared/music-migration-contract";
import { CURRENT_MIGRATION_MARKER } from "../deployment/music-deployment";

const ownerTarget = process.env.DATABASE_URL_TEST ?? "postgresql://music_migrator:music@127.0.0.1:55432/music_fixture";
const enabled = process.env.MUSIC_C5_POSTGRES_TEST === "1";
const describePg = enabled ? describe.sequential : describe.skip;
const databaseName = `music_runtime_role_${process.pid}`;
const runtimeUser = `music_runtime_test_${process.pid}`;
const escalationRole = `music_runtime_escalation_${process.pid}`;
const bridgeRole = `music_runtime_bridge_${process.pid}`;
const reverseBridgeRole = `music_runtime_reverse_bridge_${process.pid}`;
const rogueLoginRole = `music_runtime_rogue_${process.pid}`;
const incomingBridgeRole = `music_runtime_incoming_bridge_${process.pid}`;
const incomingRogueRole = `music_runtime_incoming_rogue_${process.pid}`;
const gateOwnerRole = `music_gate_owner_${process.pid}`;
const unexpectedOwnerRole = `music_unexpected_owner_${process.pid}`;
const runtimeCapabilityRole = ["music", "runtime"].join("_");
const gateOwnerPassword = Buffer.alloc(32, 0x6f).toString("base64url");
const runtimePassword = Buffer.alloc(32, 0x6d).toString("base64url");
const incomingRoguePassword = Buffer.alloc(32, 0x72).toString("base64url");
const windowsEffectiveUserSid = process.platform === "win32"
  ? execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", windowsHide: true })
    .match(/,"([^"]+)"\s*$/)?.[1]
  : undefined;

function mkdtempSync(prefix: string): string {
  const directory = nodeMkdtempSync(prefix);
  if (process.platform === "win32") {
    if (!windowsEffectiveUserSid) throw new Error("Windows test runner SID is unavailable");
    execFileSync("icacls.exe", [directory, "/inheritance:r", "/grant:r",
      `*${windowsEffectiveUserSid}:(OI)(CI)(F)`, "*S-1-5-18:(OI)(CI)(F)", "*S-1-5-32-544:(OI)(CI)(F)"],
    { windowsHide: true });
  }
  return directory;
}

const runtimeSecretRoot = mkdtempSync(join(tmpdir(), "music-runtime-role-secret-"));
const runtimePasswordPath = join(runtimeSecretRoot, "database-runtime");
const signingPath = join(runtimeSecretRoot, "music-token");
const lifecycleProofPath = join(runtimeSecretRoot, "strapi-lifecycle-proof-token");
const publicationResponsePath = join(runtimeSecretRoot, "publication-response");
const publicIdHmacPath = join(runtimeSecretRoot, "public-id-hmac");
const gateOwnerPasswordPath = join(runtimeSecretRoot, "database-migrator");
writeFileSync(runtimePasswordPath, runtimePassword, { mode: 0o600 });
writeFileSync(signingPath, Buffer.alloc(32, 0x6e).toString("base64url"), { mode: 0o600 });
writeFileSync(lifecycleProofPath, Buffer.alloc(32, 0x70).toString("base64url"), { mode: 0o600 });
writeFileSync(publicationResponsePath, Buffer.alloc(32, 0x71).toString("base64url"), { mode: 0o600 });
writeFileSync(publicIdHmacPath, Buffer.alloc(32, 0x73).toString("base64url"), { mode: 0o600 });
writeFileSync(gateOwnerPasswordPath, gateOwnerPassword, { mode: 0o600 });
chmodSync(runtimePasswordPath, 0o600);
chmodSync(signingPath, 0o600);
chmodSync(lifecycleProofPath, 0o600);
chmodSync(publicationResponsePath, 0o600);
chmodSync(publicIdHmacPath, 0o600);
chmodSync(gateOwnerPasswordPath, 0o600);
let clusterAdmin: pg.Pool;
let owner: pg.Pool;
let runtime: pg.Pool;

async function loadAuthority(): Promise<Record<string, unknown>> {
  try {
    return await import("../db/music-runtime-role" as string) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function startupEnvironment(): Record<string, string> {
  const repositoryRoot = resolve(import.meta.dirname, "../../..");
  const databaseAuthority = new URL(ownerTarget);
  const values = Object.fromEntries(readFileSync(join(repositoryRoot, ".env.music.test.example"), "utf8")
    .split(/\r?\n/).filter((line) => line && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
  delete values.MUSIC_PUBLIC_ID_HMAC_KEY;
  return {
    ...values,
    MUSIC_MODE: "live",
    STRAPI_URL: "https://cms.example.invalid",
    MUSIC_STRAPI_ALLOWED_ORIGINS: "https://cms.example.invalid",
    TRUST_PROXY_HOPS: "1",
    MUSIC_TRUSTED_PROXY_IP: "127.0.0.1",
    MUSIC_DATABASE_HOST: databaseAuthority.hostname,
    MUSIC_DATABASE_PORT: databaseAuthority.port,
    MUSIC_DATABASE_NAME: databaseName,
    MUSIC_DATABASE_USER: runtimeUser,
    MUSIC_DATABASE_MIGRATOR_USER: "music_migrator",
    MUSIC_DATABASE_PASSWORD_FILE: runtimePasswordPath,
    MUSIC_TOKEN_CURRENT_SECRET_FILE: signingPath,
    STRAPI_LIFECYCLE_PROOF_TOKEN_FILE: lifecycleProofPath,
    MUSIC_PUBLICATION_RESPONSE_CURRENT_KID: "runtime-test-publication",
    MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY: "",
    MUSIC_PUBLICATION_RESPONSE_CURRENT_KEY_FILE: publicationResponsePath,
    MUSIC_PUBLIC_ID_HMAC_KEY_FILE: publicIdHmacPath,
  };
}

describePg("C5 least-privilege Music runtime database authority", () => {
  beforeAll(async () => {
    clusterAdmin = new pg.Pool({ connectionString: ownerTarget });
    await clusterAdmin.query(`CREATE DATABASE ${databaseName}`);
    const target = new URL(ownerTarget);
    target.pathname = `/${databaseName}`;
    owner = new pg.Pool({ connectionString: target.toString(), max: 4 });
    await migrateMusicDatabase(owner);
  });

  afterAll(async () => {
    try {
      await runtime?.end();
      await owner?.end();
      await clusterAdmin?.query(`REVOKE ${escalationRole} FROM ${runtimeCapabilityRole}`).catch(() => undefined);
      await clusterAdmin?.query(`REVOKE ${bridgeRole} FROM ${runtimeCapabilityRole}`).catch(() => undefined);
      await clusterAdmin?.query(`REVOKE ${runtimeCapabilityRole} FROM ${reverseBridgeRole}`).catch(() => undefined);
      await clusterAdmin?.query(`REVOKE ${reverseBridgeRole} FROM ${rogueLoginRole}`).catch(() => undefined);
      await clusterAdmin?.query(`REVOKE ${runtimeUser} FROM ${incomingBridgeRole}`).catch(() => undefined);
      await clusterAdmin?.query(`REVOKE ${incomingBridgeRole} FROM ${incomingRogueRole}`).catch(() => undefined);
      await clusterAdmin?.query(`REVOKE ${runtimeUser} FROM ${incomingRogueRole}`).catch(() => undefined);
      await clusterAdmin?.query(`REVOKE ${escalationRole} FROM ${bridgeRole}`).catch(() => undefined);
      await clusterAdmin?.query(`REVOKE ${escalationRole} FROM ${runtimeUser}`).catch(() => undefined);
      await clusterAdmin?.query(`REVOKE ${runtimeCapabilityRole} FROM ${rogueLoginRole}`).catch(() => undefined);
      await clusterAdmin?.query(`REVOKE ${bridgeRole} FROM ${rogueLoginRole}`).catch(() => undefined);
      await clusterAdmin?.query(`REVOKE ${runtimeCapabilityRole} FROM ${bridgeRole}`).catch(() => undefined);
      await clusterAdmin?.query(`REVOKE ADMIN OPTION FOR ${runtimeCapabilityRole} FROM ${runtimeUser}`).catch(() => undefined);
      await clusterAdmin?.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [databaseName]);
      await clusterAdmin?.query(`DROP DATABASE IF EXISTS ${databaseName}`);
      await clusterAdmin?.query(`DROP ROLE IF EXISTS ${runtimeUser}`);
      await clusterAdmin?.query(`DROP ROLE IF EXISTS ${bridgeRole}`);
      await clusterAdmin?.query(`DROP ROLE IF EXISTS ${reverseBridgeRole}`);
      await clusterAdmin?.query(`DROP ROLE IF EXISTS ${incomingBridgeRole}`);
      await clusterAdmin?.query(`DROP ROLE IF EXISTS ${incomingRogueRole}`);
      await clusterAdmin?.query(`DROP ROLE IF EXISTS ${escalationRole}`);
      await clusterAdmin?.query(`DROP ROLE IF EXISTS ${rogueLoginRole}`);
      await clusterAdmin?.query(`DROP ROLE IF EXISTS ${gateOwnerRole}`);
      await clusterAdmin?.query(`DROP ROLE IF EXISTS ${unexpectedOwnerRole}`);
      await clusterAdmin?.end();
    } finally {
      rmSync(runtimeSecretRoot, { recursive: true, force: true });
    }
  });

  it("provisions a distinct restricted login and refuses every owner/migration/history bypass", async () => {
    const authority = await loadAuthority() as {
      assertMusicMigratorAuthority?: (pool: pg.Pool, input: { runtimeLoginRole: string }) => Promise<void>;
      provisionMusicRuntimeLogin?: (pool: pg.Pool, input: { loginRole: string; password: string }) => Promise<void>;
      verifyMusicRuntimeLogin?: (ownerPool: pg.Pool, runtimePool: pg.Pool, input: { loginRole: string }) => Promise<void>;
    };
    expect(authority.assertMusicMigratorAuthority).toBeTypeOf("function");
    expect(authority.provisionMusicRuntimeLogin).toBeTypeOf("function");
    expect(authority.verifyMusicRuntimeLogin).toBeTypeOf("function");
    if (!authority.assertMusicMigratorAuthority || !authority.provisionMusicRuntimeLogin || !authority.verifyMusicRuntimeLogin) return;

    await authority.assertMusicMigratorAuthority(owner, { runtimeLoginRole: runtimeUser });
    await authority.provisionMusicRuntimeLogin(owner, { loginRole: runtimeUser, password: runtimePassword });
    const target = new URL(ownerTarget);
    target.pathname = `/${databaseName}`;
    target.username = runtimeUser;
    target.password = runtimePassword;
    runtime = new pg.Pool({ connectionString: target.toString(), max: 8 });
    await authority.verifyMusicRuntimeLogin(owner, runtime, { loginRole: runtimeUser });

    expect((await runtime.query(
      "SELECT has_database_privilege(current_user,current_database(),'TEMP') AS can_create_temporary_objects",
    )).rows[0].can_create_temporary_objects).toBe(false);
    await expect(runtime.query("CREATE TEMP TABLE music_runtime_temp_probe(id integer)"))
      .rejects.toThrow();

    const attributes = (await runtime.query(`SELECT current_user, rolsuper, rolcreaterole, rolcreatedb,
      rolreplication, rolbypassrls FROM pg_roles WHERE rolname=current_user`)).rows[0];
    expect(attributes).toEqual({
      current_user: runtimeUser,
      rolsuper: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolreplication: false,
      rolbypassrls: false,
    });
    expect((await runtime.query("SELECT pg_has_role(current_user,'music_runtime','member') AS member")).rows[0].member).toBe(true);
    expect((await owner.query(`SELECT tableowner=current_user AS owner_is_migrator
      FROM pg_tables WHERE schemaname='public' AND tablename='users'`)).rows[0].owner_is_migrator).toBe(true);
    expect((await owner.query(`SELECT tgenabled FROM pg_trigger
      WHERE tgname='music_credential_revocation_history_immutability'`)).rows[0].tgenabled).toBe("A");
    expect((await owner.query(`SELECT tgenabled FROM pg_trigger
      WHERE tgname='music_publication_operation_immutability'`)).rows[0].tgenabled).toBe("A");

    const repository = new MusicIdentityRepository(runtime);
    const identity = await repository.ensureIdentity({
      userDocumentId: "runtime-role-user",
      accountDocumentId: "runtime-role-account",
      username: "runtime-role-user",
      email: "runtime-role@example.invalid",
      provider: "local",
      accountName: "Runtime Role Venue",
      accountType: "Venue",
      accountMobile: "+15555550100",
      internalUsername: "runtime-role-user-internal",
      password: "disabled-runtime-role",
      guestUrl: "guest-runtime-role",
      guestCapabilityHash: createHash("sha256").update("runtime-role").digest("hex"),
      operationId: "provision-runtime-role",
      requestId: "request-runtime-role",
    });
    await expect(repository.revokeAllCredentials({
      operationId: "10000000-0000-4000-8000-000000000099",
      musicUserId: identity.id,
      expectedSessionVersion: 1,
      reason: "logout_all",
    })).resolves.toMatchObject({ resultSessionVersion: 2 });
    await expect(runtime.query(
      `UPDATE users SET public_snapshot_revision=public_snapshot_revision+1
       WHERE id=$1 RETURNING public_snapshot_revision`,
      [identity.id],
    )).resolves.toMatchObject({ rows: [{ public_snapshot_revision: "1" }] });
    expect((await owner.query(`SELECT privilege_type FROM information_schema.column_privileges
      WHERE grantee='music_runtime' AND table_schema='public' AND table_name='users'
        AND column_name='public_snapshot_revision' AND privilege_type='UPDATE'`)).rowCount).toBeGreaterThan(0);
    expect((await runtime.query("SELECT count(*)::int AS count FROM music_schema_migrations")).rows[0].count)
      .toBe(EXPECTED_MUSIC_MIGRATION_CHAIN.length);

    for (const statement of [
      "SET session_replication_role='replica'",
      "UPDATE music_credential_revocation_operations SET reason='credential_compromise'",
      "DELETE FROM music_credential_revocation_operations",
      "DELETE FROM music_publication_operations",
      "SELECT * FROM music_publication_operation_archive LIMIT 0",
      "INSERT INTO music_publication_operation_archive(music_user_id,idempotency_key_hash,request_fingerprint,request_mode,completed_at,expires_at) VALUES (1,repeat('0',64),repeat('0',64),'public',clock_timestamp()-interval '24 hours',clock_timestamp())",
      "UPDATE music_publication_operation_archive SET request_mode=request_mode WHERE false",
      "DELETE FROM music_publication_operation_archive WHERE false",
      "DELETE FROM music_identity_tombstones",
      "UPDATE canonical_music_numeric_retirements SET retired_at=clock_timestamp()",
      "DELETE FROM canonical_music_numeric_retirements",
      "TRUNCATE canonical_music_numeric_retirements",
      "DELETE FROM music_reactivation_tokens",
      "CREATE TABLE music_identity_tombstones_recreated(id integer)",
      "UPDATE music_schema_migrations SET checksum=repeat('0',64)",
      "DELETE FROM music_schema_migrations",
      "INSERT INTO music_schema_migrations(id,checksum,schema_checksum) VALUES ('9999_forged',repeat('0',64),repeat('0',64))",
      "ALTER TABLE music_credential_revocation_operations DISABLE TRIGGER music_credential_revocation_history_immutability",
      "DROP TRIGGER music_credential_revocation_history_immutability ON music_credential_revocation_operations",
      "CREATE OR REPLACE FUNCTION reject_music_credential_revocation_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN OLD; END $$",
    ]) await expect(runtime.query(statement), statement).rejects.toThrow();

    const futureGrantTable = ["runtime", "future", "grant", "probe"].join("_");
    await owner.query(`CREATE TABLE ${futureGrantTable}(id serial PRIMARY KEY, value text NOT NULL)`);
    await expect(runtime.query(`INSERT INTO ${futureGrantTable}(value) VALUES ('works') RETURNING id`))
      .resolves.toMatchObject({ rows: [{ id: 1 }] });
    await owner.query(`DROP TABLE ${futureGrantTable}`);

    await owner.query(`ALTER SCHEMA public OWNER TO ${runtimeUser}`);
    await expect(authority.verifyMusicRuntimeLogin(owner, runtime, { loginRole: runtimeUser }))
      .rejects.toThrow(/privilege|unsafe/i);
    await owner.query("ALTER SCHEMA public OWNER TO pg_database_owner");
    await owner.query(`ALTER DATABASE ${databaseName} OWNER TO ${runtimeUser}`);
    await expect(authority.verifyMusicRuntimeLogin(owner, runtime, { loginRole: runtimeUser }))
      .rejects.toThrow(/privilege|unsafe/i);
    await owner.query(`ALTER DATABASE ${databaseName} OWNER TO music_migrator`);
  });

  it.each([
    {
      name: "direct login SELECT on one column even when table SELECT is already permitted",
      grant: `GRANT SELECT (username) ON TABLE users TO ${runtimeUser}`,
      revoke: `REVOKE SELECT (username) ON TABLE users FROM ${runtimeUser}`,
    },
    {
      name: "capability UPDATE grant option on one column",
      grant: `GRANT UPDATE (username) ON TABLE users TO ${runtimeCapabilityRole} WITH GRANT OPTION`,
      revoke: `REVOKE UPDATE (username) ON TABLE users FROM ${runtimeCapabilityRole}`,
    },
    {
      name: "capability UPDATE on owner idempotency operations",
      grant: `GRANT UPDATE ON TABLE music_owner_operations TO ${runtimeCapabilityRole}`,
      revoke: `REVOKE UPDATE ON TABLE music_owner_operations FROM ${runtimeCapabilityRole}`,
    },
    {
      name: "PUBLIC SELECT on one column",
      grant: "GRANT SELECT (username) ON TABLE users TO PUBLIC",
      revoke: "REVOKE SELECT (username) ON TABLE users FROM PUBLIC",
    },
    {
      name: "direct TRUNCATE",
      grant: `GRANT TRUNCATE ON TABLE users TO ${runtimeUser}`,
      revoke: `REVOKE TRUNCATE ON TABLE users FROM ${runtimeUser}`,
    },
    {
      name: "direct DELETE even when the capability role already permits it",
      grant: `GRANT DELETE ON TABLE users TO ${runtimeUser}`,
      revoke: `REVOKE DELETE ON TABLE users FROM ${runtimeUser}`,
    },
    {
      name: "direct REFERENCES",
      grant: `GRANT REFERENCES ON TABLE users TO ${runtimeUser}`,
      revoke: `REVOKE REFERENCES ON TABLE users FROM ${runtimeUser}`,
    },
    {
      name: "direct TRIGGER",
      grant: `GRANT TRIGGER ON TABLE users TO ${runtimeUser}`,
      revoke: `REVOKE TRIGGER ON TABLE users FROM ${runtimeUser}`,
    },
    {
      name: "direct function EXECUTE",
      grant: `GRANT EXECUTE ON FUNCTION provision_music_runtime_login(name,text) TO ${runtimeUser}`,
      revoke: `REVOKE EXECUTE ON FUNCTION provision_music_runtime_login(name,text) FROM ${runtimeUser}`,
    },
    {
      name: "direct database TEMP",
      grant: `GRANT TEMPORARY ON DATABASE ${databaseName} TO ${runtimeUser}`,
      revoke: `REVOKE TEMPORARY ON DATABASE ${databaseName} FROM ${runtimeUser}`,
    },
  ])("rejects $name privilege drift across the complete runtime inventory", async ({ grant, revoke }) => {
    const authority = await loadAuthority() as {
      verifyMusicRuntimeLogin?: (ownerPool: pg.Pool, runtimePool: pg.Pool, input: { loginRole: string }) => Promise<void>;
    };
    expect(authority.verifyMusicRuntimeLogin).toBeTypeOf("function");
    if (!authority.verifyMusicRuntimeLogin) return;
    await owner.query(grant);
    try {
      await expect(authority.verifyMusicRuntimeLogin(owner, runtime, { loginRole: runtimeUser }))
        .rejects.toThrow(/privilege|authority|attestation|unsafe/i);
    } finally {
      await owner.query(revoke);
    }
  });

  it.each([
    {
      name: "application table",
      takeOwnership: `ALTER TABLE users OWNER TO ${runtimeCapabilityRole}`,
      restoreOwnership: "ALTER TABLE users OWNER TO music_migrator",
    },
    {
      name: "enforcement function",
      takeOwnership: `ALTER FUNCTION enforce_music_identity_immutability() OWNER TO ${runtimeCapabilityRole}`,
      restoreOwnership: "ALTER FUNCTION enforce_music_identity_immutability() OWNER TO music_migrator",
    },
  ])("rejects capability ownership of an expected $name", async ({ takeOwnership, restoreOwnership }) => {
    // Production break caught: the login can SET ROLE music_runtime, so any
    // application object owned by that capability is runtime-mutable authority.
    const authority = await loadAuthority() as {
      verifyMusicRuntimeLogin?: (ownerPool: pg.Pool, runtimePool: pg.Pool, input: { loginRole: string }) => Promise<void>;
    };
    expect(authority.verifyMusicRuntimeLogin).toBeTypeOf("function");
    if (!authority.verifyMusicRuntimeLogin) return;
    await owner.query(takeOwnership);
    try {
      await expect(authority.verifyMusicRuntimeLogin(owner, runtime, { loginRole: runtimeUser }))
        .rejects.toThrow(/owner|privilege|authority|attestation|unsafe/i);
    } finally {
      await owner.query(restoreOwnership);
    }
  });

  it("rejects an unexpected owner even when runtime effective privileges are unchanged", async () => {
    const authority = await loadAuthority() as {
      provisionMusicRuntimeLogin?: (ownerPool: pg.Pool, input: { loginRole: string; password: string }) => Promise<void>;
      verifyMusicRuntimeLogin?: (ownerPool: pg.Pool, runtimePool: pg.Pool, input: { loginRole: string }) => Promise<void>;
    };
    expect(authority.provisionMusicRuntimeLogin).toBeTypeOf("function");
    expect(authority.verifyMusicRuntimeLogin).toBeTypeOf("function");
    if (!authority.provisionMusicRuntimeLogin || !authority.verifyMusicRuntimeLogin) return;
    await owner.query(`CREATE ROLE ${unexpectedOwnerRole} NOLOGIN`);
    try {
      await owner.query(`ALTER TABLE users OWNER TO ${unexpectedOwnerRole}`);
      await authority.provisionMusicRuntimeLogin(owner, { loginRole: runtimeUser, password: runtimePassword });
      await expect(authority.verifyMusicRuntimeLogin(owner, runtime, { loginRole: runtimeUser }))
        .rejects.toThrow(/owner|privilege|authority|attestation|unsafe/i);
    } finally {
      await owner.query("ALTER TABLE users OWNER TO music_migrator");
      await owner.query(`DROP ROLE ${unexpectedOwnerRole}`);
    }
  });

  it("rejects a capability grant on an object outside the checked-in runtime inventory", async () => {
    const authority = await loadAuthority() as {
      provisionMusicRuntimeLogin?: (ownerPool: pg.Pool, input: { loginRole: string; password: string }) => Promise<void>;
      verifyMusicRuntimeLogin?: (ownerPool: pg.Pool, runtimePool: pg.Pool, input: { loginRole: string }) => Promise<void>;
    };
    expect(authority.provisionMusicRuntimeLogin).toBeTypeOf("function");
    expect(authority.verifyMusicRuntimeLogin).toBeTypeOf("function");
    if (!authority.provisionMusicRuntimeLogin || !authority.verifyMusicRuntimeLogin) return;
    await owner.query("CREATE TABLE music_runtime_unexpected_authority(id integer)");
    await authority.provisionMusicRuntimeLogin(owner, { loginRole: runtimeUser, password: runtimePassword });
    try {
      await expect(authority.verifyMusicRuntimeLogin(owner, runtime, { loginRole: runtimeUser }))
        .rejects.toThrow(/inventory|privilege|authority|attestation|unsafe/i);
    } finally {
      await owner.query("DROP TABLE music_runtime_unexpected_authority");
    }
  });

  it("rejects every direct and transitive authority inherited through the fixed capability role", async () => {
    // Production break caught: login direct membership is clean while
    // music_runtime itself inherits a CREATEDB/admin-equivalent role.
    const authority = await loadAuthority() as {
      verifyMusicRuntimeLogin?: (ownerPool: pg.Pool, runtimePool: pg.Pool, input: { loginRole: string }) => Promise<void>;
      assertMusicRuntimeCapabilityPreflight?: (ownerPool: pg.Pool, input: { runtimeLoginRole: string }) => Promise<void>;
    };
    expect(authority.assertMusicRuntimeCapabilityPreflight).toBeTypeOf("function");
    expect(authority.verifyMusicRuntimeLogin).toBeTypeOf("function");
    if (!authority.assertMusicRuntimeCapabilityPreflight || !authority.verifyMusicRuntimeLogin) return;
    await owner.query(`CREATE ROLE ${escalationRole} NOLOGIN CREATEDB`);
    await owner.query(`CREATE ROLE ${bridgeRole} NOLOGIN`);

    await owner.query(`GRANT ${escalationRole} TO ${runtimeCapabilityRole}`);
    await expect(authority.assertMusicRuntimeCapabilityPreflight(owner, { runtimeLoginRole: runtimeUser })).rejects.toThrow(/capability|membership|authority/i);
    await expect(authority.verifyMusicRuntimeLogin(owner, runtime, { loginRole: runtimeUser }))
      .rejects.toThrow(/capability|membership|authority/i);
    await owner.query(`REVOKE ${escalationRole} FROM ${runtimeCapabilityRole}`);

    await owner.query(`GRANT ${escalationRole} TO ${bridgeRole}`);
    await owner.query(`GRANT ${bridgeRole} TO ${runtimeCapabilityRole}`);
    await expect(authority.verifyMusicRuntimeLogin(owner, runtime, { loginRole: runtimeUser }))
      .rejects.toThrow(/capability|membership|authority/i);
    await owner.query(`REVOKE ${bridgeRole} FROM ${runtimeCapabilityRole}`);
    await owner.query(`REVOKE ${escalationRole} FROM ${bridgeRole}`);

    await owner.query(`GRANT ${escalationRole} TO ${runtimeUser}`);
    await expect(authority.verifyMusicRuntimeLogin(owner, runtime, { loginRole: runtimeUser }))
      .rejects.toThrow(/capability|membership|authority/i);
    await owner.query(`REVOKE ${escalationRole} FROM ${runtimeUser}`);
    await expect(authority.verifyMusicRuntimeLogin(owner, runtime, { loginRole: runtimeUser })).resolves.toBeUndefined();
  });

  it.each([
    {
      name: "an unexpected login granted the runtime capability",
      setup: async () => {
        await owner.query(`CREATE ROLE ${rogueLoginRole} LOGIN`);
        await owner.query(`GRANT ${runtimeCapabilityRole} TO ${rogueLoginRole}`);
      },
      cleanup: async () => {
        await owner.query(`REVOKE ${runtimeCapabilityRole} FROM ${rogueLoginRole}`);
        await owner.query(`DROP ROLE ${rogueLoginRole}`);
      },
    },
    {
      name: "the configured login holding ADMIN OPTION",
      setup: async () => owner.query(`GRANT ${runtimeCapabilityRole} TO ${runtimeUser} WITH ADMIN OPTION`),
      cleanup: async () => owner.query(`REVOKE ADMIN OPTION FOR ${runtimeCapabilityRole} FROM ${runtimeUser}`),
    },
    {
      name: "an indirect rogue login behind an unauthorized reverse member",
      setup: async () => {
        await owner.query(`CREATE ROLE ${rogueLoginRole} LOGIN`);
        await owner.query(`CREATE ROLE ${reverseBridgeRole} NOLOGIN`);
        await owner.query(`GRANT ${runtimeCapabilityRole} TO ${reverseBridgeRole}`);
        await owner.query(`GRANT ${reverseBridgeRole} TO ${rogueLoginRole}`);
      },
      cleanup: async () => {
        await owner.query(`REVOKE ${reverseBridgeRole} FROM ${rogueLoginRole}`);
        await owner.query(`REVOKE ${runtimeCapabilityRole} FROM ${reverseBridgeRole}`);
        await owner.query(`DROP ROLE ${reverseBridgeRole}`);
        await owner.query(`DROP ROLE ${rogueLoginRole}`);
      },
    },
  ])("rejects $name and reaccepts the exact membership graph after cleanup", async ({ setup, cleanup }) => {
    const authority = await loadAuthority() as {
      provisionMusicRuntimeLogin?: (ownerPool: pg.Pool, input: { loginRole: string; password: string }) => Promise<void>;
      verifyMusicRuntimeLogin?: (ownerPool: pg.Pool, runtimePool: pg.Pool, input: { loginRole: string }) => Promise<void>;
    };
    expect(authority.provisionMusicRuntimeLogin).toBeTypeOf("function");
    expect(authority.verifyMusicRuntimeLogin).toBeTypeOf("function");
    if (!authority.provisionMusicRuntimeLogin || !authority.verifyMusicRuntimeLogin) return;
    if (!runtime) {
      await authority.provisionMusicRuntimeLogin(owner, { loginRole: runtimeUser, password: runtimePassword });
      const target = new URL(ownerTarget);
      target.pathname = `/${databaseName}`;
      target.username = runtimeUser;
      target.password = runtimePassword;
      runtime = new pg.Pool({ connectionString: target.toString(), max: 8 });
    }
    await setup();
    try {
      await expect(authority.verifyMusicRuntimeLogin(owner, runtime, { loginRole: runtimeUser }))
        .rejects.toThrow(/capability|membership|authority|unsafe/i);
      await expect(authority.provisionMusicRuntimeLogin(owner, { loginRole: runtimeUser, password: runtimePassword }))
        .rejects.toThrow(/capability|membership|authority|unsafe/i);
    } finally {
      await cleanup();
    }
    await expect(authority.verifyMusicRuntimeLogin(owner, runtime, { loginRole: runtimeUser })).resolves.toBeUndefined();
  });

  it.each([
    { name: "a direct incoming login", nested: false, adminOption: false },
    { name: "a direct incoming login with ADMIN OPTION", nested: false, adminOption: true },
    { name: "a nested incoming login relay", nested: true, adminOption: false },
    { name: "a nested incoming login relay with ADMIN OPTION", nested: true, adminOption: true },
  ])("rejects $name granted the configured runtime login and reaccepts only after cleanup and reprovision", async ({ nested, adminOption }) => {
    const authority = await loadAuthority() as {
      assertMusicRuntimeCapabilityPreflight?: (ownerPool: pg.Pool, input: { runtimeLoginRole: string }) => Promise<void>;
      provisionMusicRuntimeLogin?: (ownerPool: pg.Pool, input: { loginRole: string; password: string }) => Promise<void>;
      verifyMusicRuntimeLogin?: (ownerPool: pg.Pool, runtimePool: pg.Pool, input: { loginRole: string }) => Promise<void>;
    };
    expect(authority.assertMusicRuntimeCapabilityPreflight).toBeTypeOf("function");
    expect(authority.provisionMusicRuntimeLogin).toBeTypeOf("function");
    expect(authority.verifyMusicRuntimeLogin).toBeTypeOf("function");
    if (!authority.assertMusicRuntimeCapabilityPreflight || !authority.provisionMusicRuntimeLogin || !authority.verifyMusicRuntimeLogin) return;
    if (!runtime) {
      await authority.provisionMusicRuntimeLogin(owner, { loginRole: runtimeUser, password: runtimePassword });
      const target = new URL(ownerTarget);
      target.pathname = `/${databaseName}`;
      target.username = runtimeUser;
      target.password = runtimePassword;
      runtime = new pg.Pool({ connectionString: target.toString(), max: 8 });
    }

    await owner.query(`CREATE ROLE ${incomingRogueRole} LOGIN PASSWORD '${incomingRoguePassword}'`);
    if (nested) {
      await owner.query(`CREATE ROLE ${incomingBridgeRole} NOLOGIN`);
      await owner.query(`GRANT ${runtimeUser} TO ${incomingBridgeRole}${adminOption ? " WITH ADMIN OPTION" : ""}`);
      await owner.query(`GRANT ${incomingBridgeRole} TO ${incomingRogueRole}`);
    } else {
      await owner.query(`GRANT ${runtimeUser} TO ${incomingRogueRole}${adminOption ? " WITH ADMIN OPTION" : ""}`);
    }
    const rogueTarget = new URL(ownerTarget);
    rogueTarget.pathname = `/${databaseName}`;
    rogueTarget.username = incomingRogueRole;
    rogueTarget.password = incomingRoguePassword;
    const rogue = new pg.Pool({ connectionString: rogueTarget.toString(), max: 1 });
    try {
      expect((await rogue.query("SELECT pg_has_role(current_user,$1,'USAGE') AS inherited", [runtimeUser])).rows[0]?.inherited).toBe(true);
      await rogue.query(`SET ROLE ${runtimeUser}`);
      expect((await rogue.query("SELECT current_user")).rows[0]?.current_user).toBe(runtimeUser);
      await rogue.query("RESET ROLE");
      const outcome = async (operation: () => Promise<void>) => {
        try {
          await operation();
          return "resolved";
        } catch (error) {
          expect(String((error as Error).message)).toMatch(/capability|login|membership|authority|unsafe/i);
          return "rejected";
        }
      };
      expect([
        await outcome(() => authority.assertMusicRuntimeCapabilityPreflight!(owner, { runtimeLoginRole: runtimeUser })),
        await outcome(() => authority.verifyMusicRuntimeLogin!(owner, runtime, { loginRole: runtimeUser })),
        await outcome(() => authority.provisionMusicRuntimeLogin!(owner, { loginRole: runtimeUser, password: runtimePassword })),
      ]).toEqual(["rejected", "rejected", "rejected"]);
    } finally {
      await rogue.end();
      if (nested) {
        await owner.query(`REVOKE ${incomingBridgeRole} FROM ${incomingRogueRole}`);
        await owner.query(`REVOKE ${runtimeUser} FROM ${incomingBridgeRole}`);
        await owner.query(`DROP ROLE ${incomingBridgeRole}`);
      } else {
        await owner.query(`REVOKE ${runtimeUser} FROM ${incomingRogueRole}`);
      }
      await owner.query(`DROP ROLE ${incomingRogueRole}`);
    }
    await expect(authority.provisionMusicRuntimeLogin(owner, { loginRole: runtimeUser, password: runtimePassword }))
      .resolves.toBeUndefined();
    await expect(authority.verifyMusicRuntimeLogin(owner, runtime, { loginRole: runtimeUser })).resolves.toBeUndefined();
  });

  it("detects a newly granted transitive role between its two complete-graph snapshots", async () => {
    // Production break caught: a role membership added after the first query
    // can survive until promotion because attestation never rechecks closure.
    const authority = await loadAuthority() as {
      verifyMusicRuntimeLogin?: (ownerPool: pg.Pool, runtimePool: pg.Pool, input: { loginRole: string }) => Promise<void>;
    };
    expect(authority.verifyMusicRuntimeLogin).toBeTypeOf("function");
    if (!authority.verifyMusicRuntimeLogin) return;
    await owner.query(`CREATE ROLE ${escalationRole} NOLOGIN CREATEDB`).catch(() => undefined);
    let graphReads = 0;
    let injected = false;
    const racingOwner = {
      query: async (...args: Parameters<pg.Pool["query"]>) => {
        const result = await (owner.query as (...queryArgs: Parameters<pg.Pool["query"]>) => ReturnType<pg.Pool["query"]>)(...args);
        if (String(args[0]).includes("WITH RECURSIVE music_role_closure")) {
          graphReads += 1;
          if (graphReads === 1) {
            await owner.query(`GRANT ${escalationRole} TO ${runtimeCapabilityRole}`);
            injected = true;
          }
        }
        return result;
      },
    };
    await expect(authority.verifyMusicRuntimeLogin(racingOwner as never, runtime, { loginRole: runtimeUser }))
      .rejects.toThrow(/capability|membership|changed|authority/i);
    expect(injected).toBe(true);
    await owner.query(`REVOKE ${escalationRole} FROM ${runtimeCapabilityRole}`).catch(() => undefined);
  });

  it("rejects an unsafe transitive role before startup imports routes or binds a listener", async () => {
    // Production break caught: the gate checks closure but startup repeats
    // only direct login membership and then imports the application.
    await owner.query(`CREATE ROLE ${escalationRole} NOLOGIN CREATEDB`).catch(() => undefined);
    await owner.query(`GRANT ${escalationRole} TO ${runtimeCapabilityRole}`);
    let imported = false;
    await expect(startMusicServer(startupEnvironment(), {
      resolveAddresses: async () => ["8.8.8.8"],
      loadRuntime: async () => {
        imported = true;
        throw new Error("route import must not occur");
      },
    })).rejects.toThrow(/database authentication|role attestation|membership|authority/i);
    expect(imported).toBe(false);
    await owner.query(`REVOKE ${escalationRole} FROM ${runtimeCapabilityRole}`);
  });

  it("runs the exact gate preflight before migration and writes no attestation for a hostile capability graph", async () => {
    // Production break caught: the helper is correct but the process gate
    // migrates and writes promotion authority without invoking it.
    await owner.query(`CREATE ROLE ${gateOwnerRole} LOGIN SUPERUSER PASSWORD '${gateOwnerPassword}'`);
    await owner.query(`CREATE ROLE ${escalationRole} NOLOGIN CREATEDB`).catch(() => undefined);
    await owner.query(`GRANT ${escalationRole} TO ${runtimeCapabilityRole}`);
    const attestation = join(runtimeSecretRoot, "hostile-gate-attestation.json");
    const journalBefore = (await owner.query("SELECT id,checksum,schema_checksum FROM music_schema_migrations ORDER BY id")).rows;
    const tunesRoot = resolve(import.meta.dirname, "../..");
    const tsxCli = join(tunesRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const databaseAuthority = new URL(ownerTarget);
    let failure: { status?: number; stdout?: string; stderr?: string } | undefined;
    try {
      execFileSync(process.execPath, [tsxCli, "server/deployment/run-migration-gate.ts"], {
        cwd: tunesRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          MUSIC_MODE: "fixture",
          MUSIC_DATABASE_HOST: databaseAuthority.hostname,
          MUSIC_DATABASE_PORT: databaseAuthority.port,
          MUSIC_DATABASE_NAME: databaseName,
          MUSIC_DATABASE_USER: gateOwnerRole,
          MUSIC_DATABASE_PASSWORD_FILE: gateOwnerPasswordPath,
          MUSIC_RUNTIME_DATABASE_USER: runtimeUser,
          MUSIC_RUNTIME_DATABASE_PASSWORD_FILE: runtimePasswordPath,
          MUSIC_IMAGE_DIGEST: `sha256:${"a".repeat(64)}`,
          MUSIC_IMAGE_COMMIT: "a".repeat(40),
          MUSIC_MIGRATION_MARKER: CURRENT_MIGRATION_MARKER,
          MUSIC_GATE_ATTESTATION_KEY: "hostile-gate-key-at-least-32-characters",
          MUSIC_GATE_ATTESTATION_PATH: attestation,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      failure = error as typeof failure;
    }
    expect(failure?.status).toBe(1);
    expect(existsSync(attestation)).toBe(false);
    expect((await owner.query("SELECT id,checksum,schema_checksum FROM music_schema_migrations ORDER BY id")).rows)
      .toEqual(journalBefore);
    const output = `${failure?.stdout ?? ""}${failure?.stderr ?? ""}`;
    expect(output).toContain("runtime capability role has unsafe attributes or membership");
    for (const forbidden of [gateOwnerPassword, runtimePassword, gateOwnerRole, runtimeUser]) {
      expect(output).not.toContain(forbidden);
    }
    await owner.query(`REVOKE ${escalationRole} FROM ${runtimeCapabilityRole}`);
    await owner.query(`DROP ROLE ${gateOwnerRole}`);
  });

  it("fails closed on a malformed or cyclic role-graph result", async () => {
    // Production break caught: graph rows are accepted without proving one
    // acyclic login -> music_runtime edge and zero capability edges.
    const authority = await loadAuthority() as {
      validateMusicRuntimeRoleGraph?: (input: unknown) => void;
    };
    expect(authority.validateMusicRuntimeRoleGraph).toBeTypeOf("function");
    if (!authority.validateMusicRuntimeRoleGraph) return;
    expect(() => authority.validateMusicRuntimeRoleGraph!({
      loginRole: runtimeUser,
      loginAttributes: { canLogin: true, inherit: true, superuser: false, createRole: false, createDb: false, replication: false, bypassRls: false },
      capabilityAttributes: { canLogin: false, inherit: true, superuser: false, createRole: false, createDb: false, replication: false, bypassRls: false },
      loginClosure: ["music_runtime", bridgeRole, "music_runtime"],
      capabilityClosure: [bridgeRole, "music_runtime"],
      cycleDetected: true,
    })).toThrow(/cycle|membership|authority/i);
  });
});
